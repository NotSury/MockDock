"""Tiny, safe response templating.

Mock bodies may contain placeholders such as ``{{params.id}}``. Supported
expressions (no code execution — only lookups in request data):

* ``params.<name>``   route parameter, e.g. ``/users/:id``
* ``query.<name>``    query-string value
* ``headers.<name>``  request header (case-insensitive)
* ``body.<a>.<b>``    field from a JSON request body (``.0`` indexes lists)
* ``now``             current UTC time (ISO 8601)
* ``timestamp``       current Unix time in milliseconds
* ``uuid``            a random UUID4

Inside JSON bodies a placeholder that sits *inside* a string literal is
inserted as escaped string content; a *bare* placeholder (outside quotes)
is inserted as a JSON value, so ``{"id": {{params.id}}}`` renders
``{"id": 42}``. Unknown values render as ``""`` inside strings and ``null``
when bare. Unrecognised placeholders (e.g. ``{{ and }}``) are left untouched.
"""

from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

PLACEHOLDER_RE = re.compile(r"\{\{\s*([A-Za-z_][A-Za-z0-9_\-.]*)\s*\}\}")
_NUMBER_RE = re.compile(r"^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$")

_MISSING = object()
_ROOTS = {"params", "query", "headers", "body"}
_BUILTINS = {"now", "timestamp", "uuid"}


def is_known(expr: str) -> bool:
    """Only recognised expressions are substituted; anything else is left as-is."""
    root, _, rest = expr.partition(".")
    return expr in _BUILTINS or (root in _ROOTS and bool(rest))


@dataclass
class TemplateContext:
    params: dict[str, str] = field(default_factory=dict)
    query: dict[str, str] = field(default_factory=dict)
    headers: dict[str, str] = field(default_factory=dict)  # lower-cased keys
    body: Any = None

    def resolve(self, expr: str) -> Any:
        if expr == "now":
            return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        if expr == "timestamp":
            return int(datetime.now(timezone.utc).timestamp() * 1000)
        if expr == "uuid":
            return str(uuid.uuid4())
        root, _, rest = expr.partition(".")
        if not rest:
            return _MISSING
        if root == "params":
            return self.params.get(rest, _MISSING)
        if root == "query":
            return self.query.get(rest, _MISSING)
        if root == "headers":
            return self.headers.get(rest.lower(), _MISSING)
        if root == "body":
            value: Any = self.body
            for key in rest.split("."):
                if isinstance(value, dict) and key in value:
                    value = value[key]
                elif isinstance(value, list) and key.isdigit() and int(key) < len(value):
                    value = value[int(key)]
                else:
                    return _MISSING
            return value
        return _MISSING


def _as_text(value: Any) -> str:
    if value is _MISSING or value is None:
        return ""
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False)


def _as_json_value(value: Any) -> str:
    if value is _MISSING:
        return "null"
    if isinstance(value, str) and _NUMBER_RE.match(value):
        return value
    if isinstance(value, str) and value in {"true", "false", "null"}:
        return value
    return json.dumps(value, ensure_ascii=False)


def render_text(template: str, ctx: TemplateContext) -> str:
    if "{{" not in template:
        return template
    return PLACEHOLDER_RE.sub(
        lambda m: _as_text(ctx.resolve(m.group(1))) if is_known(m.group(1)) else m.group(0),
        template,
    )


def _iter_json_placeholders(source: str):
    """Yield ``(start, end, expr, inside_string)`` for each placeholder."""
    in_string = False
    escaped = False
    i = 0
    n = len(source)
    while i < n:
        ch = source[i]
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
                i += 1
                continue
        elif ch == '"':
            in_string = True
            i += 1
            continue
        if ch == "{" and source.startswith("{{", i):
            m = PLACEHOLDER_RE.match(source, i)
            if m and is_known(m.group(1)):
                yield m.start(), m.end(), m.group(1), in_string
                i = m.end()
                continue
        i += 1


def render_json(template: str, ctx: TemplateContext) -> str:
    if "{{" not in template:
        return template
    out: list[str] = []
    last = 0
    for start, end, expr, inside in _iter_json_placeholders(template):
        out.append(template[last:start])
        value = ctx.resolve(expr)
        if inside:
            out.append(json.dumps(_as_text(value), ensure_ascii=False)[1:-1])
        else:
            out.append(_as_json_value(value))
        last = end
    out.append(template[last:])
    return "".join(out)


def validate_json_template(template: str) -> None:
    """Raise ``ValueError`` if the body is not valid JSON (placeholders allowed)."""
    if "{{" in template:
        parts: list[str] = []
        last = 0
        for start, end, _expr, inside in _iter_json_placeholders(template):
            parts.append(template[last:start])
            parts.append("x" if inside else "0")
            last = end
        parts.append(template[last:])
        candidate = "".join(parts)
    else:
        candidate = template
    try:
        json.loads(candidate)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON: {exc.msg} (line {exc.lineno}, column {exc.colno})") from exc
