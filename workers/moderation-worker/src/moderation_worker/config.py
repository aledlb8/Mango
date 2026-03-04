from __future__ import annotations

from dataclasses import dataclass
from os import getenv


def _parse_bool(raw: str | None, *, default: bool) -> bool:
    if raw is None:
        return default
    value = raw.strip().lower()
    if value in {"1", "true", "yes", "on"}:
        return True
    if value in {"0", "false", "no", "off"}:
        return False
    return default


@dataclass(frozen=True)
class WorkerConfig:
    api_base_url: str
    admin_api_key: str
    batch_size: int
    poll_interval_seconds: float
    request_timeout_seconds: float
    dry_run: bool


def load_config() -> WorkerConfig:
    poll_interval_ms = max(1_000, int(getenv("MODERATION_WORKER_POLL_INTERVAL_MS", "30000")))
    request_timeout_ms = max(500, int(getenv("MODERATION_WORKER_REQUEST_TIMEOUT_MS", "5000")))
    batch_size = max(1, int(getenv("MODERATION_WORKER_BATCH_SIZE", "25")))

    return WorkerConfig(
        api_base_url=getenv("MODERATION_WORKER_API_BASE_URL", "http://localhost:3001").rstrip("/"),
        admin_api_key=getenv("MODERATION_WORKER_ADMIN_API_KEY", "").strip(),
        batch_size=batch_size,
        poll_interval_seconds=poll_interval_ms / 1000,
        request_timeout_seconds=request_timeout_ms / 1000,
        dry_run=_parse_bool(getenv("MODERATION_WORKER_DRY_RUN"), default=False),
    )
