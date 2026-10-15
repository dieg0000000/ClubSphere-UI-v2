/*
  # Schedule daily training reminder cron job

  1. Cron Job
    - Name: `training-reminders-daily`
    - Schedule: every day at 09:00 UTC
    - Action: POST to the `training-reminder-cron` Edge Function which scans
      upcoming training sessions and dispatches reminders for each configured
      day in `club_notification_config.training_reminder.reminder_days_array`.

  2. Notes
    - Existing job with the same name (if any) is unscheduled first to allow safe re-runs.
    - The Edge Function is deployed with `verify_jwt=false`, so no auth header is required.
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'training-reminders-daily') THEN
    PERFORM cron.unschedule('training-reminders-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'training-reminders-daily',
  '0 9 * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://jmlpnwhfhtyndatzlztp.supabase.co/functions/v1/training-reminder-cron',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    );
  $cron$
);
