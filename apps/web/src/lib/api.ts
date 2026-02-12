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
  authorId: string
  body: string
  createdAt: string
  updatedAt: string | null
  reactions: MessageReactionSummary[]
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

export function getUserById(token: string, userId: string) {
  return request<User>(`/v1/users/${encodeURIComponent(userId)}`, { token })
}

export function searchUsers(token: string, query: string) {
  const params = new URLSearchParams({ q: query })
  return request<User[]>(`/v1/users/search?${params.toString()}`, { token })
}

export function listFriends(token: string) {
  return request<User[]>("/v1/friends", { token })
}

export function addFriend(token: string, payload: { userId: string }) {
  return request<{ status: "ok" }>("/v1/friends", {
    method: "POST",
    token,
    body: payload
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

export function listMessages(token: string, channelId: string) {
  return request<Message[]>(`/v1/channels/${channelId}/messages`, { token })
}

export function createMessage(token: string, channelId: string, payload: { body: string }) {
  return request<Message>(`/v1/channels/${channelId}/messages`, {
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
