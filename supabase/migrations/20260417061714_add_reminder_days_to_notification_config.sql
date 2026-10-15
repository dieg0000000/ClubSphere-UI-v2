/*
  # Add reminder_days to club_notification_config

  1. Changes
    - Adds `reminder_days` integer column (default 1) to `club_notification_config`
    - Sets reminder_days = 1 for the 3 reminder notification types
*/

ALTER TABLE club_notification_config
ADD COLUMN IF NOT EXISTS reminder_days integer DEFAULT 1;

UPDATE club_notification_config
SET reminder_days = 1
WHERE notification_type IN ('match_reminder', 'training_reminder', 'event_reminder');
