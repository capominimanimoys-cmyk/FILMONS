import { supabase } from '../../lib/supabase';
import { Post, Comment } from '../types/feed';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Pull the current user's id from the localStorage session (custom auth). */
function getCurrentUserId(): string {
  try {
    const raw = localStorage.getItem('filmons_current_user');
    if (!raw) throw new Error('Not authenticated');
    const user = JSON.parse(raw);
    if (!user?.id) throw new Error('Not authenticated');
    return user.id as string;
  } catch {
    throw new Error('Not authenticated');
  }
}

// ── CREATE POST ───────────────────────────────────────────────────────────────

export const createPost = async (
  content: string,
  media: any[] = [],
  postType: string = 'text',
  metadata: Record<string, any> = {}
) => {
  const authorId = getCurrentUserId();

  const { data, error } = await supabase
    .from('posts')
    .insert({
      author_id: authorId,
      content,
      media,
      post_type: postType,
      metadata,
    })
    .select(`
      *,
      profiles:author_id (
        name,
        username,
        avatar,
        is_verified
      )
    `)
    .single();

  if (error) throw error;
  return data as Post;
};

// ── GET FEED (updated to work without view) ───────────────────────────────────

export const getFeed = async (limit: number = 20, offset: number = 0) => {
  const { data, error } = await supabase
    .from('posts')
    .select(`
      *,
      profiles:author_id (
        name,
        username,
        avatar,
        is_verified
      )
    `)
    .eq('visibility', 'public')
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  // Flatten the author data
  return data.map(post => ({
    ...post,
    author_name: post.profiles?.name,
    author_username: post.profiles?.username,
    author_avatar: post.profiles?.avatar,
    author_verified: post.profiles?.is_verified,
  })) as Post[];
};

// ── LIKE POST ─────────────────────────────────────────────────────────────────

export const likePost = async (postId: string) => {
  const userId = getCurrentUserId();

  const { error } = await supabase
    .from('post_likes')
    .insert({ post_id: postId, user_id: userId });

  if (error) throw error;
};

// ── UNLIKE POST ───────────────────────────────────────────────────────────────

export const unlikePost = async (postId: string) => {
  const userId = getCurrentUserId();

  const { error } = await supabase
    .from('post_likes')
    .delete()
    .match({ post_id: postId, user_id: userId });

  if (error) throw error;
};

// ── CREATE COMMENT ────────────────────────────────────────────────────────────

export const createComment = async (
  postId: string,
  content: string,
  parentCommentId?: string
) => {
  const authorId = getCurrentUserId();

  const { data, error } = await supabase
    .from('comments')
    .insert({
      post_id: postId,
      author_id: authorId,
      content,
      parent_comment_id: parentCommentId,
      thread_level: parentCommentId ? 1 : 0,
    })
    .select(`
      *,
      profiles:author_id (name, avatar)
    `)
    .single();

  if (error) throw error;
  return data as Comment;
};

// ── GET POST COMMENTS ─────────────────────────────────────────────────────────

export const getPostComments = async (postId: string) => {
  const { data, error } = await supabase
    .from('comments')
    .select(`
      *,
      profiles:author_id (name, avatar)
    `)
    .eq('post_id', postId)
    .is('parent_comment_id', null)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data as Comment[];
};
