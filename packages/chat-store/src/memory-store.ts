import type {
  Attachment,
  Channel,
  ChannelPermissionOverwrite,
  DirectThread,
  FriendRequest,
  Message,
  MessageDeletedEvent,
  MessageReactionSummary,
  Permission,
  ReadMarker,
  Role,
  ServerInvite,
  Server,
  User
} from "@mango/contracts"
import { createId } from "./id"
import {
  DEFAULT_MEMBER_PERMISSIONS,
  OWNER_ROLE_PERMISSIONS,
  hasPermissionAfterOverwrites,
  sanitizePermissions
} from "./permissions"
import type { AppStore, StoredUser } from "./store"

type MemoryState = {
  usersById: Map<string, StoredUser>
  usersByEmail: Map<string, StoredUser>
  usersByUsername: Map<string, StoredUser>
  sessionsByToken: Map<string, string>
  directThreadsById: Map<string, DirectThread>
  directThreadIdsByUserId: Map<string, string[]>
  directThreadIdByChannelId: Map<string, string>
  dmThreadIdsByPairKey: Map<string, string>
  serversById: Map<string, Server>
  hiddenServerIds: Set<string>
  membersByServerId: Map<string, Set<string>>
  channelsById: Map<string, Channel>
  hiddenChannelIds: Set<string>
  channelIdsByServerId: Map<string, string[]>
  messagesById: Map<string, Message>
  messageIdsByChannelId: Map<string, string[]>
  readMarkersByConversationUser: Map<string, ReadMarker>
  rolesById: Map<string, Role>
  roleIdsByServerId: Map<string, string[]>
  memberRoleIdsByServerUser: Map<string, Set<string>>
  overwritesByChannelId: Map<string, ChannelPermissionOverwrite[]>
  reactionUsersByMessageId: Map<string, Map<string, Set<string>>>
  friendsByUserId: Map<string, Set<string>>
  friendRequestsById: Map<string, FriendRequest>
  invitesByCode: Map<string, ServerInvite>
}

function createMemoryState(): MemoryState {
  return {
    usersById: new Map<string, StoredUser>(),
    usersByEmail: new Map<string, StoredUser>(),
    usersByUsername: new Map<string, StoredUser>(),
    sessionsByToken: new Map<string, string>(),
    directThreadsById: new Map<string, DirectThread>(),
    directThreadIdsByUserId: new Map<string, string[]>(),
    directThreadIdByChannelId: new Map<string, string>(),
    dmThreadIdsByPairKey: new Map<string, string>(),
    serversById: new Map<string, Server>(),
    hiddenServerIds: new Set<string>(),
    membersByServerId: new Map<string, Set<string>>(),
    channelsById: new Map<string, Channel>(),
    hiddenChannelIds: new Set<string>(),
    channelIdsByServerId: new Map<string, string[]>(),
    messagesById: new Map<string, Message>(),
    messageIdsByChannelId: new Map<string, string[]>(),
    readMarkersByConversationUser: new Map<string, ReadMarker>(),
    rolesById: new Map<string, Role>(),
    roleIdsByServerId: new Map<string, string[]>(),
    memberRoleIdsByServerUser: new Map<string, Set<string>>(),
    overwritesByChannelId: new Map<string, ChannelPermissionOverwrite[]>(),
    reactionUsersByMessageId: new Map<string, Map<string, Set<string>>>(),
    friendsByUserId: new Map<string, Set<string>>(),
    friendRequestsById: new Map<string, FriendRequest>(),
    invitesByCode: new Map<string, ServerInvite>()
  }
}

function memberRoleKey(serverId: string, userId: string): string {
  return `${serverId}:${userId}`
}

function toPublicUser(user: StoredUser): User {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    createdAt: user.createdAt
  }
}

function conversationReadMarkerKey(conversationId: string, userId: string): string {
  return `${conversationId}:${userId}`
}

function dmPairKey(userIds: string[]): string {
  return [...userIds].sort((a, b) => a.localeCompare(b)).join(":")
}

