"""FastAPI application factory."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from . import __version__, stats
from .config import Settings, get_settings
from .errors import AppError
from .pool import SessionPool
from .routers import (
    accounts,
    addressbooks,
    calendars,
    contacts,
    events,
    todos,
)
from .store import Store


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        store = Store(settings.db_path)
        pool = SessionPool(settings)
        app.state.settings = settings
        app.state.store = store
        app.state.pool = pool
        try:
            yield
        finally:
            await pool.close()
            store.close()
            stats.dump()

    app = FastAPI(
        title="pimpumpam",
        version=__version__,
        summary="A REST front-end that is a full CalDAV and CardDAV client",
        lifespan=lifespan,
    )

    @app.exception_handler(AppError)
    async def _handle_pimpumpam_error(
        request: Request, exc: AppError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code, content={"detail": exc.detail}
        )

    for module in (accounts, calendars, events, todos, addressbooks, contacts):
        app.include_router(module.router)

    @app.get("/health", tags=["meta"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    # Permissive CORS so a separately-served UI (Vite dev with an absolute base,
    # or the Electron renderer) can reach the API.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["ETag"],
    )

    # Serve the built frontend (ui/dist) at "/" when present. Registered last,
    # so API routes always take precedence.
    static_dir = settings.static_dir or os.path.join(os.getcwd(), "ui", "dist")
    if os.path.isdir(static_dir):
        app.mount(
            "/", StaticFiles(directory=static_dir, html=True), name="static"
        )

    return app


# Module-level instance for ``uvicorn pimpumpam.app:app``.
app = create_app()
