alter table public.profiles add column if not exists business_industry text;
alter table public.profiles add column if not exists last_business_industry_prompt_at timestamptz;
