from tests.conftest import endpoint_payload


def test_create_list_update_delete_project(client):
    res = client.post("/api/projects", json={"name": "  Payments Service ", "description": "PSP"})
    assert res.status_code == 201
    created = res.json()
    assert created["name"] == "Payments Service"
    assert created["slug"] == "payments-service"
    assert created["mock_base_path"] == "/mock/payments-service"

    listed = client.get("/api/projects").json()
    assert [p["slug"] for p in listed] == ["payments-service"]

    res = client.patch(f"/api/projects/{created['id']}", json={"name": "Payments", "slug": "pay"})
    assert res.status_code == 200
    assert res.json()["slug"] == "pay"

    assert client.delete(f"/api/projects/{created['id']}").status_code == 204
    assert client.get(f"/api/projects/{created['id']}").status_code == 404


def test_auto_slug_is_made_unique(client):
    a = client.post("/api/projects", json={"name": "Shop"}).json()
    b = client.post("/api/projects", json={"name": "Shop"}).json()
    assert (a["slug"], b["slug"]) == ("shop", "shop-2")


def test_explicit_slug_conflict(client, project):
    res = client.post("/api/projects", json={"name": "Other", "slug": "demo"})
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "conflict"


def test_project_validation_errors(client):
    for payload in ({"name": ""}, {"name": "   "}, {"name": "x", "slug": "Bad Slug!"}, {}):
        res = client.post("/api/projects", json=payload)
        assert res.status_code == 422, payload
        body = res.json()["error"]
        assert body["code"] == "validation_error"
        assert body["message"]


def test_delete_project_cascades_endpoints(client, project):
    ep = client.post(f"/api/projects/{project['id']}/endpoints", json=endpoint_payload()).json()
    client.delete(f"/api/projects/{project['id']}")
    assert client.get(f"/api/endpoints/{ep['id']}").status_code == 404


def test_counts(client, project):
    client.post(f"/api/projects/{project['id']}/endpoints", json=endpoint_payload())
    client.get("/mock/demo/users")
    got = client.get(f"/api/projects/{project['id']}").json()
    assert got["endpoint_count"] == 1
    assert got["request_count"] == 1


def test_unknown_api_route_is_json_404(client):
    res = client.get("/api/does-not-exist")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "not_found"


def test_export_import_roundtrip(client, project):
    pid = project["id"]
    client.post(f"/api/projects/{pid}/endpoints", json=endpoint_payload())
    client.post(
        f"/api/projects/{pid}/endpoints",
        json=endpoint_payload(method="POST", path="/users", scenarios=[{"name": "Created", "status_code": 201, "body": "{}"}]),
    )
    res = client.get(f"/api/projects/{pid}/export")
    assert res.status_code == 200
    assert "attachment" in res.headers["content-disposition"]
    exported = res.json()
    assert exported["mockdock_version"] == 1
    assert len(exported["project"]["endpoints"]) == 2

    imported = client.post("/api/projects/import", json=exported)
    assert imported.status_code == 201
    new = imported.json()
    assert new["slug"] == "demo-2"
    assert new["endpoint_count"] == 2
    assert client.get("/mock/demo-2/users").json()[0]["name"] == "Alice"


def test_import_rejects_invalid_documents(client):
    assert client.post("/api/projects/import", json={"nope": 1}).status_code == 422
    bad_version = {"mockdock_version": 9, "project": {"name": "X"}}
    assert client.post("/api/projects/import", json=bad_version).status_code == 422
    dup = {
        "project": {
            "name": "X",
            "endpoints": [endpoint_payload(path="/a/:id"), endpoint_payload(path="/a/{other}")],
        }
    }
    assert client.post("/api/projects/import", json=dup).status_code == 409
    bad_json = {"project": {"name": "X", "endpoints": [endpoint_payload(scenarios=[{"name": "s", "body": "{oops"}])]}}
    assert client.post("/api/projects/import", json=bad_json).status_code == 422
