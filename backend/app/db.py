"""Database engine, sessions and reproducible schema initialisation.

The schema is created from the SQLAlchemy models with ``create_all`` and
versioned with SQLite's built-in ``PRAGMA user_version``. When the schema
changes in future, add a step to ``MIGRATIONS`` instead of editing tables
by hand.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator
from pathlib import Path

from fastapi import Request
from sqlalchemy import Engine, create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker

from .models import Base

SCHEMA_VERSION = 1

# version -> function that upgrades the schema from (version - 1).
MIGRATIONS: dict[int, Callable[[Engine], None]] = {}


def make_engine(db_path: Path | str) -> Engine:
    if str(db_path) != ":memory:":
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _record):  # pragma: no cover - trivial
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA synchronous=NORMAL")
        cur.close()

    return engine


def init_schema(engine: Engine) -> None:
    """Create missing tables and run pending migrations."""
    with engine.begin() as conn:
        current = conn.execute(text("PRAGMA user_version")).scalar() or 0
    Base.metadata.create_all(engine)
    if current == 0:
        # Fresh database: create_all produced the latest schema.
        current = SCHEMA_VERSION
    for version in range(current + 1, SCHEMA_VERSION + 1):
        MIGRATIONS[version](engine)
    with engine.begin() as conn:
        conn.execute(text(f"PRAGMA user_version = {SCHEMA_VERSION}"))


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db(request: Request) -> Iterator[Session]:
    """FastAPI dependency yielding a session bound to this app's database."""
    session: Session = request.app.state.session_factory()
    try:
        yield session
    finally:
        session.close()
