const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001"

export type User = {
  id: string
  email: string
  username: string
  displayName: string
  createdAt: string
}

export type AuthResponse = {
  token: string
  user: User
}

export type FriendRequestStatus = "pending" | "accepted" | "rejected"

export type FriendRequest = {
  id: string
  fromUserId: string
  toUserId: string
  status: FriendRequestStatus
  createdAt: string
  respondedAt: string | null
}

export type WebPushSubscription = {
  id: string
  userId: string
  endpoint: string
  p256dh: string
  auth: string
  userAgent: string | null
  createdAt: string
  updatedAt: string
}

export type Server = {
  id: string
  name: string
  ownerId: string
  createdAt: string
}

export type ServerInvite = {
  code: string
  serverId: string
  createdBy: string
  createdAt: string
  expiresAt: string | null
  maxUses: number | null
  uses: number
}

export type Channel = {
  id: string
  serverId: string
  name: string
  type: "text"
  createdAt: string
}

export type Attachment = {
  id: string
  fileName: string
  contentType: string
  sizeBytes: number
  url: string
  uploadedBy: string
  createdAt: string
}

export type DirectThread = {
  id: string
  channelId: string
  kind: "dm" | "group"
  ownerId: string
  title: string
  participantIds: string[]
  createdAt: string
  updatedAt: string
}

export type Permission = "manage_server" | "manage_channels" | "read_messages" | "send_messages"

export type Role = {
  id: string
  serverId: string
  name: string
  permissions: Permission[]
  isDefault: boolean
  createdAt: string
}

export type ChannelPermissionOverwrite = {
  id: string
  channelId: string
  targetType: "role" | "member"
  targetId: string
  allowPermissions: Permission[]
  denyPermissions: Permission[]
  createdAt: string
}

export type MessageReactionSummary = {
  emoji: string
  count: number
}

export type Message = {
  id: string
  channelId: string
  conversationId: string
  directThreadId: string | null
  authorId: string
  body: string
  attachments: Attachment[]
  createdAt: string
  updatedAt: string | null
  reactions: MessageReactionSummary[]
}

export type ReadMarker = {
  conversationId: string
  userId: string
  lastReadMessageId: string | null
  updatedAt: string
}

export type TypingIndicator = {
  conversationId: string
  directThreadId: string | null
  userId: string
  isTyping: boolean
  expiresAt: string
}

export type PresenceStatus = "online" | "idle" | "dnd" | "offline"

export type PresenceState = {
  userId: string
  status: PresenceStatus
  lastSeenAt: string
  expiresAt: string | null
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  token?: string | null
  body?: unknown
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {}

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`
  }

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json"
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error ?? `Request failed (${response.status})`)
  }

  return data as T
}

export function register(payload: {
  email: string
  username: string
  displayName: string
  password: string
}) {
  return request<AuthResponse>("/v1/auth/register", { method: "POST", body: payload })
}

export function login(payload: { identifier: string; password: string }) {
  return request<AuthResponse>("/v1/auth/login", { method: "POST", body: payload })
}

export function getMe(token: string) {
  return request<User>("/v1/me", { token })
}

export function updateMyPresence(
  token: string,
  payload: { status?: "online" | "idle" | "dnd" } = {}
) {
  return request<PresenceState>("/v1/presence", {
    method: "PUT",
    token,
    body: payload
  })
}

export function getMyPresence(token: string) {
  return request<PresenceState>("/v1/presence/me", { token })
}

export function getPresence(token: string, userId: string) {
  return request<PresenceState>(`/v1/presence/${encodeURIComponent(userId)}`, { token })
}

export function getBulkPresence(token: string, userIds: string[]) {
  return request<PresenceState[]>("/v1/presence/bulk", {
    method: "POST",
    token,
    body: { userIds }
  })
}

export function getUserById(token: string, userId: string) {
  return request<User>(`/v1/users/${encodeURIComponent(userId)}`, { token })
}

export function uploadAttachment(
  token: string,
  payload: { fileName: string; contentType: string; sizeBytes: number }
) {
  return request<Attachment>("/v1/attachments", {
    method: "POST",
    token,
    body: payload
  })
}

export function searchUsers(token: string, query: string) {
  const params = new URLSearchParams({ q: query })
  return request<User[]>(`/v1/users/search?${params.toString()}`, { token })
}

export function listFriends(token: string) {
  return request<User[]>("/v1/friends", { token })
}

export function listFriendRequests(token: string) {
  return request<FriendRequest[]>("/v1/friends/requests", { token })
}

export function sendFriendRequest(token: string, payload: { userId: string }) {
  return request<FriendRequest>("/v1/friends/requests", {
    method: "POST",
    token,
    body: payload
  })
}

export function respondFriendRequest(
  token: string,
  requestId: string,
  payload: { action: "accept" | "reject" }
) {
  return request<FriendRequest>(`/v1/friends/requests/${encodeURIComponent(requestId)}`, {
    method: "POST",
    token,
    body: payload
  })
}

export function createPushSubscription(
  token: string,
  payload: { endpoint: string; keys: { p256dh: string; auth: string } }
) {
  return request<WebPushSubscription>("/v1/notifications/push-subscriptions", {
    method: "POST",
    token,
    body: payload
  })
}

export function listPushSubscriptions(token: string) {
  return request<WebPushSubscription[]>("/v1/notifications/push-subscriptions", { token })
}

export function deletePushSubscription(token: string, subscriptionId: string) {
  return request<{ status: "ok" }>(`/v1/notifications/push-subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "DELETE",
    token
  })
}

export function listServers(token: string) {
  return request<Server[]>("/v1/servers", { token })
}

export function createServer(token: string, payload: { name: string }) {
  return request<Server>("/v1/servers", { method: "POST", token, body: payload })
}

