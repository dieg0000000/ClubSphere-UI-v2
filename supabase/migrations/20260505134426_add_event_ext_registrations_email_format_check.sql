/*
  # Add email format CHECK constraint to event_ext_registrations

  1. Changes
    - Adds CHECK constraint `event_ext_registrations_email_format` on
      `registrant_email` to enforce:
      - Basic email format (user@domain.tld) via regex
      - Maximum length of 254 characters (RFC 5321)
      - No newline characters (LF or CR)

  2. Motivation
    - A corrupted row (multi-line prompt instead of an email) was previously
      inserted and silently broke the event reminder cron. This constraint is
      defense-in-depth so any future insert path cannot re-introduce a
      malformed email.

  3. Safety
    - Verified beforehand that no existing rows violate the constraint.
    - Uses IF NOT EXISTS guard via DO block to be idempotent.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.event_ext_registrations'::regclass
      AND conname = 'event_ext_registrations_email_format'
  ) THEN
    ALTER TABLE public.event_ext_registrations
      ADD CONSTRAINT event_ext_registrations_email_format
      CHECK (
        registrant_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
        AND length(registrant_email) <= 254
        AND registrant_email NOT LIKE '%' || chr(10) || '%'
        AND registrant_email NOT LIKE '%' || chr(13) || '%'
      );
  END IF;
END $$;
