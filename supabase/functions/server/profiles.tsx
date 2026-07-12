/**
 * profiles.tsx — Direct Postgres CRUD on the `profiles` table.
 *
 * Resilient to schema differences:
 *   • id column may be uuid or text — we always generate valid UUIDs and
 *     guard reads so non-UUID IDs (e.g. "demo-user-1") return null cleanly.
 *   • Optional columns (birthdate, cover_photo, links, instagram, facebook,
 *     whatsapp, account_category) may be absent in older schemas. The first
 *     write that fails with "column does not exist" (42703) auto-discovers
 *     which columns are missing, caches that knowledge, and retries.
 */

import { sql, safeJson } from "./db.tsx";

// ── Connection shared via db.tsx ──────────────────────────────────────────────


// ── UUID helpers ──────────────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID  = (s: string) => UUID_RE.test(s);
const genId   = () => crypto.randomUUID();

// ── Optional-column auto-discovery ───────────────────────────────────────────
// Columns that may be missing in older/custom schemas.
const OPTIONAL_COLS = new Set([
  // fields often absent in hand-created or Supabase-Auth-created tables
  "phone", "username", "birthdate",
  "avatar", "avatar_url", "cover_photo", "banner_url", "bio", "location",
  "links", "account_category", "account_type", "account_mode",
  "followers", "following",
  "instagram", "facebook", "whatsapp",
  "is_verified", "verification_status", "contact_public",
  // structured address fields
  "street_address", "city", "province", "postal_code",
  "website", "youtube", "tiktok", "years_exp", "cover_photo", "banner_url", "profile_meta",
]);
// Grows at runtime when a 42703 ("column does not exist") error is caught.
const _excluded = new Set<string>();

function extractMissingCol(err: any): string | null {
  const m = String(err?.message ?? "")
    .match(/column "([^"]+)" of relation "profiles" does not exist/);
  return m?.[1] ?? null;
}

// ── JSONB columns ─────────────────────────────────────────────────────────���───
const JSONB_COLS = new Set(["followers", "following", "links"]);

// ── Runtime column-type detection ────────────────────────────────────────────
// Some schemas use text[] instead of jsonb for followers / following / links.
// We query information_schema once and remember which of our "array" columns
// are actually text[] so we can skip the ::jsonb cast for them.
const _textArrayCols = new Set<string>();   // filled by ensureColTypes()
let   _colTypesReady = false;

async function ensureColTypes() {
  if (_colTypesReady) return;
  _colTypesReady = true;
  try {
    const rows = await sql()`
      SELECT column_name, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'profiles'
        AND column_name IN ('followers', 'following', 'links')
    `;
    for (const row of rows) {
      // udt_name is "_text" for text[], "jsonb" for jsonb
      if (String(row.udt_name).startsWith("_")) {
        _textArrayCols.add(String(row.column_name));
      }
    }
    if (_textArrayCols.size) {
      console.log("[profiles] text[] cols detected:", [..._textArrayCols]);
    }
  } catch (e) {
    console.warn("[profiles] ensureColTypes failed:", e);
  }
}

