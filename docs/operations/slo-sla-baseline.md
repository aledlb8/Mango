# SLO/SLA Baseline

## Product SLO Targets
- API error rate: `< 0.5%`
- Message delivery latency (p99, online recipients): `<= 300ms`
- Voice join success rate: `>= 98%`
- Crash-free web sessions: `>= 99.5%`

## Measurement
- Source metrics:
  - `mango_api_requests_total`
  - `mango_api_request_errors_total`
  - `mango_api_request_duration_ms_*`
- Review cadence: weekly
- SLO owner: platform engineering

## Incident SLA (Internal)
- `SEV-1`: acknowledge within 5 minutes
- `SEV-2`: acknowledge within 15 minutes
- `SEV-3`: acknowledge within 60 minutes

## Reporting
- Weekly SLO summary posted to engineering channel.
- Monthly availability report added to release review notes.
