-- ─────────────────────────────────────────────────────────────────────────────
-- ai_editor_tables.sql
-- Tables for tracking AI edit jobs and post version history.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. ai_edit_jobs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_edit_jobs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      uuid        REFERENCES posts(id) ON DELETE CASCADE,
  user_id      uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt       text        NOT NULL,
  intent       text,
  operation    text,
  engine       text,
  status       text        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','processing','done','failed','rejected')),
  original_url text,
  preview_url  text,
  result_url   text,
  validation   jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_edit_jobs_user_id_idx  ON ai_edit_jobs (user_id);
CREATE INDEX IF NOT EXISTS ai_edit_jobs_post_id_idx  ON ai_edit_jobs (post_id);
CREATE INDEX IF NOT EXISTS ai_edit_jobs_status_idx   ON ai_edit_jobs (status);

ALTER TABLE ai_edit_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own jobs"
  ON ai_edit_jobs FOR ALL
  USING (auth.uid() = user_id);

-- ── 2. post_versions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_versions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id        uuid        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version_number int         NOT NULL DEFAULT 1,
  media_url      text        NOT NULL,
  edit_job_id    uuid        REFERENCES ai_edit_jobs(id),
  is_original    boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, version_number)
);

CREATE INDEX IF NOT EXISTS post_versions_post_id_idx ON post_versions (post_id);

ALTER TABLE post_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own versions"
  ON post_versions FOR ALL
  USING (auth.uid() = user_id);
