-- WorkEditor's "Collaborators" field -- a simple tag-style string array,
-- same shape as the existing `tags` column, not a full linked-profile
-- Credits system (that's Albums-only today via a dedicated table; adding
-- the equivalent for individual items is out of scope for this pass).
alter table public.portfolio_items add column if not exists collaborators text[];
