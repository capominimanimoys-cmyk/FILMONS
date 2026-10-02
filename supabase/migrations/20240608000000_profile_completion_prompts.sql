-- Generalizes the single-field last_business_industry_prompt_at column
-- (20240607000000_business_industry.sql) to all 5 profile-completion
-- fields (identity, skills, gear, education, location) -- one jsonb map
-- of field -> last-shown ISO timestamp, instead of 5 separate dedicated
-- columns. Drives ProfileCompletionCard's "don't re-prompt the same
-- field every session" behavior. profiles already has a working general
-- UPDATE policy from earlier migrations (same precedent as
-- business_industry/last_business_industry_prompt_at above, which needed
-- no new policy either) -- this column rides on that.
alter table public.profiles add column if not exists profile_completion_prompts jsonb default '{}'::jsonb;
