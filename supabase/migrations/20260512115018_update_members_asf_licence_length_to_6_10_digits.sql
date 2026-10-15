/*
  # Update ASF licence number length constraint on members

  1. Changes
    - Drops the obsolete `members_asf_length` CHECK (limited to 7 chars) which predates
      the expansion of ASF licence numbers to accommodate women's football.
    - Replaces it with `members_asf_format`: NULL allowed, otherwise must be exactly
      6 to 10 digits (numeric only). This matches the current ASF range.

  2. Rationale
    - Women's football licences can reach up to 10 digits in Clubcorner.
    - Enforcing digits-only at the DB level defends against bad input that the
      public inscription form previously accepted (e.g. non-numeric garbage).

  3. Notes
    - Constraint is CHECK only, no data migration required.
    - inscription_requests is intentionally left untouched (audit data).
    - This migration is idempotent; prior applications will be no-ops.
*/

ALTER TABLE public.members
  DROP CONSTRAINT IF EXISTS members_asf_length;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'members_asf_format'
      AND conrelid = 'public.members'::regclass
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_asf_format
      CHECK (
        asf_licence_number IS NULL
        OR (asf_licence_number ~ '^\d{6,10}$')
      );
  END IF;
END $$;

COMMENT ON CONSTRAINT members_asf_format ON public.members IS
  'ASF licence number: optional, but if present must be 6 to 10 digits (numeric only). Updated from old 7-char limit to support women football licences which can be up to 10 digits.';
