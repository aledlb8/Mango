"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"
import { DisconnectReason, Room, RoomEvent, Track } from "livekit-client"
import {
  ApiError,
  addReaction,
  createChannel,
  createDirectThread,
  createDirectThreadMessage,
  createPushSubscription,
  createMessage,
  createServer,
  createServerInvite,
  deleteChannel,
  heartbeatDirectThreadCall,
  heartbeatVoiceChannel,
  deleteMessage,
  deleteServer,
  getBulkPresence,
  getMe,
  getUserById,
  getVoiceChannelSession,
  joinDirectThreadCall,
  joinVoiceChannel,
  joinServerByInvite,
  leaveDirectThreadCall,
  leaveDirectThread,
  leaveVoiceChannel,
  leaveServer,
  listChannels,
  listDirectThreadMessages,
  listDirectThreads,
  listFriends,
  listFriendRequests,
  listMessages,
  listServers,
  login,
  removeFriend,
  register,
  respondFriendRequest,
  removeReaction,
  sendFriendRequest,
  searchUsers,
  sendChannelTyping,
  sendDirectThreadTyping,
  updateDirectThreadCallScreenShare,
  updateDirectThreadCallState,
  updateChannel,
  updateChannelReadMarker,
  updateDirectThreadReadMarker,
  updateMyPresence,
  updateMessage,
  updateVoiceChannelScreenShare,
  updateVoiceChannelState,
  uploadAttachment,
  type Attachment,
  type Channel,
  type DirectThread,
  type FriendRequest,
  type Message,
  type PresenceState,
  type Server,
  type User,
  type VoiceSession
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
import type { ChatAppRoute } from "./route"

const SESSION_CACHE_KEY = "mango_session_cache"

type CachedSession = {
  token: string
  user: User
}

type VoiceConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting"

type VoiceTarget = {
  kind: "channel" | "direct_thread"
  targetId: string
}

const VOICE_AUDIO_UNLOCK_MESSAGE = "Click anywhere to enable voice audio."
const MAX_VOICE_RECONNECT_ATTEMPTS = 8

export type ActiveVoiceInfo = {
  target: VoiceTarget
  channelName: string
}

function voiceTargetKey(target: VoiceTarget | null): string | null {
  if (!target) {
    return null
  }

  return `${target.kind}:${target.targetId}`
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase()
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]"
}

function normalizeLiveKitSignalingURL(signalingURL: string): string {
  const trimmed = signalingURL.trim()
  if (!trimmed || typeof window === "undefined") {
    return trimmed
  }

  try {
    const parsed = new URL(trimmed)
    const appHost = window.location.hostname.trim().toLowerCase()
    const appProtocol = window.location.protocol

    if (appProtocol === "https:" && parsed.protocol === "ws:") {
      parsed.protocol = "wss:"
    }

    if (appHost && !isLoopbackHost(appHost) && isLoopbackHost(parsed.hostname)) {
      parsed.hostname = appHost
    }

    return parsed.toString()
  } catch {
    return trimmed
  }
}

function getDisconnectReasonFromError(error: unknown): DisconnectReason | null {
  if (!error || typeof error !== "object") {
    return null
  }

  const context = (error as { context?: unknown }).context
  if (typeof context !== "number") {
    return null
  }

  return DisconnectReason[context] !== undefined ? (context as DisconnectReason) : null
}

function shouldAutoReconnectForDisconnectReason(reason: DisconnectReason | null | undefined): boolean {
  if (reason === null || reason === undefined) {
    return true
  }

  switch (reason) {
    case DisconnectReason.UNKNOWN_REASON:
    case DisconnectReason.SERVER_SHUTDOWN:
    case DisconnectReason.MIGRATION:
    case DisconnectReason.SIGNAL_CLOSE:
    case DisconnectReason.CONNECTION_TIMEOUT:
    case DisconnectReason.MEDIA_FAILURE:
      return true
    default:
      return false
  }
}

function getVoiceDisconnectErrorMessage(reason: DisconnectReason): string {
  switch (reason) {
    case DisconnectReason.DUPLICATE_IDENTITY:
      return "This account joined voice from another client. Use a different account per client."
    case DisconnectReason.PARTICIPANT_REMOVED:
      return "You were removed from this voice session."
    case DisconnectReason.ROOM_DELETED:
    case DisconnectReason.ROOM_CLOSED:
      return "This voice session is no longer available."
    case DisconnectReason.USER_REJECTED:
      return "Voice join was rejected."
    default:
      return "Voice connection ended."
  }
}

function shouldAutoReconnectForConnectionError(error: unknown): boolean {
  if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "NotFoundError")) {
    return false
  }

  const reason = getDisconnectReasonFromError(error)
  return shouldAutoReconnectForDisconnectReason(reason)
}

function shouldAutoReconnectForVoiceApiError(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    return true
  }

  return ![400, 401, 403, 404].includes(error.status)
}

function parseSessionUpdatedAtMs(session: Pick<VoiceSession, "updatedAt">): number | null {
  const updatedAtMs = Date.parse(session.updatedAt)
  return Number.isFinite(updatedAtMs) ? updatedAtMs : null
}

function writeCachedSession(token: string, user: User): void {
  if (typeof window === "undefined") {
    return
  }

  try {
    window.sessionStorage.setItem(
      SESSION_CACHE_KEY,
      JSON.stringify({
        token,
        user
      } satisfies CachedSession)
    )
  } catch {
    // Ignore storage failures.
  }
}

function clearCachedSession(): void {
  if (typeof window === "undefined") {
    return
  }

  try {
    window.sessionStorage.removeItem(SESSION_CACHE_KEY)
  } catch {
    // Ignore storage failures.
  }
}

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

