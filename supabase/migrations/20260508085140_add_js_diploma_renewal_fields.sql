/*
  # Add J+S diploma renewal fields

  ## Summary
  Phase 1 of the J+S diploma renewal feature: schema only, no UI changes.

  ## Changes
  1. coaching_qualifications
     - Add validity_years (integer, nullable). NULL => no renewal required.
     - Backfill all existing rows with 2 (FC Romanel default, adjustable
       per diploma in phase 2).
  2. coaches
     - Add diploma_expiry_date (date, nullable).
     - Add next_js_course_date (date, nullable).
     - Add next_js_course_name (text, nullable).
     - Add next_js_course_number (text, nullable).
     - Add next_js_course_location (text, nullable).
     - Add wants_js_renewal (boolean, NOT NULL, default true).

  ## Security / RLS
  Existing RLS policies on both tables operate at row granularity with no
  column filters (qual / with_check conditions do not reference specific
  columns). New columns are therefore automatically covered by the
  existing policies:
    - Admins: full read/write.
    - Authenticated users: read all coaches / qualifications.
    - Coaches: update own row (including wants_js_renewal).
    - Anonymous token-based access: preserved.
  No policy changes required.

  ## Notes
  1. Additive migration only — no destructive operations.
  2. wants_js_renewal defaults to true so existing coaches keep renewing
     unless they opt out.
*/

ALTER TABLE public.coaching_qualifications
  ADD COLUMN IF NOT EXISTS validity_years integer;

COMMENT ON COLUMN public.coaching_qualifications.validity_years IS
  'Number of years the diploma remains valid. NULL means no renewal required. Used to compute diploma expiry on the coaches table.';

UPDATE public.coaching_qualifications
  SET validity_years = 2
  WHERE validity_years IS NULL;

ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS diploma_expiry_date date,
  ADD COLUMN IF NOT EXISTS next_js_course_date date,
  ADD COLUMN IF NOT EXISTS next_js_course_name text,
  ADD COLUMN IF NOT EXISTS next_js_course_number text,
  ADD COLUMN IF NOT EXISTS next_js_course_location text,
  ADD COLUMN IF NOT EXISTS wants_js_renewal boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.coaches.diploma_expiry_date IS
  'Date the coach''s current diploma expires. Manually set or auto-computed by post-course logic.';
COMMENT ON COLUMN public.coaches.next_js_course_date IS
  'Date of the upcoming J+S renewal course this coach is registered for. Cleared after the course date passes (auto-cron).';
COMMENT ON COLUMN public.coaches.next_js_course_name IS
  'Name of the upcoming J+S course.';
COMMENT ON COLUMN public.coaches.next_js_course_number IS
  'Course number assigned by J+S for the upcoming course.';
COMMENT ON COLUMN public.coaches.next_js_course_location IS
  'Location where the upcoming J+S course takes place.';
COMMENT ON COLUMN public.coaches.wants_js_renewal IS
  'Whether the coach wishes to keep their J+S diploma valid. If false and the diploma expires, qualification_id will be set to NULL automatically.';
