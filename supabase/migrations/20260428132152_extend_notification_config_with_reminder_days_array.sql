/*
  # Extend notification config with multi-day reminders + dedupe table

  1. Schema Changes
    - `club_notification_config.reminder_days_array` (integer[], default {1,3,8})
      Multiple reminder offsets per notification type instead of a single integer.
      The legacy `reminder_days` column is kept for backwards compatibility and
      its current value is migrated into the new array.
    - For the `event_reminder` row specifically, default to {1,3,8}.

  2. New Table: `event_reminders_sent`
    - Tracks which (event_id, days_before) reminder pairs have been dispatched
      so the cron and manual triggers can dedupe regardless of how many offsets
      are configured. Replaces the old per-column flags on `events`.
    - Columns:
      - `id` uuid PK
      - `event_id` uuid FK -> events(id) ON DELETE CASCADE
      - `days_before` integer (1..30)
      - `sent_at` timestamptz default now()
    - UNIQUE (event_id, days_before) so a given offset is only stamped once.

  3. Security
    - RLS enabled on `event_reminders_sent`.
    - Authenticated users can SELECT (matches the read policy on the rest of the
      events module). Writes are performed by the service role from the edge
      functions, so no INSERT/UPDATE/DELETE policies for end users are added.
*/

ALTER TABLE club_notification_config
  ADD COLUMN IF NOT EXISTS reminder_days_array integer[] DEFAULT ARRAY[1,3,8];

UPDATE club_notification_config
SET reminder_days_array = ARRAY[reminder_days]
WHERE reminder_days IS NOT NULL
  AND notification_type IN ('match_reminder', 'training_reminder')
  AND (reminder_days_array IS NULL OR array_length(reminder_days_array, 1) IS NULL);

UPDATE club_notification_config
SET reminder_days_array = ARRAY[1,3,8]
WHERE notification_type = 'event_reminder'
  AND (reminder_days_array IS NULL OR array_length(reminder_days_array, 1) IS NULL);

CREATE TABLE IF NOT EXISTS event_reminders_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  days_before integer NOT NULL CHECK (days_before BETWEEN 1 AND 30),
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, days_before)
);

CREATE INDEX IF NOT EXISTS idx_event_reminders_sent_event ON event_reminders_sent(event_id);

ALTER TABLE event_reminders_sent ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'event_reminders_sent'
      AND policyname = 'Authenticated can read event_reminders_sent'
  ) THEN
    CREATE POLICY "Authenticated can read event_reminders_sent"
      ON event_reminders_sent FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;
