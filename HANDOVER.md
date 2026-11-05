# MockDock: Handover Notes

Good morning! This document explains how MockDock works, written for a CS undergraduate who has seen some web development but hasn't read this codebase. Read it top to bottom once, then use it as a map.

---

## 1. What you have, in one paragraph

MockDock is two programs that talk over HTTP:

1. **A Python backend** (FastAPI, in `backend/`). It stores your fake APIs in a SQLite file and serves them as a real HTTP server.
2. **A React frontend** (in `frontend/`). It's the studio where you create projects and endpoints, send test requests and inspect traffic.

When some app (your phone app, `curl`, the built-in tester) calls `http://127.0.0.1:8000/mock/shop/products`, the backend looks up which endpoint you configured for `GET /products` in the project whose slug is `shop`. It builds the response you designed, waits for any delay you asked for, logs the request, and sends the response back.

To try it:

```bash
make install   # once
make dev       # then open http://127.0.0.1:5173
```

---

## 2. The big picture

```
                    ┌───────────────────────────────┐
  You in a browser  │  React UI  (localhost:5173)   │
                    └──────┬─────────────────┬──────┘
                           │ fetch("/api/…") │ fetch("/mock/…")      ← the Vite dev server
                           │                 │                         forwards both to :8000
                    ┌──────▼─────────────────▼──────┐
  curl / your app ─►│  FastAPI  (127.0.0.1:8000)    │
                    │                               │
                    │  /api/*   management API      │  ← "edit the configuration"
                    │  /mock/*  the mock server     │  ← "pretend to be the real API"
                    └──────────────┬────────────────┘
                                   │ SQLAlchemy
                            ┌──────▼──────┐
                            │   SQLite    │  backend/data/mockdock.db
                            └─────────────┘
```

There's one backend process with two URL namespaces:

| Prefix | Who calls it | Purpose | Code |
| --- | --- | --- | --- |
| `/api/...` | the MockDock UI | Create, read, update and delete projects/endpoints; read logs and stats | `backend/app/api/*.py` |
| `/mock/{slug}/...` | anything you're testing | Answer with the fake responses you configured | `backend/app/mock/server.py` |

Keeping them separate is a deliberate **security and design decision**. Suppose a user creates a mock route called `/api/projects`. It lives at `/mock/shop/api/projects`, so it can never replace or expose the real management route `/api/projects`.

---

## 3. How the frontend and backend communicate

- The frontend only ever uses **JSON over HTTP** through `fetch`, and there are no websockets. Live pages just poll every few seconds.
- All management calls go through one small typed client: **`frontend/src/api/client.ts`**. Every function there (`api.listProjects()`, `api.updateEndpoint(id, body)` and so on) is a thin wrapper around `fetch`. If the server answers with an error such as `{"error": {"code": "conflict", "message": "..."}}`, the client throws an `ApiError` the UI can show.
- React components don't call `api.*` directly. They use **hooks** in `frontend/src/api/hooks.ts`, built on **TanStack Query**. That library caches responses, refetches in the background and lets us say "after saving an endpoint, refresh the endpoint list and dashboard stats" (`invalidateQueries`).
- In development the UI runs on port 5173 and the API on 8000. To avoid cross-origin (CORS) headaches, `frontend/vite.config.ts` has a **proxy**: requests to `/api` and `/mock` on 5173 are forwarded to 8000. In production mode (`make start`), FastAPI serves the built UI itself, so everything is on one port.
- The TypeScript types in `frontend/src/api/types.ts` mirror the Pydantic models in `backend/app/schemas.py`. If you change one, change the other.

---

## 4. How SQLite stores endpoint configurations

The schema is defined in **`backend/app/models.py`** with SQLAlchemy. Think of each class as a table:

```
projects                endpoints                          scenarios
─────────               ──────────                         ──────────
id                ┌──── project_id (FK, cascade delete)    endpoint_id (FK, cascade) ────┐
name              │     method        "GET"                name          "Not found"     │
slug  "shop"  ◄───┘     path          "/products/:id"      status_code   404             │
description             route_key     "/products/:"        headers       [{"key","value"}] (JSON column)
                        active_scenario "Found"            body_type     json|text|none  │
                        enabled                            body          '{"error": …}'  │
                        failure_rate  0.2                  delay_ms      0               │
                        failure_status 503                 position      (ordering)      │
                        failure_body                                                     │
                        id ◄─────────────────────────────────────────────────────────────┘

request_logs  — one row per request the mock server received (headers JSON, bodies, status, duration…)
meta          — key/value flags, e.g. "sample_seeded" so the demo isn't re-created after you delete it
```

Some things to notice:

