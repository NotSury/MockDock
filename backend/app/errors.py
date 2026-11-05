"""Consistent JSON error responses for the management API.

Every error looks like ``{"error": {"code": str, "message": str, "details": ...}}``.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    def __init__(self, status: int, code: str, message: str, details: Any = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details


class NotFoundError(AppError):
    def __init__(self, what: str, ident: object):
        super().__init__(404, "not_found", f"{what} {ident} was not found.")


class ConflictError(AppError):
    def __init__(self, message: str, details: Any = None):
        super().__init__(409, "conflict", message, details)


def error_body(code: str, message: str, details: Any = None) -> dict[str, Any]:
    body: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        body["details"] = details
    return {"error": body}


def _clean_validation_errors(errors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cleaned = []
    for err in errors:
        msg = str(err.get("msg", "Invalid value"))
        if msg.startswith("Value error, "):
            msg = msg[len("Value error, ") :]
        loc = [str(p) for p in err.get("loc", ()) if p != "body"]
        cleaned.append({"field": ".".join(loc), "message": msg})
    return cleaned


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_req: Request, exc: AppError):
        return JSONResponse(error_body(exc.code, exc.message, exc.details), status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def _validation(_req: Request, exc: RequestValidationError):
        details = _clean_validation_errors(list(exc.errors()))
        first = details[0] if details else {"field": "", "message": "Invalid request."}
        message = f"{first['field']}: {first['message']}" if first["field"] else first["message"]
        return JSONResponse(
            error_body("validation_error", message, details), status_code=422
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_req: Request, exc: StarletteHTTPException):
        code = {404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "http_error")
        return JSONResponse(
            error_body(code, str(exc.detail)),
            status_code=exc.status_code,
            headers=getattr(exc, "headers", None),
        )
