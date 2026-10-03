// Step 1 of the email signup flow, shared by the main Create Account page
// and FILMONS Learning's signup page -- both create the SAME kind of
// FILMONS account (one shared account system), so they must run the
// exact same duplicate-account checks and send the same verification
// code. The caller then sends the user to /verify-email, which reads the
// pending signup stashed here and creates the profile once the code
// checks out.
import { EMAILJS_CONFIG, sendEmail } from './emailjs-config';
import { supabase } from '../../lib/supabase';
import { authApi } from './api';

export const PENDING_SIGNUP_KEY = 'filmons_pending_signup';

// Password policy for every email signup path.
export const PW_RULES = [
  { id: 'len',     label: 'At least 8 characters',         test: (p: string) => p.length >= 8 },
  { id: 'upper',   label: 'At least one uppercase letter',  test: (p: string) => /[A-Z]/.test(p) },
  { id: 'lower',   label: 'At least one lowercase letter',  test: (p: string) => /[a-z]/.test(p) },
  { id: 'num',     label: 'At least one number',            test: (p: string) => /[0-9]/.test(p) },
  { id: 'special', label: 'At least one special character', test: (p: string) => /[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>/?]/.test(p) },
  { id: 'space',   label: 'No spaces',                      test: (p: string) => p.length > 0 && !/\s/.test(p) },
];

export type StartEmailSignupResult =
  | { status: 'sent'; email: string }
  | { status: 'exists'; email: string; provider: 'google' | 'apple' | null }
  | { status: 'send_failed' };

function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function startEmailSignup(name: string, email: string, password: string): Promise<StartEmailSignupResult> {
  const normalEmail = email.trim().toLowerCase();

  const { data: existing } = await supabase
    .from('profiles')
    .select('id, profile_meta')
    .eq('email', normalEmail)
    .maybeSingle();

  if (existing) {
    // Detect the original signup provider from profile_meta (never guess)
    const meta     = existing.profile_meta as any;
    const provider = meta?.provider as string | undefined;
    return { status: 'exists', email: normalEmail, provider: provider === 'google' || provider === 'apple' ? provider : null };
  }

  // No profiles row -- but that alone doesn't mean the email is free.
  // A previous signup attempt can leave a real auth.users row with no
  // matching profile (e.g. the tab closed, or a network drop, between
  // supabase.auth.signUp() succeeding in VerifyEmail.tsx and the
  // profile insert that follows it). Without this check, that person
  // would sail through here, verify a brand new code, and only THEN
  // discover the problem when VerifyEmail's own auth.signUp() call
  // fails with "User already registered" -- a much more confusing
  // dead end than catching it here, before any code is even sent.
  // checkAuthMethods reads the real auth.users/identities record
  // (never guessed), same ground-truth check signin() already uses.
  const authCheck = await authApi.checkAuthMethods(normalEmail);
  if (authCheck.exists) {
    const provider = authCheck.providers.includes('google') ? 'google'
      : authCheck.providers.includes('apple') ? 'apple' : null;
    return { status: 'exists', email: normalEmail, provider };
  }

  const code      = genCode();
  const expiresAt = Date.now() + 10 * 60 * 1000;

  sessionStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify({
    name: name.trim(), email: normalEmail, password, code, expiresAt,
  }));

  const { success } = await sendEmail(EMAILJS_CONFIG.templates.emailVerification, {
    to_email:          normalEmail,
    to_name:           name.trim(),
    verification_code: code,
    user_email:        normalEmail,
    expires_in:        '10 minutes',
    subject:           'Verify your Filmons email',
  });

  return success ? { status: 'sent', email: normalEmail } : { status: 'send_failed' };
}
