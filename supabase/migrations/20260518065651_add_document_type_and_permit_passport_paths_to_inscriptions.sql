/*
  # Add document type selection and permit/passport paths to inscription_requests

  1. Modified Tables
    - `inscription_requests`
      - `document_type` (text, nullable) — type of identity document: 'ci', 'permit', or 'passport'
      - `permit_front_path` (text, nullable) — storage path for permit B/C front photo
      - `permit_back_path` (text, nullable) — storage path for permit B/C back photo
      - `passport_page_path` (text, nullable) — storage path for passport identity page photo

  2. Notes
    - Existing rows (all using CI) will have document_type = NULL, which is acceptable
      since validation happened before this feature existed
    - New rows will contain document_type when not a transfer (has_played_before = false)
    - Only the paths relevant to the chosen document type will be populated
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inscription_requests' AND column_name = 'document_type'
  ) THEN
    ALTER TABLE public.inscription_requests
      ADD COLUMN document_type text CHECK (document_type IN ('ci', 'permit', 'passport'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inscription_requests' AND column_name = 'permit_front_path'
  ) THEN
    ALTER TABLE public.inscription_requests ADD COLUMN permit_front_path text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inscription_requests' AND column_name = 'permit_back_path'
  ) THEN
    ALTER TABLE public.inscription_requests ADD COLUMN permit_back_path text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inscription_requests' AND column_name = 'passport_page_path'
  ) THEN
    ALTER TABLE public.inscription_requests ADD COLUMN passport_page_path text;
  END IF;
END $$;
