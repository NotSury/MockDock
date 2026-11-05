"""Redaction of credentials before requests are written to the log."""

from __future__ import annotations

import json
import re
from typing import Any

REDACTED = "[REDACTED]"

SENSITIVE_HEADERS = frozenset(
    {
        "authorization",
        "proxy-authorization",
        "cookie",
        "set-cookie",
        "x-api-key",
        "api-key",
        "x-auth-token",
        "x-access-token",
        "x-csrf-token",
        "x-xsrf-token",
        "x-amz-security-token",
    }
)

_SENSITIVE_KEY_RE = re.compile(
    r"(pass(word|wd)?|secret|token|api[_-]?key|credential|private[_-]?key|ssn|card[_-]?number|cvv)",
    re.IGNORECASE,
)


def redact_header_value(name: str, value: str) -> str:
    lname = name.lower()
    if lname not in SENSITIVE_HEADERS:
        return value
    if lname in {"authorization", "proxy-authorization"}:
        scheme, sep, _ = value.partition(" ")
        if sep and scheme:
            return f"{scheme} {REDACTED}"
    return REDACTED


def redact_headers(headers: dict[str, str]) -> dict[str, str]:
    return {k: redact_header_value(k, v) for k, v in headers.items()}


def _redact_obj(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {
            k: (REDACTED if isinstance(k, str) and _SENSITIVE_KEY_RE.search(k) else _redact_obj(v))
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [_redact_obj(v) for v in obj]
    return obj


def redact_body(body: str) -> str:
    """Mask sensitive fields in JSON bodies; other bodies are kept as-is."""
    stripped = body.lstrip()
    if not stripped or stripped[0] not in "[{":
        return body
    try:
        parsed = json.loads(body)
    except ValueError:
        return body
    return json.dumps(_redact_obj(parsed), ensure_ascii=False, indent=2)
