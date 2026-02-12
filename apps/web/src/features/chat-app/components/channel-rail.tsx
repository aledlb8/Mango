import { useState, type FormEvent } from "react"
import type { Channel, Server, User } from "@/lib/api"
import { Hash, Plus, Copy, Search, UserPlus, Sun, Moon, LogOut, ChevronDown, Link } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type ChannelRailProps = {
  me: User
  selectedServer: Server | null
  selectedChannelId: string | null
  channels: Channel[]
  busyKey: string | null
  channelName: string
  latestInviteCode: string | null
  friends: User[]
  friendSearchQuery: string
  friendSearchResults: User[]
  setChannelName: (value: string) => void
  setSelectedChannelId: (value: string) => void
  setFriendSearchQuery: (value: string) => void
  onCreateChannel: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onCreateInvite: () => Promise<void>
  onSearchFriends: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onAddFriend: (userId: string) => Promise<void>
  onSignOut: () => void
}

function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === "undefined") {
      return true
    }
    return document.documentElement.classList.contains("dark")
  })

  function toggle() {
    const next = !isDark
    document.documentElement.classList.toggle("dark", next)
    localStorage.setItem("mango-theme", next ? "dark" : "light")
    setIsDark(next)
  }

  return (
    <Button
      variant="sidebar-action"
      size="sidebar-action"
      onClick={toggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  )
}

export function ChannelRail(props: ChannelRailProps) {
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [copiedInvite, setCopiedInvite] = useState(false)

  function handleCopyInvite() {
    if (!props.latestInviteCode) return
    void navigator.clipboard.writeText(props.latestInviteCode)
    setCopiedInvite(true)
    setTimeout(() => setCopiedInvite(false), 2000)
  }

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col bg-sidebar">
      {props.selectedServer ? (
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
                  onClick={() => props.setSelectedChannelId(channel.id)}
                >
                  <Hash className="h-4 w-4 shrink-0 opacity-60" />
                  <span className="truncate">{channel.name}</span>
                </Button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Home / Friends header */}
          <div className="flex h-12 items-center border-b border-sidebar-border px-4">
            <h2 className="text-sm font-semibold text-sidebar-foreground">Friends</h2>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pt-3">
            {/* Friend search */}
            <form className="mb-3 flex gap-1.5" onSubmit={props.onSearchFriends}>
              <Input
                value={props.friendSearchQuery}
                onChange={(e) => props.setFriendSearchQuery(e.target.value)}
                placeholder="Search users..."
                className="h-8 text-xs"
              />
              <Button
                type="submit"
                size="icon-sm"
                variant="secondary"
                disabled={props.busyKey === "friend-search"}
              >
                <Search className="h-3.5 w-3.5" />
              </Button>
            </form>

            {/* Search results */}
            {props.friendSearchResults.length > 0 && (
              <div className="mb-4">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Search Results
                </p>
                <div className="space-y-1">
                  {props.friendSearchResults.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-sidebar-accent/50"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                          {user.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm text-sidebar-foreground">{user.displayName}</p>
                          <p className="truncate text-xs text-muted-foreground">@{user.username}</p>
                        </div>
                      </div>
                      <Button
                        variant="sidebar-action"
                        size="sidebar-action"
                        onClick={() => void props.onAddFriend(user.id)}
                        disabled={props.busyKey === "friend-add"}
                        title="Add friend"
                      >
                        <UserPlus className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Friends list */}
            <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Your Friends &mdash; {props.friends.length}
            </p>
            <div className="space-y-0.5">
              {props.friends.map((friend) => (
                <div
                  key={friend.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-sidebar-accent/50"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    {friend.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-sidebar-foreground">{friend.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">@{friend.username}</p>
                  </div>
                </div>
              ))}
              {props.friends.length === 0 && (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                  No friends yet. Search for users above.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {/* User panel */}
      <div className="flex items-center gap-2 border-t border-sidebar-border bg-sidebar-deep/50 px-3 py-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {props.me.displayName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-sidebar-foreground">{props.me.displayName}</p>
          <p className="truncate text-[11px] text-muted-foreground">@{props.me.username}</p>
        </div>
        <ThemeToggle />
        <Button
          variant="sidebar-action"
          size="sidebar-action"
          onClick={props.onSignOut}
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </aside>
  )
}
