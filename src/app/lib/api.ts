import { Listing, User, Review, Post, Comment, Conversation, ChatMessage } from '../types';
import { supabase } from '../../lib/supabase';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import * as notifs from './notifications';
import { toast } from 'sonner';

// Normalize any value to a string array (handles string, null, undefined, pg array string, JS array)
function toStringArray(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter((v: any) => typeof v === 'string');
  if (typeof val === 'string') {
    // PostgreSQL array literal e.g. "{url1,url2}"
    if (val.startsWith('{') && val.endsWith('}')) {
      return val.slice(1,-1).split(',').map(s=>s.trim().replace(/^"|"$/g,'')).filter(Boolean);
    }
    try { const p = JSON.parse(val); if (Array.isArray(p)) return p.filter((v:any)=>typeof v==='string'); } catch {}
    return val.startsWith('http') ? [val] : [];
  }
  return [];
}

// Normalize a post object's media fields — handles PG array strings, plain strings, null
function normalizePostMedia(p: any): any {
  if (!p || typeof p !== 'object') return p;
  const a = (v: any): string[] => {
    if (Array.isArray(v)) return v;
    if (!v) return [];
    if (typeof v === 'string') {
      if (v.startsWith('{')) return v.slice(1,-1).split(',').map((s:string)=>s.trim().replace(/^"|"$/g,'')).filter(Boolean);
      if (v.startsWith('http')) return [v];
      try { const parsed = JSON.parse(v); if (Array.isArray(parsed)) return parsed; } catch {}
    }
    return [];
  };
  return { ...p, images: a(p.images), videos: a(p.videos), audios: a(p.audios) };
}


// ============================================
// SERVER BASE
// ============================================
const BASE = `https://${projectId}.supabase.co/functions/v1/make-server-ec8fe879`;
const H = () => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${publicAnonKey}` });

// ── Retry-with-backoff helper ─────────────────────────────────────────────────
async function call<T = any>(path: string, opts: RequestInit = {}, timeoutMs = 12_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...opts,
      signal: controller.signal,
      headers: { ...H(), ...(opts.headers || {}) },
    });
    clearTimeout(timer);
    // Parse body even on error so we get the message
    let data: any;
    try { data = await res.json(); } catch { data = {}; }
    if (!res.ok) {
      const msg = data?.error || data?.message || `Server error ${res.status}`;
      throw new Error(msg);
    }
    return data as T;
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('Request timed out — please check your connection');
    if (err.message === 'Failed to fetch' || err.message?.includes('NetworkError') || err.message?.includes('fetch')) {
      throw new Error('Could not reach server — check your internet connection');
    }
    throw err;
  }
}

// ============================================
// ── Parse Postgres array literals that Supabase returns as strings ────────────
function parsePgArray(v: any): string[] {
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  if (typeof v === 'string' && v.trim()) {
    const s = v.trim();
    if (s === '{}' || s === '') return [];
    if (s.startsWith('{') && s.endsWith('}'))
      return s.slice(1, -1).split(',').map(x => x.trim().replace(/^"|"$/g, '')).filter(Boolean);
    try { const p = JSON.parse(s); return Array.isArray(p) ? p.filter(Boolean).map(String) : []; } catch {}
  }
  return [];
}

// LOCAL SESSION (localStorage cache only for current user)
// ============================================
const SESSION_KEY = 'filmons_current_user';

function loadSession(): User | null {
  try {
    const u = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!u) return null;
    // Auto-heal stale sessions that stored following/followers as Postgres "{uuid,...}" strings
    u.following  = parsePgArray(u.following);
    u.followers  = parsePgArray(u.followers);
    return u;
  } catch { return null; }
}
function saveSession(user: User | null) {
  if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  else localStorage.removeItem(SESSION_KEY);
}

// ============================================
// AUTH API
// ============================================
export const authApi = {
  // ── Phone OTP — sent directly via Twilio from our edge function ────────────
  // No dependency on Supabase Auth phone settings being enabled.
  sendPhoneOTP: async (phone: string): Promise<void> => {
    const formatted = phone.startsWith('+') ? phone : `+${phone.replace(/\D/g, '')}`;
    await call('/send-phone-otp', {
      method: 'POST',
      body: JSON.stringify({ phone: formatted }),
    });
    console.log('✅ OTP sent to:', formatted);
  },

  verifyPhoneOTP: async (phone: string, code: string): Promise<void> => {
    const formatted = phone.startsWith('+') ? phone : `+${phone.replace(/\D/g, '')}`;
    await call('/verify-phone-otp', {
      method: 'POST',
      body: JSON.stringify({ phone: formatted, code }),
    });
    console.log('✅ Phone verified:', formatted);
  },

  // ── Signup flow (phone) ────────────────────────────────────────────────────
  signupWithPhone: async (phone: string): Promise<{ needsVerification: boolean }> => {
    // Check uniqueness against server
    const normalized = phone.replace(/\D/g, '');
    const { user } = await call<any>(`/users/by-phone/${encodeURIComponent(normalized)}`);
    if (user) throw new Error('User with this phone number already exists');
    await authApi.sendPhoneOTP(phone);
    return { needsVerification: true };
  },

  completePhoneSignup: async (phone: string, code: string, name?: string, email?: string, accountType?: 'renter' | 'business' | 'service', extraFields?: Partial<User>): Promise<User> => {
    await authApi.verifyPhoneOTP(phone, code);
    const { user } = await call<{ user: User }>('/users', {
      method: 'POST',
      body: JSON.stringify({ phone, email, name: name || `User ${phone.slice(-4)}`, accountType: accountType || 'renter', ...extraFields }),
    });
    saveSession(user);
    return user;
  },

  // ── Sign in flow (phone) ───────────────────────────────────────────────────
  signinWithPhone: async (phone: string): Promise<{ needsVerification: boolean }> => {
    const normalized = phone.replace(/\D/g, '');
    const { user } = await call<any>(`/users/by-phone/${encodeURIComponent(normalized)}`);
    if (!user) throw new Error('No account found with this phone number');
    await authApi.sendPhoneOTP(phone);
    return { needsVerification: true };
  },

  completePhoneSignin: async (phone: string, code: string): Promise<User> => {
    await authApi.verifyPhoneOTP(phone, code);
    const normalized = phone.replace(/\D/g, '');
    const { user } = await call<any>(`/users/by-phone/${encodeURIComponent(normalized)}`);
    if (!user) throw new Error('User not found');
    saveSession(user);
    return user;
  },

  // ── Email/password (legacy — maps to server user lookup) ──────────────────
  signup: async (email: string, password: string, name: string, phone?: string, accountType?: 'renter' | 'business' | 'service', extraFields?: Record<string, any>): Promise<{ user: User; verificationCode: string }> => {
    const { user } = await call<{ user: User }>('/users', {
      method: 'POST',
      body: JSON.stringify({ email, phone, name, accountType: accountType || 'renter', ...(extraFields || {}) }),
    });
    return { user, verificationCode: '000000' }; // code sent via phone/email separately
  },

  // ── Create profile ─────────────────────────────────────────────────────────
  // Used by phone signup (OTP already verified in a prior step) and any other
  // flow that has collected all profile data before calling the server.
  // The server assigns createdAt and handles email/phone uniqueness checks.
  createProfile: async (profileData: Partial<User>): Promise<User> => {
    const { user } = await call<{ user: User }>('/users', {
      method: 'POST',
      body: JSON.stringify(profileData),
    });
    saveSession(user);
    return user;
  },

  signin: async (email: string, password: string): Promise<{ user: User; verificationCode: string }> => {
    // 1. Authenticate via Supabase Auth (real password check)
    console.log('[signin] attempting signInWithPassword for:', email.toLowerCase());
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase(), password,
    });
    console.log('[signin] result — user:', authData?.user?.id ?? 'none', '| error:', authError?.message ?? 'none');
    if (authError || !authData.user) {
      const msg = authError?.message || '';
      console.warn('[signin] Supabase Auth error:', msg);

      if (msg.toLowerCase().includes('email not confirmed') || msg.toLowerCase().includes('not confirmed')) {
        await supabase.auth.resend({ type: 'signup', email: email.toLowerCase() }).catch(() => {});
        throw new Error('Please confirm your email first — we just resent the confirmation link.');
      }

      // Distinguish "wrong password" from "email not registered at all"
      const { data: profileByEmail } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email.toLowerCase())
        .maybeSingle();

      if (profileByEmail) {
        // Profile exists — could be wrong password OR unconfirmed Supabase account.
        // Try resending signup confirmation: succeeds (no error) only when the account
        // is unconfirmed, so we can distinguish the two cases.
        const { error: resendErr } = await supabase.auth.resend({ type: 'signup', email: email.toLowerCase() });
        if (!resendErr) {
          throw new Error('Your email address is not confirmed yet. We just resent the confirmation link — please check your inbox, click the link, then sign in again.');
        }
        throw new Error('Incorrect password. Please try again or reset your password.');
      }

      throw new Error('EMAIL_NOT_FOUND');
    }

    // 2. Load full profile from profiles table
    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (profileError || !data) {
      // Profile missing — create minimal one
      await supabase.from('profiles').upsert({
        id: authData.user.id, email: email.toLowerCase(),
        name: authData.user.user_metadata?.name || email.split('@')[0],
        account_type: 'creator', account_mode: 'creator',
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
    }

    const profile = data || { id: authData.user.id, email };
    const profileMeta: Record<string, unknown> = profile.profile_meta
      ? (typeof profile.profile_meta === 'string' ? JSON.parse(profile.profile_meta) : profile.profile_meta)
      : {};
    const user: User = {
      id:                   profile.id,
      email:                profile.email || email,
      name:                 profile.name || profile.username || email.split('@')[0],
      username:             profile.username,
      avatar:               profile.avatar_url || profile.avatar,
      accountType:          profile.account_type || 'creator',
      accountMode:          profile.account_mode || 'creator',
      isVerified:           profile.is_verified ?? false,
      verificationStatus:   profile.verification_status || 'not_started',
      bio:                  profile.bio,
      location:             profile.location,
      city:                 profile.city             || undefined,
      province:             profile.province          || undefined,
      primaryRole:          profile.primary_role      || undefined,
      profileSetupCompleted: !!(profileMeta.onboarding_completed),
      following:            parsePgArray(profile.following),
      followers:            parsePgArray(profile.followers),
    } as User;

    saveSession(user);
    return { user, verificationCode: '000000' };
  },

  getMe: async (): Promise<{ user: User }> => {
    const cached = loadSession();
    if (!cached) throw new Error('Not authenticated');
    // Try edge function first
    try {
      const { user } = await call<any>(`/users/${cached.id}`);
      if (user) { saveSession(user); return { user }; }
    } catch { /* edge function blocked — try Supabase direct */ }
    // Fallback: read directly from profiles table
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, username, email, avatar_url, account_type, account_mode, is_verified, verification_status, bio, location, city, province, primary_role, profile_meta, followers, following')
        .eq('id', cached.id)
        .single();
      if (data) {
        const getMeMeta: Record<string, unknown> = data.profile_meta
          ? (typeof data.profile_meta === 'string' ? JSON.parse(data.profile_meta) : data.profile_meta)
          : {};
        const fresh: User = {
          ...cached,
          name:                 data.name               || cached.name,
          username:             data.username            || cached.username,
          avatar:               data.avatar_url          || cached.avatar,
          accountType:          data.account_type        || cached.accountType,
          accountMode:          data.account_mode        || cached.accountMode,
          isVerified:           data.is_verified         ?? cached.isVerified,
          verificationStatus:   data.verification_status ?? cached.verificationStatus,
          bio:                  data.bio                 || cached.bio,
          location:             data.location            || cached.location,
          city:                 data.city                || cached.city,
          province:             data.province            || cached.province,
          primaryRole:          data.primary_role        || cached.primaryRole,
          profileSetupCompleted: !!(getMeMeta.onboarding_completed) || cached.profileSetupCompleted,
          following:            parsePgArray(data.following  ?? cached.following),
          followers:            parsePgArray(data.followers  ?? cached.followers),
        };
        saveSession(fresh);
        return { user: fresh };
      }
    } catch { /* use cached */ }
    return { user: cached };
  },

  getCurrentUser: (): User | null => loadSession(),

  getUserById: async (userId: string): Promise<User | null> => {
    try {
      const { user } = await call<any>(`/users/${userId}`);
      return user || null;
    } catch {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (!data) return null;
      return {
        id: data.id, email: data.email, name: data.name || data.username || '',
        username: data.username, avatar: data.avatar_url || data.avatar,
        accountType: data.account_type || 'renter',
        following: parsePgArray(data.following), followers: parsePgArray(data.followers),
      } as User;
    }
  },

  // Sync version (reads from server-populated localStorage cache or fetches all users)
  getUserByIdSync: (userId: string): User | null => {
    try {
      // Check users_cache first (fastest)
      const cache = JSON.parse(localStorage.getItem('filmons_users_cache') || '{}');
      if (cache[userId]) return cache[userId];
      // Fallback: check filmons_users list
      const users: User[] = JSON.parse(localStorage.getItem('filmons_users') || '[]');
      const found = users.find(u => u.id === userId);
      if (found) return found;
      // Fallback: check current session
      const session = JSON.parse(localStorage.getItem('filmons_current_user') || 'null');
      if (session?.id === userId) return session;
      return null;
    } catch { return null; }
  },

  getAllUsers: async (): Promise<User[]> => {
    const { users } = await call<any>('/users');
    // Cache for sync lookups
    const cache: Record<string, User> = {};
    (users || []).forEach((u: User) => { cache[u.id] = u; });
    localStorage.setItem('filmons_users_cache', JSON.stringify(cache));
    return users || [];
  },

  updateUser: async (userId: string, updates: Partial<User>): Promise<User> => {
    // ── Build snake_case payload for Supabase REST ─────────────────────────
    const payload: Record<string, any> = {};
    if (updates.name        !== undefined) payload.name           = updates.name;
    if (updates.username    !== undefined) payload.username       = updates.username;
    if (updates.bio         !== undefined) payload.bio            = updates.bio;
    if (updates.city        !== undefined) payload.city           = updates.city;
    if (updates.province    !== undefined) payload.province       = updates.province;
    if (updates.avatar      !== undefined) { payload.avatar_url  = updates.avatar; payload.avatar = updates.avatar; }
    if ((updates as any).coverPhoto   !== undefined) { payload.cover_photo = (updates as any).coverPhoto; payload.banner_url = (updates as any).coverPhoto; }
    if ((updates as any).website      !== undefined) payload.website      = (updates as any).website;
    if ((updates as any).youtube      !== undefined) payload.youtube      = (updates as any).youtube;
    if ((updates as any).tiktok       !== undefined) payload.tiktok       = (updates as any).tiktok;
    if ((updates as any).instagram    !== undefined) payload.instagram    = (updates as any).instagram;
    if ((updates as any).vimeo        !== undefined) payload.vimeo        = (updates as any).vimeo;
    if ((updates as any).location     !== undefined) payload.location     = (updates as any).location;
    if ((updates as any).occupation   !== undefined) payload.occupation   = (updates as any).occupation;
    if ((updates as any).birthdate    !== undefined) payload.birthdate    = (updates as any).birthdate;
    if ((updates as any).phone        !== undefined) payload.phone        = (updates as any).phone;
    if ((updates as any).email        !== undefined) payload.email        = (updates as any).email;
    if ((updates as any).yearsExp     !== undefined) payload.years_exp   = parseInt((updates as any).yearsExp) || null;
    if ((updates as any).profileMeta    !== undefined) payload.profile_meta    = (updates as any).profileMeta;
    if ((updates as any).primaryRole    !== undefined) payload.primary_role    = (updates as any).primaryRole;
    if ((updates as any).secondaryRoles !== undefined) payload.secondary_roles = (updates as any).secondaryRoles;
    if ((updates as any).skills         !== undefined) payload.skills          = (updates as any).skills;
    if ((updates as any).gear           !== undefined) payload.gear            = (updates as any).gear;
    if ((updates as any).collabPrefs    !== undefined) payload.collab_prefs    = (updates as any).collabPrefs;
    if ((updates as any).collab         !== undefined) payload.collab_prefs    = (updates as any).collab; // alias
    if ((updates as any).education      !== undefined) payload.education       = (updates as any).education;
    payload.updated_at = new Date().toISOString();

    // ── Try Supabase REST PATCH directly (fast, no edge fn) ───────────────
    // Supabase REST accepts JSON arrays for text[] columns natively
    // Debug: log what we're sending
    const fieldsBeingSaved = Object.keys(payload).filter(k => k !== 'updated_at');
    console.log('[updateUser] Saving fields:', fieldsBeingSaved);
    console.log('[updateUser] primary_role:', payload.primary_role, '| skills:', payload.skills?.length, '| secondary_roles:', payload.secondary_roles?.length);

    const restUrl = `https://${projectId}.supabase.co/rest/v1/profiles?id=eq.${userId}`;
    let updated: any = null;
    try {
      const res = await fetch(restUrl, {
        method: 'PATCH',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        publicAnonKey,
          'Authorization': `Bearer ${publicAnonKey}`,
          'Prefer':        'return=representation',
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const rows = await res.json();
        updated = Array.isArray(rows) ? rows[0] : rows;
      } else {
        const err = await res.text();
        console.warn('[updateUser] REST PATCH error:', res.status, err);
      }
    } catch (e) {
      console.warn('[updateUser] REST PATCH exception:', e);
    }

    // Build merged user for local state
    const current = loadSession();
    const merged: User = {
      ...(current || {}),
      ...updates,
      id: userId,
      name:    updated?.name     || updates.name     || current?.name     || '',
      avatar:  updated?.avatar_url || updates.avatar || current?.avatar,
      bio:     updated?.bio      ?? (updates as any).bio     ?? current?.bio,
      city:    updated?.city     ?? updates.city     ?? current?.city,
    } as User;
    saveSession(merged);
    _commentCache.clear();
    try { sessionStorage.removeItem('filmons_post_store'); } catch {}

    // Fire-and-forget: also update KV store via edge fn (for legacy reads)
    // Don't await — don't let it block the UI
    call(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }, 8_000).catch(() => {}); // silently ignore timeout

    return merged;
  },

  // Upload a compressed data URL to Supabase Storage; returns the permanent public URL.
  uploadPhoto: async (userId: string, type: 'avatar' | 'cover', dataUrl: string): Promise<string> => {
    const { url } = await call<{ url: string }>('/upload-photo', {
      method: 'POST',
      body: JSON.stringify({ dataUrl, userId, type }),
    });
    return url;
  },

  logout: () => {
    saveSession(null);
    supabase.auth.signOut().catch(() => {});
  },
};

