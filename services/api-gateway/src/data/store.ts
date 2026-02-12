import type {
  Channel,
  ChannelPermissionOverwrite,
  MessageDeletedEvent,
  MessageReactionSummary,
  Message,
  Permission,
  Role,
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
  listFriends(userId: string): Promise<User[]>

  createSession(token: string, userId: string): Promise<void>
  getUserIdByToken(token: string): Promise<string | null>

  createServer(name: string, ownerId: string): Promise<Server>
  listServersForUser(userId: string): Promise<Server[]>
  getServerById(serverId: string): Promise<Server | null>
  isServerMember(serverId: string, userId: string): Promise<boolean>
  addServerMember(serverId: string, userId: string): Promise<void>
  listServerMembers(serverId: string): Promise<User[]>
  hasServerPermission(serverId: string, userId: string, permission: Permission): Promise<boolean>

  createChannel(serverId: string, name: string): Promise<Channel>
  listChannels(serverId: string): Promise<Channel[]>
  listChannelsForUser(serverId: string, userId: string): Promise<Channel[]>
  getChannelById(channelId: string): Promise<Channel | null>
  hasChannelPermission(channelId: string, userId: string, permission: Permission): Promise<boolean>

  createMessage(channelId: string, authorId: string, body: string): Promise<Message>
  listMessages(channelId: string): Promise<Message[]>
  getMessageById(messageId: string): Promise<Message | null>
  updateMessage(messageId: string, body: string): Promise<Message | null>
  deleteMessage(messageId: string): Promise<MessageDeletedEvent | null>
  addReaction(messageId: string, userId: string, emoji: string): Promise<MessageReactionSummary[]>
  removeReaction(messageId: string, userId: string, emoji: string): Promise<MessageReactionSummary[]>
  listMessageReactions(messageId: string): Promise<MessageReactionSummary[]>

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
}

export type StoreInitResult = {
  store: AppStore
  mode: StoreKind
}
