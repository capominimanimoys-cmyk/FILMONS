/**
 * KV store — uses Supabase REST (PostgREST) instead of direct Postgres.
 *
 * Replaces the npm:postgres-based implementation that caused 15-30 s cold-start
 * delays because PgBouncer rejects the statement_timeout startup parameter.
 * PostgREST is always available, requires no connection handshake, and is fast
 * even on first invocation.
 *
 * Table: kv_store_ec8fe879  (key text PRIMARY KEY, value jsonb)
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BASE         = `${SUPABASE_URL}/rest/v1/kv_store_ec8fe879`;

const HDR = () => ({
  "Content-Type":  "application/json",
  "apikey":        SERVICE_KEY,
  "Authorization": `Bearer ${SERVICE_KEY}`,
});

// ── get ───────────────────────────────────────────────────────────────────────
export async function get(key: string): Promise<any> {
  const res = await fetch(
    `${BASE}?key=eq.${encodeURIComponent(key)}&select=value&limit=1`,
    { headers: HDR() },
  );
  if (!res.ok) { await res.body?.cancel(); return null; }
  const rows = await res.json() as Array<{ value: any }>;
  if (!rows?.length) return null;
  const v = rows[0].value;
  // PostgREST returns jsonb as a parsed object; fall back to JSON.parse for text columns
  return (v !== null && typeof v === "object") ? v : (typeof v === "string" ? JSON.parse(v) : null);
}

// ── set ───────────────────────────────────────────────────────────────────────
export async function set(key: string, value: any): Promise<void> {
  const res = await fetch(BASE, {
    method:  "POST",
    headers: { ...HDR(), "Prefer": "resolution=merge-duplicates,return=minimal" },
    body:    JSON.stringify({ key, value }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => String(res.status));
    throw new Error(`KV set failed (${res.status}): ${msg}`);
  }
  await res.body?.cancel();
}

// ── del ───────────────────────────────────────────────────────────────────────
export async function del(key: string): Promise<void> {
  const res = await fetch(
    `${BASE}?key=eq.${encodeURIComponent(key)}`,
    { method: "DELETE", headers: HDR() },
  );
  await res.body?.cancel();
}

// ── mget ─────────────────────────────────────────────────────────────────────
export async function mget(keys: string[]): Promise<any[]> {
  if (!keys.length) return [];
  const list = keys.map(k => encodeURIComponent(k)).join(",");
  const res  = await fetch(
    `${BASE}?key=in.(${list})&select=key,value`,
    { headers: HDR() },
  );
  if (!res.ok) { await res.body?.cancel(); return keys.map(() => null); }
  const rows = await res.json() as Array<{ key: string; value: any }>;
  const map: Record<string, any> = {};
  for (const r of rows) {
    map[r.key] = (r.value !== null && typeof r.value === "object")
      ? r.value
      : (typeof r.value === "string" ? JSON.parse(r.value) : null);
  }
  return keys.map(k => map[k] ?? null);
}

// ── mset ─────────────────────────────────────────────────────────────────────
export async function mset(entries: Record<string, any>): Promise<void> {
  const pairs = Object.entries(entries);
  if (!pairs.length) return;
  for (const [key, value] of pairs) await set(key, value);
}

// ── mdel ─────────────────────────────────────────────────────────────────────
export async function mdel(keys: string[]): Promise<void> {
  if (!keys.length) return;
  const list = keys.map(k => encodeURIComponent(k)).join(",");
  const res  = await fetch(
    `${BASE}?key=in.(${list})`,
    { method: "DELETE", headers: HDR() },
  );
  await res.body?.cancel();
}

// ── getByPrefix ───────────────────────────────────────────────────────────────
export async function getByPrefix(prefix: string): Promise<any[]> {
  const res = await fetch(
    `${BASE}?key=like.${encodeURIComponent(prefix + "%")}&select=value`,
    { headers: HDR() },
  );
  if (!res.ok) { await res.body?.cancel(); return []; }
  const rows = await res.json() as Array<{ value: any }>;
  return rows.map(r =>
    (r.value !== null && typeof r.value === "object") ? r.value
    : (typeof r.value === "string" ? JSON.parse(r.value) : null)
  );
}