// ── Row → camelCase User ────────────────────────────────────────────────────
function rowToUser(row: any) {
  return {
    id:                  row.id,
    email:               row.email               ?? undefined,
    phone:               row.phone               ?? undefined,
    name:                row.name || row.username || row.email?.split('@')[0] || 'User',
    username:            row.username            ?? undefined,
    birthdate:           row.birthdate           ?? undefined,
    avatar:              row.avatar_url           ?? row.avatar      ?? undefined,
    coverPhoto:          row.banner_url           ?? row.cover_photo ?? undefined,
    bio:                 row.bio                 ?? undefined,
    location:            row.location            ?? undefined,
    streetAddress:       row.street_address      ?? undefined,
    city:                row.city                ?? undefined,
    province:            row.province            ?? undefined,
    postalCode:          row.postal_code         ?? undefined,
    links:               row.links               ?? [],
    accountCategory:     row.account_category    ?? undefined,
    accountType:         row.account_type        ?? "renter",
    accountMode:         row.account_mode        ?? "creator",
    followers:           row.followers           ?? [],
    following:           row.following           ?? [],
    instagram:           row.instagram           ?? undefined,
    facebook:            row.facebook            ?? undefined,
    whatsapp:            row.whatsapp            ?? undefined,
    isVerified:          row.is_verified         ?? false,
    verificationStatus:  row.verification_status ?? "unverified",
    contactPublic:       row.contact_public      ?? false,
    website:             row.website             ?? undefined,
    youtube:             row.youtube             ?? undefined,
    tiktok:              row.tiktok              ?? undefined,
    yearsExp:            row.years_exp           ?? undefined,
    profileMeta:         row.profile_meta        ?? {},
    createdAt:           row.created_at
      ? new Date(row.created_at).toISOString()
      : undefined,
  };
}

// ── Phone normalisation ───────────────────────────────────────────────────────
const normalizePhone = (p: string) => p.replace(/\D/g, "");

// ═══════════════════════════════════════════════════════════════════════════════
// READS  (UUID-guarded — non-UUID IDs return null instead of throwing)
// ═══════════════════════════════════════════════════════════════════════════════

export async function getById(id: string) {
  if (!isUUID(id)) return null;                    // "demo-user-1" etc. → null
  try {
    const rows = await sql()`SELECT * FROM profiles WHERE id = ${id} LIMIT 1`;
    return rows[0] ? rowToUser(rows[0]) : null;
  } catch (e: any) {
    if (e?.code === "22P02") return null;           // invalid uuid syntax → null
    throw e;
  }
}

export async function getByEmail(email: string) {
  try {
    const rows = await sql()`
      SELECT * FROM profiles WHERE lower(email) = ${email.toLowerCase()} LIMIT 1
    `;
    return rows[0] ? rowToUser(rows[0]) : null;
  } catch { return null; }
}

export async function getByPhone(phone: string) {
  const normalized = normalizePhone(phone);
  try {
    // Check account_identities first — this is the canonical source for
    // which profile owns a given phone number (handles account linking).
    const identity = await sql()`
      SELECT profile_id FROM account_identities
      WHERE provider = 'phone' AND provider_identifier = ${normalized}
      LIMIT 1
    `;
    if (identity[0]?.profile_id) {
      const rows = await sql()`SELECT * FROM profiles WHERE id = ${identity[0].profile_id} LIMIT 1`;
      if (rows[0]) {
        console.log(`[profiles] getByPhone → resolved via account_identities profile=${identity[0].profile_id}`);
        return rowToUser(rows[0]);
      }
    }
  } catch (e) {
    console.warn("[profiles] getByPhone identity lookup failed, falling back:", e);
  }
  // Fall back to direct profiles.phone column comparison
  try {
    const rows = await sql()`
      SELECT * FROM profiles
      WHERE regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = ${normalized}
      LIMIT 1
    `;
    return rows[0] ? rowToUser(rows[0]) : null;
  } catch { return null; }
}

