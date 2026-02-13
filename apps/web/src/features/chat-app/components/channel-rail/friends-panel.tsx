import { useState } from "react"
import type { DirectThread } from "@/lib/api"
import { Users, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
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
} from "@/components/ui/context-menu"

type FriendsPanelProps = {
  directThreads: DirectThread[]
  selectedDirectThreadId: string | null
  pendingRequestCount: number
  onSelectFriendsView: () => void
  onSelectDirectThread: (value: string) => void
  getDirectThreadLabel: (thread: DirectThread) => string
  getDirectThreadAvatar: (thread: DirectThread) => string
  onCloseDirectThread: (threadId: string) => Promise<void>
}

export function FriendsPanel(props: FriendsPanelProps) {
  const isFriendsViewActive = props.selectedDirectThreadId === null
  const [closeTargetThread, setCloseTargetThread] = useState<DirectThread | null>(null)

  async function confirmCloseConversation(): Promise<void> {
    if (!closeTargetThread) {
      return
    }
    const threadId = closeTargetThread.id
    setCloseTargetThread(null)
    await props.onCloseDirectThread(threadId)
  }

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
            <ContextMenu key={thread.id}>
              <ContextMenuTrigger asChild>
                <Button
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
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem destructive onClick={() => setCloseTargetThread(thread)}>
                  <XCircle className="h-4 w-4" />
                  Close Conversation
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
          {props.directThreads.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No conversations yet.
            </p>
          )}
        </div>
      </div>

      <AlertDialog
        open={Boolean(closeTargetThread)}
        onOpenChange={(open) => {
          if (!open) {
            setCloseTargetThread(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close Conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              {closeTargetThread
                ? `Close conversation with ${props.getDirectThreadLabel(closeTargetThread)}?`
                : "Close this conversation?"}
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
                onClick={() => void confirmCloseConversation()}
              >
                Close Conversation
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
