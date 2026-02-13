import { useEffect, useRef, type FormEvent } from "react"
import type { Channel, DirectThread, Message, User } from "@/lib/api"
import type { RealtimeStatus } from "@/lib/realtime"
import { Hash, MessageSquare } from "lucide-react"
import { MessageItem } from "./message-item"
import { MessageInput } from "./message-input"

type ChatThreadProps = {
  me: User
  selectedChannel: Channel | null
  selectedDirectThread: DirectThread | null
  messages: Message[]
  messageBody: string
  pendingAttachments: File[]
  typingUserLabels: string[]
  busyKey: string | null
  realtimeStatus: RealtimeStatus
  setMessageBody: (value: string) => void
  onPickAttachments: (files: FileList | null) => void
  onRemovePendingAttachment: (index: number) => void
  onSendMessage: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onUpdateMessage: (messageId: string, body: string) => Promise<void>
  onDeleteMessage: (messageId: string) => Promise<void>
  onAddReaction: (messageId: string, emoji: string) => Promise<void>
  onRemoveReaction: (messageId: string, emoji: string) => Promise<void>
  getAuthorLabel: (authorId: string) => string
}

export function ChatThread(props: ChatThreadProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const activeConversationName = props.selectedChannel?.name ?? props.selectedDirectThread?.title ?? null

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [props.messages.length])

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-background">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        {activeConversationName ? (
          <>
            <Hash className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-sm font-semibold">{activeConversationName}</h2>
          </>
        ) : (
          <h2 className="text-sm font-semibold text-muted-foreground">Select a channel</h2>
        )}
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {/* Empty states */}
        {!activeConversationName && (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
            <MessageSquare className="mb-3 h-12 w-12 opacity-20" />
            <p className="text-base font-semibold">No channel selected</p>
            <p className="mt-1 text-sm">Pick a channel from the sidebar to start chatting.</p>
          </div>
        )}

        {activeConversationName && props.messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
            <Hash className="mb-3 h-12 w-12 opacity-20" />
            <p className="text-base font-semibold">
              Welcome to #{activeConversationName}
            </p>
            <p className="mt-1 text-sm">This is the start of the channel. Say something!</p>
          </div>
        )}

        {/* Message list */}
        {props.messages.map((message, index) => {
          const prev = index > 0 ? props.messages[index - 1] : null
          const isGrouped =
            prev !== null &&
            prev.authorId === message.authorId &&
            new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() <
            5 * 60 * 1000

          return (
            <MessageItem
              key={message.id}
              message={message}
              isAuthor={message.authorId === props.me.id}
              isGrouped={isGrouped}
              authorLabel={props.getAuthorLabel(message.authorId)}
              onUpdateMessage={props.onUpdateMessage}
              onDeleteMessage={props.onDeleteMessage}
              onAddReaction={props.onAddReaction}
              onRemoveReaction={props.onRemoveReaction}
            />
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <MessageInput
        activeConversationName={activeConversationName}
        messageBody={props.messageBody}
        pendingAttachments={props.pendingAttachments}
        typingUserLabels={props.typingUserLabels}
        busyKey={props.busyKey}
        setMessageBody={props.setMessageBody}
        onPickAttachments={props.onPickAttachments}
        onRemovePendingAttachment={props.onRemovePendingAttachment}
        onSendMessage={props.onSendMessage}
      />
    </main>
  )
}