- An **endpoint** is "method + path". It owns one or more **scenarios**, which are the possible responses. `active_scenario` is the *name* of the scenario served by default.
- **`route_key`** is the path with parameter names erased (`/products/:id` → `/products/:`). There's a unique database constraint on `(project_id, method, route_key)`, so `/users/:id` and `/users/:userId` count as the *same* route and you can't create both. That's how duplicate routes are rejected.
- Headers are stored in a **JSON column** as a list of `{key, value}` pairs. A list keeps their order and allows repeated headers like `Set-Cookie`.
- Deleting a project deletes its endpoints and scenarios (`cascade="all, delete-orphan"` + `ON DELETE CASCADE`). Request logs are *kept*: their `project_id` is set to NULL.
- The database is created on startup by **`init_schema()`** in `backend/app/db.py` (`Base.metadata.create_all`). It's stamped with `PRAGMA user_version = 1`. To change the schema later, bump `SCHEMA_VERSION` and add a function to `MIGRATIONS`.
- SQLite runs in **WAL mode**, so readers (mock requests) and writers (log inserts, UI saves) don't block each other.

---

## 5. How incoming requests are matched to endpoints

This is the heart of the project. The code is in **`backend/app/mock/matcher.py`**: pure functions with no database access, which makes them easy to unit-test (`backend/tests/test_matcher.py`).

**Step 1: Paths are split into segments.** `parse_path("/users/{id}/orders")` produces:

```
[Segment("users", is_param=False), Segment("id", is_param=True), Segment("orders", is_param=False)]
```

This also *validates* the path: no `//`, no `..`, no duplicate parameter names, and so on. `{id}` is normalised to `:id`.

**Step 2: Candidates are found.** `match_route(method, path, routes)` splits the request path (`/users/42/orders` → `["users", "42", "orders"]`) and compares it to every configured route of the same length. Static segments must be equal, and parameter segments match anything and capture the value (`{"id": "42"}`).

**Step 3: The most specific candidate wins.** Each candidate gets a score like `(1, 0, 1)`, where 1 means a static segment and 0 means a parameter. Tuples compare left to right, so `/users/me` → `(1, 1)` beats `/users/:id` → `(1, 0)` for the request `/users/me`. That's the same rule most web frameworks use.

**Step 4: Special cases.**

- The path matches but no route has that method → **405 Method Not Allowed**, with an `Allow: GET, POST` header listing the methods that do exist.
- Nothing matches at all → **404** with `{"error": {"code": "route_not_found", …}}`.
- Only a *disabled* endpoint matches → **404** `endpoint_disabled`, so you know why.

---

## 6. How the mock server builds a response

The entry point is `handle_mock()` in **`backend/app/mock/server.py`**. It's registered for `/mock/{project_slug}` and `/mock/{project_slug}/{path:path}`. In order:

1. **Read the body.** Anything over 1 MB gets a `413`.
2. **`resolve()`** (runs in a thread pool because SQLAlchemy is synchronous):
   - find the project by slug → else 404 `project_not_found`
   - load its endpoints **fresh from SQLite**, which is why edits apply without a restart
   - run the matcher (section 5)
   - choose the scenario: the one named in the `X-MockDock-Scenario` header or `?__scenario=` if present, otherwise the endpoint's `active_scenario`
   - copy everything needed into a plain `Resolution` dataclass, so the database session can close
3. **Random failure roll.** If `failure_rate` is 0.2, `rng.random() < 0.2` fails about 20% of requests with the configured failure status and body. Tests replace `rng` to make this deterministic.
4. **Delay.** `await asyncio.sleep(delay_ms / 1000)`. Because it's `async`, a slow mock doesn't block other requests.
5. **Render the templates** (`backend/app/mock/templating.py`). `{{params.id}}`, `{{body.name}}` and the rest are replaced with values from the request. The renderer walks the JSON text, tracking whether it's inside a string literal:
   - **inside a string** (`"sku": "ACM-{{params.id}}"`) → inserted as escaped text
   - **bare** (`"id": {{params.id}}`) → inserted as a JSON value, so `42` becomes a number
   No `eval`, no Jinja, no user code: it only performs dictionary lookups.
6. **Build the `Response`.** Set the status, your headers, and `Content-Type` (from the body type unless you set one). It also adds debugging headers: `X-MockDock-Scenario`, `X-MockDock-Endpoint` and `X-MockDock-Duration`.
7. **Log it.** `write_log()` stores the request and response with secrets **redacted** (`backend/app/mock/redaction.py`): `Authorization: Bearer abc` becomes `Bearer [REDACTED]`, and JSON fields like `password` are masked. Every 100 inserts, it prunes rows beyond the retention limit.

---

## 7. Walkthrough: one complete HTTP request

