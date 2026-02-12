# Mango Monorepo

Mango is a web-first real-time chat platform using a polyglot monorepo.

## Tooling Rules

- Bun is the runtime and package manager for all non-web TypeScript projects.
- `pnpm` is used only for the Next.js app in `apps/web`.
- Go services use `go work` from the repository root.
- Python worker uses `uv`.

## Repository Layout

- `apps/web` - Next.js + React + shadcn/ui + Tailwind CSS (web client)
- `services/*` - backend services (TypeScript and Go)
- `workers/*` - async/background workers
- `packages/*` - shared contracts/config
- `packages/chat-store` - shared in-memory/Postgres chat-domain store implementation
- `infra` - Docker Compose and local infrastructure configs
- `scripts` - Bun scripts for bootstrap/dev/lint/test orchestration

## Prerequisites

- Bun `>=1.3`
- Node.js `>=22` (required by Next.js tooling in `apps/web`)
- pnpm `>=10` (web app only)
- Go `>=1.25`
- Docker + Docker Compose
- uv (optional until moderation worker is active)

## Quick Start

1. Copy `.env.example` to `.env` if you need local overrides.
2. Run `bun run bootstrap`.
3. Run `bun run dev`.

That starts local infrastructure and all scaffolded services, including the web app.

If Docker is not installed yet, you can still run the vertical slice manually:

1. `bun run dev:lite`

Then open `http://localhost:3000`.

## Root Commands

- `bun run bootstrap` - installs dependencies and syncs workspaces
- `bun run dev` - starts local infrastructure and all services
- `bun run dev:lite` - starts identity + community + messaging + API gateway + web app (no Docker required)
- `bun run lint` - runs lint/type checks for all projects
- `bun run test` - runs tests for all projects

## Notes

- Web commands are intentionally delegated to `apps/web` via `pnpm --dir apps/web ...`.
- Non-web TypeScript services are workspace packages managed by Bun.
- LiveKit is included in local infra for voice signaling integration work.
- `api-gateway` delegates identity endpoints (`/v1/auth/*`, `/v1/me`, `/v1/users/*`, `/v1/friends`) to `identity-service` when `PREFER_IDENTITY_SERVICE_PROXY=true` (default).
- `api-gateway` delegates community endpoints (`/v1/servers/*`, `/v1/channels/:channelId/overwrites`, `/v1/invites/:code/join`) to `community-service` when `PREFER_COMMUNITY_SERVICE_PROXY=true` (default).
- `api-gateway` delegates messaging endpoints (`/v1/channels/:channelId/messages`, `/v1/messages/*`) to `messaging-service` when `PREFER_MESSAGING_SERVICE_PROXY=true` (default).
- realtime websocket fanout (`/v1/ws`) remains in `api-gateway`; when messaging is proxied, websocket events are published from proxied messaging responses.
- API gateway store modes:
- `STORE_MODE=postgres` (default): uses Postgres + runs SQL migrations at startup
- `STORE_MODE=memory`: in-memory fallback mode
- `ALLOW_MEMORY_FALLBACK=true` allows automatic fallback when Postgres is unavailable

## ADRs

- `docs/adr/0001-id-strategy.md`
- `docs/adr/0002-permission-model.md`
- `docs/adr/0003-store-fallback-policy.md`

## Vertical Slice Implemented

- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `GET /v1/me`
- `GET /v1/users/search?q=term`
- `GET /v1/friends`
- `POST /v1/friends`
- `POST /v1/servers`
- `GET /v1/servers`
- `POST /v1/invites/:code/join`
- `POST /v1/servers/:serverId/channels`
- `GET /v1/servers/:serverId/channels`
- `POST /v1/servers/:serverId/members`
- `GET /v1/servers/:serverId/members`
- `GET /v1/servers/:serverId/roles`
- `POST /v1/servers/:serverId/roles`
- `POST /v1/servers/:serverId/roles/assign`
- `POST /v1/servers/:serverId/invites`
- `POST /v1/channels/:channelId/messages`
- `GET /v1/channels/:channelId/messages`
- `PUT /v1/channels/:channelId/overwrites`
- `PATCH /v1/messages/:messageId`
- `DELETE /v1/messages/:messageId`
- `POST /v1/messages/:messageId/reactions`
- `DELETE /v1/messages/:messageId/reactions/:emoji`
- `GET /v1/ws?token=...` websocket endpoint for live channel events

The web app is now login-gated and chat-oriented:
- session token stored in browser cookie (`mango_token`)
- unique username + display name registration
- friend search and add
- join servers via invite code
- live conversation updates over websocket (`message.created`, `message.updated`, `message.deleted`, `reaction.updated`)