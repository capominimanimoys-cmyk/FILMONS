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
  userAvatar?: string;
  reviewedUserId?: string;
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

export interface ChatMessage {
  id: string;
  conversationId?: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  type: 'text' | 'post' | 'rental_request' | 'payment_request' | 'media' | 'application' | 'hire' | 'system';
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
  | 'new_post' | 'content_like' | 'content_repost'
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
  // Meta
  read: boolean;
  readAt?: string;
  createdAt: string;
}