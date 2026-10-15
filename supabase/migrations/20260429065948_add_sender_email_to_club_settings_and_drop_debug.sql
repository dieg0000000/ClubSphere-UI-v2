/*
  # Add sender_email to club_settings and drop debug_training_reminders

  1. club_settings
    - Add optional `sender_email` column: verified Resend sender address
      used as the "From" for transactional emails. Distinct from
      `club_email` which is the club's general contact address.

  2. Drop
    - `debug_training_reminders` diagnostic table (no longer needed)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_settings' AND column_name = 'sender_email'
  ) THEN
    ALTER TABLE club_settings ADD COLUMN sender_email text;
  END IF;
END $$;

DROP TABLE IF EXISTS debug_training_reminders;
