from __future__ import annotations

from collections.abc import Callable, Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.mock import server as mock_server


@pytest.fixture
def make_client(tmp_path: Path) -> Iterator[Callable[..., TestClient]]:
    """Factory: build a client on a temp DB. Calling twice reuses the same DB file."""
    clients: list[TestClient] = []

    def _make(seed: bool = False, **overrides) -> TestClient:
        settings = Settings(
            db_path=tmp_path / "mockdock.db",
            seed_sample=seed,
            frontend_dist=None,
            **overrides,
        )
        client = TestClient(create_app(settings))
        client.__enter__()
        clients.append(client)
        return client

    yield _make
    for c in clients:
        c.__exit__(None, None, None)


@pytest.fixture
def client(make_client) -> TestClient:
    return make_client()


@pytest.fixture
def seeded_client(make_client) -> TestClient:
    return make_client(seed=True)


@pytest.fixture(autouse=True)
def _no_random_failures(monkeypatch):
    """Make random failure simulation deterministic unless a test opts in."""
    monkeypatch.setattr(mock_server.rng, "random", lambda: 0.999999)


@pytest.fixture
def project(client) -> dict:
    res = client.post("/api/projects", json={"name": "Demo API", "slug": "demo"})
    assert res.status_code == 201, res.text
    return res.json()


def endpoint_payload(**overrides) -> dict:
    payload = {
        "method": "GET",
        "path": "/users",
        "name": "List users",
        "scenarios": [
            {
                "name": "Success",
                "status_code": 200,
                "body_type": "json",
                "body": '[{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}]',
            }
        ],
    }
    payload.update(overrides)
    return payload
