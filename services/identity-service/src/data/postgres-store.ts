import { SQL } from "bun"
import type { FriendRequest, User } from "@mango/contracts"
import { createId } from "../id"
import type { IdentityStore, StoredUser } from "./store"

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

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
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

async function ensureSchema(sql: SQL): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_users_username_lower
    ON users (LOWER(username))
  `

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS friendships (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      friend_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, friend_id),
      CHECK (user_id <> friend_id)
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS friend_requests (
      id TEXT PRIMARY KEY,
      from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      responded_at TIMESTAMPTZ,
      CHECK (from_user_id <> to_user_id)
    )
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_friend_requests_from_user_id
    ON friend_requests (from_user_id)
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_friend_requests_to_user_id
    ON friend_requests (to_user_id)
  `
}

export class PostgresStore implements IdentityStore {
  readonly kind = "postgres" as const

  private constructor(private readonly sql: SQL) {}

  static async connect(databaseUrl: string): Promise<PostgresStore> {
    const sql = new SQL(databaseUrl)
    await sql`SELECT 1`
    await ensureSchema(sql)
    return new PostgresStore(sql)
  }

  async createUser(email: string, username: string, displayName: string, passwordHash: string): Promise<StoredUser> {
    const id = createId("usr")
    const createdAt = new Date().toISOString()
    await this.sql`
      INSERT INTO users (id, email, username, display_name, password_hash, created_at)
      VALUES (${id}, ${email}, ${username}, ${displayName}, ${passwordHash}, ${createdAt})
    `
    return {
      id,
      email,
      username,
      displayName,
      passwordHash,
      createdAt
    }
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

  async removeFriend(userId: string, friendId: string): Promise<boolean> {
    const result = await this.sql.begin(async (tx) => {
      const first = await tx<{ user_id: string }[]>`
        DELETE FROM friendships
        WHERE user_id = ${userId}
          AND friend_id = ${friendId}
        RETURNING user_id
      `

      const second = await tx<{ user_id: string }[]>`
        DELETE FROM friendships
        WHERE user_id = ${friendId}
          AND friend_id = ${userId}
        RETURNING user_id
      `

      await tx`
        DELETE FROM friend_requests
        WHERE status = 'pending'
          AND (
            (from_user_id = ${userId} AND to_user_id = ${friendId})
            OR
            (from_user_id = ${friendId} AND to_user_id = ${userId})
          )
      `

      return first.length > 0 || second.length > 0
    })

    return result
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
}
