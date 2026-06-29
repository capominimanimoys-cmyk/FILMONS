import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { sql } from "./db.tsx";
// kv.tsx — direct Postgres for listings, reviews, conversations, etc.
import * as kv from "./kv.tsx";
// profiles.tsx — direct Postgres for the `profiles` table (user accounts)
import * as profiles from "./profiles.tsx";
// posts.tsx — direct Postgres for the `posts` table
import * as postsDb from "./posts.tsx";
// comments.tsx — direct Postgres for the `comments` table
import * as commentsDb from "./comments.tsx";
// notifications.tsx — direct Postgres for the `notifications` table
import * as notifsDb from "./notifications.tsx";
// conversations.tsx — direct Postgres for conversations + messages tables
import * as convsDb from "./conversations.tsx";
import verificationsDb from "./verifications.tsx";
import { registerAiEditorRoutes } from "./aiEditor.tsx";

const app = new Hono();

// ── Health / keep-alive ───────────────────────────────────────────────────────
app.get("/make-server-ec8fe879/health", (c) => c.json({ ok: true, ts: Date.now() }));

// ── AI Editor ────────────────────────────────────────────────────────────────
registerAiEditorRoutes(app);

app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "apikey", "x-client-info"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  }),
);
app.use("*", logger(console.log));
// verificationsDb routes are registered directly below as /make-server-ec8fe879/verifications/*

// ── ID generator ───────────────────��───────────────────────────────────────
function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Health ───────────────────────────────────────────���─────────────────────

// ═══════════════════════════════════════════════════════════════════════════
// PHONE OTP  (Twilio directly — no Supabase Auth phone dependency)
// ═══════════════════════════════════════════════════════════════════════════

