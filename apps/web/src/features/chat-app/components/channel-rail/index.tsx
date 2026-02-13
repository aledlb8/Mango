import type { FormEvent } from "react"
import type { Channel, DirectThread, Server, User, VoiceSession } from "@/lib/api"
import type { ActiveVoiceInfo } from "../../use-chat-app"
import { ServerPanel } from "./server-panel"
import { FriendsPanel } from "./friends-panel"
import { UserPanel } from "./user-panel"
import { VoiceStatusBar } from "./voice-status-bar"

type ChannelRailProps = {
  me: User
  viewMode: "server" | "friends"
  selectedServer: Server | null
  selectedChannelId: string | null
  selectedDirectThreadId: string | null
  channels: Channel[]
  directThreads: DirectThread[]
  busyKey: string | null
  channelName: string
  channelType: Channel["type"]
  latestInviteCode: string | null
  pendingRequestCount: number
  activeVoiceInfo: ActiveVoiceInfo | null
  connectedVoiceSession: VoiceSession | null
  voiceConnectionStatus: "disconnected" | "connecting" | "connected" | "reconnecting"
  voiceMuted: boolean
  voiceDeafened: boolean
  voiceSessionsByTarget: Record<string, VoiceSession>
  setChannelName: (value: string) => void
  setChannelType: (value: Channel["type"]) => void
  onSelectChannel: (channelId: string) => void
  onSelectDirectThread: (value: string) => void
  onSelectFriendsView: () => void
  onCreateChannel: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onCreateInvite: () => Promise<void>
  onLeaveVoice: () => Promise<void>
  onToggleVoiceMute: () => Promise<void>
  onToggleVoiceDeafen: () => Promise<void>
  getDirectThreadLabel: (thread: DirectThread) => string
  getDirectThreadAvatar: (thread: DirectThread) => string
  getUserLabel: (userId: string) => string
  onSignOut: () => void
  onEditChannel: (channelId: string, name: string) => Promise<void>
  onDeleteChannel: (channelId: string) => Promise<void>
  onCloseDirectThread: (threadId: string) => Promise<void>
  copyToClipboard: (text: string) => void
}

export function ChannelRail(props: ChannelRailProps) {
  const showServerPanel = props.viewMode === "server"
  const showVoiceBar = Boolean(props.activeVoiceInfo) && props.voiceConnectionStatus !== "disconnected"

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col bg-sidebar">
      {showServerPanel ? (
        <ServerPanel
          me={props.me}
          selectedServer={props.selectedServer}
          selectedChannelId={props.selectedChannelId}
          channels={props.channels}
          busyKey={props.busyKey}
          channelName={props.channelName}
          channelType={props.channelType}
          latestInviteCode={props.latestInviteCode}
          voiceSessionsByTarget={props.voiceSessionsByTarget}
          setChannelName={props.setChannelName}
          setChannelType={props.setChannelType}
          onSelectChannel={props.onSelectChannel}
          onCreateChannel={props.onCreateChannel}
          onCreateInvite={props.onCreateInvite}
          onEditChannel={props.onEditChannel}
          onDeleteChannel={props.onDeleteChannel}
          getUserLabel={props.getUserLabel}
          copyToClipboard={props.copyToClipboard}
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
          onCloseDirectThread={props.onCloseDirectThread}
        />
      )}

      {showVoiceBar && props.activeVoiceInfo ? (
        <VoiceStatusBar
          activeVoiceInfo={props.activeVoiceInfo}
          connectedVoiceSession={props.connectedVoiceSession}
          voiceConnectionStatus={props.voiceConnectionStatus}
          voiceMuted={props.voiceMuted}
          voiceDeafened={props.voiceDeafened}
          onLeaveVoice={props.onLeaveVoice}
          onToggleVoiceMute={props.onToggleVoiceMute}
          onToggleVoiceDeafen={props.onToggleVoiceDeafen}
        />
      ) : null}

      <UserPanel me={props.me} onSignOut={props.onSignOut} />
    </aside>
  )
}
