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
// Rental/purchase-request emails -- all six now created in the EmailJS
// dashboard from the rental/purchase-request-*-template.html files above.
const TEMPLATE_RENTAL_REQUEST          = 'template_8r09h83';
const TEMPLATE_PURCHASE_REQUEST        = 'template_vrpaeuc';
const TEMPLATE_RENTAL_ACCEPTED         = 'template_ddbut3l';
const TEMPLATE_RENTAL_DECLINED         = 'template_ofpg4m7';
const TEMPLATE_PURCHASE_ACCEPTED       = 'template_cjv2gal';
const TEMPLATE_PURCHASE_DECLINED       = 'template_z4t6xak';
// All five now created in the EmailJS dashboard from the matching
// *-template.html files in src/app/templates/.
const TEMPLATE_LISTING_LIKED           = 'template_4ki361h';
const TEMPLATE_FOLLOWED_CREATOR_POSTED = 'template_qpz4d6q';
const TEMPLATE_LISTING_SUGGESTION      = 'template_dx3stud';
const TEMPLATE_SUPPORT_CASE_ADMIN      = 'template_g2g3fod';
const TEMPLATE_MESSAGE_REQUEST_ACCEPTED = 'template_nzfmrsm';
// Cash-out lifecycle -- placeholders until created in the EmailJS dashboard
// and the real template ids are swapped in (same process as every other
// template above: build the .html, wire the sender, then ask for the id).
const TEMPLATE_CASHOUT_REQUEST_ADMIN   = 'template_730vofa';
const TEMPLATE_CASHOUT_APPROVED        = 'template_afvgn6q';
const TEMPLATE_CASHOUT_SENT            = 'template_bqxis6g';
const TEMPLATE_CASHOUT_REJECTED        = 'template_in4wz0r';
const TEMPLATE_CASHOUT_FAILED          = 'template_o7wwsdk';
// Placeholder until created in the EmailJS dashboard from
// hire-request-received-template.html and the real id is swapped in.
const TEMPLATE_HIRE_REQUEST_RECEIVED   = 'template_6yqddjn';
// Automated Stripe payout lifecycle -- placeholders until created in the
// EmailJS dashboard from the payout-*-template.html files and the real ids
// are swapped in.
const TEMPLATE_PAYOUT_SENT             = 'template_nmo74ej';
const TEMPLATE_PAYOUT_FAILED           = 'template_amnhojo';
const TEMPLATE_PAYOUT_BANK_ATTENTION   = 'template_bfac8h2';
// Placeholders until created in the EmailJS dashboard from
// creator-liked-template.html / payout-method-updated-template.html.
const TEMPLATE_CREATOR_LIKED           = 'template_9jesf8j';
const TEMPLATE_PAYOUT_METHOD_UPDATED   = 'template_05ilw6m';
const TEMPLATE_PAYOUT_SETTINGS_ACCESSED = 'template_lwifwd7';
const TEMPLATE_GUEST_SUPPORT_ADMIN     = 'template_ecla4ki';
const TEMPLATE_GUEST_SUPPORT_CONFIRM   = 'template_qr9tadk';
// Same template sent to both host and renter -- audience-specific
// wording is handled by the `recipient_role` param, not a second template.
const TEMPLATE_BOOKING_REMINDER        = 'template_9ah6jeq';
const FILMONS_ADMIN_EMAIL              = 'gabriel@filmons.app';

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

export function sendRentalRequestEmail(p: {
  toEmail: string | null | undefined; toName?: string | null;
  fromName: string; listingTitle: string; rentalDates: string;
  requestMessage?: string | null; conversationId: string;
}) {
  return sendEmailJsRaw(p.toEmail, TEMPLATE_RENTAL_REQUEST, {
    to_name: p.toName || 'there',
    from_name: p.fromName,
    listing_title: p.listingTitle,
    rental_dates: p.rentalDates,
    request_message: p.requestMessage || 'No message included',
    conversation_link: `https://filmons.app/inbox?conv=${p.conversationId}`,
  });
}

