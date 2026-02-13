import type { DirectThread, Message, Server, User } from "@/lib/api"

export function encodePayload(payload: unknown): string {
  return JSON.stringify(payload)
}

export function upsertServer(list: Server[], incoming: Server): Server[] {
  const existing = list.find((item) => item.id === incoming.id)
  if (existing) {
    return list.map((item) => (item.id === incoming.id ? incoming : item))
  }
  return [...list, incoming]
}

export function mergeUsersById(current: Record<string, User>, users: User[]): Record<string, User> {
  const next = { ...current }
  for (const user of users) {
    next[user.id] = user
  }
  return next
}

function sortByCreatedAt(list: Message[]): Message[] {
  return [...list].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )
}

export function dedupeMessages(list: Message[]): Message[] {
  const byId = new Map<string, Message>()
  for (const message of list) {
    byId.set(message.id, message)
  }
  return sortByCreatedAt(Array.from(byId.values()))
}

export function upsertMessage(list: Message[], incoming: Message): Message[] {
  const withoutExisting = list.filter((item) => item.id !== incoming.id)
  withoutExisting.push(incoming)
  return dedupeMessages(withoutExisting)
}

export function upsertDirectThread(list: DirectThread[], incoming: DirectThread): DirectThread[] {
  const existing = list.find((thread) => thread.id === incoming.id)
  if (existing) {
    return list
      .map((thread) => (thread.id === incoming.id ? incoming : thread))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  return [...list, incoming].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}
