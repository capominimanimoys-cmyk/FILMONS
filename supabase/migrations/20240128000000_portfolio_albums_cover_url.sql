-- Album cover can be an uploaded image independent of any portfolio item.
ALTER TABLE public.portfolio_albums
  ADD COLUMN IF NOT EXISTS cover_url text;
