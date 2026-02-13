import { SQL } from "bun"
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
import { runMigrations } from "./migrations"
import type { AppStore, StoredUser } from "./store"

type UserRow = {
  id: string
  email: string
  username: string
  display_name: string
  password_hash: string
  created_at: string | Date
}

type PublicUserRow = {
  id: string
  email: string
  username: string
  display_name: string
  created_at: string | Date
}

type FriendRequestRow = {
  id: string
  from_user_id: string
  to_user_id: string
  status: "pending" | "accepted" | "rejected"
  created_at: string | Date
  responded_at: string | Date | null
}

type ServerRow = {
  id: string
  name: string
  owner_id: string
  created_at: string | Date
}

type ChannelRow = {
  id: string
  server_id: string
  name: string
  channel_type: "text"
  is_direct_thread_backing?: boolean
  created_at: string | Date
}

type MessageRow = {
  id: string
  channel_id: string
  author_id: string
  body: string
  created_at: string | Date
  updated_at: string | Date | null
}

type MessageWithThreadRow = MessageRow & {
  direct_thread_id: string | null
}

type AttachmentRow = {
  id: string
  message_id: string
  file_name: string
  content_type: string
  size_bytes: number | string
  url: string
  uploaded_by: string
  created_at: string | Date
}

type MessageReactionRow = {
  emoji: string
  count: number | string
}

type RoleRow = {
  id: string
  server_id: string
  name: string
  permissions: unknown
  is_default: boolean
  created_at: string | Date
}

type OverwriteRow = {
  id: string
  channel_id: string
  target_type: "role" | "member"
  target_id: string
  allow_permissions: unknown
  deny_permissions: unknown
  created_at: string | Date
}

type InviteRow = {
  code: string
  server_id: string
  created_by: string
  created_at: string | Date
  expires_at: string | Date | null
  max_uses: number | null
  uses: number
}

type DirectThreadRow = {
  id: string
  channel_id: string
  thread_type: "dm" | "group"
  owner_id: string
  title: string
  created_at: string | Date
  updated_at: string | Date
}

type DirectThreadParticipantRow = {
  thread_id: string
  user_id: string
}

type ReadMarkerRow = {
  conversation_id: string
  user_id: string
  last_read_message_id: string | null
  updated_at: string | Date
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function toPgTextArrayLiteral(values: string[]): string {
  const escaped = values.map((value) => {
    const normalized = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
    return `"${normalized}"`
  })

  return `{${escaped.join(",")}}`
}

function parsePermissions(value: unknown): Permission[] {
  if (Array.isArray(value)) {
    return sanitizePermissions(value as Permission[])
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as Permission[]
      return sanitizePermissions(parsed)
    } catch {
      return []
    }
  }

  return []
}

function mapUser(row: UserRow): StoredUser {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    createdAt: toIso(row.created_at)
  }
}

function mapServer(row: ServerRow): Server {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    createdAt: toIso(row.created_at)
  }
}

function mapChannel(row: ChannelRow): Channel {
  return {
    id: row.id,
    serverId: row.server_id,
    name: row.name,
    type: row.channel_type,
    createdAt: toIso(row.created_at)
  }
}

function mapAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    url: row.url,
    uploadedBy: row.uploaded_by,
    createdAt: toIso(row.created_at)
  }
}

function mapMessage(
  row: MessageWithThreadRow,
  reactions: MessageReactionSummary[],
  attachments: Attachment[]
): Message {
  const directThreadId = row.direct_thread_id ?? null
  return {
    id: row.id,
    channelId: row.channel_id,
    conversationId: directThreadId ?? row.channel_id,
    directThreadId,
    authorId: row.author_id,
    body: row.body,
    attachments,
    createdAt: toIso(row.created_at),
    updatedAt: row.updated_at ? toIso(row.updated_at) : null,
    reactions
  }
}

function mapPublicUser(row: PublicUserRow): User {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    createdAt: toIso(row.created_at)
  }
}

function mapFriendRequest(row: FriendRequestRow): FriendRequest {
  return {
    id: row.id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    status: row.status,
    createdAt: toIso(row.created_at),
    respondedAt: row.responded_at ? toIso(row.responded_at) : null
  }
}

function mapInvite(row: InviteRow): ServerInvite {
  return {
    code: row.code,
    serverId: row.server_id,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
    expiresAt: row.expires_at ? toIso(row.expires_at) : null,
    maxUses: row.max_uses,
    uses: row.uses
  }
}

function mapReadMarker(row: ReadMarkerRow): ReadMarker {
  return {
    conversationId: row.conversation_id,
    userId: row.user_id,
    lastReadMessageId: row.last_read_message_id,
    updatedAt: toIso(row.updated_at)
  }
}

function mapRole(row: RoleRow): Role {
  return {
    id: row.id,
    serverId: row.server_id,
    name: row.name,
    permissions: parsePermissions(row.permissions),
    isDefault: row.is_default,
    createdAt: toIso(row.created_at)
  }
}

