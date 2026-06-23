/**
 * KV store — direct Postgres via SUPABASE_DB_URL.
 * Bypasses PostgREST / schema-cache entirely.
 * Table: kv_store_ec8fe879
 */
import { sql, safeJson } from "./db.tsx";
export async function get(key: string): Promise<any> {
  const rows = await sql()`
    SELECT value FROM kv_store_ec8fe879 WHERE key = ${key} LIMIT 1
  `;
  return rows.length ? rows[0].value : null;
}

export async function set(key: string, value: any): Promise<void> {
  await sql()`
    INSERT INTO kv_store_ec8fe879 (key, value)
    VALUES (${key}, ${JSON.stringify(value)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
}

export async function del(key: string): Promise<void> {
  await sql()`DELETE FROM kv_store_ec8fe879 WHERE key = ${key}`;
}

export async function mget(keys: string[]): Promise<any[]> {
  if (!keys.length) return [];
  const rows = await sql()`
    SELECT key, value FROM kv_store_ec8fe879 WHERE key = ANY(${keys})
  `;
  const map: Record<string, any> = {};
  for (const r of rows) map[r.key] = r.value;
  return keys.map(k => map[k] ?? null);
}

export async function mset(entries: Record<string, any>): Promise<void> {
  const pairs = Object.entries(entries);
  if (!pairs.length) return;
  // Upsert one at a time to keep it simple and safe
  for (const [key, value] of pairs) {
    await set(key, value);
  }
}

export async function mdel(keys: string[]): Promise<void> {
  if (!keys.length) return;
  await sql()`DELETE FROM kv_store_ec8fe879 WHERE key = ANY(${keys})`;
}

export async function getByPrefix(prefix: string): Promise<any[]> {
  const pattern = prefix + "%";
  const rows = await sql()`
    SELECT value FROM kv_store_ec8fe879 WHERE key LIKE ${pattern}
  `;
  return rows.map((r: any) => r.value);
}