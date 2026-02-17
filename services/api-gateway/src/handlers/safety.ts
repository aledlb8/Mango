import type {
  CreateSafetyAppealRequest,
  CreateSafetyReportRequest,
  SafetyAppealStatus,
  SafetyReportStatus,
  SafetyReportTargetType,
  UpdateSafetyAppealRequest,
  UpdateSafetyReportRequest
} from "@mango/contracts"
import { getAuthenticatedUser } from "../auth/session"
import { readJson } from "../http/request"
import { error, json } from "../http/response"
import type { RouteContext } from "../router-context"
import { hasAdminAccess, requireAdminAccess } from "./admin-auth"

function parseLimit(request: Request): number {
  const raw = new URL(request.url).searchParams.get("limit")
  if (!raw) {
    return 50
  }

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) {
    return 50
  }

  return Math.max(1, Math.min(parsed, 200))
}

function parseSafetyReportStatus(raw: string | null): SafetyReportStatus | null {
  if (!raw) {
    return null
  }

  const value = raw.trim().toLowerCase()
  if (value === "open" || value === "in_review" || value === "resolved" || value === "dismissed") {
    return value
  }

  return null
}

function parseSafetyAppealStatus(raw: string | null): SafetyAppealStatus | null {
  if (!raw) {
    return null
  }

  const value = raw.trim().toLowerCase()
  if (value === "open" || value === "accepted" || value === "rejected") {
    return value
  }

  return null
}

function parseTargetType(raw: string | undefined): SafetyReportTargetType | null {
  if (!raw) {
    return null
  }

  const value = raw.trim().toLowerCase()
  if (value === "message" || value === "user" || value === "channel" || value === "server") {
    return value
  }

  return null
}

async function requireReviewerAccess(
  request: Request,
  serverId: string | null,
  ctx: RouteContext
): Promise<{ userId: string | null; isAdmin: boolean } | Response> {
  if (hasAdminAccess(request)) {
    return {
      userId: null,
      isAdmin: true
    }
  }

  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  if (!serverId) {
    return error(ctx.corsOrigin, 403, "Admin API key is required for global safety review.")
  }

  if (!(await ctx.store.hasServerPermission(serverId, user.id, "manage_server"))) {
    return error(ctx.corsOrigin, 403, "Missing permission: manage_server.")
  }

  return {
    userId: user.id,
    isAdmin: false
  }
}

export async function handleCreateSafetyReport(request: Request, ctx: RouteContext): Promise<Response> {
  const reporter = await getAuthenticatedUser(request, ctx.store)
  if (!reporter) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const body = await readJson<CreateSafetyReportRequest>(request)
  if (!body) {
    return error(ctx.corsOrigin, 400, "Invalid JSON body.")
  }

  const targetType = parseTargetType(body.targetType)
  if (!targetType) {
    return error(ctx.corsOrigin, 400, "targetType must be one of: message, user, channel, server.")
  }

  const targetId = body.targetId?.trim()
  if (!targetId) {
    return error(ctx.corsOrigin, 400, "targetId is required.")
  }

  const reasonCode = body.reasonCode?.trim()
  if (!reasonCode) {
    return error(ctx.corsOrigin, 400, "reasonCode is required.")
  }

  if (reasonCode.length > 64) {
    return error(ctx.corsOrigin, 400, "reasonCode exceeds 64 characters.")
  }

  const details = body.details?.trim() || null
  if (details && details.length > 2000) {
    return error(ctx.corsOrigin, 400, "details exceeds 2000 characters.")
  }

  let serverId = body.serverId?.trim() || null

  if (targetType === "message") {
    const message = await ctx.store.getMessageById(targetId)
    if (!message) {
      return error(ctx.corsOrigin, 404, "Target message not found.")
    }

    const channel = await ctx.store.getChannelById(message.channelId)
    if (!channel) {
      return error(ctx.corsOrigin, 404, "Target channel not found.")
    }

    serverId = serverId ?? channel.serverId
  }

  if (targetType === "channel") {
    const channel = await ctx.store.getChannelById(targetId)
    if (!channel) {
      return error(ctx.corsOrigin, 404, "Target channel not found.")
    }

    serverId = serverId ?? channel.serverId
  }

  if (targetType === "server") {
    const server = await ctx.store.getServerById(targetId)
    if (!server) {
      return error(ctx.corsOrigin, 404, "Target server not found.")
    }

    serverId = serverId ?? server.id
  }

  if (targetType === "user") {
    const user = await ctx.store.findUserById(targetId)
    if (!user) {
      return error(ctx.corsOrigin, 404, "Target user not found.")
    }
  }

  if (serverId && !(await ctx.store.isServerMember(serverId, reporter.id))) {
    return error(ctx.corsOrigin, 403, "You must be a member of the target server to create this report.")
  }

  const created = await ctx.store.createSafetyReport({
    serverId,
    reporterUserId: reporter.id,
    targetType,
    targetId,
    reasonCode,
    details
  })

  return json(ctx.corsOrigin, 201, created)
}

export async function handleListSafetyReports(request: Request, ctx: RouteContext): Promise<Response> {
  const url = new URL(request.url)
  const serverId = url.searchParams.get("serverId")?.trim() || null
  const statusRaw = url.searchParams.get("status")
  const status = parseSafetyReportStatus(statusRaw)
  if (statusRaw && !status) {
    return error(ctx.corsOrigin, 400, "status must be one of: open, in_review, resolved, dismissed.")
  }

  const access = await requireReviewerAccess(request, serverId, ctx)
  if (access instanceof Response) {
    return access
  }

  const reports = await ctx.store.listSafetyReports({
    serverId,
    status,
    limit: parseLimit(request)
  })

  return json(ctx.corsOrigin, 200, reports)
}

