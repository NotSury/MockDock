"""SQLAlchemy ORM models — the single source of truth for the schema."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    # URL-safe identifier used in the mock namespace: /mock/{slug}/...
    slug: Mapped[str] = mapped_column(String(48), unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    endpoints: Mapped[list[Endpoint]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="Endpoint.path, Endpoint.method",
    )


class Endpoint(Base):
    __tablename__ = "endpoints"
    __table_args__ = (
        # Two endpoints may not answer the same method on the same route shape
        # (e.g. /users/:id and /users/:userId are the same route).
        UniqueConstraint("project_id", "method", "route_key", name="uq_endpoint_route"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    method: Mapped[str] = mapped_column(String(8))
    path: Mapped[str] = mapped_column(String(512))
    route_key: Mapped[str] = mapped_column(String(512))
    name: Mapped[str] = mapped_column(String(120), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    active_scenario: Mapped[str] = mapped_column(String(60), default="")
    # Random failure simulation: probability in [0, 1].
    failure_rate: Mapped[float] = mapped_column(Float, default=0.0)
    failure_status: Mapped[int] = mapped_column(Integer, default=500)
    failure_body: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    project: Mapped[Project] = relationship(back_populates="endpoints")
    scenarios: Mapped[list[Scenario]] = relationship(
        back_populates="endpoint",
        cascade="all, delete-orphan",
        order_by="Scenario.position",
    )


class Scenario(Base):
    """One possible response for an endpoint (e.g. "Success", "Not found")."""

    __tablename__ = "scenarios"
    __table_args__ = (UniqueConstraint("endpoint_id", "name", name="uq_scenario_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    endpoint_id: Mapped[int] = mapped_column(ForeignKey("endpoints.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(String(60))
    status_code: Mapped[int] = mapped_column(Integer, default=200)
    # List of {"key": str, "value": str} pairs (keeps order, allows repeats).
    headers: Mapped[list] = mapped_column(JSON, default=list)
    body_type: Mapped[str] = mapped_column(String(8), default="json")  # json|text|none
    body: Mapped[str] = mapped_column(Text, default="")
    delay_ms: Mapped[int] = mapped_column(Integer, default=0)

    endpoint: Mapped[Endpoint] = relationship(back_populates="scenarios")


class RequestLog(Base):
    """A request received by the mock server (sensitive values redacted)."""

    __tablename__ = "request_logs"
    __table_args__ = (Index("ix_request_logs_project_created", "project_id", "created_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    project_slug: Mapped[str] = mapped_column(String(64))
    endpoint_id: Mapped[int | None] = mapped_column(
        ForeignKey("endpoints.id", ondelete="SET NULL"), nullable=True
    )
    endpoint_path: Mapped[str] = mapped_column(String(512), default="")
    method: Mapped[str] = mapped_column(String(10))
    path: Mapped[str] = mapped_column(String(2048))
    query_string: Mapped[str] = mapped_column(Text, default="")
    request_headers: Mapped[dict] = mapped_column(JSON, default=dict)
    request_body: Mapped[str] = mapped_column(Text, default="")
    response_status: Mapped[int] = mapped_column(Integer)
    response_headers: Mapped[dict] = mapped_column(JSON, default=dict)
    response_body: Mapped[str] = mapped_column(Text, default="")
    duration_ms: Mapped[float] = mapped_column(Float)
    scenario_name: Mapped[str] = mapped_column(String(60), default="")
    matched: Mapped[bool] = mapped_column(Boolean, default=False)
    simulated_failure: Mapped[bool] = mapped_column(Boolean, default=False)
    client: Mapped[str] = mapped_column(String(64), default="")


class Meta(Base):
    """Small key/value table for app-level flags (e.g. sample seeded)."""

    __tablename__ = "meta"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")