export async function getAll(limit = 200) {
  try {
    const rows = await sql()`SELECT * FROM profiles ORDER BY created_at DESC LIMIT ${limit}`;
    return rows.map(rowToUser);
  } catch { return []; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// WRITES — dynamic, schema-resilient
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build a parameterised INSERT or SET clause using sql.unsafe().
 * Column names come from a hardcoded allow-list — no injection risk.
 */
function buildInsertParts(data: any, excluded: Set<string>, isUpdate = false) {
  const id = (data.id && isUUID(data.id)) ? data.id : genId();

  // ── Core columns (absolute minimum — present in virtually every schema) ──
  const cols: string[] = ["id", "email", "name"];
  const vals: any[] = [
    id,
    data.email ? data.email.toLowerCase() : null,
    data.name || `User_${id.slice(-6)}`,
  ];

  // ── All other columns are optional (auto-excluded on 42703 errors) ──
  const optMap: Record<string, any> = {
    phone:               data.phone ?? null,
    username:            data.username ?? null,
    birthdate:           data.birthdate ?? null,
    avatar:              data.avatar ?? null,
    avatar_url:          data.avatar ?? null,        // mirrors avatar for Supabase Storage URL
    cover_photo:         data.coverPhoto ?? null,
    banner_url:          data.coverPhoto ?? null,    // mirrors cover_photo for Supabase Storage URL
    bio:                 data.bio ?? null,
    location:            data.location ?? null,
    street_address:      data.streetAddress ?? null,
    city:                data.city ?? null,
    province:            data.province ?? null,
    postal_code:         data.postalCode ?? null,
    // Array columns: value format decided at query-build time (see execCreate/execUpdate)
    links:               data.links ?? [],
    account_category:    data.accountCategory ?? null,
    account_type:        data.accountType ?? "renter",
    account_mode:        data.accountMode ?? (data.accountType === "business" ? "business" : "creator"),
    followers:           data.followers ?? [],
    following:           data.following ?? [],
    instagram:           data.instagram ?? null,
    facebook:            data.facebook ?? null,
    whatsapp:            data.whatsapp ?? null,
    is_verified:         data.isVerified ?? false,
    verification_status: data.verificationStatus ?? "unverified",
    contact_public:      data.contactPublic ?? false,
    website:             data.website ?? null,
    youtube:             data.youtube ?? null,
    tiktok:              data.tiktok  ?? null,
    years_exp:           data.yearsExp ? parseInt(data.yearsExp) : null,
    profile_meta:        data.profileMeta ? JSON.stringify(data.profileMeta) : '{}',
  };

  for (const [col, val] of Object.entries(optMap)) {
    if (!excluded.has(col)) { cols.push(col); vals.push(val); }
  }

  return { id, cols, vals };
}

/** Execute a single INSERT attempt. Throws on any error. */
async function execCreate(data: any): Promise<any> {
  await ensureColTypes();                          // detect text[] vs jsonb once
  const { id, cols, vals } = buildInsertParts(data, _excluded);

  const colList      = cols.map(c => `"${c}"`).join(", ");
  const placeholders = cols.map((c, i) => {
    if (JSONB_COLS.has(c)) {
      // text[] column → pass JS array as-is (postgres.js handles the cast)
      // jsonb column  → keep the ::jsonb cast, but stringify the value first
      if (_textArrayCols.has(c)) {
        // postgres.js needs a real JS array for text[] — never pass null/string
        if (!Array.isArray(vals[i])) vals[i] = [];
        return `$${i + 1}`;
      }
      vals[i] = JSON.stringify(vals[i] ?? []);     // ensure it's a string for ::jsonb
      return `$${i + 1}::jsonb`;
    }
    return `$${i + 1}`;
  }).join(", ");

  const q = `INSERT INTO profiles (${colList}) VALUES (${placeholders}) RETURNING *`;
  const rows = await sql().unsafe(q, vals);
  if (!rows[0]) throw new Error("INSERT returned no rows");
  return rowToUser(rows[0]);
}

/** Execute a single UPDATE attempt. Throws on any error. */
async function execUpdate(id: string, merged: any): Promise<any> {
  await ensureColTypes();                          // detect text[] vs jsonb once
  const { cols, vals } = buildInsertParts(merged, _excluded);

  // Remove "id" from the SET clause (it's the WHERE key)
  const setCols = cols.filter(c => c !== "id");
  const setVals = vals.slice(1);                   // vals[0] is the id

  // Resolve array column values & placeholders
  const setClause = setCols.map((c, i) => {
    if (JSONB_COLS.has(c)) {
      if (_textArrayCols.has(c)) {
        if (!Array.isArray(setVals[i])) setVals[i] = [];
        return `"${c}" = $${i + 1}`;
      }
      setVals[i] = JSON.stringify(setVals[i] ?? []);  // stringify for ::jsonb
      return `"${c}" = $${i + 1}::jsonb`;
    }
    return `"${c}" = $${i + 1}`;
  }).join(", ");

  const q = `UPDATE profiles SET ${setClause} WHERE id = $${setCols.length + 1} RETURNING *`;
  const rows = await sql().unsafe(q, [...setVals, id]);
  if (!rows[0]) throw new Error(`Update found no row for id: ${id}`);
  return rowToUser(rows[0]);
}

// ── Satisfy profiles_id_fkey by creating an auth.users shadow entry ───────────
async function ensureAuthUser(id: string, email?: string, phone?: string): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.warn("[profiles] SUPABASE_URL / SERVICE_ROLE_KEY not set — cannot create auth shadow user");
    return id;
  }

  const body: Record<string, any> = {
    id,
    email_confirm: true,
    phone_confirm: true,
  };

  if (email) {
    // Email-based account: use the real email
    body.email = email.toLowerCase();
  } else if (phone) {
    // Phone-only account: authenticate with the phone number — no fake email
    body.phone = phone.startsWith("+") ? phone : `+${phone.replace(/\D/g, "")}`;
  } else {
    // Last-resort fallback (should rarely happen)
    body.email = `${id}@filmons-shadow.internal`;
  }

  // Always include phone if present (even for email accounts)
  if (phone && email) {
    body.phone = phone.startsWith("+") ? phone : `+${phone.replace(/\D/g, "")}`;
  }

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "apikey":        serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(body),
    });

    const payload = await res.json().catch(() => ({}));

    if (res.ok) {
      // Use the ID Supabase actually assigned (may differ from what we sent)
      const assignedId = payload?.id ?? id;
      console.log("[profiles] auth shadow user created — id:", assignedId);
      return assignedId;
    }

    if (res.status === 422) {
      // User already exists — fetch their real ID by email
      try {
        const listRes = await fetch(
          `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(body.email)}`,
          {
            headers: {
              "apikey":        serviceKey,
              "Authorization": `Bearer ${serviceKey}`,
            },
          }
        );
        if (listRes.ok) {
          const listData = await listRes.json();
          const existing = listData?.users?.[0];
          if (existing?.id) {
            console.log("[profiles] existing auth user found — id:", existing.id);
            return existing.id;
          }
        }
      } catch { /* fall through */ }
    }

    console.warn("[profiles] ensureAuthUser:", res.status, payload);
  } catch (err) {
    console.warn("[profiles] ensureAuthUser fetch error:", err);
  }

  return id; // fall back to our generated id
}