export function useChatApp(route: ChatAppRoute, initialToken: string | null, initialMe: User | null) {
  const routeKind = route.kind
  const routeServerId = routeKind === "server" ? route.serverId : null
  const routeChannelId = routeKind === "server" ? (route.channelId ?? null) : null
  const routeThreadId = routeKind === "dm" ? route.threadId : null
  const initialSelectedServerId = routeKind === "server" ? routeServerId : null
  const initialSelectedChannelId = routeKind === "server" ? routeChannelId : null
  const initialSelectedDirectThreadId = routeKind === "dm" ? routeThreadId : null

  const [token, setToken] = useState<string | null>(initialToken)
  const [me, setMe] = useState<User | null>(initialMe)
  const [isAuthInitializing, setIsAuthInitializing] = useState<boolean>(Boolean(initialToken) && !initialMe)

  const [servers, setServers] = useState<Server[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [directThreads, setDirectThreads] = useState<DirectThread[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [usersById, setUsersById] = useState<Record<string, User>>({})

  const [friends, setFriends] = useState<User[]>([])
  const [presenceByUserId, setPresenceByUserId] = useState<Record<string, PresenceState>>({})
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([])
  const [friendSearchResults, setFriendSearchResults] = useState<User[]>([])

  const [selectedServerId, setSelectedServerId] = useState<string | null>(initialSelectedServerId)
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(initialSelectedChannelId)
  const [selectedDirectThreadId, setSelectedDirectThreadId] = useState<string | null>(initialSelectedDirectThreadId)

  const [registerEmail, setRegisterEmail] = useState("")
  const [registerUsername, setRegisterUsername] = useState("")
  const [registerDisplayName, setRegisterDisplayName] = useState("")
  const [registerPassword, setRegisterPassword] = useState("")

  const [loginIdentifier, setLoginIdentifier] = useState("")
  const [loginPassword, setLoginPassword] = useState("")

  const [serverName, setServerName] = useState("")
  const [inviteCode, setInviteCode] = useState("")
  const [channelName, setChannelName] = useState("")
  const [channelType, setChannelType] = useState<Channel["type"]>("text")
  const [messageBody, setMessageBody] = useState("")
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([])
  const [typingUsersByConversation, setTypingUsersByConversation] = useState<Record<string, string[]>>({})
  const [friendSearchQuery, setFriendSearchQuery] = useState("")

  const [latestInviteCode, setLatestInviteCode] = useState<string | null>(null)

  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("disconnected")
  const [voiceConnectionStatus, setVoiceConnectionStatus] = useState<VoiceConnectionStatus>("disconnected")
  const [activeVoiceTarget, setActiveVoiceTarget] = useState<VoiceTarget | null>(null)
  const [activeVoiceInfo, setActiveVoiceInfo] = useState<ActiveVoiceInfo | null>(null)
  const [voiceSessionsByTarget, setVoiceSessionsByTarget] = useState<Record<string, VoiceSession>>({})
  const [voiceMuted, setVoiceMuted] = useState(false)
  const [voiceDeafened, setVoiceDeafened] = useState(false)
  const [voiceSpeaking, setVoiceSpeaking] = useState(false)
  const [voiceScreenSharing, setVoiceScreenSharing] = useState(false)
  const [sessionRetryNonce, setSessionRetryNonce] = useState<number>(0)

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
  const meRef = useRef<User | null>(initialMe)
  const voiceHeartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const voiceReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const voiceReconnectAttemptRef = useRef<number>(0)
  const activeVoiceTargetRef = useRef<VoiceTarget | null>(null)
  const livekitRoomRef = useRef<Room | null>(null)
  const livekitAudioResumeCleanupRef = useRef<(() => void) | null>(null)
  const latestVoiceSessionUpdateMsRef = useRef<Map<string, number>>(new Map<string, number>())
  const remoteAudioElementsRef = useRef<Map<string, HTMLMediaElement>>(new Map<string, HTMLMediaElement>())
  const voiceIntentionalDisconnectRef = useRef<boolean>(false)
  const voiceConnectionStatusRef = useRef<VoiceConnectionStatus>("disconnected")
  const voiceMutedRef = useRef<boolean>(false)
  const voiceDeafenedRef = useRef<boolean>(false)
  const voiceSpeakingRef = useRef<boolean>(false)
  const voiceScreenSharingRef = useRef<boolean>(false)

  function setVoiceConnectionStatusImmediate(next: VoiceConnectionStatus): void {
    voiceConnectionStatusRef.current = next
    setVoiceConnectionStatus(next)
  }

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

  const currentVoiceTarget = useMemo<VoiceTarget | null>(() => {
    if (selectedChannel && selectedChannel.type === "voice") {
      return {
        kind: "channel",
        targetId: selectedChannel.id
      }
    }

    if (selectedDirectThread) {
      return {
        kind: "direct_thread",
        targetId: selectedDirectThread.id
      }
    }

    return null
  }, [selectedChannel, selectedDirectThread])

  const activeVoiceSession = useMemo(() => {
    const key = voiceTargetKey(currentVoiceTarget)
    if (!key) {
      return null
    }

    return voiceSessionsByTarget[key] ?? null
  }, [currentVoiceTarget, voiceSessionsByTarget])

  const connectedVoiceSession = useMemo(() => {
    const key = voiceTargetKey(activeVoiceTarget)
    if (!key) {
      return null
    }

    return voiceSessionsByTarget[key] ?? null
  }, [activeVoiceTarget, voiceSessionsByTarget])

  const screenShareAvailable = Boolean(activeVoiceSession?.features.screenShare)

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
    meRef.current = me
  }, [me])

  useEffect(() => {
    activeVoiceTargetRef.current = activeVoiceTarget
  }, [activeVoiceTarget])

  useEffect(() => {
    voiceConnectionStatusRef.current = voiceConnectionStatus
  }, [voiceConnectionStatus])

  useEffect(() => {
    voiceMutedRef.current = voiceMuted
    voiceDeafenedRef.current = voiceDeafened
    voiceSpeakingRef.current = voiceSpeaking
    voiceScreenSharingRef.current = voiceScreenSharing
  }, [voiceMuted, voiceDeafened, voiceSpeaking, voiceScreenSharing])

  useEffect(() => {
    if (token) {
      return
    }

    const cookieToken = getTokenFromCookie()
    if (cookieToken) {
      setToken(cookieToken)
    }
  }, [token])

  useEffect(() => {
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    if (!token) {
      setIsAuthInitializing(false)
      clearCachedSession()
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
      setChannelType("text")
      setLatestInviteCode(null)
      setPendingAttachments([])
      setTypingUsersByConversation({})
      setVoiceConnectionStatusImmediate("disconnected")
      setActiveVoiceTarget(null)
      setVoiceSessionsByTarget({})
      latestVoiceSessionUpdateMsRef.current.clear()
      setVoiceMuted(false)
      setVoiceDeafened(false)
      setVoiceSpeaking(false)
      setVoiceScreenSharing(false)
      if (voiceHeartbeatTimerRef.current) {
        clearInterval(voiceHeartbeatTimerRef.current)
        voiceHeartbeatTimerRef.current = null
      }
      if (voiceReconnectTimerRef.current) {
        clearTimeout(voiceReconnectTimerRef.current)
        voiceReconnectTimerRef.current = null
      }
      void disconnectLiveKitRoom()
      return () => {
        if (retryTimer) {
          clearTimeout(retryTimer)
        }
      }
    }

    if (!meRef.current) {
      setIsAuthInitializing(true)
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
        writeCachedSession(token, currentUser)
        setServers(nextServers)
        setFriends(nextFriends)
        setFriendRequests(nextFriendRequests)
        setDirectThreads(nextDirectThreads)
        setUsersById((current) => mergeUsersById(current, [currentUser, ...nextFriends]))

        if (
          serversResult.status === "rejected" ||
          friendsResult.status === "rejected" ||
          friendRequestsResult.status === "rejected" ||
          directThreadsResult.status === "rejected"
        ) {
          setStatusMessage("Logged in, but some sections are temporarily unavailable.")
        }

        setIsAuthInitializing(false)
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearTokenCookie()
          clearCachedSession()
          setToken(null)
          setErrorMessage("Session expired. Please sign in again.")
          setIsAuthInitializing(false)
          return
        }

        setErrorMessage(error instanceof Error ? error.message : "Session restore failed.")

        if (meRef.current) {
          setIsAuthInitializing(false)
          return
        }

        const retryAfterMs =
          error instanceof ApiError && error.retryAfterSeconds !== null
            ? Math.max(1000, error.retryAfterSeconds * 1000)
            : 1500

        retryTimer = setTimeout(() => {
          setSessionRetryNonce((current) => current + 1)
        }, retryAfterMs)
      }
    })()

    return () => {
      if (retryTimer) {
        clearTimeout(retryTimer)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, sessionRetryNonce])

  useEffect(() => {
    if (!token) {
      return
    }

    if (routeKind === "friends") {
      setSelectedServerId(null)
      setSelectedChannelId(null)
      setSelectedDirectThreadId(null)
      return
    }

    if (routeKind === "dm") {
      setSelectedServerId(null)
      setSelectedChannelId(null)
      setSelectedDirectThreadId(routeThreadId)
      return
    }

    setSelectedServerId(routeServerId)
    setSelectedDirectThreadId(null)
    setSelectedChannelId(routeChannelId)
  }, [token, routeKind, routeServerId, routeChannelId, routeThreadId])

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
        const desiredRouteChannelId =
          routeKind === "server" && routeServerId === selectedServerId ? routeChannelId : null
        setSelectedChannelId((current) =>
          desiredRouteChannelId && nextChannels.some((channel) => channel.id === desiredRouteChannelId)
            ? desiredRouteChannelId
            : current && nextChannels.some((channel) => channel.id === current)
              ? current
              : (nextChannels[0]?.id ?? null)
        )

        // Fetch voice sessions for all voice channels so the sidebar shows participants
        const voiceChannels = nextChannels.filter((channel) => channel.type === "voice")
        const sessionResults = await Promise.allSettled(
          voiceChannels.map((channel) => getVoiceChannelSession(token, channel.id))
        )

        setVoiceSessionsByTarget((current) => {
          const next = { ...current }
          for (let i = 0; i < voiceChannels.length; i++) {
            const result = sessionResults[i]
            const channel = voiceChannels[i]!
            const key = `channel:${channel.id}`
            if (result?.status === "fulfilled" && result.value) {
              next[key] = result.value
            } else {
              delete next[key]
            }
          }
          return next
        })
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load channels.")
      }
    })()
  }, [token, selectedServerId, routeKind, routeServerId, routeChannelId])

  useEffect(() => {
    if (!token || !activeConversationId) {
      setMessages([])
      return
    }

    if (selectedServerId && selectedChannel?.type !== "text") {
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
  }, [token, selectedServerId, selectedChannel, activeConversationId])

  useEffect(() => {
    if (!token || !activeConversationId || messages.length === 0) {
      return
    }

    if (selectedServerId && selectedChannel?.type !== "text") {
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
  }, [token, selectedServerId, selectedChannel, activeConversationId, messages])

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
          return
        }

        if (message.type === "voice.session.updated") {
          const key = `${message.payload.targetKind}:${message.payload.targetId}`

          const updatedAtMs = parseSessionUpdatedAtMs(message.payload)
          if (updatedAtMs !== null) {
            const latest = latestVoiceSessionUpdateMsRef.current.get(key)
            if (typeof latest === "number" && updatedAtMs < latest) {
              return
            }
            latestVoiceSessionUpdateMsRef.current.set(key, updatedAtMs)
          }

          setVoiceSessionsByTarget((current) => ({
            ...current,
            [key]: message.payload
          }))

          const meParticipant = message.payload.participants.find(
            (participant) => participant.userId === meRef.current?.id
          )
          if (meParticipant) {
            setVoiceMuted(meParticipant.muted)
            setVoiceDeafened(meParticipant.deafened)
            setVoiceSpeaking(meParticipant.speaking)
            setVoiceScreenSharing(meParticipant.screenSharing)
          }

          // Do not force-disconnect local media based on signaling participant snapshots.
          // Presence snapshots can arrive out of order; transport-level events and explicit
          // voice API responses are the source of truth for disconnect decisions.
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

    if (selectedServerId && selectedChannel?.type !== "text") {
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
  }, [token, selectedServerId, selectedChannel, activeConversationId, messageBody])

  function clearLiveKitAudioResumeListener(): void {
    if (!livekitAudioResumeCleanupRef.current) {
      return
    }

    livekitAudioResumeCleanupRef.current()
    livekitAudioResumeCleanupRef.current = null
  }

  function scheduleLiveKitAudioResume(room: Room): void {
    if (typeof window === "undefined") {
      return
    }

    clearLiveKitAudioResumeListener()

    const tryResume = () => {
      if (livekitRoomRef.current !== room) {
        clearLiveKitAudioResumeListener()
        return
      }

      void room
        .startAudio()
        .then(() => {
          clearLiveKitAudioResumeListener()
          setStatusMessage((current) => (current === VOICE_AUDIO_UNLOCK_MESSAGE ? null : current))
        })
        .catch(() => {
          // Keep listener active until user interaction successfully resumes audio.
        })
    }

    const onPointerDown = () => {
      tryResume()
    }
    const onKeyDown = () => {
      tryResume()
    }

    window.addEventListener("pointerdown", onPointerDown, { passive: true })
    window.addEventListener("keydown", onKeyDown)

    livekitAudioResumeCleanupRef.current = () => {
      window.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("keydown", onKeyDown)
    }

    setStatusMessage((current) => current ?? VOICE_AUDIO_UNLOCK_MESSAGE)
  }

  function clearRemoteAudioElements(): void {
    for (const element of remoteAudioElementsRef.current.values()) {
      element.remove()
    }
    remoteAudioElementsRef.current.clear()
  }

  function attachRemoteAudioTrack(track: Track, trackSid: string): void {
    if (track.kind !== Track.Kind.Audio || typeof document === "undefined") {
      return
    }

    const priorElement = remoteAudioElementsRef.current.get(trackSid)
    if (priorElement) {
      track.detach(priorElement)
      priorElement.remove()
      remoteAudioElementsRef.current.delete(trackSid)
    }

    const element = track.attach()
    element.autoplay = true
    element.muted = voiceDeafenedRef.current
    element.volume = voiceDeafenedRef.current ? 0 : 1
    element.style.display = "none"
    document.body.appendChild(element)
    remoteAudioElementsRef.current.set(trackSid, element)
  }

  function detachRemoteAudioTrack(track: Track, trackSid: string): void {
    const existingElement = remoteAudioElementsRef.current.get(trackSid)
    if (existingElement) {
      track.detach(existingElement)
      existingElement.remove()
      remoteAudioElementsRef.current.delete(trackSid)
      return
    }

    const detachedElements = track.detach()
    detachedElements.forEach((element) => element.remove())
  }

  async function disconnectLiveKitRoom(): Promise<void> {
    const room = livekitRoomRef.current
    if (!room) {
      clearLiveKitAudioResumeListener()
      clearRemoteAudioElements()
      return
    }

    livekitRoomRef.current = null
    voiceIntentionalDisconnectRef.current = true

    try {
      await room.disconnect()
    } catch {
      // Best effort cleanup.
    } finally {
      voiceIntentionalDisconnectRef.current = false
      clearLiveKitAudioResumeListener()
      setStatusMessage((current) => (current === VOICE_AUDIO_UNLOCK_MESSAGE ? null : current))
      clearRemoteAudioElements()
    }
  }

  async function applyLiveKitAudioState(muted: boolean, deafened: boolean): Promise<void> {
    const room = livekitRoomRef.current
    if (!room) {
      return
    }

    await room.localParticipant.setMicrophoneEnabled(!(muted || deafened))

    for (const element of remoteAudioElementsRef.current.values()) {
      element.muted = deafened
      element.volume = deafened ? 0 : 1
    }
  }

  async function applyLiveKitScreenShareState(enabled: boolean): Promise<void> {
    const room = livekitRoomRef.current
    if (!room) {
      return
    }

    await room.localParticipant.setScreenShareEnabled(enabled)
  }

  async function connectLiveKitForSession(target: VoiceTarget, session: VoiceSession): Promise<void> {
    const signalingURL = normalizeLiveKitSignalingURL(session.signaling.url)
    const participantToken = session.signaling.participantToken.trim()
    if (!signalingURL || !participantToken) {
      throw new Error("Voice signaling did not return a LiveKit connection token.")
    }

    await disconnectLiveKitRoom()

    const room = new Room({
      adaptiveStream: true,
      dynacast: true
    })
    livekitRoomRef.current = room

    room
      .on(RoomEvent.TrackSubscribed, (track, publication) => {
        attachRemoteAudioTrack(track, publication.trackSid)
      })
      .on(RoomEvent.TrackUnsubscribed, (track, publication) => {
        detachRemoteAudioTrack(track, publication.trackSid)
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, (canPlaybackAudio) => {
        if (livekitRoomRef.current !== room) {
          return
        }

        if (canPlaybackAudio) {
          clearLiveKitAudioResumeListener()
          setStatusMessage((current) => (current === VOICE_AUDIO_UNLOCK_MESSAGE ? null : current))
          return
        }

        scheduleLiveKitAudioResume(room)
      })
      .on(RoomEvent.Reconnecting, () => {
        if (livekitRoomRef.current !== room) {
          return
        }
        setVoiceConnectionStatusImmediate("reconnecting")
      })
      .on(RoomEvent.Reconnected, () => {
        if (livekitRoomRef.current !== room) {
          return
        }
        setVoiceConnectionStatusImmediate("connected")
        voiceReconnectAttemptRef.current = 0
      })
      .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
        clearRemoteAudioElements()

        if (voiceIntentionalDisconnectRef.current || livekitRoomRef.current !== room) {
          return
        }

        if (!shouldAutoReconnectForDisconnectReason(reason)) {
          clearVoiceReconnectTimer()
          clearVoiceHeartbeatTimer()
          setActiveVoiceTarget(null)
          setActiveVoiceInfo(null)
          setVoiceConnectionStatusImmediate("disconnected")

          if (typeof reason === "number") {
            setErrorMessage(getVoiceDisconnectErrorMessage(reason))
          }
          return
        }

        scheduleVoiceReconnect(target)
      })

    try {
      await room.connect(signalingURL, participantToken)
      try {
        await room.startAudio()
        setStatusMessage((current) => (current === VOICE_AUDIO_UNLOCK_MESSAGE ? null : current))
      } catch {
        scheduleLiveKitAudioResume(room)
      }

      try {
        await applyLiveKitAudioState(voiceMutedRef.current, voiceDeafenedRef.current)
      } catch {
        setErrorMessage("Connected to voice, but microphone could not be enabled on this device.")
      }

      if (session.features.screenShare && voiceScreenSharingRef.current) {
        try {
          await applyLiveKitScreenShareState(true)
        } catch {
          setVoiceScreenSharing(false)
        }
      }

      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.trackPublications.values()) {
          if (publication.track && publication.track.kind === Track.Kind.Audio) {
            attachRemoteAudioTrack(publication.track, publication.trackSid)
          }
        }
      }
    } catch (error) {
      await disconnectLiveKitRoom()
      throw error
    }
  }

  async function requestMicrophonePermission(): Promise<void> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    for (const track of stream.getTracks()) {
      track.stop()
    }
  }

  function upsertVoiceSession(session: VoiceSession): void {
    const key = `${session.targetKind}:${session.targetId}`
    const updatedAtMs = parseSessionUpdatedAtMs(session)
    if (updatedAtMs !== null) {
      const latest = latestVoiceSessionUpdateMsRef.current.get(key)
      if (typeof latest === "number" && updatedAtMs < latest) {
        return
      }
      latestVoiceSessionUpdateMsRef.current.set(key, updatedAtMs)
    }

    setVoiceSessionsByTarget((current) => ({
      ...current,
      [key]: session
    }))
  }

  function syncVoiceParticipantState(session: VoiceSession): void {
    const meParticipant = session.participants.find((participant) => participant.userId === meRef.current?.id)
    if (!meParticipant) {
      return
    }

    setVoiceMuted(meParticipant.muted)
    setVoiceDeafened(meParticipant.deafened)
    setVoiceSpeaking(meParticipant.speaking)
    setVoiceScreenSharing(meParticipant.screenSharing)
  }

  async function joinTargetVoice(
    target: VoiceTarget,
    payload: { muted?: boolean; deafened?: boolean; speaking?: boolean } = {}
  ): Promise<VoiceSession> {
    if (!token) {
      throw new Error("Missing auth token.")
    }

    if (target.kind === "channel") {
      return await joinVoiceChannel(token, target.targetId, payload)
    }

    return await joinDirectThreadCall(token, target.targetId, payload)
  }

  async function leaveTargetVoice(target: VoiceTarget): Promise<VoiceSession> {
    if (!token) {
      throw new Error("Missing auth token.")
    }

    if (target.kind === "channel") {
      return await leaveVoiceChannel(token, target.targetId)
    }

    return await leaveDirectThreadCall(token, target.targetId)
  }

  async function updateTargetVoiceState(
    target: VoiceTarget,
    payload: { muted?: boolean; deafened?: boolean; speaking?: boolean }
  ): Promise<VoiceSession> {
    if (!token) {
      throw new Error("Missing auth token.")
    }

    if (target.kind === "channel") {
      return await updateVoiceChannelState(token, target.targetId, payload)
    }

    return await updateDirectThreadCallState(token, target.targetId, payload)
  }

  async function updateTargetVoiceScreenShare(
    target: VoiceTarget,
    payload: { screenSharing: boolean }
  ): Promise<VoiceSession> {
    if (!token) {
      throw new Error("Missing auth token.")
    }

    if (target.kind === "channel") {
      return await updateVoiceChannelScreenShare(token, target.targetId, payload)
    }

    return await updateDirectThreadCallScreenShare(token, target.targetId, payload)
  }

  async function heartbeatTargetVoice(
    target: VoiceTarget,
    payload: { speaking?: boolean } = {}
  ): Promise<VoiceSession> {
    if (!token) {
      throw new Error("Missing auth token.")
    }

    if (target.kind === "channel") {
      return await heartbeatVoiceChannel(token, target.targetId, payload)
    }

    return await heartbeatDirectThreadCall(token, target.targetId, payload)
  }

  function clearVoiceHeartbeatTimer(): void {
    if (!voiceHeartbeatTimerRef.current) {
      return
    }

    clearInterval(voiceHeartbeatTimerRef.current)
    voiceHeartbeatTimerRef.current = null
  }

  function clearVoiceReconnectTimer(): void {
    if (!voiceReconnectTimerRef.current) {
      return
    }

    clearTimeout(voiceReconnectTimerRef.current)
    voiceReconnectTimerRef.current = null
  }

  function scheduleVoiceReconnect(target: VoiceTarget): void {
    const targetKey = voiceTargetKey(target)
    const activeKey = voiceTargetKey(activeVoiceTargetRef.current)
    if (!targetKey || !activeKey || targetKey !== activeKey) {
      return
    }

    if (voiceReconnectTimerRef.current) {
      return
    }

    clearVoiceHeartbeatTimer()
    const wasConnected = voiceConnectionStatusRef.current === "connected"
    setVoiceConnectionStatusImmediate("reconnecting")
    if (wasConnected) {
      void disconnectLiveKitRoom()
    }

    const attempt = voiceReconnectAttemptRef.current
    if (attempt >= MAX_VOICE_RECONNECT_ATTEMPTS) {
      setActiveVoiceTarget(null)
      setActiveVoiceInfo(null)
      setVoiceConnectionStatusImmediate("disconnected")
      setErrorMessage("Voice reconnection failed. Check your LiveKit connectivity and try joining again.")
      return
    }

    const delay = Math.min(10_000, 1_000 * 2 ** attempt)
    voiceReconnectAttemptRef.current += 1

    voiceReconnectTimerRef.current = setTimeout(() => {
      voiceReconnectTimerRef.current = null
      if (!activeVoiceTargetRef.current) {
        return
      }

      const currentKey = voiceTargetKey(activeVoiceTargetRef.current)
      if (!currentKey || currentKey !== targetKey) {
        return
      }

      void joinTargetVoice(target, {
        muted: voiceMutedRef.current,
        deafened: voiceDeafenedRef.current,
        speaking: voiceSpeakingRef.current
      })
        .then(async (session) => {
          upsertVoiceSession(session)
          syncVoiceParticipantState(session)
          await connectLiveKitForSession(target, session)
          setActiveVoiceTarget(target)
          setVoiceConnectionStatusImmediate("connected")
          voiceReconnectAttemptRef.current = 0
        })
        .catch((error) => {
          if (!shouldAutoReconnectForVoiceApiError(error)) {
            setActiveVoiceTarget(null)
            setActiveVoiceInfo(null)
            setVoiceConnectionStatusImmediate("disconnected")
            setErrorMessage(error instanceof Error ? error.message : "Could not reconnect voice.")
            return
          }

          scheduleVoiceReconnect(target)
        })
    }, delay)
  }

  useEffect(() => {
    clearVoiceHeartbeatTimer()

    if (!token || !activeVoiceTarget || voiceConnectionStatus !== "connected") {
      return
    }

    const sendHeartbeat = () => {
      void heartbeatTargetVoice(activeVoiceTarget, { speaking: voiceSpeaking })
        .then((session) => {
          upsertVoiceSession(session)
          syncVoiceParticipantState(session)
          setVoiceConnectionStatus((current) => {
            if (current === "reconnecting") {
              voiceReconnectAttemptRef.current = 0
              voiceConnectionStatusRef.current = "connected"
              return "connected"
            }
            return current
          })
        })
        .catch(() => {
          // Heartbeat is best effort. Media transport lifecycle is managed by LiveKit events.
        })
    }

    voiceHeartbeatTimerRef.current = setInterval(sendHeartbeat, 10_000)

    return () => {
      clearVoiceHeartbeatTimer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeVoiceTarget, voiceSpeaking, voiceConnectionStatus])

  // Voice stays connected when navigating away (Discord-like behavior).
  // Users must explicitly leave voice via the status bar or join a different channel.

  useEffect(() => {
    if (!activeVoiceTarget || typeof window === "undefined") {
      return
    }

    const target = activeVoiceTarget
    const handleOnline = () => {
      scheduleVoiceReconnect(target)
    }
    const handleOffline = () => {
      setVoiceConnectionStatusImmediate("reconnecting")
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVoiceTarget])

  useEffect(() => {
    return () => {
      void disconnectLiveKitRoom()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!activeVoiceTarget) {
      return
    }

    void applyLiveKitAudioState(voiceMuted, voiceDeafened).catch(() => {})
  }, [activeVoiceTarget, voiceMuted, voiceDeafened])

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
      setMe(response.user)
      writeCachedSession(response.token, response.user)
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
      setMe(response.user)
      writeCachedSession(response.token, response.user)
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
    clearCachedSession()
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
      const created = await createChannel(token, selectedServer.id, { name: normalized, type: channelType })
      setChannels((current) => [...current, created])
      setSelectedChannelId(created.id)
      setChannelName("")
      setChannelType("text")
      setStatusMessage(`Created ${created.type === "voice" ? "voice" : "text"} channel #${created.name}.`)
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

    if (selectedServerId && selectedChannel?.type !== "text") {
      setErrorMessage("Voice channels do not support text messages.")
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
      if (error instanceof ApiError && error.status === 429) {
        const suffix =
          error.retryAfterSeconds !== null && error.retryAfterSeconds > 0
            ? ` Try again in ${error.retryAfterSeconds}s.`
            : ""
        setErrorMessage(`You're sending messages too quickly.${suffix}`)
      } else {
        setErrorMessage(error instanceof Error ? error.message : "Could not send message.")
      }
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

  async function handleLeaveServer(serverId: string): Promise<void> {
    if (!token) {
      return
    }

    setBusyKey("server-leave")
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      await leaveServer(token, serverId)
      setServers((current) => current.filter((server) => server.id !== serverId))

      if (selectedServerId === serverId) {
        setSelectedServerId(null)
        setSelectedChannelId(null)
        setChannels([])
        setMessages([])
        setLatestInviteCode(null)
      }

      setStatusMessage("Left server.")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not leave server.")
    } finally {
      setBusyKey(null)
    }
  }

  async function handleDeleteServer(serverId: string): Promise<void> {
    if (!token) {
      return
    }

    setBusyKey("server-delete")
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      await deleteServer(token, serverId)
      setServers((current) => current.filter((server) => server.id !== serverId))

      if (selectedServerId === serverId) {
        setSelectedServerId(null)
        setSelectedChannelId(null)
        setChannels([])
        setMessages([])
        setLatestInviteCode(null)
      }

      setStatusMessage("Server deleted.")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not delete server.")
    } finally {
      setBusyKey(null)
    }
  }

  async function handleEditChannel(channelId: string, name: string): Promise<void> {
    if (!token) {
      return
    }

    const normalizedName = name.trim()
    if (!normalizedName) {
      setErrorMessage("Channel name is required.")
      return
    }

    setBusyKey("channel-edit")
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      const updated = await updateChannel(token, channelId, { name: normalizedName })
      setChannels((current) =>
        current.map((channel) => (channel.id === updated.id ? updated : channel))
      )
      setStatusMessage(`Renamed #${updated.name}.`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not rename channel.")
    } finally {
      setBusyKey(null)
    }
  }

  async function handleDeleteChannel(channelId: string): Promise<void> {
    if (!token) {
      return
    }

    setBusyKey("channel-delete")
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      await deleteChannel(token, channelId)
      const nextChannels = channels.filter((channel) => channel.id !== channelId)
      setChannels(nextChannels)

      if (selectedChannelId === channelId) {
        setSelectedChannelId(nextChannels[0]?.id ?? null)
        setMessages([])
      }

      setStatusMessage("Channel deleted.")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not delete channel.")
    } finally {
      setBusyKey(null)
    }
  }

  async function handleRemoveFriend(userId: string): Promise<void> {
    if (!token) {
      return
    }

    setBusyKey("friend-remove")
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      await removeFriend(token, userId)
      setFriends((current) => current.filter((friend) => friend.id !== userId))
      setFriendRequests((current) =>
        current.filter((request) => request.fromUserId !== userId && request.toUserId !== userId)
      )
      setStatusMessage("Friend removed.")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not remove friend.")
    } finally {
      setBusyKey(null)
    }
  }

  async function handleCloseDirectThread(threadId: string): Promise<void> {
    if (!token) {
      return
    }

    setBusyKey("direct-thread-close")
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      await leaveDirectThread(token, threadId)
      setDirectThreads((current) => current.filter((thread) => thread.id !== threadId))

      if (selectedDirectThreadId === threadId) {
        setSelectedDirectThreadId(null)
        setMessages([])
      }

      setStatusMessage("Conversation closed.")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not close conversation.")
    } finally {
      setBusyKey(null)
    }
  }

  async function handleJoinVoice(): Promise<void> {
    if (!currentVoiceTarget) {
      return
    }

    const target = currentVoiceTarget

    setBusyKey("voice-join")
    setErrorMessage(null)

    let joinedSignalingSession = false

    try {
      await requestMicrophonePermission()

      const currentKey = voiceTargetKey(currentVoiceTarget)
      const activeKey = voiceTargetKey(activeVoiceTarget)
      if (activeVoiceTarget && activeKey !== currentKey) {
        const leftSession = await leaveTargetVoice(activeVoiceTarget)
        upsertVoiceSession(leftSession)
        await disconnectLiveKitRoom()
        setActiveVoiceTarget(null)
        setActiveVoiceInfo(null)
      }

      clearVoiceReconnectTimer()
      clearVoiceHeartbeatTimer()
      setVoiceConnectionStatusImmediate("connecting")

      const session = await joinTargetVoice(target, {
        muted: voiceMutedRef.current,
        deafened: voiceDeafenedRef.current,
        speaking: voiceSpeakingRef.current
      })
      joinedSignalingSession = true
      upsertVoiceSession(session)
      syncVoiceParticipantState(session)
      setActiveVoiceTarget(target)

      const voiceName =
        target.kind === "channel"
          ? (channels.find((c) => c.id === target.targetId)?.name ?? "Voice Channel")
          : (directThreads.find((t) => t.id === target.targetId)?.title ?? "Direct Call")
      setActiveVoiceInfo({ target, channelName: voiceName })

      await connectLiveKitForSession(target, session)
      setVoiceConnectionStatusImmediate("connected")
      voiceReconnectAttemptRef.current = 0
    } catch (error) {
      await disconnectLiveKitRoom()
      const shouldReconnect = joinedSignalingSession && shouldAutoReconnectForConnectionError(error)

      if (shouldReconnect) {
        setVoiceConnectionStatusImmediate("reconnecting")
        scheduleVoiceReconnect(target)
      } else {
        setActiveVoiceTarget(null)
        setActiveVoiceInfo(null)
        setVoiceConnectionStatusImmediate("disconnected")
      }

      if (error instanceof DOMException && error.name === "NotAllowedError") {
        setErrorMessage("Microphone permission was denied. Allow microphone access and try again.")
      } else if (error instanceof DOMException && error.name === "NotFoundError") {
        setErrorMessage("No microphone was found on this device.")
      } else if (!shouldReconnect) {
        const disconnectReason = getDisconnectReasonFromError(error)
        if (disconnectReason !== null) {
          setErrorMessage(getVoiceDisconnectErrorMessage(disconnectReason))
        } else {
          setErrorMessage(error instanceof Error ? error.message : "Could not join voice.")
        }
      } else {
        setErrorMessage(error instanceof Error ? error.message : "Could not join voice.")
      }
    } finally {
      setBusyKey(null)
    }
  }

  async function handleLeaveVoice(): Promise<void> {
    const target = activeVoiceTarget ?? currentVoiceTarget
    if (!target) {
      return
    }

    setBusyKey("voice-leave")
    setErrorMessage(null)

    clearVoiceReconnectTimer()
    clearVoiceHeartbeatTimer()

    try {
      const session = await leaveTargetVoice(target)
      upsertVoiceSession(session)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not leave voice.")
    } finally {
      await disconnectLiveKitRoom()
      setActiveVoiceTarget(null)
      setActiveVoiceInfo(null)
      setVoiceConnectionStatusImmediate("disconnected")
      setVoiceMuted(false)
      setVoiceDeafened(false)
      setVoiceSpeaking(false)
      setVoiceScreenSharing(false)
      setBusyKey(null)
    }
  }

  async function handleToggleVoiceMute(): Promise<void> {
    const previousMuted = voiceMuted
    const previousDeafened = voiceDeafened
    const nextMuted = !voiceMuted
    setVoiceMuted(nextMuted)
    void applyLiveKitAudioState(nextMuted, previousDeafened).catch(() => {})

    if (!activeVoiceTarget) {
      return
    }

    try {
      const session = await updateTargetVoiceState(activeVoiceTarget, {
        muted: nextMuted
      })
      upsertVoiceSession(session)
      syncVoiceParticipantState(session)
    } catch (error) {
      setVoiceMuted(previousMuted)
      void applyLiveKitAudioState(previousMuted, previousDeafened).catch(() => {})
      setErrorMessage(error instanceof Error ? error.message : "Could not update mute state.")
    }
  }

  async function handleToggleVoiceDeafen(): Promise<void> {
    const previousDeafened = voiceDeafened
    const previousMuted = voiceMuted
    const nextDeafened = !voiceDeafened
    setVoiceDeafened(nextDeafened)
    if (nextDeafened) {
      setVoiceSpeaking(false)
    }
    void applyLiveKitAudioState(previousMuted, nextDeafened).catch(() => {})

    if (!activeVoiceTarget) {
      return
    }

    try {
      const session = await updateTargetVoiceState(activeVoiceTarget, {
        deafened: nextDeafened,
        speaking: nextDeafened ? false : voiceSpeaking
      })
      upsertVoiceSession(session)
      syncVoiceParticipantState(session)
    } catch (error) {
      setVoiceDeafened(previousDeafened)
      void applyLiveKitAudioState(previousMuted, previousDeafened).catch(() => {})
      setErrorMessage(error instanceof Error ? error.message : "Could not update deafened state.")
    }
  }

  async function handleToggleVoiceSpeaking(): Promise<void> {
    if (voiceDeafened) {
      setErrorMessage("You cannot set speaking while deafened.")
      return
    }

    const nextSpeaking = !voiceSpeaking
    setVoiceSpeaking(nextSpeaking)

    if (!activeVoiceTarget) {
      return
    }

    try {
      const session = await updateTargetVoiceState(activeVoiceTarget, {
        speaking: nextSpeaking
      })
      upsertVoiceSession(session)
      syncVoiceParticipantState(session)
    } catch (error) {
      setVoiceSpeaking((current) => !current)
      setErrorMessage(error instanceof Error ? error.message : "Could not update speaking state.")
    }
  }

  async function handleToggleVoiceScreenShare(): Promise<void> {
    if (!screenShareAvailable) {
      return
    }

    const previousScreenSharing = voiceScreenSharing
    const nextScreenSharing = !voiceScreenSharing
    setVoiceScreenSharing(nextScreenSharing)

    if (!activeVoiceTarget) {
      return
    }

    try {
      await applyLiveKitScreenShareState(nextScreenSharing)
      const session = await updateTargetVoiceScreenShare(activeVoiceTarget, {
        screenSharing: nextScreenSharing
      })
      upsertVoiceSession(session)
      syncVoiceParticipantState(session)
    } catch (error) {
      setVoiceScreenSharing(previousScreenSharing)
      void applyLiveKitScreenShareState(previousScreenSharing).catch(() => {})
      setErrorMessage(error instanceof Error ? error.message : "Could not update screen sharing state.")
    }
  }

  function copyToClipboard(text: string): void {
    void navigator.clipboard.writeText(text).catch(() => {})
  }

  return {
    token,
    me,
    isAuthInitializing,
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
    channelType,
    messageBody,
    pendingAttachments,
    typingUserLabels,
    friendSearchQuery,
    latestInviteCode,
    busyKey,
    statusMessage,
    errorMessage,
    realtimeStatus,
    activeVoiceSession,
    connectedVoiceSession,
    activeVoiceInfo,
    activeVoiceTarget,
    voiceConnectionStatus,
    voiceSessionsByTarget,
    voiceMuted,
    voiceDeafened,
    voiceSpeaking,
    voiceScreenSharing,
    screenShareAvailable,
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
    setChannelType,
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
    handleJoinVoice,
    handleLeaveVoice,
    handleToggleVoiceMute,
    handleToggleVoiceDeafen,
    handleToggleVoiceSpeaking,
    handleToggleVoiceScreenShare,
    getAuthorLabel,
    getUserLabel,
    getUserPresenceStatus,
    getDirectThreadLabel,
    getDirectThreadAvatar,
    handleLeaveServer,
    handleDeleteServer,
    handleEditChannel,
    handleDeleteChannel,
    handleRemoveFriend,
    handleCloseDirectThread,
    copyToClipboard
  }
}
