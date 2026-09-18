// The "All" tab body -- one vertical stack: About, Trust & Verification,
// Posts, Top Skills, Featured Portfolio, Services, Listings, My Gear/
// Tools, Connections, Recommendations, Portfolio Interaction, Social
// Links. Shared by Profile.tsx (owner) and HostProfile.tsx (viewer) so
// the layout never drifts between the two.
import { Listing, Post } from '../../types';
import { PortfolioItem } from '../../lib/portfolioApi';
import { Recommendation } from '../../lib/recommendationsApi';
import { AboutSection } from './AboutSection';
import { TrustVerificationSection } from './TrustVerificationSection';
import { PostsPreviewSection } from './PostsPreviewSection';
import { TopSkillsSection } from './TopSkillsSection';
import { EducationSection } from './EducationSection';
import { FeaturedPortfolioSection } from './FeaturedPortfolioSection';
import { ListingsRowSection } from './ListingsRowSection';
import { MyGearSection } from './MyGearSection';
import { ConnectionsSection } from './ConnectionsSection';
import { RecommendationsSection } from './RecommendationsSection';
import { ProfileInteractionSection } from './ProfileInteractionSection';
import { SocialLinksSection, type SocialLinksData } from './SocialLinksSection';
import type { ProfileInteractionStats } from '../../lib/profileEngagement';
import type { TrustProfile } from '../../lib/trustApi';
import type { ConnectionSummary } from '../../lib/connectionsApi';