// ============================================
// LISTINGS API
// ============================================
let _listingsCache: Listing[] | null = null;
let _listingsCacheAt = 0; // reset to force re-fetch with fixed image parsing

export const listingsApi = {
  getAll: async (): Promise<Listing[]> => {
    // Return in-memory cache if fresh (< 60 seconds) and has data
    if (_listingsCache?.length && Date.now() - _listingsCacheAt < 60_000) return _listingsCache;

    // ── Stale-while-revalidate: return localStorage immediately ──
    // Callers get instant data; fresh data arrives on next render cycle
    const localRaw = localStorage.getItem('filmons_listings');
    const localListings: Listing[] = localRaw ? (() => { try { return JSON.parse(localRaw); } catch { return []; } })() : [];
    if (localListings.length > 0 && !_listingsCache?.length) {
      _listingsCache    = localListings;
      _listingsCacheAt  = Date.now() - 50_000; // mark as slightly stale so we still refresh
    }

    // Normalise an images/videos column — handles both string[] and {url,type}[] formats
    const extractUrls = (arr: any): string[] => {
      if (!arr) return [];
      // Handle PostgreSQL array literal e.g. "{url1,url2}"
      if (typeof arr === 'string') return toStringArray(arr);
      if (!Array.isArray(arr)) return [];
      return arr
        .map((item: any) => typeof item === 'string' ? item : item?.url || item?.imageUrl || '')
        .filter((s: string) => s && s.length > 4);
    };

    const mapRow = (row: any): Listing => {
      // Parse metadata — images may be stored here instead of the images column
      const meta = (() => {
        if (!row.metadata) return {};
        if (typeof row.metadata === 'object') return row.metadata;
        try { return JSON.parse(row.metadata); } catch { return {}; }
      })();

      // Images: prefer dedicated column, fall back to metadata
      const images = extractUrls(row.images) || extractUrls(meta.images) || extractUrls(meta.mediaUrls) || [];
      const videos = extractUrls(row.videos) || extractUrls(meta.videos) || [];

      return {
        id:              row.id,
        userId:          row.user_id,
        title:           row.title        || '',
        description:     row.description  || '',
        price:           row.price        || 0,
        city:            row.city         || '',
        listingType:     row.listing_type || 'gear',
        listingMode:     row.listing_mode || 'rent',
        serviceCategory: row.service_category,
        tags:            row.tags            || meta.tags      || [],
        images,
        videos,
        contactMethods:  row.contact_methods || meta.contactMethods || [],
        pricingPackages: row.pricing_packages || meta.pricingPackages || [],
        createdAt:       row.created_at,
        isSold:          row.is_sold || false,
        soldAt:          row.sold_at || undefined,
      } as Listing;
    };

    try {
      // Only select columns that definitely exist — no is_sold/sold_at until SQL migration runs
      const { data, error } = await supabase
        .from('listings')
        .select('id, user_id, title, description, price, city, listing_type, listing_mode, service_category, tags, images, videos, contact_methods, pricing_packages, created_at, metadata')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        console.log(`✅ Loaded ${data.length} listings from Supabase`);
        const listings = data.map(mapRow);
        _listingsCache = listings;
        _listingsCacheAt = Date.now();
        // Save lightweight version to localStorage (strip base64 to avoid quota errors)
        try {
          const light = listings.map(l => ({
            ...l,
            images: l.images.filter((s: string) => s.startsWith('http')),
            videos: l.videos.filter((s: string) => s.startsWith('http')),
          }));
          localStorage.setItem('filmons_listings', JSON.stringify(light));
        } catch {
          localStorage.removeItem('filmons_listings');
        }
        return listings;
      }
      if (error) console.error('❌ getAll query failed:', error.message);
      if (!error && data?.length === 0) console.warn('⚠️ 0 listings returned — check RLS');
    } catch (e) {
      console.warn('getAll exception:', e);
    }

    // Fallback: localStorage
    try {
      return JSON.parse(localStorage.getItem('filmons_listings') || '[]');
    } catch { return []; }
  },

  getOne: async (id: string): Promise<Listing> => {
    // Try Supabase directly
    try {
      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!error && data) {
        const extractUrls = (arr: any): string[] => {
          if (!arr) return [];
          if (typeof arr === 'string') return toStringArray(arr);
          if (!Array.isArray(arr)) return [];
          return arr.map((i: any) => typeof i === 'string' ? i : i?.url || i?.imageUrl || '').filter(Boolean);
        };
        const meta = (() => {
          if (!data.metadata) return {};
          if (typeof data.metadata === 'object') return data.metadata;
          try { return JSON.parse(data.metadata); } catch { return {}; }
        })();
        return {
          id:              data.id,
          userId:          data.user_id,
          title:           data.title,
          description:     data.description,
          price:           data.price,
          city:            data.city,
          listingType:     data.listing_type,
          listingMode:     data.listing_mode,
          serviceCategory: data.service_category,
          tags:            data.tags             || [],
          images:          toStringArray(extractUrls(data.images) || extractUrls(meta.images) || data.media_urls || []),
          videos:          extractUrls(data.videos) || extractUrls(meta.videos) || [],
          contactMethods:  data.contact_methods  || [],
          pricingPackages: data.pricing_packages || [],
          createdAt:       data.created_at,
          isSold:          data.is_sold          || false,
          soldAt:          data.sold_at          || undefined,
          ...(meta),
          id: data.id,
          userId: data.user_id,
        } as Listing;
      }
      if (error) console.warn('getOne Supabase error:', error.message);
    } catch (e) {
      console.warn('getOne Supabase exception:', e);
    }

    // Fallback: localStorage only (no edge function — it times out)
    try {
      const all: Listing[] = JSON.parse(localStorage.getItem('filmons_listings') || '[]');
      const found = all.find(l => l.id === id);
      if (found) return found;
    } catch {}

    throw new Error(`Listing not found (id: ${id})`);
  },

  getUserListings: async (userId: string): Promise<Listing[]> => {
    // Try Supabase directly first
    try {
      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const listings = data.map((row: any) => ({
          id:              row.id,
          userId:          row.user_id,
          title:           row.title,
          description:     row.description,
          price:           row.price,
          city:            row.city,
          listingType:     row.listing_type,
          listingMode:     row.listing_mode,
          serviceCategory: row.service_category,
          tags:            row.tags            || [],
          images:          row.images          || [],
          videos:          row.videos          || [],
          contactMethods:  row.contact_methods || [],
          pricingPackages: row.pricing_packages || [],
          createdAt:       row.created_at,
          ...(row.metadata || {}),
          id: row.id,
          userId: row.user_id,
        } as Listing));
        return listings;
      }
    } catch {}

    // Fallback: localStorage only
    try {
      const all: Listing[] = JSON.parse(localStorage.getItem('filmons_listings') || '[]');
      return all.filter(l => l.userId === userId);
    } catch { return []; }
  },

  create: async (listing: Partial<Listing>): Promise<Listing> => {
    const currentUser = authApi.getCurrentUser();
    if (!currentUser) throw new Error('Not authenticated');

    const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2,9)}-${Math.random().toString(36).slice(2,9)}-${Math.random().toString(36).slice(2,9)}`;
    const newListing: Listing = {
      id,
      userId:          currentUser.id,
      userName:        currentUser.name,
      userAvatar:      currentUser.avatar,
      userAccountType: currentUser.accountType,
      title:           listing.title        || '',
      description:     listing.description  || '',
      price:           listing.price        || 0,
      city:            listing.city         || '',
      tags:            listing.tags         || [],
      images:          listing.images       || [],
      videos:          listing.videos       || [],
      contactMethods:  listing.contactMethods || [],
      pricingPackages: listing.pricingPackages || [],
      listingType:     listing.listingType  || 'gear',
      listingMode:     listing.listingMode  || 'rent',
      serviceCategory: listing.serviceCategory,
      createdAt:       new Date().toISOString(),
      ...listing,
      id, // ensure id stays
      userId: currentUser.id,
    } as Listing;

    // 1. Save to localStorage immediately so it shows up right away
    try {
      const existing: Listing[] = JSON.parse(localStorage.getItem('filmons_listings') || '[]');
      existing.unshift(newListing);
      localStorage.setItem('filmons_listings', JSON.stringify(existing));
    } catch {}

    // 2. Write directly to Supabase listings table (schema-exact insert)
    try {
      const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentUser.id);
      if (!isValidUUID) {
        toast.error(`DB skipped: user_id "${currentUser.id}" is not a UUID. Please log out and back in.`);
      } else {
        // Strip base64 data from metadata (keeps only URLs, prevents memory limit)
        const safeMetadata = listing ? Object.fromEntries(
          Object.entries(listing).filter(([k]) => !['images','videos','govIdPhoto','utilityBillPhoto','selfiePhoto'].includes(k))
        ) : null;

        const { data, error } = await supabase
          .from('listings')
          .insert({
            id:               newListing.id,
            user_id:          currentUser.id,
            title:            newListing.title            || '',
            description:      newListing.description      || '',
            price:            Number(newListing.price)    || 0,
            city:             newListing.city             || '',
            listing_type:     newListing.listingType      || 'gear',
            listing_mode:     newListing.listingMode      || 'rent',
            service_category: newListing.serviceCategory  || null,
            tags:             newListing.tags             || [],
            images:           (newListing.images || []).filter((img: string) => img.startsWith('http')),
            videos:           (newListing.videos || []).filter((v: string) => v.startsWith('http')),
            contact_methods:  newListing.contactMethods   || [],
            pricing_packages: newListing.pricingPackages  || [],
            metadata:         safeMetadata,
            created_at:       newListing.createdAt,
          })
          .select()
          .single();

        if (!error && data) {
          toast.success('✅ Listing saved to database!');
          return { ...newListing, id: data.id };
        }
        // Show the exact Supabase error in the UI
        toast.error(`DB error: ${error?.message || 'unknown'} (code: ${error?.code})`);
      }
    } catch (dbErr: any) {
      toast.error(`DB exception: ${dbErr?.message || String(dbErr)}`);
    }

    // 3. Fallback: try edge function
    try {
      const { listing: created } = await call<any>('/listings', {
        method: 'POST',
        body: JSON.stringify({ ...newListing }),
      });
      if (created) return created;
    } catch {}

    // 4. Return local version — already saved to localStorage
    return newListing;
  },

  update: async (id: string, updates: Partial<Listing>): Promise<Listing> => {
    try {
      const { listing } = await call<any>(`/listings/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }, 30_000);
      return listing;
    } catch (err: any) {
      // Timeout fallback — write directly to Supabase
      if (err?.name === 'AbortError' || err?.message?.includes('timeout') || err?.message?.includes('abort')) {
        console.warn('[listings.update] Edge function timed out, falling back to direct Supabase update');
        const { data, error } = await supabase
          .from('listings')
          .update({
            title:           updates.title,
            description:     updates.description,
            price:           updates.price,
            city:            updates.city,
            province:        updates.province,
            postal_code:     updates.postalCode,
            street_address:  updates.streetAddress,
            tags:            updates.tags,
            images:          updates.images,
            videos:          updates.videos,
            working_hours:   updates.workingHours,
            requirements:    updates.requirements,
            cancellation:    updates.cancellation,
            payment_methods: updates.paymentMethods,
            delivery_options:updates.deliveryOptions,
            delivery_price:  updates.deliveryPrice,
            blocked_dates:   (updates as any).blockedDates,
            metadata:        JSON.stringify({
              contactMethods:   updates.contactMethods,
              pricingPackages:  updates.pricingPackages,
              qualification:    updates.qualification,
              serviceCategory:  updates.serviceCategory,
              listingType:      updates.listingType,
              listingMode:      updates.listingMode,
              availableDays:    (updates as any).availableDays,
            }),
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select()
          .single();
        if (error) throw new Error(error.message);
        return { ...updates, id, ...data } as Listing;
      }
      throw err;
    }
  },

  markListingSold: async (listingId: string): Promise<void> => {
    const soldAt = new Date().toISOString();
    // Update localStorage
    try {
      const all: Listing[] = JSON.parse(localStorage.getItem('filmons_listings') || '[]');
      localStorage.setItem('filmons_listings', JSON.stringify(
        all.map(l => l.id === listingId ? { ...l, isSold: true, soldAt } : l)
      ));
    } catch {}
    // Update Supabase
    try {
      await supabase.from('listings').update({
        is_sold: true,
        sold_at: soldAt,
        metadata: supabase.rpc ? undefined : undefined, // handled via columns
      }).eq('id', listingId);
    } catch {}
  },

  uploadImage: async (file: File): Promise<{ imageUrl: string }> => {
    try {
      const ext  = file.name.split('.').pop() || 'jpg';
      const path = `listings/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
      const { data, error } = await supabase.storage
        .from('listings')
        .upload(path, file, { contentType: file.type, upsert: true });
      if (!error && data) {
        const { data: pub } = supabase.storage.from('listings').getPublicUrl(data.path);
        if (pub?.publicUrl) return { imageUrl: pub.publicUrl };
      }
    } catch {}
    // Fallback: base64 (only for very small files)
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve({ imageUrl: reader.result as string });
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  uploadVideo: async (file: File): Promise<{ videoUrl: string }> => {
    try {
      const ext  = file.name.split('.').pop() || 'mp4';
      const path = `listings/videos/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
      const { data, error } = await supabase.storage
        .from('listings')
        .upload(path, file, { contentType: file.type, upsert: true });
      if (!error && data) {
        const { data: pub } = supabase.storage.from('listings').getPublicUrl(data.path);
        if (pub?.publicUrl) return { videoUrl: pub.publicUrl };
      }
    } catch {}
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve({ videoUrl: reader.result as string });
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  delete: async (id: string): Promise<void> => {
    // Remove from Supabase
    const { error } = await supabase.from('listings').delete().eq('id', id);
    if (error) throw new Error(error.message);
    // Remove from localStorage cache
    try {
      const all: Listing[] = JSON.parse(localStorage.getItem('filmons_listings') || '[]');
      localStorage.setItem('filmons_listings', JSON.stringify(all.filter(l => l.id !== id)));
    } catch {}
    // Invalidate in-memory cache
    _listingsCache = null as any;
  },
};

// ============================================
// REVIEWS API
// ============================================
export const reviewsApi = {
  getListingReviews: async (listingId: string): Promise<Review[]> => {
    try {
      const { data } = await supabase
        .from('reviews')
        .select('*')
        .eq('listing_id', listingId)
        .order('created_at', { ascending: false });
      return (data || []).map((r: any) => ({
        id: r.id, listingId: r.listing_id, userId: r.user_id,
        rating: r.rating, comment: r.comment || r.content || '',
        createdAt: r.created_at,
      }));
    } catch { return []; }
  },

  getUserReviews: async (userId: string): Promise<Review[]> => {
    try {
      const { data } = await supabase
        .from('reviews')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      return (data || []).map((r: any) => ({
        id: r.id, listingId: r.listing_id, userId: r.user_id,
        rating: r.rating, comment: r.comment || r.content || '',
        createdAt: r.created_at,
      }));
    } catch { return []; }
  },

  create: async (review: Partial<Review>): Promise<Review> => {
    try {
      const { data, error } = await supabase.from('reviews').insert({
        listing_id: review.listingId,
        user_id:    review.userId,
        rating:     review.rating,
        comment:    review.comment,
      }).select().single();
      if (!error && data) return data;
    } catch {}
    // Fallback edge function
    const { review: created } = await call<any>('/reviews', {
      method: 'POST', body: JSON.stringify(review),
    });
    return created;
  },

  delete: async (id: string): Promise<void> => {
    await call(`/reviews/${id}`, { method: 'DELETE' });
  },
};


// ── Fetch which posts the current user has liked (post_likes table) ──────────
async function fetchLikedPostIds(postIds: string[], userId: string): Promise<Set<string>> {
  if (!postIds.length || !userId) return new Set();
  try {
    const { data } = await supabase
      .from('post_likes')
      .select('post_id')
      .eq('user_id', userId)
      .in('post_id', postIds);
    return new Set((data || []).map((r: any) => r.post_id));
  } catch { return new Set(); }
}

// ── Client-side post row mapper ───────────────────────────────────────────────
function rowToPostClient(row: any, currentUserId?: string, likedPostIds?: Set<string>): Post {
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata
    : (() => { try { return JSON.parse(row.metadata || '{}'); } catch { return {}; } })();

  // media can be:
  //   - array of {type, url, name} objects (actual DB format from edge function)
  //   - object with {images, videos, gifs, audios, audioNames} keys (legacy client format)
  const rawMedia = row.media && typeof row.media === 'object' ? row.media
    : (() => { try { return JSON.parse(row.media || 'null'); } catch { return null; } })();

  let images: string[] = [];
  let videos: string[] = [];
  let gifs: string[]   = [];
  let audios: string[] = [];
  let audioNames: string[] = [];

  if (Array.isArray(rawMedia)) {
    images     = rawMedia.filter((m: any) => m.type === 'image').map((m: any) => m.url);
    videos     = rawMedia.filter((m: any) => m.type === 'video').map((m: any) => m.url);
    gifs       = rawMedia.filter((m: any) => m.type === 'gif').map((m: any) => m.url);
    audios     = rawMedia.filter((m: any) => m.type === 'audio').map((m: any) => m.url);
    audioNames = rawMedia.filter((m: any) => m.type === 'audio').map((m: any) => m.name ?? '');
  } else if (rawMedia && typeof rawMedia === 'object') {
    images     = toStringArray(rawMedia.images);
    videos     = toStringArray(rawMedia.videos);
    gifs       = toStringArray(rawMedia.gifs);
    audios     = toStringArray(rawMedia.audios);
    audioNames = toStringArray(rawMedia.audioNames);
  }

  // Fallback: direct Supabase insert columns (media_urls, video_url, etc.)
  if (!images.length && !videos.length) {
    const mu  = toStringArray(row.media_urls) || toStringArray(row.images) || toStringArray(row.image_urls);
    const vid = row.video_url;
    const img = row.image_url || row.thumbnail_url;
    const pt  = (row.post_type || '').toLowerCase();
    if (mu.length) {
      if (pt === 'video') { videos = mu; }
      else if (pt === 'image') { images = mu; }
      else {
        images = mu.filter((u: string) => /\.(jpg|jpeg|png|gif|webp|heic)/i.test(u));
        videos = mu.filter((u: string) => /\.(mp4|mov|webm|avi)/i.test(u));
        if (!images.length && !videos.length) images = mu; // fallback: treat all as images
      }
    }
    if (!images.length && !videos.length && img) images = [String(img)];
    if (!videos.length && vid) videos = [String(vid)];
  }

  // Debug: log what we got
  if (typeof window !== 'undefined') console.log('[rowToPostClient]', {id:row.id, pt:row.post_type, media_urls:row.media_urls, images, videos});

  // When using the post_likes table (likedPostIds provided), ignore the stale
  // posts.likes array — it may still contain old user IDs that were never cleared.
  const likes: string[] = likedPostIds
    ? []   // post_likes is authoritative; we don't need the array
    : (Array.isArray(row.likes) ? row.likes
        : Array.isArray(row._likes) ? row._likes
        : Array.isArray(meta.likes) ? meta.likes : []);

  const likesCount = row.likes_count ?? (likedPostIds ? 0 : likes.length);

  return {
    id:              row.id,
    userId:          row.author_id,
    userName:        row._pname || row._pusername || meta.userName || '',
    userAvatar:      row._pavatar || meta.userAvatar || undefined,
    userAccountType: row._paccount || meta.userAccountType || undefined,
    content:         row.content          || '',
    images,
    videos,
    gifs,
    audios,
    audioNames,
    likes,
    likesCount,
    commentCount:         row.comments_count        ?? 0,
    totalCommentsCount:   row.total_comments_count  ?? row.comments_count ?? 0,
    repostCount:          row.reposts_count          ?? 0,
    isLiked:         likedPostIds
                       ? likedPostIds.has(row.id)
                       : currentUserId ? likes.includes(currentUserId) : false,
    createdAt:       row.created_at,
    allowComments:   meta.allowComments   !== false,
    allowDownload:   meta.allowDownload   !== false,
    taggedUserIds:   meta.taggedUserIds   || [],
    link:            meta.link            || undefined,
    repostOf:        meta.repostOf        || undefined,
    isArchived:      row.is_archived      || false,
    isPinned:        row.is_pinned        || false,
    // Audio metadata for PostCard audio section
    audioTitle:      row.audio_title      || meta.audioTitle      || undefined,
    audioArtist:     row.audio_artist     || meta.audioArtist     || undefined,
    audioId:         row.audio_id         || meta.audioId         || undefined,
    audio_url:       row.audio_url        || undefined,
    // Listing metadata for PostCard listing section
    listingId:       row.listing_id       || undefined,
    listingTitle:    row.listing_title    || undefined,
    listingPrice:    row.listing_price    ?? undefined,
    listingMode:     row.listing_mode     || undefined,
    listingCity:     row.listing_city     || undefined,
    listingImage:    row.listing_image    || undefined,
    listingPins:     row.listing_pins     || undefined,
    tagPins:         row.tag_pins         || undefined,
    location:        row.location         || undefined,
  } as Post;
}

// ============================================
// POSTS API
// ============================================
export const postsApi = {
  getAll: async (limit = 30, offset = 0): Promise<Post[]> => {
    const currentUser = authApi.getCurrentUser();
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw error;
      const rows = data || [];
      // Join profile data manually
      const userIds = [...new Set(rows.map((r:any)=>r.author_id).filter(Boolean))];
      let profileMap: Record<string,any> = {};
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name, username, avatar_url, account_type')
          .in('id', userIds);
        (profiles||[]).forEach((p:any) => { profileMap[p.id] = p; });
      }
      // Batch-fetch liked post IDs from post_likes
      const postIds = rows.map((r:any) => r.id);
      const likedIds = currentUser ? await fetchLikedPostIds(postIds, currentUser.id) : new Set<string>();
      return rows.map((row:any) => {
        const prof = profileMap[row.author_id] || {};
        return rowToPostClient({...row, _pname: prof.name, _pusername: prof.username, _pavatar: prof.avatar_url, _paccount: prof.account_type}, currentUser?.id, likedIds);
      });
    } catch(e) {
      console.error('[getAll] error:', e);
      // Fallback to edge function
      try {
        const { posts } = await call<any>(`/posts?limit=${limit}&offset=${offset}`);
        return (posts || []).map((p: any) => normalizePostMedia(p));
      } catch(e2) {
        console.error('[getAll] edge function also failed:', e2);
        return []; // Never crash the feed
      }
    }
  },

  getUserPosts: async (userId: string): Promise<Post[]> => {
    const currentUser = authApi.getCurrentUser();
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('*, profiles!author_id(id,name,username,avatar_url,account_type)')
        .eq('author_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      // Also fetch collaborative posts
      const { data: collabData } = await supabase
        .from('post_collab_profiles')
        .select('post_id')
        .eq('user_id', userId);
      const collabPostIds = (collabData ?? []).map((r: any) => r.post_id).filter(Boolean);
      let collabPosts: any[] = [];
      if (collabPostIds.length) {
        const { data: cp } = await supabase
          .from('posts')
          .select('*, profiles!author_id(id,name,username,avatar_url,account_type)')
          .in('id', collabPostIds)
          .order('created_at', { ascending: false });
        collabPosts = cp ?? [];
      }
      const allRows = [...(data || []), ...collabPosts.filter(cp => !data?.find((p: any) => p.id === cp.id))];
      const likedIds = currentUser
        ? await fetchLikedPostIds(allRows.map(r => r.id), currentUser.id)
        : new Set<string>();
      return allRows.map((row: any) => {
        const prof = (row.profiles as any) || {};
        return rowToPostClient({
          ...row,
          _pname:    prof.name,
          _pusername:prof.username,
          _pavatar:  prof.avatar_url,
          _paccount: prof.account_type,
        }, currentUser?.id, likedIds);
      });
    } catch(e) {
      console.error('[getUserPosts] error:', e);
      try {
        const { posts } = await call<any>(`/posts/user/${userId}`);
        return (posts || []).map((p: any) => normalizePostMedia(p));
      } catch { return []; }
    }
  },

  getLikedByUser: async (userId: string): Promise<Post[]> => {
    const { posts } = await call<any>(`/posts/liked/${userId}`);
    return (posts || []).map((p: any) => normalizePostMedia(p));
  },

  getFeedPosts: async (followingIds: any): Promise<Post[]> => {
    // Sanitize: user.following may be a Postgres array literal string {uuid,...}
    const sanitize = (v: any): string[] => {
      if (Array.isArray(v)) return v.filter(Boolean).map(String);
      if (typeof v === 'string' && v.trim()) {
        const s = v.trim();
        if (s.startsWith('{') && s.endsWith('}'))
          return s.slice(1, -1).split(',').map(x => x.trim().replace(/^"|"$/g, '')).filter(Boolean);
        try { const p = JSON.parse(s); return Array.isArray(p) ? p.filter(Boolean).map(String) : []; } catch {}
        return s.split(',').map(x => x.trim()).filter(Boolean);
      }
      return [];
    };
    const ids = sanitize(followingIds);
    if (!ids.length) return [];
    const currentUser = authApi.getCurrentUser();
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('*, profiles!author_id(id,name,username,avatar_url,account_type)')
        .in('author_id', ids)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []).map((row: any) => {
        const prof = (row.profiles as any) || {};
        return rowToPostClient({
          ...row,
          _pname:     prof.name,
          _pusername: prof.username,
          _pavatar:   prof.avatar_url,
          _paccount:  prof.account_type,
        }, currentUser?.id);
      });
    } catch {
      const { posts } = await call<any>('/posts/feed', {
        method: 'POST',
        body: JSON.stringify({ followingIds: ids }),
      });
      return (posts || []).map((p: any) => normalizePostMedia(p));
    }
  },

  create: async (
    content: string,
    images?: string[],
    videos?: string[],
    gifs?: string[],
    taggedUserIds?: string[],
    allowComments?: boolean,
    audios?: string[],
    audioNames?: string[],
    allowDownload?: boolean,
    link?: string,
    repostOf?: Post['repostOf'],
    extraMeta?: {
      audioTitle?:    string;
      audioArtist?:   string;
      audioId?:       string;
      snippetStart?:  number;
      snippetEnd?:    number;
      location?:      string;
      postType?:      string;  // override auto-detected post_type (e.g. 'audio')
      listingId?:     string;
      listingTitle?:  string;
      listingPrice?:  number;
      listingMode?:   string;
      listingCity?:   string;
      listingImage?:  string;
      listingPins?:   any[];
    },
  ): Promise<Post> => {
    const currentUser = authApi.getCurrentUser();
    if (!currentUser) throw new Error('Not authenticated');

    const now = new Date().toISOString();
    const postType = (videos?.length) ? 'video' : (images?.length) ? 'image' : (gifs?.length) ? 'gif' : 'text';

    const media = {
      images:     images     || [],
      videos:     videos     || [],
      gifs:       gifs       || [],
      audios:     audios     || [],
      audioNames: audioNames || [],
    };
    const metadata = {
      userName:        currentUser.name,
      userAccountType: currentUser.accountType,
      userAvatar:      currentUser.avatar,
      taggedUserIds:   taggedUserIds || [],
      allowComments:   allowComments !== false,
      allowDownload:   allowDownload !== false,
      link:            link?.trim() || null,
      likes:           [],
      repostOf:        repostOf || null,
    };

    // Direct Supabase insert — only columns that exist in posts table
    const insertPayload: any = {
      author_id:  currentUser.id,
      content:    content || '',
      post_type:  extraMeta?.postType || postType || 'post',
    };

    // Add media columns only if non-empty
    const allMediaUrls = [
      ...(Array.isArray(images) ? images : []),
      ...(Array.isArray(videos) ? videos : []),
      ...(Array.isArray(audios) ? audios : []),
    ].filter(Boolean);
    if (allMediaUrls.length)          insertPayload.media_urls  = allMediaUrls;
    if (videos?.[0])                  insertPayload.video_url   = videos[0];
    if (audios?.[0])                  insertPayload.audio_url   = audios[0];
    if (Array.isArray(taggedUserIds) && taggedUserIds.length) insertPayload.tags = taggedUserIds;
    if (content)                      insertPayload.caption     = content;
    insertPayload.visibility          = 'public';
    insertPayload.allow_comments      = allowComments !== false;
    insertPayload.allow_download      = allowDownload !== false;

    // Audio + listing metadata — include in the single insert so no async update needed
    if (extraMeta?.audioTitle)        insertPayload.audio_title        = extraMeta.audioTitle;
    if (extraMeta?.audioFileUrl)      insertPayload.audio_url          = extraMeta.audioFileUrl;
    if (extraMeta?.location)          insertPayload.location           = extraMeta.location;
    if (extraMeta?.audioArtist)       insertPayload.audio_artist       = extraMeta.audioArtist;
    if (extraMeta?.snippetStart != null) insertPayload.audio_snippet_start = extraMeta.snippetStart;
    if (extraMeta?.snippetEnd   != null) insertPayload.audio_snippet_end   = extraMeta.snippetEnd;
    // Note: audio_id FK constraint — only set if we're sure it references audio_tracks
    const isUUID = (v:any) => v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v));
    if (extraMeta?.listingId && isUUID(extraMeta.listingId)) insertPayload.listing_id = extraMeta.listingId;
    if (extraMeta?.listingTitle) insertPayload.listing_title = extraMeta.listingTitle;
    if (extraMeta?.listingPrice) insertPayload.listing_price = extraMeta.listingPrice;
    if (extraMeta?.listingMode)  insertPayload.listing_mode  = extraMeta.listingMode;
    if (extraMeta?.listingCity)  insertPayload.listing_city  = extraMeta.listingCity;
    if (extraMeta?.listingImage) insertPayload.listing_image = extraMeta.listingImage;
    if (extraMeta?.listingPins)  insertPayload.listing_pins  = extraMeta.listingPins;

    const { data, error } = await supabase
      .from('posts')
      .insert(insertPayload)
      .select('id, created_at, content, post_type, media_urls, video_url, audio_url')
      .single();

    if (error) {
      console.error('Post insert error:', error);
      throw new Error(error.message || 'Failed to create post');
    }

    if (!data) throw new Error('No data returned from post insert');

    return {
      id:              String(data.id),
      userId:          currentUser.id,
      userName:        currentUser.name,
      userAvatar:      currentUser.avatar,
      userAccountType: currentUser.accountType,
      content:         data.content || content || '',
      caption:         content || '',
      images:          toStringArray(media.images),
      videos:          toStringArray(media.videos),
      gifs:            toStringArray(media.gifs),
      audios:          toStringArray(media.audios),
      audioNames:      media.audioNames || [],
      likes:           [],
      likesCount:      0,
      commentCount:    0,
      isLiked:         false,
      createdAt:       data.created_at || new Date().toISOString(),
      allowComments:   allowComments !== false,
      allowDownload:   allowDownload !== false,
      taggedUserIds:   taggedUserIds || [],
      link:            link?.trim() || undefined,
      repostOf:        repostOf || undefined,
      audioTitle:      extraMeta?.audioTitle,
      audioArtist:     extraMeta?.audioArtist,
      audioId:         extraMeta?.audioId,
      audio_url:       audios?.[0] || undefined,
      listingId:       extraMeta?.listingId,
      listingTitle:    extraMeta?.listingTitle,
      listingPrice:    extraMeta?.listingPrice,
      listingMode:     extraMeta?.listingMode,
      listingCity:     extraMeta?.listingCity,
      listingImage:    extraMeta?.listingImage,
      listingPins:     extraMeta?.listingPins,
      tagPins:         extraMeta?.tagPins,
      location:        undefined, // set via insertPayload if provided
    } as Post;
  },

  update: async (postId: string, updates: Record<string, any>): Promise<void> => {
    const { error } = await supabase
      .from('posts')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', postId);
    if (error) throw new Error(error.message);
  },

  toggleLike: async (postId: string): Promise<{ liked: boolean; likesCount: number }> => {
    const currentUser = authApi.getCurrentUser();
    if (!currentUser) throw new Error('Not authenticated');

    // Primary: edge function (uses post_likes table via service-role SQL)
    try {
      return await call<{ liked: boolean; likesCount: number }>(`/posts/${postId}/like`, {
        method: 'POST',
        body: JSON.stringify({ userId: currentUser.id }),
      });
    } catch (edgeErr) {
      console.warn('[like] edge fn failed, falling back to metadata.likes:', edgeErr);
    }

    // Fallback: update metadata.likes JSONB directly on the posts table
    const { data: row, error: fetchErr } = await supabase
      .from('posts')
      .select('metadata, likes_count')
      .eq('id', postId)
      .single();
    if (fetchErr) throw new Error(fetchErr.message);

    const rawMeta = row?.metadata;
    const meta: any = rawMeta && typeof rawMeta === 'object' ? rawMeta
      : typeof rawMeta === 'string' ? (() => { try { return JSON.parse(rawMeta); } catch { return {}; } })()
      : {};
    const currentLikes: string[] = Array.isArray(meta.likes) ? meta.likes : [];

    // Also check post_likes table for authoritative liked state
    const { data: plRow } = await supabase
      .from('post_likes').select('user_id').eq('post_id', postId).eq('user_id', currentUser.id).maybeSingle();
    const isLiked = !!plRow || currentLikes.includes(currentUser.id);
    const newLikes = isLiked
      ? currentLikes.filter((id: string) => id !== currentUser.id)
      : [...currentLikes, currentUser.id];

    const { error: updateErr } = await supabase
      .from('posts')
      .update({ metadata: { ...meta, likes: newLikes }, likes_count: newLikes.length })
      .eq('id', postId);
    if (updateErr) throw new Error(updateErr.message);

    // Also sync to post_likes table
    if (isLiked) {
      await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', currentUser.id);
    } else {
      await supabase.from('post_likes').upsert(
        { post_id: postId, user_id: currentUser.id, created_at: new Date().toISOString() },
        { onConflict: 'post_id,user_id' },
      );
    }

    return { liked: !isLiked, likesCount: newLikes.length };
  },


  delete: async (postId: string): Promise<void> => {
    const currentUser = authApi.getCurrentUser();

    // Hard delete — removes the row from the DB entirely
    const hardQ = supabase.from('posts').delete().eq('id', postId);
    // Scope to own posts when we have the user id (prevents accidental cross-user deletes)
    if (currentUser?.id) hardQ.eq('author_id', currentUser.id);
    const { error: hardErr } = await hardQ;
    if (!hardErr) return;

    // Fallback: soft delete if RLS or FK constraints block the hard delete
    const { error: softErr } = await supabase
      .from('posts')
      .update({ is_archived: true, is_deleted: true })
      .eq('id', postId);
    if (softErr) throw new Error(hardErr.message || softErr.message);
  },

  /** Delete the current user's repost of a specific original post */
  unrepost: async (originalPostId: string): Promise<string | null> => {
    const currentUser = authApi.getCurrentUser();
    if (!currentUser) throw new Error('Not authenticated');
    const { deletedId } = await call<any>(
      `/posts/repost-by-user?userId=${encodeURIComponent(currentUser.id)}&originalPostId=${encodeURIComponent(originalPostId)}`,
      { method: 'DELETE' },
    );
    return deletedId ?? null;
  },
};