export function sendPurchaseRequestEmail(p: {
  toEmail: string | null | undefined; toName?: string | null;
  fromName: string; listingTitle: string;
  requestMessage?: string | null; conversationId: string;
}) {
  return sendEmailJsRaw(p.toEmail, TEMPLATE_PURCHASE_REQUEST, {
    to_name: p.toName || 'there',
    from_name: p.fromName,
    listing_title: p.listingTitle,
    request_message: p.requestMessage || 'No message included',
    conversation_link: `https://filmons.app/inbox?conv=${p.conversationId}`,
  });
}

export function sendRentalAcceptedEmail(p: {
  toEmail: string | null | undefined; toName?: string | null;
  fromName: string; listingTitle: string; rentalDates: string; conversationId: string;
}) {
  return sendEmailJsRaw(p.toEmail, TEMPLATE_RENTAL_ACCEPTED, {
    to_name: p.toName || 'there',
    from_name: p.fromName,
    listing_title: p.listingTitle,
    rental_dates: p.rentalDates,
    conversation_link: `https://filmons.app/inbox?conv=${p.conversationId}`,
  });
}

export function sendRentalDeclinedEmail(p: {
  toEmail: string | null | undefined; toName?: string | null;
  fromName: string; listingTitle: string;
}) {
  return sendEmailJsRaw(p.toEmail, TEMPLATE_RENTAL_DECLINED, {
    to_name: p.toName || 'there',
    from_name: p.fromName,
    listing_title: p.listingTitle,
    browse_url: 'https://filmons.app/',
  });
}

export function sendBookingReminderEmail(p: {
  toEmail: string | null | undefined; toName?: string | null;
  recipientRole: 'host' | 'renter'; listingTitle: string;
  bookingDate: string; bookingTime?: string | null; timeframe: '3 days' | '24 hours';
  orderId: string;
}) {
  return sendEmailJsRaw(p.toEmail, TEMPLATE_BOOKING_REMINDER, {
    to_name: p.toName || 'there',
    recipient_role: p.recipientRole,
    listing_title: p.listingTitle,
    booking_date: p.bookingDate,
    booking_time: p.bookingTime || '',
    timeframe: p.timeframe,
    order_url: `https://filmons.app/my-orders`,
  });
}

export function sendPurchaseAcceptedEmail(p: {
  toEmail: string | null | undefined; toName?: string | null;
  fromName: string; listingTitle: string; conversationId: string;
}) {
  return sendEmailJsRaw(p.toEmail, TEMPLATE_PURCHASE_ACCEPTED, {
    to_name: p.toName || 'there',
    from_name: p.fromName,
    listing_title: p.listingTitle,
    conversation_link: `https://filmons.app/inbox?conv=${p.conversationId}`,
  });
}

