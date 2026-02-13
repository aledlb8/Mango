import type { FormEvent } from "react"
import type { FriendRequest, User } from "@/lib/api"
import { Check, Search, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type AddFriendTabProps = {
  me: User
  friends: User[]
  friendRequests: FriendRequest[]
  friendSearchQuery: string
  friendSearchResults: User[]
  busyKey: string | null
  setFriendSearchQuery: (value: string) => void
  onSearchFriends: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onSendFriendRequest: (userId: string) => Promise<void>
}

export function AddFriendTab(props: AddFriendTabProps) {
  const friendIds = new Set(props.friends.map((f) => f.id))
  const pendingByUserId = new Set<string>()

  for (const request of props.friendRequests) {
    if (request.fromUserId === props.me.id) {
      pendingByUserId.add(request.toUserId)
    }
    if (request.toUserId === props.me.id) {
      pendingByUserId.add(request.fromUserId)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-base font-semibold">Add Friend</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          You can add friends by searching for their username or display name.
        </p>
      </div>

      <form className="mb-6 flex gap-2" onSubmit={props.onSearchFriends}>
        <Input
          value={props.friendSearchQuery}
          onChange={(e) => props.setFriendSearchQuery(e.target.value)}
          placeholder="Search by username or display name..."
          className="flex-1"
        />
        <Button
          type="submit"
          disabled={props.busyKey === "friend-search"}
        >
          <Search className="h-4 w-4" />
          Search
        </Button>
      </form>

      {/* Search results */}
      {props.friendSearchResults.length > 0 && (
        <div className="space-y-px">
          {props.friendSearchResults.map((user) => {
            if (user.id === props.me.id) return null
            const isFriend = friendIds.has(user.id)
            const hasPendingRequest = pendingByUserId.has(user.id)

            return (
              <div
                key={user.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-secondary/50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {user.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{user.displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">@{user.username}</p>
                </div>
                {isFriend ? (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Check className="h-3.5 w-3.5 text-green-500" />
                    Friends
                  </span>
                ) : hasPendingRequest ? (
                  <span className="text-xs text-muted-foreground">Request Pending</span>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void props.onSendFriendRequest(user.id)}
                    disabled={props.busyKey === "friend-request-send"}
                  >
                    <UserPlus className="h-4 w-4" />
                    Send Request
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
