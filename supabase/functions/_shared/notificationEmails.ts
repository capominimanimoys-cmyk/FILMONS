// Reusable EmailJS senders for the opportunity-application lifecycle (new
// application / shortlisted / accepted / declined) and withdrawal-received
// -- kept out of manage-application/submit-opportunity-application/
// request-payout so the email copy lives in exactly one place instead of
// being re-typed at every call site.
//
// All of these go through the same generic subject/message template
// (template_rd3nhik) every other transactional email in this app already
// uses, rather than the two brand-new per-purpose templates a client-side
// EmailJS integration would need -- EmailJS templates can only be created
// by hand in their dashboard (no API for it), and every other email in
// Filmons is already sent server-side with the accessToken/private-key
// pattern (see EMAILJS_PRIVATE_KEY usage across this directory) so the
// send survives bulk/background actions, not just a live browser tab.
// If dedicated "opportunity_declined" / "withdrawal_received" templates
// get created in the EmailJS dashboard, swap TEMPLATE_GENERIC for their
// IDs here -- callers don't need to change.
const EMAILJS_SERVICE_ID = 'service_s6wwjtj';
const EMAILJS_PUBLIC_KEY = 'iSSpIM-AeV9uUQ7Jt';
const EMAILJS_PRIVATE_KEY = Deno.env.get('EMAILJS_PRIVATE_KEY') || '';
const TEMPLATE_GENERIC = 'template_rd3nhik';

async function sendEmailJsTemplate(toEmail: string | null | undefined, subject: string, message: string, toName?: string | null) {
  if (!toEmail) return;
  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID, template_id: TEMPLATE_GENERIC,
        user_id: EMAILJS_PUBLIC_KEY, accessToken: EMAILJS_PRIVATE_KEY,
        template_params: { to_email: toEmail, to_name: toName || 'there', subject, message },
      }),
    });
    if (!res.ok) console.warn('EmailJS send failed:', subject, res.status, await res.text());
  } catch (e) {
    console.warn('EmailJS send threw:', subject, e);
  }
}

// Low-level sender for dedicated per-purpose templates (as opposed to the
// shared subject/message TEMPLATE_GENERIC above) -- each such template has
// its own "To Email" field wired to {{to_email}} in the EmailJS dashboard
// (see application-*-template.html for the matching HTML source) and its
// own variable schema, so callers pass exactly the params that template
// expects instead of a generic subject/message pair.
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

// Dedicated templates, wired in as they're created in the EmailJS
// dashboard from the application-*-template.html files in
// src/app/templates/. Not yet created: shortlisted -- that still goes
// through TEMPLATE_GENERIC below.
const TEMPLATE_APPLICATION_ACCEPTED = 'template_x7fran3';
const TEMPLATE_APPLICATION_DECLINED = 'template_0zy19qc';
const TEMPLATE_APPLICATION_RECEIVED = 'template_cwvzs4w';

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
  toEmail: string | null | undefined; toName?: string | null; opportunityTitle: string;
}) {
  return sendEmailJsTemplate(
    p.toEmail,
    `You've been shortlisted for ${p.opportunityTitle}`,
    `Great news!\n\nYour application for ${p.opportunityTitle} has been shortlisted.\n\n` +
      `Your application is now being considered for the next stage. We'll notify you when the ` +
      `opportunity owner makes a final decision.\n\n` +
      `View Application:\nhttps://filmons.app/inbox`,
    p.toName,
  );
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
  return sendEmailJsTemplate(
    p.toEmail,
    'Your FILMONS withdrawal request has been received',
    `We've received your withdrawal request.\n\n` +
      `Withdrawal Amount: ${p.amount.toFixed(2)} ${p.currency}\n` +
      `Withdrawal ID: ${p.withdrawalId}\n` +
      `Payout Method: ${methodLine}\n` +
      `Status: Requested\n\n` +
      `Your withdrawal is now being reviewed and processed.\n\n` +
      `You can follow its status anytime from your FILMONS Wallet.\n\n` +
      `View Withdrawal:\nhttps://filmons.app/wallet\n\n` +
      `We'll notify you again when your payout status changes.`,
    p.toName,
  );
}
