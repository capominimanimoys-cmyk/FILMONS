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
    site_url: window.location.origin,
  });

export const sendPasswordResetEmail = (email: string, name: string, resetLink: string) =>
  sendEmail(EMAILJS_CONFIG.templates.passwordReset, {
    to_email: email, to_name: name, user_name: name, reset_link: resetLink,
  });
