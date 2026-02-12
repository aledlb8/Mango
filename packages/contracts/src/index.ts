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
  authorId: string;
  body: string;
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
};

export type CreateServerRequest = {
  name: string;
};

export type CreateChannelRequest = {
  name: string;
};

export type CreateMessageRequest = {
  body: string;
};

export type UpdateMessageRequest = {
  body: string;
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
      channelId: string;
    }
  | {
      type: "unsubscribe";
      channelId: string;
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
        channelId: string;
        messageId: string;
        reactions: MessageReactionSummary[];
      };
    }
  | {
      type: "pong";
    }
  | {
      type: "error";
      error: string;
    };
