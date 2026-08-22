"""구독 CLI 로 이미지를 굽는다 — 릴레이(운영자 PC)에서만 도는 모듈.

운영 컨테이너에는 이 CLI 들이 없다. LLM 단계를 릴레이로 넘긴 것과 같은
이유로 이미지도 여기서 만든다. 차이는 하나뿐이다 — LLM 은 텍스트를
돌려주지만 이미지는 파일을 남기므로, 만들어진 파일을 읽어 바이트로
돌려준다.

채널 순서는 운영 라우팅(gen-image)을 따른다: **Grok Imagine → Codex
image_gen**. Gemini 는 API 키 경로라 릴레이에 둘 이유가 없다(컨테이너에서
직접 부르면 된다). 한 채널이 실패하면 다음으로 넘어가고, 다 실패하면
None 을 돌려준다 — 사진 한 장이 빠져도 시안은 서 있어야 한다.

⚠ Windows 의 `grok`·`codex` 는 npm 셰임(.CMD)이라 이름만으로는
`CreateProcess` 가 찾지 못한다. 반드시 실제 경로를 해석해 넘긴다.
"""
from __future__ import annotations

import asyncio
import logging
import shutil
import tempfile
import uuid
from pathlib import Path

logger = logging.getLogger(__name__)

#: 이미지 안 글자는 시안의 HTML 이 그린다. 여기에 섞이면 두 겹으로 읽히고
#: 한글은 특히 뭉개진다.
PROMPT_SUFFIX = (
    " Photorealistic editorial lifestyle photography, soft natural light, "
    "shallow depth of field. Leave breathing room at the edges so the subject "
    "survives cropping. Absolutely NO text, NO letters, NO logos, NO watermarks, "
    "NO user-interface elements anywhere in the image."
)

ASPECT_HINT = {
    "21:9": "Ultra-wide 21:9 composition.",
    "16:9": "Wide 16:9 composition.",
    "4:3": "Standard 4:3 composition.",
    "1:1": "Square 1:1 composition.",
    "3:4": "Portrait 3:4 composition.",
    "9:16": "Tall 9:16 composition.",
}

#: 한 장에 이보다 오래 걸리면 포기하고 다음 채널로 넘어간다.
CHANNEL_TIMEOUT_SECONDS = 240

CREATE_NO_WINDOW = 0x08000000


def _resolve(name: str) -> str | None:
    """npm 셰임까지 포함해 실제 실행 파일 경로를 찾는다."""
    for candidate in (name, f"{name}.cmd", f"{name}.exe"):
        found = shutil.which(candidate)
        if found:
            return found
    return None


def available_channels() -> list[str]:
    return [name for name in ("grok", "codex") if _resolve(name)]


def build_prompt(prompt: str, aspect: str) -> str:
    hint = ASPECT_HINT.get(aspect, ASPECT_HINT["16:9"])
    return f"{prompt.strip()} {hint}{PROMPT_SUFFIX}"


async def _run(argv: list[str], *, cwd: Path, timeout: int) -> int:
    proc = await asyncio.create_subprocess_exec(
        *argv,
        stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=str(cwd),
        creationflags=CREATE_NO_WINDOW,
    )
    try:
        await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        try:
            await asyncio.wait_for(proc.communicate(), timeout=10)
        except (asyncio.TimeoutError, ProcessLookupError):
            pass
        raise
    return proc.returncode or 0


def _newest_png(work: Path, name: str) -> Path | None:
    """지정한 이름을 우선 찾고, 없으면 그 폴더에서 가장 최근 png 를 쓴다.

    CLI 가 늘 시키는 이름으로 저장하지는 않는다. 이름이 어긋났다고 멀쩡히
    만들어진 그림을 버리면 쿼터만 태우고 빈손이 된다.
    """
    target = work / name
    if target.is_file() and target.stat().st_size > 0:
        return target
    pngs = [p for p in work.glob("*.png") if p.stat().st_size > 0]
    if not pngs:
        return None
    return max(pngs, key=lambda p: p.stat().st_mtime)


async def _grok(prompt: str, work: Path, name: str) -> bytes | None:
    binary = _resolve("grok")
    if not binary:
        return None
    spec = work / "spec.txt"
    spec.write_text(
        "Use your built-in image_gen (Imagine) tool to generate ONE image, then copy "
        f"the result into the current working directory as {name}.\n\nPrompt: {prompt}\n",
        encoding="utf-8",
    )
    await _run(
        [
            binary, "--prompt-file", str(spec), "--sandbox", "workspace-write",
            "--permission-mode", "bypassPermissions", "--output-format", "plain",
            "--cwd", str(work), "--max-turns", "8",
        ],
        cwd=work,
        timeout=CHANNEL_TIMEOUT_SECONDS,
    )
    found = _newest_png(work, name)
    return found.read_bytes() if found else None


async def _codex(prompt: str, work: Path, name: str) -> bytes | None:
    binary = _resolve("codex")
    if not binary:
        return None
    last = work / "last.txt"
    instruction = (
        "아래 이미지를 빌트인 image_gen 도구로 직접 생성해(openai SDK 스크립트 금지). "
        f"생성 후 작업 디렉토리에 {name} 으로 복사.\n"
        f"프롬프트: {prompt}\n크기: 1024x1024"
    )
    await _run(
        [
            binary, "exec", "-s", "workspace-write",
            # 그림은 image_gen 도구가 그린다. 추론 깊이를 올려 봐야 경로 탐색에
            # 토큰만 태우고 품질은 그대로다.
            "-c", "model_reasoning_effort=low",
            "--ephemeral", "--color", "never", "-C", str(work),
            "--output-last-message", str(last), instruction,
        ],
        cwd=work,
        timeout=CHANNEL_TIMEOUT_SECONDS,
    )
    found = _newest_png(work, name)
    return found.read_bytes() if found else None


async def generate_image(prompt: str, aspect: str = "16:9") -> tuple[bytes, str] | None:
    """사진 한 장. (bytes, mime) 또는 실패 시 None.

    작업 폴더를 장마다 새로 판다. 한 폴더를 공유하면 `_newest_png` 가 앞
    호출이 남긴 그림을 집어 엉뚱한 자리에 붙는다.
    """
    text = build_prompt(prompt, aspect)
    channels = (("grok", _grok), ("codex", _codex))
    work = Path(tempfile.mkdtemp(prefix="adg-img-"))
    try:
        for label, runner in channels:
            try:
                data = await runner(text, work, "slot.png")
            except asyncio.TimeoutError:
                logger.warning("image channel %s timed out", label)
                continue
            except Exception as exc:  # noqa: BLE001 — 다음 채널로 넘어간다.
                logger.warning("image channel %s failed: %s", label, str(exc)[:200])
                continue
            if data:
                logger.info("image via %s (%d bytes)", label, len(data))
                return data, "image/png"
            # 다음 채널이 앞 채널의 잔여물을 주워 담지 않도록 비운다.
            for leftover in work.glob("*.png"):
                leftover.unlink(missing_ok=True)
        return None
    finally:
        shutil.rmtree(work, ignore_errors=True)


def new_slot_name() -> str:
    return f"{uuid.uuid4().hex[:12]}.png"
