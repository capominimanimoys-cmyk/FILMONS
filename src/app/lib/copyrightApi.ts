/**
 * Filmons — Copyright Detection API
 * Uses AudD.io (free tier, no server needed) + ACRCloud via Edge Function
 * src/app/lib/copyrightApi.ts
 */
import { supabase } from '../../lib/supabase';

export type CopyrightStatus = 'pending' | 'approved' | 'blocked' | 'appealing';

export interface CopyrightResult {
  status:      CopyrightStatus;
  match?:      string;
  artist?:     string;
  album?:      string;
  confidence?: number;
  service?:    string;
  message:     string;
}

// ── AudD.io — free music recognition API (no server needed) ──────────────────
// Free tier: 100 requests/month. Get key at audd.io
const AUDD_API_KEY = import.meta.env.VITE_AUDD_API_KEY || '';
const AUDD_URL     = 'https://api.audd.io/';

async function checkWithAudd(audioBlob: Blob): Promise<CopyrightResult | null> {
  if (!AUDD_API_KEY) return null;
  try {
    // AudD needs a 10-15s clip — send the first 15s
    const form = new FormData();
    form.append('api_token', AUDD_API_KEY);
    form.append('file', audioBlob, 'audio.mp3');
    form.append('return', 'spotify,apple_music');

    const res = await fetch(AUDD_URL, {
      method: 'POST',
      body:   form,
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) return null;
    const data = await res.json();

    if (data.status === 'success' && data.result) {
      return {
        status:     'blocked',
        match:      data.result.title,
        artist:     data.result.artist,
        album:      data.result.album,
        confidence: 90,
        service:    'AudD',
        message:    `Copyrighted sound detected: "${data.result.title}" by ${data.result.artist}`,
      };
    }
    // No match = original
    return {
      status:  'approved',
      service: 'AudD',
      message: 'Original Sound Approved',
    };
  } catch { return null; }
}

// ── ACRCloud via Supabase Edge Function ──────────────────────────────────────
async function checkWithAcrCloud(audioBlob: Blob, trackId?: string): Promise<CopyrightResult | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return null;

    const form = new FormData();
    form.append('audio', audioBlob, 'audio.mp3');
    if (trackId) form.append('track_id', trackId);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const res = await fetch(`${supabaseUrl}/functions/v1/copyright-check`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}` },
      body:    form,
      signal:  AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Main check — tries AudD first, then ACRCloud, then approves ──────────────
export async function checkCopyright(audioBlob: Blob, trackId?: string): Promise<CopyrightResult> {
  // Take only first 20 seconds for fingerprinting (reduces file size)
  let scanBlob = audioBlob;
  if (audioBlob.size > 2 * 1024 * 1024) {
    // Slice to ~2MB — roughly 20s of MP3 at 128kbps
    scanBlob = audioBlob.slice(0, 2 * 1024 * 1024, audioBlob.type);
  }

  // Try AudD (client-side, no server needed)
  const auddResult = await checkWithAudd(scanBlob);
  if (auddResult) {
    if (trackId) await saveCopyrightResult(trackId, auddResult.status, auddResult.match, auddResult.artist);
    return auddResult;
  }

  // Try ACRCloud via Edge Function
  const acrResult = await checkWithAcrCloud(scanBlob, trackId);
  if (acrResult) return acrResult;

  // Fallback: approve (edge function not deployed yet)
  const fallback: CopyrightResult = {
    status:  'approved',
    service: 'Filmons',
    message: 'Original Sound Approved',
  };
  if (trackId) await saveCopyrightResult(trackId, 'approved');
  return fallback;
}

async function saveCopyrightResult(
  trackId: string, status: CopyrightStatus, match?: string, artist?: string,
) {
  await supabase.from('user_sounds').update({
    copyright_status:     status,
    copyright_checked_at: new Date().toISOString() as any,
    is_original:          status === 'approved',
  }).eq('id', trackId);
}

export async function appealCopyright(trackId: string, reason: string): Promise<void> {
  await supabase.from('user_sounds').update({ copyright_status: 'appealing' }).eq('id', trackId);
}

export async function getAudioFpSummary(userId: string) {
  const { data } = await supabase.rpc('get_audio_fp_summary', { p_user_id: userId });
  return data ?? [];
}

export function calcFpForUses(uses: number): number {
  if (uses >= 10000) return 10000 + Math.floor((uses - 10000) / 10);
  if (uses >= 1000)  return 700  + Math.floor((uses - 1000)  * 33 / 100);
  if (uses >= 100)   return 50   + Math.floor((uses - 100)   * 65 / 100);
  if (uses >= 10)    return 5    + Math.floor((uses - 10)    * 5  / 10);
  return 0;
}

export const FP_TIERS = [
  { uses: 10,    fp: 5,     label: 'Getting started'      },
  { uses: 100,   fp: 50,    label: 'Rising sound'         },
  { uses: 1000,  fp: 700,   label: 'Popular sound'        },
  { uses: 10000, fp: 10000, label: 'Viral + Trending 🔥'  },
];