// ── Insert a row into public.users so profiles_id_fkey is satisfied ───────────
// Tries progressively richer column sets; stops as soon as one succeeds.
// Uses ON CONFLICT DO NOTHING so it is safe to call multiple times.
async function ensurePublicUser(id: string, email?: string, name?: string): Promise<void> {
  const fallbackEmail = email ? email.toLowerCase() : `${id}@filmons-shadow.internal`;
  const fallbackName  = name  || "Filmons User";

  // Ordered from minimal → richer; we stop at the first success.
  const attempts = [
    () => sql().unsafe(
      `INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [id]
    ),
    () => sql().unsafe(
      `INSERT INTO users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
      [id, fallbackEmail]
    ),
    () => sql().unsafe(
      `INSERT INTO users (id, email, name) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [id, fallbackEmail, fallbackName]
    ),
    () => sql().unsafe(
      `INSERT INTO users (id, email, full_name) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [id, fallbackEmail, fallbackName]
    ),
    () => sql().unsafe(
      `INSERT INTO users (id, email, full_name, updated_at) VALUES ($1, $2, $3, now()) ON CONFLICT (id) DO NOTHING`,
      [id, fallbackEmail, fallbackName]
    ),
  ];

  for (const attempt of attempts) {
    try {
      await attempt();
      console.log("[profiles] public.users row ensured for id:", id);
      return;
    } catch (e: any) {
      const code = e?.code;
      // NOT NULL missing column → try next richer variant
      if (code === "23502" || code === "42703") continue;
      // FK violation: public.users.id → auth.users → caller already handles that
      if (code === "23503") { console.warn("[profiles] public.users FK:", e.message); return; }
      // Table doesn't exist — FK must point to auth.users after all; nothing to do
      if (code === "42P01") { console.warn("[profiles] public.users table not found"); return; }
      // Any other error: log and bail — don't block the signup
      console.warn("[profiles] ensurePublicUser non-fatal:", e?.message);
      return;
    }
  }
}

