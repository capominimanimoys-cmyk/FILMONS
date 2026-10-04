-- FILMONS Learning: a course cover can be a short looping video.
-- cover_url stays an image (uploaded, or a frame taken from the video) so
-- every card, share preview and fallback keeps working.
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS cover_video_url text;
