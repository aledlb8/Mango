import type { DirectThread } from "@/lib/api"
import { Users } from "lucide-react"
import { Button } from "@/components/ui/button"

type FriendsPanelProps = {
  directThreads: DirectThread[]
  selectedDirectThreadId: string | null
  pendingRequestCount: number
  onSelectFriendsView: () => void
  onSelectDirectThread: (value: string) => void
  getDirectThreadLabel: (thread: DirectThread) => string
  getDirectThreadAvatar: (thread: DirectThread) => string
}

export function FriendsPanel(props: FriendsPanelProps) {
  const isFriendsViewActive = props.selectedDirectThreadId === null

  return (
    <>
      {/* Header */}
      <div className="flex h-12 items-center border-b border-sidebar-border px-3">
        <h2 className="text-sm font-semibold text-sidebar-foreground">Direct Messages</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pt-2">
        {/* Friends nav button */}
        <Button
          variant="sidebar-item"
          size="sidebar-item"
          data-active={isFriendsViewActive}
          className="mb-2"
          onClick={props.onSelectFriendsView}
        >
          <Users className="h-4 w-4 shrink-0 opacity-60" />
          <span className="flex-1 truncate">Friends</span>
          {props.pendingRequestCount > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
              {props.pendingRequestCount}
            </span>
          )}
        </Button>

        {/* DM section header */}
        <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Direct Messages
        </p>

        {/* DM list */}
        <div className="space-y-0.5">
          {props.directThreads.map((thread) => (
            <Button
              key={thread.id}
              variant="sidebar-item"
              size="sidebar-item"
              className="h-auto"
              data-active={props.selectedDirectThreadId === thread.id}
              onClick={() => props.onSelectDirectThread(thread.id)}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                {props.getDirectThreadAvatar(thread)}
              </div>
              <span className="truncate">{props.getDirectThreadLabel(thread)}</span>
            </Button>
          ))}
          {props.directThreads.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No conversations yet.
            </p>
          )}
        </div>
      </div>
    </>
  )
}
