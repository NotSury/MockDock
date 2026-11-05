"""End-to-end tests that send real HTTP requests to the mock server."""

import time

from app.mock import server as mock_server
from tests.conftest import endpoint_payload


def _create(client, project, **kw):
    res = client.post(f"/api/projects/{project['id']}/endpoints", json=endpoint_payload(**kw))
    assert res.status_code == 201, res.text
    return res.json()


def test_get_returns_configured_json(client, project):
    _create(client, project)
    res = client.get("/mock/demo/users")
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/json"
    assert res.json() == [{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}]
    assert res.headers["x-mockdock-scenario"] == "Success"


def test_changes_apply_without_restart(client, project):
    ep = _create(client, project)
    assert client.get("/mock/demo/users").json()[0]["name"] == "Alice"
    client.patch(
        f"/api/endpoints/{ep['id']}",
        json={"scenarios": [{"name": "Success", "status_code": 200, "body": '[{"id": 3, "name": "Carol"}]'}]},
    )
    assert client.get("/mock/demo/users").json() == [{"id": 3, "name": "Carol"}]
    # Path changes too.
    client.patch(f"/api/endpoints/{ep['id']}", json={"path": "/people"})
    assert client.get("/mock/demo/users").status_code == 404
    assert client.get("/mock/demo/people").status_code == 200


def test_post_with_json_body_and_templating(client, project):
    _create(
        client,
        project,
        method="POST",
        path="/users/:id/notes",
        scenarios=[
            {
                "name": "Created",
                "status_code": 201,
                "body": '{"user": {{params.id}}, "note": "{{body.text}}", "tags": {{body.tags}}, "page": "{{query.page}}"}',
                "headers": [{"key": "X-Request-User", "value": "{{params.id}}"}],
            }
        ],
    )
    res = client.post("/mock/demo/users/7/notes?page=3", json={"text": "hi \"there\"", "tags": ["a", "b"]})
    assert res.status_code == 201
    assert res.json() == {"user": 7, "note": 'hi "there"', "tags": ["a", "b"], "page": "3"}
    assert res.headers["x-request-user"] == "7"


def test_custom_headers_and_text_body(client, project):
    _create(
        client,
        project,
        path="/robots.txt",
        scenarios=[
            {
                "name": "Text",
                "body_type": "text",
                "body": "User-agent: *",
                "headers": [{"key": "Cache-Control", "value": "no-store"}, {"key": "X-Env", "value": "mock"}],
            }
        ],
    )
    res = client.get("/mock/demo/robots.txt")
    assert res.text == "User-agent: *"
    assert res.headers["content-type"].startswith("text/plain")
    assert res.headers["cache-control"] == "no-store"
    assert res.headers["x-env"] == "mock"


def test_artificial_delay(client, project):
    _create(client, project, scenarios=[{"name": "Slow", "body": "[]", "delay_ms": 400}])
    start = time.perf_counter()
    res = client.get("/mock/demo/users")
    elapsed = (time.perf_counter() - start) * 1000
    assert res.status_code == 200
    assert elapsed >= 390
    logged = client.get("/api/logs").json()["items"][0]
    assert logged["duration_ms"] >= 390


def test_delay_is_capped_by_settings(make_client):
    client = make_client(max_delay_ms=50)
    p = client.post("/api/projects", json={"name": "x", "slug": "x"}).json()
    client.post(
        f"/api/projects/{p['id']}/endpoints",
        json=endpoint_payload(scenarios=[{"name": "Slow", "body": "[]", "delay_ms": 5000}]),
    )
    start = time.perf_counter()
    client.get("/mock/x/users")
    assert time.perf_counter() - start < 2


