"""시안 안에 놓인 생성 이미지 조회.

시안 마크업의 `<img src>` 가 직접 가리키는 경로다. 이미지 태그는 인증
헤더를 실을 수 없으므로 여기서는 **소유자 확인 대신 추측 불가능한 공개
식별자**로 접근을 제한한다 — 프로젝트 목록·시안 목록은 여전히 인증
뒤에 있고, 여기 노출되는 것은 시안 배경 사진 한 장이다.

같은 이유로 응답은 오래 캐시한다. 에셋은 생성 후 바뀌지 않는다.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response, status

from app.core.deps import DbDep
from app.core.identity import get_pub
from app.models.design import MockupAsset

router = APIRouter(prefix="/assets", tags=["assets"])

# 브라우저·CDN 캐시. 내용이 불변이므로 immutable 을 함께 준다.
CACHE_CONTROL = "public, max-age=31536000, immutable"

ALLOWED_MIME = {"image/png", "image/jpeg", "image/webp", "image/gif"}


@router.get("/{asset_id}")
async def get_asset(asset_id: str, db: DbDep) -> Response:
    asset = await get_pub(db, MockupAsset, asset_id)
    if asset is None or not asset.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    # 저장된 MIME 을 그대로 믿지 않는다 — 브라우저가 이미지가 아닌 타입으로
    # 해석하면 이 경로가 임의 콘텐츠 배포구가 된다.
    mime = asset.mime if asset.mime in ALLOWED_MIME else "application/octet-stream"
    return Response(
        content=asset.data,
        media_type=mime,
        headers={
            "Cache-Control": CACHE_CONTROL,
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": "inline",
        },
    )
