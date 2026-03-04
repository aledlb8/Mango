import type {
  DirectThread,
  Message,
  MessageDeletedEvent,
  MessageReactionSummary,
  PresenceState,
  TypingIndicator,
  VoiceSession
} from "@mango/contracts"

type RealtimePublishEvent = {
  type: string
  payload: unknown
  conversationId?: string
  recipientUserIds?: string[]
}

export interface RealtimePublisher {
  publishMessageCreated(message: Message, recipientUserIds?: string[]): void
  publishDirectThreadCreated(thread: DirectThread): void
  publishMessageUpdated(message: Message): void
  publishMessageDeleted(payload: MessageDeletedEvent): void
  publishReactionUpdated(
    conversationId: string,
    directThreadId: string | null,
    messageId: string,
    reactions: MessageReactionSummary[]
  ): void
  publishTypingUpdated(conversationId: string, payload: TypingIndicator): void
  publishPresenceUpdated(payload: PresenceState, recipientUserIds: string[]): void
  publishVoiceSessionUpdated(session: VoiceSession, serverMemberIds?: string[]): void
}

const publishTimeoutMs = 1_000

function uniqIds(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))
  )
}

function reasonMessage(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message
  }

  return "Unknown publish error."
}

export class HttpRealtimePublisher implements RealtimePublisher {
  private readonly endpoint: string

  constructor(
    realtimeGatewayUrl: string,
    private readonly internalApiKey: string
  ) {
    this.endpoint = `${realtimeGatewayUrl.replace(/\/+$/, "")}/internal/realtime/events`
  }

  publishMessageCreated(message: Message, recipientUserIds: string[] = []): void {
    this.dispatch({
      type: "message.created",
      payload: message,
      conversationId: message.conversationId,
      recipientUserIds
    })
  }

  publishDirectThreadCreated(thread: DirectThread): void {
    this.dispatch({
      type: "direct-thread.created",
      payload: thread,
      conversationId: thread.id,
      recipientUserIds: thread.participantIds
    })
  }

  publishMessageUpdated(message: Message): void {
    this.dispatch({
      type: "message.updated",
      payload: message,
      conversationId: message.conversationId
    })
  }

  publishMessageDeleted(payload: MessageDeletedEvent): void {
    this.dispatch({
      type: "message.deleted",
      payload,
      conversationId: payload.conversationId
    })
  }

  publishReactionUpdated(
    conversationId: string,
    directThreadId: string | null,
    messageId: string,
    reactions: MessageReactionSummary[]
  ): void {
    this.dispatch({
      type: "reaction.updated",
      payload: {
        conversationId,
        directThreadId,
        messageId,
        reactions
      },
      conversationId
    })
  }

  publishTypingUpdated(conversationId: string, payload: TypingIndicator): void {
    this.dispatch({
      type: "typing.updated",
      payload,
      conversationId
    })
  }

  publishPresenceUpdated(payload: PresenceState, recipientUserIds: string[]): void {
    this.dispatch({
      type: "presence.updated",
      payload,
      recipientUserIds: uniqIds([payload.userId, ...recipientUserIds])
    })
  }

  publishVoiceSessionUpdated(session: VoiceSession, serverMemberIds: string[] = []): void {
    const recipients = uniqIds([
      ...session.participants.map((participant) => participant.userId),
      ...serverMemberIds
    ])

    this.dispatch({
      type: "voice.session.updated",
      payload: session,
      conversationId: session.targetId,
      recipientUserIds: recipients
    })
  }

  private dispatch(event: RealtimePublishEvent): void {
    void this.send(event).catch((reason) => {
      console.error(
        `[api-gateway] Failed to publish realtime event ${event.type}: ${reasonMessage(reason)}`
      )
    })
  }

  private async send(event: RealtimePublishEvent): Promise<void> {
    const abortController = new AbortController()
    const timeout = setTimeout(() => abortController.abort(), publishTimeoutMs)

    const headers: HeadersInit = {
      "Content-Type": "application/json"
    }

    if (this.internalApiKey.trim().length > 0) {
      headers["X-Realtime-Internal-Key"] = this.internalApiKey
    }

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(event),
        signal: abortController.signal
      })

      if (response.ok) {
        return
      }

      const payload = await response.text()
      throw new Error(`status ${response.status}: ${payload || "empty response"}`)
    } finally {
      clearTimeout(timeout)
    }
  }
}
