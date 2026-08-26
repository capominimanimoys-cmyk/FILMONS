// Reusable EmailJS senders for the opportunity-application lifecycle (new
// application / shortlisted / accepted / declined) and withdrawal-received
// -- kept out of manage-application/submit-opportunity-application/
// request-payout so the email copy lives in exactly one place instead of
// being re-typed at every call site.
//
// Each sends through its own dedicated EmailJS template (see the matching
// application-*-template.html / withdrawal-received-template.html files in
// src/app/templates/) rather than a client-side @emailjs/browser
// integration -- every other email in Filmons is already sent server-side
// with the accessToken/private-key pattern (see EMAILJS_PRIVATE_KEY usage
// across this directory) so the send survives bulk/background actions, not
// just a live browser tab. Each dashboard template's "To Email" field must
// be set to {{to_email}} or EmailJS silently drops the send.
const EMAILJS_SERVICE_ID = 'service_s6wwjtj';
const EMAILJS_PUBLIC_KEY = 'iSSpIM-AeV9uUQ7Jt';
const EMAILJS_PRIVATE_KEY = Deno.env.get('EMAILJS_PRIVATE_KEY') || '';

async function sendEmailJsRaw(toEmail: string | null | undefined, templateId: string, params: Record<string, unknown>) {
  if (!toEmail) return;
  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID, template_id: templateId,
        user_id: EMAILJS_PUBLIC_KEY, accessToken: EMAILJS_PRIVATE_KEY,
        template_params: { to_email: toEmail, ...params },
      }),
    });
    if (!res.ok) console.warn('EmailJS send failed:', templateId, res.status, await res.text());
  } catch (e) {
    console.warn('EmailJS send threw:', templateId, e);
  }
}

// Dedicated templates, all four now created in the EmailJS dashboard
// from the application-*-template.html files in src/app/templates/.
const TEMPLATE_APPLICATION_ACCEPTED    = 'template_x7fran3';
const TEMPLATE_APPLICATION_DECLINED    = 'template_0zy19qc';
const TEMPLATE_APPLICATION_RECEIVED    = 'template_cwvzs4w';
const TEMPLATE_APPLICATION_SHORTLISTED = 'template_uyzvbcd';
const TEMPLATE_WITHDRAWAL_RECEIVED     = 'template_ayhphv9';
const TEMPLATE_NEW_MESSAGE             = 'template_d5zpvid';
const TEMPLATE_NEW_FOLLOWER            = 'template_z3vit7l';
const TEMPLATE_MESSAGE_REQUEST         = 'template_tun19ep';

export function sendOpportunityDeclinedEmail(p: {
  toEmail: string | null | undefined; toName?: string | null; opportunityTitle: string;
}) {
  return sendEmailJsRaw(p.toEmail, TEMPLATE_APPLICATION_DECLINED, {
    to_name: p.toName || 'there',
    opportunity_title: p.opportunityTitle,
    application_url: 'https://filmons.app/',
  });
}

export function sendNewApplicationEmail(p: {
  toEmail: string | null | undefined; toName?: string | null;
  opportunityTitle: string; applicantName: string; applicationUrl?: string;
}) {
  return sendEmailJsRaw(p.toEmail, TEMPLATE_APPLICATION_RECEIVED, {
    to_name: p.toName || 'there',
    opportunity_title: p.opportunityTitle,
    applicant_name: p.applicantName,
    application_url: p.applicationUrl || 'https://filmons.app/inbox',
  });
}

export function sendApplicationShortlistedEmail(p: {
  toEmail: string | null | undefined; toName?: string | null; opportunityTitle: string; applicationUrl?: string;
}) {
  return sendEmailJsRaw(p.toEmail, TEMPLATE_APPLICATION_SHORTLISTED, {
    to_name: p.toName || 'there',
    opportunity_title: p.opportunityTitle,
    application_url: p.applicationUrl || 'https://filmons.app/inbox',
  });
}

export function sendApplicationAcceptedEmail(p: {
  toEmail: string | null | undefined; toName?: string | null; opportunityTitle: string;
  ownerName?: string | null; applicationUrl?: string;
}) {
  return sendEmailJsRaw(p.toEmail, TEMPLATE_APPLICATION_ACCEPTED, {
    to_name: p.toName || 'there',
    opportunity_title: p.opportunityTitle,
    owner_name: p.ownerName || 'the opportunity owner',
    application_url: p.applicationUrl || 'https://filmons.app/inbox',
  });
}

export type MessageKind = 'direct' | 'request' | 'booking_inquiry' | 'rental_inquiry' | 'marketplace' | 'collaboration';

function buildMessageSubject(senderName: string, kind: MessageKind, listingTitle?: string | null): string {
  switch (kind) {
    case 'request':         return `New message request from ${senderName}`;
    case 'booking_inquiry':  return listingTitle ? `New booking inquiry for ${listingTitle}` : `New booking inquiry from ${senderName}`;
    case 'rental_inquiry':   return listingTitle ? `New rental inquiry for ${listingTitle}` : `New rental inquiry from ${senderName} on Filmons`;
    case 'marketplace':      return listingTitle ? `Someone messaged you about ${listingTitle}` : `New marketplace message from ${senderName}`;
    case 'collaboration':    return `New collaboration request from ${senderName}`;
    default:                 return `New message from ${senderName} on Filmons`;
  }
}

export function sendNewMessageEmail(p: {
  toEmail: string | null | undefined; toName?: string | null;
  fromName: string; messagePreview: string; conversationId: string;
  kind?: MessageKind; listingTitle?: string | null;
}) {
  const templateId = p.kind === 'request' ? TEMPLATE_MESSAGE_REQUEST : TEMPLATE_NEW_MESSAGE;
  return sendEmailJsRaw(p.toEmail, templateId, {
    to_name: p.toName || 'there',
    from_name: p.fromName,
    subject: buildMessageSubject(p.fromName, p.kind || 'direct', p.listingTitle),
    message_preview: p.messagePreview,
    conversation_link: `https://filmons.app/inbox?conv=${p.conversationId}`,
    settings_url: 'https://filmons.app/settings/notifications',
  });
}

export function sendNewFollowerEmail(p: {
  toEmail: string | null | undefined; toName?: string | null;
  followerName: string; followerUsername?: string | null;
}) {
  const initial = (p.followerName || '?').trim().charAt(0).toUpperCase() || '?';
  return sendEmailJsRaw(p.toEmail, TEMPLATE_NEW_FOLLOWER, {
    to_name: p.toName || 'there',
    follower_name: p.followerName,
    follower_username: p.followerUsername || '',
    follower_initial: initial,
    follower_profile_url: p.followerUsername ? `https://filmons.app/${p.followerUsername}` : 'https://filmons.app/',
    settings_url: 'https://filmons.app/settings/notifications',
  });
}

export function sendWithdrawalReceivedEmail(p: {
  toEmail: string | null | undefined; toName?: string | null;
  amount: number; currency: string; withdrawalId: string;
  payoutMethod: string; payoutLast4?: string | null;
}) {
  const methodLine = p.payoutLast4 ? `${p.payoutMethod} •••• ${p.payoutLast4}` : p.payoutMethod;
  return sendEmailJsRaw(p.toEmail, TEMPLATE_WITHDRAWAL_RECEIVED, {
    to_name: p.toName || 'there',
    amount: p.amount.toFixed(2),
    currency: p.currency,
    withdrawal_id: p.withdrawalId,
    payout_method: methodLine,
    withdrawal_url: 'https://filmons.app/wallet',
  });
}
