export type HealthResponse = {
  service: string;
  status: "ok";
  timestamp: string;
};

export function createHealthResponse(service: string): HealthResponse {
  return {
    service,
    status: "ok",
    timestamp: new Date().toISOString()
  };
}

export type User = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  createdAt: string;
};

export type AuthResponse = {
  token: string;
  user: User;
};

export type RegisterRequest = {
  email: string;
  username: string;
  displayName: string;
  password: string;
};

export type LoginRequest = {
  identifier: string;
  password: string;
};

export type AddFriendRequest = {
  userId: string;
};

export type FriendRequestStatus = "pending" | "accepted" | "rejected";

export type FriendRequest = {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: FriendRequestStatus;
  createdAt: string;
  respondedAt: string | null;
};

export type RespondFriendRequestRequest = {
  action: "accept" | "reject";
};

export type ServerInvite = {
  code: string;
  serverId: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
  maxUses: number | null;
  uses: number;
};

export type CreateInviteRequest = {
  maxUses?: number;
  expiresInHours?: number;
};

export type Server = {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
};

export type Channel = {
  id: string;
  serverId: string;
  name: string;
  type: "text";
  createdAt: string;
};

export type Attachment = {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  url: string;
  uploadedBy: string;
  createdAt: string;
};

export type DirectThreadType = "dm" | "group";

export type DirectThread = {
  id: string;
  channelId: string;
  kind: DirectThreadType;
  ownerId: string;
  title: string;
  participantIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type Permission =
  | "manage_server"
  | "manage_channels"
  | "read_messages"
  | "send_messages";

export type Role = {
  id: string;
  serverId: string;
  name: string;
  permissions: Permission[];
  isDefault: boolean;
  createdAt: string;
};

export type ChannelPermissionOverwrite = {
  id: string;
  channelId: string;
  targetType: "role" | "member";
  targetId: string;
  allowPermissions: Permission[];
  denyPermissions: Permission[];
  createdAt: string;
};

export type Message = {
  id: string;
  channelId: string;
  conversationId: string;
  directThreadId: string | null;
  authorId: string;
  body: string;
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string | null;
  reactions: MessageReactionSummary[];
};

export type MessageReactionSummary = {
  emoji: string;
  count: number;
};

export type MessageDeletedEvent = {
  id: string;
  channelId: string;
  conversationId: string;
  directThreadId: string | null;
};

export type ReadMarker = {
  conversationId: string;
  userId: string;
  lastReadMessageId: string | null;
  updatedAt: string;
};

export type TypingIndicator = {
  conversationId: string;
  directThreadId: string | null;
  userId: string;
  isTyping: boolean;
  expiresAt: string;
};

export type PresenceStatus = "online" | "idle" | "dnd" | "offline";

export type PresenceState = {
  userId: string;
  status: PresenceStatus;
  lastSeenAt: string;
  expiresAt: string | null;
};

export type UpdatePresenceRequest = {
  status?: Exclude<PresenceStatus, "offline">;
};

export type BulkPresenceRequest = {
  userIds: string[];
};

export type ModerationActionType = "kick" | "ban" | "timeout" | "unban";

export type ModerationAction = {
  id: string;
  serverId: string;
  actorId: string;
  targetUserId: string;
  actionType: ModerationActionType;
  reason: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type CreateModerationActionRequest = {
  targetUserId: string;
  actionType: ModerationActionType;
  reason?: string;
  durationMinutes?: number;
};

export type AuditLogEntry = {
  id: string;
  serverId: string;
  actorId: string | null;
  targetUserId: string | null;
  actionType: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type SearchScope = "all" | "messages" | "users" | "channels";

export type SearchResults = {
  users: User[];
  channels: Channel[];
  messages: Message[];
};

export type PushSubscription = {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreatePushSubscriptionRequest = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type CreateServerRequest = {
  name: string;
};

export type CreateChannelRequest = {
  name: string;
};

export type UpdateChannelRequest = {
  name: string;
};

export type CreateMessageRequest = {
  body: string;
  attachments?: Attachment[];
};

export type UpdateMessageRequest = {
  body: string;
};

export type CreateDirectThreadRequest = {
  participantIds: string[];
  title?: string;
};

export type UpdateReadMarkerRequest = {
  lastReadMessageId: string | null;
};

export type TypingIndicatorRequest = {
  isTyping?: boolean;
};

export type CreateAttachmentRequest = {
  fileName: string;
  contentType: string;
  sizeBytes: number;
};

export type AddReactionRequest = {
  emoji: string;
};

export type CreateRoleRequest = {
  name: string;
  permissions: Permission[];
};

export type AssignRoleRequest = {
  roleId: string;
  memberId: string;
};

export type AddServerMemberRequest = {
  memberId: string;
};

export type UpsertChannelOverwriteRequest = {
  targetType: "role" | "member";
  targetId: string;
  allowPermissions: Permission[];
  denyPermissions: Permission[];
};

export type ErrorResponse = {
  error: string;
};

export type RealtimeClientMessage =
  | {
      type: "subscribe";
      channelId?: string;
      conversationId?: string;
    }
  | {
      type: "unsubscribe";
      channelId?: string;
      conversationId?: string;
    }
  | {
      type: "ping";
    };

export type RealtimeServerMessage =
  | {
      type: "ready";
      userId: string;
    }
  | {
      type: "subscribed";
      channelId: string;
    }
  | {
      type: "unsubscribed";
      channelId: string;
    }
  | {
      type: "message.created";
      payload: Message;
    }
  | {
      type: "direct-thread.created";
      payload: DirectThread;
    }
  | {
      type: "message.updated";
      payload: Message;
    }
  | {
      type: "message.deleted";
      payload: MessageDeletedEvent;
    }
  | {
      type: "reaction.updated";
      payload: {
        conversationId: string;
        directThreadId: string | null;
        messageId: string;
        reactions: MessageReactionSummary[];
      };
    }
  | {
      type: "typing.updated";
      payload: TypingIndicator;
    }
  | {
      type: "presence.updated";
      payload: PresenceState;
    }
  | {
      type: "pong";
    }
  | {
      type: "error";
      error: string;
    };
