"""The sample "Acme Shop" e-commerce project seeded on first start."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import schemas, services
from .models import Meta, Project

SAMPLE_SLUG = "shop"
SEEDED_FLAG = "sample_seeded"

PRODUCTS = [
    {
        "id": 101,
        "sku": "ACM-KB-01",
        "name": "Aurora Mechanical Keyboard",
        "category": "peripherals",
        "price": 129.0,
        "currency": "USD",
        "stock": 42,
        "rating": 4.7,
        "tags": ["wireless", "hot-swap"],
    },
    {
        "id": 102,
        "sku": "ACM-MS-02",
        "name": "Drift Ergonomic Mouse",
        "category": "peripherals",
        "price": 59.5,
        "currency": "USD",
        "stock": 118,
        "rating": 4.5,
        "tags": ["ergonomic"],
    },
    {
        "id": 103,
        "sku": "ACM-MN-27",
        "name": "Lumen 27\" 4K Monitor",
        "category": "displays",
        "price": 449.0,
        "currency": "USD",
        "stock": 9,
        "rating": 4.8,
        "tags": ["4k", "usb-c"],
    },
    {
        "id": 104,
        "sku": "ACM-HD-03",
        "name": "Echo Studio Headphones",
        "category": "audio",
        "price": 199.99,
        "currency": "USD",
        "stock": 0,
        "rating": 4.3,
        "tags": ["noise-cancelling"],
    },
]

USERS = [
    {"id": 1, "name": "Alice Moreno", "email": "alice@example.com", "role": "admin", "joined": "2024-02-11"},
    {"id": 2, "name": "Bob Okafor", "email": "bob@example.com", "role": "customer", "joined": "2024-06-03"},
    {"id": 3, "name": "Chen Wei", "email": "chen@example.com", "role": "customer", "joined": "2025-01-19"},
]

ORDERS = [
    {
        "id": "ord_5001",
        "user_id": 2,
        "status": "shipped",
        "items": [{"product_id": 101, "quantity": 1, "unit_price": 129.0}],
        "total": 129.0,
        "created_at": "2026-10-28T14:12:00Z",
    },
    {
        "id": "ord_5002",
        "user_id": 3,
        "status": "processing",
        "items": [
            {"product_id": 102, "quantity": 2, "unit_price": 59.5},
            {"product_id": 103, "quantity": 1, "unit_price": 449.0},
        ],
        "total": 568.0,
        "created_at": "2026-11-02T09:40:00Z",
    },
]


def _j(value: Any) -> str:
    return json.dumps(value, indent=2, ensure_ascii=False)


def _err(code: str, message: str) -> str:
    return _j({"error": {"code": code, "message": message}})


def _s(name: str, status: int = 200, body: Any = None, *, delay: int = 0, text: str | None = None,
       headers: list[tuple[str, str]] | None = None) -> dict[str, Any]:
    if text is not None:
        body_type, raw = "json", text
    elif body is None:
        body_type, raw = "none", ""
    else:
        body_type, raw = "json", _j(body)
    return {
        "name": name,
        "status_code": status,
        "body_type": body_type,
        "body": raw,
        "delay_ms": delay,
        "headers": [{"key": k, "value": v} for k, v in (headers or [])],
    }


def sample_endpoints() -> list[dict[str, Any]]:
    product_template = (
        '{\n  "id": {{params.id}},\n  "sku": "ACM-{{params.id}}",\n'
        '  "name": "Aurora Mechanical Keyboard",\n  "price": 129.0,\n'
        '  "currency": "USD",\n  "stock": 42,\n  "fetched_at": "{{now}}"\n}'
    )
    return [
        # ------------------------------------------------------- products --
        {
            "method": "GET", "path": "/products", "name": "List products",
            "description": "Paginated product catalogue. Try ?page=2.",
            "scenarios": [
                _s("Success", 200, {"data": PRODUCTS, "page": 1, "per_page": 20, "total": len(PRODUCTS)},
                   headers=[("Cache-Control", "max-age=60"), ("X-Total-Count", str(len(PRODUCTS)))]),
                _s("Empty catalogue", 200, {"data": [], "page": 1, "per_page": 20, "total": 0}),
                _s("Slow network", 200, {"data": PRODUCTS[:2], "page": 1, "per_page": 20, "total": 2},
                   delay=2500),
                _s("Server error", 500, None, text=_err("internal_error", "Catalogue service unavailable.")),
            ],
        },
        {
            "method": "GET", "path": "/products/:id", "name": "Get product",
            "description": "Echoes the requested id using {{params.id}} templating.",
            "scenarios": [
                _s("Found", 200, None, text=product_template),
                _s("Not found", 404, None, text=_err("product_not_found", "No product with id {{params.id}}.")),
            ],
        },
        {
            "method": "POST", "path": "/products", "name": "Create product",
            "description": "Returns the created product, echoing fields from the JSON body.",
            "scenarios": [
                _s("Created", 201, None,
                   text='{\n  "id": 105,\n  "name": "{{body.name}}",\n  "price": {{body.price}},\n'
                        '  "created_at": "{{now}}"\n}',
                   headers=[("Location", "/products/105")]),
                _s("Validation error", 422, None,
                   text=_j({"error": {"code": "validation_error", "message": "price must be positive",
                                      "fields": {"price": "must be greater than 0"}}})),
            ],
        },
        {
            "method": "PUT", "path": "/products/:id", "name": "Replace product",
            "scenarios": [
                _s("Updated", 200, None,
                   text='{\n  "id": {{params.id}},\n  "name": "{{body.name}}",\n  "price": {{body.price}},\n'
                        '  "updated_at": "{{now}}"\n}'),
                _s("Conflict", 409, None, text=_err("version_conflict", "Product was modified by someone else.")),
            ],
        },
        {
            "method": "DELETE", "path": "/products/:id", "name": "Delete product",
            "scenarios": [
                _s("Deleted", 204, None),
                _s("Forbidden", 403, None, text=_err("forbidden", "Only admins can delete products.")),
            ],
        },
        # ---------------------------------------------------------- users --
        {
            "method": "GET", "path": "/users", "name": "List users",
            "scenarios": [
                _s("Success", 200, USERS),
                _s("Unauthorized", 401, None, text=_err("unauthorized", "Missing or invalid bearer token."),
                   headers=[("WWW-Authenticate", 'Bearer realm="acme"')]),
            ],
        },
        {
            "method": "GET", "path": "/users/me", "name": "Current user",
            "description": "More specific than /users/:id, so it wins for /users/me.",
            "scenarios": [
                _s("Signed in", 200, USERS[0]),
                _s("Signed out", 401, None, text=_err("unauthorized", "Session expired.")),
            ],
        },
        {
            "method": "GET", "path": "/users/:id", "name": "Get user",
            "scenarios": [
                _s("Found", 200, None,
                   text='{\n  "id": {{params.id}},\n  "name": "Bob Okafor",\n  "email": "bob@example.com",\n'
                        '  "role": "customer"\n}'),
                _s("Not found", 404, None, text=_err("user_not_found", "No user with id {{params.id}}.")),
            ],
        },
        {
            "method": "POST", "path": "/auth/login", "name": "Log in",
            "description": "Passwords in request bodies are redacted in the inspector.",
            "scenarios": [
                _s("Success", 200, None,
                   text='{\n  "access_token": "mock.{{uuid}}",\n  "token_type": "Bearer",\n'
                        '  "expires_in": 3600,\n  "user": {"id": 1, "email": "{{body.email}}"}\n}'),
                _s("Invalid credentials", 401, None, text=_err("invalid_credentials", "Email or password is incorrect.")),
                _s("Rate limited", 429, None, text=_err("rate_limited", "Too many attempts. Retry in 60 seconds."),
                   headers=[("Retry-After", "60")]),
            ],
        },
        # --------------------------------------------------------- orders --
        {
            "method": "GET", "path": "/orders", "name": "List orders",
            "description": "Has a realistic 350 ms delay.",
            "scenarios": [
                _s("Success", 200, {"data": ORDERS, "total": len(ORDERS)}, delay=350),
                _s("Gateway timeout", 504, None, delay=3000,
                   text=_err("upstream_timeout", "Order service did not respond.")),
            ],
        },
        {
            "method": "GET", "path": "/orders/:id", "name": "Get order",
            "scenarios": [
                _s("Found", 200, None,
                   text=_j(ORDERS[1]).replace('"ord_5002"', '"{{params.id}}"')),
                _s("Not found", 404, None, text=_err("order_not_found", "No order {{params.id}}.")),
            ],
        },
        {
            "method": "POST", "path": "/orders", "name": "Place order",
            "description": "Fails randomly 20% of the time to exercise retry logic.",
            "failure_rate": 0.2, "failure_status": 503,
            "failure_body": _err("payment_gateway_unavailable", "Payment provider timed out, please retry."),
            "scenarios": [
                _s("Created", 201, None, delay=600,
                   text='{\n  "id": "ord_{{timestamp}}",\n  "status": "pending",\n'
                        '  "items": {{body.items}},\n  "created_at": "{{now}}"\n}'),
                _s("Out of stock", 409, None, text=_err("out_of_stock", "One or more items are out of stock.")),
            ],
        },
        {
            "method": "PATCH", "path": "/orders/:id", "name": "Update order status",
            "scenarios": [
                _s("Updated", 200, None,
                   text='{\n  "id": "{{params.id}}",\n  "status": "{{body.status}}",\n  "updated_at": "{{now}}"\n}'),
            ],
        },
    ]


def create_sample_project(db: Session) -> Project:
    data = schemas.ProjectExport(
        project=schemas.ExportedProject(
            name="Acme Shop",
            slug=SAMPLE_SLUG,
            description="Sample e-commerce API with products, users, auth and orders.",
            endpoints=[schemas.ExportedEndpoint(**e) for e in sample_endpoints()],
        )
    )
    return services.import_project(db, data)


def seed_if_needed(db: Session) -> None:
    """Seed once per database. Deleting the sample later won't resurrect it."""
    if db.get(Meta, SEEDED_FLAG) is not None:
        return
    if db.scalar(select(Project.id).limit(1)) is None:
        create_sample_project(db)
    db.add(Meta(key=SEEDED_FLAG, value="1"))
    db.commit()
