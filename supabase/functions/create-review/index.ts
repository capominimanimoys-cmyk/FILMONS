// Server-verified review creation. Replaces the old direct client insert
// (supabase.from('reviews').insert(...) in src/app/lib/api.ts) so the
// notification + email steps are guaranteed to run right after a
// successful save, and can never be skipped just because the reviewer
// closed their browser before a client-side follow-up call fired.
//
// Preserves the exact insert shape the existing reputation-score DB
// trigger depends on (NEW.reviewed_user_id) — same columns, same table,
// just moved server-side.
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

const EMAILJS_SERVICE_ID = 'service_s6wwjtj';
const EMAILJS_PUBLIC_KEY = 'iSSpIM-AeV9uUQ7Jt';
const EMAILJS_PRIVATE_KEY = Deno.env.get('EMAILJS_PRIVATE_KEY') || '';
// Generic subject/message template, same one request-payout/manage-hire-
// request/stripe-webhook already use for dynamic notification emails —
// no new EmailJS dashboard template required.
const EMAILJS_TEMPLATE_ADMIN_NOTIFICATION = 'template_rd3nhik';

async function sendReviewEmail(toEmail: string, toName: string, subject: string, message: string) {
  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ADMIN_NOTIFICATION,
        user_id: EMAILJS_PUBLIC_KEY,
        accessToken: EMAILJS_PRIVATE_KEY,
        template_params: { to_email: toEmail, to_name: toName || 'there', subject, message },
      }),
    });
    if (!res.ok) console.warn('Review email failed:', res.status, await res.text());
  } catch (e) {
    console.warn('Review email threw:', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { listingId, userId, rating, comment } = await req.json();
    if (!listingId || !userId) return json({ error: 'Missing listingId or userId' }, 400);
    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) return json({ error: 'Rating must be 1-5' }, 400);
    if (!comment || !String(comment).trim()) return json({ error: 'Please enter a comment' }, 400);

    const listing = await selectOne('listings', `id=eq.${encodeURIComponent(listingId)}`);
    if (!listing) return json({ error: 'Listing not found' }, 404);

    // Server-enforced — the "Write a review" form is already hidden for
    // the listing owner client-side, but a direct call must be blocked
    // too, not just the UI.
    if (listing.user_id === userId) return json({ error: "You can't review your own listing" }, 400);

    // 1. Save the review — same columns as the old direct client insert,
    // so the existing reputation-score trigger (reads NEW.reviewed_user_id)
    // keeps working unchanged.
    const insertRes = await fetch(rest('/reviews'), {
      method: 'POST',
      headers: { ...H, Prefer: 'return=representation' },
      body: JSON.stringify({
        listing_id: listingId, user_id: userId, reviewed_user_id: listing.user_id,
        rating: ratingNum, comment: String(comment).trim(),
      }),
    });
    const inserted = await insertRes.json();
    if (!insertRes.ok) {
      console.error('create-review insert failed:', inserted);
      return json({ error: 'Could not save review' }, 500);
    }
    const review = Array.isArray(inserted) ? inserted[0] : inserted;

    // Everything past this point is best-effort — a failure here must
    // never look like the review itself failed to save.
    try {
      const reviewer = await selectOne('profiles', `id=eq.${userId}`);
      const reviewerName = reviewer?.name || reviewer?.username || 'Someone';
      const owner = await selectOne('profiles', `id=eq.${listing.user_id}`);
      const prefs = await selectOne('notification_settings', `user_id=eq.${listing.user_id}`);
      const notifReviews = prefs?.notif_reviews !== false;
      const emailReviews = prefs?.email_reviews !== false;

      if (notifReviews) {
        const title = `${reviewerName} left a ${ratingNum}-star review on your ${listing.title || 'listing'}`;
        const res = await fetch(rest('/notifications'), {
          method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
          body: JSON.stringify({
            user_id: listing.user_id, actor_id: userId, actor_name: reviewerName,
            actor_avatar: reviewer?.avatar_url || null, type: 'listing_review', title,
            listing_id: listingId, review_id: review.id, rating: ratingNum, is_read: false,
          }),
        });
        // A unique_violation here (409/23505) means this exact review
        // already produced a notification — expected under a retried
        // call, not an error to surface.
        if (!res.ok && res.status !== 409) console.warn('review notification insert failed:', res.status, await res.text());
      }

      if (emailReviews && owner?.email) {
        const preview = String(comment).trim().length > 160 ? `${String(comment).trim().slice(0, 160)}…` : String(comment).trim();
        const message = `${reviewerName} just left a ${ratingNum}-star review on your ${listing.title || 'listing'}.\n\n"${preview}"`;
        await sendReviewEmail(owner.email, owner.name || 'there', 'You received a new review on FILMONS ⭐', message);
      }
    } catch (e) {
      console.warn('create-review notify/email step failed (review already saved):', e);
    }

    return json({ success: true, review });
  } catch (e) {
    console.error('create-review error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
