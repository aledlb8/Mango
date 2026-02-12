import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import type { Channel, Message, User } from "@/lib/api"
import type { RealtimeStatus } from "@/lib/realtime"
import { Hash, MessageSquare, Pencil, Send, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"

const QUICK_REACTIONS = ["\u{1F44D}", "\u{1F525}", "\u{1F602}", "\u{1F389}"]

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

type ChatThreadProps = {
  me: User
  selectedChannel: Channel | null
  messages: Message[]
  messageBody: string
  busyKey: string | null
  realtimeStatus: RealtimeStatus
  setMessageBody: (value: string) => void
  onSendMessage: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onUpdateMessage: (messageId: string, body: string) => Promise<void>
  onDeleteMessage: (messageId: string) => Promise<void>
  onAddReaction: (messageId: string, emoji: string) => Promise<void>
  onRemoveReaction: (messageId: string, emoji: string) => Promise<void>
  getAuthorLabel: (authorId: string) => string
}

export function ChatThread(props: ChatThreadProps) {
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [props.messages.length])

  function startEditing(message: Message): void {
    setEditingMessageId(message.id)
    setEditingBody(message.body)
  }

  function stopEditing(): void {
    setEditingMessageId(null)
    setEditingBody("")
  }

  async function submitEdit(messageId: string): Promise<void> {
    const normalized = editingBody.trim()
    if (!normalized) return
    await props.onUpdateMessage(messageId, normalized)
    stopEditing()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      formRef.current?.requestSubmit()
    }
  }

  function handleEditKeyDown(e: KeyboardEvent<HTMLTextAreaElement>, messageId: string): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void submitEdit(messageId)
    }
    if (e.key === "Escape") {
      stopEditing()
    }
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-background">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        {props.selectedChannel ? (
          <>
            <Hash className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-sm font-semibold">{props.selectedChannel.name}</h2>
          </>
        ) : (
          <h2 className="text-sm font-semibold text-muted-foreground">Select a channel</h2>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              props.realtimeStatus === "connected" ? "bg-green-500" : "bg-muted-foreground"
            }`}
          />
          <span className="text-xs text-muted-foreground">
            {props.realtimeStatus === "connected" ? "Connected" : "Offline"}
          </span>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {/* Empty states */}
        {!props.selectedChannel && (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
            <MessageSquare className="mb-3 h-12 w-12 opacity-20" />
            <p className="text-base font-semibold">No channel selected</p>
            <p className="mt-1 text-sm">Pick a channel from the sidebar to start chatting.</p>
          </div>
        )}

        {props.selectedChannel && props.messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
            <Hash className="mb-3 h-12 w-12 opacity-20" />
            <p className="text-base font-semibold">
              Welcome to #{props.selectedChannel.name}
            </p>
            <p className="mt-1 text-sm">This is the start of the channel. Say something!</p>
          </div>
        )}

        {/* Message list */}
        {props.messages.map((message, index) => {
          const isAuthor = message.authorId === props.me.id
          const isEditing = editingMessageId === message.id
          const authorLabel = props.getAuthorLabel(message.authorId)
          const prev = index > 0 ? props.messages[index - 1] : null
          const isGrouped =
            prev !== null &&
            prev.authorId === message.authorId &&
            new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() <
              5 * 60 * 1000

          return (
            <article
              key={message.id}
              className={`group relative flex gap-4 rounded px-2 py-0.5 hover:bg-secondary/30 ${
                isGrouped ? "" : "mt-4 pt-1"
              }`}
            >
              {/* Avatar / spacer */}
              <div className="w-10 shrink-0">
                {!isGrouped && (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {authorLabel.charAt(0).toUpperCase()}
                  </div>
                )}
                {isGrouped && (
                  <time className="hidden pt-1 text-[10px] text-muted-foreground group-hover:block">
                    {formatTime(message.createdAt)}
                  </time>
                )}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                {!isGrouped && (
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold">{authorLabel}</span>
                    <time className="text-xs text-muted-foreground">
                      {formatTime(message.createdAt)}
                    </time>
                    {message.updatedAt && (
                      <span className="text-[10px] text-muted-foreground">(edited)</span>
                    )}
                  </div>
                )}

                {isEditing ? (
                  <div className="mt-1">
                    <textarea
                      className="w-full resize-none rounded-md border bg-input/50 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      value={editingBody}
                      onChange={(e) => setEditingBody(e.target.value)}
                      onKeyDown={(e) => handleEditKeyDown(e, message.id)}
                      rows={2}
                      autoFocus
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Escape to{" "}
                      <Button variant="link" size="xs" className="h-auto p-0 text-xs" onClick={stopEditing}>
                        cancel
                      </Button>
                      {" \u2022 "}Enter to{" "}
                      <Button
                        variant="link"
                        size="xs"
                        className="h-auto p-0 text-xs"
                        onClick={() => void submitEdit(message.id)}
                      >
                        save
                      </Button>
                    </p>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
                )}

                {/* Existing reactions */}
                {message.reactions.length > 0 && !isEditing && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {message.reactions.map((reaction) => (
                      <Button
                        key={`${message.id}:${reaction.emoji}`}
                        variant="reaction"
                        size="reaction"
                        onClick={() => void props.onRemoveReaction(message.id, reaction.emoji)}
                      >
                        <span>{reaction.emoji}</span>
                        <span className="font-medium text-muted-foreground">{reaction.count}</span>
                      </Button>
                    ))}
                  </div>
                )}
              </div>

              {/* Hover toolbar */}
              {!isEditing && (
                <div className="absolute -top-3 right-2 hidden items-center rounded-md border bg-card shadow-sm group-hover:flex">
                  {QUICK_REACTIONS.map((emoji) => (
                    <Button
                      key={emoji}
                      variant="reaction-add"
                      size="reaction-add"
                      onClick={() => void props.onAddReaction(message.id, emoji)}
                      title={`React with ${emoji}`}
                    >
                      {emoji}
                    </Button>
                  ))}
                  {isAuthor && (
                    <>
                      <div className="h-5 w-px bg-border" />
                      <Button
                        variant="reaction-add"
                        size="reaction-add"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => startEditing(message)}
                        title="Edit message"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="reaction-add"
                        size="reaction-add"
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => void props.onDeleteMessage(message.id)}
                        title="Delete message"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              )}
            </article>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 px-4 pb-4 pt-2">
        <form ref={formRef} onSubmit={props.onSendMessage}>
          <div className="relative rounded-lg bg-secondary">
            <textarea
              className="block w-full resize-none bg-transparent px-4 py-3 pr-12 text-sm placeholder:text-muted-foreground focus:outline-none"
              rows={1}
              value={props.messageBody}
              onChange={(e) => props.setMessageBody(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                props.selectedChannel
                  ? `Message #${props.selectedChannel.name}`
                  : "Select a channel to start chatting"
              }
              disabled={!props.selectedChannel}
            />
            <Button
              type="submit"
              size="icon-xs"
              className="absolute bottom-2 right-2"
              disabled={!props.selectedChannel || props.busyKey === "message-send" || !props.messageBody.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </div>
    </main>
  )
}
