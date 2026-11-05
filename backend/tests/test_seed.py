import re

from app.seed import SAMPLE_SLUG, sample_endpoints


def test_sample_project_is_seeded_once(seeded_client, make_client):
    projects = seeded_client.get("/api/projects").json()
    assert [p["slug"] for p in projects] == [SAMPLE_SLUG]
    assert projects[0]["endpoint_count"] == len(sample_endpoints())

    seeded_client.delete(f"/api/projects/{projects[0]['id']}")
    again = make_client(seed=True)  # restart: must not resurrect the deleted sample
    assert again.get("/api/projects").json() == []

    restored = again.post("/api/sample")
    assert restored.status_code == 201 and restored.json()["slug"] == SAMPLE_SLUG


def test_every_sample_endpoint_answers_with_its_active_scenario(seeded_client):
    project = seeded_client.get("/api/projects").json()[0]
    endpoints = seeded_client.get(f"/api/projects/{project['id']}/endpoints").json()
    resources = {"products", "users", "orders", "auth"}
    assert {e["path"].split("/")[1] for e in endpoints} == resources
    bodies = {
        "POST": {"name": "Desk Lamp", "price": 39.0, "email": "a@b.c", "password": "x", "items": [{"product_id": 101}]},
        "PUT": {"name": "Desk Lamp", "price": 39.0},
        "PATCH": {"status": "shipped"},
    }
    for ep in endpoints:
        url = "/mock/shop" + re.sub(r":\w+", "42", ep["path"])
        res = seeded_client.request(ep["method"], url, json=bodies.get(ep["method"]))
        active = next(s for s in ep["scenarios"] if s["name"] == ep["active_scenario"])
        assert res.status_code == active["status_code"], (ep["method"], ep["path"], res.text)
        if res.content:
            res.json()  # every sample body renders as valid JSON
