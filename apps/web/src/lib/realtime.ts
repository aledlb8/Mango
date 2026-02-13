import type {
  DirectThread,
  Message,
  MessageReactionSummary,
  PresenceState,
  TypingIndicator,
  VoiceSession
} from "./api"

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001"
const WS_BASE =
  process.env.NEXT_PUBLIC_WS_BASE_URL ?? API_BASE.replace(/^http:\/\//, "ws://").replace(/^https:\/\//, "wss://")

export type RealtimeStatus = "disconnected" | "connecting" | "connected"

export type RealtimeServerMessage =
  | {
      type: "ready"
      userId: string
    }
  | {
      type: "subscribed"
      channelId: string
    }
  | {
      type: "unsubscribed"
      channelId: string
    }
  | {
      type: "message.created"
      payload: Message
    }
  | {
      type: "direct-thread.created"
      payload: DirectThread
    }
  | {
      type: "message.updated"
      payload: Message
    }
  | {
      type: "message.deleted"
      payload: {
        id: string
        channelId: string
        conversationId: string
        directThreadId: string | null
      }
    }
  | {
      type: "reaction.updated"
      payload: {
        conversationId: string
        directThreadId: string | null
        messageId: string
        reactions: MessageReactionSummary[]
      }
    }
  | {
      type: "typing.updated"
      payload: TypingIndicator
    }
  | {
      type: "presence.updated"
      payload: PresenceState
    }
  | {
      type: "voice.session.updated"
      payload: VoiceSession
    }
  | {
      type: "pong"
    }
  | {
      type: "error"
      error: string
    }

export function createRealtimeSocket(token: string): WebSocket {
  const url = new URL("/v1/ws", WS_BASE)
  url.searchParams.set("token", token)
  return new WebSocket(url.toString())
}

export function parseRealtimeServerMessage(payload: string): RealtimeServerMessage | null {
  try {
    return JSON.parse(payload) as RealtimeServerMessage
  } catch {
    return null
  }
}
