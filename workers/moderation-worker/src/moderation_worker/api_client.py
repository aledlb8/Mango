from __future__ import annotations

import json
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .models import SafetyAppeal, SafetyReport


class APIClientError(RuntimeError):
    """Raised when the moderation worker cannot complete an API call."""


@dataclass(frozen=True)
class APIClient:
    base_url: str
    admin_api_key: str
    timeout_seconds: float

    def _request(self, method: str, path: str, payload: dict | None = None) -> object:
        headers = {
            "Accept": "application/json",
            "X-Admin-Key": self.admin_api_key,
        }
        data: bytes | None = None

        if payload is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(payload).encode("utf-8")

        request = Request(
            url=f"{self.base_url}{path}",
            method=method,
            headers=headers,
            data=data,
        )

        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:  # noqa: S310
                body = response.read().decode("utf-8")
                if not body.strip():
                    return {}
                return json.loads(body)
        except HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise APIClientError(
                f"{method} {path} failed with status {exc.code}: {body or 'empty response'}"
            ) from exc
        except URLError as exc:
            raise APIClientError(f"{method} {path} failed: {exc.reason}") from exc

    def list_open_reports(self, limit: int) -> list[SafetyReport]:
        query = urlencode({"status": "open", "limit": str(limit)})
        payload = self._request("GET", f"/v1/safety/reports?{query}")
        if not isinstance(payload, list):
            return []

        reports: list[SafetyReport] = []
        for item in payload:
            if isinstance(item, dict):
                reports.append(SafetyReport.from_json(item))
        return reports

    def update_report(self, report_id: str, status: str, resolution_note: str) -> None:
        self._request(
            "PATCH",
            f"/v1/safety/reports/{report_id}",
            {
                "status": status,
                "resolutionNote": resolution_note,
            },
        )

    def list_open_appeals(self, limit: int) -> list[SafetyAppeal]:
        query = urlencode({"status": "open", "limit": str(limit)})
        payload = self._request("GET", f"/v1/safety/appeals?{query}")
        if not isinstance(payload, list):
            return []

        appeals: list[SafetyAppeal] = []
        for item in payload:
            if isinstance(item, dict):
                appeals.append(SafetyAppeal.from_json(item))
        return appeals

    def update_appeal_note(self, appeal_id: str, resolution_note: str) -> None:
        self._request(
            "PATCH",
            f"/v1/safety/appeals/{appeal_id}",
            {
                "resolutionNote": resolution_note,
            },
        )
