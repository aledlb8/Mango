ALTER TABLE servers
  ADD COLUMN IF NOT EXISTS is_direct_thread_backing BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS is_direct_thread_backing BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS direct_threads (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL UNIQUE REFERENCES channels(id) ON DELETE CASCADE,
  server_id TEXT NOT NULL UNIQUE REFERENCES servers(id) ON DELETE CASCADE,
  thread_type TEXT NOT NULL CHECK (thread_type IN ('dm', 'group')),
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  dm_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_direct_threads_owner_id
  ON direct_threads (owner_id);

CREATE TABLE IF NOT EXISTS direct_thread_participants (
  thread_id TEXT NOT NULL REFERENCES direct_threads(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (thread_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_direct_thread_participants_user_id
  ON direct_thread_participants (user_id);

CREATE TABLE IF NOT EXISTS message_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  url TEXT NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_attachments_message_id
  ON message_attachments (message_id);

CREATE TABLE IF NOT EXISTS read_markers (
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);
