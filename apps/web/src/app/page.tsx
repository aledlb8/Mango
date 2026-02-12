"use client"

import { AuthGate, ChannelRail, ChatSidebar, ChatThread } from "@/features/chat-app/components"
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
        channels={app.channels}
        busyKey={app.busyKey}
        channelName={app.channelName}
        latestInviteCode={app.latestInviteCode}
        friends={app.friends}
        friendSearchQuery={app.friendSearchQuery}
        friendSearchResults={app.friendSearchResults}
        setChannelName={app.setChannelName}
        setSelectedChannelId={app.setSelectedChannelId}
        setFriendSearchQuery={app.setFriendSearchQuery}
        onCreateChannel={app.handleCreateChannel}
        onCreateInvite={app.handleCreateInvite}
        onSearchFriends={app.handleSearchFriends}
        onAddFriend={app.handleAddFriend}
        onSignOut={app.handleSignOut}
      />

      <ChatThread
        me={app.me}
        selectedChannel={app.selectedChannel}
        messages={app.messages}
        messageBody={app.messageBody}
        busyKey={app.busyKey}
        realtimeStatus={app.realtimeStatus}
        setMessageBody={app.setMessageBody}
        onSendMessage={app.handleSendMessage}
        onUpdateMessage={app.handleUpdateMessage}
        onDeleteMessage={app.handleDeleteMessage}
        onAddReaction={app.handleAddReaction}
        onRemoveReaction={app.handleRemoveReaction}
        getAuthorLabel={app.getAuthorLabel}
      />
    </div>
  )
}
