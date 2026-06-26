export interface UserLink {
  id: string;
  label: string;  // e.g. "Portfolio", "Website"
  url: string;
}

export interface User {
  id: string;
  email?: string;
  name: string;
  username?: string;
  birthdate?: string;
  phone?: string;
  password?: string;
  avatar?: string;
  coverPhoto?: string;
  bio?: string;
  location?: string;         // display string e.g. "Toronto, ON"
  streetAddress?: string;    // structured address fields
  city?: string;
  province?: string;
  postalCode?: string;
  links?: UserLink[];
  accountCategory?: string;
  accountType?: 'creator' | 'creator_plus' | 'professional' | 'business';
  accountMode?:  'creator' | 'creator_plus' | 'professional' | 'business';
  followers: string[];
  following: string[];
  instagram?: string;
  facebook?: string;
  whatsapp?: string;
  isVerified?: boolean;
  verificationStatus?: string;
  contactPublic?: boolean;
  createdAt?: string;
  primaryRole?: string;
  profileSetupCompleted?: boolean;
  profileSetupPercentage?: number;
}

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  userName: string;
  userAccountType?: 'creator' | 'creator_plus' | 'professional' | 'business';
  userAvatar?: string;
  content: string;
  likes?: string[];      // user IDs who liked (often [] on load — use likesCount for display)
  likesCount?: number;   // authoritative count from DB likes_count column
  likedByMe?: boolean;   // set by getPostComments when userId is passed
  replyCount?: number;   // from DB replies_count column
  parentId?: string | null;
  createdAt: string;
}

export type PostType = 'photo' | 'video' | 'audio' | 'text' | 'mixed';
export type Visibility = 'public' | 'followers' | 'private';

export interface Post {
  id: string;
  userId: string;
  userName: string;
  userAccountType?: string;
  userAvatar?: string;

  // Type
  postType?: PostType;

  // Content
  content: string;          // caption
  textContent?: string;     // text-post body
  mediaUrls?: string[];     // all media
  images?: string[];
  videos?: string[];
  thumbnailUrl?: string;
  audioUrl?: string;
  audios?: string[];
  audioNames?: string[];
  gifs?: string[];

  // Metadata
  visibility?: Visibility;
  allowComments?: boolean;
  allowSharing?: boolean;
  allowDuetRemix?: boolean;
  allowDownload?: boolean;
  tags?: string[];
  mentions?: string[];
  location?: string;
  caption?: string;
  videoUrl?: string;
  textBgStyle?: string;
  viewsCount?: number;
  link?: string;

  // Engagement
  likes: string[];
  likesCount?: number;
  commentCount?: number;        // main comments only
  totalCommentsCount?: number;  // main comments + replies
  repostCount?: number;
  repostOf?: {
    postId: string; userId: string; userName: string;
    userAvatar?: string; content: string; images?: string[]; createdAt?: string;
  };

  createdAt: string;
  updatedAt?: string;
}

export interface Reel {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  videoUrl: string;
  coverUrl?: string;
  caption?: string;
  duration?: number;
  audioTrackId?: string;
  originalAudioUrl?: string;
  textOverlays?: { text: string; x: number; y: number; style?: string }[];
  effects?: string[];
  tags?: string[];
  mentions?: string[];
  visibility?: Visibility;
  allowComments?: boolean;
  allowSharing?: boolean;
  allowRemix?: boolean;
  likes: string[];
  likesCount?: number;
  commentCount?: number;
  createdAt: string;
}

export interface ContactMethod {
  type: 'whatsapp' | 'instagram' | 'facebook' | 'email' | 'phone';
  value: string;
  label?: string;
}

export interface PricingPackage {
  tier: 'standard' | 'intermediate' | 'deluxe' | 'custom';
  name: string;
  price: number;
  description: string;
}

