"""프로젝트 첨부 업로드·조회·삭제 — 파일과 URL.

기능정의서 v0.2.0 §3.1 '파일 업로드' — 형식·크기·개수 제한과 3중 검증은
services/upload.py 가 담당한다. 여기서는 소유권·개수·기록을 다룬다.

URL 첨부도 같은 테이블에 `kind=link` 로 넣는다. 생성 파이프라인은 이미
첨부의 추출 텍스트를 요건에 합류시키므로, 여기 얹으면 별도 배선 없이
그대로 분석 입력으로 흐른다. SSRF 방어는 services/url_fetch.py 가 진다.
"""
from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from hashlib import sha256

from sqlalchemy import select

from app.core.deps import CurrentUser, DbDep
from app.core.identity import get_pub
from app.core.observability import log_event
from app.core.security_middleware import hit_rate_limit
from app.models.project import Project
from app.models.upload import FileUpload
from app.schemas.common import Message
from app.schemas.upload import FileUploadOut
from app.services.upload import MAX_FILES_PER_PROJECT, validate_and_extract
from app.services.url_fetch import (
    MAX_URLS_PER_PROJECT,
    UrlNotAllowed,
    fetch_url,
    normalize_url,
)

router = APIRouter(prefix="/projects/{project_id}/files", tags=["uploads"])


async def _owned(db: DbDep, project_id: str, user_id: str) -> Project:
    project = await get_pub(db, Project, project_id)
    if project is None or project.owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.get("", response_model=list[FileUploadOut])
async def list_files(project_id: str, user: CurrentUser, db: DbDep):
    await _owned(db, project_id, user.id)
    rows = (
        await db.scalars(
            select(FileUpload)
            .where(FileUpload.project_id == project_id)
            .order_by(FileUpload.created_at)
        )
    ).all()
    return [_to_out(r) for r in rows]


@router.post("", response_model=list[FileUploadOut], status_code=status.HTTP_201_CREATED)
async def upload_files(
    project_id: str,
    user: CurrentUser,
    db: DbDep,
    files: list[UploadFile] = File(...),
):
    project = await _owned(db, project_id, user.id)
    retry = hit_rate_limit(f"upload|{user.id}", 3600, 20)
    if retry is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="업로드가 너무 잦습니다. 잠시 후 다시 시도해 주세요.",
            headers={"Retry-After": str(retry)},
        )

    existing = (
        await db.scalars(select(FileUpload).where(FileUpload.project_id == project_id))
    ).all()
    if len(existing) + len(files) > MAX_FILES_PER_PROJECT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"첨부는 프로젝트당 최대 {MAX_FILES_PER_PROJECT}개입니다.",
        )

    saved: list[FileUpload] = []
    for upload in files:
        data = await upload.read()
        result = validate_and_extract(
            filename=upload.filename or "file",
            content_type=upload.content_type,
            data=data,
        )
        # 같은 파일을 두 번 올리면 앞의 것을 대체한다 (중복 분석 방지).
        duplicate = next((e for e in existing if e.sha256 == result.sha256), None)
        if duplicate is not None:
            await db.delete(duplicate)

        row = FileUpload(
            project_id=project.id,
            user_id=user.id,
            filename=result.filename,
            kind=result.kind,
            content_type=result.content_type,
            size_bytes=result.size_bytes,
            sha256=result.sha256,
            pages=result.pages,
            extracted_text=result.extracted_text,
        )
        db.add(row)
        saved.append(row)

    await db.flush()
    log_event(
        kind="upload.created",
        message=f"첨부 {len(saved)}건 업로드",
        user_id=user.id,
        payload={
            "projectId": project.id,
            "files": [
                {"name": r.filename, "kind": r.kind, "bytes": r.size_bytes}
                for r in saved
            ],
        },
    )
    return [_to_out(r) for r in saved]


class LinkIn(BaseModel):
    url: str = Field(min_length=3, max_length=2048)


@router.post("/links", response_model=FileUploadOut, status_code=status.HTTP_201_CREATED)
async def attach_link(project_id: str, body: LinkIn, user: CurrentUser, db: DbDep):
    """URL 하나를 가져와 첨부로 등록한다.

    업로드보다 상한을 낮게 잡는다 — 파일은 사용자가 이미 가진 것을 올리는
    반면, 이 경로는 서버가 바깥으로 요청을 낸다. 남용되면 이 서버가 남의
    사이트를 긁는 도구가 된다.
    """
    project = await _owned(db, project_id, user.id)
    retry = hit_rate_limit(f"linkfetch|{user.id}", 3600, 30)
    if retry is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="URL 첨부가 너무 잦습니다. 잠시 후 다시 시도해 주세요.",
            headers={"Retry-After": str(retry)},
        )

    try:
        canonical = normalize_url(body.url)
    except UrlNotAllowed as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    existing = (
        await db.scalars(select(FileUpload).where(FileUpload.project_id == project_id))
    ).all()
    links = [e for e in existing if e.kind == "link"]
    if len(links) >= MAX_URLS_PER_PROJECT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"URL 첨부는 프로젝트당 최대 {MAX_URLS_PER_PROJECT}개입니다.",
        )

    try:
        fetched = await fetch_url(canonical)
    except UrlNotAllowed as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    digest = sha256(fetched.url.encode("utf-8")).hexdigest()
    # 같은 주소를 다시 넣으면 앞의 것을 대체한다 — 내용이 바뀌었을 수 있으므로
    # 무시가 아니라 갱신이 맞다.
    duplicate = next((e for e in existing if e.sha256 == digest), None)
    if duplicate is not None:
        await db.delete(duplicate)

    row = FileUpload(
        project_id=project.id,
        user_id=user.id,
        filename=(fetched.title or fetched.url)[:160],
        kind="link",
        content_type=fetched.content_type[:120],
        size_bytes=fetched.byte_size,
        sha256=digest,
        pages=None,
        extracted_text=f"[출처] {fetched.url}\n\n{fetched.text}",
    )
    db.add(row)
    await db.flush()
    log_event(
        kind="upload.link",
        message="URL 첨부",
        user_id=user.id,
        payload={"projectId": project.id, "url": fetched.url, "bytes": fetched.byte_size},
    )
    return _to_out(row)


@router.delete("/{file_id}", response_model=Message)
async def delete_file(project_id: str, file_id: str, user: CurrentUser, db: DbDep):
    await _owned(db, project_id, user.id)
    row = await get_pub(db, FileUpload, file_id)
    if row is None or row.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    await db.delete(row)
    return Message(detail="첨부를 삭제했습니다.")


def _to_out(row: FileUpload) -> FileUploadOut:
    return FileUploadOut(
        id=row.id,
        project_id=row.project_id,
        filename=row.filename,
        kind=row.kind,
        content_type=row.content_type,
        size_bytes=row.size_bytes,
        pages=row.pages,
        # 원문 대신 분석에 실제로 쓰인 분량만 알려 준다.
        extracted_chars=len(row.extracted_text or ""),
        created_at=row.created_at,
    )
