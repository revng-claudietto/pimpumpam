"""Application configuration, loaded from the environment (prefix ``PIMPUMPAM_``)."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings.

    All values may be supplied via environment variables, e.g.
    ``PIMPUMPAM_DB_PATH=/var/lib/pimpumpam.db``.
    """

    model_config = SettingsConfigDict(
        env_prefix="PIMPUMPAM_",
        env_file=".env",
        extra="ignore",
    )

    # Path to the SQLite database holding the account registry.
    db_path: str = "pimpumpam.db"
    # Per-request timeout (seconds) for upstream DAV calls.
    request_timeout: int = 30
    # Directory of a built frontend (ui/dist) to serve at "/". If unset, the
    # app auto-detects ./ui/dist relative to the working directory.
    static_dir: str | None = None


@lru_cache
def get_settings() -> Settings:
    """Return process-wide settings (cached)."""
    return Settings()