function mapOverwrite(row: OverwriteRow): ChannelPermissionOverwrite {
  return {
    id: row.id,
    channelId: row.channel_id,
    targetType: row.target_type,
    targetId: row.target_id,
    allowPermissions: parsePermissions(row.allow_permissions),
    denyPermissions: parsePermissions(row.deny_permissions),
    createdAt: toIso(row.created_at)
  }
}

function mapDirectThread(
  row: DirectThreadRow,
  participantIds: string[]
): DirectThread {
  return {
    id: row.id,
    channelId: row.channel_id,
    kind: row.thread_type,
    ownerId: row.owner_id,
    title: row.title,
    participantIds,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  }
}

export class PostgresStore implements AppStore {
  readonly kind = "postgres" as const

  private constructor(private readonly sql: SQL) {}

  static async connect(databaseUrl: string, migrationsDir: string): Promise<PostgresStore> {
    const sql = new SQL(databaseUrl)
    await sql`SELECT 1`
    await runMigrations(sql, migrationsDir)
    return new PostgresStore(sql)
  }

  async createUser(email: string, username: string, displayName: string, passwordHash: string): Promise<StoredUser> {
    const id = createId("usr")
    const createdAt = new Date().toISOString()
    await this.sql`
      INSERT INTO users (id, email, username, display_name, password_hash, created_at)
      VALUES (${id}, ${email}, ${username}, ${displayName}, ${passwordHash}, ${createdAt})
    `
    return { id, email, username, displayName, passwordHash, createdAt }
  }

  async findUserByEmail(email: string): Promise<StoredUser | null> {
    const rows = await this.sql<UserRow[]>`
      SELECT id, email, username, display_name, password_hash, created_at
      FROM users
      WHERE email = ${email}
      LIMIT 1
    `
    return rows[0] ? mapUser(rows[0]) : null
  }

  async findUserByUsername(username: string): Promise<StoredUser | null> {
    const rows = await this.sql<UserRow[]>`
      SELECT id, email, username, display_name, password_hash, created_at
      FROM users
      WHERE LOWER(username) = LOWER(${username})
      LIMIT 1
    `
    return rows[0] ? mapUser(rows[0]) : null
  }

  async findUserById(userId: string): Promise<StoredUser | null> {
    const rows = await this.sql<UserRow[]>`
      SELECT id, email, username, display_name, password_hash, created_at
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `
    return rows[0] ? mapUser(rows[0]) : null
  }

  async searchUsers(query: string, excludeUserId: string): Promise<User[]> {
    const normalized = query.trim()
    if (!normalized) {
      return []
    }

    const pattern = `%${normalized}%`
    const rows = await this.sql<PublicUserRow[]>`
      SELECT id, email, username, display_name, created_at
      FROM users
      WHERE id <> ${excludeUserId}
        AND (
          username ILIKE ${pattern}
          OR display_name ILIKE ${pattern}
        )
      ORDER BY created_at ASC
      LIMIT 20
    `

    return rows.map(mapPublicUser)
  }

  async addFriend(userId: string, friendId: string): Promise<void> {
    if (userId === friendId) {
      return
    }

    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO friendships (user_id, friend_id)
        VALUES (${userId}, ${friendId})
        ON CONFLICT (user_id, friend_id) DO NOTHING
      `
      await tx`
        INSERT INTO friendships (user_id, friend_id)
        VALUES (${friendId}, ${userId})
        ON CONFLICT (user_id, friend_id) DO NOTHING
      `
    })
  }

  async listFriends(userId: string): Promise<User[]> {
    const rows = await this.sql<PublicUserRow[]>`
      SELECT u.id, u.email, u.username, u.display_name, u.created_at
      FROM friendships f
      INNER JOIN users u ON u.id = f.friend_id
      WHERE f.user_id = ${userId}
      ORDER BY f.created_at ASC
    `

    return rows.map(mapPublicUser)
  }

  async createFriendRequest(fromUserId: string, toUserId: string): Promise<FriendRequest> {
    if (fromUserId === toUserId) {
      throw new Error("You cannot send a friend request to yourself.")
    }

    const existingFriendship = await this.sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM friendships
        WHERE user_id = ${fromUserId}
          AND friend_id = ${toUserId}
      ) AS exists
    `

    if (existingFriendship[0]?.exists) {
      throw new Error("Users are already friends.")
    }

    const existingPending = await this.sql<FriendRequestRow[]>`
      SELECT id, from_user_id, to_user_id, status, created_at, responded_at
      FROM friend_requests
      WHERE status = 'pending'
        AND (
          (from_user_id = ${fromUserId} AND to_user_id = ${toUserId})
          OR
          (from_user_id = ${toUserId} AND to_user_id = ${fromUserId})
        )
      ORDER BY created_at DESC
      LIMIT 1
    `

    if (existingPending[0]) {
      return mapFriendRequest(existingPending[0])
    }

    const id = createId("frq")
    const createdAt = new Date().toISOString()
    const rows = await this.sql<FriendRequestRow[]>`
      INSERT INTO friend_requests (
        id, from_user_id, to_user_id, status, created_at, responded_at
      )
      VALUES (${id}, ${fromUserId}, ${toUserId}, 'pending', ${createdAt}, NULL)
      RETURNING id, from_user_id, to_user_id, status, created_at, responded_at
    `

    return mapFriendRequest(rows[0])
  }

