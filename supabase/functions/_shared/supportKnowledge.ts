// Condensed copy of src/app/pages/HelpCenter.tsx's FAQS content, for the
// support AI's system prompt — edge functions can't import client TSX
// directly. Needs manual sync if Help Center content changes materially.
//
// PLATFORM_FACTS below are the actual, current mechanics of features built
// this session (fee %, wallet release timing, payout/refund lifecycle) —
// some of HelpCenter.tsx's own FAQ copy predates these and is stale (e.g.
// it still describes flat "3-5 business day" payouts). PLATFORM_FACTS take
// precedence in the system prompt precisely so the AI doesn't repeat stale
// copy over the real, current behavior.

export const FAQ_KNOWLEDGE: Record<string, { q: string; a: string }[]> = {
  started: [
    { q: 'How do I create my Filmons profile?', a: 'After signing up, go to your Profile page and tap "Edit profile". Fill in your bio, primary role, skills, and upload a profile photo.' },
    { q: 'What is a Creator+ account?', a: 'Creator+ is the verified professional tier. It unlocks higher rental limits, portfolio priority, and a Creator+ badge. Apply through Settings → Verification.' },
  ],
  account: [
    { q: 'How do I change my email or phone?', a: 'Go to Settings → Security. Changing either requires verifying the new value with a code, and it must not already be used by another Filmons account.' },
    { q: 'What if I forgot my password?', a: 'On the login screen, tap "Forgot password?" — a reset link is sent to the registered email.' },
  ],
  portfolio: [
    { q: 'How do I make my portfolio public?', a: 'Go to Settings → Portfolio → Visibility, and select "Public".' },
    { q: 'What media types can I upload?', a: 'MP4, MOV, JPG, PNG, PDF, ZIP. Video up to 2GB, images up to 50MB.' },
  ],
  messaging: [
    { q: 'Why can\'t some users message me?', a: 'Check Settings → Messages → Who Can Message You.' },
    { q: 'What are Message Requests?', a: 'A message from someone you don\'t follow lands as a request until you accept or decline it.' },
  ],
  marketplace: [
    { q: 'How do I create a gear listing?', a: 'Tap + in the Marketplace, choose Gear Rental or Sale, add photos/description/pricing/availability.' },
    { q: 'What if the gear is returned damaged?', a: 'Document damage with photos immediately and contact support — a support case will be reviewed by the team.' },
  ],
  payments: [
    { q: 'What does the Filmons Fee cover?', a: 'See PLATFORM_FACTS.filmonsFee below for the exact, current mechanics.' },
    { q: 'How do payouts work?', a: 'See PLATFORM_FACTS.payouts below for the exact, current mechanics.' },
  ],
  verification: [
    { q: 'What documents do I need for Creator+ verification?', a: 'A valid government-issued photo ID, proof of address, and a selfie.' },
    { q: 'How long does verification take?', a: 'A human reviewer processes each submission — there is no fixed SLA today. Status shows as Pending, Under Review, Changes Requested, Approved, or Denied.' },
  ],
  privacy: [
    { q: 'How do I view my login activity?', a: 'Settings → Security → Active Devices shows recent logins with device/location, and lets you revoke sessions.' },
  ],
  trust: [
    { q: 'How do I report a scam or unsafe behavior?', a: 'Use "Report to Filmons" from Contact Support, or escalate directly — these are treated as urgent.' },
  ],
  troubleshoot: [
    { q: 'My upload is failing.', a: 'Check file size limits and connection stability; try a different browser if it persists.' },
  ],
};

export const PLATFORM_FACTS = {
  filmonsFee: 'Filmons charges an 8% Filmons Fee on top of the listing price at checkout, processed via Stripe. Filmons does not calculate or display tax in its own pricing — Stripe handles any applicable tax separately.',
  wallet: 'A host\'s earning from a completed rental first appears as "pending" in their Filmons Wallet, then automatically moves to "available" roughly 48 hours after the rental period ends. If a payment shows as paid but no wallet transaction exists at all for that order, that is NOT normal pending behavior — it means something needs manual review.',
  payouts: 'A host requests a payout from their available balance, choosing Interac e-Transfer or Bank Transfer and entering (or reusing a saved) destination. This reserves the funds immediately. There is no automated payout provider — a Filmons admin manually reviews the request, sends the money outside the platform, and then marks it Approved → Processing → Paid. If rejected, the reserved funds return to the available balance automatically.',
  refunds: 'A renter can request a refund or cancellation from their Orders page. This creates a request for a Filmons admin to review — refunds are not automatic. Approved refunds for card payments are returned via Stripe; other payment methods are handled as a balance adjustment.',
  disputes: 'If an order is marked disputed, the related pending host earnings are held and will not automatically release until the dispute is resolved.',
};

export function buildKnowledgeBlock(category?: string): string {
  const relevant = category && FAQ_KNOWLEDGE[category] ? FAQ_KNOWLEDGE[category] : [];
  const faqText = relevant.map(f => `Q: ${f.q}\nA: ${f.a}`).join('\n\n');
  const factsText = Object.entries(PLATFORM_FACTS).map(([k, v]) => `${k}: ${v}`).join('\n');
  return `PLATFORM_FACTS (authoritative — prefer these over general knowledge):\n${factsText}\n\nRELEVANT HELP CENTER FAQ:\n${faqText || '(none for this category)'}`;
}
