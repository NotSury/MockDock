from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from .. import __version__, schemas, services
from ..db import get_db
from ..seed import create_sample_project

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/health")
def health():
    return {"status": "ok", "version": __version__}


@router.get("/info")
def info(request: Request):
    base = str(request.base_url).rstrip("/")
    return {
        "name": "MockDock",
        "version": __version__,
        "mock_base_url": f"{base}/mock",
        "scenario_header": "X-MockDock-Scenario",
    }


@router.post("/sample", response_model=schemas.ProjectOut, status_code=201)
def restore_sample(db: Session = Depends(get_db)):
    """Re-create the Acme Shop sample (with a fresh slug if 'shop' is taken)."""
    return services.project_out(db, create_sample_project(db))
