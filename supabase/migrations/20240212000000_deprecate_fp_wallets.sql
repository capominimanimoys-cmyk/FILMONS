-- Removing the old FP (Filmons Points) system from the app. `fp_wallets` was
-- never created by a tracked migration (dashboard-created, same pattern as
-- other undocumented objects in this project) and is FP-exclusive — nothing
-- non-FP reads or writes it. Per instruction not to drop DB objects blindly,
-- this renames it rather than dropping it: data is preserved and the table
-- becomes inert (nothing in the app references the new name), so it can be
-- safely reviewed and actually dropped later once confirmed unneeded.
--
-- `transactions` and `notifications` are NOT touched here — both are shared
-- with real cash-order flows / the general notification system and must
-- stay. Only the app-side code that wrote FP-purpose rows into them was
-- removed; any historical fp_purchase-type rows are left in place, simply
-- no longer written to or read by the UI.
ALTER TABLE IF EXISTS public.fp_wallets RENAME TO deprecated_fp_wallets;

COMMENT ON TABLE public.deprecated_fp_wallets IS
  'Deprecated with the old FP system removal. Data preserved, no longer read/written by the app.';
