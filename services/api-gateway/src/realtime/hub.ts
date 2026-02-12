import type { Message, MessageDeletedEvent, MessageReactionSummary } from "@mango/contracts"
import type { ServerWebSocket } from "bun"

export type SocketData = {
  userId: string
  subscriptions: Set<string>
}

function stringify(payload: unknown): string {
  return JSON.stringify(payload)
}

export class RealtimeHub {
  private readonly channelSockets = new Map<string, Set<ServerWebSocket<SocketData>>>()

  addSubscription(ws: ServerWebSocket<SocketData>, channelId: string): void {
    let sockets = this.channelSockets.get(channelId)
    if (!sockets) {
      sockets = new Set<ServerWebSocket<SocketData>>()
      this.channelSockets.set(channelId, sockets)
    }

    sockets.add(ws)
    ws.data.subscriptions.add(channelId)
    ws.send(stringify({ type: "subscribed", channelId }))
  }

  removeSubscription(ws: ServerWebSocket<SocketData>, channelId: string): void {
    const sockets = this.channelSockets.get(channelId)
    if (sockets) {
      sockets.delete(ws)
      if (sockets.size === 0) {
        this.channelSockets.delete(channelId)
      }
    }

    ws.data.subscriptions.delete(channelId)
    ws.send(stringify({ type: "unsubscribed", channelId }))
  }

  removeSocket(ws: ServerWebSocket<SocketData>): void {
    for (const channelId of ws.data.subscriptions) {
      const sockets = this.channelSockets.get(channelId)
      if (!sockets) {
        continue
      }

      sockets.delete(ws)
      if (sockets.size === 0) {
        this.channelSockets.delete(channelId)
      }
    }

    ws.data.subscriptions.clear()
  }

  private publishToChannel(channelId: string, payload: unknown): void {
    const sockets = this.channelSockets.get(channelId)
    if (!sockets || sockets.size === 0) {
      return
    }

    const encoded = stringify(payload)
    for (const socket of sockets) {
      socket.send(encoded)
    }
  }

  publishMessageCreated(message: Message): void {
    this.publishToChannel(message.channelId, {
      type: "message.created",
      payload: message
    })
  }

  publishMessageUpdated(message: Message): void {
    this.publishToChannel(message.channelId, {
      type: "message.updated",
      payload: message
    })
  }

  publishMessageDeleted(payload: MessageDeletedEvent): void {
    this.publishToChannel(payload.channelId, {
      type: "message.deleted",
      payload
    })
  }

  publishReactionUpdated(
    channelId: string,
    messageId: string,
    reactions: MessageReactionSummary[]
  ): void {
    this.publishToChannel(channelId, {
      type: "reaction.updated",
      payload: {
        channelId,
        messageId,
        reactions
      }
    })
  }
}
