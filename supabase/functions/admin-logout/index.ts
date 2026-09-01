// Explicit admin Log Out -- clears the HttpOnly session cookie server-side
// (the frontend's own JS can never read or delete it directly, that's the
// point of HttpOnly).
import { buildClearCookieHeader } from '../_shared/adminAuth.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  return new Response(JSON.stringify({ success: true }), {
    headers: { ...cors, 'Content-Type': 'application/json', 'Set-Cookie': buildClearCookieHeader() },
  });
});
