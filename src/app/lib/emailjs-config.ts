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
    verificationSubmission: 'template_ryty7se',
    adminNotification:      'template_rd3nhik',
    rentalAgreement:        'template_synqixt',
    welcome:                'template_welcome',
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
    // Always the real production domain, never window.location.origin —
    // this email must send users to filmons.app even when triggered from
    // a dev/preview/staging environment, matching every other email in
    // this app (all hardcode https://filmons.app/... rather than deriving
    // it from wherever the code happened to run).
    site_url: 'https://filmons.app',
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
