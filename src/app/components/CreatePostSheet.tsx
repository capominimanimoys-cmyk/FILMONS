/**
 * Filmons — Create Post (new flow)
 * src/app/components/CreatePostSheet.tsx
 *
 * Single-screen LinkedIn-style composer. There is only "Create Post" --
 * no type-select step, no separate Text/Photo/Video/Portfolio/Listing
 * post types (per spec, section "IMPORTANT CREATION RULE"). The composer
 * IS the preview: whatever is attached renders inline as you build it,
 * there's no separate review/share step before publishing.
 *
 * Kept prop-compatible with PostComposer's entry-point contract
 * (onClose/onPost/currentUser/initialAction/closing) so Home.tsx/
 * Profile.tsx can swap the import without touching call sites.
 */
import { useState, useRef, useEffect } from 'react';
import {
  X, Image as ImageIcon, Briefcase, Tag, MapPin, Link2, ChevronDown,
  Globe, Users, UserCheck, Check, Play, FileText, Loader2, Clock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { postsApi } from '../lib/api';
import { supabase } from '../../lib/supabase';
import { UserAvatar } from './AccountTypeBadge';
import { BottomSheet, SheetCancel } from './BottomSheet';
import { PortfolioBrowser } from './PortfolioBrowser';
import { ListingBrowser } from './ListingBrowser';
import { getDrafts, saveDraft, deleteDraft, draftThumbnail, draftAge, type PostDraft } from '../lib/draftsApi';
import { searchLocations, detectGpsLocation, attachLocationToPost, type LocationResult } from '../lib/locationApi';
import { searchHashtags, attachHashtagsToPost, type Hashtag } from '../lib/hashtagsApi';
import { searchProfiles, attachMentionsToPost, type ProfileResult } from '../lib/mentionsApi';
import { notifyEvent } from '../lib/notifyEvent';
import * as notifs from '../lib/notifications';
import { toast } from 'sonner';
import type { Visibility, Listing, Post } from '../types';
import { registerPortfolioRepost, type PortfolioItem } from '../lib/portfolioApi';
import { QuotedPostPreview } from './QuotedPostPreview';

interface MediaDraft {
  id: string;
  file: File;
  previewUrl: string;
  type: 'photo' | 'video';
}

const AUDIENCE_OPTIONS: { id: Visibility; label: string; sub: string; icon: any }[] = [
  { id: 'public',      label: 'Anyone',      sub: 'Visible to everyone on Filmons',        icon: Globe },
  { id: 'followers',   label: 'Followers',   sub: 'Only people who follow you',            icon: Users },
  { id: 'connections', label: 'Connections', sub: 'Only your accepted connections',        icon: UserCheck },
];

const isUUID = (v: any): boolean =>
  !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v));

