"""Live smoke test: boots a real uvicorn server, exercises it over HTTP, restarts it.

    backend/.venv/bin/python scripts/live_smoke.py

Uses a throwaway SQLite file and port 8765, so it never touches your data.
Covers the 12 verification scenarios from the project brief.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
PORT = 8765
BASE = f"http://127.0.0.1:{PORT}"
results: list[tuple[str, bool, str]] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    results.append((name, cond, detail))
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}{' — ' + detail if detail else ''}")


def start(db: Path) -> subprocess.Popen:
    env = {**os.environ, "MOCKDOCK_DB_PATH": str(db), "MOCKDOCK_PORT": str(PORT), "MOCKDOCK_SEED_SAMPLE": "1"}
    proc = subprocess.Popen([sys.executable, "-m", "app"], cwd=BACKEND, env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(100):
        try:
            if httpx.get(f"{BASE}/api/health", timeout=0.5).status_code == 200:
                return proc
        except httpx.HTTPError:
            time.sleep(0.1)
    proc.kill()
    raise SystemExit("server did not start")


def main() -> int:
    tmp = Path(tempfile.mkdtemp(prefix="mockdock-smoke-"))
    db = tmp / "smoke.db"
    proc = start(db)
    c = httpx.Client(base_url=BASE, timeout=10)
    try:
        print("Live server checks")
        r = c.post("/api/projects", json={"name": "Smoke", "slug": "smoke"})
        check("1. create a project", r.status_code == 201, f"slug={r.json().get('slug')}")
        pid = r.json()["id"]

        body = '[{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}]'
        r = c.post(f"/api/projects/{pid}/endpoints", json={
            "method": "GET", "path": "/api/users",
            "scenarios": [{"name": "OK", "status_code": 200, "body": body}],
        })
        check("2. create a mock GET endpoint", r.status_code == 201, r.json().get("mock_path", r.text))
        eid = r.json()["id"]

        r = c.get("/mock/smoke/api/users")
        check("3. real HTTP request reaches the mock", r.status_code == 200)
        check("4. configured JSON is returned", r.json() == [{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}])

        c.patch(f"/api/endpoints/{eid}", json={"scenarios": [{"name": "OK", "body": '[{"id": 3, "name": "Carol"}]'}]})
        r = c.get("/mock/smoke/api/users")
        check("5. modified response is live without restart", r.json() == [{"id": 3, "name": "Carol"}])

        c.post(f"/api/projects/{pid}/endpoints", json={
            "method": "POST", "path": "/api/users",
            "scenarios": [{"name": "Created", "status_code": 201, "body": '{"id": 99, "name": "{{body.name}}"}'}],
        })
        r = c.post("/mock/smoke/api/users", json={"name": "Dana"})
        check("6. POST with JSON body", r.status_code == 201 and r.json() == {"id": 99, "name": "Dana"}, r.text)

        c.patch(f"/api/endpoints/{eid}", json={"scenarios": [{"name": "Slow", "body": "[]", "delay_ms": 750}]})
        t = time.perf_counter()
        c.get("/mock/smoke/api/users")
        elapsed = (time.perf_counter() - t) * 1000
        check("7. artificial delay", elapsed >= 740, f"{elapsed:.0f} ms for a 750 ms delay")

        c.patch(f"/api/endpoints/{eid}", json={"scenarios": [{"name": "Boom", "status_code": 500, "body": '{"error":"boom"}'}]})
        r1 = c.get("/mock/smoke/api/users")
        c.patch(f"/api/endpoints/{eid}", json={"scenarios": [{"name": "OK", "body": "[]"}], "failure_rate": 1, "failure_status": 503})
        r2 = c.get("/mock/smoke/api/users")
        check("8. simulated server errors (scenario + random failure)", r1.status_code == 500 and r2.status_code == 503,
              f"{r1.status_code}, {r2.status_code}")
        c.patch(f"/api/endpoints/{eid}", json={"failure_rate": 0})

        c.get("/mock/smoke/api/users?page=2", headers={"Authorization": "Bearer secret-token"})
        logs = c.get("/api/logs", params={"project_id": pid}).json()
        latest = c.get(f"/api/logs/{logs['items'][0]['id']}").json()
        check("9. requests are logged (and credentials redacted)",
              logs["total"] >= 6 and latest["query_string"] == "page=2"
              and latest["request_headers"]["authorization"] == "Bearer [REDACTED]",
              f"{logs['total']} log rows")

        bad = [
            c.post("/api/projects", json={"name": ""}).status_code,
            c.post(f"/api/projects/{pid}/endpoints", json={"method": "GET", "path": "/a//b", "scenarios": [{"name": "x"}]}).status_code,
            c.post(f"/api/projects/{pid}/endpoints", json={"method": "GET", "path": "/x", "scenarios": [{"name": "x", "body": "{nope"}]}).status_code,
            c.post(f"/api/projects/{pid}/endpoints", json={"method": "GET", "path": "/api/users/", "scenarios": [{"name": "x"}]}).status_code,
            c.get("/mock/smoke/missing").status_code,
            c.get("/mock/no-such-project/x").status_code,
            c.delete("/mock/smoke/api/users").status_code,
        ]
        check("11. invalid input / missing routes handled", bad == [422, 422, 422, 409, 404, 404, 405], str(bad))
        sample = c.get("/mock/shop/products").status_code
        check("    sample project is seeded and live", sample == 200)
    finally:
        c.close()
        proc.terminate()
        proc.wait(timeout=10)

    print("Restarting server on the same database…")
    proc = start(db)
    try:
        r = httpx.get(f"{BASE}/mock/smoke/api/users", timeout=5)
        projects = httpx.get(f"{BASE}/api/projects", timeout=5).json()
        check("10. configuration persists after restart", r.status_code == 200 and any(p["slug"] == "smoke" for p in projects))
    finally:
        proc.terminate()
        proc.wait(timeout=10)

    failed = [n for n, ok, _ in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
