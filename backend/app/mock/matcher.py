"""Pure functions for validating and matching mock route paths.

A route path is a list of segments. A segment is either *static*
(``users``) or a *parameter* (``:id`` — ``{id}`` is accepted on input and
normalised to ``:id``). Matching picks the most specific route: at the first
position where two candidates differ, a static segment beats a parameter.
So ``/users/me`` wins over ``/users/:id`` for the request ``/users/me``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import unquote

HTTP_METHODS = ("GET", "POST", "PUT", "PATCH", "DELETE")

_STATIC_RE = re.compile(r"^[A-Za-z0-9._~\-@!$&'()+,;=]+$")
_PARAM_RE = re.compile(r"^(?::([A-Za-z_][A-Za-z0-9_]*)|\{([A-Za-z_][A-Za-z0-9_]*)\})$")
MAX_PATH_LENGTH = 512


class InvalidPathError(ValueError):
    pass


@dataclass(frozen=True)
class Segment:
    value: str
    is_param: bool


def parse_path(raw: str) -> list[Segment]:
    """Validate a user-supplied route path and split it into segments."""
    if not isinstance(raw, str):
        raise InvalidPathError("Path must be a string.")
    path = raw.strip()
    if not path:
        raise InvalidPathError("Path is required.")
    if not path.startswith("/"):
        path = "/" + path
    if len(path) > MAX_PATH_LENGTH:
        raise InvalidPathError(f"Path must be at most {MAX_PATH_LENGTH} characters.")
    if "?" in path or "#" in path:
        raise InvalidPathError("Path must not contain a query string or fragment.")
    if "//" in path:
        raise InvalidPathError("Path must not contain empty segments ('//').")

    segments: list[Segment] = []
    seen_params: set[str] = set()
    for part in path.strip("/").split("/"):
        if part == "":
            continue  # the root path "/"
        if part in {".", ".."}:
            raise InvalidPathError("Path must not contain '.' or '..' segments.")
        param = _PARAM_RE.match(part)
        if param:
            name = param.group(1) or param.group(2)
            if name in seen_params:
                raise InvalidPathError(f"Duplicate route parameter ':{name}'.")
            seen_params.add(name)
            segments.append(Segment(name, True))
        elif ":" in part or "{" in part or "}" in part:
            raise InvalidPathError(
                f"Invalid segment '{part}'. Parameters look like ':id' or '{{id}}'."
            )
        elif _STATIC_RE.match(part):
            segments.append(Segment(part, False))
        else:
            raise InvalidPathError(f"Segment '{part}' contains unsupported characters.")
    return segments


def format_path(segments: list[Segment]) -> str:
    """Canonical display form, e.g. ``/users/:id``."""
    return "/" + "/".join(f":{s.value}" if s.is_param else s.value for s in segments)


def route_key(segments: list[Segment]) -> str:
    """Shape of a route, ignoring parameter names (used for duplicate checks)."""
    return "/" + "/".join(":" if s.is_param else s.value for s in segments)


def normalize_path(raw: str) -> tuple[str, str]:
    """Return ``(canonical_path, route_key)`` for a user-supplied path."""
    segments = parse_path(raw)
    return format_path(segments), route_key(segments)


@dataclass(frozen=True)
class Route:
    endpoint_id: int
    method: str
    segments: tuple[Segment, ...]


@dataclass(frozen=True)
class MatchResult:
    route: Route | None
    params: dict[str, str]
    # Methods configured for this path (used to build a 405 + Allow header).
    allowed_methods: tuple[str, ...]


def _match_segments(route: Route, parts: list[str]) -> dict[str, str] | None:
    if len(route.segments) != len(parts):
        return None
    params: dict[str, str] = {}
    for seg, part in zip(route.segments, parts):
        if seg.is_param:
            params[seg.value] = part
        elif seg.value != part:
            return None
    return params


def _specificity(route: Route) -> tuple[int, ...]:
    # Static segments sort before params, position by position.
    return tuple(0 if s.is_param else 1 for s in route.segments)


def split_request_path(path: str) -> list[str]:
    return [unquote(p) for p in path.strip("/").split("/") if p != ""]


def match_route(method: str, path: str, routes: list[Route]) -> MatchResult:
    parts = split_request_path(path)
    candidates: list[tuple[Route, dict[str, str]]] = []
    for route in routes:
        params = _match_segments(route, parts)
        if params is not None:
            candidates.append((route, params))

    if not candidates:
        return MatchResult(None, {}, ())

    method = method.upper()
    same_method = [c for c in candidates if c[0].method == method]
    if same_method:
        route, params = max(same_method, key=lambda c: _specificity(c[0]))
        return MatchResult(route, params, ())

    allowed = tuple(sorted({c[0].method for c in candidates}))
    return MatchResult(None, {}, allowed)
