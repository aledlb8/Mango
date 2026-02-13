import type {
  DirectThread,
  Message,
  MessageDeletedEvent,
  PresenceState,
  MessageReactionSummary,
  TypingIndicator
} from "@mango/contracts"
import type { ServerWebSocket } from "bun"

export type SocketData = {
  userId: string
  subscriptions: Set<string>
}

function stringify(payload: unknown): string {
  return JSON.stringify(payload)
}

export class RealtimeHub {
  private readonly conversationSockets = new Map<string, Set<ServerWebSocket<SocketData>>>()
  private readonly userSockets = new Map<string, Set<ServerWebSocket<SocketData>>>()

  registerSocket(ws: ServerWebSocket<SocketData>): void {
    let sockets = this.userSockets.get(ws.data.userId)
    if (!sockets) {
      sockets = new Set<ServerWebSocket<SocketData>>()
      this.userSockets.set(ws.data.userId, sockets)
    }

    sockets.add(ws)
  }

  addSubscription(ws: ServerWebSocket<SocketData>, conversationId: string): void {
    let sockets = this.conversationSockets.get(conversationId)
    if (!sockets) {
      sockets = new Set<ServerWebSocket<SocketData>>()
      this.conversationSockets.set(conversationId, sockets)
    }

    sockets.add(ws)
    ws.data.subscriptions.add(conversationId)
    ws.send(stringify({ type: "subscribed", channelId: conversationId }))
  }

  removeSubscription(ws: ServerWebSocket<SocketData>, conversationId: string): void {
    const sockets = this.conversationSockets.get(conversationId)
    if (sockets) {
      sockets.delete(ws)
      if (sockets.size === 0) {
        this.conversationSockets.delete(conversationId)
      }
    }

    ws.data.subscriptions.delete(conversationId)
    ws.send(stringify({ type: "unsubscribed", channelId: conversationId }))
  }

  removeSocket(ws: ServerWebSocket<SocketData>): void {
    for (const conversationId of ws.data.subscriptions) {
      const sockets = this.conversationSockets.get(conversationId)
      if (!sockets) {
        continue
      }

      sockets.delete(ws)
      if (sockets.size === 0) {
        this.conversationSockets.delete(conversationId)
      }
    }

    ws.data.subscriptions.clear()

    const userSockets = this.userSockets.get(ws.data.userId)
    if (!userSockets) {
      return
    }

    userSockets.delete(ws)
    if (userSockets.size === 0) {
      this.userSockets.delete(ws.data.userId)
    }
  }

  private collectSockets(
    conversationId: string,
    recipientUserIds: string[] = []
  ): Set<ServerWebSocket<SocketData>> {
    const targets = new Set<ServerWebSocket<SocketData>>()

    const subscribedSockets = this.conversationSockets.get(conversationId)
    if (subscribedSockets) {
      for (const socket of subscribedSockets) {
        targets.add(socket)
      }
    }

    for (const userId of recipientUserIds) {
      const userSockets = this.userSockets.get(userId)
      if (!userSockets) {
        continue
      }

      for (const socket of userSockets) {
        targets.add(socket)
      }
    }

    return targets
  }

  private publishToTargets(
    conversationId: string,
    payload: unknown,
    recipientUserIds: string[] = []
  ): void {
    const targets = this.collectSockets(conversationId, recipientUserIds)
    if (targets.size === 0) {
      return
    }

    const encoded = stringify(payload)
    for (const socket of targets) {
      socket.send(encoded)
    }
  }

  publishMessageCreated(message: Message, recipientUserIds: string[] = []): void {
    this.publishToTargets(message.conversationId, {
      type: "message.created",
      payload: message
    }, recipientUserIds)
  }

  publishDirectThreadCreated(thread: DirectThread): void {
    this.publishToTargets(
      thread.id,
      {
        type: "direct-thread.created",
        payload: thread
      },
      thread.participantIds
    )
  }

  publishMessageUpdated(message: Message): void {
    this.publishToTargets(message.conversationId, {
      type: "message.updated",
      payload: message
    })
  }

  publishMessageDeleted(payload: MessageDeletedEvent): void {
    this.publishToTargets(payload.conversationId, {
      type: "message.deleted",
      payload
    })
  }

  publishReactionUpdated(
    conversationId: string,
    directThreadId: string | null,
    messageId: string,
    reactions: MessageReactionSummary[]
  ): void {
    this.publishToTargets(conversationId, {
      type: "reaction.updated",
      payload: {
        conversationId,
        directThreadId,
        messageId,
        reactions
      }
    })
  }

  publishTypingUpdated(conversationId: string, payload: TypingIndicator): void {
    this.publishToTargets(conversationId, {
      type: "typing.updated",
      payload
    })
  }

  publishPresenceUpdated(payload: PresenceState, recipientUserIds: string[]): void {
    const targets = new Set<ServerWebSocket<SocketData>>()
    const recipients = new Set<string>([payload.userId, ...recipientUserIds])

    for (const userId of recipients) {
      const sockets = this.userSockets.get(userId)
      if (!sockets) {
        continue
      }

      for (const socket of sockets) {
        targets.add(socket)
      }
    }

    if (targets.size === 0) {
      return
    }

    const encoded = stringify({
      type: "presence.updated",
      payload
    })

    for (const socket of targets) {
      socket.send(encoded)
    }
  }
}
