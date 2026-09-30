"""FastAPI application entry point."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    admin_units,
    audit_log,
    auth,
    dashboard,
    demo,
    health,
    layers,
    missions,
    notifications,
    plots,
    search,
    surveys,
    tiles,
    users,
)
from app.core.config import get_settings
from app.core.errors import install_error_handlers


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description=(
            "Decision-support API. AI outputs are advisory; final decisions are made "
            "by authorized officers."
        ),
        docs_url="/docs",
        openapi_url="/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    install_error_handlers(app)
    for module in (
        health, auth, users, admin_units, audit_log, surveys, plots,
        dashboard, search, notifications, layers, tiles, demo, missions,
    ):
        app.include_router(module.router)
    return app


app = create_app()
