"""Import all models so they register on Base.metadata."""
from app.models.admin import Announcement, AuditLog, Feedback
from app.models.billing import (
    CreditTransaction,
    Payment,
    Plan,
    Refund,
    Subscription,
)
from app.models.design import DesignSystem, Mockup
from app.models.generation import Generation
from app.models.notification import Notification
from app.models.project import Project
from app.models.template import Template, TemplatePurchase, TemplateReview
from app.models.user import (
    EmailVerification,
    PasswordReset,
    Session,
    User,
)

__all__ = [
    "Announcement",
    "AuditLog",
    "CreditTransaction",
    "DesignSystem",
    "EmailVerification",
    "Feedback",
    "Generation",
    "Mockup",
    "Notification",
    "PasswordReset",
    "Payment",
    "Plan",
    "Project",
    "Refund",
    "Session",
    "Subscription",
    "Template",
    "TemplatePurchase",
    "TemplateReview",
    "User",
]
