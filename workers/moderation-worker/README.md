# moderation-worker

Python safety moderation triage worker.

The worker polls open safety reports and appeals from `api-gateway`, applies
heuristic triage scoring, and writes reviewer-facing notes/status transitions.

Required env vars:

- `MODERATION_WORKER_ADMIN_API_KEY` (must match `ADMIN_API_KEY` in gateway)

Optional env vars:

- `MODERATION_WORKER_API_BASE_URL` (default: `http://localhost:3001`)
- `MODERATION_WORKER_BATCH_SIZE` (default: `25`)
- `MODERATION_WORKER_POLL_INTERVAL_MS` (default: `30000`)
- `MODERATION_WORKER_REQUEST_TIMEOUT_MS` (default: `5000`)
- `MODERATION_WORKER_DRY_RUN` (default: `false`)

Run locally:

```bash
uv sync --project workers/moderation-worker
uv run --project workers/moderation-worker moderation-worker
```

Run tests:

```bash
uv run --project workers/moderation-worker python -m unittest discover -s tests
```
