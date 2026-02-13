"use client"

import { AuthGate, ChannelRail, ChatSidebar, ChatThread, FriendsView } from "@/features/chat-app/components"
import { useChatApp } from "@/features/chat-app/use-chat-app"

export default function Home() {
  const app = useChatApp()

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
        setSelectedServerId={app.setSelectedServerId}
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
        setSelectedChannelId={app.setSelectedChannelId}
        onSelectDirectThread={app.handleSelectDirectThread}
        onSelectFriendsView={app.handleSelectFriendsView}
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
