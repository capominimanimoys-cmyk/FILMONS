-- Paid Opportunity earnings are released ONLY when the paying client
-- approves the submitted work. Until then the applicant's earning stays
-- pending in their FILMONS wallet, however long that takes — no automatic
-- approval after auto_release_days.
--
-- With auto_approval_enabled = false, fn_auto_release_opportunity_payments
-- returns immediately (releases nothing), and fn_opportunity_approval_
-- reminders keeps reminding the client every approval_reminder_hours
-- without ever promising an automatic release (auto_release_at is NULL).
-- fn_release_pending_earnings already refuses to release an
-- opportunity_earning row whose work isn't approved (20240610000000).
ALTER TABLE public.opportunity_payment_config ALTER COLUMN auto_approval_enabled SET DEFAULT false;
UPDATE public.opportunity_payment_config SET auto_approval_enabled = false WHERE auto_approval_enabled;
