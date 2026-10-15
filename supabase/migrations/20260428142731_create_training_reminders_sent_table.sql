/*
  # Create training_reminders_sent table

  1. New Tables
    - `training_reminders_sent`
      - `id` (uuid, primary key)
      - `session_id` (uuid, FK to training_sessions, ON DELETE CASCADE)
      - `days_before` (integer, NOT NULL)
      - `sent_at` (timestamptz, default now())
      - `recipients_count` (integer, default 0)
      - UNIQUE(session_id, days_before) to prevent duplicate reminders

  2. Security
    - Enable RLS
    - Authenticated users can SELECT (to display reminder status in UI)
    - service_role can INSERT and UPDATE (used by edge functions)

  3. Notes
    - Tracks which reminders have already been dispatched for which training sessions
    - Edge function `send-training-reminder` writes here, `training-reminder-cron` reads here
*/

CREATE TABLE IF NOT EXISTS training_reminders_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES training_sessions(id) ON DELETE CASCADE,
  days_before integer NOT NULL,
  sent_at timestamptz DEFAULT now(),
  recipients_count integer DEFAULT 0,
  UNIQUE(session_id, days_before)
);

ALTER TABLE training_reminders_sent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read training reminders sent"
  ON training_reminders_sent FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert training reminders sent"
  ON training_reminders_sent FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update training reminders sent"
  ON training_reminders_sent FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