export function CreatePostSheet({ onClose, onPost, currentUser, initialAction, initialPortfolioItem, initialRepostOfPost, initialRepostOfAlbum, closing }: {
  onClose: () => void;
  onPost?: (p?: any) => void;
  currentUser?: any;
  initialAction?: 'photo' | 'portfolio' | 'listing';
  /** Pre-attaches a Portfolio item without going through PortfolioBrowser --
   * feeds "Repost with your thoughts" on a Portfolio card, which opens this
   * composer already carrying the item so the resulting post is a real,
   * separately-engageable wrapper post (its own likes/comments) around the
   * SAME live attachment mechanism the ordinary "attach portfolio work" flow
   * already uses, not a new repost-specific code path. */
  initialPortfolioItem?: PortfolioItem;
  /** "Repost with thoughts" on a Post -- same idea as initialPortfolioItem
   * above, just for the other repostable content type. The original is
   * shown read-only via QuotedPostPreview and written back as a live
   * reference (repostOf: {postId, userId, ...}) via postsApi.create's own
   * repostOf param, never copied into this new post's own content. */
  initialRepostOfPost?: Post;
  /** "Repost with thoughts" on a Portfolio ALBUM (PortfolioAlbumCard's own
   * RepostMenuSheet, distinct from initialPortfolioItem above which is
   * the ordinary "attach my own work" mechanism reused for ITEM reposts).
   * A lightweight ref, not the full PortfolioAlbum -- written back as a
   * live reference via extraMeta.repostOfAlbum, never a copy. */
  initialRepostOfAlbum?: NonNullable<Post['repostOfAlbum']>;
  closing?: boolean;
}) {
  const { user: authUser } = useAuth();
  const user = currentUser || authUser;
  const isCreatorPlus = ['creator_plus', 'professional', 'business'].includes(user?.accountType || '') ||
                         ['creator_plus', 'professional', 'business'].includes(user?.accountMode || '');

  const [caption, setCaption] = useState('');
  const [media, setMedia] = useState<MediaDraft[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [mentionedUsers, setMentionedUsers] = useState<ProfileResult[]>([]);
  const [selectedPortfolioItem, setSelectedPortfolioItem] = useState<PortfolioItem | null>(initialPortfolioItem ?? null);
  // Fixed at mount -- true only when this composer session STARTED as a
  // Portfolio "repost with thoughts" (see initialPortfolioItem's own doc
  // comment), never for the ordinary "+ Portfolio" attach-my-own-work
  // picker, which never sets initialPortfolioItem.
  const isPortfolioRepostFlow = !!initialPortfolioItem;
  // "Post" is a real, removable attachment type like Portfolio/Listing --
  // local state (not a direct read of the initialRepostOfPost prop) so
  // the composer can drop it. Per spec: "If User A removes the Post
  // attachment, the composer becomes a normal Create Post. It is no
  // longer considered Repost with Thought."
  const [repostOfPost, setRepostOfPost] = useState<Post | undefined>(initialRepostOfPost);
  // Same removable-attachment treatment as repostOfPost above, for a
  // Portfolio album repost.
  const [repostOfAlbum, setRepostOfAlbum] = useState<NonNullable<Post['repostOfAlbum']> | undefined>(initialRepostOfAlbum);
  const [selectedListings, setSelectedListings] = useState<Listing[]>([]);
  const [location, setLocation] = useState<LocationResult | null>(null);
  const [link, setLink] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [draftId, setDraftId] = useState<string | undefined>(undefined);

  const [showAudienceSheet, setShowAudienceSheet] = useState(false);
  const [showPortfolioBrowser, setShowPortfolioBrowser] = useState(false);
  const [showListingBrowser, setShowListingBrowser] = useState(false);
  const [showLocationSheet, setShowLocationSheet] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkDraft, setLinkDraft] = useState('');
  const [showDraftsSheet, setShowDraftsSheet] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [drafts, setDrafts] = useState<PostDraft[]>([]);

  const [stage, setStage] = useState<'editing' | 'posting' | 'done'>('editing');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mention/hashtag inline suggestions -- anchored under the textarea
  // rather than tracking exact cursor coordinates (a lightweight, "good
  // enough" approximation, not pixel-perfect caret-following).
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<ProfileResult[]>([]);
  const [hashQuery, setHashQuery] = useState<string | null>(null);
  const [hashResults, setHashResults] = useState<Hashtag[]>([]);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initialAction === 'photo') fileInputRef.current?.click();
    else if (initialAction === 'portfolio') setShowPortfolioBrowser(true);
    else if (initialAction === 'listing') setShowListingBrowser(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;
    getDrafts().then(setDrafts).catch(() => {});
  }, [user?.id]);

  useEffect(() => () => {
    media.forEach(m => URL.revokeObjectURL(m.previewUrl));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  const handleCaptionChange = (val: string) => {
    setCaption(val);
    const cursor = textareaRef.current?.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const hashMatch = before.match(/#(\w*)$/);
    const mentionMatch = before.match(/@(\w*)$/);

    if (mentionMatch) {
      const q = mentionMatch[1];
      setMentionQuery(q);
      setHashQuery(null);
      if (suggestTimer.current) clearTimeout(suggestTimer.current);
      suggestTimer.current = setTimeout(() => searchProfiles(q).then(setMentionResults), 200);
    } else if (hashMatch) {
      const q = hashMatch[1];
      setHashQuery(q);
      setMentionQuery(null);
      if (suggestTimer.current) clearTimeout(suggestTimer.current);
      suggestTimer.current = setTimeout(() => searchHashtags(q).then(setHashResults), 200);
    } else {
      setMentionQuery(null);
      setHashQuery(null);
    }
    setTimeout(autoResize, 0);
  };

  const insertMention = (profile: ProfileResult) => {
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? caption.length;
    const before = caption.slice(0, cursor).replace(/@\w*$/, `@${profile.username} `);
    const after = caption.slice(cursor);
    const next = before + after;
    setCaption(next);
    if (!mentionedUsers.find(u => u.id === profile.id)) setMentionedUsers(p => [...p, profile]);
    setMentionQuery(null);
    setTimeout(() => { el?.focus(); el?.setSelectionRange(before.length, before.length); autoResize(); }, 10);
  };

  const insertHashtag = (tag: string) => {
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? caption.length;
    const before = caption.slice(0, cursor).replace(/#\w*$/, `#${tag} `);
    const after = caption.slice(cursor);
    const next = before + after;
    setCaption(next);
    if (!tags.includes(tag)) setTags(p => [...p, tag]);
    setHashQuery(null);
    setTimeout(() => { el?.focus(); el?.setSelectionRange(before.length, before.length); autoResize(); }, 10);
  };

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const next: MediaDraft[] = Array.from(files).map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      type: file.type.startsWith('video') ? 'video' : 'photo',
    }));
    setMedia(p => [...p, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeMedia = (id: string) => {
    setMedia(p => {
      const found = p.find(m => m.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return p.filter(m => m.id !== id);
    });
  };

  const toggleListing = (listing: Listing) => {
    setSelectedListings(p => p.find(l => l.id === listing.id) ? p.filter(l => l.id !== listing.id) : [...p, listing]);
  };

  // Reposting a Post specifically requires the viewer's own thoughts (the
  // point of "repost with thoughts" vs. a plain instant repost) -- the
  // attached original doesn't count as "your own content" for this gate.
  const hasContent = (repostOfPost || repostOfAlbum)
    ? caption.trim().length > 0
    : caption.trim().length > 0 || media.length > 0 || !!selectedPortfolioItem || selectedListings.length > 0;

  // ── Publish ─────────────────────────────────────────────────────────────
  const publish = async () => {
    if (!user || !hasContent || stage !== 'editing') return;
    setStage('posting');
    try {
      const uploadMedia = async (items: MediaDraft[], folder: string): Promise<string[]> => {
        const uploaded: string[] = [];
        for (const m of items) {
          try {
            const res = await fetch(m.previewUrl);
            const blob = await res.blob();
            const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || (m.type === 'video' ? 'mp4' : 'jpg');
            const path = `${folder}/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
            const { error } = await supabase.storage.from('posts').upload(path, blob, { upsert: false, contentType: blob.type });
            if (error) throw error;
            const { data: urlData } = supabase.storage.from('posts').getPublicUrl(path);
            uploaded.push(urlData.publicUrl);
          } catch (e) {
            console.error('[CreatePostSheet] media upload failed:', e);
          }
        }
        return uploaded;
      };

      const photoItems = media.filter(m => m.type === 'photo');
      const videoItems = media.filter(m => m.type === 'video');
      const [imgs, vids] = await Promise.all([
        photoItems.length ? uploadMedia(photoItems, 'images') : Promise.resolve([]),
        videoItems.length ? uploadMedia(videoItems, 'videos') : Promise.resolve([]),
      ]);

      const firstListing = selectedListings[0];

      const newPost = await postsApi.create(
        caption.trim(),
        imgs,
        vids,
        [],
        mentionedUsers.map(u => u.username),
        true,
        [],
        [],
        true,
        link.trim() || undefined,
        repostOfPost ? {
          postId:    repostOfPost.id,
          userId:    repostOfPost.userId,
          userName:  repostOfPost.userName,
          userAvatar: repostOfPost.userAvatar,
          content:   repostOfPost.content,
          images:    repostOfPost.images,
          createdAt: repostOfPost.createdAt,
        } : undefined,
        {
          location: location?.name || undefined,
          listingId: firstListing && isUUID(firstListing.id) ? String(firstListing.id) : undefined,
          listingTitle: firstListing?.title,
          listingPrice: firstListing?.pricingPackages?.[0]?.price ?? firstListing?.price,
          listingMode: firstListing?.listingMode,
          listingCity: firstListing?.city,
          listingImage: firstListing?.images?.[0] ?? firstListing?.image,
          portfolioItemId: selectedPortfolioItem?.id,
          portfolioItemTitle: selectedPortfolioItem?.title,
          portfolioItemCategory: selectedPortfolioItem?.category,
          portfolioItemThumb: selectedPortfolioItem?.thumbnail_url,
          repostOfAlbum: repostOfAlbum,
          visibility,
        },
      );

      if (!newPost?.id) throw new Error('Post creation failed');

      const mentionIds = mentionedUsers.map(u => u.id).filter(Boolean);
      if (mentionIds.length) attachMentionsToPost(newPost.id, mentionIds).catch(() => {});
      if (tags.length) attachHashtagsToPost(newPost.id, tags).catch(() => {});
      if (location) attachLocationToPost(newPost.id, location).catch(() => {});
      if (selectedListings.length) {
        const rows = selectedListings.filter(l => isUUID(l.id)).map(l => ({ post_id: newPost.id, listing_id: String(l.id) }));
        if (rows.length) supabase.from('post_listings').upsert(rows, { onConflict: 'post_id,listing_id', ignoreDuplicates: true }).then(() => {}).catch(() => {});
      }
      if (draftId) deleteDraft(draftId).catch(() => {});

      // Same registration for a Portfolio item's "repost with thoughts"
      // (PortfolioProjectCard's own RepostMenuSheet -> requestRepostCompose
      // -> this composer's initialPortfolioItem) -- NOT for the ordinary
      // "+ Portfolio" attach-my-own-work flow, which never sets
      // initialPortfolioItem in the first place. isPortfolioRepostFlow
      // additionally requires the attachment to still be the SAME item
      // (not removed-then-replaced with the poster's own work via the
      // browser), and that it isn't the poster's own item to begin with.
      if (isPortfolioRepostFlow && selectedPortfolioItem && selectedPortfolioItem.id === initialPortfolioItem?.id
        && selectedPortfolioItem.user_id !== user.id) {
        registerPortfolioRepost(user.id, selectedPortfolioItem.id, 'portfolio_item', selectedPortfolioItem.title).catch(() => {});
      }

      if (repostOfPost) {
        // Registers the SAME (user_id, post_id) relationship a plain
        // repost writes -- the original's repost count and this viewer's
        // "Reposted" active state now come from one source regardless of
        // which flow created it. No-ops silently (23505) if User A already
        // has a repost record for this post (a prior plain repost, or a
        // prior "with thoughts") -- one unique reposter, +1 max, ever.
        postsApi.registerRepost(user.id, repostOfPost.id).catch(() => {});
        if (repostOfPost.userId !== user.id) {
          notifs.push(repostOfPost.userId, {
            type: 'content_repost_thoughts',
            fromUserId:    user.id,
            fromUserName:  user.name,
            fromUserAvatar: user.avatar,
            postId:        newPost.id,
            postContent:   caption.trim().slice(0, 60),
            postImage:     repostOfPost.images?.[0] || repostOfPost.thumbnailUrl,
          });
        }
      }

      if (repostOfAlbum) {
        // Same registration, for a Portfolio ALBUM repost target.
        registerPortfolioRepost(user.id, repostOfAlbum.albumId, 'portfolio_album', repostOfAlbum.title).catch(() => {});
        if (repostOfAlbum.userId !== user.id) {
          notifs.push(repostOfAlbum.userId, {
            type: 'content_repost_thoughts',
            fromUserId:    user.id,
            fromUserName:  user.name,
            fromUserAvatar: user.avatar,
            postId:        newPost.id,
            postContent:   caption.trim().slice(0, 60),
            postImage:     repostOfAlbum.coverUrl,
          });
        }
      }

      notifyEvent({
        type: 'new_post_portfolio', creatorId: user.id, creatorName: user.name || user.username || '',
        contentType: 'post', title: caption.trim().slice(0, 80) || undefined,
        contentUrl: `https://filmons.app/post/${newPost.id}`,
      });

      const followers: string[] = (user as any).followers || [];
      if (followers.length) {
        const preview = imgs[0] || vids[0] || undefined;
        followers.slice(0, 100).forEach(fid => {
          notifs.push(fid, {
            type: 'new_post' as any,
            fromUserId: user.id, fromUserName: user.name || user.username || '', fromUserAvatar: user.avatar || undefined,
            postId: newPost.id, postContent: caption.trim().slice(0, 100) || undefined, postImage: preview,
          });
        });
      }
      [...new Set(mentionIds)].filter(id => id !== user.id).forEach(uid => {
        notifs.push(uid, {
          type: 'post_mention' as any,
          fromUserId: user.id, fromUserName: user.name || user.username || '', fromUserAvatar: user.avatar || undefined,
          postId: newPost.id, postContent: caption.trim().slice(0, 100) || undefined,
        });
      });

      onPost?.(newPost);
      setStage('done');
      setTimeout(onClose, 900);
    } catch (e: any) {
      console.error('[CreatePostSheet] publish error:', e);
      toast.error(e?.message || 'Something went wrong publishing your post.');
      setStage('editing');
    }
  };

  // ── Exit / draft handling ──────────────────────────────────────────────
  const requestClose = () => {
    if (stage !== 'editing') return;
    if (!hasContent && !caption.trim()) { onClose(); return; }
    setShowExitConfirm(true);
  };

  const discardAndClose = () => {
    if (draftId) deleteDraft(draftId).catch(() => {});
    onClose();
  };

  const saveDraftAndClose = async () => {
    if (!user) { onClose(); return; }
    try {
      await saveDraft(user.id, {
        kind: 'post',
        photos: media.filter(m => m.type === 'photo').map(m => m.previewUrl),
        video_url: media.find(m => m.type === 'video')?.previewUrl,
        caption: caption.trim(),
        tags,
        mentions: mentionedUsers.map(u => u.username),
        location: location?.name,
        visibility,
        allow_comments: true,
        allow_sharing: true,
        allow_download: true,
        step: 'caption',
      }, draftId);
      toast.success('Draft saved.');
    } catch (e) {
      console.error('[CreatePostSheet] saveDraft failed:', e);
    }
    onClose();
  };

  const loadDraft = (draft: PostDraft) => {
    setCaption(draft.caption || '');
    setTags(draft.tags || []);
    setLocation(draft.location ? { name: draft.location, source: 'nominatim' } : null);
    setVisibility((draft.visibility as Visibility) || 'public');
    setDraftId(draft.id);
    setShowDraftsSheet(false);
    setTimeout(autoResize, 0);
  };

  const deleteDraftFromList = (id: string) => {
    deleteDraft(id).catch(() => {});
    setDrafts(p => p.filter(d => d.id !== id));
    if (draftId === id) setDraftId(undefined);
  };

  const canPost = hasContent && stage === 'editing';

  if (stage === 'posting' || stage === 'done') {
    return (
      <div className="fixed inset-0 z-[85] bg-white flex flex-col items-center justify-center gap-4">
        {stage === 'posting' ? (
          <>
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-sm font-bold text-gray-500">Posting…</p>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
              <Check className="w-7 h-7 text-green-600" />
            </div>
            <p className="text-sm font-bold text-gray-900">Your post is live.</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[85] bg-white flex flex-col"
      style={{
        animation: closing ? 'createPostOut 0.3s cubic-bezier(0.32,0.72,0,1) forwards' : 'createPostIn 0.3s cubic-bezier(0.32,0.72,0,1)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <style>{`
        @keyframes createPostIn  { from { transform:translateY(100%) } to { transform:translateY(0) } }
        @keyframes createPostOut { from { transform:translateY(0) } to { transform:translateY(100%) } }
      `}</style>

      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 pt-12 pb-3 border-b border-gray-100">
        <button onClick={requestClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <X className="w-4 h-4 text-gray-600" />
        </button>
        <p className="text-sm font-black text-gray-900">Create post</p>
        <button
          onClick={publish}
          disabled={!canPost}
          className={`px-4 py-1.5 rounded-full text-sm font-black transition-colors ${canPost ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}
        >
          Post
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Author + audience row */}
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-2">
          <UserAvatar user={{ id: user?.id, name: user?.name, avatar: user?.avatar }} size={40} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-gray-900 truncate">{user?.name}</p>
            <button
              onClick={() => setShowAudienceSheet(true)}
              className="flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-full bg-gray-100 text-xs font-bold text-gray-600"
            >
              {AUDIENCE_OPTIONS.find(o => o.id === visibility)?.label ?? 'Anyone'}
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
          {drafts.length > 0 && (
            <button onClick={() => setShowDraftsSheet(true)} className="flex items-center gap-1 text-xs font-bold text-gray-400 shrink-0">
              <Clock className="w-3.5 h-3.5" /> Drafts ({drafts.length})
            </button>
          )}
        </div>

        {/* Textarea */}
        <div className="px-4 relative">
          <textarea
            ref={textareaRef}
            value={caption}
            onChange={e => handleCaptionChange(e.target.value)}
            placeholder={(repostOfPost || repostOfAlbum) ? 'What are your thoughts?' : 'Share something with the Filmons community…'}
            className="w-full bg-transparent text-[15px] text-gray-900 placeholder-gray-400 resize-none outline-none leading-relaxed py-2"
            style={{ minHeight: 120 }}
            autoFocus
          />

          {mentionQuery !== null && (
            <div className="absolute left-4 right-4 bg-white rounded-2xl border border-gray-100 shadow-xl max-h-56 overflow-y-auto z-10">
              {mentionResults.length === 0 ? (
                <p className="text-xs text-gray-400 px-4 py-3">No users found</p>
              ) : mentionResults.map(p => (
                <button key={p.id} onClick={() => insertMention(p)} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-gray-50">
                  <UserAvatar user={{ id: p.id, name: p.display_name, avatar: p.avatar_url }} size={28} />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-gray-900 truncate">{p.display_name || p.username}</p>
                    <p className="text-[11px] text-gray-400 truncate">@{p.username}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {hashQuery !== null && (
            <div className="absolute left-4 right-4 bg-white rounded-2xl border border-gray-100 shadow-xl max-h-56 overflow-y-auto z-10">
              {hashResults.length === 0 ? (
                <p className="text-xs text-gray-400 px-4 py-3">No hashtags found</p>
              ) : hashResults.map(h => (
                <button key={h.id} onClick={() => insertHashtag(h.tag)} className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-gray-50">
                  <p className="text-xs font-bold text-blue-600">#{h.tag}</p>
                  <p className="text-[11px] text-gray-400">{h.post_count} posts</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tags/mentions chips */}
        {(tags.length > 0 || mentionedUsers.length > 0) && (
          <div className="px-4 pt-2 flex flex-wrap gap-1.5">
            {tags.map(t => (
              <button key={t} onClick={() => setTags(p => p.filter(x => x !== t))}
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full">
                #{t}<X className="w-3 h-3 opacity-60" />
              </button>
            ))}
            {mentionedUsers.map(u => (
              <button key={u.id} onClick={() => setMentionedUsers(p => p.filter(x => x.id !== u.id))}
                className="flex items-center gap-1 text-xs font-semibold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">
                @{u.username}<X className="w-3 h-3 opacity-60" />
              </button>
            ))}
          </div>
        )}

        {/* Media preview */}
        {media.length > 0 && (
          <div className="px-4 pt-3 flex gap-2 overflow-x-auto no-scrollbar">
            {media.map(m => (
              <div key={m.id} className="relative shrink-0 w-24 h-24 rounded-2xl overflow-hidden bg-gray-100">
                {m.type === 'video' ? (
                  <>
                    <video src={m.previewUrl} className="w-full h-full object-cover" muted playsInline />
                    <div className="absolute bottom-1 right-1 bg-black/60 rounded-full p-1"><Play className="w-3 h-3 text-white fill-white" /></div>
                  </>
                ) : (
                  <img src={m.previewUrl} className="w-full h-full object-cover" />
                )}
                <button onClick={() => removeMedia(m.id)} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center">
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            ))}
            <button onClick={() => fileInputRef.current?.click()} className="shrink-0 w-24 h-24 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-400">
              <ImageIcon className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Attached: Portfolio / Listing / Location / Link */}
        {selectedPortfolioItem && (
          <div className="px-4 pt-3">
            <div className="flex items-center gap-3 bg-gray-50 rounded-2xl p-2.5">
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-200 shrink-0">
                {selectedPortfolioItem.thumbnail_url && <img src={selectedPortfolioItem.thumbnail_url} className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-blue-600">View in portfolio →</p>
                <p className="text-sm font-bold text-gray-900 truncate">{selectedPortfolioItem.title}</p>
              </div>
              <button onClick={() => setSelectedPortfolioItem(null)} className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                <X className="w-3.5 h-3.5 text-gray-600" />
              </button>
            </div>
          </div>
        )}

        {selectedListings.length > 0 && (
          <div className="px-4 pt-3 space-y-2">
            {selectedListings.map(listing => (
              <div key={listing.id} className="flex items-center gap-3 bg-gray-50 rounded-2xl p-2.5">
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-200 shrink-0">
                  {(listing.images?.[0] ?? listing.image) && <img src={listing.images?.[0] ?? listing.image} className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-blue-600">View listing →</p>
                  <p className="text-sm font-bold text-gray-900 truncate">{listing.title}</p>
                </div>
                <button onClick={() => toggleListing(listing)} className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                  <X className="w-3.5 h-3.5 text-gray-600" />
                </button>
              </div>
            ))}
          </div>
        )}

        {location && (
          <div className="px-4 pt-3">
            <div className="flex items-center gap-2 bg-gray-50 rounded-full px-3 py-2 w-fit">
              <MapPin className="w-3.5 h-3.5 text-gray-500" />
              <p className="text-xs font-bold text-gray-700">{location.name}</p>
              <button onClick={() => setLocation(null)}><X className="w-3.5 h-3.5 text-gray-400" /></button>
            </div>
          </div>
        )}

        {link && (
          <div className="px-4 pt-3">
            <div className="flex items-center gap-2 bg-gray-50 rounded-full px-3 py-2">
              <Link2 className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              <p className="text-xs font-bold text-blue-600 truncate flex-1">{link}</p>
              <button onClick={() => setLink('')}><X className="w-3.5 h-3.5 text-gray-400" /></button>
            </div>
          </div>
        )}

        {/* "Post" -- a real, removable attachment type like Portfolio/
            Listing above, not a fixed fact about this composer session.
            Read-only preview, never a copy; the live reference is written
            back via postsApi.create's own repostOf param on publish. If
            User A removes it, this simply becomes a normal Create Post
            (hasContent's own gate stops requiring a caption once
            repostOfPost is gone, same as any other post). */}
        {repostOfPost && (
          <div className="px-4 pt-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-400">
                Repost from {repostOfPost.userName}'s post
              </p>
              <button onClick={() => setRepostOfPost(undefined)} className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                <X className="w-3.5 h-3.5 text-gray-600" />
              </button>
            </div>
            <QuotedPostPreview post={repostOfPost} />
          </div>
        )}

        {/* "Repost from {original owner}'s album" -- read-only, never a
            copy; the live reference is written back via
            extraMeta.repostOfAlbum on publish. Removable the same way as
            the Post attachment above -- removing it just becomes a
            normal post (hasContent's gate stops requiring a caption once
            it's gone). */}
        {repostOfAlbum && (
          <div className="px-4 pt-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-400">
                Repost from {repostOfAlbum.userName}'s album
              </p>
              <button onClick={() => setRepostOfAlbum(undefined)} className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                <X className="w-3.5 h-3.5 text-gray-600" />
              </button>
            </div>
            <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white flex items-center gap-3 p-3">
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                {repostOfAlbum.coverUrl && <img src={repostOfAlbum.coverUrl} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{repostOfAlbum.title}</p>
                <p className="text-xs text-gray-400">{repostOfAlbum.itemCount ?? 0} portfolio item{repostOfAlbum.itemCount === 1 ? '' : 's'}</p>
              </div>
            </div>
          </div>
        )}

        <div className="h-24" />
      </div>

      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-t border-gray-100" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
        <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-1 flex-1">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"><ImageIcon className="w-4.5 h-4.5 text-gray-600" /></div>
          <p className="text-[10px] font-semibold text-gray-500">Media</p>
        </button>
        <button
          onClick={() => isCreatorPlus ? setShowPortfolioBrowser(true) : toast('Attaching portfolio work needs Creator+.')}
          className="flex flex-col items-center gap-1 flex-1"
        >
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isCreatorPlus ? 'bg-gray-100' : 'bg-gray-50'}`}>
            <Briefcase className={`w-4.5 h-4.5 ${isCreatorPlus ? 'text-gray-600' : 'text-gray-300'}`} />
          </div>
          <p className="text-[10px] font-semibold text-gray-500">Portfolio</p>
        </button>
        <button
          onClick={() => isCreatorPlus ? setShowListingBrowser(true) : toast('Linking a listing needs Creator+.')}
          className="flex flex-col items-center gap-1 flex-1"
        >
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isCreatorPlus ? 'bg-gray-100' : 'bg-gray-50'}`}>
            <Tag className={`w-4.5 h-4.5 ${isCreatorPlus ? 'text-gray-600' : 'text-gray-300'}`} />
          </div>
          <p className="text-[10px] font-semibold text-gray-500">Listing</p>
        </button>
        <button onClick={() => setShowLocationSheet(true)} className="flex flex-col items-center gap-1 flex-1">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"><MapPin className="w-4.5 h-4.5 text-gray-600" /></div>
          <p className="text-[10px] font-semibold text-gray-500">Location</p>
        </button>
        <button onClick={() => { setLinkDraft(link); setShowLinkInput(true); }} className="flex flex-col items-center gap-1 flex-1">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"><Link2 className="w-4.5 h-4.5 text-gray-600" /></div>
          <p className="text-[10px] font-semibold text-gray-500">Link</p>
        </button>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple hidden onChange={e => handleFiles(e.target.files)} />

      {/* Audience sheet */}
      {showAudienceSheet && (
        <BottomSheet title="Who can see this?" onClose={() => setShowAudienceSheet(false)}>
          {AUDIENCE_OPTIONS.map(opt => (
            <button key={opt.id} onClick={() => { setVisibility(opt.id); setShowAudienceSheet(false); }}
              className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-gray-50">
              <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                <opt.icon className="w-4 h-4 text-gray-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900">{opt.label}</p>
                <p className="text-xs text-gray-400">{opt.sub}</p>
              </div>
              {visibility === opt.id && <Check className="w-4 h-4 text-blue-500 shrink-0" />}
            </button>
          ))}
        </BottomSheet>
      )}

      {/* Portfolio / Listing browsers */}
      {showPortfolioBrowser && (
        <PortfolioBrowser
          selectedId={selectedPortfolioItem?.id}
          onSelect={item => { setSelectedPortfolioItem(item); setShowPortfolioBrowser(false); }}
          onClose={() => setShowPortfolioBrowser(false)}
        />
      )}
      {showListingBrowser && (
        <ListingBrowser
          selectedIds={new Set(selectedListings.map(l => l.id))}
          onToggle={toggleListing}
          onClose={() => setShowListingBrowser(false)}
        />
      )}

      {/* Location sheet */}
      {showLocationSheet && (
        <LocationPickerSheet
          onSelect={loc => { setLocation(loc); setShowLocationSheet(false); }}
          onClose={() => setShowLocationSheet(false)}
        />
      )}

      {/* Link input modal */}
      {showLinkInput && (
        <div className="fixed inset-0 z-[95] bg-black/50 flex items-center justify-center p-4" onClick={() => setShowLinkInput(false)}>
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-black text-gray-900">Add a link</p>
            <input
              autoFocus
              value={linkDraft}
              onChange={e => setLinkDraft(e.target.value)}
              placeholder="https://…"
              className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowLinkInput(false)} className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-600 text-sm font-bold">Cancel</button>
              <button onClick={() => { setLink(linkDraft.trim()); setShowLinkInput(false); }} className="flex-1 py-3 rounded-2xl bg-blue-600 text-white text-sm font-bold">Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Drafts sheet */}
      {showDraftsSheet && (
        <BottomSheet title={`Drafts (${drafts.length})`} onClose={() => setShowDraftsSheet(false)}>
          {drafts.map(d => (
            <div key={d.id} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
              <button onClick={() => loadDraft(d)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                  {draftThumbnail(d) ? <img src={draftThumbnail(d)!} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><FileText className="w-4 h-4 text-gray-300" /></div>}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{d.caption || 'Untitled draft'}</p>
                  <p className="text-xs text-gray-400">{draftAge(d)}</p>
                </div>
              </button>
              <button onClick={() => deleteDraftFromList(d.id)} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                <X className="w-3.5 h-3.5 text-gray-500" />
              </button>
            </div>
          ))}
          <SheetCancel onClick={() => setShowDraftsSheet(false)} />
        </BottomSheet>
      )}

      {/* Exit confirm */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-[96] bg-black/50 flex items-center justify-center p-4" onClick={() => setShowExitConfirm(false)}>
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 space-y-3 text-center" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-black text-gray-900">Save this post?</p>
            <p className="text-xs text-gray-400">You can finish it later from Drafts.</p>
            <div className="space-y-2 pt-2">
              <button onClick={saveDraftAndClose} className="w-full py-3 rounded-2xl bg-blue-600 text-white text-sm font-bold">Save draft</button>
              <button onClick={discardAndClose} className="w-full py-3 rounded-2xl bg-gray-100 text-red-500 text-sm font-bold">Discard</button>
              <button onClick={() => setShowExitConfirm(false)} className="w-full py-2.5 text-sm font-semibold text-gray-400">Continue editing</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Location picker ──────────────────────────────────────────────────────
function LocationPickerSheet({ onSelect, onClose }: { onSelect: (loc: LocationResult) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { searchLocations('').then(r => { setResults(r); setLoading(false); }); }, []);

  const handleSearch = (q: string) => {
    setQuery(q);
    setLoading(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => searchLocations(q).then(r => { setResults(r); setLoading(false); }), 250);
  };

  const useCurrentLocation = async () => {
    setLocating(true);
    const loc = await detectGpsLocation();
    setLocating(false);
    if (loc) onSelect(loc);
    else toast.error('Could not detect your location.');
  };

  return (
    // CreatePostSheet's own overlay is z-[85] (a fixed full-screen sheet,
    // not portaled) -- BottomSheet's default z-70 rendered this BEHIND it
    // despite being portaled to document.body, since an explicit z-index
    // wins over DOM order regardless of portal target.
    <BottomSheet title="Add location" onClose={onClose} zIndex={90}>
      <div className="px-4 pt-2 pb-3 space-y-2">
        <input
          autoFocus
          value={query}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Search a city or place…"
          className="w-full bg-gray-100 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none"
        />
        <button onClick={useCurrentLocation} disabled={locating} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-blue-50 text-blue-600 text-sm font-bold">
          {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
          Use current location
        </button>
      </div>
      <div className="pb-4">
        {loading ? (
          <p className="text-xs text-gray-400 px-4 py-3">Searching…</p>
        ) : results.length === 0 ? (
          <p className="text-xs text-gray-400 px-4 py-3">No locations found</p>
        ) : results.map((loc, i) => (
          <button key={loc.id ?? `${loc.name}-${i}`} onClick={() => onSelect(loc)} className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50">
            <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
            <p className="text-sm font-semibold text-gray-800 truncate">{loc.name}</p>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
