/**
 * settingsApi — saves/loads all user settings to/from Supabase.
 *
 * Strategy:
 *  - Write: PATCH via Supabase REST (anon key works with RLS off)
 *  - Read:  SELECT via Supabase client on page mount
 *  - LocalStorage mirror: instant reads without waiting for DB
 */
import { supabase } from '../../lib/supabase';
import { projectId, publicAnonKey } from '/utils/supabase/info';

type Table =
  | 'notification_settings'
  | 'privacy_settings'
  | 'message_settings'
  | 'security_settings'
  | 'reputation_settings'
  | 'user_preferences';

// ── Low-level upsert ─────────────────────────────────────────────────────────
async function upsert(table: Table, userId: string, data: Record<string, any>) {
  if (!userId) { console.warn('[settingsApi] No userId — skipping save'); return; }

  const payload = { ...data, user_id: userId, updated_at: new Date().toISOString() };

  // Mirror to localStorage immediately (instant reads, works offline)
  try {
    const existing = JSON.parse(localStorage.getItem(`filmons_${table}`) || '{}');
    localStorage.setItem(`filmons_${table}`, JSON.stringify({ ...existing, ...data }));
  } catch {}

  // Write to Supabase using client upsert (handles insert + update in one call)
  const { error } = await supabase
    .from(table)
    .upsert(payload, { onConflict: 'user_id' });

  if (error) {
    console.warn(`[settingsApi] upsert failed for ${table}:`, error.message);

    // Fallback: try REST PATCH directly
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/rest/v1/${table}?user_id=eq.${userId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type':  'application/json',
            'apikey':        publicAnonKey,
            'Authorization': `Bearer ${publicAnonKey}`,
            'Prefer':        'return=minimal,resolution=merge-duplicates',
          },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const errText = await res.text();
        // If PATCH matched 0 rows, try POST
        await fetch(`https://${projectId}.supabase.co/rest/v1/${table}`, {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'apikey':        publicAnonKey,
            'Authorization': `Bearer ${publicAnonKey}`,
            'Prefer':        'return=minimal,resolution=merge-duplicates',
          },
          body: JSON.stringify(payload),
        });
      }
    } catch (e) {
      console.warn(`[settingsApi] REST fallback also failed:`, e);
    }
  }
}

// ── Low-level load ────────────────────────────────────────────────────────────
async function load<T extends Record<string, any>>(
  table: Table,
  userId: string,
  defaults: T
): Promise<T> {
  // 1. Return from localStorage immediately (zero latency)
  try {
    const cached = localStorage.getItem(`filmons_${table}`);
    if (cached) return { ...defaults, ...JSON.parse(cached) } as T;
  } catch {}

  // 2. Fetch from DB
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (!error && data) {
    try { localStorage.setItem(`filmons_${table}`, JSON.stringify(data)); } catch {}
    return { ...defaults, ...data } as T;
  }
  return defaults;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

export const notificationSettingsApi = {
  load: (userId: string) => load('notification_settings', userId, {
    notif_dms: true, email_messages: true, sms_messages: false,
    notif_msg_requests: true, notif_collab_reqs: true,
    notif_mentions: true, notif_replies: true, notif_reactions: false,
    notif_new_followers: true, notif_comments: true, notif_shares: false, notif_saves: false,
    notif_booking_reqs: true, notif_casting_calls: true, notif_project_invites: true, notif_file_requests: false,
    notif_new_orders: true, notif_payments: true, notif_rental_reqs: true,
    notif_portfolio_views: true, notif_project_saves: true, notif_contact_requests: true,
    notif_reel_trending: true, notif_milestones: true, notif_opportunities: true,
    email_collab: true, email_analytics: true, email_portfolio: false,
    email_security: true, email_product: false, email_tips: false, email_frequency: 'Daily',
    notif_sound: 'Default', notif_vibration: true, notif_desktop: true,
    quiet_hours_enabled: false, quiet_start: '11:00 PM', quiet_end: '8:00 AM',
    notif_preview: 'Full Content',
  }),
  save: (userId: string, data: Record<string, any>) => upsert('notification_settings', userId, data),
};

export const privacySettingsApi = {
  load: (userId: string) => load('privacy_settings', userId, {
    account_visibility: 'Public', active_status: true, last_seen: 'Followers',
    portfolio_visibility: 'Public', who_can_message: 'Everyone',
    allow_msg_requests: true, allow_collab_invites: true,
    show_likes: true, show_following: true, show_followers: true,
    show_saved: false, show_reviews: true, show_rentals: true,
    watermark_uploads: false, disable_downloads: false,
    appear_in_search: true, show_in_recs: true, google_indexing: true,
    who_can_comment: 'Everyone', open_to_collab: true,
    show_availability: true, show_pricing: true,
  }),
  save: (userId: string, data: Record<string, any>) => upsert('privacy_settings', userId, data),
};

export const messageSettingsApi = {
  load: (userId: string) => load('message_settings', userId, {
    who_can_msg: 'Everyone', allow_requests: true, allow_collab: true, allow_client: true,
    read_receipts: true, typing_indicator: true, active_status: 'Followers', last_seen: 'Followers',
    allow_media: true, allow_files: true, hd_upload: false, auto_download: 'Wi-Fi Only',
    spam_filter: true, offensive_filter: true, link_protection: true,
    msg_notifs: true, collab_notifs: true, notif_preview: 'Full Preview', quiet_hours: false,
    font_size: 'Medium', allow_voice: true, allow_video: 'Followers', auto_reply: '',
  }),
  save: (userId: string, data: Record<string, any>) => upsert('message_settings', userId, data),
};

export const securitySettingsApi = {
  load: (userId: string) => load('security_settings', userId, {
    two_fa_enabled: false, two_fa_method: 'sms',
    alert_suspicious: true, alert_new_device: true, alert_password_change: true,
  }),
  save: (userId: string, data: Record<string, any>) => upsert('security_settings', userId, data),
};

export const reputationSettingsApi = {
  load: (userId: string) => load('reputation_settings', userId, {
    review_visibility: 'Public', show_star_ratings: true, show_written_reviews: true,
    show_reliability: true, show_collab_history: true,
    verified_only: true, allow_anonymous: false, allow_public_response: true,
    show_identity_badge: true, show_professional_badge: true,
    show_business_badge: false, show_rental_badge: true,
  }),
  save: (userId: string, data: Record<string, any>) => upsert('reputation_settings', userId, data),
};

export const themeSettingsApi = {
  save: (userId: string, theme: string, language: string) =>
    upsert('user_preferences', userId, { theme, language }),
};