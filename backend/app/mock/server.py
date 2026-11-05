"""The live mock HTTP server.

All mock traffic lives under ``/mock/{project_slug}/...``. This router is a
catch-all *inside that prefix only*, so a user-defined route can never shadow
or reach the management API under ``/api``. Configuration is read from SQLite
on every request, which is why edits take effect immediately with no restart.
"""

from __future__ import annotations

import asyncio
import json
import random
import time
from dataclasses import dataclass, field
from typing import Any

from fastapi import APIRouter, Request, Response
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, selectinload
from starlette.concurrency import run_in_threadpool

from ..models import Endpoint, Project, RequestLog
from .matcher import Route, match_route, parse_path
from .redaction import redact_body, redact_headers
from .templating import TemplateContext, render_json, render_text

router = APIRouter(include_in_schema=False)

MOCK_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
SCENARIO_HEADER = "x-mockdock-scenario"
SCENARIO_QUERY = "__scenario"
PRUNE_EVERY = 100

# Injectable randomness so tests can force/forbid simulated failures.
rng = random.Random()


@dataclass
class ScenarioSnapshot:
    name: str
    status_code: int
    headers: list[dict[str, str]]
    body_type: str
    body: str
    delay_ms: int


@dataclass
class Resolution:
    """Everything the async handler needs, detached from the DB session."""

    project_id: int | None = None
    endpoint_id: int | None = None
    endpoint_path: str = ""
    params: dict[str, str] = field(default_factory=dict)
    scenario: ScenarioSnapshot | None = None
    failure_rate: float = 0.0
    failure_status: int = 500
    failure_body: str = ""
    # Set when MockDock itself must answer (unknown project/route, 405, ...).
    error_status: int | None = None
    error_code: str = ""
    error_message: str = ""
    allow: tuple[str, ...] = ()


def _snapshot(endpoint: Endpoint, override: str | None) -> ScenarioSnapshot | None:
    scenarios = endpoint.scenarios
    if not scenarios:
        return None
    chosen = None
    if override:
        chosen = next((s for s in scenarios if s.name.lower() == override.lower()), None)
    if chosen is None:
        chosen = next((s for s in scenarios if s.name == endpoint.active_scenario), scenarios[0])
    return ScenarioSnapshot(
        name=chosen.name,
        status_code=chosen.status_code,
        headers=list(chosen.headers or []),
        body_type=chosen.body_type,
        body=chosen.body,
        delay_ms=chosen.delay_ms,
    )


