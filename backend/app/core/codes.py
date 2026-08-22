"""공통 코드 C-형식 ↔ API 문자열 (DA 코드테이블.md).

DB 에는 C010101 을 저장하고, 파이썬·JSON 은 기존 업무 문자열을 쓴다.
미등록 값은 그대로 통과한다 (구 데이터·외부 스텁).
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
    "SUBSCRIPTION_STATUS": {
        "active": "C050101",
        "canceled": "C050102",
        "past_due": "C050103",
        "trialing": "C050104",
    },
    "PAYMENT_STATUS": {
        "pending": "C060101",
        "succeeded": "C060102",
        "failed": "C060103",
    },
    "REFUND_STATUS": {
        "Pending": "C070101",
        "Approved": "C070102",
        "Rejected": "C070103",
    },
    "TEMPLATE_STATUS": {
        "Pending": "C080101",
        "Approved": "C080102",
        "Rejected": "C080103",
        "RequestChanges": "C080104",
    },
    "TEAM_ROLE": {
        "Owner": "C090101",
        "Admin": "C090102",
        "Member": "C090103",
    },
    "TEAM_MEMBER_STATUS": {
        "Active": "C100101",
        "Invited": "C100102",
    },
    "GEN_KIND": {
        "full": "C110101",
        "screen_add": "C110102",
    },
    "GEN_STAGE": {
        "InputAnalyzer": "C120101",
        "ConceptEngine": "C120102",
        "LayoutEngine": "C120103",
        "Renderer": "C120104",
        "Done": "C120105",
    },
    "ANNOUNCEMENT_STATUS": {
        "Draft": "C130101",
        "Published": "C130102",
    },
    "ANNOUNCEMENT_PRIORITY": {
        "normal": "C140101",
        "high": "C140102",
    },
    "FEEDBACK_STATUS": {
        "new": "C150101",
        "in_review": "C150102",
        "done": "C150103",
    },
    "CREDIT_TYPE": {
        "refund": "C160101",
        "purchase": "C160102",
        "consumption": "C160103",
    },
    "FILE_KIND": {
        "image": "C170101",
        "document": "C170102",
        # URL 첨부. 별도 테이블을 두지 않고 첨부 한 종류로 다룬다 — 파이프라인은
        # 이미 첨부의 추출 텍스트를 요건에 합류시키므로 여기 얹으면 그대로 흐른다.
        "link": "C170103",
    },
    "QUOTA_BUCKET": {
        "monthly": "C180101",
        "credit": "C180102",
        "unlimited": "C180103",
    },
    "MOCKUP_KIND": {
        "landing": "C190101",
        "login": "C190102",
        "dashboard": "C190103",
        "list": "C190104",
        "detail": "C190105",
        "main": "C190106",
    },
    "DS_MODE": {
        "per_concept": "C200101",
        "unified": "C200102",
    },
    "PLATFORM": {
        "Web": "C210101",
        "Mobile": "C210102",
        "Responsive": "C210103",
        "APP": "C210104",
    },
    "EXPORT_FORMAT": {
        "png": "C220101",
        "fig": "C220102",
        "json": "C220103",
        "css": "C220104",
    },
    "EXPORT_SCOPE": {
        "current": "C230101",
        "concept": "C230102",
        "all": "C230103",
    },
    "USER_THEME": {
        "light": "C240101",
        "dark": "C240102",
        "system": "C240103",
    },
    "USER_LANGUAGE": {
        "ko": "C250101",
        "en": "C250102",
    },
    "LOG_LEVEL": {
        "debug": "C260101",
        "info": "C260102",
        "warn": "C260103",
        "error": "C260104",
        "fatal": "C260105",
    },
    "NOTIFICATION_CATEGORY": {
        "system": "C270101",
        "generation": "C270102",
    },
    "CURRENCY": {
        "krw": "C280101",
    },
    "AUDIT_SEVERITY": {
        "info": "C290101",
        "warning": "C290102",
        "critical": "C290103",
    },
    "CHANGE_REASON": {
        "created": "C990101",
        "updated": "C990102",
    },
}

CODE_GROUP_NM: dict[str, str] = {
    "USER_PLAN": "사용자 등급",
    "USER_STATUS": "사용자 상태",
    "PROJECT_STATUS": "프로젝트 상태",
    "GEN_STATUS": "생성 작업 상태",
    "SUBSCRIPTION_STATUS": "구독 상태",
    "PAYMENT_STATUS": "결제 상태",
    "REFUND_STATUS": "환불 상태",
    "TEMPLATE_STATUS": "템플릿 심사 상태",
    "TEAM_ROLE": "팀 역할",
    "TEAM_MEMBER_STATUS": "팀원 상태",
    "GEN_KIND": "생성 종류",
    "GEN_STAGE": "생성 단계",
    "ANNOUNCEMENT_STATUS": "공지 상태",
    "ANNOUNCEMENT_PRIORITY": "공지 우선순위",
    "FEEDBACK_STATUS": "피드백 상태",
    "CREDIT_TYPE": "크레딧 거래 유형",
    "FILE_KIND": "첨부 종류",
    "QUOTA_BUCKET": "쿼터 버킷",
    "MOCKUP_KIND": "시안 아키타입",
    "DS_MODE": "디자인 시스템 모드",
    "PLATFORM": "대상 플랫폼",
    "EXPORT_FORMAT": "내보내기 형식",
    "EXPORT_SCOPE": "내보내기 범위",
    "USER_THEME": "화면 테마",
    "USER_LANGUAGE": "표시 언어",
    "LOG_LEVEL": "로그 수준",
    "NOTIFICATION_CATEGORY": "알림 분류",
    "CURRENCY": "통화",
    "AUDIT_SEVERITY": "감사 심각도",
    "CHANGE_REASON": "이력 변경 사유",
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
