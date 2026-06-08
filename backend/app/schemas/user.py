"""사용자 및 인증 스키마."""
from __future__ import annotations

import datetime as dt

from pydantic import EmailStr, Field

from app.schemas.common import CamelModel


class MonthlyGenerations(CamelModel):
    used: int
    limit: int


class UserOut(CamelModel):
    id: str
    email: EmailStr
    name: str
    avatar: str | None = None
    plan: str
    credits: int
    monthly_generations: MonthlyGenerations
    email_verified: bool
    two_factor_enabled: bool
    language: str
    theme: str
    created_at: dt.datetime

    @classmethod
    def from_model(cls, u) -> "UserOut":
        return cls(
            id=u.id,
            email=u.email,
            name=u.name,
            avatar=u.avatar,
            plan=u.plan,
            credits=u.credits,
            monthly_generations=MonthlyGenerations(
                used=u.monthly_used, limit=u.monthly_limit
            ),
            email_verified=u.email_verified,
            two_factor_enabled=u.two_factor_enabled,
            language=u.language,
            theme=u.theme,
            created_at=u.created_at,
        )


class UserUpdate(CamelModel):
    name: str | None = None
    avatar: str | None = None
    language: str | None = None
    theme: str | None = None


class SignupIn(CamelModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=120)


class LoginIn(CamelModel):
    email: EmailStr
    password: str


class TokenPair(CamelModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class RefreshIn(CamelModel):
    refresh_token: str


class PasswordChangeIn(CamelModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class SessionOut(CamelModel):
    id: str
    device: str
    location: str | None = None
    last_active: dt.datetime | None = Field(default=None, alias="lastActive")
    current: bool = False