def resolve(session: Session, slug: str, method: str, path: str, override: str | None) -> Resolution:
    project = session.scalar(select(Project).where(Project.slug == slug))
    if project is None:
        return Resolution(
            error_status=404,
            error_code="project_not_found",
            error_message=f"No MockDock project with slug '{slug}'.",
        )

    endpoints = list(
        session.scalars(
            select(Endpoint)
            .where(Endpoint.project_id == project.id)
            .options(selectinload(Endpoint.scenarios))
        )
    )
    by_id = {e.id: e for e in endpoints}
    lookup_method = "GET" if method in {"HEAD", "OPTIONS"} else method

    def routes(enabled: bool) -> list[Route]:
        return [
            Route(e.id, e.method, tuple(parse_path(e.path)))
            for e in endpoints
            if e.enabled is enabled
        ]

    result = match_route(lookup_method, path, routes(True))
    if method == "OPTIONS":
        any_match = match_route("__none__", path, routes(True))
        allow = tuple(sorted(set(any_match.allowed_methods) | {"OPTIONS"}))
        if len(allow) == 1:
            return Resolution(
                project_id=project.id,
                error_status=404,
                error_code="route_not_found",
                error_message=f"No mock route matches {path}.",
            )
        return Resolution(project_id=project.id, error_status=204, allow=allow)

    if result.route is None:
        if result.allowed_methods:
            return Resolution(
                project_id=project.id,
                error_status=405,
                error_code="method_not_allowed",
                error_message=(
                    f"{method} is not configured for {path}. "
                    f"Configured methods: {', '.join(result.allowed_methods)}."
                ),
                allow=result.allowed_methods,
            )
        disabled = match_route(lookup_method, path, routes(False))
        if disabled.route is not None:
            ep = by_id[disabled.route.endpoint_id]
            return Resolution(
                project_id=project.id,
                endpoint_id=ep.id,
                endpoint_path=ep.path,
                error_status=404,
                error_code="endpoint_disabled",
                error_message=f"{ep.method} {ep.path} exists but is disabled.",
            )
        return Resolution(
            project_id=project.id,
            error_status=404,
            error_code="route_not_found",
            error_message=f"No mock route matches {method} {path} in project '{slug}'.",
        )

    endpoint = by_id[result.route.endpoint_id]
    snapshot = _snapshot(endpoint, override)
    if snapshot is None:
        return Resolution(
            project_id=project.id,
            endpoint_id=endpoint.id,
            endpoint_path=endpoint.path,
            error_status=500,
            error_code="endpoint_misconfigured",
            error_message=f"{endpoint.method} {endpoint.path} has no response scenarios.",
        )
    return Resolution(
        project_id=project.id,
        endpoint_id=endpoint.id,
        endpoint_path=endpoint.path,
        params=result.params,
        scenario=snapshot,
        failure_rate=endpoint.failure_rate,
        failure_status=endpoint.failure_status,
        failure_body=endpoint.failure_body,
    )


def _error_response(res: Resolution) -> Response:
    headers = {"X-MockDock-Error": res.error_code} if res.error_code else {}
    if res.allow:
        headers["Allow"] = ", ".join(res.allow)
    if res.error_status == 204:
        return Response(status_code=204, headers=headers)
    body = {"error": {"code": res.error_code, "message": res.error_message, "source": "mockdock"}}
    return Response(
        content=json.dumps(body),
        status_code=res.error_status or 500,
        media_type="application/json",
        headers=headers,
    )


def _looks_like_json(text: str) -> bool:
    try:
        json.loads(text)
        return True
    except ValueError:
        return False


def _build_mock_response(res: Resolution, ctx: TemplateContext, failed: bool) -> Response:
    scenario = res.scenario
    assert scenario is not None
    headers: list[tuple[str, str]] = []
    for pair in scenario.headers:
        headers.append((pair["key"], render_text(pair.get("value", ""), ctx)))
    has_ct = any(k.lower() == "content-type" for k, _ in headers)

    if failed:
        status = res.failure_status
        raw = res.failure_body.strip()
        if not raw:
            content = json.dumps(
                {"error": {"code": "simulated_failure", "message": f"Simulated {status} failure."}}
            )
            body_type = "json"
        else:
            body_type = "json" if _looks_like_json(raw) else "text"
            content = render_json(raw, ctx) if body_type == "json" else render_text(raw, ctx)
        # Don't let the scenario's content-type contradict the failure body.
        headers = [(k, v) for k, v in headers if k.lower() != "content-type"]
        has_ct = False
    else:
        status = scenario.status_code
        body_type = scenario.body_type
        if body_type == "json":
            content = render_json(scenario.body, ctx) if scenario.body.strip() else ""
        elif body_type == "text":
            content = render_text(scenario.body, ctx)
        else:
            content = ""

    if status in {204, 205, 304}:
        content = ""
    response = Response(content=content.encode("utf-8"), status_code=status)
    if content and not has_ct:
        ctype = "application/json" if body_type == "json" else "text/plain; charset=utf-8"
        response.headers["content-type"] = ctype
    for key, value in headers:
        response.headers.append(key, value)
    response.headers["X-MockDock-Scenario"] = "simulated-failure" if failed else scenario.name
    if res.endpoint_id is not None:
        response.headers["X-MockDock-Endpoint"] = str(res.endpoint_id)
    return response


