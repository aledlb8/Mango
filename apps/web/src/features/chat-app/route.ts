export type ChatAppRoute =
  | { kind: "friends" }
  | { kind: "dm"; threadId: string }
  | { kind: "server"; serverId: string; channelId?: string | null }

export function friendsPath(): string {
  return "/friends"
}

export function dmPath(threadId: string): string {
  return `/dm/${encodeURIComponent(threadId)}`
}

export function serverPath(serverId: string): string {
  return `/servers/${encodeURIComponent(serverId)}`
}

export function serverChannelPath(serverId: string, channelId: string): string {
  return `/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}`
}
