"""Business logic for projects and endpoints, shared by the API routers."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from . import schemas
from .errors import AppError, ConflictError, NotFoundError
from .mock.matcher import normalize_path
from .models import Endpoint, Project, RequestLog, Scenario


# ---------------------------------------------------------------- projects --


def get_project(db: Session, project_id: int) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise NotFoundError("Project", project_id)
    return project


def project_out(db: Session, project: Project) -> schemas.ProjectOut:
    endpoint_count = db.scalar(
        select(func.count(Endpoint.id)).where(Endpoint.project_id == project.id)
    )
    request_count = db.scalar(
        select(func.count(RequestLog.id)).where(RequestLog.project_id == project.id)
    )
    out = schemas.ProjectOut.model_validate(project)
    out.endpoint_count = endpoint_count or 0
    out.request_count = request_count or 0
    out.mock_base_path = f"/mock/{project.slug}"
    return out


def list_projects(db: Session) -> list[schemas.ProjectOut]:
    endpoint_counts = dict(
        db.execute(select(Endpoint.project_id, func.count(Endpoint.id)).group_by(Endpoint.project_id)).all()
    )
    request_counts = dict(
        db.execute(
            select(RequestLog.project_id, func.count(RequestLog.id)).group_by(RequestLog.project_id)
        ).all()
    )
    result = []
    for project in db.scalars(select(Project).order_by(Project.created_at, Project.id)):
        out = schemas.ProjectOut.model_validate(project)
        out.endpoint_count = endpoint_counts.get(project.id, 0)
        out.request_count = request_counts.get(project.id, 0)
        out.mock_base_path = f"/mock/{project.slug}"
        result.append(out)
    return result


def _slug_taken(db: Session, slug: str, exclude_id: int | None = None) -> bool:
    stmt = select(Project.id).where(Project.slug == slug)
    if exclude_id is not None:
        stmt = stmt.where(Project.id != exclude_id)
    return db.scalar(stmt) is not None


def unique_slug(db: Session, base: str) -> str:
    slug = base
    n = 2
    while _slug_taken(db, slug):
        suffix = f"-{n}"
        slug = base[: 48 - len(suffix)].rstrip("-") + suffix
        n += 1
    return slug


def create_project(db: Session, data: schemas.ProjectCreate) -> Project:
    if data.slug:
        if _slug_taken(db, data.slug):
            raise ConflictError(f"A project with slug '{data.slug}' already exists.")
        slug = data.slug
    else:
        slug = unique_slug(db, schemas.slugify(data.name))
    project = Project(name=data.name, slug=slug, description=data.description)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def update_project(db: Session, project: Project, data: schemas.ProjectUpdate) -> Project:
    if data.slug is not None and data.slug != project.slug:
        if _slug_taken(db, data.slug, exclude_id=project.id):
            raise ConflictError(f"A project with slug '{data.slug}' already exists.")
        project.slug = data.slug
    if data.name is not None:
        name = data.name.strip()
        if not name:
            raise AppError(422, "validation_error", "name: Name must not be blank.")
        project.name = name
    if data.description is not None:
        project.description = data.description
    db.commit()
    db.refresh(project)
    return project


def delete_project(db: Session, project: Project) -> None:
    db.delete(project)
    db.commit()


# --------------------------------------------------------------- endpoints --


def get_endpoint(db: Session, endpoint_id: int) -> Endpoint:
    endpoint = db.scalar(
        select(Endpoint)
        .where(Endpoint.id == endpoint_id)
        .options(selectinload(Endpoint.scenarios), selectinload(Endpoint.project))
    )
    if endpoint is None:
        raise NotFoundError("Endpoint", endpoint_id)
    return endpoint


def endpoint_out(endpoint: Endpoint) -> schemas.EndpointOut:
    out = schemas.EndpointOut.model_validate(endpoint)
    out.mock_path = f"/mock/{endpoint.project.slug}{'' if endpoint.path == '/' else endpoint.path}"
    return out


def list_endpoints(db: Session, project: Project) -> list[Endpoint]:
    return list(
        db.scalars(
            select(Endpoint)
            .where(Endpoint.project_id == project.id)
            .options(selectinload(Endpoint.scenarios), selectinload(Endpoint.project))
            .order_by(Endpoint.path, Endpoint.method)
        )
    )


def _find_conflict(
    db: Session, project_id: int, method: str, key: str, exclude_id: int | None = None
) -> Endpoint | None:
    stmt = select(Endpoint).where(
        Endpoint.project_id == project_id, Endpoint.method == method, Endpoint.route_key == key
    )
    if exclude_id is not None:
        stmt = stmt.where(Endpoint.id != exclude_id)
    return db.scalar(stmt)


def _raise_conflict(existing: Endpoint) -> None:
    raise ConflictError(
        f"{existing.method} {existing.path} already exists in this project.",
        {"endpoint_id": existing.id},
    )


def _scenarios_from(items: list[schemas.ScenarioIn]) -> list[Scenario]:
    return [
        Scenario(
            position=i,
            name=s.name,
            status_code=s.status_code,
            headers=[h.model_dump() for h in s.headers],
            body_type=s.body_type,
            body=s.body,
            delay_ms=s.delay_ms,
        )
        for i, s in enumerate(items)
    ]


def _commit_endpoint(db: Session, endpoint: Endpoint) -> Endpoint:
    try:
        db.commit()
    except IntegrityError as exc:  # race on the unique constraint
        db.rollback()
        raise ConflictError("An endpoint with this method and path already exists.") from exc
    return get_endpoint(db, endpoint.id)


def create_endpoint(db: Session, project: Project, data: schemas.EndpointIn) -> Endpoint:
    path, key = normalize_path(data.path)
    existing = _find_conflict(db, project.id, data.method, key)
    if existing:
        _raise_conflict(existing)
    endpoint = Endpoint(
        project_id=project.id,
        method=data.method,
        path=path,
        route_key=key,
        name=data.name.strip(),
        description=data.description,
        enabled=data.enabled,
        active_scenario=data.active_scenario or data.scenarios[0].name,
        failure_rate=data.failure_rate,
        failure_status=data.failure_status,
        failure_body=data.failure_body,
        scenarios=_scenarios_from(data.scenarios),
    )
    db.add(endpoint)
    project.updated_at = datetime.now(timezone.utc)
    return _commit_endpoint(db, endpoint)


def update_endpoint(db: Session, endpoint: Endpoint, data: schemas.EndpointUpdate) -> Endpoint:
    fields = data.model_dump(exclude_unset=True)
    method = fields.get("method") or endpoint.method
    if "path" in fields and fields["path"] is not None:
        path, key = normalize_path(fields["path"])
    else:
        path, key = endpoint.path, endpoint.route_key
    if method != endpoint.method or key != endpoint.route_key:
        existing = _find_conflict(db, endpoint.project_id, method, key, exclude_id=endpoint.id)
        if existing:
            _raise_conflict(existing)
    endpoint.method, endpoint.path, endpoint.route_key = method, path, key

    for attr in ("name", "description", "enabled", "failure_rate", "failure_status", "failure_body"):
        if fields.get(attr) is not None:
            setattr(endpoint, attr, fields[attr])

    if data.scenarios is not None:
        # Replace the list; flush deletes first so unique names can be reused.
        endpoint.scenarios.clear()
        db.flush()
        endpoint.scenarios.extend(_scenarios_from(data.scenarios))

    names = [s.name for s in endpoint.scenarios]
    if data.active_scenario:
        if data.active_scenario not in names:
            raise AppError(
                422,
                "validation_error",
                f"active_scenario: Scenario '{data.active_scenario}' does not exist.",
            )
        endpoint.active_scenario = data.active_scenario
    elif endpoint.active_scenario not in names and names:
        endpoint.active_scenario = names[0]

    endpoint.updated_at = datetime.now(timezone.utc)
    endpoint.project.updated_at = endpoint.updated_at
    return _commit_endpoint(db, endpoint)


def delete_endpoint(db: Session, endpoint: Endpoint) -> None:
    db.delete(endpoint)
    db.commit()


def endpoint_to_input(endpoint: Endpoint) -> schemas.EndpointIn:
    return schemas.EndpointIn(
        method=endpoint.method,  # type: ignore[arg-type]
        path=endpoint.path,
        name=endpoint.name,
        description=endpoint.description,
        enabled=endpoint.enabled,
        active_scenario=endpoint.active_scenario,
        failure_rate=endpoint.failure_rate,
        failure_status=endpoint.failure_status,
        failure_body=endpoint.failure_body,
        scenarios=[
            schemas.ScenarioIn(
                name=s.name,
                status_code=s.status_code,
                headers=[schemas.HeaderPair(**h) for h in s.headers],
                body_type=s.body_type,  # type: ignore[arg-type]
                body=s.body,
                delay_ms=s.delay_ms,
            )
            for s in endpoint.scenarios
        ],
    )


def _copy_path(db: Session, project_id: int, method: str, path: str) -> str:
    """Find a free path like ``/users-copy`` or ``/users/:id/copy-2``."""
    base = path.rstrip("/")
    last = base.rsplit("/", 1)[-1]
    n = 1
    while True:
        tag = "copy" if n == 1 else f"copy-{n}"
        if base == "" or last.startswith(":"):
            candidate = f"{base}/{tag}"
        else:
            candidate = f"{base}-{tag}"
        _, key = normalize_path(candidate)
        if not _find_conflict(db, project_id, method, key):
            return candidate
        n += 1


def duplicate_endpoint(
    db: Session, endpoint: Endpoint, data: schemas.EndpointDuplicate
) -> Endpoint:
    target = get_project(db, data.project_id) if data.project_id else endpoint.project
    payload = endpoint_to_input(endpoint)
    payload.method = data.method or payload.method
    if data.path:
        payload.path = data.path
    else:
        _, key = normalize_path(payload.path)
        if _find_conflict(db, target.id, payload.method, key):
            payload.path = _copy_path(db, target.id, payload.method, payload.path)
    if endpoint.name and target.id == endpoint.project_id:
        payload.name = f"{endpoint.name} (copy)"[:120]
    return create_endpoint(db, target, payload)


# ------------------------------------------------------------ import/export --


def export_project(db: Session, project: Project) -> schemas.ProjectExport:
    return schemas.ProjectExport(
        mockdock_version=1,
        exported_at=datetime.now(timezone.utc),
        project=schemas.ExportedProject(
            name=project.name,
            slug=project.slug,
            description=project.description,
            endpoints=[
                schemas.ExportedEndpoint(**endpoint_to_input(e).model_dump())
                for e in list_endpoints(db, project)
            ],
        ),
    )


def import_project(db: Session, data: schemas.ProjectExport) -> Project:
    if data.mockdock_version != 1:
        raise AppError(
            422, "unsupported_version", f"Unsupported export version {data.mockdock_version}."
        )
    keys = set()
    for ep in data.project.endpoints:
        _, key = normalize_path(ep.path)
        if (ep.method, key) in keys:
            raise ConflictError(f"The import contains {ep.method} {ep.path} more than once.")
        keys.add((ep.method, key))

    base = data.project.slug or schemas.slugify(data.project.name)
    project = Project(
        name=data.project.name.strip(),
        slug=unique_slug(db, base),
        description=data.project.description,
    )
    for ep in data.project.endpoints:
        path, key = normalize_path(ep.path)
        project.endpoints.append(
            Endpoint(
                method=ep.method,
                path=path,
                route_key=key,
                name=ep.name,
                description=ep.description,
                enabled=ep.enabled,
                active_scenario=ep.active_scenario or ep.scenarios[0].name,
                failure_rate=ep.failure_rate,
                failure_status=ep.failure_status,
                failure_body=ep.failure_body,
                scenarios=_scenarios_from(ep.scenarios),
            )
        )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project
