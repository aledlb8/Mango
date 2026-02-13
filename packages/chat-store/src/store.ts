import type {
  AuditLogEntry,
  Attachment,
  Channel,
  ChannelPermissionOverwrite,
  DirectThread,
  FriendRequest,
  MessageDeletedEvent,
  MessageReactionSummary,
  Message,
  ModerationAction,
  ModerationActionType,
  Permission,
  PushSubscription,
  ReadMarker,
  Role,
  SearchResults,
  SearchScope,
  ServerInvite,
  Server,
  User
} from "@mango/contracts"

export type StoredUser = User & {
  passwordHash: string
}

export type StoreKind = "memory" | "postgres"

export interface AppStore {
  readonly kind: StoreKind
  createUser(email: string, username: string, displayName: string, passwordHash: string): Promise<StoredUser>
  findUserByEmail(email: string): Promise<StoredUser | null>
  findUserByUsername(username: string): Promise<StoredUser | null>
  findUserById(userId: string): Promise<StoredUser | null>
  searchUsers(query: string, excludeUserId: string): Promise<User[]>
  addFriend(userId: string, friendId: string): Promise<void>
  removeFriend(userId: string, friendId: string): Promise<boolean>
  listFriends(userId: string): Promise<User[]>
  createFriendRequest(fromUserId: string, toUserId: string): Promise<FriendRequest>
  listFriendRequests(userId: string): Promise<FriendRequest[]>
  respondFriendRequest(
    requestId: string,
    responderUserId: string,
    action: "accept" | "reject"
  ): Promise<FriendRequest | null>

  createSession(token: string, userId: string): Promise<void>
  getUserIdByToken(token: string): Promise<string | null>

  createDirectThread(ownerId: string, participantIds: string[], title: string): Promise<DirectThread>
  listDirectThreadsForUser(userId: string): Promise<DirectThread[]>
  getDirectThreadById(threadId: string): Promise<DirectThread | null>
  getDirectThreadByChannelId(channelId: string): Promise<DirectThread | null>
  isDirectThreadParticipant(threadId: string, userId: string): Promise<boolean>
  leaveDirectThread(threadId: string, userId: string): Promise<boolean>

  createServer(name: string, ownerId: string): Promise<Server>
  listServersForUser(userId: string): Promise<Server[]>
  getServerById(serverId: string): Promise<Server | null>
  leaveServer(serverId: string, userId: string): Promise<boolean>
  deleteServer(serverId: string): Promise<boolean>
  isServerMember(serverId: string, userId: string): Promise<boolean>
  addServerMember(serverId: string, userId: string): Promise<void>
  listServerMembers(serverId: string): Promise<User[]>
  hasServerPermission(serverId: string, userId: string, permission: Permission): Promise<boolean>
  isUserBanned(serverId: string, userId: string): Promise<boolean>
  isUserTimedOut(serverId: string, userId: string): Promise<boolean>
  createModerationAction(
    serverId: string,
    actorId: string,
    targetUserId: string,
    actionType: ModerationActionType,
    reason: string | null,
    expiresAt: string | null
  ): Promise<ModerationAction>
  listAuditLogs(serverId: string, limit: number): Promise<AuditLogEntry[]>

  createChannel(serverId: string, name: string): Promise<Channel>
  listChannels(serverId: string): Promise<Channel[]>
  listChannelsForUser(serverId: string, userId: string): Promise<Channel[]>
  getChannelById(channelId: string): Promise<Channel | null>
  updateChannel(channelId: string, name: string): Promise<Channel | null>
  deleteChannel(channelId: string): Promise<boolean>
  hasChannelPermission(channelId: string, userId: string, permission: Permission): Promise<boolean>

  createMessage(channelId: string, authorId: string, body: string, attachments: Attachment[]): Promise<Message>
  listMessages(channelId: string): Promise<Message[]>
  getMessageById(messageId: string): Promise<Message | null>
  updateMessage(messageId: string, body: string): Promise<Message | null>
  deleteMessage(messageId: string): Promise<MessageDeletedEvent | null>
  addReaction(messageId: string, userId: string, emoji: string): Promise<MessageReactionSummary[]>
  removeReaction(messageId: string, userId: string, emoji: string): Promise<MessageReactionSummary[]>
  listMessageReactions(messageId: string): Promise<MessageReactionSummary[]>
  getReadMarker(conversationId: string, userId: string): Promise<ReadMarker | null>
  upsertReadMarker(
    conversationId: string,
    userId: string,
    lastReadMessageId: string | null
  ): Promise<ReadMarker>

  listRoles(serverId: string): Promise<Role[]>
  createRole(serverId: string, name: string, permissions: Permission[]): Promise<Role>
  assignRole(serverId: string, roleId: string, memberId: string): Promise<void>
  getRoleById(roleId: string): Promise<Role | null>

  upsertChannelOverwrite(
    channelId: string,
    targetType: "role" | "member",
    targetId: string,
    allowPermissions: Permission[],
    denyPermissions: Permission[]
  ): Promise<ChannelPermissionOverwrite>
  listChannelOverwrites(channelId: string): Promise<ChannelPermissionOverwrite[]>

  createServerInvite(
    serverId: string,
    createdBy: string,
    maxUses: number | null,
    expiresAt: string | null
  ): Promise<ServerInvite>
  joinServerByInvite(code: string, userId: string): Promise<Server | null>

  createPushSubscription(
    userId: string,
    endpoint: string,
    p256dh: string,
    auth: string,
    userAgent: string | null
  ): Promise<PushSubscription>
  listPushSubscriptions(userId: string): Promise<PushSubscription[]>
  deletePushSubscription(userId: string, subscriptionId: string): Promise<boolean>
  enqueueNotification(userId: string, title: string, body: string, url: string | null): Promise<void>

  searchChannels(query: string, userId: string, serverId: string | null, limit: number): Promise<Channel[]>
  searchMessages(query: string, userId: string, serverId: string | null, limit: number): Promise<Message[]>
  search(
    query: string,
    userId: string,
    scope: SearchScope,
    serverId: string | null,
    limit: number
  ): Promise<SearchResults>
}

export type StoreInitResult = {
  store: AppStore
  mode: StoreKind
}
