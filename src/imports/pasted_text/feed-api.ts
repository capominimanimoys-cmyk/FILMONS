WHERE: Create new file /src/app/types/feed.ts

WHAT TO DO:

Create the file
Copy this code:
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
RESULT: TypeScript types ready for use

Step 5: Create Feed API Functions
WHERE: Create new file /src/app/lib/feed-api.ts

WHAT TO DO:

Create the file
Start with these core functions:
import { supabase } from '../../lib/supabase';
import { Post, Comment } from '../types/feed';

// CREATE POST
export const createPost = async (
  content: string,
  media: any[] = [],
  postType: string = 'text',
  metadata: Record<string, any> = {}
) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('posts')
    .insert({
      author_id: user.id,
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
  return data;
};

// GET FEED
export const getFeed = async (limit: number = 20, offset: number = 0) => {
  const { data, error } = await supabase
    .from('feed_view')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return data as Post[];
};

// LIKE POST
export const likePost = async (postId: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('post_likes')
    .insert({ post_id: postId, user_id: user.id });

  if (error) throw error;
};

// UNLIKE POST
export const unlikePost = async (postId: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('post_likes')
    .delete()
    .match({ post_id: postId, user_id: user.id });

  if (error) throw error;
};

// CREATE COMMENT
export const createComment = async (
  postId: string,
  content: string,
  parentCommentId?: string
) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('comments')
    .insert({
      post_id: postId,
      author_id: user.id,
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

// GET POST COMMENTS
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
RESULT: Core API functions ready

Step 6: Create Simple Feed Page (MVP)
WHERE: Create new file /src/app/pages/Feed.tsx

WHAT TO DO:

Create the file
Copy this starter code:
import { useState, useEffect } from 'react';
import { getFeed, createPost, likePost, unlikePost } from '../lib/feed-api';
import { Post } from '../types/feed';

export default function Feed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPostContent, setNewPostContent] = useState('');

  useEffect(() => {
    loadFeed();
  }, []);

  const loadFeed = async () => {
    try {
      const data = await getFeed();
      setPosts(data);
    } catch (error) {
      console.error('Error loading feed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePost = async () => {
    if (!newPostContent.trim()) return;
    
    try {
      const newPost = await createPost(newPostContent);
      setPosts([newPost, ...posts]);
      setNewPostContent('');
    } catch (error) {
      console.error('Error creating post:', error);
    }
  };

  const handleLike = async (postId: string, isLiked: boolean) => {
    try {
      if (isLiked) {
        await unlikePost(postId);
      } else {
        await likePost(postId);
      }
      // Reload feed to update counts
      loadFeed();
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  };

  if (loading) {
    return <div className="p-8 text-center">Loading feed...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      {/* Create Post */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <textarea
          value={newPostContent}
          onChange={(e) => setNewPostContent(e.target.value)}
          placeholder="What's on your mind?"
          className="w-full p-3 border rounded-lg resize-none"
          rows={3}
        />
        <button
          onClick={handleCreatePost}
          className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Post
        </button>
      </div>

      {/* Feed */}
      <div className="space-y-4">
        {posts.map((post) => (
          <div key={post.id} className="bg-white rounded-lg shadow p-4">
            {/* Author */}
            <div className="flex items-center mb-3">
              <div className="w-10 h-10 bg-gray-300 rounded-full mr-3" />
              <div>
                <div className="font-semibold">{post.author_name}</div>
                <div className="text-sm text-gray-500">
                  {new Date(post.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>

            {/* Content */}
            <p className="mb-3">{post.content}</p>

            {/* Actions */}
            <div className="flex items-center gap-4 pt-3 border-t">
              <button
                onClick={() => handleLike(post.id, post.is_liked_by_me || false)}
                className={`flex items-center gap-1 ${
                  post.is_liked_by_me ? 'text-red-600' : 'text-gray-600'
                }`}
              >
                ❤️ {post.likes_count}
              </button>
              <button className="flex items-center gap-1 text-gray-600">
                💬 {post.comments_count}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
RESULT: Basic feed page ready to test

Step 7: Add Route to App
WHERE: /src/app/App.tsx

WHAT TO DO:

Open the file
Add import at top:
import Feed from './pages/Feed';
Add route inside <Routes>:
<Route path="/feed" element={<Feed />} />
RESULT: Feed accessible at /feed URL