import { useEffect, useRef, type FormEvent } from "react"
import type { Channel, DirectThread, Message, User, VoiceSession } from "@/lib/api"
import type { ActiveVoiceInfo } from "../../use-chat-app"
import type { RealtimeStatus } from "@/lib/realtime"
import { Hash, MessageSquare, MicOff, Monitor, Phone, Volume2, HeadphoneOff } from "lucide-react"
import { Button } from "@/components/ui/button"
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
  voiceSession: VoiceSession | null
  activeVoiceInfo: ActiveVoiceInfo | null
  voiceConnectionStatus: "disconnected" | "connecting" | "connected" | "reconnecting"
  voiceMuted: boolean
  voiceDeafened: boolean
  voiceSpeaking: boolean
  voiceScreenSharing: boolean
  screenShareAvailable: boolean
  setMessageBody: (value: string) => void
  onPickAttachments: (files: FileList | null) => void
  onRemovePendingAttachment: (index: number) => void
  onSendMessage: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onUpdateMessage: (messageId: string, body: string) => Promise<void>
  onDeleteMessage: (messageId: string) => Promise<void>
  onAddReaction: (messageId: string, emoji: string) => Promise<void>
  onRemoveReaction: (messageId: string, emoji: string) => Promise<void>
  onJoinVoice: () => Promise<void>
  onLeaveVoice: () => Promise<void>
  onToggleVoiceMute: () => Promise<void>
  onToggleVoiceDeafen: () => Promise<void>
  onToggleVoiceSpeaking: () => Promise<void>
  onToggleVoiceScreenShare: () => Promise<void>
  getAuthorLabel: (authorId: string) => string
  getUserLabel: (userId: string) => string
  copyToClipboard: (text: string) => void
}

export function ChatThread(props: ChatThreadProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isVoiceChannel = props.selectedChannel?.type === "voice"
  const supportsCall = Boolean(props.selectedDirectThread) || isVoiceChannel
  const activeConversationName = props.selectedChannel?.name ?? props.selectedDirectThread?.title ?? null

  const isConnectedHere = Boolean(
    props.activeVoiceInfo &&
    ((isVoiceChannel && props.activeVoiceInfo.target.kind === "channel" && props.activeVoiceInfo.target.targetId === props.selectedChannel?.id) ||
     (props.selectedDirectThread && props.activeVoiceInfo.target.kind === "direct_thread" && props.activeVoiceInfo.target.targetId === props.selectedDirectThread.id))
  )

  const isInAnyVoice = Boolean(props.activeVoiceInfo) && props.voiceConnectionStatus !== "disconnected"

  const voiceParticipants = props.voiceSession?.participants ?? []

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [props.messages.length])

  function handleReply(message: Message): void {
    const quotedBody = message.body
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n")
    const author = props.getAuthorLabel(message.authorId)
    const prefix = `@${author}\n${quotedBody}\n\n`
    const nextBody = props.messageBody.trim().length > 0 ? `${props.messageBody}\n\n${prefix}` : prefix
    props.setMessageBody(nextBody)
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4">
        {activeConversationName ? (
          <div className="flex items-center gap-2">
            {isVoiceChannel ? (
              <Volume2 className="h-5 w-5 text-muted-foreground" />
            ) : (
              <Hash className="h-5 w-5 text-muted-foreground" />
            )}
            <h2 className="text-sm font-semibold">{activeConversationName}</h2>
          </div>
        ) : (
          <h2 className="text-sm font-semibold text-muted-foreground">Select a channel</h2>
        )}

        {supportsCall && !isConnectedHere ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            disabled={props.voiceConnectionStatus === "connecting" || (isInAnyVoice && !isConnectedHere)}
            onClick={() => void props.onJoinVoice()}
            title={isInAnyVoice ? "Already in a voice channel" : undefined}
          >
            <Phone className="h-4 w-4" />
            {isVoiceChannel ? "Join Voice" : "Call"}
          </Button>
        ) : null}
      </header>

      {isVoiceChannel ? (
        <div className="flex flex-1 flex-col">
          {/* Voice channel participant area */}
          <div className="flex flex-1 flex-col items-center justify-center px-6">
            {voiceParticipants.length > 0 ? (
              <div className="w-full max-w-lg space-y-1">
                <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  In Voice — {voiceParticipants.length}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {voiceParticipants.map((participant) => {
                    const label = props.getUserLabel(participant.userId)
                    const isMe = participant.userId === props.me.id
                    return (
                      <div
                        key={participant.userId}
                        className={`flex flex-col items-center gap-2 rounded-xl p-4 ${
                          participant.speaking
                            ? "bg-green-500/10 ring-2 ring-green-500/40"
                            : "bg-secondary/40"
                        }`}
                      >
                        <div className={`relative flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold ${
                          participant.speaking
                            ? "bg-green-500/20 text-green-400"
                            : "bg-primary/20 text-primary"
                        }`}>
                          {label.charAt(0).toUpperCase()}
                          {participant.muted ? (
                            <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-background p-0.5">
                              <MicOff className="h-3 w-3 text-red-400" />
                            </span>
                          ) : null}
                          {participant.deafened ? (
                            <span className="absolute -bottom-0.5 -left-0.5 rounded-full bg-background p-0.5">
                              <HeadphoneOff className="h-3 w-3 text-red-400" />
                            </span>
                          ) : null}
                          {participant.screenSharing ? (
                            <span className="absolute -top-0.5 -right-0.5 rounded-full bg-background p-0.5">
                              <Monitor className="h-3 w-3 text-blue-400" />
                            </span>
                          ) : null}
                        </div>
                        <span className="max-w-full truncate text-xs font-medium">
                          {label}{isMe ? " (You)" : ""}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center text-muted-foreground">
                <Volume2 className="mx-auto mb-3 h-12 w-12 opacity-20" />
                <p className="text-base font-semibold">No one is in voice</p>
                <p className="mt-1 text-sm">Click &quot;Join Voice&quot; to start talking.</p>
              </div>
            )}
          </div>

          {/* Screen share controls for voice channel when connected */}
          {isConnectedHere && props.screenShareAvailable ? (
            <div className="flex items-center justify-center gap-2 border-t px-4 py-2">
              <Button
                type="button"
                size="sm"
                variant={props.voiceScreenSharing ? "secondary" : "outline"}
                onClick={() => void props.onToggleVoiceScreenShare()}
              >
                <Monitor className="h-4 w-4" />
                {props.voiceScreenSharing ? "Stop Sharing" : "Share Screen"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-2">
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
                <p className="text-base font-semibold">Welcome to #{activeConversationName}</p>
                <p className="mt-1 text-sm">This is the start of the channel. Say something!</p>
              </div>
            )}

            {props.messages.map((message, index) => {
              const prev = index > 0 ? props.messages[index - 1] : null
              const isGrouped =
                prev !== null &&
                prev.authorId === message.authorId &&
                new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000

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
                  onReply={handleReply}
                  copyToClipboard={props.copyToClipboard}
                />
              )
            })}
            <div ref={messagesEndRef} />
          </div>

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
        </>
      )}
    </main>
  )
}
