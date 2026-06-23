export interface Post {
  id: string;
  author_id: string;
  content: string;
  media: MediaItem[];
  post_type: 'text' | 'image' | 'video' | 'listing' | 'poll' | 'event';
  metadata: Record<string, any>;
  listing_id?: string;
  shared_post_id?: string;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  views_count: number;
  visibility: 'public' | 'followers' | 'private';
  is_pinned: boolean;
  is_archived: boolean;
  location?: string;
  location_coords?: { lat: number; lng: number };
  created_at: string;
  updated_at: string;
  edited_at?: string;

  // From join/view
  author_name?: string;
  author_username?: string;
  author_avatar?: string;
  author_verified?: boolean;
  is_liked_by_me?: boolean;
  is_saved_by_me?: boolean;
}

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  media: MediaItem[];
  parent_comment_id?: string;
  thread_level: number;
  likes_count: number;
  replies_count: number;
  is_edited: boolean;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  edited_at?: string;

  // From join
  author_name?: string;
  author_avatar?: string;
  is_liked_by_me?: boolean;
  replies?: Comment[];
}

export interface MediaItem {
  type: 'image' | 'video';
  url: string;
  thumbnail?: string;
  width?: number;
  height?: number;
}

export interface Notification {
  id: string;
  user_id: string;
  type: 'like' | 'comment' | 'mention' | 'follow' | 'share';
  actor_id?: string;
  post_id?: string;
  comment_id?: string;
  title: string;
  message?: string;
  action_url?: string;
  is_read: boolean;
  is_archived: boolean;
  created_at: string;

  // From join
  actor_name?: string;
  actor_avatar?: string;
}
