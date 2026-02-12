import type { ChannelPermissionOverwrite, Permission, Role, Server } from "@mango/contracts"

export const ALL_PERMISSIONS: Permission[] = [
  "manage_server",
  "manage_channels",
  "read_messages",
  "send_messages"
]

export const DEFAULT_MEMBER_PERMISSIONS: Permission[] = ["read_messages", "send_messages"]
export const OWNER_ROLE_PERMISSIONS: Permission[] = ALL_PERMISSIONS

export function sanitizePermissions(input: Permission[]): Permission[] {
  const set = new Set<Permission>()
  for (const permission of input) {
    if (ALL_PERMISSIONS.includes(permission)) {
      set.add(permission)
    }
  }
  return Array.from(set)
}

function applyOverwrite(
  current: Set<Permission>,
  allowPermissions: Permission[],
  denyPermissions: Permission[]
): void {
  for (const denied of denyPermissions) {
    current.delete(denied)
  }
  for (const allowed of allowPermissions) {
    current.add(allowed)
  }
}

export function hasPermissionAfterOverwrites(params: {
  permission: Permission
  server: Server
  userId: string
  roles: Role[]
  memberRoleIds: string[]
  overwrites: ChannelPermissionOverwrite[]
  includeChannelOverwrites: boolean
}): boolean {
  const { permission, server, userId, roles, memberRoleIds, overwrites, includeChannelOverwrites } = params

  if (server.ownerId === userId) {
    return true
  }

  const effective = new Set<Permission>()
  const rolesById = new Map(roles.map((role) => [role.id, role]))
  const defaultRole = roles.find((role) => role.isDefault)

  if (defaultRole) {
    for (const item of defaultRole.permissions) {
      effective.add(item)
    }
  }

  for (const roleId of memberRoleIds) {
    const role = rolesById.get(roleId)
    if (!role) {
      continue
    }
    for (const item of role.permissions) {
      effective.add(item)
    }
  }

  if (!includeChannelOverwrites) {
    return effective.has(permission)
  }

  if (defaultRole) {
    const everyoneOverwrite = overwrites.find(
      (overwrite) => overwrite.targetType === "role" && overwrite.targetId === defaultRole.id
    )
    if (everyoneOverwrite) {
      applyOverwrite(effective, everyoneOverwrite.allowPermissions, everyoneOverwrite.denyPermissions)
    }
  }

  const roleOverwrites = overwrites.filter(
    (overwrite) => overwrite.targetType === "role" && memberRoleIds.includes(overwrite.targetId)
  )
  if (roleOverwrites.length > 0) {
    const allow = new Set<Permission>()
    const deny = new Set<Permission>()
    for (const overwrite of roleOverwrites) {
      for (const value of overwrite.allowPermissions) {
        allow.add(value)
      }
      for (const value of overwrite.denyPermissions) {
        deny.add(value)
      }
    }
    applyOverwrite(effective, Array.from(allow), Array.from(deny))
  }

  const memberOverwrite = overwrites.find(
    (overwrite) => overwrite.targetType === "member" && overwrite.targetId === userId
  )
  if (memberOverwrite) {
    applyOverwrite(effective, memberOverwrite.allowPermissions, memberOverwrite.denyPermissions)
  }

  return effective.has(permission)
}
