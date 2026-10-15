/*
  # Phase 1.6a — Inscription validation groundwork

  1. New columns
     - `public.inscription_requests.health_insurance_card_path` (text, nullable)
       Path in the `inscription-id-cards` bucket for the AVS health insurance
       card photo. Used by admins to read the AVS number during validation
       (manual entry, future Mindee OCR).
     - `public.members.photo_consent` (boolean, nullable)
       Whether the member (or legal rep) authorized photo/video diffusion on
       club channels. Captured during inscription per Swiss nLPD.
     - `public.members.photo_consent_date` (timestamptz, nullable)
       When the photo consent was recorded.
     - `public.members.inscription_request_id` (uuid, nullable, FK → inscription_requests.id, ON DELETE SET NULL)
       Reference to the inscription request that created this member, for
       audit and traceability. NULL for members created before this feature
       or imported via CSV.

  2. Indexes
     - `idx_members_inscription_request_id` on members(inscription_request_id)
       to keep lookups fast when browsing by source request.

  3. Security
     - No RLS changes. Existing policies on `inscription_requests` and
       `members` already govern access to these columns.
*/

ALTER TABLE public.inscription_requests
  ADD COLUMN IF NOT EXISTS health_insurance_card_path text;

COMMENT ON COLUMN public.inscription_requests.health_insurance_card_path IS
  'Path in inscription-id-cards bucket for the AVS health insurance card photo. Used by admin to read AVS number during validation (manual or future Mindee OCR).';

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS photo_consent boolean,
  ADD COLUMN IF NOT EXISTS photo_consent_date timestamptz;

COMMENT ON COLUMN public.members.photo_consent IS
  'Whether the member (or legal rep) authorized photo/video diffusion on club channels. Captured during inscription per Swiss data protection law (nLPD).';

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS inscription_request_id uuid
  REFERENCES public.inscription_requests(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.members.inscription_request_id IS
  'Reference to the inscription request that created this member, for audit and traceability. NULL for members created before this feature or imported via CSV.';

CREATE INDEX IF NOT EXISTS idx_members_inscription_request_id
  ON public.members(inscription_request_id);
