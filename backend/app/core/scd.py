"""SCD Type 2 적재 — 플랜 단가·사용자 등급/상태 (DA 이력관리.md)."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import event, select
from sqlalchemy.orm import Session

from app.core.codes import to_code
from app.models.billing import Plan
from app.models.hist import PlanHist, UserHist
from app.models.user import User

_REGISTERED = False

_PLAN_WATCH = ("code", "name", "monthly_price_cents", "annual_price_cents")
_USER_WATCH = ("plan", "status")


def register_scd(session_cls) -> None:
    global _REGISTERED
    if _REGISTERED:
        return
    _REGISTERED = True

    @event.listens_for(session_cls, "before_flush")
    def _write_hist(session: Session, flush_context, instances) -> None:  # noqa: ARG001
        now = dt.datetime.now(dt.timezone.utc)
        for obj in list(session.new) + list(session.dirty):
            if isinstance(obj, Plan):
                _touch_plan(session, obj, now)
            elif isinstance(obj, User):
                _touch_user(session, obj, now)


def _attr_changed(obj, names: tuple[str, ...]) -> bool:
    state = getattr(obj, "_sa_instance_state", None)
    if state is None:
        return True
    if _is_new(obj):
        return True
    committed = state.committed_state
    for name in names:
        if name in committed and getattr(obj, name) != committed.get(name):
            return True
        attr = state.attrs.get(name)
        if attr is not None and attr.history.has_changes():
            return True
    return False


def _is_new(obj) -> bool:
    state = getattr(obj, "_sa_instance_state", None)
    return bool(state and state.session is not None and obj in state.session.new)


def _ensure_public_id(obj) -> None:
    """before_flush 시점에도 public_id 가 비어 있으면 채운다."""
    if getattr(obj, "id", None):
        return
    table = getattr(type(obj), "__table__", None)
    if table is None or "public_id" not in table.c:
        return
    default = table.c.public_id.default
    if default is None:
        return
    arg = getattr(default, "arg", None)
    if not callable(arg):
        obj.id = arg
        return
    try:
        obj.id = arg()
    except TypeError:
        obj.id = arg(None)


def _touch_plan(session: Session, plan: Plan, now: dt.datetime) -> None:
    if not (_is_new(plan) or _attr_changed(plan, _PLAN_WATCH)):
        return
    _ensure_public_id(plan)
    if not plan.id:
        return
    reason = "C990101" if _is_new(plan) else "C990102"
    _close_current(session, PlanHist, PlanHist.plan_public_id, plan.id, now)
    session.add(
        PlanHist(
            plan_public_id=plan.id,
            plan_cd=to_code("USER_PLAN", plan.code) or plan.code,
            plan_nm=plan.name,
            monthly_price_cents=int(plan.monthly_price_cents or 0),
            annual_price_cents=int(plan.annual_price_cents or 0),
            valid_from_at=now,
            is_current=True,
            change_reason_cd=reason,
        )
    )


def _touch_user(session: Session, user: User, now: dt.datetime) -> None:
    if not (_is_new(user) or _attr_changed(user, _USER_WATCH)):
        return
    _ensure_public_id(user)
    if not user.id:
        return
    reason = "C990101" if _is_new(user) else "C990102"
    _close_current(session, UserHist, UserHist.user_public_id, user.id, now)
    plan_api = user.plan or "Free"
    status_api = user.status or "Active"
    session.add(
        UserHist(
            user_public_id=user.id,
            plan_cd=to_code("USER_PLAN", plan_api) or plan_api,
            status_cd=to_code("USER_STATUS", status_api) or status_api,
            valid_from_at=now,
            is_current=True,
            change_reason_cd=reason,
        )
    )


def _close_current(session: Session, model, key_col, public_id: str, now: dt.datetime) -> None:
    rows = session.scalars(
        select(model).where(key_col == public_id, model.is_current.is_(True))
    ).all()
    for row in rows:
        row.is_current = False
        row.valid_to_at = now
