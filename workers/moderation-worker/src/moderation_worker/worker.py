from __future__ import annotations

import time
from dataclasses import dataclass

from .api_client import APIClient, APIClientError
from .config import WorkerConfig
from .models import SafetyAppeal, SafetyReport
from .scoring import triage_appeal_note, triage_report


@dataclass(frozen=True)
class BatchResult:
    reports_processed: int
    appeals_processed: int


class ModerationWorker:
    def __init__(self, config: WorkerConfig, api_client: APIClient) -> None:
        self._config = config
        self._api = api_client

    def run_once(self) -> BatchResult:
        reports_processed = 0
        appeals_processed = 0

        for report in self._api.list_open_reports(self._config.batch_size):
            if not report.id:
                continue

            if self._process_report(report):
                reports_processed += 1

        for appeal in self._api.list_open_appeals(self._config.batch_size):
            if not appeal.id:
                continue

            if self._process_appeal(appeal):
                appeals_processed += 1

        return BatchResult(
            reports_processed=reports_processed,
            appeals_processed=appeals_processed,
        )

    def run_forever(self) -> None:
        print(
            "[moderation-worker] started "
            f"(interval: {self._config.poll_interval_seconds:.1f}s, "
            f"batch: {self._config.batch_size}, dryRun: {self._config.dry_run})"
        )

        while True:
            started_at = time.monotonic()
            try:
                result = self.run_once()
                print(
                    "[moderation-worker] batch complete "
                    f"(reports: {result.reports_processed}, appeals: {result.appeals_processed})"
                )
            except APIClientError as exc:
                print(f"[moderation-worker] batch failed: {exc}")
            except Exception as exc:  # pragma: no cover - defensive fallback
                print(f"[moderation-worker] unexpected batch failure: {exc}")

            elapsed = time.monotonic() - started_at
            sleep_for = max(0.0, self._config.poll_interval_seconds - elapsed)
            time.sleep(sleep_for)

    def _process_report(self, report: SafetyReport) -> bool:
        decision = triage_report(report)
        note = decision.note
        if report.resolution_note == note and report.status == decision.status:
            return False

        if self._config.dry_run:
            print(
                "[moderation-worker] dry-run report triage "
                f"(report: {report.id}, status: {decision.status}, note: {note})"
            )
            return True

        self._api.update_report(report.id, decision.status, note)
        return True

    def _process_appeal(self, appeal: SafetyAppeal) -> bool:
        note = triage_appeal_note(appeal)
        if appeal.resolution_note == note:
            return False

        if self._config.dry_run:
            print(
                "[moderation-worker] dry-run appeal triage "
                f"(appeal: {appeal.id}, note: {note})"
            )
            return True

        self._api.update_appeal_note(appeal.id, note)
        return True
