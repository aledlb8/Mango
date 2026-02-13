import { useRef, type FormEvent, type KeyboardEvent } from "react"
import { Paperclip, Send, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

type MessageInputProps = {
  activeConversationName: string | null
  messageBody: string
  pendingAttachments: File[]
  typingUserLabels: string[]
  busyKey: string | null
  setMessageBody: (value: string) => void
  onPickAttachments: (files: FileList | null) => void
  onRemovePendingAttachment: (index: number) => void
  onSendMessage: (event: FormEvent<HTMLFormElement>) => Promise<void>
}

export function MessageInput(props: MessageInputProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const attachmentInputRef = useRef<HTMLInputElement>(null)

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      formRef.current?.requestSubmit()
    }
  }

  return (
    <div className="shrink-0 px-4 pb-4 pt-2">
      {props.typingUserLabels.length > 0 && (
        <p className="mb-1 px-1 text-xs text-muted-foreground">
          {props.typingUserLabels.join(", ")} {props.typingUserLabels.length === 1 ? "is" : "are"} typing...
        </p>
      )}

      {props.pendingAttachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5 px-1">
          {props.pendingAttachments.map((file, index) => (
            <span
              key={`${file.name}-${file.size}-${index}`}
              className="inline-flex items-center gap-1 rounded-md border bg-secondary/40 px-2 py-1 text-xs"
            >
              <Paperclip className="h-3 w-3" />
              <span className="max-w-40 truncate">{file.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="h-4 w-4 p-0"
                onClick={() => props.onRemovePendingAttachment(index)}
              >
                <X className="h-3 w-3" />
              </Button>
            </span>
          ))}
        </div>
      )}

      <form ref={formRef} onSubmit={props.onSendMessage}>
        <div className="relative rounded-lg bg-secondary">
          <input
            ref={attachmentInputRef}
            type="file"
            className="hidden"
            multiple
            onChange={(event) => {
              props.onPickAttachments(event.target.files)
              event.currentTarget.value = ""
            }}
          />

          <Textarea
            className="min-h-0 resize-none border-0 bg-transparent px-4 py-3 pr-12 text-sm shadow-none focus-visible:ring-0"
            rows={1}
            value={props.messageBody}
            onChange={(e) => props.setMessageBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              props.activeConversationName
                ? `Message #${props.activeConversationName}`
                : "Select a channel to start chatting"
            }
            disabled={!props.activeConversationName}
          />
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="absolute bottom-2 right-10"
            onClick={() => attachmentInputRef.current?.click()}
            disabled={!props.activeConversationName}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button
            type="submit"
            size="icon-xs"
            className="absolute bottom-2 right-2"
            disabled={!props.activeConversationName || props.busyKey === "message-send" || !props.messageBody.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  )
}
