import { useState } from "react"
import type { User } from "@/lib/api"
import { MessageSquare, UserMinus, Users } from "lucide-react"
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
  ContextMenuSeparator,
} from "@/components/ui/context-menu"

type AllFriendsTabProps = {
  friends: User[]
  busyKey: string | null
  onOpenDirectThread: (friendId: string) => Promise<void>
  getUserPresenceStatus: (userId: string) => "online" | "idle" | "dnd" | "offline"
  onRemoveFriend: (userId: string) => Promise<void>
}

export function AllFriendsTab(props: AllFriendsTabProps) {
  const [removeTargetFriend, setRemoveTargetFriend] = useState<User | null>(null)

  async function confirmRemoveFriend(): Promise<void> {
    if (!removeTargetFriend) {
      return
    }
    const friendId = removeTargetFriend.id
    setRemoveTargetFriend(null)
    await props.onRemoveFriend(friendId)
  }

  if (props.friends.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Users className="mb-3 h-12 w-12 opacity-20" />
        <p className="text-base font-semibold">No friends yet</p>
        <p className="mt-1 text-sm">Use the Add Friend tab to find people.</p>
      </div>
    )
  }

  return (
    <>
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          All Friends &mdash; {props.friends.length}
        </p>
        <div className="space-y-px">
          {props.friends.map((friend) => (
            <ContextMenu key={friend.id}>
              <ContextMenuTrigger asChild>
                <div className="group flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-secondary/50">
                  <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {friend.displayName.charAt(0).toUpperCase()}
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${
                        props.getUserPresenceStatus(friend.id) === "online"
                          ? "bg-emerald-500"
                          : props.getUserPresenceStatus(friend.id) === "idle"
                            ? "bg-amber-400"
                            : props.getUserPresenceStatus(friend.id) === "dnd"
                              ? "bg-rose-500"
                              : "bg-muted-foreground"
                      }`}
                      title={props.getUserPresenceStatus(friend.id)}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{friend.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">@{friend.username}</p>
                  </div>
                  <Button
                    variant="secondary"
                    size="icon-sm"
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => void props.onOpenDirectThread(friend.id)}
                    disabled={props.busyKey === "direct-thread-open"}
                    title="Message"
                  >
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onClick={() => void props.onOpenDirectThread(friend.id)}>
                  <MessageSquare className="h-4 w-4" />
                  Message
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  destructive
                  disabled={props.busyKey === "friend-remove"}
                  onClick={() => setRemoveTargetFriend(friend)}
                >
                  <UserMinus className="h-4 w-4" />
                  Remove Friend
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </div>
      </div>

      <AlertDialog
        open={Boolean(removeTargetFriend)}
        onOpenChange={(open) => {
          if (!open) {
            setRemoveTargetFriend(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Friend?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTargetFriend
                ? `Remove ${removeTargetFriend.displayName} from your friends list?`
                : "Remove this friend from your friends list?"}
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
                disabled={props.busyKey === "friend-remove"}
                onClick={() => void confirmRemoveFriend()}
              >
                Remove Friend
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
