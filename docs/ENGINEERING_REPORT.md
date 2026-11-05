# MockDock: Engineering Report

This report covers the overnight build. All results below come from commands actually run in the build environment: Linux, Python 3.13, Node 22, headless Chromium via Playwright.

## 1. Delivered

| Deliverable | Location |
| --- | --- |
| FastAPI backend: management API, live mock server, request logging, stats | `backend/app/` |
| SQLite persistence with reproducible, versioned schema init + seeded sample | `backend/app/models.py`, `db.py`, `seed.py` |
| React + TypeScript + Tailwind + Monaco studio UI | `frontend/src/` |
| Automated tests (backend, frontend, live smoke, browser walkthrough) | `backend/tests/`, `frontend/src/test/`, `scripts/live_smoke.py`, `e2e/ui-workflow.cjs` |
| One-command workflows | `Makefile`, `scripts/dev.sh` |
| CI workflow (pytest, smoke, type-check, vitest, build) | `.github/workflows/ci.yml` (not run: no CI in this environment) |
| Documentation | `README.md`, `HANDOVER.md`, this file |

## 2. Verification results

### Automated suites

| Suite | Command | Result |
| --- | --- | --- |
| Backend unit + integration | `cd backend && .venv/bin/pytest` | **79 passed** |
| Frontend type-check | `cd frontend && npx tsc -b` | **0 errors** (strict mode) |
| Frontend unit + component | `cd frontend && npm test` | **36 passed** |
| Frontend production build | `npm run build` | **success** (Monaco is lazy-loaded; main chunk ≈ 480 kB / 149 kB gzip) |
| Live server smoke test | `make smoke` | **12/12 checks passed** |
| Browser walkthrough (dev server, :5173) | `node e2e/ui-workflow.cjs` | **passed** |
| Browser walkthrough (built UI served by FastAPI, :8000) | `node e2e/ui-workflow.cjs http://127.0.0.1:8000` | **passed** |

### The 12 required scenarios

| # | Scenario | Verified by |
| --- | --- | --- |
| 1 | Create a project | smoke #1, e2e (UI dialog), `test_projects_api.py` |
| 2 | Create a mock GET endpoint | smoke #2, e2e (typed into Monaco), `test_endpoints_api.py` |
| 3 | Send a real HTTP request | smoke #3 (real uvicorn process over TCP), e2e (API tester) |
| 4 | Verify configured JSON | smoke #4, e2e asserts `{"id": 42, "name": "Alice"}` |
| 5 | Modify response, verify change | smoke #5, e2e (status → 201, saved with ⌘S, re-fetched), `test_changes_apply_without_restart` |
| 6 | POST with JSON body | smoke #6 (`{{body.name}}` echo), `test_post_with_json_body_and_templating` |
| 7 | Artificial delay | smoke #7 (754 ms measured for a 750 ms delay), `test_artificial_delay`, `test_delay_is_capped_by_settings` |
| 8 | Simulated server errors | smoke #8 (500 via scenario, 503 via 100% random failure), e2e (failure slider), `test_error_scenarios` (400/401/404/500), `test_random_failures` |
| 9 | Request logging | smoke #9 (incl. `Bearer [REDACTED]`), e2e (inspector rows + detail), `test_request_logging_with_redaction` |
| 10 | Persistence after restart | smoke #10 (real server stopped and restarted on the same DB file), `test_configuration_persists_across_restart` |
| 11 | Invalid inputs and missing endpoints | smoke #11 (422, 422, 422, 409, 404, 404, 405), `test_endpoint_validation` (14 invalid cases), `test_unknown_project_route_and_method` |
| 12 | Frontend build and backend tests | table above |

### Manual and visual checks (headless Chromium screenshots, reviewed)

- I reviewed the dashboard, projects, endpoint editor (responses and failure tabs), tester, inspector, command palette and new-project dialog at 1440×900.
- I checked the dashboard, editor and inspector at iPhone 13 size. No horizontal page overflow was measured on the inspector.
- I checked these behaviours: the duplicate-route error banner and toast, inline path validation, and the "discard unsaved changes" confirmation.
- No console errors appeared during the walkthroughs, apart from the expected network errors for requests the tests deliberately sent to 404/500 mocks.