  async listFriendRequests(userId: string): Promise<FriendRequest[]> {
    const rows = await this.sql<FriendRequestRow[]>`
      SELECT id, from_user_id, to_user_id, status, created_at, responded_at
      FROM friend_requests
      WHERE status = 'pending'
        AND (from_user_id = ${userId} OR to_user_id = ${userId})
      ORDER BY created_at DESC
    `

    return rows.map(mapFriendRequest)
  }

  async respondFriendRequest(
    requestId: string,
    responderUserId: string,
    action: "accept" | "reject"
  ): Promise<FriendRequest | null> {
    const requestRows = await this.sql<FriendRequestRow[]>`
      SELECT id, from_user_id, to_user_id, status, created_at, responded_at
      FROM friend_requests
      WHERE id = ${requestId}
      LIMIT 1
    `

    const request = requestRows[0]
    if (!request || request.status !== "pending") {
      return null
    }

    if (request.to_user_id !== responderUserId) {
      return null
    }

    const nextStatus = action === "accept" ? "accepted" : "rejected"
    const respondedAt = new Date().toISOString()

    const updated = await this.sql.begin(async (tx) => {
      const rows = await tx<FriendRequestRow[]>`
        UPDATE friend_requests
        SET status = ${nextStatus}, responded_at = ${respondedAt}
        WHERE id = ${request.id}
          AND status = 'pending'
        RETURNING id, from_user_id, to_user_id, status, created_at, responded_at
      `

      const updatedRequest = rows[0]
      if (!updatedRequest) {
        return null
      }

      if (nextStatus === "accepted") {
        await tx`
          INSERT INTO friendships (user_id, friend_id)
          VALUES (${updatedRequest.from_user_id}, ${updatedRequest.to_user_id})
          ON CONFLICT (user_id, friend_id) DO NOTHING
        `
        await tx`
          INSERT INTO friendships (user_id, friend_id)
          VALUES (${updatedRequest.to_user_id}, ${updatedRequest.from_user_id})
          ON CONFLICT (user_id, friend_id) DO NOTHING
        `
      }

      return updatedRequest
    })

    return updated ? mapFriendRequest(updated) : null
  }

  async createSession(token: string, userId: string): Promise<void> {
    const createdAt = new Date().toISOString()
    await this.sql`
      INSERT INTO sessions (token, user_id, created_at)
      VALUES (${token}, ${userId}, ${createdAt})
      ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id
    `
  }

  async getUserIdByToken(token: string): Promise<string | null> {
    const rows = await this.sql<{ user_id: string }[]>`
      SELECT user_id
      FROM sessions
      WHERE token = ${token}
      LIMIT 1
    `
    return rows[0]?.user_id ?? null
  }

