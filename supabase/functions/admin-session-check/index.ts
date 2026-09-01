// Lets the Admin frontend ask "am I logged in?" without ever holding the
// session token itself -- the token lives only in the HttpOnly cookie,
// this just confirms it's still valid and returns display identity
// (name/role), nothing secret.
import { verifyAdminToken } from '../_shared/adminAuth.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const admin = await verifyAdminToken(req);
  return new Response(
    JSON.stringify(admin ? { authenticated: true, name: admin.name, role: admin.role } : { authenticated: false }),
    { headers: { ...cors, 'Content-Type': 'application/json' } },
  );
});
