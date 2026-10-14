-- Creator opt-in: a public portfolio VIDEO can also appear in the Reels feed.
-- Engagement (likes, comments, views) stays on the portfolio item itself -- no duplicate post is created.
alter table portfolio_items add column if not exists show_in_reels boolean not null default false;
create index if not exists portfolio_items_reels_idx on portfolio_items (created_at desc) where show_in_reels;
