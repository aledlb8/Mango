from __future__ import annotations

from .api_client import APIClient
from .config import load_config
from .worker import ModerationWorker


def main() -> None:
    config = load_config()
    if not config.admin_api_key:
        raise SystemExit("MODERATION_WORKER_ADMIN_API_KEY is required.")

    worker = ModerationWorker(
        config=config,
        api_client=APIClient(
            base_url=config.api_base_url,
            admin_api_key=config.admin_api_key,
            timeout_seconds=config.request_timeout_seconds,
        ),
    )
    worker.run_forever()


if __name__ == "__main__":
    main()
