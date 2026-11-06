from __future__ import annotations

import re

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from .. import schemas
from ..db import get_db
from ..errors import AppError, NotFoundError
from ..models import RequestLog

router = APIRouter(prefix="/api/logs", tags=["logs"])

_STATUS_CLASS_RE = re.compile(r"^[1-5]xx$")


def _filtered(
    project_id: int | None,
    method: str | None,
    status: str | None,
    q: str | None,
    matched: bool | None,
):
    stmt = select(RequestLog)
    if project_id is not None:
        stmt = stmt.where(RequestLog.project_id == project_id)
    if method:
        stmt = stmt.where(RequestLog.method == method.upper())
    if status:
        status = status.lower()
        if _STATUS_CLASS_RE.match(status):
            base = int(status[0]) * 100
            stmt = stmt.where(RequestLog.response_status.between(base, base + 99))
        elif status.isdigit():
            stmt = stmt.where(RequestLog.response_status == int(status))
        else:
            raise AppError(422, "validation_error", "status: use e.g. '404' or '4xx'.")
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                RequestLog.path.ilike(like),
                RequestLog.endpoint_path.ilike(like),
                RequestLog.query_string.ilike(like),
                RequestLog.project_slug.ilike(like),
                RequestLog.request_body.ilike(like),
            )
        )
    if matched is not None:
        stmt = stmt.where(RequestLog.matched.is_(matched))
    return stmt


@router.get("", response_model=schemas.LogPage)
def list_logs(
    project_id: int | None = None,
    method: str | None = Query(default=None, max_length=10),
    status: str | None = Query(default=None, max_length=3),
    q: str | None = Query(default=None, max_length=200),
    matched: bool | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    stmt = _filtered(project_id, method, status, q, matched)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(
        stmt.order_by(RequestLog.id.desc()).limit(limit).offset(offset)
    ).all()
    return schemas.LogPage(
        items=[schemas.LogSummary.model_validate(i) for i in items], total=total
    )


@router.get("/{log_id}", response_model=schemas.LogDetail)
def get_log(log_id: int, db: Session = Depends(get_db)):
    log = db.get(RequestLog, log_id)
    if log is None:
        raise NotFoundError("Request log", log_id)
    return schemas.LogDetail.model_validate(log)


@router.delete("", status_code=204)
def clear_logs(project_id: int | None = None, db: Session = Depends(get_db)):
    stmt = delete(RequestLog)
    if project_id is not None:
        stmt = stmt.where(RequestLog.project_id == project_id)
    db.execute(stmt)
    db.commit()
    return Response(status_code=204)
