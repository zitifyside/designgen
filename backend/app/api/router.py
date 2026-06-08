"""Aggregate all route modules under the versioned API prefix."""
from fastapi import APIRouter

from app.api.routes import (
    admin,
    auth,
    billing,
    design_systems,
    generations,
    mockups,
    notifications,
    projects,
    system,
    templates,
    users,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(projects.router)
api_router.include_router(generations.router)
api_router.include_router(design_systems.router)
api_router.include_router(mockups.router)
api_router.include_router(templates.router)
api_router.include_router(notifications.router)
api_router.include_router(billing.router)
api_router.include_router(admin.router)
api_router.include_router(system.router)
