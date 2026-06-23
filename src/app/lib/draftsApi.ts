/**
 * Filmons — Post Drafts API
 * src/app/lib/draftsApi.ts
 */
import { supabase } from '../../lib/supabase';

export interface PostDraft {
  id:              string;
  user_id:         string;
  kind:            string;
  photos:          string[];
  video_url?:      string;
  audio_url?:      string;
  text_content?:   string;
  ratio:           string;
  text_bg:         string;
  text_font:       string;
  text_align:      string;
  filter_idx:      number;
  filter_intensity:number;
  adjustments:     Record<string,number>;
  caption?:        string;
  tags:            string[];
  mentions:        string[];
  location?:       string;
  credits:         { role:string; name:string }[];
  roles:           string[];
  project_type?:   string;
  audio_title?:    string;
  audio_artist?:   string;
  audio_genre?:    string;
  visibility:      string;
  allow_comments:  boolean;
  allow_sharing:   boolean;
  allow_remix:     boolean;
  allow_download:  boolean;
  monetize:        boolean;
  scheduled_at?:   string;
  thumbnail_url?:  string;
  title?:          string;
  step:            string;
  created_at:      string;
  updated_at:      string;
}

// ── Fetch all drafts for current user ────────────────────────────────────────
export async function getDrafts(): Promise<PostDraft[]> {
  const { data, error } = await supabase
    .from('post_drafts')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ── Save or update a draft ────────────────────────────────────────────────────
export async function saveDraft(
  userId: string,
  draft: Partial<Omit<PostDraft, 'id'|'user_id'|'created_at'|'updated_at'>>,
  draftId?: string
): Promise<PostDraft> {
  const payload = { ...draft, user_id: userId };

  if (draftId) {
    const { data, error } = await supabase
      .from('post_drafts')
      .update(payload)
      .eq('id', draftId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('post_drafts')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Delete a draft ────────────────────────────────────────────────────────────
export async function deleteDraft(draftId: string): Promise<void> {
  const { error } = await supabase
    .from('post_drafts')
    .delete()
    .eq('id', draftId);
  if (error) throw error;
}

// ── Build a thumbnail URL from draft content (first photo or placeholder) ────
export function draftThumbnail(draft: PostDraft): string | null {
  if (draft.thumbnail_url) return draft.thumbnail_url;
  if (draft.photos?.length) return draft.photos[0];
  return null;
}

// ── Humanised time (e.g. "2h ago", "3d ago") ─────────────────────────────────
export function draftAge(draft: PostDraft): string {
  const diff = Date.now() - new Date(draft.updated_at).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)   return `${d}d ago`;
  return new Date(draft.updated_at).toLocaleDateString('en-CA', { month:'short', day:'numeric' });
}