export function sendPurchaseDeclinedEmail(p: {
  toEmail: string | null | undefined; toName?: string | null;
  fromName: string; listingTitle: string;
}) {
  return sendEmailJsRaw(p.toEmail, TEMPLATE_PURCHASE_DECLINED, {
    to_name: p.toName || 'there',
    from_name: p.fromName,
    listing_title: p.listingTitle,
    browse_url: 'https://filmons.app/',
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
  feeAmount?: number; netAmount?: number;
}) {
  const methodLine = p.payoutLast4 ? `${p.payoutMethod} •••• ${p.payoutLast4}` : p.payoutMethod;
  return sendEmailJsRaw(p.toEmail, TEMPLATE_WITHDRAWAL_RECEIVED, {
    to_name: p.toName || 'there',
    amount: p.amount.toFixed(2),
    currency: p.currency,
    withdrawal_id: p.withdrawalId,
    payout_method: methodLine,
    withdrawal_url: 'https://filmons.app/wallet',
    fee_amount: p.feeAmount != null ? p.feeAmount.toFixed(2) : undefined,
    net_amount: p.netAmount != null ? p.netAmount.toFixed(2) : undefined,
  });
}

/** Notifies FILMONS ops (not the requesting user) that a new cash-out needs review. */
export function sendCashOutRequestAdminEmail(p: {
  withdrawalId: string; userName: string; userEmail: string | null | undefined;
  requestedAmount: number; feeAmount: number; netAmount: number; currency: string;
  payoutMethod: string; payoutDetails: string; requestedAt: string;
}) {
  return sendEmailJsRaw(FILMONS_ADMIN_EMAIL, TEMPLATE_CASHOUT_REQUEST_ADMIN, {
    withdrawal_id: p.withdrawalId,
    user_name: p.userName,
    user_email: p.userEmail || 'unknown',
    requested_amount: `$${p.requestedAmount.toFixed(2)} ${p.currency}`,
    fee_amount: `$${p.feeAmount.toFixed(2)} ${p.currency}`,
    net_amount: `$${p.netAmount.toFixed(2)} ${p.currency}`,
    payout_method: p.payoutMethod,
    payout_details: p.payoutDetails,
    requested_at: p.requestedAt,
    admin_withdrawal_url: 'https://filmons.app/admin-verifications',
  });
}

export function sendCashOutApprovedEmail(p: {
  toEmail: string | null | undefined; toName?: string | null;
  amount: number; currency: string; withdrawalId: string;
}) {
  return sendEmailJsRaw(p.toEmail, TEMPLATE_CASHOUT_APPROVED, {
    to_name: p.toName || 'there',
    amount: `$${p.amount.toFixed(2)} ${p.currency}`,
    withdrawal_id: p.withdrawalId,
    wallet_url: 'https://filmons.app/wallet',
  });
}

export function sendCashOutSentEmail(p: {
  toEmail: string | null | undefined; toName?: string | null;
  netAmount: number; feeAmount: number; currency: string;
  withdrawalId: string; payoutMethod: string;
}) {
  return sendEmailJsRaw(p.toEmail, TEMPLATE_CASHOUT_SENT, {
    to_name: p.toName || 'there',
    net_amount: `$${p.netAmount.toFixed(2)} ${p.currency}`,
    fee_amount: `$${p.feeAmount.toFixed(2)} ${p.currency}`,
    withdrawal_id: p.withdrawalId,
    payout_method: p.payoutMethod,
    wallet_url: 'https://filmons.app/wallet',
  });
}

export function sendCashOutRejectedEmail(p: {
  toEmail: string | null | undefined; toName?: string | null;
  amount: number; currency: string; withdrawalId: string; reason: string;
}) {
  return sendEmailJsRaw(p.toEmail, TEMPLATE_CASHOUT_REJECTED, {
    to_name: p.toName || 'there',
    amount: `$${p.amount.toFixed(2)} ${p.currency}`,
    withdrawal_id: p.withdrawalId,
    rejection_reason: p.reason,
    wallet_url: 'https://filmons.app/wallet',
  });
}

export function sendCashOutFailedEmail(p: {
  toEmail: string | null | undefined; toName?: string | null;
  amount: number; currency: string; withdrawalId: string;
}) {
  return sendEmailJsRaw(p.toEmail, TEMPLATE_CASHOUT_FAILED, {
    to_name: p.toName || 'there',
    amount: `$${p.amount.toFixed(2)} ${p.currency}`,
    withdrawal_id: p.withdrawalId,
    wallet_url: 'https://filmons.app/wallet',
  });
}

export function sendListingLikedEmail(p: {
  toEmail: string | null | undefined; toName?: string | null;
  fromName: string; listingId: string; listingTitle: string;
}) {
  return sendEmailJsRaw(p.toEmail, TEMPLATE_LISTING_LIKED, {
    to_name: p.toName || 'there',
    from_name: p.fromName,
    listing_title: p.listingTitle,
    listing_url: `https://filmons.app/listing/${p.listingId}`,
  });
}

/** Someone tapped "Hire" on a creator's Portfolio and sent a hire request. */
export function sendHireRequestReceivedEmail(p: {
  toEmail: string | null | undefined; toName?: string | null;
  fromName: string; projectTitle: string; serviceLabel: string; conversationId: string;
}) {
  return sendEmailJsRaw(p.toEmail, TEMPLATE_HIRE_REQUEST_RECEIVED, {
    to_name: p.toName || 'there',
    from_name: p.fromName,
    project_title: p.projectTitle,
    service_label: p.serviceLabel,
    conversation_link: `https://filmons.app/inbox?conv=${p.conversationId}`,
  });
}

export function sendPayoutSentEmail(p: {
  toEmail: string | null | undefined; toName?: string | null;
  amount: number; currency: string; destinationLabel: string; arrivalDate?: string | null;
}) {
  return sendEmailJsRaw(p.toEmail, TEMPLATE_PAYOUT_SENT, {
    to_name: p.toName || 'there',
    amount: `$${p.amount.toFixed(2)} ${p.currency}`,
    destination_label: p.destinationLabel,
    // Never a promised exact date unless Stripe actually returned one --
    // the template always shows the 1-6 business day range regardless.
    arrival_date: p.arrivalDate ? new Date(p.arrivalDate).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }) : '',
    wallet_url: 'https://filmons.app/wallet',
  });
}

