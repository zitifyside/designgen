"""공통 코드 C-형식 ↔ API 문자열 (DA 코드테이블.md).

DB 에는 C010101 을 저장하고, 파이썬·JSON 은 기존 업무 문자열을 쓴다.
"""
from __future__ import annotations

from sqlalchemy.types import String, TypeDecorator

# group → {api_value: code_value}
CODE_MAP: dict[str, dict[str, str]] = {
    "USER_PLAN": {
        "Free": "C010101",
        "Pro": "C010102",
        "Team": "C010103",
        "Admin": "C010104",
    },
    "USER_STATUS": {
        "Active": "C020101",
        "Suspended": "C020102",
        "Deleted": "C020103",
    },
    "PROJECT_STATUS": {
        "Draft": "C030101",
        "InputReady": "C030102",
        "Generating": "C030103",
        "Completed": "C030104",
        "CompletedWarning": "C030105",
        "ConceptLocked": "C030106",
        "Failed": "C030107",
        "Cancelled": "C030108",
    },
    "GEN_STATUS": {
        "Pending": "C040101",
        "Running": "C040102",
        "Done": "C040103",
        "Failed": "C040104",
        "Cancelled": "C040105",
    },
}

_TO_API: dict[str, dict[str, str]] = {
    group: {code: api for api, code in mapping.items()}
    for group, mapping in CODE_MAP.items()
}


def to_code(group: str, api_value: str | None) -> str | None:
    if api_value is None:
        return None
    return CODE_MAP.get(group, {}).get(api_value, api_value)


def to_api(group: str, code_value: str | None) -> str | None:
    if code_value is None:
        return None
    return _TO_API.get(group, {}).get(code_value, code_value)


class CodedStr(TypeDecorator):
    """VARCHAR 컬럼에 C-코드를 저장하고 애플리케이션에는 API 문자열을 준다."""

    impl = String
    cache_ok = True

    def __init__(self, group: str, length: int = 10):
        super().__init__(length)
        self.group = group

    def process_bind_param(self, value, dialect):
        return to_code(self.group, value)

    def process_result_value(self, value, dialect):
        return to_api(self.group, value)