Problems found this way and fixed:

| Problem | Fix |
| --- | --- |
| Monaco flagged valid bare `{{placeholders}}` | Built-in JSON diagnostics replaced with template-aware markers |
| Word-suggestion popups got in the way of typing | Turned off |
| Logo gradient broke in the mobile header (duplicate SVG id) | Unique gradient ids |
| Inspector time column wrapped | Fixed width, no wrapping |
| Tester editors didn't fill their panels | Editors now fill the available height |
| Dashboard advertised the dev-proxy URL instead of the real server address | Dashboard now shows the server's own address |
| Stale project queries refetched after delete (404 noise) | Queries for a deleted project are removed |

## 3. Engineering review: weaknesses found and fixed

| Finding | Fix |
| --- | --- |
| Templates could echo secrets (e.g. `{{body.password}}`) into the *logged* response body | Response bodies are now redacted before logging too (`test_echoed_secrets_are_redacted_in_logged_response`) |
| Redaction re-serialised every JSON body, changing its formatting | The original text is kept when nothing sensitive was found |
| `{{ and }}` in normal text was swallowed as an unknown placeholder | Only recognised expressions are substituted |
| Stats buckets could drop the newest requests (window misaligned) | Buckets aligned so the last one contains "now" |
| `range` query parameter shadowed a Python builtin and crashed | Renamed with a FastAPI alias |
| Newly created or duplicated endpoint briefly showed "not found" | The query cache is updated immediately on success |
| Browsers' `JSON.parse` errors often lack a position | Small JSON syntax checker that reports the exact offset |
| Static UI serving | Path traversal tested (`test_static_serving_does_not_escape_dist`) |

Security posture:

- The server binds to 127.0.0.1, and CORS allows only the local UI origins (tested, including a rejected preflight).
- The mock namespace is isolated from `/api` (tested, including encoded `..` traversal).
- There's no code execution in templating.
- Header CR/LF injection and overriding hop-by-hop headers are rejected.
- Request bodies are capped at 1 MB (413), and delays are capped.
- No secrets live in the repository.

## 4. Not tested or not done

- **CI workflow**: written but never run (no GitHub Actions here).
- **Other environments**: no testing on Windows or macOS, or on Python versions other than 3.13. CI targets 3.12.
- **Browsers**: only headless Chromium was used. Firefox and Safari weren't tried.
- **Accessibility**: no screen-reader audit was done. Controls have labels and roles, and focus rings are visible, but this hasn't been checked with assistive tech.
- **Load**: there's no load or performance testing beyond basic latency observations (2–6 ms per mock request locally).
- **Import UI**: the drag-and-drop import UI wasn't exercised in the browser. The import API is covered by tests.

## 5. Known limitations and remaining issues

- There's no authentication. It's a single-user local tool and must not be exposed to untrusted networks.
- Mocks are stateless, and matching is on method + path only (no query/header/body conditions).
- Live views poll every 2–4 s instead of pushing updates.
- The unsaved-changes guard covers switching endpoints and closing the tab, but not sidebar navigation.
- The Monaco bundle is large (≈ 2.7 MB raw for the editor core). It's lazy-loaded, but the first editor open takes a moment.
- `npm audit` reports advisories in transitive dev dependencies. They weren't investigated, and they don't affect the runtime bundle.

## 6. Recommended next steps

1. Conditional matching rules (query/header/body) and stateful "collection" mocks.
2. Server-sent events for the inspector and dashboard.
3. OpenAPI import and export.
4. A record/proxy mode that forwards unmatched requests to a real API and saves the responses as scenarios.
5. A router-level navigation blocker (move to a data router) for full unsaved-change protection.
6. Run CI on GitHub and add Firefox/WebKit to the Playwright walkthrough.
