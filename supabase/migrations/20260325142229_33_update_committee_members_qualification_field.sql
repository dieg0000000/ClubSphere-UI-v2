/*
  # Update Committee Members Qualification Field

  1. Changes
    - Rename coach_id to qualification_id in committee_members table
    - Update foreign key to reference coaching_qualifications instead of coaches
    - This allows committee members to have a coaching qualification assigned

  2. Security
    - No changes to RLS policies
*/

-- Drop the existing foreign key constraint
ALTER TABLE committee_members 
DROP CONSTRAINT IF EXISTS committee_members_coach_id_fkey;

-- Rename the column
ALTER TABLE committee_members 
RENAME COLUMN coach_id TO qualification_id;

-- Add new foreign key constraint to coaching_qualifications
ALTER TABLE committee_members 
ADD CONSTRAINT committee_members_qualification_id_fkey 
FOREIGN KEY (qualification_id) 
REFERENCES coaching_qualifications(id) 
ON DELETE SET NULL;
