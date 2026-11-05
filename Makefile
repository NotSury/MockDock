# MockDock — common tasks. Run `make help` for the list.
PY      ?= python3
VENV    := backend/.venv
VPY     := $(VENV)/bin/python

.PHONY: help install dev build start test test-backend test-frontend smoke e2e

help:
	@echo "make install        Create the Python venv and install all dependencies"
	@echo "make dev            Run API (:8000) + UI dev server (:5173) with hot reload"
	@echo "make build          Build the production UI into frontend/dist"
	@echo "make start          Build the UI, then serve everything from http://127.0.0.1:8000"
	@echo "make test           Backend (pytest) + frontend (vitest) tests and type-check"
	@echo "make smoke          Boot a real server on a temp DB and verify the core scenarios"
	@echo "make e2e            Browser walkthrough (needs 'make dev' or 'make start' running)"

$(VPY):
	$(PY) -m venv $(VENV)

install: $(VPY)
	$(VPY) -m pip install -r backend/requirements-dev.txt
	cd frontend && npm install

dev:
	./scripts/dev.sh

build:
	cd frontend && npm run build

start: build
	cd backend && .venv/bin/python -m app

test: test-backend test-frontend

test-backend:
	cd backend && .venv/bin/pytest

test-frontend:
	cd frontend && npm run typecheck && npm test

smoke:
	$(VPY) scripts/live_smoke.py

e2e:
	node e2e/ui-workflow.cjs $${URL:-http://127.0.0.1:5173}
