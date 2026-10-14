-- Pictures in Reels: posts and portfolio albums can opt in (portfolio_items.show_in_reels already exists).
alter table posts add column if not exists show_in_reels boolean not null default false;
create index if not exists posts_reels_idx on posts (created_at desc) where show_in_reels;

alter table portfolio_albums add column if not exists show_in_reels boolean not null default false;
create index if not exists portfolio_albums_reels_idx on portfolio_albums (created_at desc) where show_in_reels;
