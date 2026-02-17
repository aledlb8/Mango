ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS forum_threads (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  parent_channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  thread_channel_id TEXT NOT NULL UNIQUE REFERENCES channels(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_forum_threads_parent_channel_updated_at
  ON forum_threads (parent_channel_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_forum_threads_server_id
  ON forum_threads (server_id);

CREATE TABLE IF NOT EXISTS channel_webhooks (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  token_hint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_channel_webhooks_channel_id
  ON channel_webhooks (channel_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_channel_webhooks_token_hash
  ON channel_webhooks (token_hash);

CREATE TABLE IF NOT EXISTS server_bots (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  token_hint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_server_bots_server_id
  ON server_bots (server_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_server_bots_token_hash
  ON server_bots (token_hash);

CREATE TABLE IF NOT EXISTS safety_reports (
  id TEXT PRIMARY KEY,
  server_id TEXT REFERENCES servers(id) ON DELETE SET NULL,
  reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('message', 'user', 'channel', 'server')),
  target_id TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'resolved', 'dismissed')),
  assigned_moderator_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_safety_reports_server_status_created_at
  ON safety_reports (server_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_safety_reports_status_created_at
  ON safety_reports (status, created_at DESC);

CREATE TABLE IF NOT EXISTS safety_appeals (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES safety_reports(id) ON DELETE CASCADE,
  appellant_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'rejected')),
  reviewer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_safety_appeals_report_status_created_at
  ON safety_appeals (report_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_safety_appeals_status_created_at
  ON safety_appeals (status, created_at DESC);
