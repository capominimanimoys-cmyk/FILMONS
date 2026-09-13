-- Generic content-report table -- no report/flag infrastructure existed
-- anywhere in this app before this (verified: no `reports` table, no
-- report_reason/reported_by columns on any existing table). Backs the new
-- "Report" action in the Home -> Portfolio feed's card menu. Polymorphic
-- (target_type + target_id) rather than a portfolio-specific table, the
-- same shape as the existing `favorites` table (item_type + item_id) this
-- app already reuses across posts/listings/portfolio saves, so this can be
-- reused for other content types later without a new table each time.
--
-- Same permissive USING (true) RLS pattern as every other table in this
-- app (see project_auth_model -- auth.uid() is always null here, so a real
-- auth.uid()-based policy could never pass; ownership/validity is enforced
-- in application code instead). Reads are intentionally NOT exposed to
-- ordinary users beyond their own reports -- there is no admin/moderation
-- UI reading this table yet; this migration only adds the ability to
-- create a report, not to review one.
CREATE TABLE IF NOT EXISTS public.content_reports (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  uuid        NOT NULL,
  target_type  text        NOT NULL,  -- 'portfolio_item' | 'portfolio_album' (extend as needed)
  target_id    uuid        NOT NULL,
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_reports_target_idx ON public.content_reports (target_type, target_id);
CREATE INDEX IF NOT EXISTS content_reports_reporter_idx ON public.content_reports (reporter_id);

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_reports_insert" ON public.content_reports FOR INSERT WITH CHECK (true);
CREATE POLICY "content_reports_select" ON public.content_reports FOR SELECT USING (true);
