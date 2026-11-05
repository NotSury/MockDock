"""Pydantic models for the management API (request validation + responses)."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .mock.matcher import InvalidPathError, normalize_path
from .mock.templating import validate_json_template

HttpMethod = Literal["GET", "POST", "PUT", "PATCH", "DELETE"]
BodyType = Literal["json", "text", "none"]

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
HEADER_NAME_RE = re.compile(r"^[!#$%&'*+.^_`|~0-9A-Za-z-]+$")
# Headers that are managed by the HTTP server and must not be overridden.
FORBIDDEN_RESPONSE_HEADERS = frozenset(
    {
        "content-length",
        "transfer-encoding",
        "connection",
        "keep-alive",
        "upgrade",
        "te",
        "trailer",
        "host",
    }
)
MAX_BODY_CHARS = 1_000_000
MAX_DELAY_MS = 30_000
NO_BODY_STATUSES = {204, 205, 304}


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:48].strip("-") or "project"


# ---------------------------------------------------------------- projects --


class ProjectBase(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=2000)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name must not be blank.")
        return v


def _check_slug(v: str | None) -> str | None:
    if v is None:
        return v
    v = v.strip().lower()
    if not SLUG_RE.match(v) or len(v) > 48:
        raise ValueError(
            "Slug must be 1-48 lowercase letters, digits or single hyphens (e.g. 'my-shop')."
        )
    return v


class ProjectCreate(ProjectBase):
    slug: str | None = None

    @field_validator("slug")
    @classmethod
    def _slug(cls, v: str | None) -> str | None:
        return _check_slug(v)


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    slug: str | None = None
    description: str | None = Field(default=None, max_length=2000)

    @field_validator("slug")
    @classmethod
    def _slug(cls, v: str | None) -> str | None:
        return _check_slug(v)


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    description: str
    created_at: datetime
    updated_at: datetime
    endpoint_count: int = 0
    request_count: int = 0
    mock_base_path: str = ""


# --------------------------------------------------------------- endpoints --


class HeaderPair(BaseModel):
    key: str = Field(min_length=1, max_length=128)
    value: str = Field(default="", max_length=4096)

    @field_validator("key")
    @classmethod
    def _valid_name(cls, v: str) -> str:
        v = v.strip()
        if not HEADER_NAME_RE.match(v):
            raise ValueError(f"'{v}' is not a valid HTTP header name.")
        if v.lower() in FORBIDDEN_RESPONSE_HEADERS:
            raise ValueError(f"Header '{v}' is managed by the server and cannot be set.")
        return v

    @field_validator("value")
    @classmethod
    def _no_newlines(cls, v: str) -> str:
        if "\r" in v or "\n" in v or "\x00" in v:
            raise ValueError("Header values must not contain line breaks.")
        return v


class ScenarioIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    status_code: int = Field(default=200, ge=200, le=599)
    headers: list[HeaderPair] = Field(default_factory=list, max_length=50)
    body_type: BodyType = "json"
    body: str = Field(default="", max_length=MAX_BODY_CHARS)
    delay_ms: int = Field(default=0, ge=0, le=MAX_DELAY_MS)

    @field_validator("name")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Scenario name must not be blank.")
        return v

    @model_validator(mode="after")
    def _check_body(self) -> "ScenarioIn":
        if self.body_type == "none":
            self.body = ""
        if self.status_code in NO_BODY_STATUSES and self.body_type != "none":
            if self.body.strip():
                raise ValueError(
                    f"Status {self.status_code} cannot have a response body; "
                    "set the body type to 'none'."
                )
            self.body_type = "none"
        if self.body_type == "json" and self.body.strip():
            validate_json_template(self.body)
        return self


class ScenarioOut(ScenarioIn):
    model_config = ConfigDict(from_attributes=True)
    id: int

    # Stored data was validated on the way in; don't re-run strict checks.
    @model_validator(mode="after")
    def _check_body(self) -> "ScenarioOut":  # type: ignore[override]
        return self


def _validate_path(v: str) -> str:
    try:
        path, _ = normalize_path(v)
    except InvalidPathError as exc:
        raise ValueError(str(exc)) from exc
    return path


def _validate_scenarios(scenarios: list[ScenarioIn]) -> list[ScenarioIn]:
    names = [s.name.lower() for s in scenarios]
    if len(names) != len(set(names)):
        raise ValueError("Scenario names must be unique within an endpoint.")
    return scenarios


class FailureConfig(BaseModel):
    failure_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    failure_status: int = Field(default=500, ge=400, le=599)
    failure_body: str = Field(default="", max_length=MAX_BODY_CHARS)


class EndpointIn(FailureConfig):
    method: HttpMethod
    path: str = Field(max_length=512)
    name: str = Field(default="", max_length=120)
    description: str = Field(default="", max_length=2000)
    enabled: bool = True
    scenarios: list[ScenarioIn] = Field(min_length=1, max_length=20)
    active_scenario: str | None = None

    @field_validator("method", mode="before")
    @classmethod
    def _upper(cls, v):
        return v.upper() if isinstance(v, str) else v

    @field_validator("path")
    @classmethod
    def _path(cls, v: str) -> str:
        return _validate_path(v)

    @field_validator("scenarios")
    @classmethod
    def _scen(cls, v: list[ScenarioIn]) -> list[ScenarioIn]:
        return _validate_scenarios(v)

    @model_validator(mode="after")
    def _active(self) -> "EndpointIn":
        names = [s.name for s in self.scenarios]
        if self.active_scenario is None or self.active_scenario == "":
            self.active_scenario = names[0]
        elif self.active_scenario not in names:
            raise ValueError(f"Active scenario '{self.active_scenario}' does not exist.")
        return self


class EndpointUpdate(BaseModel):
    """Partial update. ``scenarios``, when given, replaces the whole list."""

    method: HttpMethod | None = None
    path: str | None = Field(default=None, max_length=512)
    name: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    enabled: bool | None = None
    scenarios: list[ScenarioIn] | None = Field(default=None, min_length=1, max_length=20)
    active_scenario: str | None = None
    failure_rate: float | None = Field(default=None, ge=0.0, le=1.0)
    failure_status: int | None = Field(default=None, ge=400, le=599)
    failure_body: str | None = Field(default=None, max_length=MAX_BODY_CHARS)

    @field_validator("method", mode="before")
    @classmethod
    def _upper(cls, v):
        return v.upper() if isinstance(v, str) else v

    @field_validator("path")
    @classmethod
    def _path(cls, v: str | None) -> str | None:
        return None if v is None else _validate_path(v)

    @field_validator("scenarios")
    @classmethod
    def _scen(cls, v: list[ScenarioIn] | None) -> list[ScenarioIn] | None:
        return None if v is None else _validate_scenarios(v)


class EndpointDuplicate(BaseModel):
    project_id: int | None = None
    method: HttpMethod | None = None
    path: str | None = None

    @field_validator("path")
    @classmethod
    def _path(cls, v: str | None) -> str | None:
        return None if v is None else _validate_path(v)


class EndpointOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    method: str
    path: str
    name: str
    description: str
    enabled: bool
    active_scenario: str
    failure_rate: float
    failure_status: int
    failure_body: str
    scenarios: list[ScenarioOut]
    created_at: datetime
    updated_at: datetime
    mock_path: str = ""


# ------------------------------------------------------------ import/export --


class ExportedEndpoint(EndpointIn):
    pass


class ExportedProject(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    slug: str | None = None
    description: str = Field(default="", max_length=2000)
    endpoints: list[ExportedEndpoint] = Field(default_factory=list, max_length=500)

    @field_validator("slug")
    @classmethod
    def _slug(cls, v: str | None) -> str | None:
        return _check_slug(v)


class ProjectExport(BaseModel):
    mockdock_version: int = 1
    exported_at: datetime | None = None
    project: ExportedProject


# -------------------------------------------------------------------- logs --


class LogSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    project_id: int | None
    project_slug: str
    endpoint_id: int | None
    endpoint_path: str
    method: str
    path: str
    query_string: str
    response_status: int
    duration_ms: float
    scenario_name: str
    matched: bool
    simulated_failure: bool


class LogDetail(LogSummary):
    request_headers: dict[str, str]
    request_body: str
    response_headers: dict[str, str]
    response_body: str
    client: str


class LogPage(BaseModel):
    items: list[LogSummary]
    total: int