// ── Upsert identity record after profile creation ─────────────────────────────
async function upsertIdentity(profileId: string, provider: string, identifier: string): Promise<void> {
  if (!identifier) return;
  try {
    await sql()`
      INSERT INTO account_identities (profile_id, provider, provider_identifier)
      VALUES (${profileId}, ${provider}, ${identifier})
      ON CONFLICT (provider, provider_identifier) DO NOTHING
    `;
    console.log(`[profiles] identity linked: provider=${provider} identifier=${identifier} → profile=${profileId}`);
  } catch (e) {
    console.warn("[profiles] upsertIdentity non-fatal:", e);
  }
}

// ── Public create ─────────────────────────────────────────────────────────────
export async function create(data: any): Promise<any> {
  let id = (data.id && isUUID(data.id)) ? data.id : genId();
  let payload = { ...data, id };

  let fkHandled = false;

  for (let attempt = 0; attempt <= OPTIONAL_COLS.size + 1; attempt++) {
    try {
      const created = await execCreate(payload);
      // Record identity links so future lookups resolve to this canonical profile
      const createdId = created?.id || id;
      if (data.email) await upsertIdentity(createdId, "email", data.email.toLowerCase());
      if (data.phone) await upsertIdentity(createdId, "phone", normalizePhone(data.phone));
      return created;
    } catch (e: any) {
      // ── Missing column → exclude and retry ──────────────────────────────
      if (e?.code === "42703") {
        const col = extractMissingCol(e);
        if (col && OPTIONAL_COLS.has(col) && !_excluded.has(col)) {
          console.warn(`[profiles] Column "${col}" not found — excluding and retrying`);
          _excluded.add(col);
          continue;
        }
      }

      // ── FK violation → create parent rows, then retry once ───────────────
      if (e?.code === "23503" && !fkHandled) {
        fkHandled = true;
        console.warn("[profiles] FK violation — seeding parent rows and retrying");

        // 1. Create auth.users entry; capture the ID Supabase actually assigned
        const authId = await ensureAuthUser(id, data.email, data.phone);

        // 2. If Supabase returned a different UUID, rebuild the payload with it
        if (authId && authId !== id) {
          console.log(`[profiles] Switching id ${id} → ${authId} (auth-assigned)`);
          id      = authId;
          payload = { ...data, id };
        }

        // 3. Insert into public.users with the resolved id
        await ensurePublicUser(id, data.email, data.name);

        // 4. A trigger (e.g. handle_new_user) may have auto-created the profile
        //    row when auth.users was inserted — check before retrying INSERT.
        const triggered = await getById(id);
        if (triggered) {
          console.log("[profiles] Profile auto-created by trigger — updating with signup data");
          return await update(id, { ...data, id });
        }

        continue;
      }

      // ── Unique conflict after FK retry → trigger beat us to it ───────────
      //    Fetch the existing row (created by the trigger) and update it.
      if (e?.code === "23505" && fkHandled) {
        console.warn("[profiles] 23505 after FK retry — profile exists (trigger), updating");
        try {
          const existing = await getById(id);
          if (existing) return await update(id, { ...data, id });
        } catch (ue) {
          console.warn("[profiles] update-after-conflict failed:", ue);
        }
      }

      // ── Unique constraint on a fresh signup → duplicate user ─────────────
      if (e?.code === "23505") {
        const msg = String(e?.message ?? "");
        if (msg.includes("email"))    throw new Error("User with this email already exists");
        if (msg.includes("phone"))    throw new Error("User with this phone number already exists");
        if (msg.includes("username")) throw new Error("Username is already taken");
        throw new Error("User already exists");
      }

      throw e;
    }
  }
  throw new Error("Failed to create profile after retrying all optional columns");
}

