// The "All" tab body -- one vertical stack, in the exact order the spec's
// "MOBILE BEHAVIOR" section lays out: About, Creator Level, Top Skills,
// Featured Portfolio, Services, Listings, My Gear/Tools, Recommendations,
// Portfolio Interaction, Social Links. Shared by Profile.tsx (owner) and
// HostProfile.tsx (viewer) so the layout never drifts between the two.
import { Listing } from '../../types';
import { PortfolioItem } from '../../lib/portfolioApi';
import { Recommendation } from '../../lib/recommendationsApi';
import { AboutSection } from './AboutSection';
import { CreatorLevelSection } from './CreatorLevelSection';
import { TopSkillsSection } from './TopSkillsSection';
import { FeaturedPortfolioSection } from './FeaturedPortfolioSection';
import { ListingsRowSection } from './ListingsRowSection';
import { MyGearSection } from './MyGearSection';
import { RecommendationsSection } from './RecommendationsSection';
import { ProfileInteractionSection } from './ProfileInteractionSection';
import { SocialLinksSection, type SocialLinksData } from './SocialLinksSection';
import type { ProfileInteractionStats } from '../../lib/profileEngagement';

export function ProfileAllTab({
  userId, isOwner, viewerId, accountType, isVerified,
  bio, primaryRole, secondaryRoles, location, openTo, languages, onEditAbout,
  skills, onEditSkills,
  portfolioItems, onOpenPortfolioItem, onViewAllPortfolio,
  services, listings, lockedListingIds, onViewServices, onViewListings,
  gear, onEditGear,
  recommendations, recommendationCount, onViewAllRecommendations, onRecommend,
  socialLinks, onEditSocialLinks,
  interactionStats,
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
  bio?: string;
  primaryRole?: string;
  secondaryRoles?: string[];
  location?: string;
  openTo?: string[];
  languages?: string[];
  onEditAbout?: () => void;
  skills: string[];
  onEditSkills?: () => void;
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
  recommendations: Recommendation[];
  recommendationCount: number;
  onViewAllRecommendations: () => void;
  onRecommend?: () => void;
  socialLinks: SocialLinksData;
  onEditSocialLinks?: () => void;
  /** Fetched once by the page and shared with the header's own Profile
   * Interaction stat -- see ProfileInteractionSection's own comment. */
  interactionStats: ProfileInteractionStats | null;
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

      <CreatorLevelSection userId={userId} accountType={accountType} isVerified={isVerified} />

      <TopSkillsSection skills={skills} isOwner={isOwner} onEdit={onEditSkills} />

      <FeaturedPortfolioSection
        items={portfolioItems} isOwner={isOwner}
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

      <RecommendationsSection
        recommendations={recommendations} count={recommendationCount} isOwner={isOwner}
        onViewAll={onViewAllRecommendations} onRecommend={onRecommend}
      />

      {isOwner && <ProfileInteractionSection stats={interactionStats} />}

      <SocialLinksSection links={socialLinks} isOwner={isOwner} onEdit={onEditSocialLinks} creatorId={userId} actorId={viewerId} />
    </div>
  );
}
