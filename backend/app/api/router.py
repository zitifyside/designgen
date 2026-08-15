"""Aggregate all route modules under the versioned API prefix."""
from fastapi import APIRouter

from app.api.routes import (
    admin,
    api_keys,
    auth,
    billing,
    design_systems,
    exports,
    generations,
    mockups,
    notifications,
    projects,
    public_api,
    system,
    teams,
    templates,
    uploads,
    users,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(api_keys.router)
api_router.include_router(teams.router)
api_router.include_router(projects.router)
api_router.include_router(generations.router)
api_router.include_router(design_systems.router)
api_router.include_router(mockups.router)
api_router.include_router(uploads.router)
api_router.include_router(exports.router)
api_router.include_router(public_api.router)
api_router.include_router(templates.router)
api_router.include_router(notifications.router)
api_router.include_router(billing.router)
api_router.include_router(admin.router)
api_router.include_router(system.router)