export function ProfileAllTab({
  userId, isOwner, viewerId, accountType, isVerified, verificationStatus,
  bio, primaryRole, secondaryRoles, location, openTo, languages, onEditAbout,
  posts, onViewAllPosts, onPostDeleted, onPostLikeToggled,
  skills, onEditSkills,
  education, onEditEducation,
  portfolioItems, onOpenPortfolioItem, onViewAllPortfolio,
  services, listings, lockedListingIds, onViewServices, onViewListings,
  gear, onEditGear,
  connections, connectionCount, onViewAllConnections,
  pendingConnectionRequests, onAcceptConnectionRequest, onIgnoreConnectionRequest, onViewAllConnectionRequests,
  connectionMutualCount,
  recommendations, recommendationCount, onViewAllRecommendations, onRecommend,
  socialLinks, onEditSocialLinks,
  interactionStats,
  trust, onOpenTrustDetails,
}: {
  userId: string;
  isOwner: boolean;
  /** The CURRENT viewer's id -- distinct from `userId` (the profile owner
   * being displayed). Only used to attribute Profile Interaction events
   * (e.g. social-link clicks) to whoever actually performed them; omit for
   * a guest viewer. */
  viewerId?: string;
  accountType?: string;
  isVerified?: boolean;
  /** Owner-only -- see TrustVerificationSection's own isOwner-gating comment. */
  verificationStatus?: string;
  bio?: string;
  primaryRole?: string;
  secondaryRoles?: string[];
  location?: string;
  openTo?: string[];
  languages?: string[];
  onEditAbout?: () => void;
  /** Latest posts, already fetched by the page -- see PostsPreviewSection. */
  posts: Post[];
  onViewAllPosts: () => void;
  onPostDeleted?: (id: string) => void;
  onPostLikeToggled?: (updated: Post) => void;
  skills: string[];
  onEditSkills?: () => void;
  education?: unknown;
  onEditEducation?: () => void;
  portfolioItems: PortfolioItem[];
  onOpenPortfolioItem: (item: PortfolioItem) => void;
  onViewAllPortfolio: () => void;
  services: Listing[];
  listings: Listing[];
  lockedListingIds?: Set<string>;
  onViewServices: () => void;
  onViewListings: () => void;
  gear: string[];
  onEditGear?: () => void;
  /** Preview of mutual FILMONS connections (distinct from Followers/
   * Following) -- see ConnectionsSection. */
  connections: ConnectionSummary[];
  connectionCount: number;
  onViewAllConnections: () => void;
  /** Owner-only: received invitations, already capped by the page. */
  pendingConnectionRequests?: ConnectionSummary[];
  onAcceptConnectionRequest?: (otherId: string) => Promise<boolean>;
  onIgnoreConnectionRequest?: (otherId: string) => void;
  onViewAllConnectionRequests?: () => void;
  /** Viewer-only: mutual connection count with the profile owner. */
  connectionMutualCount?: number;
  recommendations: Recommendation[];
  recommendationCount: number;
  onViewAllRecommendations: () => void;
  onRecommend?: () => void;
  socialLinks: SocialLinksData;
  onEditSocialLinks?: () => void;
  /** Fetched once by the page and shared with the header's own Profile
   * Interaction stat -- see ProfileInteractionSection's own comment. */
  interactionStats: ProfileInteractionStats | null;
  /** Fetched once by the page (getTrustProfile) and shared with the header's
   * compact TrustBadge -- see TrustVerificationSection's own comment. */
  trust: TrustProfile | null;
  onOpenTrustDetails: () => void;
}) {
  // No horizontal padding here on purpose -- the page-level wrapper
  // (Profile.tsx / HostProfile.tsx) owns the single horizontal gutter for
  // its whole content column; adding another px-* here would stack two
  // gutters and needlessly narrow every card on mobile.
  return (
    <div className="py-4 space-y-3">
      <AboutSection
        bio={bio} primaryRole={primaryRole} secondaryRoles={secondaryRoles}
        location={location} openTo={openTo} languages={languages}
        isOwner={isOwner} onEdit={onEditAbout}
      />

      <TrustVerificationSection
        trust={trust} isOwner={isOwner} accountType={accountType} isVerified={isVerified}
        verificationStatus={verificationStatus} onOpenDetails={onOpenTrustDetails}
      />

      <PostsPreviewSection
        posts={posts} isOwner={isOwner} onViewAll={onViewAllPosts}
        onDeleted={onPostDeleted} onLikeToggled={onPostLikeToggled}
      />

      <TopSkillsSection skills={skills} isOwner={isOwner} onEdit={onEditSkills} />

      <EducationSection education={education} isOwner={isOwner} onEdit={onEditEducation} />

      <FeaturedPortfolioSection
        userId={userId} items={portfolioItems} isOwner={isOwner}
        onOpenItem={onOpenPortfolioItem} onViewAll={onViewAllPortfolio}
      />

      <ListingsRowSection
        title="Services" icon="🛠️ " listings={services} onViewAll={onViewServices}
        emptyText="No services offered yet." ownerEmptyText="Add the services you offer to be discovered for work." isOwner={isOwner}
      />

      <ListingsRowSection
        title="Listings" icon="🏷️ " listings={listings} lockedIds={lockedListingIds} onViewAll={onViewListings}
        emptyText="No active listings." ownerEmptyText="You have no active listings yet." isOwner={isOwner}
      />

      <MyGearSection gear={gear} isOwner={isOwner} onEdit={onEditGear} />

      <ConnectionsSection
        connections={connections} count={connectionCount} isOwner={isOwner}
        onViewAll={onViewAllConnections}
        pendingRequests={pendingConnectionRequests}
        onAcceptRequest={onAcceptConnectionRequest}
        onIgnoreRequest={onIgnoreConnectionRequest}
        onViewAllRequests={onViewAllConnectionRequests}
        mutualCount={connectionMutualCount}
      />

      <RecommendationsSection
        recommendations={recommendations} count={recommendationCount} isOwner={isOwner}
        onViewAll={onViewAllRecommendations} onRecommend={onRecommend}
      />

      {isOwner && <ProfileInteractionSection stats={interactionStats} />}

      <SocialLinksSection links={socialLinks} isOwner={isOwner} onEdit={onEditSocialLinks} creatorId={userId} actorId={viewerId} />
    </div>
  );
}
