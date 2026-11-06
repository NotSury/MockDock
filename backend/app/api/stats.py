"""Aggregated numbers for the dashboard."""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import schemas
from ..db import get_db
from ..models import Endpoint, Project, RequestLog

router = APIRouter(prefix="/api/stats", tags=["stats"])

RANGES: dict[str, tuple[timedelta, timedelta]] = {
    # range -> (window, bucket size)
    "1h": (timedelta(hours=1), timedelta(minutes=2)),
    "24h": (timedelta(hours=24), timedelta(hours=1)),
    "7d": (timedelta(days=7), timedelta(hours=6)),
}


class Bucket(BaseModel):
    start: datetime
    total: int
    s2xx: int
    s3xx: int
    s4xx: int
    s5xx: int


class TopEndpoint(BaseModel):
    endpoint_id: int
    method: str
    path: str
    project_slug: str
    hits: int


class Stats(BaseModel):
    range: str
    projects: int
    endpoints: int
    enabled_endpoints: int
    requests_total: int
    requests_in_range: int
    avg_latency_ms: float
    p95_latency_ms: float
    error_rate: float
    unmatched: int
    status_classes: dict[str, int]
    methods: dict[str, int]
    timeline: list[Bucket]
    top_endpoints: list[TopEndpoint]
    recent: list[schemas.LogSummary]


def _as_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


@router.get("", response_model=Stats)
def get_stats(
    range_: Literal["1h", "24h", "7d"] = Query(default="24h", alias="range"),
    project_id: int | None = None,
    db: Session = Depends(get_db),
):
    window, step = RANGES[range_]
    now = datetime.now(timezone.utc)
    since = now - window

    ep_q = select(func.count(Endpoint.id))
    en_q = select(func.count(Endpoint.id)).where(Endpoint.enabled.is_(True))
    total_q = select(func.count(RequestLog.id))
    logs_q = select(RequestLog).where(RequestLog.created_at >= since)
    if project_id is not None:
        ep_q = ep_q.where(Endpoint.project_id == project_id)
        en_q = en_q.where(Endpoint.project_id == project_id)
        total_q = total_q.where(RequestLog.project_id == project_id)
        logs_q = logs_q.where(RequestLog.project_id == project_id)

    logs = db.scalars(logs_q.order_by(RequestLog.id)).all()

    # Bucket boundaries aligned to the step so the chart doesn't jitter.
    step_s = int(step.total_seconds())
    last = datetime.fromtimestamp((int(now.timestamp()) // step_s) * step_s, timezone.utc)
    n_buckets = int(window / step)
    starts = [last - step * (n_buckets - 1 - i) for i in range(n_buckets)]
    buckets = [dict(start=s, total=0, s2xx=0, s3xx=0, s4xx=0, s5xx=0) for s in starts]

    classes: Counter[str] = Counter({"2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0})
    methods: Counter[str] = Counter()
    hits: Counter[int] = Counter()
    latencies: list[float] = []
    unmatched = 0
    for log in logs:
        cls = f"{log.response_status // 100}xx"
        classes[cls] += 1
        methods[log.method] += 1
        latencies.append(log.duration_ms)
        if not log.matched:
            unmatched += 1
        if log.endpoint_id and log.matched:
            hits[log.endpoint_id] += 1
        idx = int((_as_utc(log.created_at) - starts[0]) / step)
        if 0 <= idx < n_buckets:
            b = buckets[idx]
            b["total"] += 1
            key = f"s{cls}"
            if key in b:
                b[key] += 1

    top: list[TopEndpoint] = []
    if hits:
        eps = {
            e.id: e
            for e in db.scalars(select(Endpoint).where(Endpoint.id.in_(list(hits))))
        }
        slugs = dict(db.execute(select(Project.id, Project.slug)).all())
        for eid, count in hits.most_common(6):
            e = eps.get(eid)
            if e:
                top.append(
                    TopEndpoint(
                        endpoint_id=eid,
                        method=e.method,
                        path=e.path,
                        project_slug=slugs.get(e.project_id, ""),
                        hits=count,
                    )
                )

    recent_q = select(RequestLog).order_by(RequestLog.id.desc()).limit(8)
    if project_id is not None:
        recent_q = recent_q.where(RequestLog.project_id == project_id)

    latencies.sort()
    n = len(latencies)
    errors = classes["4xx"] + classes["5xx"]
    return Stats(
        range=range_,
        projects=db.scalar(select(func.count(Project.id))) or 0,
        endpoints=db.scalar(ep_q) or 0,
        enabled_endpoints=db.scalar(en_q) or 0,
        requests_total=db.scalar(total_q) or 0,
        requests_in_range=n,
        avg_latency_ms=round(sum(latencies) / n, 2) if n else 0.0,
        p95_latency_ms=round(latencies[min(n - 1, int(n * 0.95))], 2) if n else 0.0,
        error_rate=round(errors / n, 4) if n else 0.0,
        unmatched=unmatched,
        status_classes=dict(classes),
        methods=dict(methods),
        timeline=[Bucket(**b) for b in buckets],
        top_endpoints=top,
        recent=[schemas.LogSummary.model_validate(r) for r in db.scalars(recent_q)],
    )
