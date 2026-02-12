"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"
import {
  addFriend,
  addReaction,
  createChannel,
  createMessage,
  createServer,
  createServerInvite,
  deleteMessage,
  getMe,
  getUserById,
  joinServerByInvite,
  listChannels,
  listFriends,
  listMessages,
  listServers,
  login,
  register,
  removeReaction,
  searchUsers,
  updateMessage,
  type Channel,
  type Message,
  type Server,
  type User
} from "@/lib/api"
import { clearTokenCookie, getTokenFromCookie, setTokenCookie } from "@/lib/session-cookie"
import { createRealtimeSocket, parseRealtimeServerMessage, type RealtimeStatus } from "@/lib/realtime"

function encode(payload: unknown): string {
  return JSON.stringify(payload)
}

function upsertServer(list: Server[], incoming: Server): Server[] {
  const existing = list.find((item) => item.id === incoming.id)
  if (existing) {
    return list.map((item) => (item.id === incoming.id ? incoming : item))
  }
  return [...list, incoming]
}

function mergeUsersById(current: Record<string, User>, users: User[]): Record<string, User> {
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

function dedupeMessages(list: Message[]): Message[] {
  const byId = new Map<string, Message>()
  for (const message of list) {
    byId.set(message.id, message)
  }
  return sortByCreatedAt(Array.from(byId.values()))
}

function upsertMessage(list: Message[], incoming: Message): Message[] {
  const withoutExisting = list.filter((item) => item.id !== incoming.id)
  withoutExisting.push(incoming)
  return dedupeMessages(withoutExisting)
}

export function useChatApp() {
  const [token, setToken] = useState<string | null>(null)
  const [me, setMe] = useState<User | null>(null)

  const [servers, setServers] = useState<Server[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [usersById, setUsersById] = useState<Record<string, User>>({})

  const [friends, setFriends] = useState<User[]>([])
  const [friendSearchResults, setFriendSearchResults] = useState<User[]>([])

  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null)

  const [registerEmail, setRegisterEmail] = useState("")
  const [registerUsername, setRegisterUsername] = useState("")
  const [registerDisplayName, setRegisterDisplayName] = useState("")
  const [registerPassword, setRegisterPassword] = useState("")

  const [loginIdentifier, setLoginIdentifier] = useState("")
  const [loginPassword, setLoginPassword] = useState("")

  const [serverName, setServerName] = useState("")
  const [inviteCode, setInviteCode] = useState("")
  const [channelName, setChannelName] = useState("")
  const [messageBody, setMessageBody] = useState("")
  const [friendSearchQuery, setFriendSearchQuery] = useState("")

  const [latestInviteCode, setLatestInviteCode] = useState<string | null>(null)

  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("disconnected")

  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeChannelRef = useRef<string | null>(null)

  const selectedServer = useMemo(
    () => servers.find((server) => server.id === selectedServerId) ?? null,
    [servers, selectedServerId]
  )

  const selectedChannel = useMemo(
    () => channels.find((channel) => channel.id === selectedChannelId) ?? null,
    [channels, selectedChannelId]
  )

  useEffect(() => {
    const existing = getTokenFromCookie()
    if (existing) {
      setToken(existing)
    }
  }, [])

  useEffect(() => {
    if (!token) {
      setMe(null)
      setServers([])
      setChannels([])
      setMessages([])
      setUsersById({})
      setFriends([])
      setFriendSearchResults([])
      setSelectedServerId(null)
      setSelectedChannelId(null)
      setLatestInviteCode(null)
      return
    }

    void (async () => {
      try {
        const [currentUser, nextServers, nextFriends] = await Promise.all([
          getMe(token),
          listServers(token),
          listFriends(token)
        ])

        setMe(currentUser)
        setServers(nextServers)
        setFriends(nextFriends)
        setUsersById((current) => mergeUsersById(current, [currentUser, ...nextFriends]))
        setSelectedServerId((current) =>
          current && nextServers.some((server) => server.id === current) ? current : (nextServers[0]?.id ?? null)
        )
      } catch (error) {
        clearTokenCookie()
        setToken(null)
        setErrorMessage(error instanceof Error ? error.message : "Session failed.")
      }
    })()
  }, [token])

  useEffect(() => {
    if (!token || !selectedServerId) {
      setChannels([])
      setSelectedChannelId(null)
      return
    }

    void (async () => {
      try {
        const nextChannels = await listChannels(token, selectedServerId)
        setChannels(nextChannels)
        setSelectedChannelId((current) =>
          current && nextChannels.some((channel) => channel.id === current)
            ? current
            : (nextChannels[0]?.id ?? null)
        )
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load channels.")
      }
    })()
  }, [token, selectedServerId])

  useEffect(() => {
    if (!token || !selectedChannelId) {
      setMessages([])
      return
    }

    void (async () => {
      try {
        const nextMessages = await listMessages(token, selectedChannelId)
        setMessages(dedupeMessages(nextMessages))
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load messages.")
      }
    })()
  }, [token, selectedChannelId])

  useEffect(() => {
    if (!token || messages.length === 0) {
      return
    }

    const missingAuthorIds = Array.from(
      new Set(messages.map((message) => message.authorId).filter((authorId) => !usersById[authorId]))
    )
    if (missingAuthorIds.length === 0) {
      return
    }

    let cancelled = false

    void (async () => {
      const results = await Promise.allSettled(
        missingAuthorIds.map(async (authorId) => await getUserById(token, authorId))
      )

      if (cancelled) {
        return
      }

      const resolvedUsers: User[] = []
      for (const result of results) {
        if (result.status === "fulfilled") {
          resolvedUsers.push(result.value)
        }
      }

      if (resolvedUsers.length > 0) {
        setUsersById((current) => mergeUsersById(current, resolvedUsers))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [token, messages, usersById])

  useEffect(() => {
    activeChannelRef.current = selectedChannelId

    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return
    }

    if (selectedChannelId) {
      socket.send(encode({ type: "subscribe", channelId: selectedChannelId }))
    }

    return () => {
      if (selectedChannelId && socket.readyState === WebSocket.OPEN) {
        socket.send(encode({ type: "unsubscribe", channelId: selectedChannelId }))
      }
    }
  }, [selectedChannelId])

  useEffect(() => {
    if (!token) {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      socketRef.current?.close()
      socketRef.current = null
      setRealtimeStatus("disconnected")
      return
    }

    let disposed = false

    const connect = () => {
      if (disposed) {
        return
      }

      setRealtimeStatus("connecting")
      const socket = createRealtimeSocket(token)
      socketRef.current = socket

      socket.onopen = () => {
        if (disposed) {
          return
        }

        setRealtimeStatus("connected")
        if (activeChannelRef.current) {
          socket.send(encode({ type: "subscribe", channelId: activeChannelRef.current }))
        }
      }

      socket.onmessage = (event) => {
        if (typeof event.data !== "string") {
          return
        }

        const message = parseRealtimeServerMessage(event.data)
        if (!message) {
          return
        }

        if (message.type === "message.created") {
          if (message.payload.channelId !== activeChannelRef.current) {
            return
          }

          setMessages((current) => upsertMessage(current, message.payload))
          return
        }

        if (message.type === "message.updated") {
          if (message.payload.channelId !== activeChannelRef.current) {
            return
          }

          setMessages((current) => upsertMessage(current, message.payload))
          return
        }

        if (message.type === "message.deleted") {
          if (message.payload.channelId !== activeChannelRef.current) {
            return
          }

          setMessages((current) => current.filter((item) => item.id !== message.payload.id))
          return
        }

        if (message.type === "reaction.updated") {
          if (message.payload.channelId !== activeChannelRef.current) {
            return
          }

          setMessages((current) =>
            current.map((item) =>
              item.id === message.payload.messageId
                ? {
                    ...item,
                    reactions: message.payload.reactions
                  }
                : item
            )
          )
        }
      }

      socket.onerror = () => {
        socket.close()
      }

      socket.onclose = () => {
        if (disposed) {
          return
        }
        setRealtimeStatus("disconnected")
        reconnectTimerRef.current = setTimeout(connect, 1200)
      }
    }

    connect()

    return () => {
      disposed = true
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      socketRef.current?.close()
      socketRef.current = null
      setRealtimeStatus("disconnected")
    }
  }, [token])

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusyKey("register")
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      const response = await register({
        email: registerEmail,
        username: registerUsername,
        displayName: registerDisplayName,
        password: registerPassword
      })
      setTokenCookie(response.token)
      setUsersById((current) => mergeUsersById(current, [response.user]))
      setToken(response.token)
      setStatusMessage(`Welcome, ${response.user.displayName}.`)
      setRegisterPassword("")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Registration failed.")
    } finally {
      setBusyKey(null)
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusyKey("login")
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      const response = await login({
        identifier: loginIdentifier,
        password: loginPassword
      })
      setTokenCookie(response.token)
      setUsersById((current) => mergeUsersById(current, [response.user]))
      setToken(response.token)
      setStatusMessage(`Welcome back, ${response.user.displayName}.`)
      setLoginPassword("")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Login failed.")
    } finally {
      setBusyKey(null)
    }
  }

  function handleSignOut() {
    clearTokenCookie()
    setToken(null)
    setStatusMessage("Signed out.")
    setErrorMessage(null)
  }

  async function handleCreateServer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) {
      return
    }

    setBusyKey("server-create")
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      const created = await createServer(token, { name: serverName.trim() })
      setServers((current) => upsertServer(current, created))
      setSelectedServerId(created.id)
      setServerName("")
      setStatusMessage(`Created server "${created.name}".`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not create server.")
    } finally {
      setBusyKey(null)
    }
  }

  async function handleJoinServer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) {
      return
    }

    const code = inviteCode.trim()
    if (!code) {
      return
    }

    setBusyKey("server-join")
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      const joined = await joinServerByInvite(token, code)
      setServers((current) => upsertServer(current, joined))
      setSelectedServerId(joined.id)
      setInviteCode("")
      setStatusMessage(`Joined server "${joined.name}".`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not join server.")
    } finally {
      setBusyKey(null)
    }
  }

  async function handleCreateInvite(): Promise<void> {
    if (!token || !selectedServer) {
      return
    }

    setBusyKey("invite-create")
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      const invite = await createServerInvite(token, selectedServer.id)
      setLatestInviteCode(invite.code)
      setStatusMessage("Invite code generated.")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not create invite.")
    } finally {
      setBusyKey(null)
    }
  }

  async function handleCreateChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || !selectedServer) {
      return
    }

    const normalized = channelName.trim()
    if (!normalized) {
      return
    }

    setBusyKey("channel-create")
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      const created = await createChannel(token, selectedServer.id, { name: normalized })
      setChannels((current) => [...current, created])
      setSelectedChannelId(created.id)
      setChannelName("")
      setStatusMessage(`Created #${created.name}.`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not create channel.")
    } finally {
      setBusyKey(null)
    }
  }

  async function handleSearchFriends(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) {
      return
    }

    const normalized = friendSearchQuery.trim()
    if (normalized.length < 2) {
      setFriendSearchResults([])
      return
    }

    setBusyKey("friend-search")
    setErrorMessage(null)

    try {
      const results = await searchUsers(token, normalized)
      setFriendSearchResults(results)
      setUsersById((current) => mergeUsersById(current, results))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not search users.")
    } finally {
      setBusyKey(null)
    }
  }

  async function handleAddFriend(userId: string): Promise<void> {
    if (!token) {
      return
    }

    setBusyKey("friend-add")
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      await addFriend(token, { userId })
      const nextFriends = await listFriends(token)
      setFriends(nextFriends)
      setUsersById((current) => mergeUsersById(current, nextFriends))
      setStatusMessage("Friend added.")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not add friend.")
    } finally {
      setBusyKey(null)
    }
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || !selectedChannel) {
      return
    }

    const normalized = messageBody.trim()
    if (!normalized) {
      return
    }

    setBusyKey("message-send")
    setErrorMessage(null)

    try {
      const created = await createMessage(token, selectedChannel.id, { body: normalized })
      setMessages((current) => upsertMessage(current, created))
      setMessageBody("")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not send message.")
    } finally {
      setBusyKey(null)
    }
  }

  async function handleUpdateMessage(messageId: string, body: string) {
    if (!token) {
      return
    }

    setBusyKey("message-edit")
    setErrorMessage(null)

    try {
      const updated = await updateMessage(token, messageId, { body })
      setMessages((current) => upsertMessage(current, updated))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not update message.")
    } finally {
      setBusyKey(null)
    }
  }

  async function handleDeleteMessage(messageId: string) {
    if (!token) {
      return
    }

    setBusyKey("message-delete")
    setErrorMessage(null)

    try {
      await deleteMessage(token, messageId)
      setMessages((current) => current.filter((item) => item.id !== messageId))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not delete message.")
    } finally {
      setBusyKey(null)
    }
  }

  async function handleAddReaction(messageId: string, emoji: string) {
    if (!token) {
      return
    }

    try {
      const result = await addReaction(token, messageId, { emoji })
      setMessages((current) =>
        current.map((item) =>
          item.id === result.messageId
            ? {
                ...item,
                reactions: result.reactions
              }
            : item
        )
      )
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not add reaction.")
    }
  }

  async function handleRemoveReaction(messageId: string, emoji: string) {
    if (!token) {
      return
    }

    try {
      const result = await removeReaction(token, messageId, emoji)
      setMessages((current) =>
        current.map((item) =>
          item.id === result.messageId
            ? {
                ...item,
                reactions: result.reactions
              }
            : item
        )
      )
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not remove reaction.")
    }
  }

  function getAuthorLabel(authorId: string): string {
    if (me && authorId === me.id) {
      return me.displayName
    }

    const author = usersById[authorId]
    if (author) {
      return author.displayName
    }

    return authorId
  }

  return {
    token,
    me,
    servers,
    channels,
    messages,
    friends,
    friendSearchResults,
    selectedServer,
    selectedChannel,
    selectedServerId,
    selectedChannelId,
    registerEmail,
    registerUsername,
    registerDisplayName,
    registerPassword,
    loginIdentifier,
    loginPassword,
    serverName,
    inviteCode,
    channelName,
    messageBody,
    friendSearchQuery,
    latestInviteCode,
    busyKey,
    statusMessage,
    errorMessage,
    realtimeStatus,
    setSelectedServerId,
    setSelectedChannelId,
    setRegisterEmail,
    setRegisterUsername,
    setRegisterDisplayName,
    setRegisterPassword,
    setLoginIdentifier,
    setLoginPassword,
    setServerName,
    setInviteCode,
    setChannelName,
    setMessageBody,
    setFriendSearchQuery,
    handleRegister,
    handleLogin,
    handleSignOut,
    handleCreateServer,
    handleJoinServer,
    handleCreateInvite,
    handleCreateChannel,
    handleSearchFriends,
    handleAddFriend,
    handleSendMessage,
    handleUpdateMessage,
    handleDeleteMessage,
    handleAddReaction,
    handleRemoveReaction,
    getAuthorLabel
  }
}
