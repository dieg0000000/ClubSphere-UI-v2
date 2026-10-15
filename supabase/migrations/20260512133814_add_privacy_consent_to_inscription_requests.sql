/*
  # Add privacy consent fields to inscription_requests

  1. Changes
    - Adds `privacy_consent` boolean NOT NULL DEFAULT false: the
      applicant's explicit acceptance of the LPD/RGPD data-handling
      notice shown on the public inscription form (step 4).
    - Adds `privacy_consent_date` timestamptz: set server-side to
      NOW() when the applicant submits with privacy_consent = true.

  2. Rationale
    - Swiss LPD and EU RGPD require an auditable trace of consent.
    - Storing the timestamp alongside the boolean lets the club
      demonstrate when consent was given for each request.

  3. Security
    - RLS on inscription_requests is already configured; existing
      policies apply unchanged. No new grants required.
*/

ALTER TABLE public.inscription_requests
  ADD COLUMN IF NOT EXISTS privacy_consent boolean NOT NULL DEFAULT false;

ALTER TABLE public.inscription_requests
  ADD COLUMN IF NOT EXISTS privacy_consent_date timestamptz;

COMMENT ON COLUMN public.inscription_requests.privacy_consent IS
  'Applicant accepted the LPD/RGPD privacy notice at submission.';

COMMENT ON COLUMN public.inscription_requests.privacy_consent_date IS
  'Server-side timestamp of when privacy_consent was accepted.';
