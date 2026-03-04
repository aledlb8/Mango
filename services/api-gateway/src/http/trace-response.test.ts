import { describe, expect, it } from "bun:test"
import { withTraceResponse } from "./trace-response"

describe("withTraceResponse", () => {
  it("adds trace header to all responses", async () => {
    const response = new Response("ok", { status: 200 })
    const traced = await withTraceResponse(response, "trace-1", false)

    expect(traced.headers.get("x-trace-id")).toBe("trace-1")
    expect(await traced.text()).toBe("ok")
  })

  it("injects traceId into JSON error payloads when enabled", async () => {
    const response = Response.json(
      {
        error: "Unauthorized."
      },
      { status: 401 }
    )

    const traced = await withTraceResponse(response, "trace-401", true)
    const body = (await traced.json()) as { error: string; traceId?: string }

    expect(traced.headers.get("x-trace-id")).toBe("trace-401")
    expect(body.error).toBe("Unauthorized.")
    expect(body.traceId).toBe("trace-401")
  })

  it("preserves existing traceId fields in JSON error payloads", async () => {
    const response = Response.json(
      {
        error: "Bad request.",
        traceId: "existing-trace"
      },
      { status: 400 }
    )

    const traced = await withTraceResponse(response, "new-trace", true)
    const body = (await traced.json()) as { traceId: string }

    expect(body.traceId).toBe("existing-trace")
    expect(traced.headers.get("x-trace-id")).toBe("new-trace")
  })
})
