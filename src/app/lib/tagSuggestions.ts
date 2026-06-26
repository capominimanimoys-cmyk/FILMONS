import { supabase } from '../../lib/supabase';

export type SuggestionType = 'primary_role' | 'secondary_role' | 'tool';

/**
 * Fetch suggestions from the DB sorted by usage.
 * Returns approved suggestions + the current user's own unapproved ones.
 */
export async function fetchTagSuggestions(
  type: SuggestionType,
  userId?: string,
): Promise<string[]> {
  try {
    let query = supabase
      .from('tag_suggestions')
      .select('label')
      .eq('type', type)
      .order('usage_count', { ascending: false })
      .limit(300);

    if (userId) {
      query = (query as any).or(`is_approved.eq.true,created_by.eq.${userId}`);
    } else {
      query = query.eq('is_approved', true);
    }

    const { data } = await query;
    return (data || []).map((r: any) => r.label as string);
  } catch {
    return [];
  }
}

/**
 * Upsert a suggestion.
 * - If it exists: increment usage_count.
 * - If new: insert with is_approved = isApproved (false = needs moderation, creator can still use it).
 * Fails silently — never blocks the user flow.
 */
export async function saveTagSuggestion(
  type: SuggestionType,
  label: string,
  userId?: string,
  isApproved = false,
): Promise<void> {
  const trimmed    = label.trim();
  const normalized = trimmed.toLowerCase();
  if (!normalized) return;

  try {
    const { data: existing } = await supabase
      .from('tag_suggestions')
      .select('id, usage_count')
      .eq('type', type)
      .eq('normalized_label', normalized)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('tag_suggestions')
        .update({ usage_count: existing.usage_count + 1, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      await supabase.from('tag_suggestions').insert({
        type,
        label:            trimmed,
        normalized_label: normalized,
        created_by:       userId || null,
        usage_count:      1,
        is_approved:      isApproved,
        created_at:       new Date().toISOString(),
        updated_at:       new Date().toISOString(),
      });
    }
  } catch {
    // Silent — DB availability doesn't block the onboarding flow
  }
}