// ── Public update ─────────────────────────────────────────────────────────────
export async function update(id: string, data: any): Promise<any> {
  if (!isUUID(id)) throw new Error(`Invalid profile id: ${id}`);

  await ensureColTypes();

  // Fast partial UPDATE — only touch columns that are explicitly provided
  const FIELD_MAP: Record<string, string> = {
    name: "name", email: "email", phone: "phone", username: "username",
    bio: "bio", location: "location", city: "city", province: "province",
    postalCode: "postal_code", streetAddress: "street_address",
    avatar: "avatar_url", coverPhoto: "cover_photo",
    website: "website", youtube: "youtube", tiktok: "tiktok",
    instagram: "instagram", birthdate: "birthdate",
    yearsExp: "years_exp", profileMeta: "profile_meta",
    accountType: "account_type", accountMode: "account_mode",
    accountCategory: "account_category",
    isVerified: "is_verified", verificationStatus: "verification_status",
    followers: "followers", following: "following",
  };

  const setCols: string[] = [];
  const setVals: any[]    = [];

  for (const [jsKey, sqlCol] of Object.entries(FIELD_MAP)) {
    if (jsKey in data && data[jsKey] !== undefined && !_excluded.has(sqlCol)) {
      let val = (data as any)[jsKey];
      if (sqlCol === "profile_meta") val = JSON.stringify(val ?? {});
      else if (sqlCol === "followers" || sqlCol === "following") {
        if (!_textArrayCols.has(sqlCol)) val = JSON.stringify(Array.isArray(val) ? val : []);
      }
      if (sqlCol === "years_exp") val = val ? parseInt(val) : null;
      setCols.push(sqlCol);
      setVals.push(val);
    }
  }
  // Mirror avatar → avatar column
  if ("avatar" in data && !_excluded.has("avatar")) { setCols.push("avatar"); setVals.push(data.avatar); }
  // Mirror coverPhoto → banner_url
  if ("coverPhoto" in data && !_excluded.has("banner_url")) { setCols.push("banner_url"); setVals.push(data.coverPhoto); }

  if (setCols.length === 0) {
    const cur = await getById(id);
    if (!cur) throw new Error(`Profile not found: ${id}`);
    return cur;
  }

  for (let attempt = 0; attempt <= 6; attempt++) {
    const activeCols = setCols.filter(c => !_excluded.has(c));
    const activeVals = setVals.filter((_, i) => !_excluded.has(setCols[i]));
    if (activeCols.length === 0) break;
    try {
      const setClause = activeCols.map((c, i) => `"${c}" = $${i + 1}`).join(", ");
      const rows = await sql().unsafe(
        `UPDATE profiles SET ${setClause} WHERE id = $${activeCols.length + 1} RETURNING *`,
        [...activeVals, id]
      );
      if (rows[0]) return rowToUser(rows[0]);
      throw new Error(`Update matched no row for id: ${id}`);
    } catch (e: any) {
      if (e?.code === "42703") {
        const m = String(e.message).match(/column "([^"]+)" of relation "profiles" does not exist/);
        if (m?.[1]) { _excluded.add(m[1]); console.warn(`[profiles] excluding missing col: ${m[1]}`); continue; }
      }
      throw e;
    }
  }
  throw new Error("Failed to update profile");
}

// ── Public remove ─────────────────────────────────────────────────────────────
export async function remove(id: string) {
  if (!isUUID(id)) return;                        // nothing to delete
  await sql()`DELETE FROM profiles WHERE id = ${id}`;
}