import { useState, type FormEvent } from "react"
import type { Channel, Server } from "@/lib/api"
import { ChevronDown, Copy, Hash, Link, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type ServerPanelProps = {
  selectedServer: Server
  selectedChannelId: string | null
  channels: Channel[]
  busyKey: string | null
  channelName: string
  latestInviteCode: string | null
  setChannelName: (value: string) => void
  onSelectChannel: (channelId: string) => void
  onCreateChannel: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onCreateInvite: () => Promise<void>
}

export function ServerPanel(props: ServerPanelProps) {
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [copiedInvite, setCopiedInvite] = useState(false)

  function handleCopyInvite() {
    if (!props.latestInviteCode) return
    void navigator.clipboard.writeText(props.latestInviteCode)
    setCopiedInvite(true)
    setTimeout(() => setCopiedInvite(false), 2000)
  }

  return (
    <>
      {/* Server header */}
      <div className="flex h-12 items-center justify-between border-b border-sidebar-border px-4">
        <h2 className="truncate text-sm font-semibold text-sidebar-foreground">
          {props.selectedServer.name}
        </h2>
        <Button
          variant="sidebar-action"
          size="sidebar-action"
          onClick={() => void props.onCreateInvite()}
          disabled={props.busyKey === "invite-create"}
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
            onSubmit={(e) => {
              void props.onCreateChannel(e)
              setShowCreateChannel(false)
            }}
          >
            <Input
              value={props.channelName}
              onChange={(e) => props.setChannelName(e.target.value)}
              placeholder="channel-name"
              className="h-7 text-xs"
              required
              autoFocus
            />
          </form>
        )}

        <div className="space-y-0.5">
          {props.channels.map((channel) => (
            <Button
              key={channel.id}
              variant="sidebar-item"
              size="sidebar-item"
              data-active={props.selectedChannelId === channel.id}
              onClick={() => props.onSelectChannel(channel.id)}
            >
              <Hash className="h-4 w-4 shrink-0 opacity-60" />
              <span className="truncate">{channel.name}</span>
            </Button>
          ))}
        </div>
      </div>
    </>
  )
}
