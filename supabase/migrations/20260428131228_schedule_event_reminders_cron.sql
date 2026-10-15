/*
  # Schedule daily event reminder cron job

  1. Extensions
    - Enable `pg_cron` for scheduled jobs
    - Enable `pg_net` for async HTTP from Postgres

  2. Cron Job
    - Name: `event-reminders-daily`
    - Schedule: every day at 08:00 UTC
    - Action: POST to the `event-reminder-cron` Edge Function which scans
      upcoming events and triggers J-8/J-3/J-1 reminders as needed.

  3. Notes
    - The Edge Function is deployed with `verify_jwt=false`, so no auth header is required.
    - If a job already exists with the same name we unschedule it first to allow safe re-runs.
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'event-reminders-daily') THEN
    PERFORM cron.unschedule('event-reminders-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'event-reminders-daily',
  '0 8 * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://jmlpnwhfhtyndatzlztp.supabase.co/functions/v1/event-reminder-cron',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    );
  $cron$
);