def _decode_body(raw: bytes, content_type: str, limit: int) -> str:
    if not raw:
        return ""
    if content_type.startswith(("image/", "audio/", "video/", "application/octet-stream")):
        return f"[binary body: {len(raw)} bytes]"
    text = raw[:limit].decode("utf-8", errors="replace")
    if len(raw) > limit:
        text += f"\n… [truncated, {len(raw)} bytes total]"
    return text


def write_log(session_factory, retention: int, entry: dict[str, Any]) -> None:
    with session_factory() as session:
        log = RequestLog(**entry)
        session.add(log)
        session.commit()
        if log.id % PRUNE_EVERY == 0:
            newest = session.scalar(select(func.max(RequestLog.id))) or 0
            session.execute(delete(RequestLog).where(RequestLog.id <= newest - retention))
            session.commit()


@router.api_route("/mock/{project_slug}", methods=MOCK_METHODS)
@router.api_route("/mock/{project_slug}/{path:path}", methods=MOCK_METHODS)
async def handle_mock(request: Request, project_slug: str, path: str = "") -> Response:
    started = time.perf_counter()
    settings = request.app.state.settings
    session_factory = request.app.state.session_factory
    method = request.method.upper()
    req_path = "/" + path

    raw_body = await request.body()
    content_type = request.headers.get("content-type", "")
    override = request.headers.get(SCENARIO_HEADER) or request.query_params.get(SCENARIO_QUERY)

    failed = False
    if len(raw_body) > settings.max_request_body_bytes:
        res = Resolution(
            error_status=413,
            error_code="payload_too_large",
            error_message=f"Request body exceeds {settings.max_request_body_bytes} bytes.",
        )
    else:

        def _resolve() -> Resolution:
            with session_factory() as session:
                return resolve(session, project_slug, method, req_path, override)

        res = await run_in_threadpool(_resolve)

    if res.error_status is not None:
        response = _error_response(res)
    else:
        parsed_body: Any = None
        if raw_body and "json" in content_type:
            try:
                parsed_body = json.loads(raw_body)
            except ValueError:
                parsed_body = None
        ctx = TemplateContext(
            params=res.params,
            query={k: v for k, v in request.query_params.items() if k != SCENARIO_QUERY},
            headers={k.lower(): v for k, v in request.headers.items()},
            body=parsed_body,
        )
        failed = res.failure_rate > 0 and rng.random() < res.failure_rate
        assert res.scenario is not None
        delay = min(res.scenario.delay_ms, settings.max_delay_ms)
        if delay > 0:
            await asyncio.sleep(delay / 1000)
        response = _build_mock_response(res, ctx, failed)
        if method == "HEAD":
            response.body = b""

    duration_ms = round((time.perf_counter() - started) * 1000, 2)
    if method != "OPTIONS":
        response.headers["X-MockDock-Duration"] = f"{duration_ms}ms"

    limit = settings.max_logged_body_bytes
    response_text = _decode_body(
        bytes(response.body or b""), response.headers.get("content-type", ""), limit
    )
    entry = {
        "project_id": res.project_id,
        "project_slug": project_slug[:64],
        "endpoint_id": res.endpoint_id,
        "endpoint_path": res.endpoint_path,
        "method": method,
        "path": req_path[:2048],
        "query_string": request.url.query,
        "request_headers": redact_headers(dict(request.headers)),
        "request_body": redact_body(_decode_body(raw_body, content_type, limit)),
        "response_status": response.status_code,
        "response_headers": redact_headers(dict(response.headers)),
        "response_body": response_text,
        "duration_ms": duration_ms,
        "scenario_name": ("simulated-failure" if failed else res.scenario.name) if res.scenario else "",
        "matched": res.scenario is not None,
        "simulated_failure": failed,
        "client": (request.client.host if request.client else "")[:64],
    }
    await run_in_threadpool(write_log, session_factory, settings.log_retention, entry)
    return response
