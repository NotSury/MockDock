from tests.conftest import endpoint_payload


def _setup(client, project):
    pid = project["id"]
    client.post(f"/api/projects/{pid}/endpoints", json=endpoint_payload())
    client.post(
        f"/api/projects/{pid}/endpoints",
        json=endpoint_payload(method="POST", path="/orders", scenarios=[{"name": "Fail", "status_code": 500, "body": "{}"}]),
    )
    client.get("/mock/demo/users")
    client.get("/mock/demo/users?q=alice")
    client.post("/mock/demo/orders", json={"sku": "ABC-123"})
    client.get("/mock/demo/missing")


def test_log_filters(client, project):
    _setup(client, project)
    get = lambda **p: client.get("/api/logs", params=p).json()  # noqa: E731
    assert get()["total"] == 4
    assert get(method="post")["total"] == 1
    assert get(status="5xx")["total"] == 1
    assert get(status="404")["total"] == 1
    assert get(status="2xx")["total"] == 2
    assert get(q="alice")["total"] == 1
    assert get(q="ABC-123")["total"] == 1  # searches request bodies too
    assert get(matched="false")["total"] == 1
    assert get(project_id=project["id"])["total"] == 4
    assert len(get(limit=2)["items"]) == 2
    assert client.get("/api/logs", params={"status": "abc"}).status_code == 422
    assert client.get("/api/logs/99999").status_code == 404


def test_clear_logs(client, project):
    _setup(client, project)
    other = client.post("/api/projects", json={"name": "B", "slug": "b"}).json()
    client.post(f"/api/projects/{other['id']}/endpoints", json=endpoint_payload())
    client.get("/mock/b/users")
    assert client.delete(f"/api/logs?project_id={project['id']}").status_code == 204
    assert client.get("/api/logs").json()["total"] == 1
    client.delete("/api/logs")
    assert client.get("/api/logs").json()["total"] == 0


def test_log_retention_prunes_old_rows(make_client):
    client = make_client(log_retention=10)
    p = client.post("/api/projects", json={"name": "x", "slug": "x"}).json()
    client.post(f"/api/projects/{p['id']}/endpoints", json=endpoint_payload())
    for _ in range(100):
        client.get("/mock/x/users")
    assert client.get("/api/logs").json()["total"] <= 10


def test_stats(client, project):
    _setup(client, project)
    for rng in ("1h", "24h", "7d"):
        stats = client.get("/api/stats", params={"range": rng}).json()
        assert stats["projects"] == 1
        assert stats["endpoints"] == 2
        assert stats["requests_total"] == 4
        assert stats["requests_in_range"] == 4
        assert stats["status_classes"] == {"2xx": 2, "3xx": 0, "4xx": 1, "5xx": 1}
        assert stats["methods"] == {"GET": 3, "POST": 1}
        assert stats["error_rate"] == 0.5
        assert stats["unmatched"] == 1
        assert sum(b["total"] for b in stats["timeline"]) == 4
        assert stats["top_endpoints"][0]["path"] == "/users"
        assert stats["top_endpoints"][0]["hits"] == 2
        assert len(stats["recent"]) == 4
    assert client.get("/api/stats?range=99y").status_code == 422
    filtered = client.get("/api/stats", params={"project_id": 999}).json()
    assert filtered["requests_total"] == 0
