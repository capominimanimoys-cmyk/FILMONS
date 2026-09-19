-- FILMONS Learning -- enrollment/progress/reviews go live on top of the V1
-- schema from 20240511000000_courses.sql (browse/detail-only until now).
-- Same denormalized-counter-via-trigger convention as portfolio
-- likes/comments (fn_sync_portfolio_item_likes_count etc.) -- courses.
-- student_count and rating_avg/rating_count get a real writer instead of
-- staying permanently at their DEFAULT 0.

CREATE OR REPLACE FUNCTION public.fn_sync_course_student_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'active' THEN
      UPDATE public.courses SET student_count = student_count + 1 WHERE id = NEW.course_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'active' THEN
      UPDATE public.courses SET student_count = GREATEST(student_count - 1, 0) WHERE id = OLD.course_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'active' AND OLD.status <> 'active' THEN
      UPDATE public.courses SET student_count = student_count + 1 WHERE id = NEW.course_id;
    ELSIF NEW.status <> 'active' AND OLD.status = 'active' THEN
      UPDATE public.courses SET student_count = GREATEST(student_count - 1, 0) WHERE id = NEW.course_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_course_student_count ON public.course_enrollments;
CREATE TRIGGER trg_sync_course_student_count
AFTER INSERT OR UPDATE OR DELETE ON public.course_enrollments
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_course_student_count();

CREATE OR REPLACE FUNCTION public.fn_sync_course_rating()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  target_course_id uuid := COALESCE(NEW.course_id, OLD.course_id);
  agg RECORD;
BEGIN
  SELECT COUNT(*) AS cnt, COALESCE(AVG(rating), 0) AS avg_rating
    INTO agg
    FROM public.course_reviews
    WHERE course_id = target_course_id;
  UPDATE public.courses
    SET rating_count = agg.cnt, rating_avg = ROUND(agg.avg_rating::numeric, 2)
    WHERE id = target_course_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_course_rating ON public.course_reviews;
CREATE TRIGGER trg_sync_course_rating
AFTER INSERT OR UPDATE OR DELETE ON public.course_reviews
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_course_rating();
