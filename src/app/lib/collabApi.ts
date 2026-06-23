/**
 * Filmons — Collaboration API
 * src/app/lib/collabApi.ts
 */
import { supabase } from '../../lib/supabase';
import { searchProfiles, type ProfileResult } from './mentionsApi';

export interface CollabInvite {
  id:            string;
  post_id:       string;
  inviter_id:    string;
  inviter_name:  string;
  inviter_avatar?: string;
  post_caption?: string;
  created_at:    string;
}

/** Send a collaboration invite */
export async function inviteCollaborator(postId: string, inviterId: string, inviteeId: string): Promise<void> {
  const { error } = await supabase.from('post_collaborators').insert({
    post_id:    postId,
    inviter_id: inviterId,
    invitee_id: inviteeId,
    status:     'pending',
  });
  if (error) throw error;
}

/** Accept a collaboration invite */
export async function acceptCollaboration(collabId: string): Promise<void> {
  const { error } = await supabase.rpc('accept_collaboration', { p_collab_id: collabId });
  if (error) throw error;
}

/** Decline a collaboration invite */
export async function declineCollaboration(collabId: string): Promise<void> {
  const { error } = await supabase.rpc('decline_collaboration', { p_collab_id: collabId });
  if (error) throw error;
}

/** Get pending collaboration invites for a user */
export async function getPendingCollabs(userId: string): Promise<CollabInvite[]> {
  const { data, error } = await supabase.rpc('get_pending_collabs', { p_user_id: userId });
  if (error) { console.error(error); return []; }
  return data ?? [];
}

/** Get collaborators for a post */
export async function getPostCollaborators(postId: string): Promise<ProfileResult[]> {
  const { data } = await supabase
    .from('post_collaborators')
    .select('invitee_id, profiles!invitee_id(id, name, username, avatar_url, account_type)')
    .eq('post_id', postId)
    .eq('status', 'accepted');
  return (data ?? []).map((r: any) => r.profiles).filter(Boolean) as ProfileResult[];
}

/** Re-export searchProfiles for CollaboSearch */
export { searchProfiles };