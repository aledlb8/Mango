import type { FormEvent } from "react"
import type { Channel, DirectThread, Server, User } from "@/lib/api"
import { ServerPanel } from "./server-panel"
import { FriendsPanel } from "./friends-panel"
import { UserPanel } from "./user-panel"

type ChannelRailProps = {
  me: User
  selectedServer: Server | null
  selectedChannelId: string | null
  selectedDirectThreadId: string | null
  channels: Channel[]
  directThreads: DirectThread[]
  busyKey: string | null
  channelName: string
  latestInviteCode: string | null
  pendingRequestCount: number
  setChannelName: (value: string) => void
  setSelectedChannelId: (value: string) => void
  onSelectDirectThread: (value: string) => void
  onSelectFriendsView: () => void
  onCreateChannel: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onCreateInvite: () => Promise<void>
  getDirectThreadLabel: (thread: DirectThread) => string
  getDirectThreadAvatar: (thread: DirectThread) => string
  onSignOut: () => void
}

export function ChannelRail(props: ChannelRailProps) {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col bg-sidebar">
      {props.selectedServer ? (
        <ServerPanel
          selectedServer={props.selectedServer}
          selectedChannelId={props.selectedChannelId}
          channels={props.channels}
          busyKey={props.busyKey}
          channelName={props.channelName}
          latestInviteCode={props.latestInviteCode}
          setChannelName={props.setChannelName}
          setSelectedChannelId={props.setSelectedChannelId}
          onCreateChannel={props.onCreateChannel}
          onCreateInvite={props.onCreateInvite}
        />
      ) : (
        <FriendsPanel
          directThreads={props.directThreads}
          selectedDirectThreadId={props.selectedDirectThreadId}
          pendingRequestCount={props.pendingRequestCount}
          onSelectFriendsView={props.onSelectFriendsView}
          onSelectDirectThread={props.onSelectDirectThread}
          getDirectThreadLabel={props.getDirectThreadLabel}
          getDirectThreadAvatar={props.getDirectThreadAvatar}
        />
      )}

      <UserPanel me={props.me} onSignOut={props.onSignOut} />
    </aside>
  )
}