def test_error_scenarios(client, project):
    ep = _create(
        client,
        project,
        scenarios=[
            {"name": "OK", "body": "[]"},
            {"name": "Bad request", "status_code": 400, "body": '{"error": "bad"}'},
            {"name": "Unauthorized", "status_code": 401, "body": '{"error": "auth"}'},
            {"name": "Missing", "status_code": 404, "body": '{"error": "nf"}'},
            {"name": "Crash", "status_code": 500, "body": '{"error": "boom"}'},
        ],
    )
    for name, status in [("Bad request", 400), ("Unauthorized", 401), ("Missing", 404), ("Crash", 500)]:
        client.patch(f"/api/endpoints/{ep['id']}", json={"active_scenario": name})
        res = client.get("/mock/demo/users")
        assert res.status_code == status
        assert res.headers["x-mockdock-scenario"] == name


def test_scenario_override_via_header_and_query(client, project):
    _create(
        client,
        project,
        scenarios=[{"name": "OK", "body": "[]"}, {"name": "Crash", "status_code": 500, "body": "{}"}],
    )
    assert client.get("/mock/demo/users").status_code == 200
    assert client.get("/mock/demo/users", headers={"X-MockDock-Scenario": "crash"}).status_code == 500
    assert client.get("/mock/demo/users?__scenario=Crash").status_code == 500
    # Unknown override falls back to the active scenario.
    assert client.get("/mock/demo/users", headers={"X-MockDock-Scenario": "nope"}).status_code == 200


def test_random_failures(client, project, monkeypatch):
    _create(
        client,
        project,
        failure_rate=0.5,
        failure_status=503,
        failure_body='{"error": "flaky"}',
    )
    monkeypatch.setattr(mock_server.rng, "random", lambda: 0.1)
    res = client.get("/mock/demo/users")
    assert res.status_code == 503
    assert res.json() == {"error": "flaky"}
    assert res.headers["x-mockdock-scenario"] == "simulated-failure"

    monkeypatch.setattr(mock_server.rng, "random", lambda: 0.9)
    assert client.get("/mock/demo/users").status_code == 200

    log = client.get("/api/logs").json()["items"]
    assert [entry["simulated_failure"] for entry in log] == [False, True]


def test_random_failure_rate_is_roughly_respected(client, project, monkeypatch):
    import random

    monkeypatch.setattr(mock_server, "rng", random.Random(1234))
    _create(client, project, failure_rate=0.3)
    statuses = [client.get("/mock/demo/users").status_code for _ in range(200)]
    failures = statuses.count(500)
    assert 35 <= failures <= 85
    assert set(statuses) == {200, 500}


def test_empty_responses(client, project):
    _create(client, project, method="DELETE", path="/users/:id", scenarios=[{"name": "Gone", "status_code": 204}])
    _create(client, project, path="/empty", scenarios=[{"name": "Empty", "status_code": 200, "body_type": "none"}])
    res = client.delete("/mock/demo/users/1")
    assert res.status_code == 204 and res.content == b""
    res = client.get("/mock/demo/empty")
    assert res.status_code == 200 and res.content == b""


def test_request_logging_with_redaction(client, project):
    _create(client, project, method="POST", path="/login", scenarios=[{"name": "OK", "body": '{"ok": true}'}])
    client.post(
        "/mock/demo/login?next=/home",
        json={"email": "a@b.c", "password": "hunter2"},
        headers={"Authorization": "Bearer super-secret", "X-Trace": "abc"},
    )
    page = client.get("/api/logs").json()
    assert page["total"] == 1
    summary = page["items"][0]
    assert summary["method"] == "POST"
    assert summary["path"] == "/login"
    assert summary["endpoint_path"] == "/login"
    assert summary["query_string"] == "next=/home"
    assert summary["response_status"] == 200
    assert summary["matched"] is True
    detail = client.get(f"/api/logs/{summary['id']}").json()
    assert detail["request_headers"]["authorization"] == "Bearer [REDACTED]"
    assert detail["request_headers"]["x-trace"] == "abc"
    assert "hunter2" not in detail["request_body"]
    assert "a@b.c" in detail["request_body"]
    assert detail["response_body"] == '{"ok": true}'
    assert "super-secret" not in str(detail)


