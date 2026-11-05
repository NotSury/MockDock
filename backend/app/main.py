"""FastAPI application factory.

Two clearly separated surfaces share one server:

* ``/api/...``  — the management API used by the MockDock UI
* ``/mock/{project}/...`` — the live mock server your apps call

If the frontend has been built (``frontend/dist``), it is served from ``/``.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import __version__
from .api import endpoints, logs, projects, stats, system
from .config import Settings
from .db import init_schema, make_engine, make_session_factory
from .errors import error_body, install_error_handlers
from .mock import server as mock_server
from .seed import seed_if_needed


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    engine = make_engine(settings.db_path)
    init_schema(engine)
    session_factory = make_session_factory(engine)
    if settings.seed_sample:
        with session_factory() as db:
            seed_if_needed(db)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        yield
        engine.dispose()

    app = FastAPI(
        title="MockDock",
        version=__version__,
        description="Local-first API mocking studio.",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = session_factory

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
        allow_headers=["*"],
        expose_headers=["*"],
    )
    install_error_handlers(app)

    for router in (system.router, projects.router, endpoints.router, logs.router, stats.router):
        app.include_router(router)
    app.include_router(mock_server.router)

    @app.api_route("/api/{rest:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
                   include_in_schema=False)
    async def api_not_found(rest: str):
        return JSONResponse(error_body("not_found", f"Unknown API route /api/{rest}."), 404)

    _mount_frontend(app, settings.frontend_dist)
    return app


def _mount_frontend(app: FastAPI, dist: Path | None) -> None:
    if dist is None or not (dist / "index.html").is_file():
        @app.get("/", include_in_schema=False)
        async def root():
            return {
                "name": "MockDock",
                "message": "API is running. Start the UI with `npm run dev` in frontend/, "
                "or build it with `npm run build` to serve it from here.",
                "docs": "/api/docs",
            }
        return

    assets = dist / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")
    index = dist / "index.html"
    dist_resolved = dist.resolve()

    @app.get("/{spa_path:path}", include_in_schema=False)
    async def spa(spa_path: str):
        candidate = (dist / spa_path).resolve()
        # Serve real files (favicon etc.) but never anything outside dist/.
        if spa_path and candidate.is_file() and dist_resolved in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(index)
