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
  emailVerified?:  boolean;
  phoneVerified?:  boolean;
  /** Professional/Business subscription state — set only by stripe-webhook via fn_activate_subscription/fn_deactivate_subscription, never client-written. */
  subscriptionStatus?: 'active' | 'canceled';
  subscriptionCurrentPeriodEnd?: string;
  subscriptionCancelAtPeriodEnd?: boolean;
  /** Set by fn_deactivate_subscription when Stripe cancels a lapsed
   *  subscription (no valid billing method survived retries) -- the tier
   *  the account just fell FROM ('professional' | 'business'), so the
   *  downgrade banner can say which one expired. Cleared back to null by
   *  fn_activate_subscription on a successful (re)subscribe. */
  subscriptionDowngradedFrom?: string | null;
  /** false right after an auto-downgrade, until the user dismisses the
   *  banner ("Continue with Creator+") or successfully renews -- the ONLY
   *  one of these subscription fields a client write is allowed to touch
   *  directly (it carries no privilege, just banner visibility). */
  subscriptionDowngradeAcknowledged?: boolean;
  /** Parsed `profiles.profile_meta` JSON — skills, gear, socials, secondary roles, etc. */
  profileMeta?: Record<string, any>;
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
export type Visibility = 'public' | 'followers' | 'private' | 'connections';

export interface Post {
  id: string;
  userId: string;
  userName: string;
  userAccountType?: string;
  userAvatar?: string;
  /** The author's current primary creative role (live profile join, not
   * frozen at post-create time) -- e.g. "Cinematographer". Shown in
   * PostCard's header, LinkedIn-style. */
  userRole?: string;

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

  // Portfolio attachment -- real portfolio_item_id only, title/category/
  // thumb cached for display (same pattern as the listing* fields below).
  portfolioItemId?: string;
  portfolioItemTitle?: string;
  portfolioItemCategory?: string;
  portfolioItemThumb?: string;

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
  /** Same idea as repostOf, for a reposted Portfolio ALBUM (rather than a
   * Post) -- a live reference (albumId + owner), never a copy of the
   * album's content. */
  repostOfAlbum?: {
    albumId: string; userId: string; userName: string; userAvatar?: string;
    title: string; coverUrl?: string; itemCount?: number;
  };
  /** The poster's OWN album, attached to a fresh post they're publishing --
   * distinct from repostOfAlbum (someone else's album, reposted). Same live
   * reference shape (albumId + owner, never a content copy) so edits to the
   * album keep showing up on the postcard. */
  ownAlbum?: {
    albumId: string; userId: string; userName: string; userAvatar?: string;
    title: string; coverUrl?: string; itemCount?: number;
  };
  /** Whether the CURRENT viewer has already (plain-)reposted this post --
   * batched in alongside likes at fetch time (see fetchRepostedPostIds in
   * api.ts) so the "Reposted" state is correct everywhere a post is
   * rendered, not just for the rest of the session after tapping Repost
   * locally. PostCard seeds its own hasReposted state from this. */
  hasReposted?: boolean;
  /** Who -- among the viewer themselves, their accepted connections, or
   * people they follow -- reposted this post (plain or with thoughts).
   * Batched at fetch time (see fetchRepostContext in api.ts); empty/
   * undefined means nobody relevant to the viewer reposted it, in which
   * case PostCard shows no social-context row at all (never a random
   * stranger's name). 'self' entries sort first. */
  repostContext?: { id: string; name: string; avatarUrl: string | null; relation: 'self' | 'connection' | 'other' }[];

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
  userAvatar?: string;
  reviewedUserId?: string;
  rating: number;
  comment: string;
  createdAt: string;
  // Populated by reviewsApi's fetch, not stored on the row itself — title
  // of (and whether a click can still open) the listing this review was
  // written for. Absent listingTitle + listingAvailable === false covers
  // both "listing deleted" and "review predates listing_id existing".
  listingTitle?: string;
  listingAvailable?: boolean;
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
  listingType: 'gear' | 'service' | 'opportunity';
  serviceCategory?: 'photographer' | 'videographer' | 'editor' | 'colorist' | 'sound-designer' | 'drone-pilot' | 'gaffer' | 'grip' | 'production-assistant' | 'other';
  listingMode?: 'rent' | 'sale';
  condition?: 'new' | 'like-new' | 'good' | 'fair';
  isSold?: boolean;
  soldAt?: string;
  qualification?: string;
  boosted?: boolean;
  /** Emergency Listing — paid fixed-tier feed recycling boost, distinct
   *  from the variable-budget `boosted` system above (see
   *  20240401000000_emergency_listings.sql). emergencyExpiresAt is what
   *  Home.tsx checks to decide whether isEmergency is still actually
   *  live, since the flag itself isn't cleared until expiry is noticed. */
  isEmergency?: boolean;
  emergencyPlan?: '72_hour' | '7_day';
  emergencyExpiresAt?: string;
  insuranceRequired?: boolean;
  /** Raw CreateListing kind ('equipment-rental'|'equipment-sale'|'creative-service'|'studio'|'talent'|'job') from metadata.listingKind. 'talent' is the Opportunity category. */
  listingKind?: string;
  /** Structured Opportunity fields from metadata.opportunity — only present when listingKind === 'talent'. */
  opportunity?: OpportunityDetails;
  pricingPackages?: PricingPackage[];
  workingHours?: string;
  requirements?: string;
  cancellation?: string;
}