def test_configuration_persists_across_restart(make_client):
    first = make_client()
    p = first.post("/api/projects", json={"name": "Persist", "slug": "persist"}).json()
    first.post(f"/api/projects/{p['id']}/endpoints", json=endpoint_payload())
    first.get("/mock/persist/users")
    first.__exit__(None, None, None)

    second = make_client()  # brand-new app + engine on the same SQLite file
    assert second.get("/mock/persist/users").json()[0]["name"] == "Alice"
    assert second.get("/api/logs").json()["total"] == 2


def test_unknown_project_route_and_method(client, project):
    _create(client, project)
    res = client.get("/mock/nope/users")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "project_not_found"

    res = client.get("/mock/demo/missing")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "route_not_found"
    assert res.headers["x-mockdock-error"] == "route_not_found"

    res = client.put("/mock/demo/users")
    assert res.status_code == 405
    assert res.headers["allow"] == "GET"

    # Methods outside the supported set are rejected by the router.
    assert client.request("TRACE", "/mock/demo/users").status_code == 405

    log = client.get("/api/logs?matched=false").json()
    assert log["total"] == 3


def test_disabled_endpoint(client, project):
    ep = _create(client, project)
    client.patch(f"/api/endpoints/{ep['id']}", json={"enabled": False})
    res = client.get("/mock/demo/users")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "endpoint_disabled"
    client.patch(f"/api/endpoints/{ep['id']}", json={"enabled": True})
    assert client.get("/mock/demo/users").status_code == 200


def test_head_and_options(client, project):
    _create(client, project)
    _create(client, project, method="POST")
    res = client.head("/mock/demo/users")
    assert res.status_code == 200 and res.content == b""
    res = client.options("/mock/demo/users")
    assert res.status_code == 204
    assert res.headers["allow"] == "GET, OPTIONS, POST"
    assert client.options("/mock/demo/nothing").status_code == 404


def test_root_path(client, project):
    _create(client, project, path="/", scenarios=[{"name": "Root", "body": '{"root": true}'}])
    assert client.get("/mock/demo").json() == {"root": True}
    assert client.get("/mock/demo/").json() == {"root": True}


def test_payload_too_large(make_client):
    client = make_client(max_request_body_bytes=100)
    p = client.post("/api/projects", json={"name": "x", "slug": "x"}).json()
    client.post(f"/api/projects/{p['id']}/endpoints", json=endpoint_payload(method="POST"))
    res = client.post("/mock/x/users", content=b"x" * 500)
    assert res.status_code == 413


def test_mock_namespace_cannot_reach_admin_api(client, project):
    # A user may create a mock route that *looks* like an admin path...
    _create(client, project, path="/api/projects", scenarios=[{"name": "Fake", "body": '{"fake": true}'}])
    assert client.get("/mock/demo/api/projects").json() == {"fake": True}
    # ...but it lives only in the mock namespace; the real admin API is untouched.
    real = client.get("/api/projects").json()
    assert isinstance(real, list) and real[0]["slug"] == "demo"
    # Path traversal attempts stay inside the mock namespace.
    for evil in ("/mock/demo/%2e%2e/%2e%2e/api/projects", "/mock/demo/..%2F..%2Fapi%2Fprojects"):
        res = client.get(evil)
        assert res.status_code == 404
        assert res.json()["error"]["source"] == "mockdock"


def test_cors_restricted_to_local_frontend(client, project):
    _create(client, project)
    ok = client.get("/mock/demo/users", headers={"Origin": "http://localhost:5173"})
    assert ok.headers["access-control-allow-origin"] == "http://localhost:5173"
    evil = client.get("/api/projects", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in evil.headers
    pre = client.options(
        "/api/projects",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "DELETE"},
    )
    assert pre.status_code == 400
