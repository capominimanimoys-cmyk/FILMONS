-- Idempotency guard for transactional emails triggered from edge functions.
-- A row's mere existence means "already sent" -- callers try to INSERT the
-- event_key first and only send if the insert wins the unique constraint,
-- same one-shot-claim shape as payment_idempotency_keys
-- (20240216000000_wallet_ledger.sql), just for outbound email instead of
-- money movement. Keys are "{event_type}:{entity_id}", e.g.
-- "opportunity_declined:<application_id>" or
-- "withdrawal_received:<payout_request_id>" -- so a retried request,
-- realtime double-fire, or duplicate bulk_decline loop iteration can never
-- send the same notification email twice.
CREATE TABLE IF NOT EXISTS public.email_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key  text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- No policies -- this table is only ever touched by edge functions using
-- the service-role key, which bypasses RLS regardless. Leaving RLS on with
-- zero policies means anon/authenticated get no access at all by default.
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
