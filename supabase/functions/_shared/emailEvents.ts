// Idempotency for outbound transactional emails -- see
// 20240315000000_email_events.sql. Call claimEmailEvent(key) right before
// sending; only the caller that wins the unique-constraint race gets
// `true` back, so a retried request, a duplicate webhook delivery, or a
// bulk-action loop can never send the same email twice for the same key.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

export async function claimEmailEvent(eventKey: string): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/email_events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ event_key: eventKey }),
    });
    // 201 = we inserted it first, send the email. 409 = someone already
    // claimed this key, skip. Anything else (table not migrated yet, etc.)
    // fails open -- a lost idempotency check should never silently eat a
    // real notification the user is expecting.
    if (res.status === 201) return true;
    if (res.status === 409) return false;
    return true;
  } catch {
    return true;
  }
}
