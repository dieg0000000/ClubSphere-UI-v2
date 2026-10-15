/*
  # Add avs_number_ocr to inscription_requests

  1. Changes
    - Adds nullable text column `avs_number_ocr` to `inscription_requests`.
    - Stores the AVS number extracted by the OCR from the health insurance
      card at public submission time.

  2. Rationale
    - The public form does not collect the AVS number explicitly.
    - The admin validation page uses this as a non-authoritative SUGGESTION
      next to the AVS input. Admin always has final say.

  3. Security
    - RLS already configured on inscription_requests; existing policies
      apply unchanged. No new grants required.
*/

ALTER TABLE public.inscription_requests
  ADD COLUMN IF NOT EXISTS avs_number_ocr text;

COMMENT ON COLUMN public.inscription_requests.avs_number_ocr IS
  'AVS number extracted by OCR from the health insurance card. Used as a suggestion for the admin during validation. Not guaranteed valid — admin verifies before creating the member.';
