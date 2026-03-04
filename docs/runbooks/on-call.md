# On-Call Guide

## Severity
- `SEV-1`: Full outage or major data-loss/security risk. Response now.
- `SEV-2`: Major feature degradation with broad user impact. Response within 15 minutes.
- `SEV-3`: Partial degradation or limited-scope impact. Response within 1 hour.

## Response Workflow
1. Acknowledge alert and open an incident channel.
2. Assign roles: incident commander, communications owner, operations owner.
3. Stabilize first, investigate second.
4. Track timeline events with exact UTC timestamps.
5. Close incident only after metrics and key journeys are stable.

## Communications
- First update target: within 10 minutes of incident declaration.
- Update cadence:
  - `SEV-1`: every 15 minutes
  - `SEV-2`: every 30 minutes
  - `SEV-3`: every 60 minutes
- Record all customer-facing statements in the incident thread.

## Escalation
- Escalate to security immediately for any auth/session abuse or data exposure indicators.
- Escalate to database owner for sustained query timeout or connection saturation incidents.
- Escalate to voice/realtime owner for websocket or call-join SLO breaches.

## Closure Checklist
- Incident timeline complete.
- Mitigation and rollback state documented.
- Follow-up tasks filed with owners and dates.
- Postmortem scheduled within 2 business days.
