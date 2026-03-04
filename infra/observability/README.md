# Observability Baseline

This directory contains baseline observability assets for Mango services.

## Metrics

- `api-gateway` exposes Prometheus metrics at `GET /metrics`.
- Metrics include:
  - `mango_api_requests_total`
  - `mango_api_request_errors_total`
  - `mango_api_request_duration_ms` (histogram)

## Alerts

- Prometheus alert rules are in `prometheus-alerts.yml`.
- These rules target API error rate and p95 latency.

## Dashboards

- `grafana-dashboard-api-gateway.json` provides a starter dashboard for:
  - request throughput
  - error rate
  - p95 latency

## Trace IDs

- `api-gateway` propagates `X-Trace-Id` and injects `traceId` into JSON error responses.
- Structured logs include trace ID, latency, status, and path fields.