export async function handleUpdateSafetyReport(
  request: Request,
  reportId: string,
  ctx: RouteContext
): Promise<Response> {
  const report = await ctx.store.getSafetyReportById(reportId)
  if (!report) {
    return error(ctx.corsOrigin, 404, "Safety report not found.")
  }

  const access = await requireReviewerAccess(request, report.serverId, ctx)
  if (access instanceof Response) {
    return access
  }

  const body = await readJson<UpdateSafetyReportRequest>(request)
  if (!body) {
    return error(ctx.corsOrigin, 400, "Invalid JSON body.")
  }

  const status = body.status ?? report.status
  if (!parseSafetyReportStatus(status)) {
    return error(ctx.corsOrigin, 400, "status must be one of: open, in_review, resolved, dismissed.")
  }

  const assignedModeratorId =
    body.assignedModeratorId !== undefined
      ? body.assignedModeratorId
      : access.userId ?? report.assignedModeratorId
  const resolutionNote =
    body.resolutionNote !== undefined ? body.resolutionNote?.trim() || null : report.resolutionNote

  const updated = await ctx.store.updateSafetyReport(report.id, {
    status,
    assignedModeratorId,
    resolutionNote
  })
  if (!updated) {
    return error(ctx.corsOrigin, 404, "Safety report not found.")
  }

  return json(ctx.corsOrigin, 200, updated)
}

export async function handleCreateSafetyAppeal(
  request: Request,
  reportId: string,
  ctx: RouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const report = await ctx.store.getSafetyReportById(reportId)
  if (!report) {
    return error(ctx.corsOrigin, 404, "Safety report not found.")
  }

  const body = await readJson<CreateSafetyAppealRequest>(request)
  if (!body) {
    return error(ctx.corsOrigin, 400, "Invalid JSON body.")
  }

  const message = body.body?.trim()
  if (!message) {
    return error(ctx.corsOrigin, 400, "body is required.")
  }

  if (message.length > 2000) {
    return error(ctx.corsOrigin, 400, "body exceeds 2000 characters.")
  }

  try {
    const created = await ctx.store.createSafetyAppeal(report.id, user.id, message)
    return json(ctx.corsOrigin, 201, created)
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes("open appeal")) {
      return error(ctx.corsOrigin, 409, cause.message)
    }
    return error(ctx.corsOrigin, 400, "Unable to create appeal.")
  }
}

export async function handleListSafetyAppeals(request: Request, ctx: RouteContext): Promise<Response> {
  const url = new URL(request.url)
  const reportId = url.searchParams.get("reportId")?.trim() || null
  const statusRaw = url.searchParams.get("status")
  const status = parseSafetyAppealStatus(statusRaw)
  if (statusRaw && !status) {
    return error(ctx.corsOrigin, 400, "status must be one of: open, accepted, rejected.")
  }

  if (!reportId) {
    const adminCheck = requireAdminAccess(request, ctx.corsOrigin)
    if (adminCheck) {
      return adminCheck
    }
  } else {
    const report = await ctx.store.getSafetyReportById(reportId)
    if (!report) {
      return error(ctx.corsOrigin, 404, "Safety report not found.")
    }

    const access = await requireReviewerAccess(request, report.serverId, ctx)
    if (access instanceof Response) {
      return access
    }
  }

  const appeals = await ctx.store.listSafetyAppeals({
    reportId,
    status,
    limit: parseLimit(request)
  })
  return json(ctx.corsOrigin, 200, appeals)
}

export async function handleUpdateSafetyAppeal(
  request: Request,
  appealId: string,
  ctx: RouteContext
): Promise<Response> {
  const appeal = await ctx.store.getSafetyAppealById(appealId)
  if (!appeal) {
    return error(ctx.corsOrigin, 404, "Safety appeal not found.")
  }

  const report = await ctx.store.getSafetyReportById(appeal.reportId)
  if (!report) {
    return error(ctx.corsOrigin, 404, "Safety report not found.")
  }

  const access = await requireReviewerAccess(request, report.serverId, ctx)
  if (access instanceof Response) {
    return access
  }

  const body = await readJson<UpdateSafetyAppealRequest>(request)
  if (!body) {
    return error(ctx.corsOrigin, 400, "Invalid JSON body.")
  }

  const status = body.status ?? appeal.status
  if (!parseSafetyAppealStatus(status)) {
    return error(ctx.corsOrigin, 400, "status must be one of: open, accepted, rejected.")
  }

  const reviewerUserId =
    body.reviewerUserId !== undefined ? body.reviewerUserId : access.userId ?? appeal.reviewerUserId
  const resolutionNote =
    body.resolutionNote !== undefined ? body.resolutionNote?.trim() || null : appeal.resolutionNote

  const updated = await ctx.store.updateSafetyAppeal(appeal.id, {
    status,
    reviewerUserId,
    resolutionNote
  })
  if (!updated) {
    return error(ctx.corsOrigin, 404, "Safety appeal not found.")
  }

  return json(ctx.corsOrigin, 200, updated)
}
