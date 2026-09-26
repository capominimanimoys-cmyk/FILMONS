// Flat, non-grouped taxonomy -- same shape/convention as PORTFOLIO_CATEGORIES
// in portfolioApi.ts: plain string[], no ids, no DB CHECK constraint tying
// it to the business_industry column. This array is the sole source of
// truth for what a Business account can select as its industry.
export const BUSINESS_INDUSTRIES = [
  'Film Production',
  'Photography',
  'Equipment Rental',
  'Post-Production',
  'Casting',
  'Talent Agency',
  'Production Studio',
  'Music Production',
  'Event Production',
  'Education & Training',
  'Creative Agency',
  'Media & Entertainment',
  'Other',
];