// ============================================
// COMMENTS API
// ============================================
// Comment cache — avoids re-fetching on every panel open
const _commentCache = new Map<string, Comment[]>();

export const commentsApi = {
  getPostComments: async (postId: string, limit = 5, offset = 0, sort: "newest" | "top" = "newest", userId?: string): Promise<Comment[]> => {
    const cacheKey = `${postId}:${sort}:${offset}:${userId ?? ''}`;
    const cached = _commentCache.get(cacheKey);
    if (cached) return cached;

    try {
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('post_id', postId)
        .is('parent_comment_id', null)
        .order('created_at', { ascending: sort !== 'newest' })
        .range(offset, offset + limit - 1);

      if (!error && data?.length) {
        const commentIds = data.map((r: any) => r.id);
        const authorIds  = [...new Set(data.map((r: any) => r.author_id).filter(Boolean))];

        // Batch: profiles + actual reply counts + current-user likes in parallel
        const [profilesRes, repliesRes, likesRes] = await Promise.all([
          authorIds.length
            ? supabase.from('profiles').select('id, name, username, avatar_url, account_type').in('id', authorIds)
            : Promise.resolve({ data: [] }),
          supabase.from('comments').select('parent_comment_id').in('parent_comment_id', commentIds),
          userId
            ? supabase.from('comment_likes').select('comment_id').in('comment_id', commentIds).eq('user_id', userId)
            : Promise.resolve({ data: [] }),
        ]);

        const profileMap: Record<string, any> = {};
        ((profilesRes as any).data || []).forEach((p: any) => { profileMap[p.id] = p; });

        const replyCountMap: Record<string, number> = {};
        ((repliesRes as any).data || []).forEach((r: any) => {
          replyCountMap[r.parent_comment_id] = (replyCountMap[r.parent_comment_id] || 0) + 1;
        });

        const likedSet = new Set(((likesRes as any).data || []).map((r: any) => r.comment_id));

        const list = data.map((row: any) => {
          const prof = profileMap[row.author_id] || {};
          return {
            id:              row.id,
            postId:          row.post_id,
            userId:          row.author_id,
            userName:        prof.name || prof.username || '',
            userAvatar:      prof.avatar_url || undefined,
            userAccountType: prof.account_type || undefined,
            content:         row.content || '',
            likes:           [],
            likesCount:      row.likes_count ?? 0,
            replyCount:      Math.max(row.replies_count ?? 0, replyCountMap[row.id] ?? 0),
            likedByMe:       likedSet.has(row.id),
            parentId:        row.parent_comment_id || undefined,
            createdAt:       row.created_at,
          };
        }) as Comment[];
        _commentCache.set(cacheKey, list);
        return list;
      }
    } catch {}

    // Fallback to edge function
    const fresh = call<any>(`/comments/post/${postId}?limit=${limit}&offset=${offset}&sort=${sort}`)
      .then(({ comments }) => {
        const list = (comments || []) as Comment[];
        _commentCache.set(cacheKey, list);
        return list;
      })
      .catch(() => []);
    return fresh;
  },

  getReplies: async (parentId: string): Promise<Comment[]> => {
    const cacheKey = `replies:${parentId}`;
    const cached = _commentCache.get(cacheKey);
    if (cached) return cached;

    // Primary: edge function
    try {
      const { comments } = await call<any>(`/comments/replies/${parentId}`);
      const list = (comments || []) as Comment[];
      if (list.length > 0) { _commentCache.set(cacheKey, list); return list; }
    } catch {}

    // Fallback: Supabase REST — two-query approach (join syntax unreliable)
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('parent_comment_id', parentId)
        .order('created_at', { ascending: true });
      if (!error && data?.length) {
        const authorIds = [...new Set(data.map((r: any) => r.author_id).filter(Boolean))];
        const profileMap: Record<string, any> = {};
        if (authorIds.length) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, name, username, avatar_url, account_type')
            .in('id', authorIds);
          (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });
        }
        const list = data.map((row: any) => {
          const prof = profileMap[row.author_id] || {};
          return {
            id:              row.id,
            postId:          row.post_id,
            userId:          row.author_id,
            userName:        prof.name || prof.username || '',
            userAvatar:      prof.avatar_url || undefined,
            userAccountType: prof.account_type || undefined,
            content:         row.content || '',
            likes:           [],
            likesCount:      row.likes_count ?? 0,
            parentId:        row.parent_comment_id,
            createdAt:       row.created_at,
          } as Comment;
        });
        _commentCache.set(cacheKey, list);
        return list;
      }
    } catch {}

    return [];
  },

  getCount: async (postId: string): Promise<number> => {
    // Primary: edge function (uses postgres superuser — correct even with RLS)
    try {
      const { count } = await call<any>(`/comments/count/${postId}`);
      if (typeof count === 'number') return count; // don't treat 0 as falsy
    } catch {}
    // Fallback: Supabase REST (only works if anon can SELECT on comments)
    try {
      const { count } = await supabase
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', postId)
        .is('parent_comment_id', null);
      return count ?? 0;
    } catch { return 0; }
  },

  // Sync version backed by a simple cache
  getCountSync: (postId: string): number => {
    try {
      const cache = JSON.parse(localStorage.getItem('filmons_comment_counts') || '{}');
      return cache[postId] || 0;
    } catch { return 0; }
  },

  add: async (postId: string, content: string, post?: Post, parentId?: string): Promise<Comment> => {
    const currentUser = authApi.getCurrentUser();
    if (!currentUser) throw new Error('Not authenticated');

    // Get fresh user data if session name/avatar is missing
    let u: any = currentUser;
    if (!u.name && !u.username) {
      try {
        const { user: fresh } = await authApi.getMe();
        if (fresh) { u = fresh; saveSession(fresh); }
      } catch {}
    }

    const displayName = u.name || u.username || u.email?.split('@')[0] || 'User';
    const avatar = u.avatar || u.avatar_url || undefined;

    const payload = {
      postId,
      parentId: parentId || '',
      userId:          currentUser.id,
      userName:        displayName,
      userAccountType: currentUser.accountType,
      userAvatar:      avatar,
      content:         content.trim(),
    };

    let enriched: Comment;
    let usedEdgeFunction = false;

    // Primary: edge function
    try {
      const { comment } = await call<any>('/comments', { method: 'POST', body: JSON.stringify(payload) });
      enriched = {
        ...comment,
        userId:          comment.userId          || currentUser.id,
        userName:        comment.userName        || displayName,
        userAvatar:      comment.userAvatar      || avatar,
        userAccountType: comment.userAccountType || currentUser.accountType,
        likes:           comment.likes           || [],
      };
      usedEdgeFunction = true;
    } catch (edgeErr) {
      console.warn('[comment] edge fn failed, using direct insert:', edgeErr);
      // Fallback: insert directly into comments table via Supabase REST
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const { error: insErr } = await supabase.from('comments').insert({
        id,
        post_id:           postId,
        author_id:         currentUser.id,
        content:           content.trim(),
        parent_comment_id: parentId || null,
        thread_level:      parentId ? 1 : 0,
        likes_count:       0,
        replies_count:     0,
        created_at:        now,
        updated_at:        now,
      });
      if (insErr) throw new Error(insErr.message);

      // Increment parent's replies_count when this is a reply
      if (parentId) {
        try {
          const { data: parentRow } = await supabase.from('comments').select('replies_count').eq('id', parentId).single();
          await supabase.from('comments').update({ replies_count: (parentRow?.replies_count ?? 0) + 1 }).eq('id', parentId);
        } catch {}
      }

      enriched = {
        id,
        postId,
        userId:          currentUser.id,
        userName:        displayName,
        userAvatar:      avatar,
        userAccountType: currentUser.accountType,
        content:         content.trim(),
        likes:           [],
        likesCount:      0,
        parentId:        parentId || null,
        createdAt:       now,
      } as Comment;

    }

    // Save @mentions (fire-and-forget — don't delay the return)
    commentsApi.saveMentions(enriched.id, content.trim(), postId).catch(() => {});

    // Update local comment count cache
    try {
      const cache = JSON.parse(localStorage.getItem('filmons_comment_counts') || '{}');
      cache[postId] = (cache[postId] || 0) + 1;
      localStorage.setItem('filmons_comment_counts', JSON.stringify(cache));
    } catch {}

    // Update comment cache so re-open shows new comment instantly
    const existing = _commentCache.get(postId) || [];
    _commentCache.set(postId, [...existing, enriched]);

    // ── Notifications — only when edge function didn't run (it handles its own) ─
    if (!usedEdgeFunction) {
      const commentSnip = content.slice(0, 120);
      try {
        if (parentId) {
          // Reply → notify the parent comment author
          const { data: parentRow } = await supabase
            .from('comments').select('author_id').eq('id', parentId).single();
          const parentAuthorId = parentRow?.author_id;
          if (parentAuthorId && parentAuthorId !== currentUser.id) {
            notifs.push(parentAuthorId, {
              type:           'comment_reply',
              fromUserId:     currentUser.id,
              fromUserName:   displayName,
              fromUserAvatar: avatar,
              postId,
              commentContent: commentSnip,
            });
          }
        } else {
          // Top-level comment → notify post author + friends
          const postOwnerId = post?.userId || (
            await supabase.from('posts').select('author_id').eq('id', postId).single()
              .then(({ data }) => data?.author_id)
          );
          const postSnippet = (post?.content || '').slice(0, 100);
          const postImg     = post?.images?.[0];
          if (postOwnerId && postOwnerId !== currentUser.id) {
            notifs.push(postOwnerId as string, {
              type:           'comment_received',
              fromUserId:     currentUser.id,
              fromUserName:   displayName,
              fromUserAvatar: avatar,
              postId,
              postContent:    postSnippet,
              postImage:      postImg,
              commentContent: commentSnip,
            });
          }
          const myFollowing = (authApi.getCurrentUser()?.following ?? []);
          (post?.likes || [])
            .filter(uid => uid !== currentUser.id && uid !== postOwnerId && myFollowing.includes(uid))
            .forEach(friendId => {
              notifs.push(friendId, {
                type:           'comment_received',
                fromUserId:     currentUser.id,
                fromUserName:   displayName,
                fromUserAvatar: avatar,
                postId,
                postContent:    postSnippet,
                postImage:      postImg,
                commentContent: commentSnip,
              });
            });
        }
      } catch {}
    }

    return enriched;
  },

  delete: async (commentId: string): Promise<void> => {
    try {
      await call(`/comments/${commentId}`, { method: 'DELETE' });
      return;
    } catch (edgeErr) {
      console.warn('[comment-delete] edge fn failed, using REST fallback:', edgeErr);
    }
    // REST fallback — delete directly from comments table
    const { error } = await supabase.from('comments').delete().eq('id', commentId);
    if (error) throw new Error(error.message);
  },

  toggleCommentLike: async (commentId: string): Promise<{ liked: boolean; likesCount: number }> => {
    const currentUser = authApi.getCurrentUser();
    if (!currentUser) throw new Error('Not authenticated');

    // Fetch current count + check if already liked in one query
    const [{ data: commentRow }, { data: existing, error: checkErr }] = await Promise.all([
      supabase.from('comments').select('likes_count').eq('id', commentId).single(),
      supabase.from('comment_likes').select('user_id')
        .eq('comment_id', commentId).eq('user_id', currentUser.id).maybeSingle(),
    ]);
    if (checkErr) throw new Error(checkErr.message);

    const currentCount = commentRow?.likes_count ?? 0;
    const wasLiked = !!existing;

    if (wasLiked) {
      const { error: delErr } = await supabase
        .from('comment_likes')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', currentUser.id);
      if (delErr) throw new Error(delErr.message);
    } else {
      const { error: insErr } = await supabase
        .from('comment_likes')
        .insert({ comment_id: commentId, user_id: currentUser.id });
      if (insErr) throw new Error(insErr.message);
    }

    const nowLiked = !wasLiked;
    const likesCount = Math.max(0, nowLiked ? currentCount + 1 : currentCount - 1);
    try { await supabase.from('comments').update({ likes_count: likesCount }).eq('id', commentId); } catch {}
    return { liked: nowLiked, likesCount };
  },

  // Search users for @mention autocomplete
  searchMentionable: async (query: string): Promise<{ id: string; name: string; username: string; avatar?: string }[]> => {
    if (!query || query.length < 1) return [];
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url')
        .or(`name.ilike.%${query}%,username.ilike.%${query}%`)
        .limit(6);
      return (data || []).map((p: any) => ({
        id:       p.id,
        name:     p.name || p.username || '',
        username: p.username || '',
        avatar:   p.avatar_url || undefined,
      }));
    } catch { return []; }
  },

  // Save @mentions from a comment to the comment_mentions table and notify users
  saveMentions: async (commentId: string, content: string, postId: string): Promise<void> => {
    const currentUser = authApi.getCurrentUser();
    if (!currentUser) return;

    // Extract @usernames from content
    const handles = [...new Set((content.match(/@(\w+)/g) || []).map(h => h.slice(1)))];
    if (!handles.length) return;

    try {
      // Resolve handles → profile IDs
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url')
        .in('username', handles);

      const mentionedUsers = (profiles || []).filter(
        (p: any) => p.id !== currentUser.id, // don't notify yourself
      );
      if (!mentionedUsers.length) return;

      // Insert into comment_mentions
      await supabase.from('comment_mentions').insert(
        mentionedUsers.map((p: any) => ({ comment_id: commentId, mentioned_user_id: p.id })),
      );

      // Send mention notifications
      const displayName = currentUser.name || currentUser.username || 'Someone';
      const avatar      = currentUser.avatar || undefined;
      for (const p of mentionedUsers as any[]) {
        notifs.push(p.id, {
          type:           'comment_mention',
          fromUserId:     currentUser.id,
          fromUserName:   displayName,
          fromUserAvatar: avatar,
          postId,
          commentContent: content.slice(0, 120),
        });
      }
    } catch {}
  },
};

