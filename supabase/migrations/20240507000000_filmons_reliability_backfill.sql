-- One-time backfill for the FILMONS Reliability Score system
-- (20240501000000_filmons_reliability_system.sql).
--
-- That migration's triggers only recalculate a user's score when a
-- QUALIFYING EVENT happens after the trigger exists (a new connection, a
-- new recommendation, a completed transaction, or an is_verified CHANGE
-- via `UPDATE OF is_verified`). Anyone who was already identity-verified
-- (or already had connections/recommendations/completed transactions)
-- BEFORE this system was installed never had fn_recalculate_filmons_
-- reliability() called for them at all -- their reputation_scores row
-- either doesn't exist yet or still holds the all-zero defaults, which is
-- why an already-verified account can show a 0 Trust Score with no
-- further action ever triggering a recalculation.
--
-- Safe to re-run: fn_recalculate_filmons_reliability() always recomputes
-- from the real source tables (professional_connections, recommendations,
-- hire_transactions, etc.), it doesn't accumulate or double-count.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.profiles LOOP
    PERFORM public.fn_recalculate_filmons_reliability(r.id);
  END LOOP;
END $$;
