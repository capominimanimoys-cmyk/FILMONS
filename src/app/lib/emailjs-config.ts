import { send as ejsSend, init as ejsInit } from '@emailjs/browser';

// ── Config ────────────────────────────────────────────────────────────────────
const SERVICE_ID = 'service_s6wwjtj';
const PUBLIC_KEY = 'iSSpIM-AeV9uUQ7Jt';

ejsInit({ publicKey: PUBLIC_KEY });

// Keep EMAILJS_CONFIG export so other files that import it don't break
export const EMAILJS_CONFIG = {
  serviceId: SERVICE_ID,
  publicKey:  PUBLIC_KEY,
  templates: {
    emailVerification:      'template_p5pgn33',
    // ⚠️ template_ryty7se used to be the identity-verification decision
    // email (AdminVerifications.tsx). That dashboard template's content
    // must be moved to a NEW template created with this placeholder ID
    // before this repoint goes live, or approve/reject/changes-requested
    // emails will send the wrong content. See src/app/templates/ for the
    // decision-email copy previously sent through template_ryty7se.
    verificationSubmission: 'template_verification_decision',
    adminNotification:      'template_rd3nhik',
    rentalAgreement:        'template_synqixt',
    // Repointed (was the placeholder template_welcome) to the real,
    // already-in-use template_ryty7se — see src/app/templates/
    // welcome-email-template.html for the content to put in that
    // dashboard template. Merge fields: user_name, to_email, signup_date,
    // site_url.
    welcome:                'template_ryty7se',
    passwordReset:          'template_password_reset',
    messageNotification:    'template_d5zpvid',
    // ⚠️ Not yet created in the EmailJS dashboard — new-device sign-in
    // emails will silently fail (sendEmail() swallows the error) until a
    // template with this exact ID exists there, with these merge fields:
    // to_email, to_name, device, location, ip_address, sign_in_method, date,
    // secure_account_url.
    newDeviceSignIn:        'template_new_device_signin',
    // ⚠️ Not yet created in the EmailJS dashboard — payout method
    // added/changed emails will silently fail (sendEmail() swallows the
    // error) until a template with this exact ID exists there, with these
    // merge fields: to_email, to_name, last4, device, location, date,
    // secure_account_url.
    payoutMethodChanged:    'template_payout_method_changed',
    // "Welcome back" login-notification email — sent only on an explicit
    // sign-in action (see registerDevice's signInMethod comment in
    // devicesApi.ts), never on a session/token refresh. See
    // src/app/templates/welcome-back-template.html. Merge fields:
    // to_email, to_name, sign_in_method, date, site_url.
    welcomeBack:            'template_0ocwe54',
    // "Google account linked" confirmation — sent after the email-OTP
    // linking flow in OAuthCallback.tsx succeeds. See
    // src/app/templates/google-account-linked-template.html. Merge
    // fields: to_email, to_name, google_email, date, secure_account_url.
    googleAccountLinked:    'template_evah1t1',
  },
  filmons: {
    email:    'filmons481@gmail.com',
    teamName: 'Filmons Team',
  },
};

// ── Helper ────────────────────────────────────────────────────────────────────
export const sendEmail = async (
  templateId: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; message?: string }> => {
  console.log('[EmailJS] sending', { templateId, to: params.to_email });

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('EmailJS timeout — no response after 12 s')), 12_000)
  );

  try {
    const res = await Promise.race([
      ejsSend(SERVICE_ID, templateId, params),
      timeout,
    ]);
    console.log('[EmailJS] OK', res.status, res.text);
    return { success: true };
  } catch (err: unknown) {
    const e = err as { status?: number; text?: string; message?: string } | null;
    const status  = e?.status  ?? 0;
    const message = e?.text    || e?.message || String(err);
    console.error('[EmailJS] FAILED', status, message, { templateId, to: params.to_email });
    return {
      success: false,
      message: `${status ? `[${status}] ` : ''}${message}`,
    };
  }
};

// ── Convenience wrappers ──────────────────────────────────────────────────────
export const sendWelcomeEmail = (email: string, name: string) =>
  sendEmail(EMAILJS_CONFIG.templates.welcome, {
    to_email: email, to_name: name, user_name: name,
    signup_date: new Date().toLocaleString('en-CA', { dateStyle: 'long', timeStyle: 'short' }),
    // Always the real production domain, never window.location.origin —
    // this email must send users to filmons.app even when triggered from
    // a dev/preview/staging environment, matching every other email in
    // this app (all hardcode https://filmons.app/... rather than deriving
    // it from wherever the code happened to run).
    site_url: 'https://filmons.app',
  });

// Sent only on an explicit sign-in action (email/password, phone OTP,
// Google/Apple) — never on a cached-session/token refresh. See the
// signInMethod comment on registerDevice() in devicesApi.ts for why those
// two are kept strictly separate.
export const sendWelcomeBackEmail = (email: string, name: string, signInMethod: string) =>
  sendEmail(EMAILJS_CONFIG.templates.welcomeBack, {
    to_email: email, to_name: name, user_name: name,
    sign_in_method: signInMethod,
    date: new Date().toLocaleString('en-CA', { dateStyle: 'long', timeStyle: 'short' }),
    site_url: 'https://filmons.app',
  });

// Security email, not a disable-able marketing notification — sent after
// the OAuthCallback.tsx email-OTP linking flow succeeds.
export const sendGoogleAccountLinkedEmail = (email: string, name: string, googleEmail: string) =>
  sendEmail(EMAILJS_CONFIG.templates.googleAccountLinked, {
    to_email: email, to_name: name, user_name: name, google_email: googleEmail,
    date: new Date().toLocaleString('en-CA', { dateStyle: 'long', timeStyle: 'short' }),
    secure_account_url: `${window.location.origin}/settings/security`,
  });

export const sendPasswordResetEmail = (email: string, name: string, resetLink: string) =>
  sendEmail(EMAILJS_CONFIG.templates.passwordReset, {
    to_email: email, to_name: name, user_name: name, reset_link: resetLink,
  });

export const sendNewDeviceSignInEmail = (email: string, name: string, info: {
  device: string; location: string; ipAddress: string; signInMethod: string; date: string;
}) =>
  sendEmail(EMAILJS_CONFIG.templates.newDeviceSignIn, {
    to_email: email, to_name: name, user_name: name,
    device: info.device, location: info.location, ip_address: info.ipAddress,
    sign_in_method: info.signInMethod, date: info.date,
    secure_account_url: `${window.location.origin}/settings/security`,
  });

// Security email — must not be treated as a disable-able marketing
// notification. Same "not yet created in EmailJS dashboard" caveat as
// newDeviceSignIn until template_payout_method_changed is created there.
export const sendPayoutMethodChangedEmail = (email: string, name: string, info: {
  last4: string; device: string; location: string;
}) =>
  sendEmail(EMAILJS_CONFIG.templates.payoutMethodChanged, {
    to_email: email, to_name: name, user_name: name,
    last4: info.last4, device: info.device, location: info.location,
    date: new Date().toLocaleString('en-CA', { dateStyle: 'long', timeStyle: 'short' }),
    secure_account_url: `${window.location.origin}/settings/security`,
  });
