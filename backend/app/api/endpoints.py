from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from .. import schemas, services
from ..db import get_db

router = APIRouter(prefix="/api/endpoints", tags=["endpoints"])


@router.get("/{endpoint_id}", response_model=schemas.EndpointOut)
def get_endpoint(endpoint_id: int, db: Session = Depends(get_db)):
    return services.endpoint_out(services.get_endpoint(db, endpoint_id))


@router.patch("/{endpoint_id}", response_model=schemas.EndpointOut)
def update_endpoint(endpoint_id: int, data: schemas.EndpointUpdate, db: Session = Depends(get_db)):
    endpoint = services.get_endpoint(db, endpoint_id)
    return services.endpoint_out(services.update_endpoint(db, endpoint, data))


@router.delete("/{endpoint_id}", status_code=204)
def delete_endpoint(endpoint_id: int, db: Session = Depends(get_db)):
    services.delete_endpoint(db, services.get_endpoint(db, endpoint_id))
    return Response(status_code=204)


@router.post("/{endpoint_id}/duplicate", response_model=schemas.EndpointOut, status_code=201)
def duplicate_endpoint(
    endpoint_id: int,
    data: schemas.EndpointDuplicate | None = None,
    db: Session = Depends(get_db),
):
    endpoint = services.get_endpoint(db, endpoint_id)
    return services.endpoint_out(
        services.duplicate_endpoint(db, endpoint, data or schemas.EndpointDuplicate())
    )
