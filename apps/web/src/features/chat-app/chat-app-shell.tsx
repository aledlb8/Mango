"use client"

import { useEffect, useMemo, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ChannelRail, ChatSidebar, ChatThread, FriendsView } from "@/features/chat-app/components"
import type { User } from "@/lib/api"
import { dmPath, friendsPath, routeFromPathname, serverChannelPath, serverPath } from "./route"
import { useChatApp } from "./use-chat-app"

type ChatAppShellProps = {
  initialToken?: string | null
  initialMe?: User | null
}

export function ChatAppShell(props: ChatAppShellProps) {
  const router = useRouter()
  const pathname = usePathname()
  const pendingNormalizePathRef = useRef<string | null>(null)
  const route = useMemo(() => routeFromPathname(pathname), [pathname])
  const routeKind = route.kind
  const routeServerId = routeKind === "server" ? route.serverId : null
  const routeChannelId = routeKind === "server" ? (route.channelId ?? null) : null
  const routeThreadId = routeKind === "dm" ? route.threadId : null

  const app = useChatApp(route, props.initialToken ?? null, props.initialMe ?? null)

  useEffect(() => {
    if (pendingNormalizePathRef.current && pathname === pendingNormalizePathRef.current) {
      pendingNormalizePathRef.current = null
    }
  }, [pathname])

  useEffect(() => {
    if (!app.isAuthInitializing && (!app.token || !app.me)) {
      router.replace("/auth")
    }
  }, [app.isAuthInitializing, app.token, app.me, router])

  useEffect(() => {
    if (!app.token || !app.me) {
      return
    }

    if (routeKind === "server" && routeServerId && app.selectedServerId === routeServerId) {
      const routeChannelExists =
        routeChannelId !== null && app.channels.some((channel) => channel.id === routeChannelId)

      if (routeChannelId === null && app.selectedChannelId) {
        const target = serverChannelPath(routeServerId, app.selectedChannelId)
        if (pathname !== target && pendingNormalizePathRef.current !== target) {
          pendingNormalizePathRef.current = target
          router.replace(target)
        }
      } else if (routeChannelId && app.channels.length > 0 && !routeChannelExists) {
        if (app.selectedChannelId) {
          const target = serverChannelPath(routeServerId, app.selectedChannelId)
          if (pathname !== target && pendingNormalizePathRef.current !== target) {
            pendingNormalizePathRef.current = target
            router.replace(target)
          }
          return
        }

        const target = serverPath(routeServerId)
        if (pathname !== target && pendingNormalizePathRef.current !== target) {
          pendingNormalizePathRef.current = target
          router.replace(target)
        }
      }
      return
    }

    if (routeKind === "dm" && routeThreadId) {
      const routeThreadExists = app.directThreads.some((thread) => thread.id === routeThreadId)
      if (app.directThreads.length > 0 && !routeThreadExists) {
        const target = friendsPath()
        if (pathname !== target && pendingNormalizePathRef.current !== target) {
          pendingNormalizePathRef.current = target
          router.replace(target)
        }
      }
    }
  }, [
    app.token,
    app.me,
    app.selectedServerId,
    app.selectedChannelId,
    app.selectedDirectThreadId,
    app.channels,
    app.directThreads,
    routeKind,
    routeServerId,
    routeChannelId,
    routeThreadId,
    pathname,
    router
  ])

  async function handleLeaveServer(serverId: string): Promise<void> {
    await app.handleLeaveServer(serverId)
    if (routeKind === "server" && routeServerId === serverId) {
      const target = friendsPath()
      if (pathname !== target) {
        router.push(target)
      }
    }
  }

  async function handleDeleteServer(serverId: string): Promise<void> {
    await app.handleDeleteServer(serverId)
    if (routeKind === "server" && routeServerId === serverId) {
      const target = friendsPath()
      if (pathname !== target) {
        router.push(target)
      }
    }
  }

  async function handleCloseDirectThread(threadId: string): Promise<void> {
    await app.handleCloseDirectThread(threadId)
    if (routeKind === "dm" && routeThreadId === threadId) {
      const target = friendsPath()
      if (pathname !== target) {
        router.push(target)
      }
    }
  }

  if (app.isAuthInitializing && !app.me) {
    return (
      <main className="flex h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading session...</p>
      </main>
    )
  }

  function handleSelectHome(): void {
    const target = friendsPath()
    if (pathname !== target) {
      router.push(target)
    }
  }

  function handleSelectServer(serverId: string): void {
    const target = serverPath(serverId)
    if (pathname !== target) {
      router.push(target)
    }
  }

  function handleSelectChannel(channelId: string): void {
    if (app.selectedServerId) {
      const target = serverChannelPath(app.selectedServerId, channelId)
      if (pathname !== target) {
        router.push(target)
      }
    }
  }

  function handleSelectDirectThread(threadId: string): void {
    const target = dmPath(threadId)
    if (pathname !== target) {
      router.push(target)
    }
  }

  function handleSelectFriendsView(): void {
    const target = friendsPath()
    if (pathname !== target) {
      router.push(target)
    }
  }

  if (!app.token || !app.me) {
    return (
      <main className="flex h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Redirecting to sign in...</p>
      </main>
    )
  }

  const showFriendsView = routeKind === "friends"

  return (
    <div className="flex h-screen overflow-hidden">
      <ChatSidebar
        me={app.me}
        busyKey={app.busyKey}
        servers={app.servers}
        selectedServerId={app.selectedServerId}
        serverName={app.serverName}
        inviteCode={app.inviteCode}
        onSelectHome={handleSelectHome}
        onSelectServer={handleSelectServer}
        setServerName={app.setServerName}
        setInviteCode={app.setInviteCode}
        onCreateServer={app.handleCreateServer}
        onJoinServer={app.handleJoinServer}
        onLeaveServer={handleLeaveServer}
        onDeleteServer={handleDeleteServer}
        copyToClipboard={app.copyToClipboard}
      />

      <ChannelRail
        me={app.me}
        viewMode={routeKind === "server" ? "server" : "friends"}
        selectedServer={app.selectedServer}
        selectedChannelId={app.selectedChannelId}
        selectedDirectThreadId={app.selectedDirectThreadId}
        channels={app.channels}
        directThreads={app.directThreads}
        busyKey={app.busyKey}
        channelName={app.channelName}
        channelType={app.channelType}
        latestInviteCode={app.latestInviteCode}
        pendingRequestCount={app.pendingRequestCount}
        activeVoiceInfo={app.activeVoiceInfo}
        connectedVoiceSession={app.connectedVoiceSession}
        voiceConnectionStatus={app.voiceConnectionStatus}
        voiceMuted={app.voiceMuted}
        voiceDeafened={app.voiceDeafened}
        voiceSessionsByTarget={app.voiceSessionsByTarget}
        setChannelName={app.setChannelName}
        setChannelType={app.setChannelType}
        onSelectChannel={handleSelectChannel}
        onSelectDirectThread={handleSelectDirectThread}
        onSelectFriendsView={handleSelectFriendsView}
        onCreateChannel={app.handleCreateChannel}
        onCreateInvite={app.handleCreateInvite}
        onLeaveVoice={app.handleLeaveVoice}
        onToggleVoiceMute={app.handleToggleVoiceMute}
        onToggleVoiceDeafen={app.handleToggleVoiceDeafen}
        getDirectThreadLabel={app.getDirectThreadLabel}
        getDirectThreadAvatar={app.getDirectThreadAvatar}
        getUserLabel={app.getUserLabel}
        onSignOut={app.handleSignOut}
        onEditChannel={app.handleEditChannel}
        onDeleteChannel={app.handleDeleteChannel}
        onCloseDirectThread={handleCloseDirectThread}
        copyToClipboard={app.copyToClipboard}
      />

      {showFriendsView ? (
        <FriendsView
          me={app.me}
          friends={app.friends}
          friendRequests={app.friendRequests}
          friendSearchQuery={app.friendSearchQuery}
          friendSearchResults={app.friendSearchResults}
          busyKey={app.busyKey}
          setFriendSearchQuery={app.setFriendSearchQuery}
          onSearchFriends={app.handleSearchFriends}
          onSendFriendRequest={app.handleSendFriendRequest}
          onRespondToFriendRequest={app.handleRespondToFriendRequest}
          onOpenDirectThread={app.handleOpenDirectThread}
          getUserLabel={app.getUserLabel}
          getUserPresenceStatus={app.getUserPresenceStatus}
          onRemoveFriend={app.handleRemoveFriend}
        />
      ) : (
        <ChatThread
          me={app.me}
          selectedChannel={app.selectedChannel}
          selectedDirectThread={app.selectedDirectThread}
          messages={app.messages}
          messageBody={app.messageBody}
          pendingAttachments={app.pendingAttachments}
          typingUserLabels={app.typingUserLabels}
          busyKey={app.busyKey}
          realtimeStatus={app.realtimeStatus}
          voiceSession={app.activeVoiceSession}
          activeVoiceInfo={app.activeVoiceInfo}
          voiceConnectionStatus={app.voiceConnectionStatus}
          voiceMuted={app.voiceMuted}
          voiceDeafened={app.voiceDeafened}
          voiceSpeaking={app.voiceSpeaking}
          voiceScreenSharing={app.voiceScreenSharing}
          screenShareAvailable={app.screenShareAvailable}
          setMessageBody={app.setMessageBody}
          onPickAttachments={app.handlePickAttachments}
          onRemovePendingAttachment={app.handleRemovePendingAttachment}
          onSendMessage={app.handleSendMessage}
          onUpdateMessage={app.handleUpdateMessage}
          onDeleteMessage={app.handleDeleteMessage}
          onAddReaction={app.handleAddReaction}
          onRemoveReaction={app.handleRemoveReaction}
          onJoinVoice={app.handleJoinVoice}
          onLeaveVoice={app.handleLeaveVoice}
          onToggleVoiceMute={app.handleToggleVoiceMute}
          onToggleVoiceDeafen={app.handleToggleVoiceDeafen}
          onToggleVoiceSpeaking={app.handleToggleVoiceSpeaking}
          onToggleVoiceScreenShare={app.handleToggleVoiceScreenShare}
          getAuthorLabel={app.getAuthorLabel}
          getUserLabel={app.getUserLabel}
          copyToClipboard={app.copyToClipboard}
        />
      )}
    </div>
  )
}
