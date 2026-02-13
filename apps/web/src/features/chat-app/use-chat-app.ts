"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"
import {
  addReaction,
  createChannel,
  createDirectThread,
  createDirectThreadMessage,
  createPushSubscription,
  createMessage,
  createServer,
  createServerInvite,
  deleteMessage,
  getBulkPresence,
  getMe,
  getUserById,
  joinServerByInvite,
  listChannels,
  listDirectThreadMessages,
  listDirectThreads,
  listFriends,
  listFriendRequests,
  listMessages,
  listServers,
  login,
  register,
  respondFriendRequest,
  removeReaction,
  sendFriendRequest,
  searchUsers,
  sendChannelTyping,
  sendDirectThreadTyping,
  updateChannelReadMarker,
  updateDirectThreadReadMarker,
  updateMyPresence,
  updateMessage,
  uploadAttachment,
  type Attachment,
  type Channel,
  type DirectThread,
  type FriendRequest,
  type Message,
  type PresenceState,
  type Server,
  type User
} from "@/lib/api"
import { clearTokenCookie, getTokenFromCookie, setTokenCookie } from "@/lib/session-cookie"
import { createRealtimeSocket, parseRealtimeServerMessage, type RealtimeStatus } from "@/lib/realtime"
import {
  dedupeMessages,
  encodePayload,
  mergeUsersById,
  upsertDirectThread,
  upsertMessage,
  upsertServer
} from "./state-utils"

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = atob(base64)
  const buffer = new ArrayBuffer(rawData.length)
  const outputArray = new Uint8Array(buffer)

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index)
  }

  return buffer
}