  async createDirectThread(ownerId: string, participantIds: string[], title: string): Promise<DirectThread> {
    const uniqueParticipantIds = Array.from(new Set([ownerId, ...participantIds]))
    if (uniqueParticipantIds.length < 2) {
      throw new Error("Direct threads require at least two users.")
    }

    const resolvedParticipantIds: string[] = []
    for (const participantId of uniqueParticipantIds) {
      const user = await this.findUserById(participantId)
      if (user) {
        resolvedParticipantIds.push(participantId)
      }
    }

    if (resolvedParticipantIds.length < 2) {
      throw new Error("Direct threads require at least two existing users.")
    }

    const kind: DirectThread["kind"] = resolvedParticipantIds.length === 2 ? "dm" : "group"
    const dmKey = kind === "dm" ? resolvedParticipantIds.sort((a, b) => a.localeCompare(b)).join(":") : null

    if (dmKey) {
      const existing = await this.getDirectThreadByDmKey(dmKey)
      if (existing) {
        return existing
      }
    }

    const threadId = createId("thr")
    const serverId = createId("srv")
    const channelId = createId("chn")
    const everyoneRoleId = createId("rol")
    const ownerRoleId = createId("rol")
    const createdAt = new Date().toISOString()
    const normalizedTitle = title.trim()

    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO servers (id, name, owner_id, is_direct_thread_backing, created_at)
        VALUES (${serverId}, 'direct-thread-backing', ${ownerId}, TRUE, ${createdAt})
      `

      await tx`
        INSERT INTO roles (id, server_id, name, permissions, is_default, created_at)
        VALUES (${everyoneRoleId}, ${serverId}, '@everyone', ${JSON.stringify(DEFAULT_MEMBER_PERMISSIONS)}, true, ${createdAt})
      `

      await tx`
        INSERT INTO roles (id, server_id, name, permissions, is_default, created_at)
        VALUES (${ownerRoleId}, ${serverId}, 'Owner', ${JSON.stringify(OWNER_ROLE_PERMISSIONS)}, false, ${createdAt})
      `

      await tx`
        INSERT INTO channels (id, server_id, name, channel_type, is_direct_thread_backing, created_at)
        VALUES (${channelId}, ${serverId}, 'direct', 'text', TRUE, ${createdAt})
      `

      await tx`
        INSERT INTO direct_threads (
          id, channel_id, server_id, thread_type, owner_id, title, dm_key, created_at, updated_at
        )
        VALUES (
          ${threadId},
          ${channelId},
          ${serverId},
          ${kind},
          ${ownerId},
          ${normalizedTitle || (kind === "dm" ? "Direct Message" : "Group Chat")},
          ${dmKey},
          ${createdAt},
          ${createdAt}
        )
      `

      for (const participantId of resolvedParticipantIds) {
        await tx`
          INSERT INTO server_members (server_id, user_id)
          VALUES (${serverId}, ${participantId})
          ON CONFLICT (server_id, user_id) DO NOTHING
        `

        await tx`
          INSERT INTO member_roles (server_id, user_id, role_id)
          VALUES (${serverId}, ${participantId}, ${everyoneRoleId})
          ON CONFLICT (server_id, user_id, role_id) DO NOTHING
        `

        if (participantId === ownerId) {
          await tx`
            INSERT INTO member_roles (server_id, user_id, role_id)
            VALUES (${serverId}, ${participantId}, ${ownerRoleId})
            ON CONFLICT (server_id, user_id, role_id) DO NOTHING
          `
        }

        await tx`
          INSERT INTO direct_thread_participants (thread_id, user_id, joined_at)
          VALUES (${threadId}, ${participantId}, ${createdAt})
          ON CONFLICT (thread_id, user_id) DO NOTHING
        `
      }
    })

    const thread = await this.getDirectThreadById(threadId)
    if (!thread) {
      throw new Error("Failed to create direct thread.")
    }

    return thread
  }

  async listDirectThreadsForUser(userId: string): Promise<DirectThread[]> {
    const rows = await this.sql<DirectThreadRow[]>`
      SELECT dt.id, dt.channel_id, dt.thread_type, dt.owner_id, dt.title, dt.created_at, dt.updated_at
      FROM direct_threads dt
      INNER JOIN direct_thread_participants dtp ON dtp.thread_id = dt.id
      WHERE dtp.user_id = ${userId}
      ORDER BY dt.updated_at DESC
    `

    if (rows.length === 0) {
      return []
    }

    const participantIdsByThreadId = await this.listParticipantIdsByThreadIds(rows.map((row) => row.id))
    return rows.map((row) => mapDirectThread(row, participantIdsByThreadId.get(row.id) ?? []))
  }

  async getDirectThreadById(threadId: string): Promise<DirectThread | null> {
    const rows = await this.sql<DirectThreadRow[]>`
      SELECT id, channel_id, thread_type, owner_id, title, created_at, updated_at
      FROM direct_threads
      WHERE id = ${threadId}
      LIMIT 1
    `

    const row = rows[0]
    if (!row) {
      return null
    }

    const participantIds = await this.listParticipantIdsByThreadId(threadId)
    return mapDirectThread(row, participantIds)
  }

  async getDirectThreadByChannelId(channelId: string): Promise<DirectThread | null> {
    const rows = await this.sql<DirectThreadRow[]>`
      SELECT id, channel_id, thread_type, owner_id, title, created_at, updated_at
      FROM direct_threads
      WHERE channel_id = ${channelId}
      LIMIT 1
    `

    const row = rows[0]
    if (!row) {
      return null
    }

    const participantIds = await this.listParticipantIdsByThreadId(row.id)
    return mapDirectThread(row, participantIds)
  }

  async isDirectThreadParticipant(threadId: string, userId: string): Promise<boolean> {
    const rows = await this.sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM direct_thread_participants
        WHERE thread_id = ${threadId}
          AND user_id = ${userId}
      ) AS exists
    `

    return Boolean(rows[0]?.exists)
  }

  async createServer(name: string, ownerId: string): Promise<Server> {
    const serverId = createId("srv")
    const createdAt = new Date().toISOString()
    const everyoneRoleId = createId("rol")
    const ownerRoleId = createId("rol")

    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO servers (id, name, owner_id, is_direct_thread_backing, created_at)
        VALUES (${serverId}, ${name}, ${ownerId}, FALSE, ${createdAt})
      `
      await tx`
        INSERT INTO server_members (server_id, user_id)
        VALUES (${serverId}, ${ownerId})
        ON CONFLICT (server_id, user_id) DO NOTHING
      `
      await tx`
        INSERT INTO roles (id, server_id, name, permissions, is_default, created_at)
        VALUES (${everyoneRoleId}, ${serverId}, '@everyone', ${JSON.stringify(DEFAULT_MEMBER_PERMISSIONS)}, true, ${createdAt})
      `
      await tx`
        INSERT INTO roles (id, server_id, name, permissions, is_default, created_at)
        VALUES (${ownerRoleId}, ${serverId}, 'Owner', ${JSON.stringify(OWNER_ROLE_PERMISSIONS)}, false, ${createdAt})
      `
      await tx`
        INSERT INTO member_roles (server_id, user_id, role_id)
        VALUES (${serverId}, ${ownerId}, ${everyoneRoleId})
        ON CONFLICT (server_id, user_id, role_id) DO NOTHING
      `
      await tx`
        INSERT INTO member_roles (server_id, user_id, role_id)
        VALUES (${serverId}, ${ownerId}, ${ownerRoleId})
        ON CONFLICT (server_id, user_id, role_id) DO NOTHING
      `
    })

    return { id: serverId, name, ownerId, createdAt }
  }

  async listServersForUser(userId: string): Promise<Server[]> {
    const rows = await this.sql<ServerRow[]>`
      SELECT s.id, s.name, s.owner_id, s.created_at
      FROM servers s
      INNER JOIN server_members sm ON sm.server_id = s.id
      WHERE sm.user_id = ${userId}
        AND s.is_direct_thread_backing = FALSE
      ORDER BY s.created_at ASC
    `
    return rows.map(mapServer)
  }

  async getServerById(serverId: string): Promise<Server | null> {
    const rows = await this.sql<ServerRow[]>`
      SELECT id, name, owner_id, created_at
      FROM servers
      WHERE id = ${serverId}
      LIMIT 1
    `
    return rows[0] ? mapServer(rows[0]) : null
  }

  async isServerMember(serverId: string, userId: string): Promise<boolean> {
    const rows = await this.sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM server_members
        WHERE server_id = ${serverId}
          AND user_id = ${userId}
      ) AS exists
    `
    return Boolean(rows[0]?.exists)
  }

