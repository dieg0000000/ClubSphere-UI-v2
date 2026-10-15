/*
  # Expand members.gender CHECK constraint and backfill inscription_requests.gender

  1. Changes
    - members: replace gender CHECK to allow NULL or one of 'M', 'F', 'O'
      (previously only 'M' or 'F', causing 23514 errors when validating
      inscriptions where the applicant selected "Autre").
    - inscription_requests: backfill historical full-word values
      ("Masculin", "Féminin", "Autre") into short codes to match the
      members table convention. Idempotent — subsequent runs are no-ops.

  2. Security
    - No RLS changes. Existing policies remain intact.

  3. Notes
    1. The old CHECK constraint is dropped and recreated with the
       expanded allowed list. NULL is explicitly permitted.
    2. Backfill statements are idempotent UPDATEs.
*/

ALTER TABLE public.members
  DROP CONSTRAINT IF EXISTS members_gender_check;

ALTER TABLE public.members
  ADD CONSTRAINT members_gender_check
  CHECK (gender IS NULL OR gender = ANY (ARRAY['M'::text, 'F'::text, 'O'::text]));

UPDATE public.inscription_requests SET gender = 'M' WHERE gender = 'Masculin';
UPDATE public.inscription_requests SET gender = 'F' WHERE gender = 'Féminin';
UPDATE public.inscription_requests SET gender = 'O' WHERE gender = 'Autre';
