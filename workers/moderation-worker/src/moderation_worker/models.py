from __future__ import annotations

from dataclasses import dataclass
from typing import Any


def _read_str(data: dict[str, Any], key: str, default: str = "") -> str:
    value = data.get(key)
    if isinstance(value, str):
        return value
    return default


def _read_nullable_str(data: dict[str, Any], key: str) -> str | None:
    value = data.get(key)
    if isinstance(value, str):
        return value
    return None


@dataclass(frozen=True)
class SafetyReport:
    id: str
    target_type: str
    reason_code: str
    details: str | None
    status: str
    resolution_note: str | None

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> "SafetyReport":
        return cls(
            id=_read_str(data, "id"),
            target_type=_read_str(data, "targetType"),
            reason_code=_read_str(data, "reasonCode").lower(),
            details=_read_nullable_str(data, "details"),
            status=_read_str(data, "status").lower(),
            resolution_note=_read_nullable_str(data, "resolutionNote"),
        )


@dataclass(frozen=True)
class SafetyAppeal:
    id: str
    report_id: str
    body: str
    status: str
    resolution_note: str | None

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> "SafetyAppeal":
        return cls(
            id=_read_str(data, "id"),
            report_id=_read_str(data, "reportId"),
            body=_read_str(data, "body"),
            status=_read_str(data, "status").lower(),
            resolution_note=_read_nullable_str(data, "resolutionNote"),
        )
