// Fetches an avatar image server-side and streams it back with permissive
// CORS -- used only by ShareCard's export flow. A Google-signup account's
// avatar (see GoogleSignup.tsx) stores the raw OAuth photo URL
// (lh3.googleusercontent.com/...) directly, never re-uploaded to Supabase
// storage. That CDN serves the image fine to a plain <img> tag (no CORS
// needed for basic display), but blocks a browser-side fetch()/canvas read
// used to convert it to a data URL for image export -- which is exactly
// what ShareCard.tsx needs to embed it in the downloaded PNG. CORS is a
// browser-enforced policy only, so a server-to-server fetch (here) has no
// such restriction; this exists purely to hand the bytes back to the
// browser from an origin that WE control the CORS headers on.
//
// Hostname allowlist, not an open proxy -- this is publicly callable
// (no-verify-jwt, like most read-only functions in this app), so it must
// not become a general-purpose SSRF relay for arbitrary URLs.
const ALLOWED_HOST_SUFFIXES = ['.googleusercontent.com', '.supabase.co'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

function isAllowedHost(hostname: string): boolean {
  return ALLOWED_HOST_SUFFIXES.some(suffix => hostname === suffix.slice(1) || hostname.endsWith(suffix));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });

  try {
    const target = new URL(req.url).searchParams.get('url');
    if (!target) return new Response('Missing url', { status: 400, headers: cors });

    let parsed: URL;
    try { parsed = new URL(target); } catch { return new Response('Invalid url', { status: 400, headers: cors }); }
    if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || !isAllowedHost(parsed.hostname)) {
      return new Response('Host not allowed', { status: 400, headers: cors });
    }

    // Some image CDNs (googleusercontent.com included) quietly reject or
    // degrade requests that don't look like they came from a real browser
    // -- Deno's default fetch sends a bare "Deno/x.x" User-Agent with no
    // Accept header, which is exactly that. Spoofing realistic browser
    // headers here is what makes this proxy actually work for the case it
    // exists for, not just for URLs that would've succeeded anyway.
    const res = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': 'https://filmons.app/',
      },
    });
    if (!res.ok || !res.body) return new Response(`Fetch failed (${res.status})`, { status: 502, headers: cors });

    return new Response(res.body, {
      headers: { ...cors, 'Content-Type': res.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'public, max-age=3600' },
    });
  } catch (e) {
    console.error('proxy-avatar error:', e);
    return new Response('Internal error', { status: 500, headers: cors });
  }
});
