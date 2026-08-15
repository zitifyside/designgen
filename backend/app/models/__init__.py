"""Import all models so they register on Base.metadata."""
from app.models.admin import Announcement, AuditLog, Feedback
from app.models.code import CodeCommon, CodeGroup
from app.models.billing import (
    CreditTransaction,
    Payment,
    Plan,
    Refund,
    Subscription,
)
from app.models.design import DesignSystem, Mockup
from app.models.generation import Generation
from app.models.hist import PlanHist, UserHist
from app.models.logging import AppLogEvent
from app.models.notification import Notification
from app.models.platform import ApiKey, ExportHistory, Team, TeamMembership
from app.models.project import Project
from app.models.upload import FileUpload
from app.models.template import Template, TemplatePurchase, TemplateReview
from app.models.user import (
    EmailVerification,
    PasswordReset,
    Session,
    User,
)

__all__ = [
    "Announcement",
    "ApiKey",
    "AppLogEvent",
    "AuditLog",
    "CodeCommon",
    "CodeGroup",
    "CreditTransaction",
    "DesignSystem",
    "EmailVerification",
    "ExportHistory",
    "FileUpload",
    "Feedback",
    "Generation",
    "Mockup",
    "Notification",
    "PasswordReset",
    "Payment",
    "Plan",
    "PlanHist",
    "UserHist",
    "Project",
    "Refund",
    "Session",
    "Subscription",
    "Team",
    "TeamMembership",
    "Template",
    "TemplatePurchase",
    "TemplateReview",
    "User",
]
