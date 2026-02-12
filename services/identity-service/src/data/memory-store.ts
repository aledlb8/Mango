import type { User } from "@mango/contracts"
import { createId } from "../id"
import type { IdentityStore, StoredUser } from "./store"

type State = {
  usersById: Map<string, StoredUser>
  usersByEmail: Map<string, StoredUser>
  usersByUsername: Map<string, StoredUser>
  sessionsByToken: Map<string, string>
  friendsByUserId: Map<string, Set<string>>
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

export class MemoryStore implements IdentityStore {
  readonly kind = "memory" as const

  private readonly state: State = {
    usersById: new Map<string, StoredUser>(),
    usersByEmail: new Map<string, StoredUser>(),
    usersByUsername: new Map<string, StoredUser>(),
    sessionsByToken: new Map<string, string>(),
    friendsByUserId: new Map<string, Set<string>>()
  }

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
    this.state.usersByEmail.set(user.email.toLowerCase(), user)
    this.state.usersByUsername.set(user.username.toLowerCase(), user)
    this.state.friendsByUserId.set(user.id, new Set<string>())
    return user
  }

  async findUserByEmail(email: string): Promise<StoredUser | null> {
    return this.state.usersByEmail.get(email.toLowerCase()) ?? null
  }

  async findUserByUsername(username: string): Promise<StoredUser | null> {
    return this.state.usersByUsername.get(username.toLowerCase()) ?? null
  }

  async findUserById(userId: string): Promise<StoredUser | null> {
    return this.state.usersById.get(userId) ?? null
  }

  async createSession(token: string, userId: string): Promise<void> {
    this.state.sessionsByToken.set(token, userId)
  }

  async getUserIdByToken(token: string): Promise<string | null> {
    return this.state.sessionsByToken.get(token) ?? null
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

  async listFriends(userId: string): Promise<User[]> {
    const friendIds = Array.from(this.state.friendsByUserId.get(userId) ?? [])
    const users: User[] = []

    for (const friendId of friendIds) {
      const user = this.state.usersById.get(friendId)
      if (!user) {
        continue
      }
      users.push(toPublicUser(user))
    }

    return users
  }
}