// ============================================
// SOCIAL API
// ============================================
export const socialApi = {
  follow: async (targetUserId: string): Promise<User> => {
    const currentUser = authApi.getCurrentUser();
    if (!currentUser) throw new Error('Not authenticated');
    if (currentUser.id === targetUserId) throw new Error('Cannot follow yourself');
    const { user } = await call<any>(`/users/${targetUserId}/follow`, {
      method: 'POST',
      body: JSON.stringify({ currentUserId: currentUser.id }),
    });
    // Update session
    saveSession(user);

    // ── Notification: tell target they have a new follower ────────────────
    // If the target was already following the current user, it's a follow-back.
    const isFollowBack = (currentUser.followers || []).includes(targetUserId);
    notifs.push(targetUserId, {
      type: 'new_follower',
      fromUserId:    currentUser.id,
      fromUserName:  currentUser.name,
      fromUserAvatar: currentUser.avatar,
      followBack: isFollowBack,
    });

    return user;
  },

  unfollow: async (targetUserId: string): Promise<User> => {
    const currentUser = authApi.getCurrentUser();
    if (!currentUser) throw new Error('Not authenticated');
    const { user } = await call<any>(`/users/${targetUserId}/unfollow`, {
      method: 'POST',
      body: JSON.stringify({ currentUserId: currentUser.id }),
    });
    saveSession(user);
    return user;
  },

  isFollowing: (currentUserId: string, targetUserId: string): boolean => {
    const user = loadSession();
    return user?.following?.includes(targetUserId) ?? false;
  },

  getFollowers: async (userId: string): Promise<User[]> => {
    try {
      const { user } = await call<any>(`/users/${userId}`);
      if (!user?.followers?.length) return [];
      const all = await authApi.getAllUsers();
      return all.filter(u => user.followers.includes(u.id));
    } catch { return []; }
  },

  getFollowing: async (userId: string): Promise<User[]> => {
    try {
      const { user } = await call<any>(`/users/${userId}`);
      if (!user?.following?.length) return [];
      const all = await authApi.getAllUsers();
      return all.filter(u => user.following.includes(u.id));
    } catch { return []; }
  },
};

