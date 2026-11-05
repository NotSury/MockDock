from tests.conftest import endpoint_payload


def _create(client, project, **kw):
    return client.post(f"/api/projects/{project['id']}/endpoints", json=endpoint_payload(**kw))


def test_create_endpoint_normalises_path(client, project):
    res = _create(client, project, path="users/{userId}/", method="get")
    assert res.status_code == 201, res.text
    ep = res.json()
    assert ep["method"] == "GET"
    assert ep["path"] == "/users/:userId"
    assert ep["active_scenario"] == "Success"
    assert ep["mock_path"] == "/mock/demo/users/:userId"
    assert len(client.get(f"/api/projects/{project['id']}/endpoints").json()) == 1


def test_duplicate_routes_are_rejected(client, project):
    assert _create(client, project, path="/users/:id").status_code == 201
    res = _create(client, project, path="/users/{other}")
    assert res.status_code == 409
    assert "already exists" in res.json()["error"]["message"]
    # Same path with a different method is fine.
    assert _create(client, project, path="/users/:id", method="DELETE").status_code == 201


def test_endpoint_validation(client, project):
    cases = [
        {"method": "TRACE"},
        {"path": "/a//b"},
        {"scenarios": []},
        {"scenarios": [{"name": "A", "body": "{bad json"}]},
        {"scenarios": [{"name": "A", "status_code": 99}]},
        {"scenarios": [{"name": "A", "status_code": 204, "body": '{"x":1}'}]},
        {"scenarios": [{"name": "A", "delay_ms": 999_999}]},
        {"scenarios": [{"name": "A"}, {"name": "a"}]},
        {"scenarios": [{"name": "A", "headers": [{"key": "Content-Length", "value": "1"}]}]},
        {"scenarios": [{"name": "A", "headers": [{"key": "X-Evil", "value": "a\r\nSet-Cookie: x"}]}]},
        {"scenarios": [{"name": "A", "headers": [{"key": "Bad Header", "value": "x"}]}]},
        {"active_scenario": "Missing"},
        {"failure_rate": 1.5},
        {"failure_status": 200},
    ]
    for override in cases:
        res = _create(client, project, **override)
        assert res.status_code == 422, (override, res.text)
        assert res.json()["error"]["code"] == "validation_error"


def test_text_body_need_not_be_json(client, project):
    res = _create(client, project, scenarios=[{"name": "A", "body_type": "text", "body": "hello {"}])
    assert res.status_code == 201


def test_update_endpoint_partial_and_scenarios(client, project):
    ep = _create(client, project).json()
    res = client.patch(f"/api/endpoints/{ep['id']}", json={"enabled": False, "name": "Users"})
    assert res.status_code == 200
    assert res.json()["enabled"] is False and res.json()["name"] == "Users"

    res = client.patch(
        f"/api/endpoints/{ep['id']}",
        json={
            "scenarios": [
                {"name": "Success", "body": "[]"},
                {"name": "Boom", "status_code": 500, "body": '{"error": "boom"}'},
            ],
            "active_scenario": "Boom",
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert [s["name"] for s in data["scenarios"]] == ["Success", "Boom"]
    assert data["active_scenario"] == "Boom"

    # Renaming away the active scenario falls back to the first one.
    res = client.patch(f"/api/endpoints/{ep['id']}", json={"scenarios": [{"name": "Only", "body": "{}"}]})
    assert res.json()["active_scenario"] == "Only"

    res = client.patch(f"/api/endpoints/{ep['id']}", json={"active_scenario": "Nope"})
    assert res.status_code == 422


def test_update_to_conflicting_route(client, project):
    _create(client, project, path="/a")
    b = _create(client, project, path="/b").json()
    res = client.patch(f"/api/endpoints/{b['id']}", json={"path": "/a"})
    assert res.status_code == 409


def test_duplicate_endpoint(client, project):
    ep = _create(client, project, path="/users/:id").json()
    first = client.post(f"/api/endpoints/{ep['id']}/duplicate")
    assert first.status_code == 201
    assert first.json()["path"] == "/users/:id/copy"
    assert first.json()["name"] == "List users (copy)"
    second = client.post(f"/api/endpoints/{ep['id']}/duplicate").json()
    assert second["path"] == "/users/:id/copy-2"

    flat = _create(client, project, path="/orders").json()
    assert client.post(f"/api/endpoints/{flat['id']}/duplicate").json()["path"] == "/orders-copy"

    # Duplicating as another method keeps the path.
    other = client.post(f"/api/endpoints/{ep['id']}/duplicate", json={"method": "PUT"}).json()
    assert other["path"] == "/users/:id" and other["method"] == "PUT"

    # Duplicating into another project keeps the path.
    p2 = client.post("/api/projects", json={"name": "Other"}).json()
    moved = client.post(f"/api/endpoints/{ep['id']}/duplicate", json={"project_id": p2["id"]}).json()
    assert moved["project_id"] == p2["id"] and moved["path"] == "/users/:id"


def test_delete_endpoint(client, project):
    ep = _create(client, project).json()
    assert client.delete(f"/api/endpoints/{ep['id']}").status_code == 204
    assert client.get(f"/api/endpoints/{ep['id']}").status_code == 404
    assert client.delete(f"/api/endpoints/{ep['id']}").status_code == 404


def test_endpoint_in_unknown_project(client):
    res = client.post("/api/projects/999/endpoints", json=endpoint_payload())
    assert res.status_code == 404
