-- Contact Support flow: AI-triaged support cases with human handoff, plus
-- the real per-admin login foundation the new admin console needs (today's
-- admin panel is a single shared password with zero server-side identity
-- check — see AdminVerifications.tsx). This migration adds that identity
-- layer and the support-case schema together since the new admin console
-- can't be safely gated without it.

-- ── Admin identity ──────────────────────────────────────────────────────
-- The one deliberate exception to this app's "FOR ALL USING(true)" RLS
-- convention: password hashes must never be readable via the anon key.
-- RLS is enabled with NO permissive policy, so only the service-role key
-- (used inside edge functions) can ever touch this table.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.admin_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role          text NOT NULL CHECK (role IN ('super_admin','support_agent')),
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
-- No policy created — default-deny for anon/authenticated. Service role bypasses RLS entirely.

-- Seed the existing admin with the already-known shared password as the
-- initial value — change it after this migration is applied.
INSERT INTO public.admin_users (name, password_hash, role)
VALUES ('Gabriel Ngongo', crypt('filmons2024', gen_salt('bf')), 'super_admin')
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_admin_verify_login(p_name text, p_password text)
RETURNS TABLE(id uuid, name text, role text) AS $$
  SELECT a.id, a.name, a.role
  FROM public.admin_users a
  WHERE a.name = p_name AND a.active AND a.password_hash = crypt(p_password, a.password_hash);
$$ LANGUAGE sql SECURITY DEFINER;

-- ── Centralized support contact ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_contact (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  role       text NOT NULL,
  email      text NOT NULL,
  phone      text NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.support_contact ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "support_contact_all" ON public.support_contact;
CREATE POLICY "support_contact_all" ON public.support_contact FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.support_contact (name, role, email, phone, active)
SELECT 'Gabriel Ngongo', 'Filmons Support', 'capominimanimoys@gmail.com', '+12369798647', true
WHERE NOT EXISTS (SELECT 1 FROM public.support_contact);

-- ── Support cases ────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.support_case_seq START 10001;

CREATE TABLE IF NOT EXISTS public.support_cases (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number                 text NOT NULL UNIQUE DEFAULT ('FS-' || nextval('public.support_case_seq')),
  user_id                     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category                    text NOT NULL,
  subcategory                 text,
  subject                     text NOT NULL,
  status                      text NOT NULL DEFAULT 'waiting_for_agent'
    CHECK (status IN ('open','waiting_for_agent','in_review','waiting_for_customer','resolved','closed')),
  priority                    text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  related_order_id             text,
  related_listing_id           text,
  related_wallet_transaction_id uuid,
  related_payout_request_id    uuid,
  related_verification_id      uuid,
  ai_summary                  text,
  assigned_admin_id           uuid,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  resolved_at                 timestamptz,
  closed_at                   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_support_cases_user ON public.support_cases(user_id);
CREATE INDEX IF NOT EXISTS idx_support_cases_status ON public.support_cases(status);

ALTER TABLE public.support_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "support_cases_all" ON public.support_cases;
CREATE POLICY "support_cases_all" ON public.support_cases FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         uuid NOT NULL REFERENCES public.support_cases(id) ON DELETE CASCADE,
  sender_type     text NOT NULL CHECK (sender_type IN ('user','ai','agent','system')),
  sender_id       uuid,
  sender_name     text,
  content         text NOT NULL,
  attachments     jsonb NOT NULL DEFAULT '[]',
  is_internal_note boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_messages_case ON public.support_messages(case_id);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "support_messages_all" ON public.support_messages;
CREATE POLICY "support_messages_all" ON public.support_messages FOR ALL USING (true) WITH CHECK (true);

-- ── Support attachments bucket ──────────────────────────────────────────
-- Private, path-only refs, signed URL on demand — same pattern as
-- verification-documents/rental-verification (see lib/upload.ts).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'support-attachments', 'support-attachments', false,
  10 * 1024 * 1024,
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "support_attachments_all" ON storage.objects;
CREATE POLICY "support_attachments_all" ON storage.objects
  FOR ALL
  USING (bucket_id = 'support-attachments')
  WITH CHECK (bucket_id = 'support-attachments');