// ============================================
// SAVED POSTS API
// ============================================
export const savedPostsApi = {
  getSaved: async (userId: string): Promise<Post[]> => {
    try {
      const { data } = await supabase
        .from('favorites').select('item_data')
        .eq('user_id', userId).eq('item_type', 'post').order('created_at', { ascending: false });
      if (data?.length) return data.map(r => r.item_data).filter(Boolean);
    } catch {}
    try { const { posts } = await call<any>(`/saved/posts/${userId}`); return (posts || []).map((p: any) => normalizePostMedia(p)); }
    catch { return []; }
  },

  isSavedSync: (userId: string, postId: string): boolean => {
    try {
      const ids: string[] = JSON.parse(localStorage.getItem(`saved_posts_cache_${userId}`) || '[]');
      return ids.includes(postId);
    } catch { return false; }
  },

  toggle: async (userId: string, postId: string, postData?: any): Promise<boolean> => {
    const cacheKey = `saved_posts_cache_${userId}`;
    let ids: string[] = [];
    try { ids = JSON.parse(localStorage.getItem(cacheKey) || '[]'); } catch {}
    const alreadySaved = ids.includes(postId);
    const newIds = alreadySaved ? ids.filter(id => id !== postId) : [...ids, postId];
    localStorage.setItem(cacheKey, JSON.stringify(newIds));
    try {
      if (alreadySaved) {
        await supabase.from('favorites').delete().eq('user_id', userId).eq('item_id', postId);
      } else {
        await supabase.from('favorites').upsert({
          user_id: userId, item_id: postId, item_type: 'post', item_data: postData || {},
        }, { onConflict: 'user_id,item_id' });
      }
    } catch (e) { console.warn('[favorites] post save:', e); }
    try { await call<any>(`/saved/posts/${userId}/toggle`, { method: 'POST', body: JSON.stringify({ postId }) }); } catch {}
    return !alreadySaved;
  },
};

