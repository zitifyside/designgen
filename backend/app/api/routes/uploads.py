"""프로젝트 첨부 파일 업로드·조회·삭제.

기능정의서 v0.2.0 §3.1 '파일 업로드' — 형식·크기·개수 제한과 3중 검증은
services/upload.py 가 담당한다. 여기서는 소유권·개수·기록을 다룬다.
"""
from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbDep
from app.core.observability import log_event
from app.models.project import Project
from app.models.upload import FileUpload
from app.schemas.common import Message
from app.schemas.upload import FileUploadOut
from app.services.upload import MAX_FILES_PER_PROJECT, validate_and_extract

router = APIRouter(prefix="/projects/{project_id}/files", tags=["uploads"])


async def _owned(db: DbDep, project_id: str, user_id: str) -> Project:
    project = await db.get(Project, project_id)
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


@router.delete("/{file_id}", response_model=Message)
async def delete_file(project_id: str, file_id: str, user: CurrentUser, db: DbDep):
    await _owned(db, project_id, user.id)
    row = await db.get(FileUpload, file_id)
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
