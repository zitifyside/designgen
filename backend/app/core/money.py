"""금액(센트) — DB 는 DECIMAL, 애플리케이션은 int (DA 데이터타입.md)."""
from __future__ import annotations

from decimal import Decimal

from sqlalchemy.types import Numeric, TypeDecorator


class IntCents(TypeDecorator):
    """Numeric(15, 0) 에 저장하고 파이썬에는 int 를 준다."""

    impl = Numeric(15, 0)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return int(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, Decimal):
            return int(value)
        return int(value)
