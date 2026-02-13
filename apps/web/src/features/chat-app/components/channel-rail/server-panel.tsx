import { useState, type FormEvent } from "react"
import type { Channel, Server, User, VoiceSession } from "@/lib/api"
import { ChevronDown, Copy, Hash, Link, Mic, MicOff, Pencil, Plus, Trash2, Volume2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"

type ServerPanelProps = {
  me: User
  selectedServer: Server | null
  selectedChannelId: string | null
  channels: Channel[]
  busyKey: string | null
  channelName: string
  channelType: Channel["type"]
  latestInviteCode: string | null
  voiceSessionsByTarget: Record<string, VoiceSession>
  setChannelName: (value: string) => void
  setChannelType: (value: Channel["type"]) => void
  onSelectChannel: (channelId: string) => void
  onCreateChannel: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onCreateInvite: () => Promise<void>
  onEditChannel: (channelId: string, name: string) => Promise<void>
  onDeleteChannel: (channelId: string) => Promise<void>
  getUserLabel: (userId: string) => string
  copyToClipboard: (text: string) => void
}

export function ServerPanel(props: ServerPanelProps) {
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [copiedInvite, setCopiedInvite] = useState(false)
  const [editTargetChannel, setEditTargetChannel] = useState<Channel | null>(null)
  const [nextChannelName, setNextChannelName] = useState("")
  const [deleteTargetChannel, setDeleteTargetChannel] = useState<Channel | null>(null)
  const textChannels = props.channels.filter((channel) => channel.type === "text")
  const voiceChannels = props.channels.filter((channel) => channel.type === "voice")

  function handleCopyInvite() {
    if (!props.latestInviteCode) return
    void navigator.clipboard.writeText(props.latestInviteCode)
    setCopiedInvite(true)
    setTimeout(() => setCopiedInvite(false), 2000)
  }

  function openEditChannel(channel: Channel): void {
    setEditTargetChannel(channel)
    setNextChannelName(channel.name)
  }

  async function confirmEditChannel(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!editTargetChannel) {
      return
    }

    const trimmedName = nextChannelName.trim()
    if (!trimmedName || trimmedName === editTargetChannel.name) {
      setEditTargetChannel(null)
      setNextChannelName("")
      return
    }

    const channelId = editTargetChannel.id
    setEditTargetChannel(null)
    setNextChannelName("")
    await props.onEditChannel(channelId, trimmedName)
  }

  async function confirmDeleteChannel(): Promise<void> {
    if (!deleteTargetChannel) {
      return
    }
    const channelId = deleteTargetChannel.id
    setDeleteTargetChannel(null)
    await props.onDeleteChannel(channelId)
  }

  return (
    <>
      {/* Server header */}
      <div className="flex h-12 items-center justify-between border-b border-sidebar-border px-4">
        <h2 className="truncate text-sm font-semibold text-sidebar-foreground">
          {props.selectedServer?.name ?? "Loading server..."}
        </h2>
        <Button
          variant="sidebar-action"
          size="sidebar-action"
          onClick={() => void props.onCreateInvite()}
          disabled={!props.selectedServer || props.busyKey === "invite-create"}
          title="Create invite link"
        >
          <Link className="h-4 w-4" />
        </Button>
      </div>

      {/* Invite code display */}
      {props.latestInviteCode && (
        <div className="mx-3 mt-2 flex items-center justify-between rounded-md bg-secondary px-2.5 py-1.5">
          <span className="font-mono text-xs text-muted-foreground">{props.latestInviteCode}</span>
          <Button
            variant="sidebar-action"
            size="icon-xs"
            onClick={handleCopyInvite}
            title="Copy invite code"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          {copiedInvite && <span className="ml-1 text-xs text-green-500">Copied</span>}
        </div>
      )}

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto px-2 pt-4">
        <div className="mb-1 flex items-center justify-between px-1">
          <Button variant="sidebar-header" size="xs" className="h-auto p-0">
            <ChevronDown className="h-3 w-3" />
            Text Channels
          </Button>
          <Button
            variant="sidebar-action"
            size="icon-xs"
            onClick={() => setShowCreateChannel(!showCreateChannel)}
            title="Create channel"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {showCreateChannel && (
          <form
            className="mb-2 px-1"
            onSubmit={(event) => {
              void props.onCreateChannel(event)
              setShowCreateChannel(false)
            }}
          >
            <Input
              value={props.channelName}
              onChange={(event) => props.setChannelName(event.target.value)}
              placeholder="channel-name"
              className="h-7 text-xs"
              required
              autoFocus
            />
            <div className="mt-2 flex gap-1">
              <Button
                type="button"
                size="xs"
                variant={props.channelType === "text" ? "secondary" : "ghost"}
                onClick={() => props.setChannelType("text")}
              >
                <Hash className="h-3 w-3" />
                Text
              </Button>
              <Button
                type="button"
                size="xs"
                variant={props.channelType === "voice" ? "secondary" : "ghost"}
                onClick={() => props.setChannelType("voice")}
              >
                <Volume2 className="h-3 w-3" />
                Voice
              </Button>
            </div>
          </form>
        )}

        <div className="space-y-0.5">
          {textChannels.map((channel) => (
            <ContextMenu key={channel.id}>
              <ContextMenuTrigger asChild>
                <Button
                  variant="sidebar-item"
                  size="sidebar-item"
                  data-active={props.selectedChannelId === channel.id}
                  onClick={() => props.onSelectChannel(channel.id)}
                >
                  <Hash className="h-4 w-4 shrink-0 opacity-60" />
                  <span className="truncate">{channel.name}</span>
                </Button>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  disabled={props.busyKey === "channel-edit"}
                  onClick={() => openEditChannel(channel)}
                >
                  <Pencil className="h-4 w-4" />
                  Edit Channel
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={props.busyKey === "channel-delete"}
                  destructive
                  onClick={() => setDeleteTargetChannel(channel)}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Channel
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => props.copyToClipboard(channel.id)}>
                  <Copy className="h-4 w-4" />
                  Copy Channel ID
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </div>

        <div className="mb-1 mt-4 flex items-center justify-between px-1">
          <Button variant="sidebar-header" size="xs" className="h-auto p-0">
            <ChevronDown className="h-3 w-3" />
            Voice Channels
          </Button>
        </div>
        <div className="space-y-0.5">
          {voiceChannels.map((channel) => {
            const sessionKey = `channel:${channel.id}`
            const session = props.voiceSessionsByTarget[sessionKey]
            const participants = session?.participants ?? []

            return (
              <div key={channel.id}>
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <Button
                      variant="sidebar-item"
                      size="sidebar-item"
                      data-active={props.selectedChannelId === channel.id}
                      onClick={() => props.onSelectChannel(channel.id)}
                    >
                      <Volume2 className="h-4 w-4 shrink-0 opacity-60" />
                      <span className="truncate">{channel.name}</span>
                    </Button>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem
                      disabled={props.busyKey === "channel-edit"}
                      onClick={() => openEditChannel(channel)}
                    >
                      <Pencil className="h-4 w-4" />
                      Edit Channel
                    </ContextMenuItem>
                    <ContextMenuItem
                      disabled={props.busyKey === "channel-delete"}
                      destructive
                      onClick={() => setDeleteTargetChannel(channel)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete Channel
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => props.copyToClipboard(channel.id)}>
                      <Copy className="h-4 w-4" />
                      Copy Channel ID
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>

                {participants.length > 0 ? (
                  <div className="ml-6 space-y-0.5 py-0.5">
                    {participants.map((participant) => (
                      <div
                        key={participant.userId}
                        className="flex items-center gap-2 rounded px-2 py-1 text-xs text-sidebar-foreground/80 hover:bg-sidebar-accent/30"
                      >
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-semibold text-primary">
                          {props.getUserLabel(participant.userId).charAt(0).toUpperCase()}
                        </div>
                        <span className="min-w-0 flex-1 truncate">
                          {props.getUserLabel(participant.userId)}
                        </span>
                        {participant.muted ? (
                          <MicOff className="h-3 w-3 shrink-0 text-red-400/70" />
                        ) : participant.speaking ? (
                          <Mic className="h-3 w-3 shrink-0 text-green-400" />
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      <Dialog
        open={Boolean(editTargetChannel)}
        onOpenChange={(open) => {
          if (!open) {
            setEditTargetChannel(null)
            setNextChannelName("")
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Channel</DialogTitle>
            <DialogDescription>
              Update the channel name. Members will see the new name immediately.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => void confirmEditChannel(event)}>
            <Input
              value={nextChannelName}
              onChange={(event) => setNextChannelName(event.target.value)}
              placeholder="channel-name"
              required
              autoFocus
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditTargetChannel(null)
                  setNextChannelName("")
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={props.busyKey === "channel-edit"}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTargetChannel)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTargetChannel(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Channel?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTargetChannel
                ? `Deleting #${deleteTargetChannel.name} is permanent.`
                : "Deleting this channel is permanent."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                type="button"
                variant="destructive"
                disabled={props.busyKey === "channel-delete"}
                onClick={() => void confirmDeleteChannel()}
              >
                Delete Channel
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
