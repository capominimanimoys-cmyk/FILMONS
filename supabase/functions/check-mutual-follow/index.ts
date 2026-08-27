// Server-verified mutual-follow check -- the real gate behind "mutual
// followers message directly, no request step," not just a frontend
// button-label decision. Used by chatApi.getOrCreateDB (client) both when
// creating a brand-new conversation (decides its initial is_request) and
// when re-opening an existing request-state conversation between two
// users who have since become mutual followers (upgrades it in place,
// never creates a duplicate thread).
//
// Scope note: this checks/reconciles at conversation-open time, not on
// every individual message send -- Filmons messages insert directly via
// the client with no per-send edge function today, and adding one for
// every message was out of scope here. A conversation unlocked this way
// stays unlocked even if the two later unfollow each other (no live
// per-message revocation) -- existing messages/threads are never deleted
// either way, matching the "don't destroy history" requirement.
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };
function rest(path: string) { return `${SUPABASE_URL}/rest/v1${path}`; }

async function follows(followerId: string, followingId: string): Promise<boolean> {
  const res = await fetch(rest(`/follows?follower_id=eq.${followerId}&following_id=eq.${followingId}&select=follower_id&limit=1`), { headers: H });
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { userA, userB, conversationId } = await req.json();
    if (!userA || !userB) return json({ error: 'Missing userA/userB' }, 400);

    const [aFollowsB, bFollowsA] = await Promise.all([follows(userA, userB), follows(userB, userA)]);
    const mutual = aFollowsB && bFollowsA;

    if (mutual && conversationId) {
      await fetch(rest(`/conversations?id=eq.${conversationId}&is_request=eq.true`), {
        method: 'PATCH', headers: H,
        body: JSON.stringify({ is_request: false }),
      }).catch(() => {});
    }

    return json({ mutual });
  } catch (e) {
    console.error('check-mutual-follow error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
