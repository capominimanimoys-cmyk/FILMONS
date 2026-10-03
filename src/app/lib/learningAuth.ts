// FILMONS Learning sign-in plumbing (see pages/LearningLogin.tsx and
// pages/LearningSignup.tsx). Learning has NO separate account system --
// every path here signs into the one shared FILMONS account, reusing the
// main app's own flows wherever a step already exists there (OAuth
// callback + Google account linking, email verification, onboarding,
// new-device verification). Those steps live in the main bundle, so the
// Learning destination is carried through them as a pending return URL
// (see authReturnUrl.ts) in its main-app form ('/learning/course/xyz'),
// and the main router's /learning/* route (see LearningReturn in
// routes.tsx) turns the final client-side navigate() into a real page
// load of the Learning bundle.
import { supabase } from '../../lib/supabase';
import { getOAuthRedirectUrl } from './appUrl';
import { setPendingReturnUrl } from './authReturnUrl';
import { buildHandoffUrl } from '../context/AuthContext';

// Learning-router-relative paths (see learningRoutes.tsx's basename note).
export const LEARNING_LOGIN_PATH  = '/login';
export const LEARNING_SIGNUP_PATH = '/signup';
const LEARNING_AUTH_PATHS = [LEARNING_LOGIN_PATH, LEARNING_SIGNUP_PATH];

// Marks "a Learning sign-in is in progress in this tab" while it runs
// through FILMONS pages, so LearningSessionContext starts the Learning
// session when the person lands back in Learning. Expires so an
// abandoned attempt can't sign a later FILMONS session into Learning.
const SIGN_IN_HANDOFF_KEY = 'filmons_learning_signin';
const SIGN_IN_HANDOFF_TTL_MS = 60 * 60 * 1000;

function markLearningSignInHandoff() {
  try { sessionStorage.setItem(SIGN_IN_HANDOFF_KEY, String(Date.now())); } catch {}
}

export function consumeLearningSignInHandoff(): boolean {
  try {
    const at = Number(sessionStorage.getItem(SIGN_IN_HANDOFF_KEY));
    sessionStorage.removeItem(SIGN_IN_HANDOFF_KEY);
    return !!at && Date.now() - at < SIGN_IN_HANDOFF_TTL_MS;
  } catch { return false; }
}

const CANONICAL_LEARNING_ORIGIN = 'https://filmons.app/learning';
const EXPECTED_EMAIL_KEY = 'fm_expected_login_email'; // read by OAuthCallback.tsx

/** The Learning-relative destination after auth, from `?returnTo=` --
 *  only a same-bundle relative path is accepted (open-redirect guard),
 *  and never an auth page itself. Defaults to Learning home. */
export function resolveLearningReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  const pathOnly = raw.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  if (LEARNING_AUTH_PATHS.includes(pathOnly)) return '/';
  return raw;
}

/** '/course/xyz' -> '/learning/course/xyz' (its address on filmons.app). */
export function toFilmonsLearningPath(learningPath: string): string {
  return learningPath === '/' ? '/learning' : `/learning${learningPath}`;
}

/** Learning-relative link to the sign-in page that comes back to `returnTo`. */
export function learningLoginPath(returnTo?: string, extra?: Record<string, string>): string {
  const params = new URLSearchParams(extra);
  if (returnTo && returnTo !== '/') params.set('returnTo', returnTo);
  const qs = params.toString();
  return qs ? `${LEARNING_LOGIN_PATH}?${qs}` : LEARNING_LOGIN_PATH;
}

export function learningSignupPath(returnTo?: string): string {
  return returnTo && returnTo !== '/'
    ? `${LEARNING_SIGNUP_PATH}?returnTo=${encodeURIComponent(returnTo)}`
    : LEARNING_SIGNUP_PATH;
}

/** Hands the rest of the flow to a main-app auth page on this same
 *  origin (OAuth callback, /verify-email, /verify-device, /onboarding,
 *  /login, /forgot-password), remembering where in Learning to land
 *  once it finishes. */
export function continueInFilmons(mainAppPath: string, learningReturnTo: string) {
  setPendingReturnUrl(toFilmonsLearningPath(learningReturnTo));
  markLearningSignInHandoff();
  window.location.assign(mainAppPath);
}

/** Google sign-in / sign-up. The OAuth callback is the main app's
 *  /auth/callback, which already resolves existing accounts, refuses to
 *  auto-link a Google identity onto an existing email account without
 *  an emailed-code verification, and routes brand-new users through
 *  /google-signup -> /onboarding -- all of which then honor the pending
 *  return URL set here. */
export async function startLearningGoogleAuth(learningReturnTo: string, expectedEmail?: string): Promise<string | null> {
  setPendingReturnUrl(toFilmonsLearningPath(learningReturnTo));
  markLearningSignInHandoff();
  try {
    if (expectedEmail) sessionStorage.setItem(EXPECTED_EMAIL_KEY, expectedEmail.toLowerCase());
    else sessionStorage.removeItem(EXPECTED_EMAIL_KEY);
  } catch {}
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: getOAuthRedirectUrl(), queryParams: { prompt: 'select_account' } },
  });
  return error ? error.message : null;
}

/** The Learning sign-in pages live canonically at filmons.app/learning/*
 *  -- the auth steps they hand off to (OAuth callback, verification,
 *  onboarding) are main-app pages that share sessionStorage with them
 *  only on that origin. On learning.filmons.app this redirects there
 *  (carrying any existing session) and returns true. */
export function redirectToCanonicalLearningAuth(): boolean {
  if (typeof window === 'undefined' || window.location.hostname !== 'learning.filmons.app') return false;
  const { pathname, search } = window.location;
  window.location.replace(buildHandoffUrl(`${CANONICAL_LEARNING_ORIGIN}${pathname}${search}`));
  return true;
}
