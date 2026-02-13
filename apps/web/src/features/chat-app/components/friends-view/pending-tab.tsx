import type { FriendRequest, User } from "@/lib/api"
import { Check, Clock, Inbox, X } from "lucide-react"
import { Button } from "@/components/ui/button"

type PendingTabProps = {
  me: User
  friendRequests: FriendRequest[]
  busyKey: string | null
  onRespondToFriendRequest: (requestId: string, action: "accept" | "reject") => Promise<void>
  getUserLabel: (userId: string) => string
}

export function PendingTab(props: PendingTabProps) {
  const incomingRequests = props.friendRequests.filter((r) => r.toUserId === props.me.id)
  const outgoingRequests = props.friendRequests.filter((r) => r.fromUserId === props.me.id)

  if (incomingRequests.length === 0 && outgoingRequests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Inbox className="mb-3 h-12 w-12 opacity-20" />
        <p className="text-base font-semibold">No pending requests</p>
        <p className="mt-1 text-sm">Friend requests you send or receive will appear here.</p>
      </div>
    )
  }

  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Pending &mdash; {incomingRequests.length + outgoingRequests.length}
      </p>
      <div className="space-y-px">
        {/* Incoming */}
        {incomingRequests.map((request) => (
          <div
            key={request.id}
            className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-secondary/50"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {props.getUserLabel(request.fromUserId).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {props.getUserLabel(request.fromUserId)}
              </p>
              <p className="text-xs text-muted-foreground">Incoming Friend Request</p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="secondary"
                size="icon-sm"
                onClick={() => void props.onRespondToFriendRequest(request.id, "accept")}
                disabled={props.busyKey === "friend-request-accept"}
                title="Accept"
              >
                <Check className="h-4 w-4 text-green-500" />
              </Button>
              <Button
                variant="secondary"
                size="icon-sm"
                onClick={() => void props.onRespondToFriendRequest(request.id, "reject")}
                disabled={props.busyKey === "friend-request-reject"}
                title="Reject"
              >
                <X className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}

        {/* Outgoing */}
        {outgoingRequests.map((request) => (
          <div
            key={request.id}
            className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-secondary/50"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
              {props.getUserLabel(request.toUserId).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {props.getUserLabel(request.toUserId)}
              </p>
              <p className="text-xs text-muted-foreground">Outgoing Friend Request</p>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span className="text-xs">Sent</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
