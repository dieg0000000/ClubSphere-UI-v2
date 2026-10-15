/*
  # Extend event_reminders_sent and notification_log for reminder observability

  1. event_reminders_sent additions
    - attempted_count (int, default 0) — total recipients attempted
    - sent_count (int, default 0) — successful sends
    - failed_count (int, default 0) — Resend rejections
    - skipped_count (int, default 0) — pre-flight invalid emails
    - errors (jsonb) — capped array of {email, reason/error} entries
  2. Backfill
    - Existing rows represent successful historical runs; attempted_count
      and sent_count left at 0 defaults (we have no retroactive counts)
  3. notification_log changes
    - Make recipient_id nullable so external (non-user) email recipients
      from event_ext_registrations can be logged without a user link
*/

ALTER TABLE public.event_reminders_sent
  ADD COLUMN IF NOT EXISTS attempted_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skipped_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS errors jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notification_log'
      AND column_name='recipient_id' AND is_nullable='NO'
  ) THEN
    ALTER TABLE public.notification_log ALTER COLUMN recipient_id DROP NOT NULL;
  END IF;
END $$;
