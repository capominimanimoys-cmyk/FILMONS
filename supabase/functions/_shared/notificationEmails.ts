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
