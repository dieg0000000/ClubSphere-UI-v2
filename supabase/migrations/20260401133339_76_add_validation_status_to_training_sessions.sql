/*
  # Add validation status to training sessions

  1. Changes
    - Add `validated_at` (timestamptz) column to track when session was validated
    - Add `validated_by` (uuid) column to track who validated the session
    - Add foreign key constraint linking validated_by to profiles table

  2. Notes
    - Sessions with validated_at set are considered finalized
    - If attendance is modified after validation, validated_at should be reset to null
    - Used to determine session status: validated, in_progress, or not_filled
*/

ALTER TABLE training_sessions
ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS validated_by UUID 
  REFERENCES profiles(id);
