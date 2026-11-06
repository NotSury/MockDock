from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def _client(tmp_path, with_dist: bool) -> TestClient:
    dist = tmp_path / "dist"
    if with_dist:
        (dist / "assets").mkdir(parents=True)
        (dist / "index.html").write_text("<!doctype html><title>MockDock</title>")
        (dist / "assets" / "app.js").write_text("console.log(1)")
        (dist / "favicon.svg").write_text("<svg/>")
    (tmp_path / "secret.txt").write_text("top secret")
    settings = Settings(db_path=tmp_path / "db.sqlite", seed_sample=False, frontend_dist=dist)
    return TestClient(create_app(settings))


def test_built_ui_is_served_with_spa_fallback(tmp_path):
    with _client(tmp_path, with_dist=True) as c:
        assert "MockDock" in c.get("/").text
        assert "MockDock" in c.get("/projects/1/endpoints/2").text  # client-side route
        assert c.get("/assets/app.js").text == "console.log(1)"
        assert c.get("/favicon.svg").text == "<svg/>"
        # API and mock namespaces are never swallowed by the SPA fallback.
        assert c.get("/api/nope").json()["error"]["code"] == "not_found"
        assert c.get("/mock/nope/x").json()["error"]["code"] == "project_not_found"


def test_static_serving_does_not_escape_dist(tmp_path):
    with _client(tmp_path, with_dist=True) as c:
        for evil in ("/..%2fsecret.txt", "/%2e%2e/secret.txt", "/assets/..%2f..%2fsecret.txt"):
            assert "top secret" not in c.get(evil).text


def test_without_built_ui_root_explains_how_to_start(tmp_path):
    with _client(tmp_path, with_dist=False) as c:
        assert "npm run dev" in c.get("/").json()["message"]
