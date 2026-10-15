/*
  # Add reminder timestamp columns to events table

  1. New Columns
    - `events.reminder_8_sent_at` (timestamptz) — when J-8 reminder was sent
    - `events.reminder_3_sent_at` (timestamptz) — when J-3 reminder was sent
    - `events.reminder_1_sent_at` (timestamptz) — when J-1 reminder was sent

  2. Notes
    - These columns track when each reminder type has been dispatched at the event level
    - NULL means the reminder has not been sent yet
    - Used by both the daily cron and the manual admin "Send now" buttons
    - The `force` flag in the edge function bypasses the NULL check
*/

ALTER TABLE events ADD COLUMN IF NOT EXISTS reminder_8_sent_at timestamptz;
ALTER TABLE events ADD COLUMN IF NOT EXISTS reminder_3_sent_at timestamptz;
ALTER TABLE events ADD COLUMN IF NOT EXISTS reminder_1_sent_at timestamptz;
