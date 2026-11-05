from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from .. import schemas, services
from ..db import get_db

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=list[schemas.ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    return services.list_projects(db)


@router.post("", response_model=schemas.ProjectOut, status_code=201)
def create_project(data: schemas.ProjectCreate, db: Session = Depends(get_db)):
    return services.project_out(db, services.create_project(db, data))


@router.post("/import", response_model=schemas.ProjectOut, status_code=201)
def import_project(data: schemas.ProjectExport, db: Session = Depends(get_db)):
    return services.project_out(db, services.import_project(db, data))


@router.get("/{project_id}", response_model=schemas.ProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db)):
    return services.project_out(db, services.get_project(db, project_id))


@router.patch("/{project_id}", response_model=schemas.ProjectOut)
def update_project(project_id: int, data: schemas.ProjectUpdate, db: Session = Depends(get_db)):
    project = services.get_project(db, project_id)
    return services.project_out(db, services.update_project(db, project, data))


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: int, db: Session = Depends(get_db)):
    services.delete_project(db, services.get_project(db, project_id))
    return Response(status_code=204)


@router.get("/{project_id}/export", response_model=schemas.ProjectExport)
def export_project(project_id: int, db: Session = Depends(get_db)):
    project = services.get_project(db, project_id)
    data = services.export_project(db, project)
    return Response(
        content=data.model_dump_json(indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{project.slug}.mockdock.json"'},
    )


@router.get("/{project_id}/endpoints", response_model=list[schemas.EndpointOut])
def list_endpoints(project_id: int, db: Session = Depends(get_db)):
    project = services.get_project(db, project_id)
    return [services.endpoint_out(e) for e in services.list_endpoints(db, project)]


@router.post("/{project_id}/endpoints", response_model=schemas.EndpointOut, status_code=201)
def create_endpoint(project_id: int, data: schemas.EndpointIn, db: Session = Depends(get_db)):
    project = services.get_project(db, project_id)
    return services.endpoint_out(services.create_endpoint(db, project, data))
