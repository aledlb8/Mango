type CounterKey = string
type HistogramKey = string

const defaultBucketsMs = [5, 10, 25, 50, 100, 250, 500, 1_000, 2_000, 5_000]

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

function labels(method: string, path: string): string {
  return `method="${escapeLabel(method)}",path="${escapeLabel(path)}"`
}

export class ApiGatewayMetrics {
  private readonly requestCountByStatus = new Map<CounterKey, number>()
  private readonly requestErrors = new Map<CounterKey, number>()
  private readonly requestDurationCount = new Map<HistogramKey, number>()
  private readonly requestDurationSum = new Map<HistogramKey, number>()
  private readonly requestDurationBuckets = new Map<HistogramKey, Map<number, number>>()

  recordRequest(method: string, path: string, status: number, durationMs: number): void {
    const key = `${method}|${path}|${status}`
    this.requestCountByStatus.set(key, (this.requestCountByStatus.get(key) ?? 0) + 1)

    if (status >= 400) {
      const errorKey = `${method}|${path}`
      this.requestErrors.set(errorKey, (this.requestErrors.get(errorKey) ?? 0) + 1)
    }

    const histogramKey = `${method}|${path}`
    this.requestDurationCount.set(histogramKey, (this.requestDurationCount.get(histogramKey) ?? 0) + 1)
    this.requestDurationSum.set(histogramKey, (this.requestDurationSum.get(histogramKey) ?? 0) + durationMs)

    let buckets = this.requestDurationBuckets.get(histogramKey)
    if (!buckets) {
      buckets = new Map<number, number>()
      for (const bucket of defaultBucketsMs) {
        buckets.set(bucket, 0)
      }
      this.requestDurationBuckets.set(histogramKey, buckets)
    }

    for (const bucket of defaultBucketsMs) {
      if (durationMs <= bucket) {
        buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1)
      }
    }
  }

  renderPrometheus(): string {
    const lines: string[] = []

    lines.push("# HELP mango_api_requests_total Total API requests by status.")
    lines.push("# TYPE mango_api_requests_total counter")
    for (const [key, count] of this.requestCountByStatus.entries()) {
      const [method, path, status] = key.split("|")
      lines.push(
        `mango_api_requests_total{${labels(method, path)},status="${escapeLabel(status)}"} ${count}`
      )
    }

    lines.push("# HELP mango_api_request_errors_total Total API request errors.")
    lines.push("# TYPE mango_api_request_errors_total counter")
    for (const [key, count] of this.requestErrors.entries()) {
      const [method, path] = key.split("|")
      lines.push(`mango_api_request_errors_total{${labels(method, path)}} ${count}`)
    }

    lines.push("# HELP mango_api_request_duration_ms API request duration in milliseconds.")
    lines.push("# TYPE mango_api_request_duration_ms histogram")
    for (const [key, buckets] of this.requestDurationBuckets.entries()) {
      const [method, path] = key.split("|")
      const labelBase = labels(method, path)

      let cumulative = 0
      for (const bucket of defaultBucketsMs) {
        cumulative = buckets.get(bucket) ?? cumulative
        lines.push(
          `mango_api_request_duration_ms_bucket{${labelBase},le="${bucket}"} ${cumulative}`
        )
      }

      const count = this.requestDurationCount.get(key) ?? 0
      const sum = this.requestDurationSum.get(key) ?? 0
      lines.push(`mango_api_request_duration_ms_bucket{${labelBase},le="+Inf"} ${count}`)
      lines.push(`mango_api_request_duration_ms_count{${labelBase}} ${count}`)
      lines.push(`mango_api_request_duration_ms_sum{${labelBase}} ${sum}`)
    }

    return `${lines.join("\n")}\n`
  }
}