  async addServerMember(serverId: string, userId: string): Promise<void> {
    const defaultRole = await this.getDefaultRole(serverId)

    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO server_members (server_id, user_id)
        VALUES (${serverId}, ${userId})
        ON CONFLICT (server_id, user_id) DO NOTHING
      `

      if (defaultRole) {
        await tx`
          INSERT INTO member_roles (server_id, user_id, role_id)
          VALUES (${serverId}, ${userId}, ${defaultRole.id})
          ON CONFLICT (server_id, user_id, role_id) DO NOTHING
        `
      }
    })
  }

  async listServerMembers(serverId: string): Promise<User[]> {
    const rows = await this.sql<PublicUserRow[]>`
      SELECT u.id, u.email, u.username, u.display_name, u.created_at
      FROM users u
      INNER JOIN server_members sm ON sm.user_id = u.id
      WHERE sm.server_id = ${serverId}
      ORDER BY sm.joined_at ASC
    `
    return rows.map(mapPublicUser)
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
    const memberRoleIds = await this.listMemberRoleIds(serverId, userId)
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

  async createChannel(serverId: string, name: string): Promise<Channel> {
    const id = createId("chn")
    const createdAt = new Date().toISOString()
    await this.sql`
      INSERT INTO channels (id, server_id, name, channel_type, is_direct_thread_backing, created_at)
      VALUES (${id}, ${serverId}, ${name}, 'text', FALSE, ${createdAt})
    `
    return {
      id,
      serverId,
      name,
      type: "text",
      createdAt
    }
  }

  async listChannels(serverId: string): Promise<Channel[]> {
    const rows = await this.sql<ChannelRow[]>`
      SELECT id, server_id, name, channel_type, created_at
      FROM channels
      WHERE server_id = ${serverId}
        AND is_direct_thread_backing = FALSE
      ORDER BY created_at ASC
    `
    return rows.map(mapChannel)
  }

  async listChannelsForUser(serverId: string, userId: string): Promise<Channel[]> {
    const channels = await this.listChannels(serverId)
    const visibility = await Promise.all(
      channels.map(async (channel) => ({
        channel,
        allowed: await this.hasChannelPermission(channel.id, userId, "read_messages")
      }))
    )
    return visibility.filter((item) => item.allowed).map((item) => item.channel)
  }

  async getChannelById(channelId: string): Promise<Channel | null> {
    const rows = await this.sql<ChannelRow[]>`
      SELECT id, server_id, name, channel_type, created_at
      FROM channels
      WHERE id = ${channelId}
      LIMIT 1
    `
    return rows[0] ? mapChannel(rows[0]) : null
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
    const memberRoleIds = await this.listMemberRoleIds(server.id, userId)
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

  async createMessage(
    channelId: string,
    authorId: string,
    body: string,
    attachments: Attachment[] = []
  ): Promise<Message> {
    const id = createId("msg")
    const createdAt = new Date().toISOString()

    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO messages (id, channel_id, author_id, body, created_at)
        VALUES (${id}, ${channelId}, ${authorId}, ${body}, ${createdAt})
      `

      for (const attachment of attachments) {
        const attachmentId = attachment.id?.trim() || createId("att")
        await tx`
          INSERT INTO message_attachments (
            id, message_id, file_name, content_type, size_bytes, url, uploaded_by, created_at
          )
          VALUES (
            ${attachmentId},
            ${id},
            ${attachment.fileName},
            ${attachment.contentType},
            ${attachment.sizeBytes},
            ${attachment.url},
            ${attachment.uploadedBy || authorId},
            ${attachment.createdAt || createdAt}
          )
        `
      }
    })

    const message = await this.getMessageById(id)
    if (!message) {
      throw new Error("Failed to create message.")
    }

    return message
  }

  async listMessages(channelId: string): Promise<Message[]> {
    const rows = await this.sql<MessageWithThreadRow[]>`
      SELECT
        m.id,
        m.channel_id,
        m.author_id,
        m.body,
        m.created_at,
        m.updated_at,
        dt.id AS direct_thread_id
      FROM messages m
      LEFT JOIN direct_threads dt ON dt.channel_id = m.channel_id
      WHERE m.channel_id = ${channelId}
      ORDER BY m.created_at ASC
    `

    if (rows.length === 0) {
      return []
    }

    const reactionsByMessageId = await this.listReactionSummariesForChannel(channelId)
    const attachmentsByMessageId = await this.listAttachmentsForMessageIds(rows.map((row) => row.id))

    return rows.map((row) =>
      mapMessage(
        row,
        reactionsByMessageId.get(row.id) ?? [],
        attachmentsByMessageId.get(row.id) ?? []
      )
    )
  }

  async getMessageById(messageId: string): Promise<Message | null> {
    const rows = await this.sql<MessageWithThreadRow[]>`
      SELECT
        m.id,
        m.channel_id,
        m.author_id,
        m.body,
        m.created_at,
        m.updated_at,
        dt.id AS direct_thread_id
      FROM messages m
      LEFT JOIN direct_threads dt ON dt.channel_id = m.channel_id
      WHERE m.id = ${messageId}
      LIMIT 1
    `

    const row = rows[0]
    if (!row) {
      return null
    }

    const reactions = await this.listMessageReactions(messageId)
    const attachments = await this.listAttachmentsForMessage(messageId)
    return mapMessage(row, reactions, attachments)
  }

  async updateMessage(messageId: string, body: string): Promise<Message | null> {
    const updatedAt = new Date().toISOString()
    const rows = await this.sql<MessageWithThreadRow[]>`
      UPDATE messages
      SET body = ${body}, updated_at = ${updatedAt}
      WHERE id = ${messageId}
      RETURNING id, channel_id, author_id, body, created_at, updated_at, (
        SELECT id FROM direct_threads WHERE channel_id = messages.channel_id LIMIT 1
      ) AS direct_thread_id
    `

    const row = rows[0]
    if (!row) {
      return null
    }

    const reactions = await this.listMessageReactions(messageId)
    const attachments = await this.listAttachmentsForMessage(messageId)
    return mapMessage(row, reactions, attachments)
  }

  async deleteMessage(messageId: string): Promise<MessageDeletedEvent | null> {
    const rows = await this.sql<{ id: string; channel_id: string }[]>`
      DELETE FROM messages
      WHERE id = ${messageId}
      RETURNING id, channel_id
    `

    const row = rows[0]
    if (!row) {
      return null
    }
    const directThread = await this.getDirectThreadByChannelId(row.channel_id)

    return {
      id: row.id,
      channelId: row.channel_id,
      conversationId: directThread?.id ?? row.channel_id,
      directThreadId: directThread?.id ?? null
    }
  }

  async addReaction(messageId: string, userId: string, emoji: string): Promise<MessageReactionSummary[]> {
    const createdAt = new Date().toISOString()

    await this.sql`
      INSERT INTO message_reactions (message_id, user_id, emoji, created_at)
      VALUES (${messageId}, ${userId}, ${emoji}, ${createdAt})
      ON CONFLICT (message_id, user_id, emoji) DO NOTHING
    `

    return await this.listMessageReactions(messageId)
  }

  async removeReaction(messageId: string, userId: string, emoji: string): Promise<MessageReactionSummary[]> {
    await this.sql`
      DELETE FROM message_reactions
      WHERE message_id = ${messageId}
        AND user_id = ${userId}
        AND emoji = ${emoji}
    `

    return await this.listMessageReactions(messageId)
  }

  async listMessageReactions(messageId: string): Promise<MessageReactionSummary[]> {
    const rows = await this.sql<MessageReactionRow[]>`
      SELECT emoji, COUNT(*)::int AS count
      FROM message_reactions
      WHERE message_id = ${messageId}
      GROUP BY emoji
      ORDER BY emoji ASC
    `

    return rows.map((row) => ({
      emoji: row.emoji,
      count: Number(row.count)
    }))
  }

  async getReadMarker(conversationId: string, userId: string): Promise<ReadMarker | null> {
    const rows = await this.sql<ReadMarkerRow[]>`
      SELECT conversation_id, user_id, last_read_message_id, updated_at
      FROM read_markers
      WHERE conversation_id = ${conversationId}
        AND user_id = ${userId}
      LIMIT 1
    `

    return rows[0] ? mapReadMarker(rows[0]) : null
  }

  async upsertReadMarker(
    conversationId: string,
    userId: string,
    lastReadMessageId: string | null
  ): Promise<ReadMarker> {
    const updatedAt = new Date().toISOString()
    const rows = await this.sql<ReadMarkerRow[]>`
      INSERT INTO read_markers (conversation_id, user_id, last_read_message_id, updated_at)
      VALUES (${conversationId}, ${userId}, ${lastReadMessageId}, ${updatedAt})
      ON CONFLICT (conversation_id, user_id)
      DO UPDATE SET
        last_read_message_id = EXCLUDED.last_read_message_id,
        updated_at = EXCLUDED.updated_at
      RETURNING conversation_id, user_id, last_read_message_id, updated_at
    `

    return mapReadMarker(rows[0])
  }

  async listRoles(serverId: string): Promise<Role[]> {
    const rows = await this.sql<RoleRow[]>`
      SELECT id, server_id, name, permissions, is_default, created_at
      FROM roles
      WHERE server_id = ${serverId}
      ORDER BY created_at ASC
    `
    return rows.map(mapRole)
  }

  async createRole(serverId: string, name: string, permissions: Permission[]): Promise<Role> {
    const id = createId("rol")
    const createdAt = new Date().toISOString()
    const sanitized = sanitizePermissions(permissions)

    await this.sql`
      INSERT INTO roles (id, server_id, name, permissions, is_default, created_at)
      VALUES (${id}, ${serverId}, ${name}, ${JSON.stringify(sanitized)}, false, ${createdAt})
    `

    return {
      id,
      serverId,
      name,
      permissions: sanitized,
      isDefault: false,
      createdAt
    }
  }

  async assignRole(serverId: string, roleId: string, memberId: string): Promise<void> {
    await this.sql`
      INSERT INTO member_roles (server_id, user_id, role_id)
      VALUES (${serverId}, ${memberId}, ${roleId})
      ON CONFLICT (server_id, user_id, role_id) DO NOTHING
    `
  }

  async getRoleById(roleId: string): Promise<Role | null> {
    const rows = await this.sql<RoleRow[]>`
      SELECT id, server_id, name, permissions, is_default, created_at
      FROM roles
      WHERE id = ${roleId}
      LIMIT 1
    `
    return rows[0] ? mapRole(rows[0]) : null
  }

  async upsertChannelOverwrite(
    channelId: string,
    targetType: "role" | "member",
    targetId: string,
    allowPermissions: Permission[],
    denyPermissions: Permission[]
  ): Promise<ChannelPermissionOverwrite> {
    const id = createId("ovr")
    const createdAt = new Date().toISOString()
    const allow = sanitizePermissions(allowPermissions)
    const deny = sanitizePermissions(denyPermissions)

    const rows = await this.sql<OverwriteRow[]>`
      INSERT INTO channel_overwrites (
        id, channel_id, target_type, target_id, allow_permissions, deny_permissions, created_at
      )
      VALUES (
        ${id},
        ${channelId},
        ${targetType},
        ${targetId},
        ${JSON.stringify(allow)},
        ${JSON.stringify(deny)},
        ${createdAt}
      )
      ON CONFLICT (channel_id, target_type, target_id)
      DO UPDATE SET
        allow_permissions = EXCLUDED.allow_permissions,
        deny_permissions = EXCLUDED.deny_permissions
      RETURNING id, channel_id, target_type, target_id, allow_permissions, deny_permissions, created_at
    `

    return mapOverwrite(rows[0])
  }

  async listChannelOverwrites(channelId: string): Promise<ChannelPermissionOverwrite[]> {
    const rows = await this.sql<OverwriteRow[]>`
      SELECT id, channel_id, target_type, target_id, allow_permissions, deny_permissions, created_at
      FROM channel_overwrites
      WHERE channel_id = ${channelId}
      ORDER BY created_at ASC
    `
    return rows.map(mapOverwrite)
  }

  async createServerInvite(
    serverId: string,
    createdBy: string,
    maxUses: number | null,
    expiresAt: string | null
  ): Promise<ServerInvite> {
    const code = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()
    const createdAt = new Date().toISOString()

    const rows = await this.sql<InviteRow[]>`
      INSERT INTO server_invites (
        code, server_id, created_by, created_at, expires_at, max_uses, uses
      )
      VALUES (
        ${code},
        ${serverId},
        ${createdBy},
        ${createdAt},
        ${expiresAt},
        ${maxUses},
        0
      )
      RETURNING code, server_id, created_by, created_at, expires_at, max_uses, uses
    `

    return mapInvite(rows[0])
  }

  async joinServerByInvite(code: string, userId: string): Promise<Server | null> {
    const joined = await this.sql.begin(async (tx) => {
      const invites = await tx<InviteRow[]>`
        SELECT code, server_id, created_by, created_at, expires_at, max_uses, uses
        FROM server_invites
        WHERE code = ${code}
        FOR UPDATE
      `

      const invite = invites[0]
      if (!invite) {
        return null
      }

      if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
        return null
      }

      if (invite.max_uses !== null && invite.uses >= invite.max_uses) {
        return null
      }

      const memberRows = await tx<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1
          FROM server_members
          WHERE server_id = ${invite.server_id}
            AND user_id = ${userId}
        ) AS exists
      `

      const alreadyMember = Boolean(memberRows[0]?.exists)
      if (!alreadyMember) {
        await tx`
          INSERT INTO server_members (server_id, user_id)
          VALUES (${invite.server_id}, ${userId})
          ON CONFLICT (server_id, user_id) DO NOTHING
        `

        const defaultRole = await tx<{ id: string }[]>`
          SELECT id
          FROM roles
          WHERE server_id = ${invite.server_id}
            AND is_default = TRUE
          LIMIT 1
        `

        if (defaultRole[0]?.id) {
          await tx`
            INSERT INTO member_roles (server_id, user_id, role_id)
            VALUES (${invite.server_id}, ${userId}, ${defaultRole[0].id})
            ON CONFLICT (server_id, user_id, role_id) DO NOTHING
          `
        }

        await tx`
          UPDATE server_invites
          SET uses = uses + 1
          WHERE code = ${code}
        `
      }

      const servers = await tx<ServerRow[]>`
        SELECT id, name, owner_id, created_at
        FROM servers
        WHERE id = ${invite.server_id}
        LIMIT 1
      `

      return servers[0] ? mapServer(servers[0]) : null
    })

    return joined
  }

  private async listMemberRoleIds(serverId: string, userId: string): Promise<string[]> {
    const rows = await this.sql<{ role_id: string }[]>`
      SELECT role_id
      FROM member_roles
      WHERE server_id = ${serverId}
        AND user_id = ${userId}
    `
    return rows.map((row) => row.role_id)
  }

  private async getDefaultRole(serverId: string): Promise<Role | null> {
    const rows = await this.sql<RoleRow[]>`
      SELECT id, server_id, name, permissions, is_default, created_at
      FROM roles
      WHERE server_id = ${serverId}
        AND is_default = TRUE
      LIMIT 1
    `
    return rows[0] ? mapRole(rows[0]) : null
  }

  private async listReactionSummariesForChannel(channelId: string): Promise<Map<string, MessageReactionSummary[]>> {
    const rows = await this.sql<{ message_id: string; emoji: string; count: number | string }[]>`
      SELECT mr.message_id, mr.emoji, COUNT(*)::int AS count
      FROM message_reactions mr
      INNER JOIN messages m ON m.id = mr.message_id
      WHERE m.channel_id = ${channelId}
      GROUP BY mr.message_id, mr.emoji
      ORDER BY mr.message_id ASC, mr.emoji ASC
    `

    const grouped = new Map<string, MessageReactionSummary[]>()
    for (const row of rows) {
      const current = grouped.get(row.message_id) ?? []
      current.push({
        emoji: row.emoji,
        count: Number(row.count)
      })
      grouped.set(row.message_id, current)
    }

    return grouped
  }

  private async listAttachmentsForMessage(messageId: string): Promise<Attachment[]> {
    const rows = await this.sql<AttachmentRow[]>`
      SELECT id, message_id, file_name, content_type, size_bytes, url, uploaded_by, created_at
      FROM message_attachments
      WHERE message_id = ${messageId}
      ORDER BY created_at ASC
    `

    return rows.map(mapAttachment)
  }

  private async listAttachmentsForMessageIds(messageIds: string[]): Promise<Map<string, Attachment[]>> {
    const grouped = new Map<string, Attachment[]>()
    if (messageIds.length === 0) {
      return grouped
    }

    const rows = await this.sql<AttachmentRow[]>`
      SELECT id, message_id, file_name, content_type, size_bytes, url, uploaded_by, created_at
      FROM message_attachments
      WHERE message_id = ANY(${toPgTextArrayLiteral(messageIds)}::text[])
      ORDER BY created_at ASC
    `

    for (const row of rows) {
      const attachments = grouped.get(row.message_id) ?? []
      attachments.push(mapAttachment(row))
      grouped.set(row.message_id, attachments)
    }

    return grouped
  }

  private async listParticipantIdsByThreadId(threadId: string): Promise<string[]> {
    const rows = await this.sql<DirectThreadParticipantRow[]>`
      SELECT thread_id, user_id
      FROM direct_thread_participants
      WHERE thread_id = ${threadId}
      ORDER BY joined_at ASC
    `

    return rows.map((row) => row.user_id)
  }

  private async listParticipantIdsByThreadIds(threadIds: string[]): Promise<Map<string, string[]>> {
    const grouped = new Map<string, string[]>()
    if (threadIds.length === 0) {
      return grouped
    }

    const rows = await this.sql<DirectThreadParticipantRow[]>`
      SELECT thread_id, user_id
      FROM direct_thread_participants
      WHERE thread_id = ANY(${toPgTextArrayLiteral(threadIds)}::text[])
      ORDER BY joined_at ASC
    `

    for (const row of rows) {
      const participants = grouped.get(row.thread_id) ?? []
      participants.push(row.user_id)
      grouped.set(row.thread_id, participants)
    }

    return grouped
  }

  private async getDirectThreadByDmKey(dmKey: string): Promise<DirectThread | null> {
    const rows = await this.sql<DirectThreadRow[]>`
      SELECT id, channel_id, thread_type, owner_id, title, created_at, updated_at
      FROM direct_threads
      WHERE dm_key = ${dmKey}
      LIMIT 1
    `

    const row = rows[0]
    if (!row) {
      return null
    }

    const participantIds = await this.listParticipantIdsByThreadId(row.id)
    return mapDirectThread(row, participantIds)
  }
}