// POST /send-phone-otp  { phone }
app.post("/make-server-ec8fe879/send-phone-otp", async (c) => {
  try {
    const { phone } = await c.req.json();
    if (!phone) return c.json({ error: "phone required" }, 400);

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const fromPhone = Deno.env.get("TWILIO_PHONE_NUMBER");
    if (!accountSid || !authToken || !fromPhone) {
      return c.json(
        { error: "Twilio credentials not configured" },
        500,
      );
    }

    // Always normalize to digits-only for the KV key — this is the source of
    // any send/verify mismatch when the phone has spaces, dashes, or parens.
    const digits = String(phone).replace(/\D/g, "");
    const e164 = `+${digits}`; // E.164 for Twilio To field
    const kvKey = `otp:${digits}`; // digits-only key — always consistent

    const code = Math.floor(
      100000 + Math.random() * 900000,
    ).toString();

    // Store code in KV with timestamp for 10-minute expiry
    await kv.set(kvKey, { code, createdAt: Date.now() });

    console.log(
      `[OTP] Storing code for key="${kvKey}" code="${code}"`,
    );

    // Send SMS via Twilio REST API
    const body = new URLSearchParams({
      To: e164,
      From: fromPhone,
      Body: `Your Filmons verification code is: ${code}. Expires in 10 minutes.`,
    });

    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!twilioRes.ok) {
      const err = await twilioRes.json().catch(() => ({}));
      console.error("Twilio error:", JSON.stringify(err));
      return c.json(
        { error: err.message || "Failed to send SMS" },
        500,
      );
    }

    console.log(`[OTP] SMS sent to ${e164}`);
    return c.json({ success: true });
  } catch (e) {
    console.error("send-phone-otp error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ── Withdrawal OTP (Twilio SMS — same pattern as phone OTP) ─────────────────

// POST /send-withdrawal-otp  { userId, phone }
app.post("/make-server-ec8fe879/send-withdrawal-otp", async (c) => {
  try {
    const { userId, phone } = await c.req.json();
    if (!userId || !phone) return c.json({ error: "userId and phone required" }, 400);

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken  = Deno.env.get("TWILIO_AUTH_TOKEN");
    const fromPhone  = Deno.env.get("TWILIO_PHONE_NUMBER");
    if (!accountSid || !authToken || !fromPhone)
      return c.json({ error: "SMS service not configured" }, 500);

    const digits = String(phone).replace(/\D/g, "");
    const e164   = `+${digits}`;
    const code   = Math.floor(100000 + Math.random() * 900000).toString();
    const exp    = Date.now() + 10 * 60 * 1000;

    await kv.set(`withdrawal_otp:${userId}`, { code, exp });

    const body = new URLSearchParams({
      To: e164, From: fromPhone,
      Body: `Your Filmons withdrawal verification code is: ${code}. Expires in 10 minutes.`,
    });
    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!twilioRes.ok) {
      const err = await twilioRes.json().catch(() => ({}));
      return c.json({ error: (err as any).message || "Failed to send SMS" }, 500);
    }

    // Token is just a signed reference — userId is sufficient for stateless lookup
    const token = btoa(JSON.stringify({ userId, exp }));
    console.log(`[withdrawal-otp] Sent to ${e164} for user ${userId}`);
    return c.json({ success: true, token });
  } catch (e) {
    console.error("send-withdrawal-otp error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// POST /verify-withdrawal-otp  { userId, code, token }
app.post("/make-server-ec8fe879/verify-withdrawal-otp", async (c) => {
  try {
    const { userId, code, token } = await c.req.json();
    if (!userId || !code) return c.json({ error: "userId and code required" }, 400);

    // Decode token to extract userId as fallback (token was issued by send-withdrawal-otp)
    let resolvedUserId = userId;
    if (token) {
      try {
        const decoded = JSON.parse(atob(token));
        if (decoded.userId) resolvedUserId = decoded.userId;
      } catch { /* use provided userId */ }
    }

    const raw = await kv.get(`withdrawal_otp:${resolvedUserId}`);
    if (!raw) return c.json({ error: "No verification code found. Please request a new code." }, 400);

    const stored: { code: string; exp: number } =
      typeof raw === "string" ? JSON.parse(raw) : raw;

    if (Date.now() > stored.exp) {
      await kv.del(`withdrawal_otp:${resolvedUserId}`);
      return c.json({ error: "Verification code has expired. Please request a new code." }, 400);
    }

    if (String(stored.code) !== String(code).trim())
      return c.json({ error: "Invalid verification code. Please try again." }, 400);

    await kv.del(`withdrawal_otp:${resolvedUserId}`);
    console.log(`[withdrawal-otp] Verified for user ${resolvedUserId}`);
    return c.json({ success: true });
  } catch (e) {
    console.error("verify-withdrawal-otp error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// POST /verify-phone-otp  { phone, code }
app.post(
  "/make-server-ec8fe879/verify-phone-otp",
  async (c) => {
    try {
      const { phone, code } = await c.req.json();
      if (!phone || !code)
        return c.json(
          { error: "phone and code required" },
          400,
        );

      // Use the same digits-only key as the send endpoint
      const digits = String(phone).replace(/\D/g, "");
      const kvKey = `otp:${digits}`;

      const raw = await kv.get(kvKey);

      console.log(
        `[OTP] Verify — key="${kvKey}" received="${code}" raw=${JSON.stringify(raw)}`,
      );

      if (!raw) {
        return c.json(
          {
            error:
              "No verification code found. Please request a new code.",
          },
          400,
        );
      }

      // Safely parse: the value might be a plain object (jsonb) or a JSON string (text column)
      const stored: { code: string; createdAt: number } =
        typeof raw === "string" ? JSON.parse(raw) : raw;

      // 10-minute expiry
      if (Date.now() - stored.createdAt > 10 * 60 * 1000) {
        await kv.del(kvKey);
        return c.json(
          {
            error:
              "Verification code has expired. Please request a new code.",
          },
          400,
        );
      }

      if (String(stored.code) !== String(code).trim()) {
        console.warn(
          `[OTP] Mismatch — stored="${stored.code}" received="${code}"`,
        );
        return c.json(
          {
            error:
              "Invalid verification code. Please try again.",
          },
          400,
        );
      }

      // Consume the code so it can't be reused
      await kv.del(kvKey);
      console.log(`[OTP] Verified for digits=${digits}`);
      return c.json({ success: true });
    } catch (e) {
      console.error("verify-phone-otp error:", e);
      return c.json({ error: String(e) }, 500);
    }
  },
);

// ── Photo enrichment: overlay KV-stored photos onto a profile row ───────────
// Reliable regardless of whether profiles table has avatar/cover_photo columns.
async function mergePhotos(user: any): Promise<any> {
  if (!user?.id) return user;
  try {
    const res = await kv.mget([
      `photo:avatar:${user.id}`,
      `photo:cover:${user.id}`,
    ]);

    const avatar = Array.isArray(res) ? res[0] : undefined;
    const cover = Array.isArray(res) ? res[1] : undefined;
    return {
      ...user,
      avatar:
        user.avatar ??
        (avatar != null ? String(avatar) : undefined),
      coverPhoto:
        user.coverPhoto ??
        (cover != null ? String(cover) : undefined),
    };
  } catch {
    return user;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// USERS  (backed by `profiles` Postgres table — no kv_store)
// ═══════════════════════════════════════════════════════════════════════════

// GET /users
app.get("/make-server-ec8fe879/users", async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query("limit") || "200", 10), 500);
    const users = await profiles.getAll(limit);
    c.header("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
    return c.json({ users });
  } catch (e) {
    console.error("Get users error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// GET /users/by-phone/:phone  — MUST be before /users/:id
app.get(
  "/make-server-ec8fe879/users/by-phone/:phone",
  async (c) => {
    try {
      const phone = decodeURIComponent(c.req.param("phone"));
      const user = await profiles.getByPhone(phone);
      return c.json({
        user: user ? await mergePhotos(user) : null,
      });
    } catch (e) {
      console.error("Get user by phone error:", e);
      return c.json({ error: String(e) }, 500);
    }
  },
);

// GET /users/by-email/:email  — MUST be before /users/:id
app.get(
  "/make-server-ec8fe879/users/by-email/:email",
  async (c) => {
    try {
      const email = decodeURIComponent(c.req.param("email"));
      const user = await profiles.getByEmail(email);
      return c.json({
        user: user ? await mergePhotos(user) : null,
      });
    } catch (e) {
      console.error("Get user by email error:", e);
      return c.json({ error: String(e) }, 500);
    }
  },
);

// GET /users/:id
app.get("/make-server-ec8fe879/users/:id", async (c) => {
  try {
    const user = await profiles.getById(c.req.param("id"));
    if (!user) return c.json({ error: "User not found" }, 404);
    return c.json({ user: await mergePhotos(user) });
  } catch (e) {
    console.error("Get user error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// POST /users — create profile row
app.post("/make-server-ec8fe879/users", async (c) => {
  try {
    const body = await c.req.json();

    // Pre-check for clean 409 messages (profiles.create also catches DB constraint violations)
    if (body.email) {
      const existing = await profiles.getByEmail(body.email);
      if (existing)
        return c.json(
          { error: "User with this email already exists" },
          409,
        );
    }
    if (body.phone) {
      const existing = await profiles.getByPhone(body.phone);
      if (existing)
        return c.json(
          {
            error: "User with this phone number already exists",
          },
          409,
        );
    }

    const user = await profiles.create(body);
    return c.json({ user }, 201);
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (
      msg.includes("already exists") ||
      msg.includes("already taken")
    ) {
      return c.json({ error: msg }, 409);
    }
    console.error("Create user error:", e);
    return c.json({ error: msg }, 500);
  }
});

// PUT /users/:id — update profile row
app.put("/make-server-ec8fe879/users/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const updates = await c.req.json();

    // ── Persist photo URLs to KV (reliable regardless of DB column existence) ──
    // Accepts both storage https:// URLs (new) and legacy data: URLs (fallback)
    const photoWrites: Promise<void>[] = [];
    if (
      typeof updates.avatar === "string" &&
      (updates.avatar.startsWith("https://") ||
        updates.avatar.startsWith("data:"))
    ) {
      photoWrites.push(
        kv.set(`photo:avatar:${id}`, updates.avatar),
      );
      console.log(`[photos] Cached avatar URL for user ${id}`);
    }
    if (
      typeof updates.coverPhoto === "string" &&
      (updates.coverPhoto.startsWith("https://") ||
        updates.coverPhoto.startsWith("data:"))
    ) {
      photoWrites.push(
        kv.set(`photo:cover:${id}`, updates.coverPhoto),
      );
      console.log(`[photos] Cached cover URL for user ${id}`);
    }
    // Handle explicit clears
    if (updates.avatar === "" || updates.avatar === null) {
      photoWrites.push(kv.del(`photo:avatar:${id}`));
    }
    if (
      updates.coverPhoto === "" ||
      updates.coverPhoto === null
    ) {
      photoWrites.push(kv.del(`photo:cover:${id}`));
    }
    if (photoWrites.length) await Promise.all(photoWrites);

    // ── Persist profileMeta to KV (for quick reads) ─────────────────────────
    if (updates.profileMeta && typeof updates.profileMeta === 'object') {
      await kv.set(`profile_meta:${id}`, updates.profileMeta).catch(() => {});
    }
    // ── Persist website/youtube/tiktok to KV ─────────────────────────────────
    const socialFields = ['website','youtube','tiktok','yearsExp'];
    const socialData: Record<string,any> = {};
    for (const f of socialFields) {
      if (updates[f] !== undefined) socialData[f] = updates[f];
    }
    if (Object.keys(socialData).length) {
      const existing = (await kv.get(`social:${id}`)) ?? {};
      await kv.set(`social:${id}`, { ...existing, ...socialData }).catch(() => {});
    }

    // ── Update profiles table — with KV fallback for legacy / non-UUID users ──
    // Users created before the DB migration may have non-UUID IDs or may not
    // yet have a row in `profiles`. We fall back to the KV store so the app
    // keeps working regardless of the user's origin.
    let user: any;
    try {
      user = await profiles.update(id, updates);
    } catch (profileErr: any) {
      console.warn(
        `[PUT /users/${id}] profiles.update failed (${profileErr?.message}) — falling back to KV`,
      );
      const kvUser = (await kv.get(`user:${id}`)) ?? {};
      const merged = {
        ...kvUser,
        ...updates,
        id,
        updatedAt: new Date().toISOString(),
      };
      await kv.set(`user:${id}`, merged);
      user = merged;
    }

    // ── Merge KV photos into returned user (so UI updates immediately) ────
    const enriched = await mergePhotos(user);
    return c.json({ user: enriched });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes("not found"))
      return c.json({ error: msg }, 404);
    console.error("Update user error:", e);
    return c.json({ error: msg }, 500);
  }
});

// POST /users/:id/follow
app.post(
  "/make-server-ec8fe879/users/:id/follow",
  async (c) => {
    try {
      const targetId = c.req.param("id");
      const { currentUserId } = await c.req.json();

      if (!currentUserId)
        return c.json({ error: "currentUserId required" }, 400);

      if (currentUserId === targetId)
        return c.json({ error: "Cannot follow yourself" }, 400);

      const [cur, target] = await Promise.all([
        profiles.getById(currentUserId),
        profiles.getById(targetId),
      ]);

      if (!cur || !target)
        return c.json({ error: "User not found" }, 404);

      // ✅ Normalize to arrays (THIS FIXES YOUR ERROR)
      const safeFollowing = Array.isArray(cur.following)
        ? cur.following
        : [];

      const safeFollowers = Array.isArray(target.followers)
        ? target.followers
        : [];

      // ✅ Update current user
      const updatedCur = await profiles.update(currentUserId, {
        following: Array.from(
          new Set([...safeFollowing, targetId])
        ),
      });

      // ✅ Update target user
      await profiles.update(targetId, {
        followers: Array.from(
          new Set([...safeFollowers, currentUserId])
        ),
      });

      return c.json({ user: updatedCur });
    } catch (e) {
      console.error("Follow error:", e);
      return c.json({ error: String(e) }, 500);
    }
  }
);


// POST /users/:id/unfollow
app.post(
  "/make-server-ec8fe879/users/:id/unfollow",
  async (c) => {
    try {
      const targetId = c.req.param("id");
      const { currentUserId } = await c.req.json();

      if (!currentUserId)
        return c.json({ error: "currentUserId required" }, 400);

      const [cur, target] = await Promise.all([
        profiles.getById(currentUserId),
        profiles.getById(targetId),
      ]);

      if (!cur || !target)
        return c.json({ error: "User not found" }, 404);

      const safeFollowing = Array.isArray(cur.following)
        ? cur.following
        : [];

      const safeFollowers = Array.isArray(target.followers)
        ? target.followers
        : [];

      const updatedCur = await profiles.update(currentUserId, {
        following: safeFollowing.filter(id => id !== targetId),
      });

      await profiles.update(targetId, {
        followers: safeFollowers.filter(id => id !== currentUserId),
      });

      return c.json({ user: updatedCur });
    } catch (e) {
      console.error("Unfollow error:", e);
      return c.json({ error: String(e) }, 500);
    }
  }
);


// ═══════════════════════════════════════════════════════════════════════════
// LISTINGS
// ═══════════════════════════════════════════════════════════════════════════

app.get("/make-server-ec8fe879/listings", async (c) => {
  try {
    const listings = await kv.getByPrefix("listing:");
    return c.json({ listings });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// GET /listings/user/:userId — MUST be before /listings/:id
app.get(
  "/make-server-ec8fe879/listings/user/:userId",
  async (c) => {
    try {
      const userId = c.req.param("userId");
      const all = await kv.getByPrefix("listing:");
      const listings = (all as any[]).filter(
        (l) => l.userId === userId,
      );
      return c.json({ listings });
    } catch (e) {
      return c.json({ error: String(e) }, 500);
    }
  },
);

app.get("/make-server-ec8fe879/listings/:id", async (c) => {
  try {
    const listing = await kv.get(
      `listing:${c.req.param("id")}`,
    );
    if (!listing)
      return c.json({ error: "Listing not found" }, 404);
    return c.json({ listing });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

app.post("/make-server-ec8fe879/listings", async (c) => {
  try {
    const body = await c.req.json();
    const id = body.id || genId();
    const listing = {
      ...body,
      id,
      createdAt: body.createdAt || new Date().toISOString(),
    };
    await kv.set(`listing:${id}`, listing);
    return c.json({ listing }, 201);
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

app.put("/make-server-ec8fe879/listings/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const updates = await c.req.json();
    const userId  = updates.userId ?? updates.user_id;

    // ── 1. Write to Supabase listings table (primary store) ──
    const supabaseUrl  = Deno.env.get("SUPABASE_URL");
    const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    let dbSuccess = false;

    if (supabaseUrl && serviceKey) {
      const dbPayload: Record<string, any> = {
        title:              updates.title,
        description:        updates.description,
        price:              updates.price,
        city:               updates.city          ?? null,
        province:           updates.province      ?? null,
        postal_code:        updates.postalCode     ?? null,
        street_address:     updates.streetAddress  ?? null,
        images:             updates.images         ?? [],
        videos:             updates.videos         ?? [],
        tags:               updates.tags           ?? [],
        listing_type:       updates.listingType    ?? null,
        listing_mode:       updates.listingMode    ?? null,
        service_category:   updates.serviceCategory ?? null,
        working_hours:      updates.workingHours   ?? null,
        requirements:       updates.requirements   ?? null,
        cancellation:       updates.cancellation   ?? null,
        payment_methods:    updates.paymentMethods ?? [],
        delivery_options:   updates.deliveryOptions ?? [],
        delivery_price:     updates.deliveryPrice  ?? null,
        blocked_dates:      updates.blockedDates   ?? [],
        available_days:     updates.availableDays  ?? [],
        service_start_time: updates.serviceStartTime ?? null,
        service_end_time:   updates.serviceEndTime   ?? null,
        updated_at:         new Date().toISOString(),
        metadata:           JSON.stringify({
          contactMethods:  updates.contactMethods  ?? [],
          pricingPackages: updates.pricingPackages ?? [],
          qualification:   updates.qualification   ?? null,
        }),
      };

      const setClauses = Object.keys(dbPayload)
        .map((k, i) => `"${k}" = $${i + 1}`)
        .join(", ");
      const vals = [...Object.values(dbPayload), id];
      if (userId) vals.push(userId);

      const whereClause = userId
        ? `WHERE id = $${vals.length - 1} AND user_id = $${vals.length}`
        : `WHERE id = $${vals.length}`;

      try {
        const rows = await sql().unsafe(
          `UPDATE listings SET ${setClauses} ${whereClause} RETURNING id`,
          vals
        );
        dbSuccess = rows.length > 0;
        if (!dbSuccess) console.warn("[listings PUT] DB update matched 0 rows for id:", id);
      } catch (dbErr: any) {
        console.warn("[listings PUT] DB update failed:", dbErr?.message);
      }
    }

    // ── 2. Also update KV (keeps legacy code working) ─────────────────────
    const existing = (await kv.get(`listing:${id}`)) ?? {};
    const updated  = { ...existing, ...updates, id, userId: existing.userId ?? userId, createdAt: existing.createdAt };
    await kv.set(`listing:${id}`, updated);

    return c.json({ listing: updated, dbUpdated: dbSuccess });
  } catch (e: any) {
    return c.json({ error: String(e?.message ?? e) }, 500);
  }
});


app.delete("/make-server-ec8fe879/listings/:id", async (c) => {
  try {
    await kv.del(`listing:${c.req.param("id")}`);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// REVIEWS
// ══════════════════════════════════════════════════════════════════════════

app.get(
  "/make-server-ec8fe879/reviews/listing/:listingId",
  async (c) => {
    try {
      const listingId = c.req.param("listingId");
      const all = await kv.getByPrefix("review:");
      const reviews = (all as any[])
        .filter((r) => r.listingId === listingId)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() -
            new Date(a.createdAt).getTime(),
        );
      return c.json({ reviews });
    } catch (e) {
      return c.json({ error: String(e) }, 500);
    }
  },
);

app.get(
  "/make-server-ec8fe879/reviews/user/:userId",
  async (c) => {
    try {
      const userId = c.req.param("userId");
      const all = await kv.getByPrefix("review:");
      const reviews = (all as any[])
        .filter(
          (r) => r.authorId === userId || r.userId === userId,
        )
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() -
            new Date(a.createdAt).getTime(),
        );
      return c.json({ reviews });
    } catch (e) {
      return c.json({ error: String(e) }, 500);
    }
  },
);

app.post("/make-server-ec8fe879/reviews", async (c) => {
  try {
    const body = await c.req.json();
    const id = genId();
    const review = {
      ...body,
      id,
      createdAt: new Date().toISOString(),
    };
    await kv.set(`review:${id}`, review);
    return c.json({ review }, 201);
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

app.delete("/make-server-ec8fe879/reviews/:id", async (c) => {
  try {
    await kv.del(`review:${c.req.param("id")}`);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POSTS  (backed by `posts` Postgres table — no kv_store)
// ═══════════════════════════════════════════════════════════════════════════

app.get("/make-server-ec8fe879/posts", async (c) => {
  try {
    const limit  = Math.min(parseInt(c.req.query("limit")  || "30", 10), 100);
    const offset = Math.max(parseInt(c.req.query("offset") || "0",  10), 0);
    const posts = await postsDb.getAll(limit, offset);
    // Cache for 10s on repeat requests — stale-while-revalidate for speed
    c.header("Cache-Control", "public, max-age=10, stale-while-revalidate=30");
    return c.json({ posts });
  } catch (e) {
    console.error("Get posts error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// GET /posts/user/:userId — MUST be before /posts/:id
app.get(
  "/make-server-ec8fe879/posts/user/:userId",
  async (c) => {
    try {
      const posts = await postsDb.getByUserId(
        c.req.param("userId"),
      );
      return c.json({ posts });
    } catch (e) {
      console.error("Get user posts error:", e);
      return c.json({ error: String(e) }, 500);
    }
  },
);

// GET /posts/likes-debug — test post_likes table read/write directly
app.get("/make-server-ec8fe879/posts/likes-debug", async (c) => {
  const results: any = {};
  try {
    // 1. Can we read the table?
    const rows = await sql().unsafe(`SELECT COUNT(*)::int AS cnt FROM post_likes`);
    results.totalRows = (rows[0] as any)?.cnt ?? 'unknown';

    // 2. Can we insert a test row?
    await sql().unsafe(
      `INSERT INTO post_likes (post_id, user_id, created_at) VALUES ('__test__', '__test__', NOW()) ON CONFLICT DO NOTHING`
    );
    results.insertTest = 'ok';

    // 3. Clean up
    await sql().unsafe(`DELETE FROM post_likes WHERE post_id = '__test__'`);
    results.deleteTest = 'ok';

    results.status = 'ALL OK — post_likes table is readable and writable';
  } catch (e: any) {
    results.error = String(e?.message ?? e);
    results.status = 'FAILED — see error above';
  }
  return c.json(results);
});

// GET /posts/liked/:userId — posts liked by a user — MUST be before /posts/:id
app.get(
  "/make-server-ec8fe879/posts/liked/:userId",
  async (c) => {
    try {
      const posts = await postsDb.getLikedByUser(c.req.param("userId"));
      return c.json({ posts });
    } catch (e) {
      console.error("Get liked posts error:", e);
      return c.json({ error: String(e) }, 500);
    }
  },
);

// POST /posts/feed (body: { followingIds })
app.post("/make-server-ec8fe879/posts/feed", async (c) => {
  try {
    const body = await c.req.json();
    let rawIds = body.followingIds || [];
    // Sanitize Postgres array literal {uuid,...} that may arrive from client session
    if (typeof rawIds === 'string') {
      const s = rawIds.trim();
      if (s.startsWith('{') && s.endsWith('}')) {
        rawIds = s.slice(1, -1).split(',').map((v: string) => v.trim().replace(/^"|"$/g, '')).filter(Boolean);
      } else {
        try { rawIds = JSON.parse(s); } catch { rawIds = s.split(',').map((v: string) => v.trim()).filter(Boolean); }
      }
    }
    const ids: string[] = (Array.isArray(rawIds) ? rawIds : []).filter(Boolean).map(String);
    const posts = await postsDb.getFeedPosts(ids);
    return c.json({ posts });
  } catch (e) {
    console.error("Get feed posts error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.get("/make-server-ec8fe879/posts/:id", async (c) => {
  try {
    const post = await postsDb.getById(c.req.param("id"));
    if (!post) return c.json({ error: "Post not found" }, 404);
    return c.json({ post });
  } catch (e) {
    console.error("Get post error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.post("/make-server-ec8fe879/posts", async (c) => {
  try {
    const body = await c.req.json();
    const post = await postsDb.create(body);

    // ── Repost notifications ──────────────────────────────────────────────────
    if (body.repostOf?.postId && body.userId) {
      const originalPostId = body.repostOf.postId as string;
      try {
        const result = await Promise.all([
          postsDb.getById(originalPostId),
          profiles.getById(body.userId),
          postsDb.getRepostersOfPost(originalPostId),
        ]);

        const originalPost = Array.isArray(result)
          ? result[0]
          : null;
        const reposter = Array.isArray(result)
          ? result[1]
          : null;
        const reposters = Array.isArray(result)
          ? result[2]
          : [];
        
        const reposterName   = reposter?.name   ?? body.userName  ?? "Someone";
        const reposterAvatar = reposter?.avatar ?? body.userAvatar ?? undefined;
        // 1. Notify original author
        if (
          originalPost?.userId &&
          originalPost.userId !== body.userId
        ) {
          notifsDb
            .push({
              toUserId: originalPost.userId,
              fromUserId: body.userId,
              fromUserName: reposterName,
              fromUserAvatar: reposterAvatar,
              type: "content_repost",
              postId: originalPostId,
              postContent: (originalPost.content ?? "").slice(
                0,
                100,
              ),
              postImage: originalPost.images?.[0] ?? undefined,
            })
            .catch((e) =>
              console.warn(
                "[repost notif] original author:",
                String(e).slice(0, 120),
              ),
            );
        }

        // 2. Notify friends who also reposted the same original post
        const notified = new Set<string>([
          body.userId,
          originalPost?.userId ?? "",
        ]);
        for (const reposterId of reposters) {
          if (!reposterId || notified.has(reposterId)) continue;
          notified.add(reposterId);
          notifsDb
            .push({
              toUserId: reposterId,
              fromUserId: body.userId,
              fromUserName: reposterName,
              fromUserAvatar: reposterAvatar,
              type: "friend_repost",
              postId: originalPostId,
              postContent: (originalPost?.content ?? "").slice(
                0,
                100,
              ),
              postImage: originalPost?.images?.[0] ?? undefined,
            })
            .catch((e) =>
              console.warn(
                "[repost notif] friend:",
                String(e).slice(0, 120),
              ),
            );
        }
      } catch (notifErr) {
        console.warn(
          "[repost notif] error:",
          String(notifErr).slice(0, 200),
        );
      }
    }

    return c.json({ post }, 201);
  } catch (e) {
    console.error("Create post error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// POST /posts/:id/like
app.post("/make-server-ec8fe879/posts/:id/like", async (c) => {
  try {
    const postId = c.req.param("id");
    const { userId } = await c.req.json();
    if (!userId) return c.json({ error: "userId required" }, 400);

    // Use service-role Supabase client — bypasses RLS and pooler issues
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    console.log(`[like] env url=${!!supabaseUrl} key=${!!serviceKey}`);
    if (!supabaseUrl || !serviceKey) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set");

    const admin = createClient(supabaseUrl, serviceKey);

    // Check existing like
    const { data: existing, error: checkErr } = await admin
      .from("post_likes")
      .select("post_id")
      .eq("post_id", postId)
      .eq("user_id", userId)
      .maybeSingle();
    if (checkErr) console.warn("[like] check err:", checkErr.message, checkErr.code);

    const isLiked = !!existing;

    if (isLiked) {
      const { error: delErr } = await admin.from("post_likes").delete().eq("post_id", postId).eq("user_id", userId);
      if (delErr) throw new Error(`unlike failed: ${delErr.message}`);
    } else {
      const { error: insErr } = await admin.from("post_likes").insert({ post_id: postId, user_id: userId, created_at: new Date().toISOString() });
      if (insErr) throw new Error(`like insert failed: ${insErr.message} (code ${insErr.code})`);
    }

    // Authoritative count
    const { count, error: cntErr } = await admin
      .from("post_likes")
      .select("*", { count: "exact", head: true })
      .eq("post_id", postId);
    if (cntErr) console.warn("[like] count err:", cntErr.message);
    const likesCount = count ?? 0;

    // Keep posts.likes_count in sync for realtime
    await admin.from("posts").update({ likes_count: likesCount }).eq("id", postId);

    const liked = !isLiked;
    console.log(`[like] post=${postId} user=${userId} liked=${liked} count=${likesCount}`);

    // Notify post owner on like (not unlike)
    if (liked) {
      try {
        const [liker, post] = await Promise.all([
          profiles.getById(userId),
          postsDb.getById(postId),
        ]);
        if (post && post.userId && post.userId !== userId) {
          await notifsDb.push({
            toUserId: post.userId,
            fromUserId: userId,
            fromUserName: liker?.name ?? "Someone",
            fromUserAvatar: liker?.avatar ?? undefined,
            type: "content_like",
            postId,
            postContent: (post.content ?? "").slice(0, 100),
            postImage: post.images?.[0] ?? undefined,
          });
        }
      } catch (notifErr) {
        console.warn("[like] notification failed:", String(notifErr).slice(0, 200));
      }
    }

    return c.json({ liked, likesCount });
  } catch (e) {
    const msg = String((e as any)?.message ?? e);
    console.error("[like] FAILED:", msg);
    return c.json({ error: msg }, 500);
  }
});

// DELETE /posts/repost-by-user?userId=...&originalPostId=...  — undo a repost (MUST be before /:id)
app.delete(
  "/make-server-ec8fe879/posts/repost-by-user",
  async (c) => {
    try {
      const userId = c.req.query("userId");
      const originalPostId = c.req.query("originalPostId");
      if (!userId || !originalPostId)
        return c.json(
          { error: "userId and originalPostId required" },
          400,
        );
      const repost = await postsDb.getRepostByUser(
        originalPostId,
        userId,
      );
      if (repost?.id) {
        await postsDb.remove(repost.id);
        console.log(
          `[unrepost] user ${userId} removed repost ${repost.id} of ${originalPostId}`,
        );
      }
      return c.json({
        success: true,
        deletedId: repost?.id ?? null,
      });
    } catch (e) {
      console.error("Unrepost error:", e);
      return c.json({ error: String(e) }, 500);
    }
  },
);

app.delete("/make-server-ec8fe879/posts/:id", async (c) => {
  try {
    await postsDb.remove(c.req.param("id"));
    return c.json({ success: true });
  } catch (e) {
    console.error("Delete post error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// COMMENTS  (backed by `comments` Postgres table — no kv_store)
// ═══════════════════════════════════════════════════════════════════════════

app.get(
  "/make-server-ec8fe879/comments/post/:postId",
  async (c) => {
    try {
      const limit  = Math.min(parseInt(c.req.query("limit")  || "5",  10), 50);
      const offset = Math.max(parseInt(c.req.query("offset") || "0",  10), 0);
      const sort   = (c.req.query("sort") === "top" ? "top" : "newest") as "newest" | "top";
      const comments = await commentsDb.getByPostId(c.req.param("postId"), limit, offset, sort);
      return c.json({ comments });
    } catch (e) {
      console.error("Get comments error:", e);
      return c.json({ error: String(e) }, 500);
    }
  },
);

// GET /comments/replies/:parentId
app.get(
  "/make-server-ec8fe879/comments/replies/:parentId",
  async (c) => {
    try {
      const replies = await commentsDb.getReplies(c.req.param("parentId"));
      return c.json({ comments: replies });
    } catch (e) {
      console.error("Get replies error:", e);
      return c.json({ error: String(e) }, 500);
    }
  },
);

app.post("/make-server-ec8fe879/comments", async (c) => {
  try {
    const body = await c.req.json();

    // Try SQL path first; fall back to service-role REST if pooler rejects the connection
    let comment: any;
    try {
      comment = await commentsDb.create(body);
    } catch (sqlErr) {
      console.warn("[comment] SQL create failed, using admin client:", String(sqlErr).slice(0, 120));
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !serviceKey) throw sqlErr;
      const admin = createClient(supabaseUrl, serviceKey);
      const id = crypto.randomUUID();
      const { data: row, error: insErr } = await admin.from("comments").insert({
        id,
        post_id:            body.postId,
        author_id:          body.userId,
        content:            body.content,
        parent_comment_id:  body.parentId || null,
        thread_level:       body.parentId ? 1 : 0,
        likes_count:        0,
        replies_count:      0,
        created_at:         new Date().toISOString(),
        updated_at:         new Date().toISOString(),
      }).select().single();
      if (insErr) throw new Error(insErr.message);
      comment = {
        id:          row.id,
        postId:      row.post_id,
        userId:      row.author_id,
        userName:    body.userName  ?? "",
        userAvatar:  body.userAvatar ?? undefined,
        content:     row.content,
        likes:       [],
        likesCount:  0,
        replyCount:  0,
        parentId:    row.parent_comment_id ?? null,
        createdAt:   row.created_at,
      };
    }

    // ── Notifications — fire-and-forget so the response is never delayed ────
    const {
      postId,
      parentId: replyToCommentId,
      userId: commentAuthorId,
      userName: commenterName,
      userAvatar: commenterAvatar,
    } = body;

    if (postId && commentAuthorId) {
      // Do NOT await — run in background after response is sent
      Promise.resolve().then(async () => {
        try {
          const post = await postsDb.getById(postId);

          // 1. Notify post author on new top-level comment
          if (!replyToCommentId && post?.userId && post.userId !== commentAuthorId) {
            await notifsDb.push({
              toUserId: post.userId,
              fromUserId: commentAuthorId,
              fromUserName: commenterName ?? "Someone",
              fromUserAvatar: commenterAvatar ?? undefined,
              type: "comment_received",
              postId,
              postContent: (post.content ?? "").slice(0, 100),
              postImage: post.images?.[0] ?? undefined,
              commentContent: (body.content ?? "").slice(0, 120),
            });
          }

          // 2. Notify parent comment author on reply
          if (replyToCommentId) {
            const parentComment = await commentsDb.getById(replyToCommentId);
            if (parentComment?.userId && parentComment.userId !== commentAuthorId) {
              await notifsDb.push({
                toUserId: parentComment.userId,
                fromUserId: commentAuthorId,
                fromUserName: commenterName ?? "Someone",
                fromUserAvatar: commenterAvatar ?? undefined,
                type: "comment_reply",
                postId,
                commentContent: (body.content ?? "").slice(0, 120),
              });
            }
          }
        } catch (notifErr) {
          console.warn("[comment] bg notification failed:", String(notifErr).slice(0, 200));
        }
      });
    }

    return c.json({ comment }, 201);
  } catch (e) {
    console.error("Create comment error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.delete("/make-server-ec8fe879/comments/:id", async (c) => {
  try {
    await commentsDb.remove(c.req.param("id"));
    return c.json({ success: true });
  } catch (e) {
    console.error("Delete comment error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// GET /comments/count/:postId
app.get(
  "/make-server-ec8fe879/comments/count/:postId",
  async (c) => {
    try {
      const count = await commentsDb.getCount(
        c.req.param("postId"),
      );
      return c.json({ count });
    } catch (e) {
      console.error("Count comments error:", e);
      return c.json({ error: String(e) }, 500);
    }
  },
);

// POST /comments/:id/like — toggle like on a comment + notify comment author
app.post(
  "/make-server-ec8fe879/comments/:id/like",
  async (c) => {
    try {
      const commentId = c.req.param("id");
      const { userId } = await c.req.json();
      if (!userId)
        return c.json({ error: "userId required" }, 400);

      const likes = await commentsDb.toggleLike(commentId, userId);

      // Case-insensitive check: PostgreSQL stores UUIDs lowercase
      const didLike = likes.some(id => id.toLowerCase() === userId.toLowerCase());

      // Fire-and-forget notification — return the response immediately
      if (didLike) {
        Promise.resolve().then(async () => {
          try {
            const comment = await commentsDb.getById(commentId);
            if (comment?.userId && comment.userId !== userId) {
              const liker = await profiles.getById(userId);
              const likerName = liker?.name ?? "Someone";
              let postImage: string | undefined;
              if (comment.postId) {
                const post = await postsDb.getById(comment.postId);
                postImage = post?.images?.[0];
              }
              await notifsDb.push({
                toUserId:        comment.userId,
                fromUserId:      userId,
                fromUserName:    likerName,
                fromUserAvatar:  liker?.avatar ?? undefined,
                type:            "comment_like",
                postId:          comment.postId ?? undefined,
                postImage,
                commentContent:  (comment.content ?? "").slice(0, 120),
              });
            }
          } catch (notifErr) {
            console.warn("[comment_like] bg notification failed:", String(notifErr).slice(0, 200));
          }
        });
      }

      return c.json({ likes });
    } catch (e) {
      console.error("Toggle comment like error:", e);
      return c.json({ error: String(e) }, 500);
    }
  },
);

// Old KV conversation routes removed — all conversation data now lives in
// the Postgres conversations / messages / conversation_participants tables.
// See the "CONVERSATIONS (Postgres-backed)" section further below.

// ═══════════════════════════════════════════════════════════════════════════
// SAVED POSTS
// ═══════════════════════════════════════════════════════════════════════════

app.get(
  "/make-server-ec8fe879/saved/posts/:userId",
  async (c) => {
    try {
      const userId = c.req.param("userId");
      const ids: string[] =
        (await kv.get(`saved_posts:${userId}`)) || [];
      const posts =
        ids.length > 0
          ? (
              await Promise.all(
                ids.map((id) => postsDb.getById(id)),
              )
            ).filter(Boolean)
          : [];
      return c.json({ posts, ids });
    } catch (e) {
      return c.json({ error: String(e) }, 500);
    }
  },
);

app.post(
  "/make-server-ec8fe879/saved/posts/:userId/toggle",
  async (c) => {
    try {
      const userId = c.req.param("userId");
      const { postId } = await c.req.json();
      const ids: string[] =
        (await kv.get(`saved_posts:${userId}`)) || [];
      const isSaved = ids.includes(postId);
      const newIds = isSaved
        ? ids.filter((id) => id !== postId)
        : [...ids, postId];
      await kv.set(`saved_posts:${userId}`, newIds);
      return c.json({ saved: !isSaved, ids: newIds });
    } catch (e) {
      return c.json({ error: String(e) }, 500);
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════
// SAVED LISTINGS
// ═══════════════════════════════════════════════════════════════════════════

app.get(
  "/make-server-ec8fe879/saved/listings/:userId",
  async (c) => {
    try {
      const userId = c.req.param("userId");
      const ids: string[] =
        (await kv.get(`saved_listings:${userId}`)) || [];
      const keys = ids.map((id) => `listing:${id}`);
      const listings =
        keys.length > 0
          ? (await kv.mget(keys)).filter(Boolean)
          : [];
      return c.json({ listings, ids });
    } catch (e) {
      return c.json({ error: String(e) }, 500);
    }
  },
);

app.post(
  "/make-server-ec8fe879/saved/listings/:userId/toggle",
  async (c) => {
    try {
      const userId = c.req.param("userId");
      const { listingId } = await c.req.json();
      const ids: string[] =
        (await kv.get(`saved_listings:${userId}`)) || [];
      const isSaved = ids.includes(listingId);
      const newIds = isSaved
        ? ids.filter((id) => id !== listingId)
        : [...ids, listingId];
      await kv.set(`saved_listings:${userId}`, newIds);
      return c.json({ saved: !isSaved, ids: newIds });
    } catch (e) {
      return c.json({ error: String(e) }, 500);
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════
// FP (FILMONS POINTS)
// ═══════════════════════════════════════════════════════════════════════════

const FP_RATE_BUY = 0.04;
const FP_RATE_PAYOUT = 0.027;
const FP_PACKS_MAP: Record<
  string,
  { fp: number; cad: number; label: string }
> = {
  p100: { fp: 100, cad: 3.99, label: "Starter" },
  p500: { fp: 500, cad: 20.99, label: "Creator" },
  p750: { fp: 750, cad: 30.99, label: "Pro" },
  p1000: { fp: 1000, cad: 38.99, label: "Power" },
};
const BOOST_MAP: Record<
  string,
  { fp: number; label: string; days: number }
> = {
  b_small: { fp: 25, label: "Quick Boost", days: 7 },
  b_strong: { fp: 100, label: "Strong Boost", days: 14 },
  b_featured: { fp: 300, label: "Featured Spot", days: 30 },
};

function mkFpAcct(userId: string) {
  return {
    userId,
    balance: 0,
    lifetimeEarned: 0,
    lifetimeSpent: 0,
    lifetimePurchased: 0,
    lifetimeWithdrawn: 0,
    pendingViewsFP: 0,
    dailyViewsFP: 0,
    dailyViewsDate: "",
    withdrawalPending: false,
  };
}
function fpTxId() {
  return `fp_tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// GET /fp/accounts/all  — MUST be before /fp/account/:userId
app.get("/make-server-ec8fe879/fp/accounts/all", async (c) => {
  try {
    const accounts = await kv.getByPrefix("fp_acct:");
    return c.json({ accounts });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// GET /fp/transactions/all  — MUST be before /fp/transactions/:userId
app.get(
  "/make-server-ec8fe879/fp/transactions/all",
  async (c) => {
    try {
      const txs = (
        (await kv.getByPrefix("fp_tx:")) as any[]
      ).sort(
        (a, b) =>
          new Date(b.createdAt).getTime() -
          new Date(a.createdAt).getTime(),
      );
      return c.json({ transactions: txs });
    } catch (e) {
      return c.json({ error: String(e) }, 500);
    }
  },
);

app.get(
  "/make-server-ec8fe879/fp/account/:userId",
  async (c) => {
    try {
      const userId = c.req.param("userId");
      let acct = await kv.get(`fp_acct:${userId}`);
      if (!acct) {
        acct = mkFpAcct(userId);
        await kv.set(`fp_acct:${userId}`, acct);
      }
      return c.json({ account: acct });
    } catch (e) {
      return c.json({ error: String(e) }, 500);
    }
  },
);

app.get(
  "/make-server-ec8fe879/fp/transactions/:userId",
  async (c) => {
    try {
      const userId = c.req.param("userId");
      const txs = ((await kv.getByPrefix("fp_tx:")) as any[])
        .filter((t) => t.userId === userId)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() -
            new Date(a.createdAt).getTime(),
        );
      return c.json({ transactions: txs });
    } catch (e) {
      return c.json({ error: String(e) }, 500);
    }
  },
);

// POST /fp/credit
app.post("/make-server-ec8fe879/fp/credit", async (c) => {
  try {
    const { userId, fpAmount, type, description, metadata } =
      await c.req.json();
    let acct =
      (await kv.get(`fp_acct:${userId}`)) || mkFpAcct(userId);
    acct.balance += fpAmount;
    acct.lifetimeEarned += fpAmount;
    if (type === "purchase") acct.lifetimePurchased += fpAmount;
    await kv.set(`fp_acct:${userId}`, acct);
    const txId = fpTxId();
    const tx = {
      id: txId,
      userId,
      type,
      fpAmount,
      cadEquiv: parseFloat((fpAmount * FP_RATE_BUY).toFixed(2)),
      description,
      status: "completed",
      createdAt: new Date().toISOString(),
      metadata,
    };
    await kv.set(`fp_tx:${txId}`, tx);
    return c.json({ transaction: tx, account: acct });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// POST /fp/debit
app.post("/make-server-ec8fe879/fp/debit", async (c) => {
  try {
    const { userId, fpAmount, type, description, metadata } =
      await c.req.json();
    let acct =
      (await kv.get(`fp_acct:${userId}`)) || mkFpAcct(userId);
    if (acct.balance < fpAmount)
      return c.json(
        {
          error: "Insufficient FP balance",
          code: "INSUFFICIENT",
        },
        400,
      );
    acct.balance -= fpAmount;
    acct.lifetimeSpent += fpAmount;
    await kv.set(`fp_acct:${userId}`, acct);
    const txId = fpTxId();
    const tx = {
      id: txId,
      userId,
      type,
      fpAmount: -fpAmount,
      cadEquiv: -parseFloat(
        (fpAmount * FP_RATE_BUY).toFixed(2),
      ),
      description,
      status: "completed",
      createdAt: new Date().toISOString(),
      metadata,
    };
    await kv.set(`fp_tx:${txId}`, tx);
    return c.json({ transaction: tx, account: acct });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// POST /fp/purchase
app.post("/make-server-ec8fe879/fp/purchase", async (c) => {
  try {
    const { userId, packId, cadAmount, paymentMethod } =
      await c.req.json();
    let fp = 0,
      desc = "";
    if (packId && FP_PACKS_MAP[packId]) {
      const pack = FP_PACKS_MAP[packId];
      fp = pack.fp;
      desc = `Purchased ${pack.fp} FP (${pack.label} Pack) — $${pack.cad} CAD`;
    } else if (cadAmount) {
      fp = Math.floor(Number(cadAmount) / FP_RATE_BUY);
      desc = `Purchased ${fp} FP — $${Number(cadAmount).toFixed(2)} CAD via ${paymentMethod || "card"}`;
    } else
      return c.json(
        { error: "packId or cadAmount required" },
        400,
      );

    let acct =
      (await kv.get(`fp_acct:${userId}`)) || mkFpAcct(userId);
    acct.balance += fp;
    acct.lifetimeEarned += fp;
    acct.lifetimePurchased += fp;
    await kv.set(`fp_acct:${userId}`, acct);
    const txId = fpTxId();
    const tx = {
      id: txId,
      userId,
      type: "purchase",
      fpAmount: fp,
      cadEquiv: parseFloat((fp * FP_RATE_BUY).toFixed(2)),
      description: desc,
      status: "completed",
      createdAt: new Date().toISOString(),
    };
    await kv.set(`fp_tx:${txId}`, tx);
    return c.json({
      success: true,
      fpAmount: fp,
      transaction: tx,
      account: acct,
    });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// POST /fp/send
app.post("/make-server-ec8fe879/fp/send", async (c) => {
  try {
    const { fromId, toId, fpAmount, note, toName, fromName } =
      await c.req.json();
    if (fpAmount < 1)
      return c.json({ error: "Minimum 1 FP" }, 400);
    let fromAcct =
      (await kv.get(`fp_acct:${fromId}`)) || mkFpAcct(fromId);
    if (fromAcct.balance < fpAmount)
      return c.json({ error: "Insufficient FP balance" }, 400);
    let toAcct =
      (await kv.get(`fp_acct:${toId}`)) || mkFpAcct(toId);

    fromAcct.balance -= fpAmount;
    fromAcct.lifetimeSpent += fpAmount;
    toAcct.balance += fpAmount;
    toAcct.lifetimeEarned += fpAmount;
    await kv.set(`fp_acct:${fromId}`, fromAcct);
    await kv.set(`fp_acct:${toId}`, toAcct);

    const now = new Date().toISOString();
    const sharedNote = note ? ` — "${note}"` : "";
    const tx1 = fpTxId(),
      tx2 = `${fpTxId()}b`;
    await kv.set(`fp_tx:${tx1}`, {
      id: tx1,
      userId: fromId,
      type: "send_fp",
      fpAmount: -fpAmount,
      cadEquiv: -parseFloat(
        (fpAmount * FP_RATE_BUY).toFixed(2),
      ),
      description: `Sent ${fpAmount} FP to ${toName || "user"}${sharedNote}`,
      status: "completed",
      createdAt: now,
      metadata: { toId, note },
    });
    await kv.set(`fp_tx:${tx2}`, {
      id: tx2,
      userId: toId,
      type: "receive_fp",
      fpAmount,
      cadEquiv: parseFloat((fpAmount * FP_RATE_BUY).toFixed(2)),
      description: `Received ${fpAmount} FP from ${fromName || "user"}${sharedNote}`,
      status: "completed",
      createdAt: now,
      metadata: { fromId, note },
    });
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// POST /fp/boost
app.post("/make-server-ec8fe879/fp/boost", async (c) => {
  try {
    const {
      userId,
      boostId,
      targetId,
      targetType,
      targetTitle,
    } = await c.req.json();
    const opt = BOOST_MAP[boostId];
    if (!opt)
      return c.json({ error: "Invalid boost option" }, 400);

    let acct =
      (await kv.get(`fp_acct:${userId}`)) || mkFpAcct(userId);
    if (acct.balance < opt.fp)
      return c.json({ error: "Insufficient FP balance" }, 400);
    acct.balance -= opt.fp;
    acct.lifetimeSpent += opt.fp;
    await kv.set(`fp_acct:${userId}`, acct);

    const key = `${targetType === "listing" ? "listing" : "post"}:${targetId}`;
    const target = await kv.get(key);
    if (target)
      await kv.set(key, {
        ...target,
        boostLevel: boostId,
        boostedUntil: new Date(
          Date.now() + opt.days * 86400000,
        ).toISOString(),
      });

    const txId = fpTxId();
    const txType =
      targetType === "listing" ? "boost_listing" : "boost_post";
    await kv.set(`fp_tx:${txId}`, {
      id: txId,
      userId,
      type: txType,
      fpAmount: -opt.fp,
      cadEquiv: -parseFloat((opt.fp * FP_RATE_BUY).toFixed(2)),
      description: `${opt.label}: ${targetTitle}`,
      status: "completed",
      createdAt: new Date().toISOString(),
      metadata: {
        boostId,
        targetId,
        targetType,
        days: opt.days,
      },
    });
    return c.json({ success: true, account: acct });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// POST /fp/withdraw
app.post("/make-server-ec8fe879/fp/withdraw", async (c) => {
  try {
    const { userId, fpAmount } = await c.req.json();
    const MIN_FP = 186;
    if (fpAmount < MIN_FP)
      return c.json(
        {
          error: `Minimum withdrawal is ${MIN_FP} FP (≈ $5 CAD)`,
        },
        400,
      );
    let acct =
      (await kv.get(`fp_acct:${userId}`)) || mkFpAcct(userId);
    if (acct.balance < fpAmount)
      return c.json({ error: "Insufficient FP balance" }, 400);
    if (acct.withdrawalPending)
      return c.json(
        { error: "A withdrawal is already pending" },
        400,
      );

    const gross = fpAmount * FP_RATE_PAYOUT;
    const fee = gross * 0.05;
    const payout = parseFloat((gross - fee).toFixed(2));

    acct.balance -= fpAmount;
    acct.lifetimeWithdrawn += fpAmount;
    acct.withdrawalPending = true;
    await kv.set(`fp_acct:${userId}`, acct);

    const txId = fpTxId();
    const tx = {
      id: txId,
      userId,
      type: "withdrawal",
      fpAmount: -fpAmount,
      cadEquiv: -payout,
      description: `Withdrawal of ${Number(fpAmount).toLocaleString()} FP → $${payout} CAD (5% fee deducted)`,
      status: "processing",
      createdAt: new Date().toISOString(),
      metadata: {
        fpAmount,
        grossCad: gross,
        feeCad: fee,
        payoutCad: payout,
        method: acct.payoutMethod,
        details: acct.payoutDetails,
      },
    };
    await kv.set(`fp_tx:${txId}`, tx);
    return c.json({
      success: true,
      payoutCad: payout,
      transaction: tx,
      account: acct,
    });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// PUT /fp/payout/:userId
app.put(
  "/make-server-ec8fe879/fp/payout/:userId",
  async (c) => {
    try {
      const userId = c.req.param("userId");
      const { method, details } = await c.req.json();
      let acct =
        (await kv.get(`fp_acct:${userId}`)) || mkFpAcct(userId);
      acct = {
        ...acct,
        payoutMethod: method,
        payoutDetails: details,
      };
      await kv.set(`fp_acct:${userId}`, acct);
      return c.json({ account: acct });
    } catch (e) {
      return c.json({ error: String(e) }, 500);
    }
  },
);

// POST /fp/views
app.post("/make-server-ec8fe879/fp/views", async (c) => {
  try {
    const { userId, newViews, hasEngagement } =
      await c.req.json();
    let acct =
      (await kv.get(`fp_acct:${userId}`)) || mkFpAcct(userId);
    const today = new Date().toISOString().slice(0, 10);
    if (acct.dailyViewsDate !== today) {
      acct.dailyViewsFP = 0;
      acct.dailyViewsDate = today;
    }
    const remaining = 20 - (acct.dailyViewsFP || 0);
    if (remaining <= 0)
      return c.json({ earned: 0, account: acct });
    const earned = Math.min(
      Math.floor((newViews / 1000) * (hasEngagement ? 2 : 1)),
      remaining,
    );
    if (earned <= 0)
      return c.json({ earned: 0, account: acct });
    acct.dailyViewsFP = (acct.dailyViewsFP || 0) + earned;
    acct.pendingViewsFP = (acct.pendingViewsFP || 0) + earned;
    await kv.set(`fp_acct:${userId}`, acct);
    if (acct.pendingViewsFP >= 5) {
      const batch = acct.pendingViewsFP;
      acct.balance += batch;
      acct.lifetimeEarned += batch;
      acct.pendingViewsFP = 0;
      await kv.set(`fp_acct:${userId}`, acct);
      const txId = fpTxId();
      await kv.set(`fp_tx:${txId}`, {
        id: txId,
        userId,
        type: "earn_views",
        fpAmount: batch,
        cadEquiv: parseFloat((batch * FP_RATE_BUY).toFixed(2)),
        description: `View earnings — ${batch} FP from content views`,
        status: "completed",
        createdAt: new Date().toISOString(),
      });
    }
    return c.json({ earned, account: acct });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// POST /fp/admin-credit (admin pays creator for content)
app.post("/make-server-ec8fe879/fp/admin-credit", async (c) => {
  try {
    const { userId, fpAmount, description } =
      await c.req.json();
    let acct =
      (await kv.get(`fp_acct:${userId}`)) || mkFpAcct(userId);
    acct.balance += fpAmount;
    acct.lifetimeEarned += fpAmount;
    await kv.set(`fp_acct:${userId}`, acct);
    const txId = fpTxId();
    const tx = {
      id: txId,
      userId,
      type: "admin_credit",
      fpAmount,
      cadEquiv: parseFloat((fpAmount * FP_RATE_BUY).toFixed(2)),
      description:
        description || `Admin credit: ${fpAmount} FP`,
      status: "completed",
      createdAt: new Date().toISOString(),
    };
    await kv.set(`fp_tx:${txId}`, tx);
    return c.json({
      success: true,
      transaction: tx,
      account: acct,
    });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// PUT /fp/withdrawal-complete/:userId — admin marks withdrawal as paid
app.put(
  "/make-server-ec8fe879/fp/withdrawal-complete/:userId",
  async (c) => {
    try {
      const userId = c.req.param("userId");
      let acct =
        (await kv.get(`fp_acct:${userId}`)) || mkFpAcct(userId);
      acct.withdrawalPending = false;
      await kv.set(`fp_acct:${userId}`, acct);
      // Mark the processing tx as completed
      const txs = (
        (await kv.getByPrefix("fp_tx:")) as any[]
      ).filter(
        (t) =>
          t.userId === userId &&
          t.type === "withdrawal" &&
          t.status === "processing",
      );
      for (const tx of txs)
        await kv.set(`fp_tx:${tx.id}`, {
          ...tx,
          status: "completed",
        });
      return c.json({ success: true });
    } catch (e) {
      return c.json({ error: String(e) }, 500);
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════

// POST /notifications
app.post("/make-server-ec8fe879/notifications", async (c) => {
  try {
    const {
      toUserId,
      fromUserId,
      fromUserName,
      fromUserAvatar,
      title,
      type,
      postId,
      postContent,
      postImage,
      commentContent,
      conversationId,
    } = await c.req.json();
    if (!toUserId || !fromUserId || !type)
      return c.json({ error: "toUserId, fromUserId, type required" }, 400);
    await notifsDb.push({
      toUserId,
      fromUserId,
      fromUserName: fromUserName ?? '',
      fromUserAvatar,
      title,
      type,
      postId,
      postContent,
      postImage,
      commentContent,
      conversationId,
    });
    return c.json({ success: true });
  } catch (e) {
    console.error("notifications push:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// GET /notifications/:userId
app.get(
  "/make-server-ec8fe879/notifications/:userId",
  async (c) => {
    try {
      const notifications = await notifsDb.getByUser(
        c.req.param("userId"), 30,  // limit to 30 — faster query
      );
      c.header("Cache-Control", "private, max-age=15, stale-while-revalidate=60");
      return c.json({ notifications });
    } catch (e) {
      console.error("notifications get:", e);
      return c.json({ error: String(e) }, 500);
    }
  },
);

// PUT /notifications/:id/read — mark single read (MUST come before /:userId/read-all pattern)
app.put(
  "/make-server-ec8fe879/notifications/:id/read",
  async (c) => {
    try {
      await notifsDb.markRead(c.req.param("id"));
      return c.json({ success: true });
    } catch (e) {
      return c.json({ error: String(e) }, 500);
    }
  },
);

// PUT /notifications/:userId/read-all
app.put(
  "/make-server-ec8fe879/notifications/:userId/read-all",
  async (c) => {
    try {
      await notifsDb.markAllRead(c.req.param("userId"));
      return c.json({ success: true });
    } catch (e) {
      return c.json({ error: String(e) }, 500);
    }
  },
);

// DELETE /notifications/:id — remove one
app.delete(
  "/make-server-ec8fe879/notifications/:id",
  async (c) => {
    try {
      await notifsDb.remove(c.req.param("id"));
      return c.json({ success: true });
    } catch (e) {
      return c.json({ error: String(e) }, 500);
    }
  },
);

// DELETE /notifications/:userId/all — clear all for user
app.delete(
  "/make-server-ec8fe879/notifications/:userId/all",
  async (c) => {
    try {
      await notifsDb.clearAll(c.req.param("userId"));
      return c.json({ success: true });
    } catch (e) {
      return c.json({ error: String(e) }, 500);
    }
  },
);

// GET /notifications/diagnose — (legacy stub, schema is now fixed)
app.get("/make-server-ec8fe879/notifications/diagnose", (c) =>
  c.json({
    message: "diagnose removed — schema is now fixed columns",
  }),
);

// ═══════════════════════════════════════════════════════════════════════════
// VERIFICATION REQUESTS
// ═══════════════════════════════════════════════════════════════════════════

app.get("/make-server-ec8fe879/verifications", async (c) => {
  try {
    const requests = await verificationsDb.getAll();
    return c.json({ requests });
  } catch (e) {
    console.error("GET verifications:", e);
    return c.json({ requests: [], error: String(e) }, 200);
  }
});

app.post("/make-server-ec8fe879/verifications", async (c) => {
  try {
    const body = await c.req.json();
    const request = await verificationsDb.create(body);
    return c.json({ request }, 201);
  } catch (e) {
    console.error("POST verifications:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.put(
  "/make-server-ec8fe879/verifications/:id",
  async (c) => {
    try {
      const id = c.req.param("id");
      const updates = await c.req.json();
      const request = await verificationsDb.update(id, updates);
      return c.json({ request });
    } catch (e) {
      console.error("PUT verifications:", e);
      return c.json({ error: String(e) }, 500);
    }
  },
);
// ═══════════════════════════════════════════════════════════════════════════
// IMAGE UPLOAD (base64)
// ═══════════════════════════════════════════════════════════════════════════

app.post("/make-server-ec8fe879/upload-image", async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get("image") as File;
    if (!file)
      return c.json({ error: "No image file provided" }, 400);
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(
      String.fromCharCode(...new Uint8Array(arrayBuffer)),
    );
    return c.json({
      imageUrl: `data:${file.type};base64,${base64}`,
    });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PHOTO UPLOAD → Supabase Storage (returns permanent public URL)
// POST /upload-photo  { dataUrl, userId, type: 'avatar' | 'cover' }
// ═══════════════════════════════════════════════════════════════════════════

const PHOTO_BUCKET = "make-ec8fe879-photos";
let _bucketReady = false;

async function ensurePhotoBucket(supabase: any) {
  if (_bucketReady) return;
  try {
    const { data: buckets } =
      await supabase.storage.listBuckets();
    const exists = (buckets || []).some(
      (b: any) => b.name === PHOTO_BUCKET,
    );
    if (!exists) {
      const { error } = await supabase.storage.createBucket(
        PHOTO_BUCKET,
        { public: true },
      );
      if (error) throw error;
      console.log(
        `[storage] Created public bucket: ${PHOTO_BUCKET}`,
      );
    }
    _bucketReady = true;
  } catch (e) {
    console.warn("[storage] ensurePhotoBucket:", e);
  }
}

app.post("/make-server-ec8fe879/upload-photo", async (c) => {
  try {
    const { dataUrl, userId, type } = await c.req.json();
    if (!dataUrl || !userId || !type) {
      return c.json(
        { error: "dataUrl, userId, and type are required" },
        400,
      );
    }

    // Parse  data:<mime>;base64,<data>
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match)
      return c.json({ error: "Invalid data URL format" }, 400);

    const mimeType = match[1];
    const b64Data = match[2];
    const ext =
      mimeType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
    const path = `${userId}/${type}.${ext}`; // e.g. "abc123/avatar.jpg"

    // Decode base64 → bytes
    const binaryStr = atob(b64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++)
      bytes[i] = binaryStr.charCodeAt(i);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    )!;
    const supabase = createClient(supabaseUrl, serviceKey);

    await ensurePhotoBucket(supabase);

    // Upsert — overwrites the existing avatar/cover for this user
    const { error: uploadError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, bytes, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      console.error("[storage] upload error:", uploadError);
      return c.json({ error: uploadError.message }, 500);
    }

    // Permanent public URL — never expires
    const {
      data: { publicUrl },
    } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);

    // Append cache-buster so browsers always fetch the latest image
    // (same storage path is reused on every upload, so the base URL never changes)
    const versionedUrl = `${publicUrl}?t=${Date.now()}`;

    // Cache versioned URL in KV so mergePhotos always has it
    await kv.set(`photo:${type}:${userId}`, versionedUrl);

    console.log(
      `[storage] ${type} uploaded for ${userId} → ${versionedUrl}`,
    );
    return c.json({ url: versionedUrl });
  } catch (e: any) {
    console.error("[storage] upload-photo error:", e);
    return c.json({ error: String(e?.message ?? e) }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GEOCODE (Google Maps proxy)
// ═══════════════════════════════════════════════════════════════════════════

app.get(
  "/make-server-ec8fe879/geocode/autocomplete",
  async (c) => {
    try {
      const input = c.req.query("input") || "";
      const country = c.req.query("country") || "ca";
      const type = c.req.query("type") || "address"; // 'address' | 'city'
      const apiKey = Deno.env.get("GOOGLE_API_KEY");
      if (!apiKey)
        return c.json(
          { error: "Google API key not configured" },
          500,
        );
      if (!input.trim()) return c.json({ predictions: [] });

      // Use (cities) for profile/signup city search, address for listing full addresses
      const typesParam =
        type === "city" ? "(cities)" : "address";
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&components=country:${country}&key=${apiKey}&types=${encodeURIComponent(typesParam)}&language=en`;

      const resp = await fetch(url, {
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        console.error(
          "Google autocomplete HTTP error:",
          resp.status,
          txt,
        );
        return c.json({ predictions: [] });
      }
      const data = await resp.json();

      // Pass through full prediction objects including structured_formatting
      const predictions = (data.predictions || []).map(
        (p: any) => ({
          place_id: p.place_id,
          description: p.description,
          matched_substrings: p.matched_substrings,
          structured_formatting: p.structured_formatting ?? {
            main_text:
              (p.description ?? "").split(",")[0] ??
              p.description,
            secondary_text: (p.description ?? "")
              .split(",")
              .slice(1)
              .join(",")
              .trim(),
          },
        }),
      );

      return c.json({ predictions });
    } catch (e: any) {
      const isTimeout =
        e?.name === "TimeoutError" ||
        String(e).includes("timed out");
      console.error("Geocode autocomplete error:", e);
      // Return empty predictions instead of 500 so the client degrades gracefully
      return c.json({
        predictions: [],
        _error: isTimeout ? "timeout" : String(e),
      });
    }
  },
);

app.get("/make-server-ec8fe879/geocode/details", async (c) => {
  try {
    const placeId = c.req.query("place_id") || "";
    const apiKey = Deno.env.get("GOOGLE_API_KEY");
    if (!apiKey)
      return c.json(
        { error: "Google API key not configured" },
        500,
      );
    if (!placeId) return c.json({ results: [] });

    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=address_components,formatted_address&key=${apiKey}&language=en`;
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      console.error(
        "Google place details HTTP error:",
        resp.status,
      );
      return c.json({ results: [] });
    }
    const data = await resp.json();
    if (!data.result) return c.json({ results: [] });

    // Return in the standard geocoding results format that all clients expect:
    // { results: [{ formatted_address, address_components: [...] }] }
    return c.json({
      results: [
        {
          formatted_address:
            data.result.formatted_address ?? "",
          address_components:
            data.result.address_components ?? [],
        },
      ],
    });
  } catch (e: any) {
    console.error("Geocode details error:", e);
    return c.json({ results: [], _error: String(e) });
  }
});

app.get("/make-server-ec8fe879/geocode/reverse", async (c) => {
  try {
    const lat = c.req.query("lat");
    const lng = c.req.query("lng");
    const apiKey = Deno.env.get("GOOGLE_API_KEY");
    if (!apiKey)
      return c.json(
        { error: "Google API key not configured" },
        500,
      );
    if (!lat || !lng)
      return c.json({ error: "lat and lng are required" }, 400);

    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}&language=en`;
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      console.error(
        "Google reverse geocode HTTP error:",
        resp.status,
      );
      return c.json({ results: [] });
    }
    const data = await resp.json();

    // Pass through the full results array so clients can read address_components
    return c.json({ results: data.results ?? [] });
  } catch (e: any) {
    console.error("Reverse geocode error:", e);
    return c.json({ results: [], _error: String(e) });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SMS — WELCOME
// ═══════════════════════════════════════════════════════════════════════════

app.post(
  "/make-server-ec8fe879/send-welcome-sms",
  async (c) => {
    try {
      const { phone, name } = await c.req.json();
      if (!phone)
        return c.json(
          { error: "Phone number is required" },
          400,
        );
      const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
      const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
      const fromPhone = Deno.env.get("TWILIO_PHONE_NUMBER");
      if (!accountSid || !authToken || !fromPhone)
        return c.json(
          { error: "SMS service not configured" },
          500,
        );
      const formattedPhone = phone.startsWith("+")
        ? phone
        : `+${phone}`;
      const message = `Welcome to Filmons, ${name || "there"}!\nYour account is ready — browse film gear & creative services.\nhttps://find-apple-87729733.figma.site`;
      const body = new URLSearchParams({
        To: formattedPhone,
        From: fromPhone,
        Body: message,
      });
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: body.toString(),
          signal: AbortSignal.timeout(10000),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        console.error("Twilio error:", result);
        return c.json(
          { error: result.message || "Failed to send SMS" },
          500,
        );
      }
      console.log(
        "Welcome SMS sent to:",
        formattedPhone,
        "| SID:",
        result.sid,
      );
      return c.json({ success: true, sid: result.sid });
    } catch (e) {
      console.error("Send welcome SMS error:", e);
      return c.json({ error: String(e) }, 500);
    }
  },
);

app.get("/verifications", async (c) => {
  const data = await verificationsDb.getAll();
  return c.json({ requests: data });
});

app.post("/verifications", async (c) => {
  const body = await c.req.json();
  const data = await verificationsDb.create(body);
  return c.json(data);
});

app.put("/verifications/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const data = await verificationsDb.update(id, body);
  return c.json(data);
}); // ── SMS — LOGIN ───────────────────────────────────────────────────────────

app.post("/make-server-ec8fe879/send-login-sms", async (c) => {
  try {
    const { phone, name } = await c.req.json();
    if (!phone)
      return c.json({ error: "Phone number is required" }, 400);
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const fromPhone = Deno.env.get("TWILIO_PHONE_NUMBER");
    if (!accountSid || !authToken || !fromPhone)
      return c.json(
        { error: "SMS service not configured" },
        500,
      );
    const formattedPhone = phone.startsWith("+")
      ? phone
      : `+${phone}`;
    const message = `Welcome back to Filmons, ${name || "there"}! You just signed in.\nhttps://find-apple-87729733.figma.site`;
    const body = new URLSearchParams({
      To: formattedPhone,
      From: fromPhone,
      Body: message,
    });
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
        signal: AbortSignal.timeout(10000),
      },
    );
    const result = await response.json();
    if (!response.ok)
      return c.json(
        { error: result.message || "Failed to send SMS" },
        500,
      );
    console.log("Login SMS sent to:", formattedPhone);
    return c.json({ success: true, sid: result.sid });
  } catch (e) {
    console.error("Send login SMS error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ── Conversations ─────────────────────────────────────────────────────────────

// GET /conversations?userId=xxx
app.get("/make-server-ec8fe879/conversations", async (c) => {
  try {
    const userId = c.req.query("userId");
    if (!userId) return c.json({ error: "userId required" }, 400);
    const conversations = await convsDb.getUserConversations(userId);
    c.header("Cache-Control", "private, max-age=10, stale-while-revalidate=30");
    return c.json({ conversations });
  } catch (e) {
    console.error("GET /conversations:", String(e));
    return c.json({ error: String(e) }, 500);
  }
});

// GET /conversations/:id/messages
app.get("/make-server-ec8fe879/conversations/:id/messages", async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query("limit") || "50", 10), 100);
    const messages = await convsDb.getMessages(c.req.param("id"), limit);
    c.header("Cache-Control", "private, max-age=5, stale-while-revalidate=20");
    return c.json({ messages });
  } catch (e) {
    console.error("GET /conversations/:id/messages:", String(e));
    return c.json({ error: String(e) }, 500);
  }
});

// POST /conversations/:id/messages
app.post("/make-server-ec8fe879/conversations/:id/messages", async (c) => {
  try {
    const convId = c.req.param("id");
    const body = await c.req.json();
    if (!convId || !body.senderId) return c.json({ error: "convId and senderId required" }, 400);

    const message = await convsDb.saveMessage(convId, body);
    return c.json({ success: true, message });
  } catch (e) {
    console.error("POST /conversations/:id/messages:", String(e));
    return c.json({ error: String(e) }, 500);
  }
});

// POST /conversations/:id/read
app.post("/make-server-ec8fe879/conversations/:id/read", async (c) => {
  try {
    const { userId } = await c.req.json();
    if (userId) await convsDb.markRead(c.req.param("id"), userId);
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// PUT /conversations/:id — upsert conversation metadata (sync from client)
app.put("/make-server-ec8fe879/conversations/:id", async (c) => {
  try {
    const convId = c.req.param("id");
    const body = await c.req.json();
    await convsDb.upsertConversation({ id: convId, ...body });
    return c.json({ success: true });
  } catch (e) {
    console.error("PUT /conversations/:id:", String(e));
    return c.json({ error: String(e) }, 500);
  }
});

// DELETE /conversations/:id
app.delete("/make-server-ec8fe879/conversations/:id", async (c) => {
  try {
    const { userId } = await c.req.json();
    if (userId) await convsDb.deleteConversationForUser(c.req.param("id"), userId);
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// DELETE /messages/:id
app.delete("/make-server-ec8fe879/messages/:id", async (c) => {
  try {
    const { userId, forEveryone } = await c.req.json();
    if (userId) await convsDb.deleteMessage(c.req.param("id"), userId, !!forEveryone);
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// GET /conversations/unread?userId=xxx
app.get("/make-server-ec8fe879/conversations/unread", async (c) => {
  return c.json({ count: 0 });
});

// PUT /conversations/:id/block
app.put("/make-server-ec8fe879/conversations/:id/block", async (c) => {
  try {
    const { blockedUserId } = await c.req.json();
    await kv.set(`conv_block:${c.req.param("id")}:${blockedUserId}`, true);
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// PUT /conversations/:id/messages/:msgId — edit message content
app.put("/make-server-ec8fe879/conversations/:id/messages/:msgId", async (c) => {
  try {
    const { content } = await c.req.json();
    const msgId = c.req.param("msgId");
    await sql().unsafe(
      `UPDATE public.messages SET content = $1, edited_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [content, msgId]
    ).catch(() => {});
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// PUT /conversations/:id/messages/:msgId/pin
app.put("/make-server-ec8fe879/conversations/:id/messages/:msgId/pin", async (c) => {
  try {
    const { isPinned } = await c.req.json();
    const msgId = c.req.param("msgId");
    await sql().unsafe(
      `UPDATE public.messages SET is_pinned = $1, updated_at = NOW() WHERE id = $2`,
      [isPinned ?? false, msgId]
    ).catch(() => {});
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// DELETE /conversations/:id/messages/:msgId/me — delete for current user only
app.delete("/make-server-ec8fe879/conversations/:id/messages/:msgId/me", async (c) => {
  try {
    const { userId } = await c.req.json();
    const msgId = c.req.param("msgId");
    if (userId) await convsDb.deleteMessage(msgId, userId, false);
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// DELETE /conversations/:id/messages/:msgId/all — delete for everyone
app.delete("/make-server-ec8fe879/conversations/:id/messages/:msgId/all", async (c) => {
  try {
    const msgId = c.req.param("msgId");
    await sql().unsafe(
      `UPDATE public.messages SET is_deleted = true, updated_at = NOW() WHERE id = $1`,
      [msgId]
    ).catch(() => {});
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// GET /conversations/:id/search?q=...
app.get("/make-server-ec8fe879/conversations/:id/search", async (c) => {
  try {
    const q = c.req.query("q") || "";
    if (!q.trim()) return c.json({ messages: [] });
    const rows = await sql().unsafe(
      `SELECT * FROM public.messages WHERE conversation_id = $1 AND content ILIKE $2 AND is_deleted IS NOT TRUE ORDER BY created_at DESC LIMIT 50`,
      [c.req.param("id"), `%${q}%`]
    ).catch(() => []);
    return c.json({ messages: rows });
  } catch (e) { return c.json({ messages: [], error: String(e) }); }
});

// GET /conversations/:id/statuses?msgIds=...
app.get("/make-server-ec8fe879/conversations/:id/statuses", async (c) => {
  return c.json({ statuses: [] });
});

// GET /conversations/:id/pinned
app.get("/make-server-ec8fe879/conversations/:id/pinned", async (c) => {
  try {
    const rows = await sql().unsafe(
      `SELECT * FROM public.messages WHERE conversation_id = $1 AND is_pinned = true AND is_deleted IS NOT TRUE ORDER BY created_at ASC`,
      [c.req.param("id")]
    ).catch(() => []);
    return c.json({ messages: rows });
  } catch (e) { return c.json({ messages: [], error: String(e) }); }
});

// PUT /conversations/:id/draft
app.put("/make-server-ec8fe879/conversations/:id/draft", async (c) => {
  try {
    const { userId, content } = await c.req.json();
    if (userId) await kv.set(`conv_draft:${c.req.param("id")}:${userId}`, content ?? "");
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// GET /conversations/:id/draft/:userId
app.get("/make-server-ec8fe879/conversations/:id/draft/:userId", async (c) => {
  try {
    const content = await kv.get(`conv_draft:${c.req.param("id")}:${c.req.param("userId")}`);
    return c.json({ content: content ?? "" });
  } catch (e) { return c.json({ content: "", error: String(e) }); }
});

// PUT /conversations/:id/archive
app.put("/make-server-ec8fe879/conversations/:id/archive", async (c) => {
  try {
    const { userId, archived } = await c.req.json();
    if (userId) await kv.set(`conv_archive:${c.req.param("id")}:${userId}`, archived ?? false);
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// GET /conversations/archived/:userId
app.get("/make-server-ec8fe879/conversations/archived/:userId", async (c) => {
  return c.json({ conversations: [] });
});

// PUT /conversations/:id/mute
app.put("/make-server-ec8fe879/conversations/:id/mute", async (c) => {
  try {
    const { userId, muted } = await c.req.json();
    if (userId) await kv.set(`conv_mute:${c.req.param("id")}:${userId}`, muted ?? false);
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// PUT /conversations/:id/pin-conv
app.put("/make-server-ec8fe879/conversations/:id/pin-conv", async (c) => {
  try {
    const { userId, pinned } = await c.req.json();
    if (userId) await kv.set(`conv_pin:${c.req.param("id")}:${userId}`, pinned ?? false);
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// DELETE /conversations/:id/for-everyone
app.delete("/make-server-ec8fe879/conversations/:id/for-everyone", async (c) => {
  try {
    const userId = c.req.query("userId") || "";
    const convId = c.req.param("id");
    await sql().unsafe(
      `UPDATE public.conversations SET deleted_for_everyone = true, updated_at = NOW() WHERE id = $1`,
      [convId]
    ).catch(() => {});
    await sql().unsafe(
      `UPDATE public.messages SET is_deleted = true, updated_at = NOW() WHERE conversation_id = $1`,
      [convId]
    ).catch(() => {});
    console.log(`[conv] deleted for everyone: ${convId} by ${userId}`);
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// ── Suppress benign errors ──────────────────────────────────────────────────
function isBenign(err: unknown): boolean {
  const msg = String(err);
  return msg.includes('Http') || msg.includes('connection closed') ||
         msg.includes('CONNECT_TIMEOUT') || msg.includes('reset') ||
         msg.includes('broken pipe');
}

// Suppress unhandled promise rejections from benign network errors
self.addEventListener('unhandledrejection', (evt: any) => {
  if (isBenign(evt.reason)) { evt.preventDefault(); }
});

Deno.serve(
  {
    onError: (err) => {
      if (isBenign(err)) return new Response(null, { status: 499 });
      console.error('[server] error:', String(err).slice(0, 200));
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    },
  },
  app.fetch,
);