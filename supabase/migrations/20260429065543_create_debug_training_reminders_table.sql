/*
  # Create debug_training_reminders table

  1. New Tables
    - `debug_training_reminders` - captures internal state of each
      send-training-reminder invocation for debugging recipient resolution
  2. Security
    - Enable RLS
    - Admin/committee read policy (troubleshooting use)
*/

CREATE TABLE IF NOT EXISTS debug_training_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  session_id uuid,
  team_id uuid,
  team_members_count integer,
  attendance_rows_count integer,
  responded_count integer,
  pending_count integer,
  recipients_array text[]
);

ALTER TABLE debug_training_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read debug training reminders"
  ON debug_training_reminders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'committee')
    )
  );