export function useChatApp() {
  const [token, setToken] = useState<string | null>(null)
  const [me, setMe] = useState<User | null>(null)

  const [servers, setServers] = useState<Server[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [directThreads, setDirectThreads] = useState<DirectThread[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [usersById, setUsersById] = useState<Record<string, User>>({})

  const [friends, setFriends] = useState<User[]>([])
  const [presenceByUserId, setPresenceByUserId] = useState<Record<string, PresenceState>>({})
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([])
  const [friendSearchResults, setFriendSearchResults] = useState<User[]>([])

  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null)
  const [selectedDirectThreadId, setSelectedDirectThreadId] = useState<string | null>(null)

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
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([])
  const [typingUsersByConversation, setTypingUsersByConversation] = useState<Record<string, string[]>>({})
  const [friendSearchQuery, setFriendSearchQuery] = useState("")

  const [latestInviteCode, setLatestInviteCode] = useState<string | null>(null)

  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("disconnected")

  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeChannelRef = useRef<string | null>(null)
  const selectedServerRef = useRef<string | null>(null)
  const selectedDirectThreadRef = useRef<string | null>(null)
  const typingExpiryRef = useRef<Map<string, number>>(new Map<string, number>())
  const typingDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingHeartbeatRef = useRef<number>(0)
  const typingActiveRef = useRef<boolean>(false)
  const lastReadMessageByConversationRef = useRef<Record<string, string | null>>({})

  const selectedServer = useMemo(
    () => servers.find((server) => server.id === selectedServerId) ?? null,
    [servers, selectedServerId]
  )

  const selectedChannel = useMemo(
    () => channels.find((channel) => channel.id === selectedChannelId) ?? null,
    [channels, selectedChannelId]
  )

  const selectedDirectThread = useMemo(
    () => directThreads.find((thread) => thread.id === selectedDirectThreadId) ?? null,
    [directThreads, selectedDirectThreadId]
  )

  const activeConversationId = useMemo(() => {
    if (selectedServerId) {
      return selectedChannelId
    }

    return selectedDirectThreadId
  }, [selectedServerId, selectedChannelId, selectedDirectThreadId])

  const typingUserLabels = useMemo(() => {
    if (!activeConversationId || !me) {
      return [] as string[]
    }

    return (typingUsersByConversation[activeConversationId] ?? [])
      .filter((userId) => userId !== me.id)
      .map((userId) => usersById[userId]?.displayName ?? userId)
  }, [activeConversationId, me, typingUsersByConversation, usersById])

  const stableMessages = useMemo(() => dedupeMessages(messages), [messages])

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
      setDirectThreads([])
      setMessages([])
      setUsersById({})
      setFriends([])
      setPresenceByUserId({})
      setFriendRequests([])
      setFriendSearchResults([])
      setSelectedServerId(null)
      setSelectedChannelId(null)
      setSelectedDirectThreadId(null)
      setLatestInviteCode(null)
      setPendingAttachments([])
      setTypingUsersByConversation({})
      return
    }

    void (async () => {
      try {
        const currentUser = await getMe(token)
        const [serversResult, friendsResult, friendRequestsResult, directThreadsResult] = await Promise.allSettled([
          listServers(token),
          listFriends(token),
          listFriendRequests(token),
          listDirectThreads(token)
        ])

        const nextServers = serversResult.status === "fulfilled" ? serversResult.value : []
        const nextFriends = friendsResult.status === "fulfilled" ? friendsResult.value : []
        const nextFriendRequests = friendRequestsResult.status === "fulfilled" ? friendRequestsResult.value : []
        const nextDirectThreads = directThreadsResult.status === "fulfilled" ? directThreadsResult.value : []

        setMe(currentUser)
        setServers(nextServers)
        setFriends(nextFriends)
        setFriendRequests(nextFriendRequests)
        setDirectThreads(nextDirectThreads)
        setUsersById((current) => mergeUsersById(current, [currentUser, ...nextFriends]))
        setSelectedServerId((current) =>
          current && nextServers.some((server) => server.id === current) ? current : (nextServers[0]?.id ?? null)
        )
        setSelectedDirectThreadId((current) =>
          current && nextDirectThreads.some((thread) => thread.id === current)
            ? current
            : null
        )

        if (
          serversResult.status === "rejected" ||
          friendsResult.status === "rejected" ||
          friendRequestsResult.status === "rejected" ||
          directThreadsResult.status === "rejected"
        ) {
          setStatusMessage("Logged in, but some sections are temporarily unavailable.")
        }
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
    if (!token || !activeConversationId) {
      setMessages([])
      return
    }

    void (async () => {
      try {
        const nextMessages = selectedServerId
          ? await listMessages(token, activeConversationId)
          : await listDirectThreadMessages(token, activeConversationId)
        setMessages(dedupeMessages(nextMessages))
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load messages.")
      }
    })()
  }, [token, selectedServerId, activeConversationId])

  useEffect(() => {
    if (!token || !activeConversationId || messages.length === 0) {
      return
    }

    const lastMessage = messages[messages.length - 1]
    if (!lastMessage) {
      return
    }

    const lastRead = lastReadMessageByConversationRef.current[activeConversationId]
    if (lastRead === lastMessage.id) {
      return
    }

    lastReadMessageByConversationRef.current[activeConversationId] = lastMessage.id

    const request = selectedServerId
      ? updateChannelReadMarker(token, activeConversationId, {
          lastReadMessageId: lastMessage.id
        })
      : updateDirectThreadReadMarker(token, activeConversationId, {
          lastReadMessageId: lastMessage.id
        })

    void request.catch(() => {
      // Best effort for MVP.
    })
  }, [token, selectedServerId, activeConversationId, messages])

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
    if (!token || !me) {
      return
    }

    let cancelled = false
    const publishPresence = () => {
      void updateMyPresence(token, { status: "online" })
        .then((presence) => {
          if (cancelled) {
            return
          }

          setPresenceByUserId((current) => ({
            ...current,
            [presence.userId]: presence
          }))
        })
        .catch(() => {})
    }

    publishPresence()
    const interval = setInterval(publishPresence, 30_000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [token, me])

  useEffect(() => {
    if (!token || typeof window === "undefined") {
      return
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""
    if (!vapidPublicKey) {
      return
    }

    let cancelled = false

    void (async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js")
        const permission = await Notification.requestPermission()
        if (permission !== "granted" || cancelled) {
          return
        }

        let subscription = await registration.pushManager.getSubscription()
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToArrayBuffer(vapidPublicKey)
          })
        }

        if (cancelled) {
          return
        }

        const payload = subscription.toJSON()
        if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys.auth) {
          return
        }

        await createPushSubscription(token, {
          endpoint: payload.endpoint,
          keys: {
            p256dh: payload.keys.p256dh,
            auth: payload.keys.auth
          }
        })
      } catch {
        // Push subscription is best effort.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (!token || friends.length === 0) {
      return
    }

    let cancelled = false
    const userIds = friends.map((friend) => friend.id)

    const fetchPresence = () => {
      void getBulkPresence(token, userIds)
        .then((presenceStates) => {
          if (cancelled) {
            return
          }

          setPresenceByUserId((current) => {
            const next = { ...current }
            for (const state of presenceStates) {
              next[state.userId] = state
            }
            return next
          })
        })
        .catch(() => {})
    }

    fetchPresence()
    const interval = setInterval(fetchPresence, 15_000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [token, friends])

  useEffect(() => {
    if (!token || !me || friendRequests.length === 0) {
      return
    }

    const missingUserIds = Array.from(
      new Set(
        friendRequests
          .flatMap((request) => [request.fromUserId, request.toUserId])
          .filter((userId) => userId !== me.id && !usersById[userId])
      )
    )

    if (missingUserIds.length === 0) {
      return
    }

    let cancelled = false

    void (async () => {
      const results = await Promise.allSettled(
        missingUserIds.map(async (userId) => await getUserById(token, userId))
      )

      if (cancelled) {
        return
      }

      const resolved: User[] = []
      for (const result of results) {
        if (result.status === "fulfilled") {
          resolved.push(result.value)
        }
      }

      if (resolved.length > 0) {
        setUsersById((current) => mergeUsersById(current, resolved))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [token, me, friendRequests, usersById])

  useEffect(() => {
    activeChannelRef.current = activeConversationId

    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return
    }

    if (activeConversationId) {
      socket.send(encodePayload({ type: "subscribe", conversationId: activeConversationId }))
    }

    return () => {
      if (activeConversationId && socket.readyState === WebSocket.OPEN) {
        socket.send(encodePayload({ type: "unsubscribe", conversationId: activeConversationId }))
      }
    }
  }, [activeConversationId])

  useEffect(() => {
    selectedServerRef.current = selectedServerId
    selectedDirectThreadRef.current = selectedDirectThreadId
  }, [selectedServerId, selectedDirectThreadId])

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
          socket.send(encodePayload({ type: "subscribe", conversationId: activeChannelRef.current }))
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
          if (message.payload.conversationId !== activeChannelRef.current) {
            return
          }

          setMessages((current) => upsertMessage(current, message.payload))
          return
        }

        if (message.type === "direct-thread.created") {
          setDirectThreads((current) => upsertDirectThread(current, message.payload))

          if (!selectedServerRef.current && !selectedDirectThreadRef.current) {
            setSelectedDirectThreadId(message.payload.id)
          }
          return
        }

        if (message.type === "message.updated") {
          if (message.payload.conversationId !== activeChannelRef.current) {
            return
          }

          setMessages((current) => upsertMessage(current, message.payload))
          return
        }

        if (message.type === "message.deleted") {
          if (message.payload.conversationId !== activeChannelRef.current) {
            return
          }

          setMessages((current) => current.filter((item) => item.id !== message.payload.id))
          return
        }

        if (message.type === "reaction.updated") {
          if (message.payload.conversationId !== activeChannelRef.current) {
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
          return
        }

        if (message.type === "typing.updated") {
          const conversationId = message.payload.conversationId
          const entryKey = `${conversationId}:${message.payload.userId}`
          const expiresAt = new Date(message.payload.expiresAt).getTime()

          if (message.payload.isTyping && Number.isFinite(expiresAt)) {
            typingExpiryRef.current.set(entryKey, expiresAt)
          } else {
            typingExpiryRef.current.delete(entryKey)
          }

          setTypingUsersByConversation((current) => {
            const users = new Set(current[conversationId] ?? [])
            if (message.payload.isTyping && Number.isFinite(expiresAt)) {
              users.add(message.payload.userId)
            } else {
              users.delete(message.payload.userId)
            }

            return {
              ...current,
              [conversationId]: Array.from(users)
            }
          })
          return
        }

        if (message.type === "presence.updated") {
          setPresenceByUserId((current) => ({
            ...current,
            [message.payload.userId]: message.payload
          }))
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

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setTypingUsersByConversation((current) => {
        let changed = false
        const next: Record<string, string[]> = {}

        for (const [conversationId, userIds] of Object.entries(current)) {
          const filtered = userIds.filter((userId) => {
            const expiresAt = typingExpiryRef.current.get(`${conversationId}:${userId}`)
            if (!expiresAt) {
              changed = true
              return false
            }

            if (expiresAt <= now) {
              typingExpiryRef.current.delete(`${conversationId}:${userId}`)
              changed = true
              return false
            }

            return true
          })

          if (filtered.length > 0) {
            next[conversationId] = filtered
          } else if (userIds.length > 0) {
            changed = true
          }
        }

        return changed ? next : current
      })
    }, 1000)

    return () => {
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (!token || !activeConversationId) {
      typingActiveRef.current = false
      return
    }

    const sendTyping = (isTyping: boolean) => {
      const request = selectedServerId
        ? sendChannelTyping(token, activeConversationId, { isTyping })
        : sendDirectThreadTyping(token, activeConversationId, { isTyping })
      void request.catch(() => {})
    }

    const hasText = messageBody.trim().length > 0
    const now = Date.now()

    if (hasText && (!typingActiveRef.current || now - typingHeartbeatRef.current > 2500)) {
      typingActiveRef.current = true
      typingHeartbeatRef.current = now
      sendTyping(true)
    }

    if (typingDebounceTimerRef.current) {
      clearTimeout(typingDebounceTimerRef.current)
      typingDebounceTimerRef.current = null
    }

    if (!hasText && typingActiveRef.current) {
      typingActiveRef.current = false
      sendTyping(false)
      return
    }

    if (hasText) {
      typingDebounceTimerRef.current = setTimeout(() => {
        if (!typingActiveRef.current) {
          return
        }

        typingActiveRef.current = false
        sendTyping(false)
      }, 3000)
    }

    return () => {
      if (typingDebounceTimerRef.current) {
        clearTimeout(typingDebounceTimerRef.current)
        typingDebounceTimerRef.current = null
      }
    }
  }, [token, selectedServerId, activeConversationId, messageBody])

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

  async function handleSendFriendRequest(userId: string): Promise<void> {
    if (!token) {
      return
    }

    setBusyKey("friend-request-send")
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      const request = await sendFriendRequest(token, { userId })
      setFriendRequests((current) => {
        const existing = current.find((item) => item.id === request.id)
        if (existing) {
          return current.map((item) => (item.id === request.id ? request : item))
        }
        return [request, ...current]
      })
      setStatusMessage("Friend request sent.")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not send friend request.")
    } finally {
      setBusyKey(null)
    }
  }

  async function handleRespondToFriendRequest(
    requestId: string,
    action: "accept" | "reject"
  ): Promise<void> {
    if (!token) {
      return
    }

    setBusyKey(action === "accept" ? "friend-request-accept" : "friend-request-reject")
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      await respondFriendRequest(token, requestId, { action })
      const [nextFriendRequests, nextFriends] = await Promise.all([
        listFriendRequests(token),
        listFriends(token)
      ])

      setFriendRequests(nextFriendRequests)
      setFriends(nextFriends)
      setUsersById((current) => mergeUsersById(current, nextFriends))
      setStatusMessage(action === "accept" ? "Friend request accepted." : "Friend request rejected.")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not respond to friend request.")
    } finally {
      setBusyKey(null)
    }
  }

  async function handleOpenDirectThread(friendId: string): Promise<void> {
    if (!token || !me) {
      return
    }

    setBusyKey("direct-thread-open")
    setErrorMessage(null)

    try {
      const existing = directThreads.find((thread) => {
        return (
          thread.kind === "dm" &&
          thread.participantIds.length === 2 &&
          thread.participantIds.includes(me.id) &&
          thread.participantIds.includes(friendId)
        )
      })

      if (existing) {
        handleSelectDirectThread(existing.id)
        return
      }

      const created = await createDirectThread(token, {
        participantIds: [friendId]
      })

      setDirectThreads((current) => upsertDirectThread(current, created))
      handleSelectDirectThread(created.id)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not open direct chat.")
    } finally {
      setBusyKey(null)
    }
  }

  function handleSelectDirectThread(threadId: string): void {
    setSelectedServerId(null)
    setSelectedDirectThreadId(threadId)
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || !activeConversationId) {
      return
    }

    const normalized = messageBody.trim()
    if (!normalized) {
      return
    }

    setBusyKey("message-send")
    setErrorMessage(null)

    try {
      let attachments: Attachment[] = []
      if (pendingAttachments.length > 0) {
        attachments = await Promise.all(
          pendingAttachments.map(async (file) => {
            return await uploadAttachment(token, {
              fileName: file.name,
              contentType: file.type || "application/octet-stream",
              sizeBytes: file.size
            })
          })
        )
      }

      const created = selectedServerId
        ? await createMessage(token, activeConversationId, {
            body: normalized,
            attachments
          })
        : await createDirectThreadMessage(token, activeConversationId, {
            body: normalized,
            attachments
          })
      setMessages((current) => upsertMessage(current, created))
      setMessageBody("")
      setPendingAttachments([])

      if (typingActiveRef.current) {
        typingActiveRef.current = false
        const request = selectedServerId
          ? sendChannelTyping(token, activeConversationId, { isTyping: false })
          : sendDirectThreadTyping(token, activeConversationId, { isTyping: false })
        void request.catch(() => {})
      }
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

  function handlePickAttachments(files: FileList | null): void {
    if (!files || files.length === 0) {
      return
    }

    const picked = Array.from(files)
    setPendingAttachments((current) => [...current, ...picked].slice(0, 10))
  }

  function handleRemovePendingAttachment(index: number): void {
    setPendingAttachments((current) => current.filter((_, currentIndex) => currentIndex !== index))
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

  function getUserLabel(userId: string): string {
    if (me && userId === me.id) {
      return me.displayName
    }

    const user = usersById[userId]
    if (user) {
      return user.displayName
    }

    return userId
  }

  function getUserPresenceStatus(userId: string): PresenceState["status"] {
    return presenceByUserId[userId]?.status ?? "offline"
  }

  function handleSelectFriendsView(): void {
    setSelectedServerId(null)
    setSelectedDirectThreadId(null)
  }

  const pendingRequestCount = useMemo(
    () => (me ? friendRequests.filter((r) => r.toUserId === me.id).length : 0),
    [me, friendRequests]
  )

  function getDirectThreadAvatar(thread: DirectThread): string {
    const label = getDirectThreadLabel(thread)
    return label.charAt(0).toUpperCase()
  }

  function getDirectThreadLabel(thread: DirectThread): string {
    if (thread.kind === "group") {
      return thread.title
    }

    if (!me) {
      return thread.title
    }

    const otherParticipantId = thread.participantIds.find((participantId) => participantId !== me.id)
    if (!otherParticipantId) {
      return thread.title
    }

    return usersById[otherParticipantId]?.displayName ?? thread.title
  }

  return {
    token,
    me,
    servers,
    channels,
    directThreads,
    messages: stableMessages,
    friends,
    presenceByUserId,
    friendRequests,
    friendSearchResults,
    selectedServer,
    selectedChannel,
    selectedDirectThread,
    selectedServerId,
    selectedChannelId,
    selectedDirectThreadId,
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
    pendingAttachments,
    typingUserLabels,
    friendSearchQuery,
    latestInviteCode,
    busyKey,
    statusMessage,
    errorMessage,
    realtimeStatus,
    setSelectedServerId,
    setSelectedChannelId,
    setSelectedDirectThreadId,
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
    handleSelectDirectThread,
    handleSelectFriendsView,
    pendingRequestCount,
    handlePickAttachments,
    handleRemovePendingAttachment,
    handleRegister,
    handleLogin,
    handleSignOut,
    handleCreateServer,
    handleJoinServer,
    handleCreateInvite,
    handleCreateChannel,
    handleSearchFriends,
    handleSendFriendRequest,
    handleRespondToFriendRequest,
    handleOpenDirectThread,
    handleSendMessage,
    handleUpdateMessage,
    handleDeleteMessage,
    handleAddReaction,
    handleRemoveReaction,
    getAuthorLabel,
    getUserLabel,
    getUserPresenceStatus,
    getDirectThreadLabel,
    getDirectThreadAvatar
  }
}
