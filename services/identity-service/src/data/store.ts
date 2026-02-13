import type { FriendRequest, User } from "@mango/contracts"

export type StoredUser = User & {
  passwordHash: string
}

export type StoreKind = "memory" | "postgres"

export interface IdentityStore {
  readonly kind: StoreKind
  createUser(email: string, username: string, displayName: string, passwordHash: string): Promise<StoredUser>
  findUserByEmail(email: string): Promise<StoredUser | null>
  findUserByUsername(username: string): Promise<StoredUser | null>
  findUserById(userId: string): Promise<StoredUser | null>

  createSession(token: string, userId: string): Promise<void>
  getUserIdByToken(token: string): Promise<string | null>

  searchUsers(query: string, excludeUserId: string): Promise<User[]>
  addFriend(userId: string, friendId: string): Promise<void>
  listFriends(userId: string): Promise<User[]>
  createFriendRequest(fromUserId: string, toUserId: string): Promise<FriendRequest>
  listFriendRequests(userId: string): Promise<FriendRequest[]>
  respondFriendRequest(
    requestId: string,
    responderUserId: string,
    action: "accept" | "reject"
  ): Promise<FriendRequest | null>
}
