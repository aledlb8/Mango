import { useState, type FormEvent } from "react"
import type { FriendRequest, User } from "@/lib/api"
import { Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AllFriendsTab } from "./all-friends-tab"
import { PendingTab } from "./pending-tab"
import { AddFriendTab } from "./add-friend-tab"

type FriendsTab = "all" | "pending" | "add"

type FriendsViewProps = {
  me: User
  friends: User[]
  friendRequests: FriendRequest[]
  friendSearchQuery: string
  friendSearchResults: User[]
  busyKey: string | null
  setFriendSearchQuery: (value: string) => void
  onSearchFriends: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onSendFriendRequest: (userId: string) => Promise<void>
  onRespondToFriendRequest: (requestId: string, action: "accept" | "reject") => Promise<void>
  onOpenDirectThread: (friendId: string) => Promise<void>
  getUserLabel: (userId: string) => string
  getUserPresenceStatus: (userId: string) => "online" | "idle" | "dnd" | "offline"
  onRemoveFriend: (userId: string) => Promise<void>
}

export function FriendsView(props: FriendsViewProps) {
  const [activeTab, setActiveTab] = useState<FriendsTab>("all")

  const incomingCount = props.friendRequests.filter((r) => r.toUserId === props.me.id).length

  const tabs: { key: FriendsTab; label: string; badge?: number }[] = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending", badge: incomingCount },
    { key: "add", label: "Add Friend" },
  ]

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-background">
      {/* Header with tabs */}
      <header className="flex h-12 shrink-0 items-center gap-4 border-b px-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-5 w-5 text-muted-foreground" />
          Friends
        </div>
        <div className="h-6 w-px bg-border" />
        <nav className="flex items-center gap-1">
          {tabs.map((tab) => (
            <Button
              key={tab.key}
              variant={activeTab === tab.key ? "secondary" : "ghost"}
              size="sm"
              className={
                activeTab === tab.key
                  ? "font-medium"
                  : "text-muted-foreground"
              }
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="ml-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                  {tab.badge}
                </span>
              )}
            </Button>
          ))}
        </nav>
      </header>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-2xl">
          {activeTab === "all" && (
            <AllFriendsTab
              friends={props.friends}
              busyKey={props.busyKey}
              onOpenDirectThread={props.onOpenDirectThread}
              getUserPresenceStatus={props.getUserPresenceStatus}
              onRemoveFriend={props.onRemoveFriend}
            />
          )}
          {activeTab === "pending" && (
            <PendingTab
              me={props.me}
              friendRequests={props.friendRequests}
              busyKey={props.busyKey}
              onRespondToFriendRequest={props.onRespondToFriendRequest}
              getUserLabel={props.getUserLabel}
            />
          )}
          {activeTab === "add" && (
            <AddFriendTab
              me={props.me}
              friends={props.friends}
              friendRequests={props.friendRequests}
              friendSearchQuery={props.friendSearchQuery}
              friendSearchResults={props.friendSearchResults}
              busyKey={props.busyKey}
              setFriendSearchQuery={props.setFriendSearchQuery}
              onSearchFriends={props.onSearchFriends}
              onSendFriendRequest={props.onSendFriendRequest}
            />
          )}
        </div>
      </div>
    </main>
  )
}