Let's follow one request, from clicking **Send** in the API tester to seeing the response. The setup: the Acme Shop project, `GET /products/:id`, with the "Found" scenario live.

**① In the browser.** You type `http://127.0.0.1:8000/mock/shop/products/42` and press Send. `TesterPage.send()` (`frontend/src/pages/Tester.tsx`) calls `sendRequest()` in `frontend/src/lib/tester.ts`.

**② The URL is rewritten.** The UI runs on `:5173` and the target is the MockDock server on `:8000`, so `transportUrl()` changes the URL to the same-origin path `/mock/shop/products/42`. `sendRequest()` records `performance.now()` and calls `fetch(...)`.

**③ The Vite proxy forwards it.** `vite.config.ts` says that anything under `/mock` goes to `http://127.0.0.1:8000`. Uvicorn receives `GET /mock/shop/products/42`.

**④ FastAPI routes it.** Starlette matches the route `/mock/{project_slug}/{path:path}`, so `project_slug="shop"` and `path="products/42"`. It calls `handle_mock()`.

**⑤ Resolve.** `resolve()` runs `SELECT … FROM projects WHERE slug='shop'`, then loads that project's endpoints with their scenarios. `match_route("GET", "/products/42", routes)` finds `/products/:id` with `params={"id": "42"}`. The active scenario is "Found" (status 200, delay 0).

**⑥ Failure and delay.** `failure_rate` is 0, so there's no failure, and there's no delay to sleep through.

**⑦ Render.** The stored body is:

```json
{ "id": {{params.id}}, "sku": "ACM-{{params.id}}", "fetched_at": "{{now}}" }
```

It becomes `{"id": 42, "sku": "ACM-42", "fetched_at": "2026-11-05T18:00:00Z"}`. The first placeholder is bare, so it becomes a number; the others are inside strings, so they become text.

**⑧ Respond and log.** A `Response(200, application/json)` gets the extra `X-MockDock-*` headers. A `RequestLog` row is inserted (headers redacted). The response travels back through uvicorn and the Vite proxy to `fetch`.

**⑨ Display.** `sendRequest()` reads the body and computes the elapsed time. The tester shows **200 OK · 3 ms · 98 B**, pretty-prints the JSON in a read-only Monaco editor and lists the response headers.

**⑩ Everything else updates.** The Inspector polls `GET /api/logs` every 2 s and shows the new row. Clicking it calls `GET /api/logs/{id}` for full detail. The Dashboard polls `GET /api/stats` every 4 s, so the activity chart and counters change too.

Editing works the same way in reverse. When you press **⌘S** in the endpoint editor, the UI sends `PATCH /api/endpoints/{id}` with the full endpoint. The backend validates it with Pydantic (`schemas.EndpointUpdate`) and saves it in `services.update_endpoint()`. The *very next* mock request reads the new configuration in step ⑤.

---

## 8. The important files and functions

### Backend (`backend/app/`)

| File | Read it for | Key functions/classes |
| --- | --- | --- |
| `main.py` | how the app is assembled | `create_app()`: settings, DB, CORS, routers, static UI; `_mount_frontend()` |
| `config.py` | every setting and its default | `Settings.from_env()` |
| `db.py` | engine/session lifecycle | `make_engine()`, `init_schema()`, `get_db()` (FastAPI dependency) |
| `models.py` | the database tables | `Project`, `Endpoint`, `Scenario`, `RequestLog`, `Meta` |
| `schemas.py` | input validation rules | `EndpointIn`, `ScenarioIn`, `HeaderPair`, `ProjectExport` |
| `services.py` | business rules | `create_endpoint()`, `update_endpoint()`, `duplicate_endpoint()`, `import_project()` |
| `mock/matcher.py` | route parsing and matching | `parse_path()`, `normalize_path()`, `match_route()` |
| `mock/server.py` | the live mock server | `handle_mock()`, `resolve()`, `_build_mock_response()`, `write_log()` |
| `mock/templating.py` | `{{placeholders}}` | `render_json()`, `render_text()`, `validate_json_template()` |
| `mock/redaction.py` | secret masking | `redact_headers()`, `redact_body()` |
| `api/*.py` | the REST endpoints the UI calls | one router per resource |
| `seed.py` | the Acme Shop sample | `sample_endpoints()`, `seed_if_needed()` |
| `errors.py` | uniform error JSON | `AppError`, `install_error_handlers()` |

### Frontend (`frontend/src/`)

