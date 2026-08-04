-- A trigger on public.reviews (defined outside this repo's tracked
-- migrations, presumably to update the reviewed user's reputation score)
-- reads NEW.reviewed_user_id. Without the column, every insert into
-- reviews fails with "record \"new\" has no field \"reviewed_user_id\""
-- (Postgres error 42703), which the client silently swallows and falls
-- back to a code path that stores the review somewhere the app never
-- reads it back from — so submitted reviews always looked empty.
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS reviewed_user_id uuid REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS idx_reviews_reviewed_user_id ON public.reviews(reviewed_user_id);
