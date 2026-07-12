/**
 * db.tsx — Minimal shared postgres connection.
 * Uses session pooler URL (port 6543) - set SUPABASE_DB_URL to pooler URL.
 */
import postgres from "npm:postgres";

let _sql: ReturnType<typeof postgres> | null = null;

export function sql() {
  if (!_sql) {
    // Force session pooler port — direct port 5432 is blocked in Edge Functions
    const rawUrl = Deno.env.get("SUPABASE_DB_URL")!;
    // Force port 6543 (session pooler). Strip ALL query params — PgBouncer
    // rejects unknown startup parameters like statement_timeout, options, etc.
    let dbUrl = rawUrl.replace(/:5432\b/, ":6543");
    try {
      const u = new URL(dbUrl);
      u.search = "";
      dbUrl = u.toString();
    } catch { /* non-URL format — leave as-is */ }
    _sql = postgres(dbUrl, {
      port:              6543,
      max:               3,
      idle_timeout:      10,
      connect_timeout:   8,
      ssl:               "require",
      prepare:           false,
      fetch_types:       false,
      // Explicitly disable these or PgBouncer rejects them as startup parameters
      statement_timeout: false,
      lock_timeout:      false,
      connection:        {
        application_name: "filmons-edge",
      },
      onnotice:          () => {},
    });
  }
  return _sql;
}

export function safeJson(v: any, fallback: any): any {
  if (v == null) return fallback;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return fallback; }
}