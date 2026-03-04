# Mango Runbooks: Top 10 Failures

This runbook is the first-response guide for common production incidents.

## 1. API 5xx spike
- Symptom: `mango_api_request_errors_total` ratio > 5%.
- Triage:
  - Check recent deploys and config changes.
  - Inspect `api-gateway` structured logs filtered by `traceId`.
  - Confirm downstream service health (`identity`, `community`, `messaging`, `realtime-gateway`).
- Mitigation:
  - Roll back last deploy if regression is clear.
  - Temporarily disable unstable feature flags.
  - Route traffic away from affected node.

## 2. API latency regression
- Symptom: p95 latency alert firing.
- Triage:
  - Inspect per-route latency and error mix.
  - Check DB saturation and lock contention.
  - Check worker queue buildup and retry storms.
- Mitigation:
  - Scale API replicas.
  - Reduce heavy endpoint traffic via rate limiting.
  - Run emergency index rollout for the hottest query.

## 3. WebSocket fanout delay/drop
- Symptom: delayed or missing realtime events.
- Triage:
  - Check `realtime-gateway` health and connection count.
  - Verify internal publish endpoint success (`/internal/realtime/events`).
  - Validate identity auth path for websocket token verification.
- Mitigation:
  - Drain and restart unhealthy realtime instance.
  - Shift fanout to healthy instances.
  - Temporarily reduce high-volume non-critical events.

## 4. Notification queue lag
- Symptom: pending notifications growing, delayed push delivery.
- Triage:
  - Inspect `notification-worker` logs for retry/failure patterns.
  - Check queue depth and oldest pending age.
  - Validate VAPID configuration.
- Mitigation:
  - Scale worker replicas.
  - Purge permanently expired subscriptions.
  - Increase batch size only after DB/load validation.

## 5. Auth failures spike
- Symptom: increased `401`/`403` on auth-sensitive routes.
- Triage:
  - Check identity-service health and DB reachability.
  - Validate session TTL and refresh-token rotation path.
  - Check client clock skew and cookie/token handling.
- Mitigation:
  - Restore healthy identity instance pool.
  - Temporarily increase token TTL if outage persists.
  - Force re-auth only if token validation is corrupted.

## 6. Database saturation
- Symptom: connection pool exhaustion, query timeouts.
- Triage:
  - Identify top slow queries and blocked transactions.
  - Validate migration status and schema/index drift.
  - Check resource pressure (CPU, memory, I/O).
- Mitigation:
  - Scale DB vertically or read replicas.
  - Kill pathological long-running queries.
  - Disable non-essential write-heavy jobs.

## 7. Presence service degradation
- Symptom: users shown offline/idle incorrectly.
- Triage:
  - Verify presence heartbeat request success rates.
  - Check Redis connectivity and key expiry behavior.
  - Validate gateway -> presence proxy path.
- Mitigation:
  - Restart unhealthy presence nodes.
  - Short-term fallback to stale-presence tolerance in UI.

## 8. Voice join failures
- Symptom: call join success drops below SLO.
- Triage:
  - Check voice-signaling service logs and token issuance.
  - Verify LiveKit reachability and room creation latency.
  - Confirm client ICE/TURN setup signals.
- Mitigation:
  - Failover to healthy signaling nodes.
  - Disable optional voice features (for example screen share) temporarily.
  - Roll back recent signaling changes.

## 9. Moderation pipeline backlog
- Symptom: reports/appeals remain unreviewed for too long.
- Triage:
  - Inspect moderation-worker poll/throughput and error rates.
  - Verify admin API key and API response times.
  - Check report volume anomalies (abuse wave).
- Mitigation:
  - Scale moderation-worker.
  - Enable stricter auto-triage thresholds temporarily.
  - Prioritize high-severity report classes.

## 10. Deploy rollback procedure
- Trigger: severe regression after release.
- Steps:
  - Freeze further deploys.
  - Roll back service(s) to last known-good revision.
  - Validate health checks + critical user journeys.
  - Keep incident channel open until metrics stabilize.

## Incident Commands
- Full quality gate pre-hotfix release: `bun run lint && bun run test`
- Contract validation: `bun run test:contract`
- E2E smoke: `bun run test:e2e`
- Load smoke: `bun run test:load`
