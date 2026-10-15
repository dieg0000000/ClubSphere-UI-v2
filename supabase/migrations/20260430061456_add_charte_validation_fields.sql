/*
  # Charte validation system

  1. Modified Tables
    - `documents`: add `target_team_ids` uuid[] — for charte_entraineurs, list of team ids this applies to (NULL = all teams)
    - `document_acknowledgements`: add `validated_by_parent_id` uuid — parent profile id if a parent validated for a minor child
    - `document_acknowledgements`: add `email_sent_at` timestamptz — tracks if reminder/confirmation email was sent
  2. Security
    - No RLS changes (existing policies remain)
*/

ALTER TABLE documents ADD COLUMN IF NOT EXISTS target_team_ids uuid[];
COMMENT ON COLUMN documents.target_team_ids IS 'For charte_entraineurs: list of team IDs this charte applies to. NULL = all teams.';

ALTER TABLE document_acknowledgements ADD COLUMN IF NOT EXISTS validated_by_parent_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
COMMENT ON COLUMN document_acknowledgements.validated_by_parent_id IS 'If parent validated for a minor child, the parent profile id';

ALTER TABLE document_acknowledgements ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;
COMMENT ON COLUMN document_acknowledgements.email_sent_at IS 'Timestamp of confirmation or reminder email sent for this acknowledgement';