export function joinServerByInvite(token: string, code: string) {
  return request<Server>(`/v1/invites/${encodeURIComponent(code)}/join`, {
    method: "POST",
    token
  })
}

export function createServerInvite(
  token: string,
  serverId: string,
  payload: { maxUses?: number; expiresInHours?: number } = {}
) {
  return request<ServerInvite>(`/v1/servers/${serverId}/invites`, {
    method: "POST",
    token,
    body: payload
  })
}

export function listChannels(token: string, serverId: string) {
  return request<Channel[]>(`/v1/servers/${serverId}/channels`, { token })
}

export function createChannel(token: string, serverId: string, payload: { name: string }) {
  return request<Channel>(`/v1/servers/${serverId}/channels`, {
    method: "POST",
    token,
    body: payload
  })
}

export function listDirectThreads(token: string) {
  return request<DirectThread[]>("/v1/direct-threads", { token })
}

export function createDirectThread(
  token: string,
  payload: { participantIds: string[]; title?: string }
) {
  return request<DirectThread>("/v1/direct-threads", {
    method: "POST",
    token,
    body: payload
  })
}

export function listDirectThreadMessages(token: string, threadId: string) {
  return request<Message[]>(`/v1/direct-threads/${encodeURIComponent(threadId)}/messages`, { token })
}

export function createDirectThreadMessage(
  token: string,
  threadId: string,
  payload: { body: string; attachments?: Attachment[] }
) {
  return request<Message>(`/v1/direct-threads/${encodeURIComponent(threadId)}/messages`, {
    method: "POST",
    token,
    body: payload
  })
}

export function listMessages(token: string, channelId: string) {
  return request<Message[]>(`/v1/channels/${channelId}/messages`, { token })
}

export function createMessage(
  token: string,
  channelId: string,
  payload: { body: string; attachments?: Attachment[] }
) {
  return request<Message>(`/v1/channels/${channelId}/messages`, {
    method: "POST",
    token,
    body: payload
  })
}

export function getChannelReadMarker(token: string, channelId: string) {
  return request<ReadMarker>(`/v1/channels/${channelId}/read-marker`, { token })
}

export function updateChannelReadMarker(
  token: string,
  channelId: string,
  payload: { lastReadMessageId: string | null }
) {
  return request<ReadMarker>(`/v1/channels/${channelId}/read-marker`, {
    method: "PUT",
    token,
    body: payload
  })
}

export function getDirectThreadReadMarker(token: string, threadId: string) {
  return request<ReadMarker>(`/v1/direct-threads/${encodeURIComponent(threadId)}/read-marker`, { token })
}

export function updateDirectThreadReadMarker(
  token: string,
  threadId: string,
  payload: { lastReadMessageId: string | null }
) {
  return request<ReadMarker>(`/v1/direct-threads/${encodeURIComponent(threadId)}/read-marker`, {
    method: "PUT",
    token,
    body: payload
  })
}

export function sendChannelTyping(token: string, channelId: string, payload: { isTyping?: boolean } = {}) {
  return request<TypingIndicator>(`/v1/channels/${channelId}/typing`, {
    method: "POST",
    token,
    body: payload
  })
}

export function sendDirectThreadTyping(
  token: string,
  threadId: string,
  payload: { isTyping?: boolean } = {}
) {
  return request<TypingIndicator>(`/v1/direct-threads/${encodeURIComponent(threadId)}/typing`, {
    method: "POST",
    token,
    body: payload
  })
}

export function updateMessage(token: string, messageId: string, payload: { body: string }) {
  return request<Message>(`/v1/messages/${messageId}`, {
    method: "PATCH",
    token,
    body: payload
  })
}

export function deleteMessage(token: string, messageId: string) {
  return request<{ id: string; channelId: string }>(`/v1/messages/${messageId}`, {
    method: "DELETE",
    token
  })
}

export function addReaction(token: string, messageId: string, payload: { emoji: string }) {
  return request<{ messageId: string; reactions: MessageReactionSummary[] }>(
    `/v1/messages/${messageId}/reactions`,
    {
      method: "POST",
      token,
      body: payload
    }
  )
}

export function removeReaction(token: string, messageId: string, emoji: string) {
  return request<{ messageId: string; reactions: MessageReactionSummary[] }>(
    `/v1/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
    {
      method: "DELETE",
      token
    }
  )
}

export function listServerMembers(token: string, serverId: string) {
  return request<User[]>(`/v1/servers/${serverId}/members`, { token })
}

export function addServerMember(token: string, serverId: string, payload: { memberId: string }) {
  return request<{ status: "ok" }>(`/v1/servers/${serverId}/members`, {
    method: "POST",
    token,
    body: payload
  })
}

export function listRoles(token: string, serverId: string) {
  return request<Role[]>(`/v1/servers/${serverId}/roles`, { token })
}

export function createRole(token: string, serverId: string, payload: { name: string; permissions: Permission[] }) {
  return request<Role>(`/v1/servers/${serverId}/roles`, {
    method: "POST",
    token,
    body: payload
  })
}

export function assignRole(token: string, serverId: string, payload: { roleId: string; memberId: string }) {
  return request<{ status: "ok" }>(`/v1/servers/${serverId}/roles/assign`, {
    method: "POST",
    token,
    body: payload
  })
}

export function upsertChannelOverwrite(
  token: string,
  channelId: string,
  payload: {
    targetType: "role" | "member"
    targetId: string
    allowPermissions: Permission[]
    denyPermissions: Permission[]
  }
) {
  return request<ChannelPermissionOverwrite>(`/v1/channels/${channelId}/overwrites`, {
    method: "PUT",
    token,
    body: payload
  })
}
