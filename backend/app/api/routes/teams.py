"""팀 워크스페이스 — 생성·멤버 초대·역할 관리 (Team 등급).

역할은 Owner·Admin·Member 3종이며, 정원은 기본 5명이다
(서비스정책서 §2.6·§18.2 — 기획서 v0.5.0 §4 '팀 협업' 준용).
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbDep
from app.models.platform import Team, TeamMembership
from app.models.user import User
from app.schemas.common import Message
from app.schemas.platform import (
    TeamCreate,
    TeamMemberInvite,
    TeamMemberOut,
    TeamMemberRoleUpdate,
    TeamOut,
)
from app.services.quota import require_plan

router = APIRouter(prefix="/teams", tags=["teams"])

TEAM_PLANS = ("Team", "Admin")


async def _members(db, team_id: str) -> list[TeamMembership]:
    return list(
        (
            await db.scalars(
                select(TeamMembership)
                .where(TeamMembership.team_id == team_id)
                .order_by(TeamMembership.created_at)
            )
        ).all()
    )


async def _to_out(db, team: Team, user: User) -> TeamOut:
    members = await _members(db, team.id)
    my_role = next(
        (m.role for m in members if m.user_id == user.id),
        "Owner" if team.owner_id == user.id else "Member",
    )
    return TeamOut(
        id=team.id,
        name=team.name,
        description=team.description,
        owner_id=team.owner_id,
        seat_limit=team.seat_limit,
        seats_used=len(members),
        my_role=my_role,
        members=[TeamMemberOut.model_validate(m) for m in members],
    )


async def _my_team(db, user: User) -> Team | None:
    """소유 팀 우선, 없으면 소속 팀을 반환한다."""
    team = await db.scalar(select(Team).where(Team.owner_id == user.id))
    if team is not None:
        return team
    membership = await db.scalar(
        select(TeamMembership).where(TeamMembership.user_id == user.id)
    )
    if membership is None:
        return None
    return await db.get(Team, membership.team_id)


def _assert_can_manage(role: str) -> None:
    if role not in ("Owner", "Admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="팀원 초대·역할 변경은 Owner·Admin 만 가능합니다.",
        )


@router.get("", response_model=list[TeamOut])
async def list_teams(user: CurrentUser, db: DbDep):
    team = await _my_team(db, user)
    return [await _to_out(db, team, user)] if team is not None else []


@router.post("", response_model=TeamOut, status_code=status.HTTP_201_CREATED)
async def create_team(body: TeamCreate, user: CurrentUser, db: DbDep):
    require_plan(user, TEAM_PLANS, "팀 워크스페이스")
    if await db.scalar(select(Team).where(Team.owner_id == user.id)) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="이미 소유한 팀이 있습니다."
        )
    team = Team(name=body.name, description=body.description, owner_id=user.id)
    db.add(team)
    await db.flush()
    db.add(
        TeamMembership(
            team_id=team.id,
            user_id=user.id,
            email=user.email,
            name=user.name,
            role="Owner",
            status="Active",
        )
    )
    await db.flush()
    return await _to_out(db, team, user)


@router.post(
    "/{team_id}/members",
    response_model=TeamMemberOut,
    status_code=status.HTTP_201_CREATED,
)
async def invite_member(
    team_id: str, body: TeamMemberInvite, user: CurrentUser, db: DbDep
):
    team = await db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    out = await _to_out(db, team, user)
    _assert_can_manage(out.my_role)

    if out.seats_used >= team.seat_limit:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                f"팀 정원({team.seat_limit}명)을 초과했습니다. "
                "추가 시드는 1인당 월 $9 로 구매할 수 있습니다."
            ),
        )
    if any(m.email.lower() == body.email.lower() for m in out.members):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="이미 초대된 이메일입니다."
        )

    invitee = await db.scalar(select(User).where(User.email == body.email))
    membership = TeamMembership(
        team_id=team.id,
        user_id=invitee.id if invitee else None,
        email=str(body.email),
        name=body.name or (invitee.name if invitee else ""),
        role=body.role,
        status="Active" if invitee else "Invited",
    )
    db.add(membership)
    await db.flush()
    return TeamMemberOut.model_validate(membership)


@router.patch("/{team_id}/members/{member_id}", response_model=TeamMemberOut)
async def update_member_role(
    team_id: str,
    member_id: str,
    body: TeamMemberRoleUpdate,
    user: CurrentUser,
    db: DbDep,
):
    team = await db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    out = await _to_out(db, team, user)
    _assert_can_manage(out.my_role)

    membership = await db.get(TeamMembership, member_id)
    if membership is None or membership.team_id != team.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if membership.role == "Owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Owner 역할은 팀 이양으로만 변경할 수 있습니다.",
        )
    # Admin 은 Member 역할만 바꿀 수 있다 (다른 Admin 조정은 Owner 권한).
    if out.my_role == "Admin" and membership.role == "Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin 역할 변경은 Owner 만 가능합니다.",
        )
    membership.role = body.role
    db.add(membership)
    return TeamMemberOut.model_validate(membership)


@router.delete("/{team_id}/members/{member_id}", response_model=Message)
async def remove_member(team_id: str, member_id: str, user: CurrentUser, db: DbDep):
    team = await db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    out = await _to_out(db, team, user)
    _assert_can_manage(out.my_role)

    membership = await db.get(TeamMembership, member_id)
    if membership is None or membership.team_id != team.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if membership.role == "Owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Owner 는 제외할 수 없습니다."
        )
    await db.delete(membership)
    return Message(detail="Member removed")