// ============================================
// SAVED LISTINGS API
// ============================================
export const savedListingsApi = {
  getSaved: async (userId: string): Promise<any[]> => {
    const { listings } = await call<any>(`/saved/listings/${userId}`);
    return listings || [];
  },

  isSaved: async (userId: string, listingId: string): Promise<boolean> => {
    const { ids } = await call<any>(`/saved/listings/${userId}`);
    return (ids || []).includes(listingId);
  },

  isSavedSync: (userId: string, listingId: string): boolean => {
    try {
      const ids: string[] = JSON.parse(localStorage.getItem(`saved_listings_cache_${userId}`) || '[]');
      return ids.includes(listingId);
    } catch { return false; }
  },

  toggle: async (userId: string, listingId: string, listingData?: any): Promise<boolean> => {
    // Optimistic local update
    const cachedKey = `saved_listings_cache_${userId}`;
    let ids: string[] = [];
    try { ids = JSON.parse(localStorage.getItem(cachedKey) || '[]'); } catch {}
    const alreadySaved = ids.includes(listingId);
    const newIds = alreadySaved ? ids.filter(id => id !== listingId) : [...ids, listingId];
    localStorage.setItem(cachedKey, JSON.stringify(newIds));

    // Write to favorites table in Supabase
    try {
      if (alreadySaved) {
        await supabase.from('favorites').delete().eq('user_id', userId).eq('item_id', listingId);
      } else {
        await supabase.from('favorites').upsert({
          user_id:    userId,
          item_id:    listingId,
          item_type:  'listing',
          item_data:  listingData || {},
        }, { onConflict: 'user_id,item_id' });
      }
    } catch (e) { console.warn('[favorites] DB write failed:', e); }

    // Also sync to edge function (fire and forget)
    try {
      await call<any>(`/saved/listings/${userId}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ listingId }),
      });
    } catch {}

    return !alreadySaved;
  },
};

// ============================================
// CHAT API — sync reads from localStorage, async writes to server (dual-write)
// ============================================

function genMsgId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }

// ── Deleted-conversation registry ──────────────────────────────────────────
// Tracks which participant pairs had their conversation deleted, so the next
// message they exchange opens a fresh conversation with a system notice.
const DELETED_CONVS_KEY = 'filmons_deleted_convs';
interface DeletedConvRecord { participants: string[]; deletedAt: string; deletedBy: string; }
function loadDeletedConvs(): DeletedConvRecord[] {
  try { return JSON.parse(localStorage.getItem(DELETED_CONVS_KEY) || '[]'); } catch { return []; }
}
function recordDeletedConv(participants: string[], deletedBy: string): void {
  const records = loadDeletedConvs();
  const filtered = records.filter(r =>
    !(r.participants.includes(participants[0]) && r.participants.includes(participants[1]))
  );
  filtered.unshift({ participants, deletedAt: new Date().toISOString(), deletedBy });
  localStorage.setItem(DELETED_CONVS_KEY, JSON.stringify(filtered.slice(0, 200)));
}
function consumeDeletedConvRecord(userId1: string, userId2: string): DeletedConvRecord | null {
  const records = loadDeletedConvs();
  const idx = records.findIndex(r => r.participants.includes(userId1) && r.participants.includes(userId2));
  if (idx === -1) return null;
  const found = records[idx];
  records.splice(idx, 1);
  localStorage.setItem(DELETED_CONVS_KEY, JSON.stringify(records));
  return found;
}

function loadConvs(): Conversation[] {
  try { return JSON.parse(localStorage.getItem('filmons_conversations') || '[]'); } catch { return []; }
}
function saveConvs(convs: Conversation[]) {
  localStorage.setItem('filmons_conversations', JSON.stringify(convs));
}
function syncConvToServer(conv: Conversation) {
  // Full upsert — used for metadata changes (accept request, block, etc.)
  // Not used for new messages to avoid double-bumping unread_count.
  fetch(`${BASE}/conversations/${conv.id}`, {
    method: 'PUT', headers: H(),
    body: JSON.stringify({ ...conv, messages: [] }), // don't re-save messages here
  }).catch(e => console.warn('Conv server sync error:', e));
}

function syncMessageToServer(convId: string, message: ChatMessage) {
  const conv = loadConvs().find(c => c.id === convId);
  fetch(`${BASE}/conversations/${convId}/messages`, {
    method: 'POST', headers: H(),
    body: JSON.stringify({
      ...message,
      participantIds: conv?.participantIds ?? [],
      isRequest:      conv?.isRequest      ?? false,
      requestedBy:    conv?.requestedBy    ?? null,
    }),
  }).catch(e => console.warn('Message server sync error:', e));
}

/** Create (or confirm) a conversation in the server's `conversations` table
 *  using the SAME client-generated ID so client ↔ server IDs always match. */
function createConvOnServer(conv: { id: string; participantIds: string[]; isRequest: boolean; requestedBy: string | null }) {
  fetch(`${BASE}/conversations/${conv.id}`, {
    method: 'PUT', headers: H(),
    body: JSON.stringify({
      id:             conv.id,
      participantIds: conv.participantIds,
      isRequest:      conv.isRequest,
      requestedBy:    conv.requestedBy,
      messages:       [],
    }),
  }).catch(e => console.warn('Create conv server error:', e));
}

// ── Shared DB-row → ChatMessage converter ──────────────────────────────────
// Exported so Inbox.tsx's Realtime subscriber can use the same mapping.
export function dbRowToMsg(raw: any): ChatMessage {
  const meta = raw.metadata && typeof raw.metadata === 'object'
    ? raw.metadata
    : (() => { try { return JSON.parse(raw.metadata ?? '{}'); } catch { return {}; } })();
  return {
    id:              raw.id,
    conversationId:  raw.conversation_id,
    senderId:        raw.sender_id,
    senderName:      raw.sender_name    || meta.senderName    || undefined,
    senderAvatar:    raw.sender_avatar  || meta.senderAvatar  || undefined,
    type:            raw.type           ?? 'text',
    content:         raw.content        ?? undefined,
    mediaUrl:        meta.mediaUrl      ?? undefined,
    mediaType:       meta.mediaType     ?? undefined,
    sharedPost:      meta.sharedPost ? normalizePostMedia(meta.sharedPost) : undefined,
    rentalRequest:   meta.rentalRequest ?? undefined,
    paymentRequest:  meta.paymentRequest?? undefined,
    replyTo:         raw.reply_to       ?? undefined,
    forwardedFrom:   raw.forwarded_from ?? undefined,
    isPinned:        raw.is_pinned      ?? false,
    editedAt:        raw.edited_at
                       ? (typeof raw.edited_at === 'string'
                           ? raw.edited_at
                           : new Date(raw.edited_at).toISOString())
                       : undefined,
    deletedFor:      raw.deleted_for    ?? {},
    createdAt:       typeof raw.created_at === 'string'
                       ? raw.created_at
                       : new Date(raw.created_at).toISOString(),
    read:            meta.read ?? false,
  };
}

export { consumeDeletedConvRecord };

export const chatApi = {
  // ── Sync (localStorage) — used by most components ──────────────────────
  getOrCreate(userId1: string, userId2: string): Conversation {
    const convs = loadConvs();
    const existing = convs.find(c =>
      c.participantIds.includes(userId1) &&
      c.participantIds.includes(userId2) &&
      c.participantIds.length === 2
    );
    if (existing) return existing;

    // Determine if this should be a message request:
    // userId1 is the sender; if userId2 does NOT follow userId1 back, it's a request.
    const allUsers: User[] = (() => { try { return JSON.parse(localStorage.getItem('filmons_users') || '[]'); } catch { return []; } })();
    const recipient = allUsers.find(u => u.id === userId2);
    const isRequest = !!(recipient && !(recipient.following || []).includes(userId1));

    const id = genMsgId();
    const newConv: Conversation = {
      id,
      participantIds: [userId1, userId2],
      messages: [],
      updatedAt: new Date().toISOString(),
      isRequest,
      requestedBy: userId1,
    };
    convs.push(newConv);
    saveConvs(convs);
    // Persist to `conversations` table with the SAME client-generated ID
    createConvOnServer({ id, participantIds: [userId1, userId2], isRequest, requestedBy: userId1 });
    return newConv;
  },

  getUserConversations(userId: string): Conversation[] {
    return loadConvs()
      .filter(c => c.participantIds.includes(userId))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  },

  /** Accept a message request — marks the conversation as no longer a request */
  acceptRequest(conversationId: string): void {
    const convs = loadConvs();
    const idx = convs.findIndex(c => c.id === conversationId);
    if (idx === -1) return;
    convs[idx].isRequest = false;
    saveConvs(convs);
    syncConvToServer(convs[idx]);
  },

  /** Decline a message request — deletes the conversation */
  declineRequest(conversationId: string): void {
    const convs = loadConvs().filter(c => c.id !== conversationId);
    saveConvs(convs);
  },

  // ── Internal helper: ensure a conversation exists in the localStorage cache.
  //    Conversations loaded from the DB are in React state only; when the user
  //    sends a message the chatApi send functions need a cache entry to write to.
  _ensureLocalConv(conversationId: string, senderId: string): { convs: Conversation[]; idx: number } {
    const convs = loadConvs();
    let idx = convs.findIndex(c => c.id === conversationId);
    if (idx === -1) {
      // Conv came from DB — add a minimal cache entry so the write path works.
      // participantIds will be incomplete (only senderId) but that's OK because
      // syncMessageToServer reads participants from the DB via conversation_participants.
      convs.push({
        id: conversationId,
        participantIds: [senderId],
        messages: [],
        updatedAt: new Date().toISOString(),
        isRequest: false,
        requestedBy: null,
      });
      idx = convs.length - 1;
    }
    return { convs, idx };
  },

  sendMessage(conversationId: string, senderId: string, senderName: string, senderAvatar: string | undefined, content: string): ChatMessage {
    const { convs, idx } = chatApi._ensureLocalConv(conversationId, senderId);
    const message: ChatMessage = { id: genMsgId(), senderId, senderName, senderAvatar, type: 'text', content, createdAt: new Date().toISOString() };
    convs[idx].messages.push(message);
    convs[idx].updatedAt = new Date().toISOString();
    saveConvs(convs);
    syncMessageToServer(conversationId, message);

    // ── Notify the recipient ──────────────────────────────────────────────────
    const recipientId = convs[idx].participantIds.find(id => id !== senderId);
    if (recipientId) {
      notifs.push(recipientId, {
        type: 'message_received',
        fromUserId:     senderId,
        fromUserName:   senderName,
        fromUserAvatar: senderAvatar,
        conversationId,
        commentContent: content?.slice(0, 100),
      });
      // External notification — schedules email (5 min) + SMS (10 min) if unread
      import('./messageNotification').then(mod => {
        mod.notifyReceiverForMessage({
          receiverId:     recipientId,
          sender:         { id: senderId, name: senderName },
          messageText:    content,
          conversationId,
        });
      }).catch(() => {});
    }
    return message;
  },

  sendRentalRequest(conversationId: string, senderId: string, senderName: string, senderAvatar: string | undefined, request: ChatMessage['rentalRequest']): ChatMessage {
    const { convs, idx } = chatApi._ensureLocalConv(conversationId, senderId);
    const message: ChatMessage = { id: genMsgId(), senderId, senderName, senderAvatar, type: 'rental_request', rentalRequest: request, createdAt: new Date().toISOString() };
    convs[idx].messages.push(message);
    convs[idx].updatedAt = new Date().toISOString();
    saveConvs(convs);
    syncMessageToServer(conversationId, message);
    return message;
  },

  buildTextMessage(conversationId: string, senderId: string, senderName: string, senderAvatar: string | undefined, text: string): ChatMessage {
    return { id: genMsgId(), senderId, senderName, senderAvatar, type: 'text', content: text, createdAt: new Date().toISOString() };
  },

  sendPaymentRequest(conversationId: string, senderId: string, senderName: string, senderAvatar: string | undefined, payment: ChatMessage['paymentRequest']): ChatMessage {
    const { convs, idx } = chatApi._ensureLocalConv(conversationId, senderId);
    const message: ChatMessage = { id: genMsgId(), senderId, senderName, senderAvatar, type: 'payment_request', paymentRequest: payment, createdAt: new Date().toISOString() };
    convs[idx].messages.push(message);
    convs[idx].updatedAt = new Date().toISOString();
    saveConvs(convs);
    syncMessageToServer(conversationId, message);
    return message;
  },

  sendMediaMessage(conversationId: string, senderId: string, senderName: string, senderAvatar: string | undefined, mediaUrl: string, mediaType: 'image' | 'video' | 'audio', content?: string): ChatMessage {
    const { convs, idx } = chatApi._ensureLocalConv(conversationId, senderId);
    const message: ChatMessage = { id: genMsgId(), senderId, senderName, senderAvatar, type: 'media', mediaUrl, mediaType, content, createdAt: new Date().toISOString() };
    convs[idx].messages.push(message);
    convs[idx].updatedAt = new Date().toISOString();
    saveConvs(convs);
    syncMessageToServer(conversationId, message);
    return message;
  },

  sharePost(conversationId: string, senderId: string, senderName: string, senderAvatar: string | undefined, post: any, content?: string): ChatMessage {
    const { convs, idx } = chatApi._ensureLocalConv(conversationId, senderId);
    const message: ChatMessage = { id: genMsgId(), senderId, senderName, senderAvatar, type: 'post', sharedPost: post, content, createdAt: new Date().toISOString() };
    convs[idx].messages.push(message);
    convs[idx].updatedAt = new Date().toISOString();
    saveConvs(convs);
    syncMessageToServer(conversationId, message);
    return message;
  },

  updateMessage(conversationId: string, messageId: string, updates: Partial<ChatMessage>): Conversation {
    const convs = loadConvs();
    const idx = convs.findIndex(c => c.id === conversationId);
    if (idx === -1) throw new Error('Conversation not found');
    convs[idx].messages = convs[idx].messages.map(m => m.id === messageId ? { ...m, ...updates } : m);
    convs[idx].updatedAt = new Date().toISOString();
    saveConvs(convs);
    syncConvToServer(convs[idx]);
    return convs[idx];
  },

  markAsRead(conversationId: string, userId: string): void {
    // Optimistic local update — clear unread count immediately
    const convs = loadConvs();
    const idx   = convs.findIndex(c => c.id === conversationId);
    if (idx !== -1) {
      convs[idx].messages = convs[idx].messages.map(m =>
        m.senderId !== userId ? { ...m, read: true } : m
      );
      convs[idx].unreadCount = 0;
      saveConvs(convs);
    }
    // Notify bottom nav / sidebar badge to update immediately
    try { window.dispatchEvent(new CustomEvent('filmons:unread-changed')); } catch {}
    // Fire-and-forget: reset unread count in conversation_participants
    fetch(`${BASE}/conversations/${conversationId}/read`, {
      method: 'POST', headers: H(),
      body: JSON.stringify({ userId }),
    }).catch(e => console.warn('Mark read error:', e));
  },

  // Alias for backwards compatibility
  markRead(conversationId: string, userId: string): void {
    return chatApi.markAsRead(conversationId, userId);
  },

  updateConversation(conversationId: string, updates: Partial<Conversation>): Conversation {
    const convs = loadConvs();
    const idx = convs.findIndex(c => c.id === conversationId);
    if (idx === -1) throw new Error('Conversation not found');
    convs[idx] = { ...convs[idx], ...updates, id: convs[idx].id, updatedAt: new Date().toISOString() };
    saveConvs(convs);
    syncConvToServer(convs[idx]);
    return convs[idx];
  },

  getConversation(conversationId: string): Conversation | null {
    return loadConvs().find(c => c.id === conversationId) || null;
  },

  getUnreadCount(userId: string): number {
    return loadConvs()
      .filter(c => c.participantIds.includes(userId))
      .reduce((count, conv) => count + conv.messages.filter(m => !m.read && m.senderId !== userId).length, 0);
  },

  // ── Async server-side versions (for future migration) ──────────────────
  // ── In-flight guard: only one fetch at a time, min 20s between fetches ──
  _fetchInFlight: false as boolean,
  _fetchLastAt: 0 as number,

  async fetchConversations(userId: string): Promise<Conversation[]> {
    // Prevent concurrent fetches and hammering the DB
    if ((chatApi as any)._fetchInFlight) {
      return chatApi.getUserConversations(userId);
    }
    const now = Date.now();
    if (now - (chatApi as any)._fetchLastAt < 20_000) {
      return chatApi.getUserConversations(userId);
    }
    (chatApi as any)._fetchInFlight = true;
    (chatApi as any)._fetchLastAt = now;

    try {
      // Use Supabase REST directly — faster than edge function (no Deno cold start)
      const { data: rows, error } = await supabase
        .from('conversations')
        .select('*')
        .contains('participants', [userId])
        .order('updated_at', { ascending: false })
        .limit(30);

      // If contains fails (wrong array type), try overlaps or raw filter
      let finalRows = rows;
      if (error || !rows?.length) {
        const { data: rows2 } = await supabase
          .from('conversations')
          .select('*')
          .or(`participants.cs.{"${userId}"},participants.ov.{"${userId}"}`)
          .order('updated_at', { ascending: false })
          .limit(30);
        finalRows = rows2 || [];
        if (error && !rows2?.length) throw new Error(error.message);
      }
      const serverConvs = (finalRows || []).map((row: any) => ({
        id:             String(row.id),
        participantIds: Array.isArray(row.participants) ? row.participants : [],
        participantProfiles: [],
        isRequest:      row.is_request    ?? false,
        requestedBy:    row.requested_by  ?? null,
        updatedAt:      row.updated_at    ?? new Date().toISOString(),
        lastMessagePreview: '',
        lastMessageAt:  row.updated_at    ?? null,
        messages:       [],
        unreadCount:    0,
      }));

      // Fetch participant profiles for each conversation in background
      const profileIds = [...new Set(
        serverConvs.flatMap((c: any) => c.participantIds).filter((id: string) => id !== userId)
      )];
      if (profileIds.length) {
        supabase.from('profiles')
          .select('id, name, username, avatar_url, account_type')
          .in('id', profileIds)
          .then(({ data: profiles }) => {
            if (!profiles) return;
            const cache: Record<string, any> = JSON.parse(localStorage.getItem('filmons_users_cache') || '{}');
            profiles.forEach((p: any) => {
              cache[p.id] = {
                id: p.id,
                name: p.name || p.username,
                username: p.username,
                avatar: p.avatar_url,
                accountType: p.account_type,
              };
            });
            localStorage.setItem('filmons_users_cache', JSON.stringify(cache));
          }).catch(() => {});
      }

      // Note: per-conversation message queries removed (N+1 problem → DB timeouts).
      // Last message preview is populated from localStorage cache or when a conversation is opened.
      if (Array.isArray(serverConvs)) {
        const local = loadConvs();
        // If the server returned 0 conversations but we have local ones, don't
        // blindly wipe them — treat it as a potential server hiccup and preserve local.
        if (serverConvs.length === 0 && local.length > 0) {
          return local.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        }
        // Cache participant profiles from server response for instant getUserByIdSync
        try {
          const profileCache: Record<string, any> = JSON.parse(localStorage.getItem('filmons_users_cache') || '{}');
          serverConvs.forEach((sc: any) => {
            if (Array.isArray(sc.participantProfiles)) {
              sc.participantProfiles.forEach((p: any) => {
                if (p?.id) profileCache[p.id] = { ...profileCache[p.id], ...p };
              });
            }
          });
          localStorage.setItem('filmons_users_cache', JSON.stringify(profileCache));
        } catch {}

        // Merge: server wins for metadata; preserve local-only pending messages
        // so optimistically-added messages don't disappear before the server confirms them.
        const merged: Conversation[] = serverConvs.map((sc: any) => {
          const localConv = local.find(lc => lc.id === sc.id);
          const serverMsgs: ChatMessage[] = Array.isArray(sc.messages) ? sc.messages : [];
          if (!localConv) return { ...sc, messages: serverMsgs };
          // Keep any local message whose ID is not yet in the server response (pending sync)
          const serverMsgIds = new Set(serverMsgs.map((m) => m.id));
          const pendingLocal = localConv.messages.filter(m => !serverMsgIds.has(m.id));
          const mergedMsgs = [...serverMsgs, ...pendingLocal].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          return { ...localConv, ...sc, messages: mergedMsgs };
        });
        // Also keep local-only conversations (not on server yet)
        local.forEach(c => {
          if (!merged.some(s => s.id === c.id)) merged.push(c);
        });
        saveConvs(merged);
        return merged.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      }
    } catch (e) { console.warn('fetchConversations server error:', e); }
    finally { (chatApi as any)._fetchInFlight = false; }
    return chatApi.getUserConversations(userId);
  },

  /** Fetch a single conversation by ID — server first, localStorage fallback */
  async fetchConversationById(convId: string): Promise<Conversation | null> {
    // Always check localStorage first so locally-created convs resolve instantly
    const local = loadConvs().find(c => c.id === convId) ?? null;
    try {
      const { conversation } = await call<any>(`/conversations/${convId}`);
      if (conversation) {
        // Merge server metadata into cache, preserving any pending local messages
        const convs = loadConvs();
        const idx = convs.findIndex(c => c.id === convId);
        const serverMsgs: ChatMessage[] = Array.isArray(conversation.messages) ? conversation.messages : [];
        if (idx === -1) {
          convs.push({ ...conversation, messages: serverMsgs });
        } else {
          const serverIds = new Set(serverMsgs.map((m: ChatMessage) => m.id));
          const pending = convs[idx].messages.filter(m => !serverIds.has(m.id));
          convs[idx] = { ...convs[idx], ...conversation,
            messages: [...serverMsgs, ...pending].sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            ),
          };
        }
        saveConvs(convs);
        return convs[idx === -1 ? convs.length - 1 : idx] as Conversation;
      }
      // Server returned null (not synced yet) — use localStorage copy
      return local;
    } catch (e) {
      // Server unreachable or error — silently fall back to localStorage
      console.warn('fetchConversationById: server unavailable, using local cache', convId);
      return local;
    }
  },

  async fetchMessages(convId: string): Promise<ChatMessage[]> {
    try {
      // Route through the server edge function to bypass RLS
      const data = await call<any>(`/conversations/${encodeURIComponent(convId)}/messages?limit=100`);
      const messages: ChatMessage[] = (data?.messages || []).map(dbRowToMsg);

      if (!messages.length) {
        console.warn('[fetchMessages] edge fn returned 0 messages for conv', convId,
          '— check: (1) SUPABASE_DB_URL set in edge function secrets, (2) conversation_id in messages table matches this ID');
      }

      // Merge into localStorage cache
      const convs = loadConvs();
      const idx   = convs.findIndex(c => c.id === convId);
      if (idx !== -1) {
        const serverMsgIds = new Set(messages.map((m: ChatMessage) => m.id));
        const pendingLocal = convs[idx].messages.filter(m => !serverMsgIds.has(m.id));
        const merged = [...messages, ...pendingLocal].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        convs[idx].messages = merged;
        saveConvs(convs);
        return merged;
      } else {
        convs.push({
          id: convId, participantIds: [], messages,
          updatedAt: new Date().toISOString(), isRequest: false, requestedBy: null,
        } as Conversation);
        saveConvs(convs);
        return messages;
      }
    } catch (e) {
      console.warn('[fetchMessages] edge fn failed for conv', convId, ':', e, '— trying direct Supabase');
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('id, conversation_id, sender_id, sender_name, sender_avatar, type, content, metadata, created_at, reply_to, forwarded_from, is_pinned, deleted_for, is_deleted')
          .eq('conversation_id', convId)
          .order('created_at', { ascending: false })
          .limit(100);
        if (error) {
          console.warn('[fetchMessages] direct Supabase error:', error.message,
            '— likely missing RLS SELECT policy on messages table. Fix: add policy "auth.uid()::text = ANY(SELECT unnest(participants) FROM conversations WHERE id = conversation_id)"');
        }
        if (data && data.length > 0) {
          // Reverse so messages are oldest-first after fetching newest-first
          const messages: ChatMessage[] = data.reverse().map(dbRowToMsg);
          // Union-merge into localStorage cache
          const convs = loadConvs();
          const idx = convs.findIndex(c => c.id === convId);
          if (idx !== -1) {
            const serverMap = new Map(messages.map(m => [m.id, m]));
            const kept = convs[idx].messages.filter(m => !serverMap.has(m.id));
            convs[idx].messages = [...kept, ...messages].sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );
            saveConvs(convs);
          }
          return messages;
        }
      } catch (supaErr) { console.warn('[fetchMessages] direct Supabase also failed:', supaErr); }
    }
    return loadConvs().find(c => c.id === convId)?.messages ?? [];
  },

  /** Get or create a conversation via `get_or_create_direct_conversation` RPC.
   *  Returns the canonical server UUID — prevents duplicate conversations. */
  async getOrCreateDB(userId1: string, userId2: string): Promise<Conversation> {
    const [p1, p2] = [userId1, userId2].sort();

    // Try RPC first (atomic, race-condition safe)
    try {
      const { data: convId, error } = await supabase.rpc('get_or_create_direct_conversation', {
        p_user1_id: p1,
        p_user2_id: p2,
      });
      if (!error && convId) {
        const { data: row } = await supabase
          .from('conversations')
          .select('id, is_request, requested_by, participants')
          .eq('id', String(convId))
          .single();
        // RPC may store requested_by as the alphabetically-sorted first ID,
        // not necessarily the initiator. Correct it if wrong.
        if (row && row.requested_by !== userId1) {
          await supabase.from('conversations')
            .update({ requested_by: userId1 })
            .eq('id', String(convId));
        }
        return {
          id:             String(convId),
          participantIds: [p1, p2],
          messages:       [],
          updatedAt:      new Date().toISOString(),
          isRequest:      row?.is_request ?? true,
          requestedBy:    userId1,
        } as Conversation;
      }
    } catch {}

    // Find existing — check both orderings, prefer accepted conversations
    const { data: rows } = await supabase
      .from('conversations')
      .select('id, participants, updated_at, is_request, requested_by')
      .or(`participants.cs.{"${p1}","${p2}"},participants.cs.{"${p2}","${p1}"}`)
      .eq('deleted_for_everyone', false)
      .order('created_at', { ascending: true })
      .limit(10);

    const matches = (rows || []).filter((r: any) => {
      const parts: string[] = Array.isArray(r.participants)
        ? r.participants
        : (() => { try { return JSON.parse(r.participants); } catch { return []; } })();
      return parts.includes(p1) && parts.includes(p2);
    });

    // Prefer accepted (is_request = false) over pending requests
    const existing = matches.find((r: any) => !r.is_request) || matches[0];

    if (existing) {
      return {
        id:             String(existing.id),
        participantIds: [p1, p2],
        messages:       [],
        updatedAt:      existing.updated_at || new Date().toISOString(),
        isRequest:      existing.is_request ?? false,
        requestedBy:    existing.requested_by || userId1,
      } as Conversation;
    }

    // Create new — always starts as request until accepted
    const newId = crypto.randomUUID();
    const { data: created, error: createErr } = await supabase
      .from('conversations')
      .insert({
        id:                   newId,
        participants:         [p1, p2],
        is_request:           true,
        requested_by:         userId1,
        deleted_for_everyone: false,
        updated_at:           new Date().toISOString(),
        created_at:           new Date().toISOString(),
      })
      .select('id')
      .single();

    if (createErr) {
      if (createErr.code === '23505') {
        // Race condition — another request created it, fetch and return
        const { data: raced } = await supabase
          .from('conversations')
          .select('id, is_request, requested_by')
          .contains('participants', [p1])
          .order('created_at', { ascending: true })
          .limit(10);
        const match = (raced || []).find((r: any) => {
          const parts = Array.isArray(r.participants) ? r.participants : [];
          return parts.includes(p1) && parts.includes(p2);
        });
        if (match) return { id: String(match.id), participantIds: [p1, p2], messages: [], updatedAt: new Date().toISOString(), isRequest: match.is_request ?? true, requestedBy: userId1 } as Conversation;
      }
      return chatApi.getOrCreate(userId1, userId2);
    }

    return {
      id:             String(created.id),
      participantIds: [p1, p2],
      messages:       [],
      updatedAt:      new Date().toISOString(),
      isRequest:      true,
      requestedBy:    userId1,
    } as Conversation;
  },


  /** Write a message directly to the `messages` table via Supabase.
   *  Uses `get_or_create_direct_conversation` to guarantee the conv row exists.
   *  Falls back to the server endpoint on RLS / permission errors. */
  async sendMessageToDB(
    convId: string,
    msg: ChatMessage,
    participantIds: string[],
    isRequest = false,
    requestedBy: string | null = null,
  ): Promise<ChatMessage> {
    const id  = msg.id  || `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const now = msg.createdAt || new Date().toISOString();

    // Use upsert with ignoreDuplicates to handle retries/double-clicks/reconnects
    const { error } = await supabase.from('messages').upsert({
      id,
      conversation_id: convId,
      sender_id:       msg.senderId,
      sender_name:     msg.senderName   || null,
      sender_avatar:   msg.senderAvatar || null,
      content:         msg.content      || null,
      type:            msg.type         || 'text',
      metadata: {
        senderName:    msg.senderName    || null,
        senderAvatar:  msg.senderAvatar  || null,
        sharedPost:    (msg as any).sharedPost ? normalizePostMedia((msg as any).sharedPost) : null,
        mediaUrl:      (msg as any).mediaUrl      || null,
        mediaType:     (msg as any).mediaType     || null,
        rentalRequest: (msg as any).rentalRequest || null,
        paymentRequest:(msg as any).paymentRequest|| null,
        read: false,
      },
      reply_to:    msg.replyTo || null,
      created_at:  now,
      updated_at:  now,
      is_deleted:   false,
      is_pinned:    false,
    }, { onConflict: 'id', ignoreDuplicates: true });

    if (error) {
      console.error('[msg] insert failed:', error.code, error.message);
      throw new Error(error.message);
    }

    // Update conversation timestamp (non-blocking)
    supabase.from('conversations')
      .update({ updated_at: now })
      .eq('id', convId)
      .then(() => {}).catch(() => {});

    // Notify the recipient — skip system messages (senderId='system' or type='system')
    const recipientId = participantIds.find(pid => pid !== msg.senderId);
    if (recipientId && msg.senderId && msg.senderId !== 'system' && (msg as any).type !== 'system') {
      notifs.push(recipientId, {
        type:           'message_received',
        fromUserId:     msg.senderId,
        fromUserName:   msg.senderName   || 'Someone',
        fromUserAvatar: msg.senderAvatar || undefined,
        conversationId: convId,
        commentContent: (msg.content || '').slice(0, 100) || undefined,
      } as any);
    }

    return { ...msg, id, createdAt: now } as ChatMessage;
  },

  /** DB-only inbox — routes through the server edge function (service-role key,
   *  bypasses RLS entirely). Never uses supabase.from() directly. */
  async fetchConversationsDB(userId: string, force = false): Promise<Conversation[]> {
    const now = Date.now();
    const inf = chatApi as any;
    if (inf._convFetchInFlight) return chatApi.getUserConversations(userId);
    // Only throttle background polls (not force/user-initiated loads)
    if (!force && now - (inf._convFetchLastAt || 0) < 10_000) return chatApi.getUserConversations(userId);
    inf._convFetchInFlight = true;
    inf._convFetchLastAt   = now;
    try {
      // 1. Fetch conversations list — two parallel queries:
      //    a) participants array column (fast, covers most cases)
      //    b) conversation_participants join table (catches convs where array column is stale)
      const convSelect = 'id, participants, updated_at, created_at, is_request, requested_by, deleted_for_everyone';
      const [{ data: convRows, error: convErr }, { data: cpRows }] = await Promise.all([
        supabase.from('conversations')
          .select(convSelect)
          .contains('participants', [userId])
          .order('updated_at', { ascending: false })
          .limit(50),
        supabase.from('conversation_participants')
          .select('conversation_id')
          .eq('user_id', userId)
          .limit(50),
      ]);

      if (convErr) {
        console.warn('fetchConversationsDB error:', convErr.message);
        inf._convFetchInFlight = false;
        return chatApi.getUserConversations(userId);
      }

      // Merge: add any conv IDs from conversation_participants not already in convRows
      let allConvRows = (convRows || []) as any[];
      const alreadyIn = new Set(allConvRows.map((r: any) => String(r.id)));
      const extraIds  = (cpRows || [])
        .map((r: any) => String(r.conversation_id))
        .filter((id: string) => !alreadyIn.has(id));
      if (extraIds.length) {
        const { data: extraRows } = await supabase
          .from('conversations')
          .select(convSelect)
          .in('id', extraIds);
        if (extraRows) allConvRows = [...allConvRows, ...extraRows];
      }

      const activeRows = allConvRows.filter((r: any) => !r.deleted_for_everyone);
      // Even if empty, we still return the DB result (not localStorage) so we don't restore deleted convs

      if (!activeRows.length) {
        inf._convFetchInFlight = false;
        return [];
      }
      const convIds = activeRows.map((r: any) => r.id);

      // 2. ONE query for ALL messages across ALL conversations (no N+1)
      let allMsgs: any[] | null = null;
      try {
        const { data } = await supabase
          .from('messages')
          .select('id, conversation_id, sender_id, sender_name, sender_avatar, type, content, metadata, created_at, reply_to, forwarded_from, is_pinned, deleted_for, is_deleted')
          .in('conversation_id', convIds)
          .order('created_at', { ascending: true });
        allMsgs = data;
      } catch { allMsgs = null; }

      // Group messages by conversation
      const msgsByConv = new Map<string, ChatMessage[]>();
      (allMsgs || []).forEach((m: any) => {
        const msgs = msgsByConv.get(m.conversation_id) || [];
        msgs.push({
          id: m.id, senderId: m.sender_id, senderName: m.sender_name || '',
          senderAvatar: m.sender_avatar || undefined, type: m.type || 'text',
          content: m.content || '',
          rentalRequest:  m.metadata?.rentalRequest  ? { status: 'pending', ...m.metadata.rentalRequest }  : undefined,
          paymentRequest: m.metadata?.paymentRequest ? { status: 'pending', ...m.metadata.paymentRequest } : undefined,
          sharedPost:     m.metadata?.sharedPost ? normalizePostMedia(m.metadata.sharedPost) : undefined,
          mediaUrl:       m.metadata?.mediaUrl    || undefined,
          mediaType:      m.metadata?.mediaType   || undefined,
          replyTo:        m.reply_to              || undefined,
          createdAt:      m.created_at, read: m.is_read ?? false,
        });
        msgsByConv.set(m.conversation_id, msgs);
      });

      // Populate users cache from message sender data (no extra query needed)
      const cache: Record<string, any> = (() => { try { return JSON.parse(localStorage.getItem('filmons_users_cache') || '{}'); } catch { return {}; } })();
      let cacheUpdated = false;
      (allMsgs || []).forEach((m: any) => {
        if (m.sender_id && m.sender_name && !cache[m.sender_id]) {
          cache[m.sender_id] = { id: m.sender_id, name: m.sender_name, avatar: m.sender_avatar || undefined };
          cacheUpdated = true;
        }
      });

      const result: Conversation[] = activeRows.map((row: any) => {
        const participants: string[] = Array.isArray(row.participants) ? row.participants
          : typeof row.participants === 'string'
            ? (row.participants.startsWith('{')
              ? row.participants.slice(1,-1).split(',').map((s: string) => s.trim().replace(/^"|"$/g,''))
              : (() => { try { return JSON.parse(row.participants); } catch { return []; } })())
            : [];
        // Infer requestedBy from first message sender — more reliable than DB field
        // which may have been stored as the alphabetically-sorted p1 by the RPC.
        const msgs = msgsByConv.get(row.id) || [];
        let requestedBy: string | null = row.requested_by || null;
        if (row.is_request && msgs.length > 0) {
          requestedBy = msgs[0].senderId;
        }
        const unreadCount = msgs.filter(m => m.senderId !== userId && !m.read).length;
        return {
          id: row.id, participantIds: participants,
          messages: msgs,
          updatedAt: row.updated_at || row.created_at,
          unreadCount, isRequest: row.is_request || false,
          requestedBy, isBlocked: false,
        } as Conversation;
      });

      // Silently correct any wrong requested_by values in the DB
      result.forEach((conv, i) => {
        const row = activeRows[i];
        if (row.is_request && conv.requestedBy && conv.requestedBy !== row.requested_by) {
          void supabase.from('conversations')
            .update({ requested_by: conv.requestedBy })
            .eq('id', row.id);
        }
      });

      // Deduplicate: if two conversations have the same participant pair, keep the accepted one
      // (or most-recent if both are requests). This prevents "duplicated user" in inbox.
      const deduped: Conversation[] = [];
      const seenPairs = new Set<string>();
      for (const conv of result) {
        const key = [...conv.participantIds].sort().join('|');
        if (!seenPairs.has(key)) { seenPairs.add(key); deduped.push(conv); }
        // If we already have one: replace if this one is accepted and the stored one is still a request
        else {
          const idx = deduped.findIndex(c => [...c.participantIds].sort().join('|') === key);
          if (idx !== -1 && !conv.isRequest && deduped[idx].isRequest) deduped[idx] = conv;
        }
      }

      // Always refresh participant profiles — not just missing — so stale "Unknown" names are corrected
      const allOtherIds = [...new Set(deduped.flatMap(c => c.participantIds))].filter(id => id !== userId);
      if (allOtherIds.length) {
        try {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, name, username, avatar_url, account_type')
            .in('id', allOtherIds);
          if (profiles) {
            profiles.forEach((p: any) => {
              cache[p.id] = { id: p.id, name: p.name || p.username || 'User', username: p.username, avatar: p.avatar_url, accountType: p.account_type };
            });
            cacheUpdated = true;
          }
        } catch {}
      }
      if (cacheUpdated) localStorage.setItem('filmons_users_cache', JSON.stringify(cache));

      // 4. Merge: server is authoritative. Only preserve optimistic (unsent) messages
      //    from localStorage — never include stale local-only conversations.
      const local = loadConvs();
      const localMap = new Map(local.map(c => [c.id, c]));
      const mergedMap = new Map<string, Conversation>();
      deduped.forEach(serverConv => {
        const existing = localMap.get(serverConv.id);
        if (!existing) { mergedMap.set(serverConv.id, serverConv); return; }

        // Preserve read status from localStorage — DB is_read may be null/stale
        const localReadIds = new Set(
          existing.messages.filter(m => m.read).map(m => m.id)
        );
        const serverIds = new Set(serverConv.messages.map(m => m.id));
        // Only keep local-only messages that look like optimistic/temp (not yet on server)
        const localOnly = existing.messages.filter(m =>
          !serverIds.has(m.id) && (m.id.startsWith('opt-') || /^\d{13}-/.test(m.id))
        );
        const mergedMsgs = [...serverConv.messages, ...localOnly]
          .map(m => ({ ...m, read: m.read || localReadIds.has(m.id) }))
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        // Recompute unread from merged messages so the badge reflects reality
        const unreadCount = mergedMsgs.filter(m => m.senderId !== userId && !m.read).length;
        mergedMap.set(serverConv.id, { ...existing, ...serverConv, messages: mergedMsgs, unreadCount });
      });
      const merged = [...mergedMap.values()];
      saveConvs(merged);
      return merged;
    } finally {
      inf._convFetchInFlight = false;
    }
  },

  /** Remove a conversation for a user from localStorage cache AND the DB.
   *  Records the deleted pair so the next message creates a fresh conversation
   *  with a system notice inside it. */
  async deleteForUser(convId: string, userId: string): Promise<void> {
    const conv = loadConvs().find(c => c.id === convId);
    if (conv) recordDeletedConv(conv.participantIds, userId);
    saveConvs(loadConvs().filter(c => c.id !== convId));
    await fetch(`${BASE}/conversations/${convId}`, {
      method: 'DELETE', headers: H(),
      body: JSON.stringify({ userId }),
    }).catch(e => console.warn('deleteForUser error:', e));
  },

  /** Get total unread count — uses local cache first, hits server at most once per 60s. */
  _unreadLastAt: 0 as number,
  async getServerUnreadCount(userId: string): Promise<number> {
    // Rate-limit to once per 60s — local count is good enough in between
    const now = Date.now();
    if (now - (chatApi as any)._unreadLastAt < 60_000) {
      return chatApi.getUnreadCount(userId);
    }
    (chatApi as any)._unreadLastAt = now;
    try {
      const { conversations } = await call<any>(`/conversations?userId=${encodeURIComponent(userId)}`);
      if (Array.isArray(conversations)) {
        return conversations.reduce((sum: number, c: any) => sum + (c.unreadCount || 0), 0);
      }
    } catch {}
    return chatApi.getUnreadCount(userId);
  },

  // ── Convenience: update rentalRequest.status on a message ──────────────
  updateRentalRequestStatus(
    conversationId: string,
    messageId: string,
    status: 'accepted' | 'declined',
  ): void {
    // 1. Update localStorage
    const convs = loadConvs();
    const idx = convs.findIndex(c => c.id === conversationId);
    if (idx !== -1) {
      convs[idx].messages = convs[idx].messages.map(m =>
        m.id === messageId && m.rentalRequest
          ? { ...m, rentalRequest: { ...m.rentalRequest, status } }
          : m
      );
      convs[idx].updatedAt = new Date().toISOString();
      saveConvs(convs);
    }

    // 2. Persist to Supabase so the SENDER sees the updated status via Realtime
    supabase
      .from('messages')
      .select('metadata')
      .eq('id', messageId)
      .single()
      .then(({ data }) => {
        const currentMeta = (typeof data?.metadata === 'string'
          ? (() => { try { return JSON.parse(data.metadata); } catch { return {}; } })()
          : data?.metadata) || {};
        const updatedMeta = {
          ...currentMeta,
          rentalRequest: { ...(currentMeta.rentalRequest || {}), status },
        };
        return supabase.from('messages').update({ metadata: updatedMeta }).eq('id', messageId);
      })
      .catch(e => console.warn('[chatApi] updateRentalRequestStatus DB update failed:', e));
  },

  /** Block a user from a conversation and remove it from local view */
  blockUser(conversationId: string, blockedUserId: string): void {
    // Remove from local conversations
    const convs = loadConvs().filter(c => c.id !== conversationId);
    saveConvs(convs);
    // Persist to server
    fetch(`${BASE}/conversations/${conversationId}/block`, {
      method: 'PUT', headers: H(),
      body: JSON.stringify({ blockedUserId }),
    }).catch(e => console.warn('Block user server error:', e));
  },

  // ── Message-level operations ────────────────────────────────────────────
  /** Edit a sent message (own messages only). */
  async editMessage(convId: string, msgId: string, content: string): Promise<void> {
    // Optimistic local update
    const convs = loadConvs();
    const idx = convs.findIndex(c => c.id === convId);
    if (idx !== -1) {
      convs[idx].messages = convs[idx].messages.map(m =>
        m.id === msgId ? { ...m, content, editedAt: new Date().toISOString() } : m
      );
      saveConvs(convs);
    }
    await fetch(`${BASE}/conversations/${convId}/messages/${msgId}`, {
      method: 'PUT', headers: H(),
      body: JSON.stringify({ content }),
    });
  },

  /** Pin or unpin a message. */
  async pinMessage(convId: string, msgId: string, isPinned: boolean): Promise<void> {
    const convs = loadConvs();
    const idx = convs.findIndex(c => c.id === convId);
    if (idx !== -1) {
      convs[idx].messages = convs[idx].messages.map(m =>
        m.id === msgId ? { ...m, isPinned } : m
      );
      saveConvs(convs);
    }
    await fetch(`${BASE}/conversations/${convId}/messages/${msgId}/pin`, {
      method: 'PUT', headers: H(),
      body: JSON.stringify({ isPinned }),
    });
  },

  /** Delete a message only for the current user. */
  async deleteMessageForMe(convId: string, msgId: string, userId: string): Promise<void> {
    const convs = loadConvs();
    const idx = convs.findIndex(c => c.id === convId);
    if (idx !== -1) {
      convs[idx].messages = convs[idx].messages.filter(m => m.id !== msgId);
      saveConvs(convs);
    }
    await fetch(`${BASE}/conversations/${convId}/messages/${msgId}/me`, {
      method: 'DELETE', headers: H(),
      body: JSON.stringify({ userId }),
    });
  },

  /** Delete a message for everyone. */
  async deleteMessageForAll(convId: string, msgId: string): Promise<void> {
    // Remove from localStorage
    const convs = loadConvs();
    const idx = convs.findIndex(c => c.id === convId);
    if (idx !== -1) {
      convs[idx].messages = convs[idx].messages.filter(m => m.id !== msgId);
      saveConvs(convs);
    }
    // Delete from Supabase (hard delete so it's truly gone)
    await supabase.from('messages').delete().eq('id', msgId);
  },

  /** Search messages within a conversation via full-text search. */
  async searchMessages(convId: string, query: string): Promise<ChatMessage[]> {
    try {
      const { messages } = await call<any>(
        `/conversations/${convId}/search?q=${encodeURIComponent(query)}`
      );
      return messages || [];
    } catch { return []; }
  },

  /** Fetch read receipts for a set of message IDs. */
  async getMessageStatuses(
    convId: string, msgIds: string[],
  ): Promise<Array<{ messageId: string; userId: string; status: string }>> {
    if (!msgIds.length) return [];
    try {
      const { statuses } = await call<any>(
        `/conversations/${convId}/statuses?msgIds=${msgIds.join(',')}`
      );
      return statuses || [];
    } catch { return []; }
  },

  /** Save a draft for a conversation (fire-and-forget). */
  saveDraft(convId: string, userId: string, content: string): void {
    fetch(`${BASE}/conversations/${convId}/draft`, {
      method: 'PUT', headers: H(),
      body: JSON.stringify({ userId, content }),
    }).catch(() => {});
  },

  /** Fetch the saved draft for a conversation. */
  async getDraft(convId: string, userId: string): Promise<string> {
    try {
      const { content } = await call<any>(`/conversations/${convId}/draft/${userId}`);
      return content ?? '';
    } catch { return ''; }
  },

  /** Fetch pinned messages for a conversation. */
  async getPinnedMessages(convId: string): Promise<ChatMessage[]> {
    try {
      const { messages } = await call<any>(`/conversations/${convId}/pinned`);
      return messages || [];
    } catch { return []; }
  },

  // ── Conversation-level management ───────────────────────────────────────────
  /** Archive / unarchive a conversation for the current user. */
  archiveConversation(convId: string, userId: string, archived: boolean): void {
    fetch(`${BASE}/conversations/${convId}/archive`, {
      method: 'PUT', headers: H(),
      body: JSON.stringify({ userId, archived }),
    }).catch(e => console.warn('archiveConversation error:', e));
  },

  /** Mute / unmute a conversation (suppresses notification badge). */
  muteConversation(convId: string, userId: string, muted: boolean): void {
    fetch(`${BASE}/conversations/${convId}/mute`, {
      method: 'PUT', headers: H(),
      body: JSON.stringify({ userId, muted }),
    }).catch(e => console.warn('muteConversation error:', e));
  },

  /** Pin / unpin a conversation at the top of the sidebar. */
  pinConversation(convId: string, userId: string, pinned: boolean): void {
    fetch(`${BASE}/conversations/${convId}/pin-conv`, {
      method: 'PUT', headers: H(),
      body: JSON.stringify({ userId, pinned }),
    }).catch(e => console.warn('pinConversation error:', e));
  },

  /** Hard-delete a conversation for EVERYONE: wipes all messages + the conversation row. */
  deleteConversationForEveryone(convId: string, userId: string): Promise<void> {
    const conv = loadConvs().find(c => c.id === convId);
    if (conv) recordDeletedConv(conv.participantIds, userId);
    saveConvs(loadConvs().filter(c => c.id !== convId));
    // Pass userId as query param — DELETE bodies are unreliable in some environments
    return fetch(`${BASE}/conversations/${convId}/for-everyone?userId=${encodeURIComponent(userId)}`, {
      method: 'DELETE', headers: H(),
    }).then(async res => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Delete failed (${res.status})`);
      }
    });
  },

  /** Fetch archived conversations for the current user. */
  async fetchArchivedConversations(userId: string): Promise<Conversation[]> {
    try {
      const { conversations } = await call<any>(`/conversations/archived/${encodeURIComponent(userId)}`);
      return Array.isArray(conversations) ? conversations : [];
    } catch (e) {
      console.warn('fetchArchivedConversations error:', e);
      return [];
    }
  },

  /** Unarchive a conversation (moves it back to the main inbox). */
  unarchiveConversation(convId: string, userId: string): void {
    fetch(`${BASE}/conversations/${convId}/archive`, {
      method: 'PUT', headers: H(),
      body: JSON.stringify({ userId, archived: false }),
    }).catch(e => console.warn('unarchiveConversation error:', e));
  },
};
export const reelsApi = {

  async create(params: {
    userId: string;
    videoUrl: string;
    coverUrl?: string;
    caption?: string;
    duration?: number;
    audioTrackId?: string;
    originalAudioUrl?: string;
    textOverlays?: any[];
    effects?: any[];
    tags?: string[];
    mentions?: string[];
    location?: string;
    visibility?: 'public'|'followers'|'private';
    allowComments?: boolean;
    allowSharing?: boolean;
    allowRemix?: boolean;
  }) {
    const { data, error } = await supabase.from('reels').insert({
      user_id:            params.userId,
      video_url:          params.videoUrl,
      cover_url:          params.coverUrl      || null,
      caption:            params.caption       || null,
      duration:           params.duration      || null,
      audio_track_id:     params.audioTrackId  || null,
      original_audio_url: params.originalAudioUrl || null,
      text_overlays:      params.textOverlays  || [],
      effects:            params.effects       || [],
      tags:               params.tags          || [],
      mentions:           params.mentions      || [],
      location:           params.location      || null,
      visibility:         params.visibility    || 'public',
      allow_comments:     params.allowComments !== false,
      allow_sharing:      params.allowSharing  !== false,
      allow_remix:        params.allowRemix    !== false,
    }).select().single();
    if (error) throw new Error(error.message);
    return data;
  },

  async getFeed(limit = 20, offset = 0) {
    const { data, error } = await supabase
      .from('reels')
      .select('*, profiles:user_id(id,name,username,avatar_url,account_type)')
      .eq('visibility', 'public')
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(error.message);
    return data || [];
  },

  async like(reelId: string, userId: string) {
    await supabase.rpc('toggle_reel_like', { p_reel_id: reelId, p_user_id: userId });
  },
};