| File | Read it for |
| --- | --- |
| `App.tsx` | providers (React Query, router, tooltips, dialogs, palette) and routes |
| `api/client.ts`, `api/hooks.ts` | every server call, and caching/invalidation |
| `pages/Project.tsx` | the two-pane project screen (endpoint list + editor) |
| `components/endpoint/EndpointEditor.tsx` | the biggest component: draft state, validation, save, duplicate, failure tab |
| `components/endpoint/ScenarioEditor.tsx` | status, delay, body editor and headers for one scenario |
| `components/MonacoEditor.tsx` | Monaco setup: local bundling, custom theme, `{{template}}` highlighting, error markers |
| `pages/Tester.tsx`, `lib/tester.ts` | the API tester |
| `pages/Inspector.tsx` | the request log UI |
| `pages/Dashboard.tsx`, `components/ActivityChart.tsx` | stats and the hand-built SVG chart |
| `lib/template.ts` | the TypeScript mirror of the backend's template-aware JSON validation |
| `styles/index.css` | design tokens (colours, fonts, animations) in Tailwind v4 `@theme` |

---

## 9. Major design decisions (and why)

1. **One server, two prefixes (`/api` vs `/mock`).** This is simple to run, and the prefix boundary makes it impossible for user routes to collide with or expose admin routes.
2. **Read configuration from SQLite on every mock request** instead of caching it in memory. It's trivially correct, since edits show up instantly with no cache to invalidate. SQLite reads on a local file take microseconds, which is fine for a developer tool. If this ever became a bottleneck, the next step would be a per-project cache invalidated on save.
3. **The matcher is pure functions.** It's the trickiest logic, so it has no database or HTTP dependencies, and it's unit-tested directly.
4. **Scenarios instead of a single response.** Real APIs have several behaviours (success, not found, error). Scenarios let you flip between them with one click, or per request via a header, without retyping JSON.
5. **Template-aware JSON.** Plain string substitution would break JSON types (`"id": "42"` instead of `42`). Tracking "am I inside a string?" makes bare placeholders produce real JSON values while keeping the body valid.
6. **Safety by default.** The server is localhost-only, CORS covers only the local UI, there's no code execution, secrets are redacted before storage, header injection is blocked, and request sizes and delays are bounded.
7. **Endpoints are saved whole.** The editor sends the complete endpoint, scenarios included, on save, and the backend replaces the scenario list. That's simpler than syncing individual scenario rows and avoids half-saved states.
8. **TanStack Query for server state.** There's no Redux. Server data lives in the query cache, and local editing state lives in component `useState` (the "draft" in `EndpointEditor`).
9. **Monaco is bundled and lazy-loaded.** The JSON editor works offline (no CDN) and only downloads when an editor first appears, which keeps the first page load fast.
10. **The schema is created from the models**, with a version stamp and a migration hook instead of Alembic. That's less machinery for a single-file local app, but there's still a clear path for future changes.

---

## 10. What to study first

A suggested order. Each step builds on the last.

1. **Use the app for 10 minutes.** Open the Acme Shop project, change a response, hit it from the tester, watch the inspector. Concrete experience makes the code much easier to read.
2. **`backend/app/mock/matcher.py` + `backend/tests/test_matcher.py`.** These are small, pure and central. Try adding a test case.
3. **`backend/app/mock/server.py` → `handle_mock()`.** Read it alongside the walkthrough in section 7.
4. **`backend/app/models.py` then `schemas.py`.** These show the difference between the *storage* shape (models) and the *API* shape (schemas).
5. **`backend/app/services.py` + `api/endpoints.py`.** See how a `PATCH` request becomes a database update.
6. **`frontend/src/api/client.ts` and `hooks.ts`.** These show how the UI talks to all of the above.
7. **`frontend/src/components/endpoint/EndpointEditor.tsx`.** This shows how a real form manages draft state, validation and saving.

Background topics worth reading about: HTTP methods and status codes, REST, FastAPI dependencies and Pydantic validation, SQLAlchemy ORM relationships, React hooks (`useState`, `useEffect`, `useMemo`), and TanStack Query's "queries vs mutations".

---

## 11. How to run the tests

```bash
make test        # backend pytest + frontend type-check and vitest
make smoke       # spins up a real server on a temp DB and checks the 12 core scenarios
make dev         # in one terminal…
make e2e         # …and this in another: a real browser walkthrough with Playwright
```

`make e2e` needs Playwright and Chromium installed. They were preinstalled in the environment where this was built. Locally: `npm i -g playwright && npx playwright install chromium`.

---

## 12. Ideas for next steps

- Request matching on query parameters, headers or body fields (conditional scenarios)
- Stateful mocks (an in-memory "collection" so `POST` then `GET` sees the new item)
- Server-sent events instead of polling for the live inspector
- Import from OpenAPI/Swagger documents
- Proxy mode: forward unmatched requests to a real API and record the responses as scenarios
