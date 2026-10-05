-- Manual one-off: make gabrielngongo20@gmail.com a Professional account with
-- username "gabrielngongo". Run in the Supabase dashboard -> SQL Editor.
--
-- PREREQUISITE: Gabriel must have signed in with Google ONCE
-- (Continue with Google -> gabrielngongo20@gmail.com) so his profiles row
-- exists. This script updates that row; it cannot create the Google login.
--
-- Not committed as a migration on purpose -- it is a one-time data fix.

-- 1) PREVIEW: his profile (expect exactly 1 row) and anyone already using
--    the username (expect 0 rows, or only Gabriel's own row).
SELECT id, email, username, account_type, account_mode
FROM public.profiles
WHERE lower(email) = 'gabrielngongo20@gmail.com'
   OR lower(username) = 'gabrielngongo';

-- 2) APPLY. Only touches Gabriel's row, and refuses if another profile
--    already owns the username.
UPDATE public.profiles
SET username     = 'gabrielngongo',
    account_type = 'professional',
    account_mode = 'professional'
WHERE lower(email) = 'gabrielngongo20@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles o
    WHERE lower(o.username) = 'gabrielngongo'
      AND lower(o.email) <> 'gabrielngongo20@gmail.com'
  );

-- 3) VERIFY: should show username gabrielngongo / professional.
SELECT id, email, username, account_type, account_mode
FROM public.profiles
WHERE lower(email) = 'gabrielngongo20@gmail.com';