function cloneAttachment(attachment: Attachment): Attachment {
  return {
    ...attachment
  }
}

function cloneDirectThread(thread: DirectThread): DirectThread {
  return {
    ...thread,
    participantIds: [...thread.participantIds]
  }
}

function generateInviteCode(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()
}

function summarizeReactions(reactionUsers: Map<string, Set<string>> | undefined): MessageReactionSummary[] {
  if (!reactionUsers) {
    return []
  }

  const summary: MessageReactionSummary[] = []
  for (const [emoji, users] of reactionUsers.entries()) {
    if (users.size > 0) {
      summary.push({ emoji, count: users.size })
    }
  }

  return summary.sort((a, b) => a.emoji.localeCompare(b.emoji))
}

function cloneMessage(message: Message): Message {
  return {
    ...message,
    attachments: message.attachments.map(cloneAttachment),
    reactions: [...message.reactions]
  }
}

export class MemoryStore implements AppStore {
  readonly kind = "memory" as const
  private readonly state = createMemoryState()

  async createUser(email: string, username: string, displayName: string, passwordHash: string): Promise<StoredUser> {
    const user: StoredUser = {
      id: createId("usr"),
      email,
      username,
      displayName,
      passwordHash,
      createdAt: new Date().toISOString()
    }
    this.state.usersById.set(user.id, user)
    this.state.usersByEmail.set(email, user)
    this.state.usersByUsername.set(username.toLowerCase(), user)
    this.state.friendsByUserId.set(user.id, new Set<string>())
    return user
  }

  async findUserByEmail(email: string): Promise<StoredUser | null> {
    return this.state.usersByEmail.get(email) ?? null
  }

  async findUserByUsername(username: string): Promise<StoredUser | null> {
    return this.state.usersByUsername.get(username.toLowerCase()) ?? null
  }

  async findUserById(userId: string): Promise<StoredUser | null> {
    return this.state.usersById.get(userId) ?? null
  }

  async searchUsers(query: string, excludeUserId: string): Promise<User[]> {
    const normalized = query.trim().toLowerCase()
    if (!normalized) {
      return []
    }

    return Array.from(this.state.usersById.values())
      .filter((user) => user.id !== excludeUserId)
      .filter((user) => {
        return (
          user.username.toLowerCase().includes(normalized) ||
          user.displayName.toLowerCase().includes(normalized)
        )
      })
      .slice(0, 20)
      .map(toPublicUser)
  }

  async addFriend(userId: string, friendId: string): Promise<void> {
    if (userId === friendId) {
      return
    }

    const userFriends = this.state.friendsByUserId.get(userId) ?? new Set<string>()
    userFriends.add(friendId)
    this.state.friendsByUserId.set(userId, userFriends)

    const friendFriends = this.state.friendsByUserId.get(friendId) ?? new Set<string>()
    friendFriends.add(userId)
    this.state.friendsByUserId.set(friendId, friendFriends)
  }

  async createFriendRequest(fromUserId: string, toUserId: string): Promise<FriendRequest> {
    if (fromUserId === toUserId) {
      throw new Error("You cannot send a friend request to yourself.")
    }

    const alreadyFriends = this.state.friendsByUserId.get(fromUserId)?.has(toUserId) ?? false
    if (alreadyFriends) {
      throw new Error("Users are already friends.")
    }

    const existing = Array.from(this.state.friendRequestsById.values()).find((request) => {
      if (request.status !== "pending") {
        return false
      }

      return (
        (request.fromUserId === fromUserId && request.toUserId === toUserId) ||
        (request.fromUserId === toUserId && request.toUserId === fromUserId)
      )
    })

    if (existing) {
      return { ...existing }
    }

    const request: FriendRequest = {
      id: createId("frq"),
      fromUserId,
      toUserId,
      status: "pending",
      createdAt: new Date().toISOString(),
      respondedAt: null
    }

    this.state.friendRequestsById.set(request.id, request)
    return { ...request }
  }

