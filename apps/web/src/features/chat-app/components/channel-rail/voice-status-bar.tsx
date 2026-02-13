import type { ActiveVoiceInfo } from "../../use-chat-app"
import type { VoiceSession } from "@/lib/api"
import { Mic, MicOff, Headphones, HeadphoneOff, PhoneOff, Signal } from "lucide-react"
import { Button } from "@/components/ui/button"

type VoiceStatusBarProps = {
  activeVoiceInfo: ActiveVoiceInfo
  connectedVoiceSession: VoiceSession | null
  voiceConnectionStatus: "disconnected" | "connecting" | "connected" | "reconnecting"
  voiceMuted: boolean
  voiceDeafened: boolean
  onLeaveVoice: () => Promise<void>
  onToggleVoiceMute: () => Promise<void>
  onToggleVoiceDeafen: () => Promise<void>
}

export function VoiceStatusBar(props: VoiceStatusBarProps) {
  const isConnected = props.voiceConnectionStatus === "connected"
  const isConnecting = props.voiceConnectionStatus === "connecting"
  const isReconnecting = props.voiceConnectionStatus === "reconnecting"

  const statusLabel = isConnected
    ? "Voice Connected"
    : isConnecting
      ? "Connecting..."
      : isReconnecting
        ? "Reconnecting..."
        : "Disconnected"

  const statusColor = isConnected
    ? "text-green-500"
    : isConnecting || isReconnecting
      ? "text-yellow-500"
      : "text-red-500"

  const participantCount = props.connectedVoiceSession?.participants.length ?? 0

  return (
    <div className="border-t border-sidebar-border bg-sidebar-deep/50">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Signal className={`h-3.5 w-3.5 shrink-0 ${statusColor}`} />
            <span className={`text-xs font-semibold ${statusColor}`}>{statusLabel}</span>
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {props.activeVoiceInfo.channelName}
            {participantCount > 0 ? ` \u2022 ${participantCount}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 rounded-md ${props.voiceMuted ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:text-red-400" : "text-sidebar-foreground/70 hover:text-sidebar-foreground"}`}
            onClick={() => void props.onToggleVoiceMute()}
            title={props.voiceMuted ? "Unmute" : "Mute"}
          >
            {props.voiceMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 rounded-md ${props.voiceDeafened ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:text-red-400" : "text-sidebar-foreground/70 hover:text-sidebar-foreground"}`}
            onClick={() => void props.onToggleVoiceDeafen()}
            title={props.voiceDeafened ? "Undeafen" : "Deafen"}
          >
            {props.voiceDeafened ? <HeadphoneOff className="h-4 w-4" /> : <Headphones className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-md text-sidebar-foreground/70 hover:bg-red-500/20 hover:text-red-400"
            onClick={() => void props.onLeaveVoice()}
            title="Disconnect"
          >
            <PhoneOff className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
