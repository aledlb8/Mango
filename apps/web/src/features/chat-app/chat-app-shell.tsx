"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { AuthGate, ChannelRail, ChatSidebar, ChatThread, FriendsView } from "@/features/chat-app/components"
import { dmPath, friendsPath, serverChannelPath, serverPath, type ChatAppRoute } from "./route"
import { useChatApp } from "./use-chat-app"

type ChatAppShellProps = {
  route: ChatAppRoute
}

export function ChatAppShell(props: ChatAppShellProps) {
  const router = useRouter()
  const routeKind = props.route.kind
  const routeServerId = routeKind === "server" ? props.route.serverId : null
  const routeChannelId = routeKind === "server" ? (props.route.channelId ?? null) : null
  const routeThreadId = routeKind === "dm" ? props.route.threadId : null

  const app = useChatApp(props.route)

  useEffect(() => {
    if (!app.token || !app.me) {
      return
    }

    if (app.selectedServerId) {
      if (routeKind !== "server" || routeServerId !== app.selectedServerId) {
        router.replace(serverPath(app.selectedServerId))
        return
      }

      if (app.selectedChannelId && routeChannelId !== app.selectedChannelId) {
        router.replace(serverChannelPath(app.selectedServerId, app.selectedChannelId))
      }
      return
    }

    if (app.selectedDirectThreadId) {
      if (routeKind !== "dm" || routeThreadId !== app.selectedDirectThreadId) {
        router.replace(dmPath(app.selectedDirectThreadId))
      }
      return
    }

    if (routeKind !== "friends") {
      router.replace(friendsPath())
    }
  }, [
    app.token,
    app.me,
    app.selectedServerId,
    app.selectedChannelId,
    app.selectedDirectThreadId,
    routeKind,
    routeServerId,
    routeChannelId,
    routeThreadId,
    router
  ])

  function handleSelectHome(): void {
    app.handleSelectFriendsView()
    router.push(friendsPath())
  }

  function handleSelectServer(serverId: string): void {
    app.setSelectedServerId(serverId)
    app.setSelectedDirectThreadId(null)
    router.push(serverPath(serverId))
  }

  function handleSelectChannel(channelId: string): void {
    app.setSelectedChannelId(channelId)
    if (app.selectedServerId) {
      router.push(serverChannelPath(app.selectedServerId, channelId))
    }
  }

  function handleSelectDirectThread(threadId: string): void {
    app.handleSelectDirectThread(threadId)
    router.push(dmPath(threadId))
  }

  function handleSelectFriendsView(): void {
    app.handleSelectFriendsView()
    router.push(friendsPath())
  }

  if (!app.token || !app.me) {
    return (
      <AuthGate
        busyKey={app.busyKey}
        registerEmail={app.registerEmail}
        registerUsername={app.registerUsername}
        registerDisplayName={app.registerDisplayName}
        registerPassword={app.registerPassword}
        loginIdentifier={app.loginIdentifier}
        loginPassword={app.loginPassword}
        onRegister={app.handleRegister}
        onLogin={app.handleLogin}
        setRegisterEmail={app.setRegisterEmail}
        setRegisterUsername={app.setRegisterUsername}
        setRegisterDisplayName={app.setRegisterDisplayName}
        setRegisterPassword={app.setRegisterPassword}
        setLoginIdentifier={app.setLoginIdentifier}
        setLoginPassword={app.setLoginPassword}
        errorMessage={app.errorMessage}
      />
    )
  }

  const showFriendsView = !app.selectedServer && !app.selectedDirectThread

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
      />

      <ChannelRail
        me={app.me}
        selectedServer={app.selectedServer}
        selectedChannelId={app.selectedChannelId}
        selectedDirectThreadId={app.selectedDirectThreadId}
        channels={app.channels}
        directThreads={app.directThreads}
        busyKey={app.busyKey}
        channelName={app.channelName}
        latestInviteCode={app.latestInviteCode}
        pendingRequestCount={app.pendingRequestCount}
        setChannelName={app.setChannelName}
        onSelectChannel={handleSelectChannel}
        onSelectDirectThread={handleSelectDirectThread}
        onSelectFriendsView={handleSelectFriendsView}
        onCreateChannel={app.handleCreateChannel}
        onCreateInvite={app.handleCreateInvite}
        getDirectThreadLabel={app.getDirectThreadLabel}
        getDirectThreadAvatar={app.getDirectThreadAvatar}
        onSignOut={app.handleSignOut}
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
          setMessageBody={app.setMessageBody}
          onPickAttachments={app.handlePickAttachments}
          onRemovePendingAttachment={app.handleRemovePendingAttachment}
          onSendMessage={app.handleSendMessage}
          onUpdateMessage={app.handleUpdateMessage}
          onDeleteMessage={app.handleDeleteMessage}
          onAddReaction={app.handleAddReaction}
          onRemoveReaction={app.handleRemoveReaction}
          getAuthorLabel={app.getAuthorLabel}
        />
      )}
    </div>
  )
}