export interface Review {
  id: string;
  listingId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface Listing {
  id: string;
  userId: string;
  title: string;
  description: string;
  tags: string[];
  price: number;
  city: string;
  streetAddress?: string;
  province?: string;
  postalCode?: string;
  image?: string;
  images?: string[];
  videos?: string[];
  contactMethods?: ContactMethod[];
  paymentMethods?: string[];        // methods host accepts at checkout
  deliveryOptions?: string[];       // e.g. ['pickup', 'delivery']
  deliveryPrice?: number;           // optional fee host charges for delivery (CAD)
  createdAt: string;
  listingType: 'gear' | 'service';
  serviceCategory?: 'photographer' | 'videographer' | 'editor' | 'colorist' | 'sound-designer' | 'drone-pilot' | 'gaffer' | 'grip' | 'production-assistant' | 'other';
  listingMode?: 'rent' | 'sale';
  condition?: 'new' | 'like-new' | 'good' | 'fair';
  isSold?: boolean;
  soldAt?: string;
  qualification?: string;
  pricingPackages?: PricingPackage[];
  workingHours?: string;
  requirements?: string;
  cancellation?: string;
}

export interface ChatMessage {
  id: string;
  conversationId?: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  type: 'text' | 'post' | 'rental_request' | 'payment_request' | 'media';
  content?: string;
  // ── Threading ──────────────────────────────────────────────────────────────
  replyTo?: string;            // id of the message being replied to
  replyToMsg?: ChatMessage;    // hydrated reply preview (client-only)
  // ── Forwarding ─────────────────────────────────────────────────────────────
  forwardedFrom?: string;      // original message id
  // ── State ──────────────────────────────────────────────────────────────────
  isPinned?: boolean;
  editedAt?: string;
  // ── Delete ─────────────────────────────────────────────────────────────────
  deletedFor?: Record<string, boolean>;  // { userId: true } for "delete for me"
  // ── Per-user delivery status (from message_status table) ───────────────────
  status?: 'sent' | 'delivered' | 'seen';
  sharedPost?: Post;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio';
  rentalRequest?: {
    listingId: string;
    listingTitle: string;
    listingType: 'gear' | 'service';
    startDate: string;
    duration: number;
    durationType: 'hours' | 'days';
    message?: string;
    selectedPackage?: PricingPackage;
    status: 'pending' | 'accepted' | 'declined';
  };
  paymentRequest?: {
    amount: number;
    description: string;
    paymentMethod?: string;
    paymentLink?: string;
    instructions?: string;
    deliveryOption?: string;
    status: 'pending' | 'paid';
    listingId?: string;
    listingTitle?: string;
    listingType?: 'gear' | 'service';
    listingMode?: 'rent' | 'sale';
    startDate?: string;
    duration?: number;
    durationType?: 'hours' | 'days';
  };
  createdAt: string;
  read?: boolean;   // legacy — prefer message_status table
}

export interface Conversation {
  id: string;
  participantIds: string[];
  messages: ChatMessage[];
  updatedAt: string;
  isRequest?: boolean;
  requestedBy?: string;
  /** Server-authoritative unread count from conversation_participants.unread_count */
  unreadCount?: number;
  /** Sidebar preview text (WhatsApp-style, built server-side) */
  lastMessagePreview?: string;
  lastMessageAt?: string;
  /** Conversation-level per-user flags */
  isMuted?:    boolean;
  isPinned?:   boolean;
  isArchived?: boolean;
}

export type NotificationType =
  // Comments
  | 'comment_received' | 'comment_reply' | 'comment_like'
  | 'comment_mention'  | 'comment_pinned' | 'comment_deleted'
  // Likes, Reposts & Posts
  | 'new_post' | 'content_like' | 'content_repost'
  // Network / Followers
  | 'new_follower' | 'follow_request' | 'follow_accepted'
  | 'connection_request' | 'connection_accepted'
  // Applications
  | 'application_received' | 'application_accepted' | 'application_rejected'
  // Messages
  | 'message' | 'new_message' | 'message_received' | 'message_reply' | 'message_reaction'
  // Marketplace
  | 'service_booked' | 'booking_accepted' | 'booking_rejected'
  | 'payment_received' | 'payment_released'
  | 'marketplace_order' | 'marketplace_booking' | 'marketplace_reply'
  // Profile & Trust
  | 'profile_completion' | 'trust_level_update'
  // System
  | 'account_verified' | 'account_warning' | 'system_announcement' | 'system_notification';

export interface Notification {
  id: string;
  type: NotificationType;
  fromUserId: string;
  fromUserName: string;
  fromUserAvatar?: string;
  toUserId: string;
  // Post
  postId?: string;
  postContent?: string;
  postImage?: string;
  // Comment deep-link fields
  commentId?: string;
  parentCommentId?: string;
  commentContent?: string;
  // Messaging
  conversationId?: string;
  messageContent?: string;
  // Network
  followBack?: boolean;
  // Marketplace
  listingId?: string;
  listingTitle?: string;
  listingPrice?: number;
  listingImage?: string;
  // Audio
  audioId?: string;
  audioTitle?: string;
  audioUses?: number;
  // FP
  fpAmount?: number;
  // Meta
  read: boolean;
  createdAt: string;
}