/*
  # Schedule daily coach diploma cron job

  1. Extensions
    - Relies on existing `pg_cron` and `pg_net` extensions

  2. Cron Job
    - Name: `coach-diploma-cron-daily`
    - Schedule: every day at 10:00 UTC (12:00 Swiss time)
    - Action: POST to the `coach-diploma-cron` Edge Function which:
      - Auto-renews J+S diplomas after their scheduled course date
      - Auto-revokes expired diplomas for coaches who opted out of renewal

  3. Notes
    - The Edge Function is deployed with `verify_jwt=false`, so no auth header is required
    - If a job already exists with the same name we unschedule it first to allow safe re-runs
    - Schedule slot 10:00 UTC avoids collision with event-reminders (08:00) and training-reminders (09:00)
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'coach-diploma-cron-daily') THEN
    PERFORM cron.unschedule('coach-diploma-cron-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'coach-diploma-cron-daily',
  '0 10 * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://jmlpnwhfhtyndatzlztp.supabase.co/functions/v1/coach-diploma-cron',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    );
  $cron$
);
