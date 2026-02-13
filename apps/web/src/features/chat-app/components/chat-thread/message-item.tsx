import { useState, type KeyboardEvent } from "react"
import type { Message } from "@/lib/api"
import { Paperclip, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

const QUICK_REACTIONS = ["\u{1F44D}", "\u{1F525}", "\u{1F602}", "\u{1F389}"]

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

type MessageItemProps = {
  message: Message
  isAuthor: boolean
  isGrouped: boolean
  authorLabel: string
  onUpdateMessage: (messageId: string, body: string) => Promise<void>
  onDeleteMessage: (messageId: string) => Promise<void>
  onAddReaction: (messageId: string, emoji: string) => Promise<void>
  onRemoveReaction: (messageId: string, emoji: string) => Promise<void>
}

export function MessageItem(props: MessageItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editingBody, setEditingBody] = useState("")

  function startEditing(): void {
    setIsEditing(true)
    setEditingBody(props.message.body)
  }

  function stopEditing(): void {
    setIsEditing(false)
    setEditingBody("")
  }

  async function submitEdit(): Promise<void> {
    const normalized = editingBody.trim()
    if (!normalized) return
    await props.onUpdateMessage(props.message.id, normalized)
    stopEditing()
  }

  function handleEditKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void submitEdit()
    }
    if (e.key === "Escape") {
      stopEditing()
    }
  }

  return (
    <article
      className={`group relative flex gap-4 rounded px-2 py-0.5 hover:bg-secondary/30 ${
        props.isGrouped ? "" : "mt-4 pt-1"
      }`}
    >
      {/* Avatar / spacer */}
      <div className="w-10 shrink-0">
        {!props.isGrouped && (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {props.authorLabel.charAt(0).toUpperCase()}
          </div>
        )}
        {props.isGrouped && (
          <time className="hidden pt-1 text-[10px] text-muted-foreground group-hover:block">
            {formatTime(props.message.createdAt)}
          </time>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {!props.isGrouped && (
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold">{props.authorLabel}</span>
            <time className="text-xs text-muted-foreground">
              {formatTime(props.message.createdAt)}
            </time>
            {props.message.updatedAt && (
              <span className="text-[10px] text-muted-foreground">(edited)</span>
            )}
          </div>
        )}

        {isEditing ? (
          <div className="mt-1">
            <Textarea
              className="min-h-0 resize-none bg-input/50 text-sm shadow-none"
              value={editingBody}
              onChange={(e) => setEditingBody(e.target.value)}
              onKeyDown={handleEditKeyDown}
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
                onClick={() => void submitEdit()}
              >
                save
              </Button>
            </p>
          </div>
        ) : (
          <>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{props.message.body}</p>
            {props.message.attachments.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {props.message.attachments.map((attachment) => (
                  <a
                    key={attachment.id}
                    href={attachment.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border bg-secondary/40 px-2 py-1 text-xs hover:bg-secondary"
                  >
                    <Paperclip className="h-3 w-3" />
                    <span className="max-w-48 truncate">{attachment.fileName}</span>
                  </a>
                ))}
              </div>
            )}
          </>
        )}

        {/* Existing reactions */}
        {props.message.reactions.length > 0 && !isEditing && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {props.message.reactions.map((reaction) => (
              <Button
                key={`${props.message.id}:${reaction.emoji}`}
                variant="reaction"
                size="reaction"
                onClick={() => void props.onRemoveReaction(props.message.id, reaction.emoji)}
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
              onClick={() => void props.onAddReaction(props.message.id, emoji)}
              title={`React with ${emoji}`}
            >
              {emoji}
            </Button>
          ))}
          {props.isAuthor && (
            <>
              <div className="h-5 w-px bg-border" />
              <Button
                variant="reaction-add"
                size="reaction-add"
                className="text-muted-foreground hover:text-foreground"
                onClick={startEditing}
                title="Edit message"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="reaction-add"
                size="reaction-add"
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={() => void props.onDeleteMessage(props.message.id)}
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
}
