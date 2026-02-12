import type { RealtimeClientMessage } from "@mango/contracts"
import type { Server, ServerWebSocket, WebSocketHandler } from "bun"
import { readBearerTokenFromHeader } from "../auth/session"
import { error } from "../http/response"
import type { RouteContext } from "../router-context"
import type { SocketData } from "./hub"

function encode(payload: unknown): string {
  return JSON.stringify(payload)
}

function decode(payload: string | Buffer | ArrayBuffer | Uint8Array): string {
  if (typeof payload === "string") {
    return payload
  }

  if (payload instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(payload))
  }

  if (ArrayBuffer.isView(payload)) {
    return new TextDecoder().decode(payload)
  }

  return String(payload)
}

function readTokenFromWebSocketRequest(request: Request): string | null {
  const url = new URL(request.url)
  const fromQuery = url.searchParams.get("token")
  if (fromQuery) {
    return fromQuery
  }
  return readBearerTokenFromHeader(request)
}

async function handleClientMessage(
  ws: ServerWebSocket<SocketData>,
  payload: string | Buffer | ArrayBuffer | Uint8Array,
  ctx: RouteContext
): Promise<void> {
  let parsed: RealtimeClientMessage
  try {
    parsed = JSON.parse(decode(payload)) as RealtimeClientMessage
  } catch {
    ws.send(encode({ type: "error", error: "Invalid JSON message." }))
    return
  }

  if (parsed.type === "ping") {
    ws.send(encode({ type: "pong" }))
    return
  }

  if (!("channelId" in parsed) || !parsed.channelId) {
    ws.send(encode({ type: "error", error: "channelId is required." }))
    return
  }

  const channel = await ctx.store.getChannelById(parsed.channelId)
  if (!channel) {
    ws.send(encode({ type: "error", error: "Channel not found." }))
    return
  }

  const canRead = await ctx.store.hasChannelPermission(channel.id, ws.data.userId, "read_messages")
  if (!canRead) {
    ws.send(encode({ type: "error", error: "Not authorized for this channel." }))
    return
  }

  if (parsed.type === "subscribe") {
    ctx.realtimeHub.addSubscription(ws, parsed.channelId)
    return
  }

  if (parsed.type === "unsubscribe") {
    ctx.realtimeHub.removeSubscription(ws, parsed.channelId)
  }
}

export async function tryUpgradeToWebSocket(
  request: Request,
  server: Server<SocketData>,
  ctx: RouteContext
): Promise<Response | undefined> {
  const token = readTokenFromWebSocketRequest(request)
  if (!token) {
    return error(ctx.corsOrigin, 401, "Missing websocket auth token.")
  }

  const userId = await ctx.store.getUserIdByToken(token)
  if (!userId) {
    return error(ctx.corsOrigin, 401, "Invalid websocket auth token.")
  }

  const upgraded = server.upgrade(request, {
    data: {
      userId,
      subscriptions: new Set<string>()
    }
  })

  if (!upgraded) {
    return error(ctx.corsOrigin, 500, "WebSocket upgrade failed.")
  }

  return undefined
}

export function createWebSocketHandlers(ctx: RouteContext): WebSocketHandler<SocketData> {
  return {
    open(ws) {
      ws.send(
        encode({
          type: "ready",
          userId: ws.data.userId
        })
      )
    },
    close(ws) {
      ctx.realtimeHub.removeSocket(ws)
    },
    message(ws, payload) {
      void handleClientMessage(ws, payload, ctx)
    }
  }
}