  async listFriendRequests(userId: string): Promise<FriendRequest[]> {
    return Array.from(this.state.friendRequestsById.values())
      .filter((request) => request.status === "pending")
      .filter((request) => request.fromUserId === userId || request.toUserId === userId)
      .map((request) => ({ ...request }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async respondFriendRequest(
    requestId: string,
    responderUserId: string,
    action: "accept" | "reject"
  ): Promise<FriendRequest | null> {
    const request = this.state.friendRequestsById.get(requestId)
    if (!request || request.status !== "pending") {
      return null
    }

    if (request.toUserId !== responderUserId) {
      return null
    }

    request.status = action === "accept" ? "accepted" : "rejected"
    request.respondedAt = new Date().toISOString()
    this.state.friendRequestsById.set(request.id, request)

    if (action === "accept") {
      await this.addFriend(request.fromUserId, request.toUserId)
    }

    return { ...request }
  }

  async listFriends(userId: string): Promise<User[]> {
    const friendIds = Array.from(this.state.friendsByUserId.get(userId) ?? [])
    const friends: User[] = []

    for (const friendId of friendIds) {
      const user = this.state.usersById.get(friendId)
      if (!user) {
        continue
      }
      friends.push(toPublicUser(user))
    }

    return friends
  }

  async createSession(token: string, userId: string): Promise<void> {
    this.state.sessionsByToken.set(token, userId)
  }

  async getUserIdByToken(token: string): Promise<string | null> {
    return this.state.sessionsByToken.get(token) ?? null
  }

  async createDirectThread(ownerId: string, participantIds: string[], title: string): Promise<DirectThread> {
    const uniqueParticipantIds = Array.from(new Set([ownerId, ...participantIds])).filter((userId) =>
      this.state.usersById.has(userId)
    )

    if (uniqueParticipantIds.length < 2) {
      throw new Error("Direct threads require at least two existing users.")
    }

    const kind: DirectThread["kind"] = uniqueParticipantIds.length === 2 ? "dm" : "group"
    if (kind === "dm") {
      const key = dmPairKey(uniqueParticipantIds)
      const existingThreadId = this.state.dmThreadIdsByPairKey.get(key)
      if (existingThreadId) {
        const existingThread = this.state.directThreadsById.get(existingThreadId)
        if (existingThread) {
          return cloneDirectThread(existingThread)
        }
      }
    }

    const createdAt = new Date().toISOString()
    const serverId = createId("srv")
    const channelId = createId("chn")

    const server: Server = {
      id: serverId,
      name: kind === "dm" ? "Direct chat backing server" : "Group chat backing server",
      ownerId,
      createdAt
    }

    this.state.serversById.set(server.id, server)
    this.state.hiddenServerIds.add(server.id)
    this.state.membersByServerId.set(server.id, new Set(uniqueParticipantIds))
    this.state.channelIdsByServerId.set(server.id, [channelId])

    const everyoneRole: Role = {
      id: createId("rol"),
      serverId: server.id,
      name: "@everyone",
      permissions: DEFAULT_MEMBER_PERMISSIONS,
      isDefault: true,
      createdAt
    }

    const ownerRole: Role = {
      id: createId("rol"),
      serverId: server.id,
      name: "Owner",
      permissions: OWNER_ROLE_PERMISSIONS,
      isDefault: false,
      createdAt
    }

    this.state.rolesById.set(everyoneRole.id, everyoneRole)
    this.state.rolesById.set(ownerRole.id, ownerRole)
    this.state.roleIdsByServerId.set(server.id, [everyoneRole.id, ownerRole.id])

    for (const participantId of uniqueParticipantIds) {
      const roleIds = new Set<string>([everyoneRole.id])
      if (participantId === ownerId) {
        roleIds.add(ownerRole.id)
      }
      this.state.memberRoleIdsByServerUser.set(memberRoleKey(server.id, participantId), roleIds)
    }

    const channel: Channel = {
      id: channelId,
      serverId: server.id,
      name: kind === "dm" ? "direct" : "group",
      type: "text",
      createdAt
    }

    this.state.channelsById.set(channel.id, channel)
    this.state.hiddenChannelIds.add(channel.id)
    this.state.messageIdsByChannelId.set(channel.id, [])
    this.state.overwritesByChannelId.set(channel.id, [])

    const normalizedTitle = title.trim()
    const thread: DirectThread = {
      id: createId("thr"),
      channelId: channel.id,
      kind,
      ownerId,
      title: normalizedTitle || (kind === "dm" ? "Direct Message" : "Group Chat"),
      participantIds: uniqueParticipantIds,
      createdAt,
      updatedAt: createdAt
    }

    this.state.directThreadsById.set(thread.id, thread)
    this.state.directThreadIdByChannelId.set(channel.id, thread.id)

    for (const participantId of uniqueParticipantIds) {
      const ids = this.state.directThreadIdsByUserId.get(participantId) ?? []
      if (!ids.includes(thread.id)) {
        ids.push(thread.id)
        this.state.directThreadIdsByUserId.set(participantId, ids)
      }
    }

    if (kind === "dm") {
      this.state.dmThreadIdsByPairKey.set(dmPairKey(uniqueParticipantIds), thread.id)
    }

    return cloneDirectThread(thread)
  }

  async listDirectThreadsForUser(userId: string): Promise<DirectThread[]> {
    const threadIds = this.state.directThreadIdsByUserId.get(userId) ?? []
    return threadIds
      .map((threadId) => this.state.directThreadsById.get(threadId))
      .filter((thread): thread is DirectThread => !!thread)
      .map(cloneDirectThread)
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
  }

  async getDirectThreadById(threadId: string): Promise<DirectThread | null> {
    const thread = this.state.directThreadsById.get(threadId)
    return thread ? cloneDirectThread(thread) : null
  }

  async getDirectThreadByChannelId(channelId: string): Promise<DirectThread | null> {
    const threadId = this.state.directThreadIdByChannelId.get(channelId)
    if (!threadId) {
      return null
    }

    return await this.getDirectThreadById(threadId)
  }

  async isDirectThreadParticipant(threadId: string, userId: string): Promise<boolean> {
    const thread = this.state.directThreadsById.get(threadId)
    if (!thread) {
      return false
    }
    return thread.participantIds.includes(userId)
  }

  async createServer(name: string, ownerId: string): Promise<Server> {
    const server: Server = {
      id: createId("srv"),
      name,
      ownerId,
      createdAt: new Date().toISOString()
    }

    this.state.serversById.set(server.id, server)
    this.state.membersByServerId.set(server.id, new Set([ownerId]))
    this.state.channelIdsByServerId.set(server.id, [])
    this.state.roleIdsByServerId.set(server.id, [])

    const everyoneRole: Role = {
      id: createId("rol"),
      serverId: server.id,
      name: "@everyone",
      permissions: DEFAULT_MEMBER_PERMISSIONS,
      isDefault: true,
      createdAt: new Date().toISOString()
    }

    const ownerRole: Role = {
      id: createId("rol"),
      serverId: server.id,
      name: "Owner",
      permissions: OWNER_ROLE_PERMISSIONS,
      isDefault: false,
      createdAt: new Date().toISOString()
    }

    this.state.rolesById.set(everyoneRole.id, everyoneRole)
    this.state.rolesById.set(ownerRole.id, ownerRole)
    this.state.roleIdsByServerId.set(server.id, [everyoneRole.id, ownerRole.id])
    this.state.memberRoleIdsByServerUser.set(memberRoleKey(server.id, ownerId), new Set([everyoneRole.id, ownerRole.id]))

    return server
  }

  async listServersForUser(userId: string): Promise<Server[]> {
    return Array.from(this.state.serversById.values()).filter((server) => {
      if (this.state.hiddenServerIds.has(server.id)) {
        return false
      }

      const members = this.state.membersByServerId.get(server.id)
      return members ? members.has(userId) : false
    })
  }

  async getServerById(serverId: string): Promise<Server | null> {
    return this.state.serversById.get(serverId) ?? null
  }

  async isServerMember(serverId: string, userId: string): Promise<boolean> {
    const members = this.state.membersByServerId.get(serverId)
    return members ? members.has(userId) : false
  }

  async addServerMember(serverId: string, userId: string): Promise<void> {
    const members = this.state.membersByServerId.get(serverId) ?? new Set<string>()
    members.add(userId)
    this.state.membersByServerId.set(serverId, members)

    const roles = await this.listRoles(serverId)
    const defaultRole = roles.find((role) => role.isDefault)
    if (!defaultRole) {
      return
    }

    const key = memberRoleKey(serverId, userId)
    const roleIds = this.state.memberRoleIdsByServerUser.get(key) ?? new Set<string>()
    roleIds.add(defaultRole.id)
    this.state.memberRoleIdsByServerUser.set(key, roleIds)
  }

  async hasServerPermission(serverId: string, userId: string, permission: Permission): Promise<boolean> {
    const server = await this.getServerById(serverId)
    if (!server) {
      return false
    }
    if (!(await this.isServerMember(serverId, userId))) {
      return false
    }

    const roles = await this.listRoles(serverId)
    const memberRoleIds = Array.from(this.state.memberRoleIdsByServerUser.get(memberRoleKey(serverId, userId)) ?? [])

    return hasPermissionAfterOverwrites({
      permission,
      server,
      userId,
      roles,
      memberRoleIds,
      overwrites: [],
      includeChannelOverwrites: false
    })
  }

  async listServerMembers(serverId: string): Promise<User[]> {
    const memberIds = Array.from(this.state.membersByServerId.get(serverId) ?? [])
    const users: User[] = []

    for (const memberId of memberIds) {
      const user = this.state.usersById.get(memberId)
      if (!user) {
        continue
      }
      users.push(toPublicUser(user))
    }

    return users
  }

  async createChannel(serverId: string, name: string): Promise<Channel> {
    const channel: Channel = {
      id: createId("chn"),
      serverId,
      name,
      type: "text",
      createdAt: new Date().toISOString()
    }
    this.state.channelsById.set(channel.id, channel)
    const channelIds = this.state.channelIdsByServerId.get(serverId) ?? []
    channelIds.push(channel.id)
    this.state.channelIdsByServerId.set(serverId, channelIds)
    this.state.messageIdsByChannelId.set(channel.id, [])
    this.state.overwritesByChannelId.set(channel.id, [])
    return channel
  }

  async listChannels(serverId: string): Promise<Channel[]> {
    const ids = this.state.channelIdsByServerId.get(serverId) ?? []
    return ids.map((id) => this.state.channelsById.get(id)).filter((channel): channel is Channel => !!channel)
  }

  async listChannelsForUser(serverId: string, userId: string): Promise<Channel[]> {
    const channels = await this.listChannels(serverId)
    const visible: Channel[] = []

    for (const channel of channels) {
      if (await this.hasChannelPermission(channel.id, userId, "read_messages")) {
        visible.push(channel)
      }
    }

    return visible
  }

  async getChannelById(channelId: string): Promise<Channel | null> {
    return this.state.channelsById.get(channelId) ?? null
  }

  async hasChannelPermission(channelId: string, userId: string, permission: Permission): Promise<boolean> {
    const channel = await this.getChannelById(channelId)
    if (!channel) {
      return false
    }

    const server = await this.getServerById(channel.serverId)
    if (!server) {
      return false
    }

    if (!(await this.isServerMember(server.id, userId))) {
      return false
    }

    const roles = await this.listRoles(server.id)
    const memberRoleIds = Array.from(this.state.memberRoleIdsByServerUser.get(memberRoleKey(server.id, userId)) ?? [])
    const overwrites = await this.listChannelOverwrites(channelId)

    return hasPermissionAfterOverwrites({
      permission,
      server,
      userId,
      roles,
      memberRoleIds,
      overwrites,
      includeChannelOverwrites: true
    })
  }

  async createMessage(channelId: string, authorId: string, body: string, attachments: Attachment[] = []): Promise<Message> {
    const directThreadId = this.state.directThreadIdByChannelId.get(channelId) ?? null

    const message: Message = {
      id: createId("msg"),
      channelId,
      conversationId: directThreadId ?? channelId,
      directThreadId,
      authorId,
      body,
      attachments: attachments.map(cloneAttachment),
      createdAt: new Date().toISOString(),
      updatedAt: null,
      reactions: []
    }
    this.state.messagesById.set(message.id, message)
    this.state.reactionUsersByMessageId.set(message.id, new Map<string, Set<string>>())
    const ids = this.state.messageIdsByChannelId.get(channelId) ?? []
    ids.push(message.id)
    this.state.messageIdsByChannelId.set(channelId, ids)
    return cloneMessage(message)
  }

  async listMessages(channelId: string): Promise<Message[]> {
    const ids = this.state.messageIdsByChannelId.get(channelId) ?? []
    return ids
      .map((id) => this.state.messagesById.get(id))
      .filter((message): message is Message => !!message)
      .map(cloneMessage)
  }

  async getMessageById(messageId: string): Promise<Message | null> {
    const message = this.state.messagesById.get(messageId)
    if (!message) {
      return null
    }
    return cloneMessage(message)
  }

  async updateMessage(messageId: string, body: string): Promise<Message | null> {
    const message = this.state.messagesById.get(messageId)
    if (!message) {
      return null
    }

    message.body = body
    message.updatedAt = new Date().toISOString()
    this.state.messagesById.set(message.id, message)
    return cloneMessage(message)
  }

  async deleteMessage(messageId: string): Promise<MessageDeletedEvent | null> {
    const message = this.state.messagesById.get(messageId)
    if (!message) {
      return null
    }

    this.state.messagesById.delete(messageId)
    this.state.reactionUsersByMessageId.delete(messageId)

    const ids = this.state.messageIdsByChannelId.get(message.channelId) ?? []
    this.state.messageIdsByChannelId.set(
      message.channelId,
      ids.filter((id) => id !== messageId)
    )

    return {
      id: messageId,
      channelId: message.channelId,
      conversationId: message.conversationId,
      directThreadId: message.directThreadId
    }
  }

  async addReaction(messageId: string, userId: string, emoji: string): Promise<MessageReactionSummary[]> {
    const reactionUsers = this.state.reactionUsersByMessageId.get(messageId) ?? new Map<string, Set<string>>()
    const users = reactionUsers.get(emoji) ?? new Set<string>()
    users.add(userId)
    reactionUsers.set(emoji, users)
    this.state.reactionUsersByMessageId.set(messageId, reactionUsers)

    const reactions = summarizeReactions(reactionUsers)
    const message = this.state.messagesById.get(messageId)
    if (message) {
      message.reactions = reactions
      this.state.messagesById.set(message.id, message)
    }
    return reactions
  }

  async removeReaction(messageId: string, userId: string, emoji: string): Promise<MessageReactionSummary[]> {
    const reactionUsers = this.state.reactionUsersByMessageId.get(messageId)
    if (!reactionUsers) {
      return []
    }

    const users = reactionUsers.get(emoji)
    if (users) {
      users.delete(userId)
      if (users.size === 0) {
        reactionUsers.delete(emoji)
      } else {
        reactionUsers.set(emoji, users)
      }
    }

    this.state.reactionUsersByMessageId.set(messageId, reactionUsers)
    const reactions = summarizeReactions(reactionUsers)

    const message = this.state.messagesById.get(messageId)
    if (message) {
      message.reactions = reactions
      this.state.messagesById.set(message.id, message)
    }

    return reactions
  }

  async listMessageReactions(messageId: string): Promise<MessageReactionSummary[]> {
    return summarizeReactions(this.state.reactionUsersByMessageId.get(messageId))
  }

  async getReadMarker(conversationId: string, userId: string): Promise<ReadMarker | null> {
    const marker = this.state.readMarkersByConversationUser.get(conversationReadMarkerKey(conversationId, userId))
    return marker ? { ...marker } : null
  }

  async upsertReadMarker(
    conversationId: string,
    userId: string,
    lastReadMessageId: string | null
  ): Promise<ReadMarker> {
    const marker: ReadMarker = {
      conversationId,
      userId,
      lastReadMessageId,
      updatedAt: new Date().toISOString()
    }

    this.state.readMarkersByConversationUser.set(conversationReadMarkerKey(conversationId, userId), marker)
    return { ...marker }
  }

  async listRoles(serverId: string): Promise<Role[]> {
    const roleIds = this.state.roleIdsByServerId.get(serverId) ?? []
    return roleIds.map((id) => this.state.rolesById.get(id)).filter((role): role is Role => !!role)
  }

  async createRole(serverId: string, name: string, permissions: Permission[]): Promise<Role> {
    const role: Role = {
      id: createId("rol"),
      serverId,
      name,
      permissions: sanitizePermissions(permissions),
      isDefault: false,
      createdAt: new Date().toISOString()
    }

    this.state.rolesById.set(role.id, role)
    const roleIds = this.state.roleIdsByServerId.get(serverId) ?? []
    roleIds.push(role.id)
    this.state.roleIdsByServerId.set(serverId, roleIds)
    return role
  }

  async assignRole(serverId: string, roleId: string, memberId: string): Promise<void> {
    const key = memberRoleKey(serverId, memberId)
    const roleIds = this.state.memberRoleIdsByServerUser.get(key) ?? new Set<string>()
    roleIds.add(roleId)
    this.state.memberRoleIdsByServerUser.set(key, roleIds)
  }

  async getRoleById(roleId: string): Promise<Role | null> {
    return this.state.rolesById.get(roleId) ?? null
  }

  async upsertChannelOverwrite(
    channelId: string,
    targetType: "role" | "member",
    targetId: string,
    allowPermissions: Permission[],
    denyPermissions: Permission[]
  ): Promise<ChannelPermissionOverwrite> {
    const current = this.state.overwritesByChannelId.get(channelId) ?? []
    const existing = current.find(
      (overwrite) => overwrite.targetType === targetType && overwrite.targetId === targetId
    )

    const sanitizedAllow = sanitizePermissions(allowPermissions)
    const sanitizedDeny = sanitizePermissions(denyPermissions)

    if (existing) {
      existing.allowPermissions = sanitizedAllow
      existing.denyPermissions = sanitizedDeny
      this.state.overwritesByChannelId.set(channelId, current)
      return existing
    }

    const created: ChannelPermissionOverwrite = {
      id: createId("ovr"),
      channelId,
      targetType,
      targetId,
      allowPermissions: sanitizedAllow,
      denyPermissions: sanitizedDeny,
      createdAt: new Date().toISOString()
    }

    current.push(created)
    this.state.overwritesByChannelId.set(channelId, current)
    return created
  }

  async listChannelOverwrites(channelId: string): Promise<ChannelPermissionOverwrite[]> {
    return [...(this.state.overwritesByChannelId.get(channelId) ?? [])]
  }

  async createServerInvite(
    serverId: string,
    createdBy: string,
    maxUses: number | null,
    expiresAt: string | null
  ): Promise<ServerInvite> {
    let code = generateInviteCode()
    while (this.state.invitesByCode.has(code)) {
      code = generateInviteCode()
    }

    const invite: ServerInvite = {
      code,
      serverId,
      createdBy,
      createdAt: new Date().toISOString(),
      expiresAt,
      maxUses,
      uses: 0
    }

    this.state.invitesByCode.set(code, invite)
    return invite
  }

  async joinServerByInvite(code: string, userId: string): Promise<Server | null> {
    const invite = this.state.invitesByCode.get(code)
    if (!invite) {
      return null
    }

    if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
      return null
    }

    if (invite.maxUses !== null && invite.uses >= invite.maxUses) {
      return null
    }

    const server = await this.getServerById(invite.serverId)
    if (!server) {
      return null
    }

    const alreadyMember = await this.isServerMember(server.id, userId)
    if (!alreadyMember) {
      await this.addServerMember(server.id, userId)
      invite.uses += 1
      this.state.invitesByCode.set(invite.code, invite)
    }

    return server
  }
}