export interface OpportunityApplicationConfig {
  requireProfile: boolean;
  requirePortfolio: boolean;
  requireMessage: boolean;
  requireResume: boolean;
  requireDemoReel: boolean;
  requireAvailability: boolean;
  requireExpectedRate: boolean;
  customQuestions: string[];
}

export interface OpportunityDetails {
  opportunityType: string; // 'job'|'paid_gig'|'casting_call'|'crew_call'|'freelance_project'|'collaboration'|'internship'|'audition'|'volunteer'|'other'
  categoryIndustry?: string;
  roleNeeded?: string;
  numPeopleNeeded?: number;
  workArrangement: 'onsite' | 'remote' | 'hybrid';
  remoteEligibility?: 'CA' | 'US' | 'CA_US' | 'ANYWHERE';
  timingType: 'one_time' | 'multiple_dates' | 'ongoing' | 'flexible';
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  applicationDeadline?: string;
  noDeadline?: boolean;
  estimatedWorkDays?: number;
  paid: boolean;
  compensationType?: 'hourly' | 'daily' | 'fixed' | 'salary' | 'negotiable';
  compensationAmount?: number;
  compensationMin?: number;
  compensationMax?: number;
  currency?: 'CAD' | 'USD';
  paymentDetails?: string;
  experienceLevel?: 'any' | 'beginner' | 'intermediate' | 'experienced' | 'professional';
  skills?: string[];
  equipmentRequirement?: 'provided' | 'own' | 'either';
  equipmentDetails?: string;
  languages?: string;
  certifications?: string;
  driversLicence?: boolean;
  portfolioRequired?: boolean;
  applicationConfig?: OpportunityApplicationConfig;
  /** Absent = 'active'. 'applications_closed' hides the Apply CTA but keeps
   *  existing applicants/conversations. 'completed' is a separate, later
   *  lifecycle state — the opportunity itself has ended. Neither ever
   *  deletes application/message history. */
  opportunityStatus?: 'active' | 'applications_closed' | 'completed';
}

/** Universal FILMONS Share system payload (shareApi.ts's shareContent()) --
 *  one shape for every shareable Connect content type instead of a separate
 *  message format per type. A display snapshot only; the real content is
 *  always re-fetched by (contentType, contentId) when opened, so it never
 *  goes stale or leaks a since-restricted post. */
export interface SharedContentSnapshot {
  contentType: 'post' | 'portfolio_item' | 'portfolio_album' | 'connection';
  contentId: string;
  /** portfolio_item/portfolio_album only -- the item/album's owning
   *  creator, distinct from the post author for a reposted/attached case. */
  creatorId: string;
  creatorName: string;
  creatorAvatar?: string;
  creatorVerified?: boolean;
  title?: string;
  caption?: string;
  thumbnailUrl?: string;
  meta?: string[];
}