export function sendPayoutFailedEmail(p: {
  toEmail: string | null | undefined; toName?: string | null;
  amount: number; currency: string; withdrawalId: string;
}) {
  return sendEmailJsRaw(p.toEmail, TEMPLATE_PAYOUT_FAILED, {
    to_name: p.toName || 'there',
    amount: `$${p.amount.toFixed(2)} ${p.currency}`,
    withdrawal_id: p.withdrawalId,
    wallet_url: 'https://filmons.app/wallet',
  });
}

/** Stripe needs more info to keep paying out this host's connected account. */
export function sendPayoutBankAttentionEmail(p: {
  toEmail: string | null | undefined; toName?: string | null;
}) {
  return sendEmailJsRaw(p.toEmail, TEMPLATE_PAYOUT_BANK_ATTENTION, {
    to_name: p.toName || 'there',
    payout_method_url: 'https://filmons.app/wallet/payout-method',
  });
}

/** Someone swiped right on / liked this creator's profile card. */
export function sendCreatorLikedEmail(p: {
  toEmail: string | null | undefined; toName?: string | null; fromName: string;
}) {
  return sendEmailJsRaw(p.toEmail, TEMPLATE_CREATOR_LIKED, {
    to_name: p.toName || 'there',
    from_name: p.fromName,
    profile_url: 'https://filmons.app/profile',
  });
}

/** A payout method was added for the first time, or an existing one was changed. */
export function sendPayoutMethodUpdatedEmail(p: {
  toEmail: string | null | undefined; toName?: string | null;
  isUpdate: boolean; destinationLabel: string;
}) {
  return sendEmailJsRaw(p.toEmail, TEMPLATE_PAYOUT_METHOD_UPDATED, {
    to_name: p.toName || 'there',
    action_label: p.isUpdate ? 'updated' : 'added',
    destination_label: p.destinationLabel,
    wallet_url: 'https://filmons.app/wallet',
  });
}

/** Someone completed the "Verify It's You" step-up gate to access payout
 *  settings -- fires regardless of whether they go on to actually change
 *  anything, as a security alert distinct from sendPayoutMethodUpdatedEmail
 *  (which only fires on an actual saved change). */
export function sendPayoutSettingsAccessedEmail(p: {
  toEmail: string | null | undefined; toName?: string | null;
  verificationMethod: 'password' | 'phone' | 'oauth';
}) {
  const methodLabel = p.verificationMethod === 'password' ? 'your account password'
    : p.verificationMethod === 'phone' ? 'a text code to your phone'
    : 'your linked account';
  return sendEmailJsRaw(p.toEmail, TEMPLATE_PAYOUT_SETTINGS_ACCESSED, {
    to_name: p.toName || 'there',
    verification_method: methodLabel,
    date: new Date().toLocaleString('en-CA', { dateStyle: 'long', timeStyle: 'short' }),
    wallet_url: 'https://filmons.app/wallet',
  });
}

