export type ChatAppRoute =
  | { kind: "friends" }
  | { kind: "dm"; threadId: string }
  | { kind: "server"; serverId: string; channelId?: string | null }

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function routeFromPathname(pathname: string | null | undefined): ChatAppRoute {
  if (!pathname || pathname === "/" || pathname === "/friends") {
    return { kind: "friends" }
  }

  const cleanPath = pathname.split("?")[0]?.replace(/\/+$/, "") ?? ""
  const segments = cleanPath.split("/").filter(Boolean).map(decodeSegment)

  if (segments[0] === "friends") {
    return { kind: "friends" }
  }

  if (segments[0] === "dm" && segments[1]) {
    return { kind: "dm", threadId: segments[1] }
  }

  if (segments[0] === "servers" && segments[1]) {
    if (segments[2] === "channels" && segments[3]) {
      return {
        kind: "server",
        serverId: segments[1],
        channelId: segments[3]
      }
    }

    return { kind: "server", serverId: segments[1] }
  }

  return { kind: "friends" }
}

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
