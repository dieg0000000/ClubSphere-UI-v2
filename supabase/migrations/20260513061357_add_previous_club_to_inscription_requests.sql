/*
  # Add previous_club to inscription_requests

  1. Schema change
    - Adds optional `previous_club` text column to `inscription_requests`
      to capture the applicant's previous ASF club for transfer flows.
      Helps admins locate the player in Clubcorner quickly.

  2. Notes
    - Optional, no default. Existing rows remain unaffected.
*/

ALTER TABLE public.inscription_requests
  ADD COLUMN IF NOT EXISTS previous_club text;

COMMENT ON COLUMN public.inscription_requests.previous_club IS
  'Optional. The previous club name reported by the applicant in case of transfer from another ASF club. Helps admins locate the player in Clubcorner.';
