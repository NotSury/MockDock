"""Run with ``python -m app`` from the backend directory."""

import uvicorn

from .config import Settings


def main() -> None:
    settings = Settings.from_env()
    uvicorn.run("app.main:create_app", factory=True, host=settings.host, port=settings.port)


if __name__ == "__main__":
    main()
