-- Every column the Add Work / Edit Work editors write. Safe to run more than once:
-- anything that already exists is left alone.
alter table public.portfolio_items add column if not exists collaborators text[];
alter table public.portfolio_items add column if not exists visibility    text;
alter table public.portfolio_items add column if not exists location      text;
alter table public.portfolio_items add column if not exists subcategory   text;
alter table public.portfolio_items add column if not exists role          text;
alter table public.portfolio_items add column if not exists external_link text;
alter table public.portfolio_items add column if not exists tools         jsonb default '[]'::jsonb;
alter table public.portfolio_items add column if not exists tags          jsonb default '[]'::jsonb;

-- Makes the API pick the new columns up right away (otherwise saves can keep failing until the
-- schema cache refreshes).
notify pgrst, 'reload schema';
