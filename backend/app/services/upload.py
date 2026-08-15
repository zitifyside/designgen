"""첨부 파일 검증·텍스트 추출.

기능정의서 v0.2.0 §3.1 '파일 업로드' — 지원 형식·크기·개수 제한과
**MIME + 확장자 + 매직 넘버 3중 체크**를 그대로 구현한다.

저장 정책 (v1.0):
  파일 원본은 보관하지 않는다. 오브젝트 스토리지(S3) 연동 전이고 컨테이너
  파일시스템은 휘발이라, 원본을 들고 있어 봐야 다음 배포에 사라진다.
  대신 **AI 파이프라인이 실제로 쓰는 것**(추출 텍스트 + 메타)만 남긴다.
  이미지는 참조용 메타만 기록한다 — v1.0 파이프라인은 텍스트만 분석한다.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

from fastapi import HTTPException, status

# 형식별 상한 (기능정의서: 이미지 20MB · 문서 10MB, 1프로젝트 최대 5개)
MAX_IMAGE_BYTES = 20 * 1024 * 1024
MAX_DOC_BYTES = 10 * 1024 * 1024
MAX_FILES_PER_PROJECT = 5

# 확장자 → (분류, 허용 MIME, 매직 넘버 후보)
ALLOWED: dict[str, tuple[str, tuple[str, ...], tuple[bytes, ...]]] = {
    "png": ("image", ("image/png",), (b"\x89PNG\r\n\x1a\n",)),
    "jpg": ("image", ("image/jpeg",), (b"\xff\xd8\xff",)),
    "jpeg": ("image", ("image/jpeg",), (b"\xff\xd8\xff",)),
    "pdf": ("document", ("application/pdf",), (b"%PDF-",)),
    # 텍스트 계열은 매직 넘버가 없다 — 디코딩 성공 여부로 검증한다.
    "md": ("document", ("text/markdown", "text/plain", "application/octet-stream"), ()),
    "txt": ("document", ("text/plain", "application/octet-stream"), ()),
}

# 추출 텍스트 상한 — 요건 텍스트(10,000자)와 합쳐 프롬프트가 터지지 않게 한다.
MAX_EXTRACTED_CHARS = 20_000

_SAFE_NAME = re.compile(r"[^A-Za-z0-9가-힣._-]")


@dataclass
class UploadResult:
    filename: str
    kind: str  # image | document
    content_type: str
    size_bytes: int
    sha256: str
    extracted_text: str
    pages: int | None


def sanitize_filename(name: str) -> str:
    """경로 조작·제어문자를 제거한 안전한 표시용 파일명."""
    base = (name or "file").replace("\\", "/").split("/")[-1]
    base = _SAFE_NAME.sub("_", base).strip("._") or "file"
    return base[:120]


def _extension(name: str) -> str:
    return name.rsplit(".", 1)[-1].lower() if "." in name else ""


def validate_and_extract(
    *, filename: str, content_type: str | None, data: bytes
) -> UploadResult:
    """3중 검증 후 텍스트를 추출한다. 위반 시 400/413 을 던진다."""
    safe_name = sanitize_filename(filename)
    ext = _extension(safe_name)

    if ext not in ALLOWED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="지원하지 않는 형식입니다. png·jpg·pdf·md·txt 만 업로드할 수 있습니다.",
        )
    kind, allowed_mimes, magics = ALLOWED[ext]

    # 1) 크기
    limit = MAX_IMAGE_BYTES if kind == "image" else MAX_DOC_BYTES
    if len(data) > limit:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"파일이 너무 큽니다 (상한 {limit // (1024 * 1024)}MB).",
        )
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="빈 파일입니다."
        )

    # 2) MIME — 브라우저가 보낸 값이라 신뢰하지 않되, 명백한 불일치는 막는다.
    declared = (content_type or "").split(";")[0].strip().lower()
    if declared and declared not in allowed_mimes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"확장자(.{ext})와 파일 형식({declared})이 일치하지 않습니다.",
        )

    # 3) 매직 넘버 — 확장자만 바꾼 위장 파일을 여기서 잡는다.
    if magics and not any(data.startswith(m) for m in magics):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"파일 내용이 .{ext} 형식이 아닙니다.",
        )

    text, pages = _extract_text(ext, data)
    return UploadResult(
        filename=safe_name,
        kind=kind,
        content_type=declared or allowed_mimes[0],
        size_bytes=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
        extracted_text=text[:MAX_EXTRACTED_CHARS],
        pages=pages,
    )


def _extract_text(ext: str, data: bytes) -> tuple[str, int | None]:
    if ext in ("md", "txt"):
        try:
            return data.decode("utf-8"), None
        except UnicodeDecodeError:
            # UTF-8 이 아니면 텍스트 파일로 인정하지 않는다 (바이너리 위장 차단).
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="텍스트 파일은 UTF-8 인코딩만 지원합니다.",
            ) from None

    if ext == "pdf":
        return _extract_pdf(data)

    # 이미지: v1.0 파이프라인은 텍스트만 분석한다.
    return "", None


def _extract_pdf(data: bytes) -> tuple[str, int | None]:
    try:
        import io
        from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout

        from pypdf import PdfReader
    except ImportError:
        # pypdf 미설치 환경에서도 업로드 자체는 막지 않는다 — 텍스트만 비운다.
        return "", None

    def _parse() -> tuple[str, int | None]:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="암호가 걸린 PDF 는 분석할 수 없습니다.",
            )
        chunks: list[str] = []
        for page in reader.pages[:50]:
            chunks.append(page.extract_text() or "")
            if sum(len(c) for c in chunks) > MAX_EXTRACTED_CHARS:
                break
        return "\n".join(chunks), len(reader.pages)

    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(_parse).result(timeout=30)
    except HTTPException:
        raise
    except FuturesTimeout:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PDF 분석 시간이 초과되었습니다.",
        ) from None
    except Exception:  # noqa: BLE001 — 손상 PDF 는 텍스트 없이 통과시킨다
        return "", None


def merge_requirements(base: str, attachments: list[tuple[str, str]]) -> str:
    """요건 텍스트에 첨부 추출분을 덧붙인다 (AI 파이프라인 입력).

    사용자 입력은 USER_CONTEXT 블록으로 격리한다 (프롬프트 인젝션 방어).
    """
    from app.core.text import sanitize_user_context, wrap_user_context

    parts = [base.strip()] if base and base.strip() else []
    for name, text in attachments:
        cleaned = sanitize_user_context(text or "").strip()
        if not cleaned:
            continue
        parts.append(f"\n--- 첨부 자료: {name} ---\n{cleaned}")
    merged = "\n".join(parts)
    return wrap_user_context(merged) if merged.strip() else merged
