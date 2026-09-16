// Shared copy/state mapping for the Creator verification prompt (profile
// badge, CreatorVerificationBanner, TrustVerificationSection). Mirrors the exact
// status vocabulary Verification.tsx (the real KYC flow) already branches
// on -- see its gating block right before the step-1 form -- so this stays
// in lockstep with the one place that actually resolves status into a
// gate/screen instead of inventing a second source of truth.
export type CreatorVerificationStatus =
  | 'not_started' | 'pending' | 'under_review' | 'changes_requested' | 'denied' | 'approved';

// `verificationStatus` on the User object can carry legacy aliases written
// by older code paths ('rejected', 'needs_resubmission', a bare 'verified')
// -- normalize them onto the vocabulary above instead of adding more branches
// at every call site.
export function normalizeVerificationStatus(
  status: string | undefined | null,
  isVerified: boolean | undefined,
): CreatorVerificationStatus {
  if (isVerified) return 'approved';
  switch (status) {
    case 'pending': return 'pending';
    case 'under_review': return 'under_review';
    case 'changes_requested':
    case 'needs_resubmission': return 'changes_requested';
    case 'denied':
    case 'rejected': return 'denied';
    default: return 'not_started';
  }
}

export interface VerificationCopy {
  title: string;
  body: string;
  ctaLabel: string;
}

const BENEFITS_LINE =
  'Verify your account to earn from listings, host rentals, apply for opportunity posts, post opportunities, and unlock more Filmons features.';

export function getVerificationCopy(status: CreatorVerificationStatus): VerificationCopy {
  switch (status) {
    case 'pending':
    case 'under_review':
      return {
        title: 'Verification under review',
        body: "We're reviewing your submitted verification. We'll notify you as soon as a decision has been made.",
        ctaLabel: 'View status',
      };
    case 'changes_requested':
      return {
        title: 'Action required',
        body: 'An admin requested a correction on your verification. Continue from where you left off to resubmit.',
        ctaLabel: 'Continue verification',
      };
    case 'denied':
      return {
        title: 'Verification denied',
        body: 'Your last verification attempt was denied. Review the reason and resubmit with corrected documents.',
        ctaLabel: 'Resubmit verification',
      };
    case 'approved':
      return { title: 'Verified', body: '', ctaLabel: '' };
    case 'not_started':
    default:
      return {
        title: 'Not verified',
        body: BENEFITS_LINE,
        ctaLabel: 'Verify your account',
      };
  }
}
