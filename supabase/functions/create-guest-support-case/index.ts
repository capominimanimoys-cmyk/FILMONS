// Contact Support for unauthenticated guests -- the one path in the
// support system that has no session at all, so unlike supportApi's
// client-side supabase.from('support_cases').insert(...) (trusted because
// it always carries a real authenticated user_id), this needs its own
// server-side checkpoint: validation, rate limiting, and content
// sanitization all happen here rather than being left to the frontend
// form alone.
//
// Reuses the existing support_cases/support_messages tables and
// support-attachments bucket -- not a parallel support system, just the
// one path into it that doesn't require a profile (see
// 20240331000000_guest_support_cases.sql for the schema changes that
// made user_id nullable here).
import {
  sendGuestSupportRequestAdminEmail,
  sendGuestSupportConfirmationEmail,
} from '../_shared/notificationEmails.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };
function rest(path: string) { return `${SUPABASE_URL}/rest/v1${path}`; }

async function selectOne(table: string, filter: string) {
  const res = await fetch(rest(`/${table}?${filter}&select=*&limit=1`), { headers: H });
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : null;
}

// Matches the FILMONS category dropdown exactly -- rejecting anything else
// server-side means the frontend's <select> is never trusted blind, per
// "never trust frontend validation alone".
const ALLOWED_CATEGORIES = new Set([
  'account_signin', 'rental', 'purchase_sale', 'payment',
  'payout', 'opportunity', 'safety_report', 'technical_problem', 'other',
]);
const CATEGORY_LABEL: Record<string, string> = {
  account_signin: 'Account or Sign In', rental: 'Rental', purchase_sale: 'Purchase / Sale',
  payment: 'Payment', payout: 'Payout', opportunity: 'Opportunity',
  safety_report: 'Safety or Report', technical_problem: 'Technical Problem', other: 'Other',
};

const MAX_FIELD = { name: 100, email: 254, subject: 200, message: 5000 };
const RATE_LIMIT_WINDOW_MIN = 15;
const RATE_LIMIT_MAX = 3;

// Strips tags and control characters rather than escaping them -- this
// content is going into a plain-text email body and an admin dashboard
// column, neither of which should ever render raw HTML from a public,
// unauthenticated form.
function sanitize(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const {
      name, email, category, subject, message, attachment,
      // Honeypot -- a real visitor never sees or fills this field (hidden
      // off-screen in the form); a bot filling every input will. Silently
      // report success without creating anything, so the bot gets no
      // signal that it was caught.
      website,
    } = body as {
      name?: string; email?: string; category?: string; subject?: string; message?: string;
      attachment?: { path: string; name: string } | null; website?: string;
    };

    if (website) {
      return json({ success: true, caseId: 'noop', caseNumber: 'FS-00000' });
    }

    // ── Server-side validation -- the frontend already checks this, but
    // that's UX only; this is the actual gate. ──────────────────────────
    if (!name?.trim() || !email?.trim() || !category?.trim() || !subject?.trim() || !message?.trim()) {
      return json({ error: 'Missing required fields' }, 400);
    }
    if (!isValidEmail(email.trim())) return json({ error: 'Enter a valid email address' }, 400);
    if (!ALLOWED_CATEGORIES.has(category)) return json({ error: 'Invalid category' }, 400);
    if (name.length > MAX_FIELD.name) return json({ error: 'Name is too long' }, 400);
    if (email.length > MAX_FIELD.email) return json({ error: 'Email is too long' }, 400);
    if (subject.length > MAX_FIELD.subject) return json({ error: 'Subject is too long' }, 400);
    if (message.length > MAX_FIELD.message) return json({ error: 'Message is too long' }, 400);

    const cleanName = sanitize(name);
    const cleanEmail = email.trim().toLowerCase();
    const cleanSubject = sanitize(subject);
    const cleanMessage = sanitize(message);
    if (!cleanName || !cleanSubject || !cleanMessage) return json({ error: 'Invalid submission' }, 400);

    // ── Rate limit by IP -- this endpoint has no session/user_id to key
    // on, and is reachable by anyone. ───────────────────────────────────
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MIN * 60_000).toISOString();
    const recentRes = await fetch(
      rest(`/guest_support_rate_limit?ip_address=eq.${encodeURIComponent(ip)}&created_at=gte.${windowStart}&select=id`),
      { headers: H },
    );
    const recent = await recentRes.json();
    if (Array.isArray(recent) && recent.length >= RATE_LIMIT_MAX) {
      return json({ error: 'Too many requests — please try again later' }, 429);
    }
    await fetch(rest('/guest_support_rate_limit'), {
      method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ ip_address: ip }),
    });

    // ── Attachment: only ever a path already uploaded client-side to the
    // private support-attachments bucket (10MB/image+pdf limit enforced
    // by that bucket's own config, see 20240220000000_support_system.sql)
    // -- this function never receives raw file bytes, just the resulting
    // storage path, so no attachment handling of its own is needed here
    // beyond passing it through to the case's first message. ────────────
    const attachments = attachment?.path
      ? [{ path: attachment.path, name: sanitize(attachment.name || 'attachment') }]
      : [];

    // ── Create the case ──────────────────────────────────────────────
    const caseRes = await fetch(rest('/support_cases'), {
      method: 'POST',
      headers: { ...H, Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: null,
        guest_name: cleanName,
        guest_email: cleanEmail,
        category,
        subject: cleanSubject,
        status: 'waiting_for_agent',
        priority: category === 'safety_report' ? 'urgent' : category === 'payout' ? 'high' : 'normal',
      }),
    });
    const created = await caseRes.json();
    const row = Array.isArray(created) ? created[0] : created;
    if (!caseRes.ok || !row?.id) {
      console.error('create-guest-support-case: insert failed:', created);
      return json({ error: 'Could not create your support request' }, 500);
    }

    await fetch(rest('/support_messages'), {
      method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({
        case_id: row.id, sender_type: 'user', sender_name: cleanName,
        content: cleanMessage, attachments, is_read_by_admin: false,
      }),
    });

    // ── Notify FILMONS support + confirm to the guest ────────────────
    const contact = await selectOne('support_contact', 'active=eq.true');
    const submittedAt = new Date().toLocaleString('en-CA', { dateStyle: 'long', timeStyle: 'short' });
    await Promise.all([
      sendGuestSupportRequestAdminEmail({
        toEmail: contact?.email,
        ticketId: row.case_number, guestName: cleanName, guestEmail: cleanEmail,
        category: CATEGORY_LABEL[category] || category, subject: cleanSubject, message: cleanMessage,
        submittedAt,
      }).catch(() => {}),
      sendGuestSupportConfirmationEmail({
        toEmail: cleanEmail, guestName: cleanName, ticketId: row.case_number, subject: cleanSubject,
      }).catch(() => {}),
    ]);

    return json({ success: true, caseId: row.id, caseNumber: row.case_number });
  } catch (e) {
    console.error('create-guest-support-case error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
