-- Add columns to listings that the app (CreateListing/EditListing/the listings
-- edge function) writes but which are absent from the original bare-bones
-- schema (id, user_id, title, description, tags, price, city, image, created_at).
-- Missing columns cause PostgREST errors like:
--   "Could not find the 'available_days' column of 'listings' in the schema cache"

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS street_address     text,
  ADD COLUMN IF NOT EXISTS province           text,
  ADD COLUMN IF NOT EXISTS postal_code        text,
  ADD COLUMN IF NOT EXISTS country             text    DEFAULT 'Canada',
  ADD COLUMN IF NOT EXISTS images              jsonb   DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS videos              jsonb   DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS listing_type        text,
  ADD COLUMN IF NOT EXISTS listing_mode        text,
  ADD COLUMN IF NOT EXISTS service_category    text,
  ADD COLUMN IF NOT EXISTS payment_methods     jsonb   DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS delivery_options    jsonb   DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS delivery_price      numeric,
  ADD COLUMN IF NOT EXISTS available_days      jsonb   DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS blocked_dates       jsonb   DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS service_start_time  text,
  ADD COLUMN IF NOT EXISTS service_end_time    text,
  ADD COLUMN IF NOT EXISTS working_hours       text,
  ADD COLUMN IF NOT EXISTS requirements        text,
  ADD COLUMN IF NOT EXISTS cancellation        text,
  ADD COLUMN IF NOT EXISTS qualification       text,
  ADD COLUMN IF NOT EXISTS search_keywords     text,
  ADD COLUMN IF NOT EXISTS metadata            jsonb   DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_active           boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at          timestamptz;