export function sendFollowedCreatorPostedEmail(p: {
  toEmail: string | null | undefined; toName?: string | null;
  fromName: string; listingId: string; listingTitle: string;
}) {
  return sendEmailJsRaw(p.toEmail, TEMPLATE_FOLLOWED_CREATOR_POSTED, {
    to_name: p.toName || 'there',
    from_name: p.fromName,
    listing_title: p.listingTitle,
    listing_url: `https://filmons.app/listing/${p.listingId}`,
  });
}

/** No automatic trigger exists yet -- Filmons has no recommendation
 *  engine. Template + sender only, ready for whatever surfaces a real
 *  suggestion (e.g. a future "similar listings" feature) to call. */
export function sendListingSuggestionEmail(p: {
  toEmail: string | null | undefined; toName?: string | null;
  listingId: string; listingTitle: string; listingLocation?: string; reason: string;
}) {
  return sendEmailJsRaw(p.toEmail, TEMPLATE_LISTING_SUGGESTION, {
    to_name: p.toName || 'there',
    listing_title: p.listingTitle,
    listing_location: p.listingLocation || '',
    suggestion_reason: p.reason,
    listing_url: `https://filmons.app/listing/${p.listingId}`,
  });
}

/** Notifies FILMONS support (not the user) that a new case was opened. */
export function sendSupportCaseAdminEmail(p: {
  caseId: string; userName: string; userEmail: string | null | undefined;
  category: string; message: string; submittedAt: string;
}) {
  return sendEmailJsRaw(FILMONS_ADMIN_EMAIL, TEMPLATE_SUPPORT_CASE_ADMIN, {
    case_id: p.caseId,
    user_name: p.userName,
    user_email: p.userEmail || 'unknown',
    case_category: p.category,
    case_message: p.message,
    submitted_at: p.submittedAt,
    admin_case_url: `https://filmons.app/admin-support`,
  });
}

/** Notifies FILMONS support of a new case opened by an unauthenticated
 *  guest (no profile, no user_id) -- distinct template from
 *  sendSupportCaseAdminEmail so the "User Type: Guest" framing (no account
 *  exists to look anything up from) is always visible, not just implied by
 *  an empty field. Sent to whichever address support_contact currently
 *  has active, matching the existing "centralized support contact" table
 *  every other admin-facing support surface already reads from. */
export function sendGuestSupportRequestAdminEmail(p: {
  toEmail: string | null | undefined;
  ticketId: string; guestName: string; guestEmail: string;
  category: string; subject: string; message: string; submittedAt: string;
}) {
  return sendEmailJsRaw(p.toEmail, TEMPLATE_GUEST_SUPPORT_ADMIN, {
    ticket_id: p.ticketId,
    guest_name: p.guestName,
    guest_email: p.guestEmail,
    category: p.category,
    subject: p.subject,
    message: p.message,
    submitted_at: p.submittedAt,
    user_type: 'Guest',
    admin_case_url: `https://filmons.app/admin-support`,
  });
}

/** Confirms receipt directly to the guest -- their only way to know the
 *  request landed at all, since they have no account and no in-app case
 *  view (/support/cases/:id) to check back on, unlike an authenticated
 *  user's case. */
export function sendGuestSupportConfirmationEmail(p: {
  toEmail: string; guestName: string; ticketId: string; subject: string;
}) {
  return sendEmailJsRaw(p.toEmail, TEMPLATE_GUEST_SUPPORT_CONFIRM, {
    to_name: p.guestName,
    ticket_id: p.ticketId,
    subject: p.subject,
  });
}

export function sendMessageRequestAcceptedEmail(p: {
  toEmail: string | null | undefined; toName?: string | null;
  fromName: string; conversationId: string;
}) {
  return sendEmailJsRaw(p.toEmail, TEMPLATE_MESSAGE_REQUEST_ACCEPTED, {
    to_name: p.toName || 'there',
    from_name: p.fromName,
    conversation_link: `https://filmons.app/inbox?conv=${p.conversationId}`,
  });
}
