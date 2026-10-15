/*
  # Add soft delete columns to documents

  1. Changes
    - Add `deleted_at` (timestamptz) to `documents`
    - Add `deleted_by` (uuid references profiles) to `documents`
  2. Security
    - No policy changes; existing RLS still applies.
  3. Notes
    - Soft deletion: set is_active=false + deleted_at=now() + deleted_by=user.
    - Existing document_acknowledgements rows are preserved for legal proof.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE documents ADD COLUMN deleted_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'deleted_by'
  ) THEN
    ALTER TABLE documents ADD COLUMN deleted_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