export interface ChatMessage {
  id: string;
  conversationId?: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  type: 'text' | 'post' | 'rental_request' | 'payment_request' | 'media' | 'application' | 'hire' | 'system' | 'shared_content';
  content?: string;
  /** type:'system' only — display text for the centered non-editable event divider (e.g. "You were shortlisted for this opportunity."). */
  systemText?: string;
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
  /** Derived from messages.read_at — true once the recipient has opened the conversation past this message. */
  read?: boolean;
  /** ISO timestamp the recipient actually read this message, if they have. */
  readAt?: string;
  sharedPost?: Post;
  /** type:'shared_content' only -- the universal FILMONS Share system's
   *  message payload (see shareApi.ts). A lightweight display snapshot
   *  captured at share time (name/avatar/caption/thumbnail), NOT the
   *  original content itself -- SharedContentBubble re-verifies the real
   *  content still exists/is visible before letting the recipient open it. */
  sharedContent?: SharedContentSnapshot;
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
  /** type:'application' only — a live pointer, never a data snapshot. The
   *  card always re-fetches opportunity_applications/listings/profile fresh
   *  by these ids so status stays correct regardless of which surface
   *  (Inbox card, Applicants Manager, applicant withdraw) last changed it. */
  applicationCard?: {
    applicationId: string;
    opportunityId: string;
    applicantId: string;
    ownerId: string;
  };
  /** type:'hire' only — a live pointer, never a data snapshot, same
   *  contract as applicationCard: the card always re-fetches
   *  hire_requests/hire_transactions fresh by these ids. */
  hireCard?: {
    hireRequestId: string;
    requesterId: string;
    hostId: string;
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
  /** Set only for a conversation tied to one specific Opportunity application
   *  — never a generic DM. Lets the same two users have a separate thread
   *  per application instead of colliding into one pair-keyed conversation. */
  opportunityId?: string;
  applicationId?: string;
}

export type NotificationType =
  // Comments
  | 'comment_received' | 'comment_reply' | 'comment_like'
  | 'comment_mention'  | 'comment_pinned' | 'comment_deleted'
  // Likes, Reposts & Posts
  | 'new_post' | 'content_like' | 'content_repost' | 'content_repost_thoughts' | 'post_mention'
  // Network / Followers
  | 'new_follower' | 'follow_request' | 'follow_accepted'
  | 'connection_request' | 'connection_accepted'
  // Applications
  | 'application_received' | 'application_accepted' | 'application_rejected'
  | 'application_shortlisted' | 'application_withdrawn'
  // Messages
  | 'message' | 'new_message' | 'message_received' | 'message_reply' | 'message_reaction'
  // Marketplace
  | 'service_booked' | 'booking_accepted' | 'booking_rejected'
  | 'rental_request' | 'payment_request'
  | 'rental_request_accepted' | 'rental_request_declined'
  | 'purchase_request_accepted' | 'purchase_request_declined'
  | 'listing_liked' | 'creator_liked' | 'followed_creator_posted' | 'message_request_accepted'
  | 'payment_received' | 'payment_released'
  | 'payout_requested' | 'payout_processing' | 'payout_paid' | 'payout_rejected'
  | 'support_reply'
  | 'marketplace_order' | 'marketplace_booking' | 'marketplace_reply'
  | 'review_received' | 'listing_review'
  // Profile & Trust
  | 'profile_completion' | 'trust_level_update'
  // Portfolio
  | 'portfolio_view'
  // Learning
  | 'course_published'
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
  messageId?: string;
  messageContent?: string;
  // Network
  followBack?: boolean;
  // Marketplace
  listingId?: string;
  listingTitle?: string;
  listingPrice?: number;
  listingImage?: string;
  // Reviews
  reviewId?: string;
  rating?: number;
  // Audio
  audioId?: string;
  audioTitle?: string;
  audioUses?: number;
  // Portfolio -- type:'portfolio_view' only. The number of unread views in
  // this notification's batch (see portfolioViewsApi.ts) -- grows in place
  // server-side as more people view the same unread batch, rather than a
  // new notification per viewer.
  viewCount?: number;
  // Meta
  read: boolean;
  readAt?: string;
  createdAt: string;
}