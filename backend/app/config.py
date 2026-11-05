"""Application settings, read from environment variables.

Every setting has a safe local-first default, so MockDock runs with no
configuration at all. Nothing in here is a secret.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = BACKEND_DIR / "data" / "mockdock.db"
DEFAULT_FRONTEND_DIST = BACKEND_DIR.parent / "frontend" / "dist"


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_list(name: str, default: list[str]) -> list[str]:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


@dataclass
class Settings:
    host: str = "127.0.0.1"
    port: int = 8000
    db_path: Path = DEFAULT_DB_PATH
    cors_origins: list[str] = field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )
    seed_sample: bool = True
    # Upper bound for simulated latency, to stop a typo from hanging clients.
    max_delay_ms: int = 30_000
    # How many request-log rows to keep. Older rows are pruned automatically.
    log_retention: int = 5_000
    # Request bodies larger than this are rejected by the mock server (413).
    max_request_body_bytes: int = 1_048_576
    # Bodies are truncated to this size before being stored in the log.
    max_logged_body_bytes: int = 65_536
    frontend_dist: Path | None = DEFAULT_FRONTEND_DIST

    @classmethod
    def from_env(cls) -> "Settings":
        defaults = cls()
        return cls(
            host=os.environ.get("MOCKDOCK_HOST", defaults.host),
            port=int(os.environ.get("MOCKDOCK_PORT", defaults.port)),
            db_path=Path(os.environ.get("MOCKDOCK_DB_PATH", defaults.db_path)),
            cors_origins=_env_list("MOCKDOCK_CORS_ORIGINS", defaults.cors_origins),
            seed_sample=_env_bool("MOCKDOCK_SEED_SAMPLE", defaults.seed_sample),
            max_delay_ms=int(os.environ.get("MOCKDOCK_MAX_DELAY_MS", defaults.max_delay_ms)),
            log_retention=int(os.environ.get("MOCKDOCK_LOG_RETENTION", defaults.log_retention)),
            frontend_dist=defaults.frontend_dist,
        )
