/*
  # Onboarding and Parent-Members System

  ## Summary
  This migration adds the onboarding flow for new users, allowing parents to link their accounts to their children's profiles using AVS numbers.

  ## New Tables
  
  1. **parent_members** - Junction table linking parent auth users to their children (members)
     - `id` (uuid, primary key)
     - `parent_user_id` (uuid, references profiles.id) - The authenticated parent user
     - `member_id` (uuid, references members.id) - The child player/member
     - `created_at` (timestamptz) - When the link was established

  ## Schema Changes
  
  1. **profiles table**
     - Add `onboarding_completed` (boolean, default false) - Tracks if user has completed onboarding
     - Add `parent` role option to the role check constraint

  ## Security (RLS Policies)
  
  1. **parent_members table**
     - Enable RLS
     - Parents can view their own links (SELECT)
     - Only admins can create/update/delete links (INSERT/UPDATE/DELETE)
     - Coaches can view links for members in their teams (SELECT)

  ## Important Notes
  
  - Parents will be linked to members via AVS number lookup during onboarding
  - Parents will automatically be added to conversation_participants for their children's teams
  - Admin/coach/committee accounts created manually should have onboarding_completed = true by default
*/

-- Add onboarding_completed column to profiles if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'onboarding_completed'
  ) THEN
    ALTER TABLE profiles ADD COLUMN onboarding_completed boolean DEFAULT false;
  END IF;
END $$;

-- Update the role check constraint to include 'parent'
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'profiles' AND constraint_name = 'profiles_role_check'
  ) THEN
    ALTER TABLE profiles DROP CONSTRAINT profiles_role_check;
  END IF;

  -- Add new constraint with 'parent' role
  ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
    CHECK (role IN ('admin', 'committee', 'coach', 'member', 'public', 'parent'));
END $$;

-- Create parent_members junction table
CREATE TABLE IF NOT EXISTS parent_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(parent_user_id, member_id)
);

-- Enable RLS on parent_members
ALTER TABLE parent_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies for parent_members

-- Parents can view their own links
CREATE POLICY "Parents can view own children links"
  ON parent_members
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = parent_user_id
  );

-- Admins can view all parent-member links
CREATE POLICY "Admins can view all parent links"
  ON parent_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Coaches can view links for members in their teams
CREATE POLICY "Coaches can view parent links for their team members"
  ON parent_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN coaches c ON c.user_id = p.id
      JOIN teams t ON (t.coach_id = c.id OR t.assistant_coach_id = c.id)
      JOIN members m ON m.team_id = t.id
      WHERE p.id = auth.uid()
      AND m.id = parent_members.member_id
    )
  );

-- Only admins can insert parent-member links (for manual linking)
CREATE POLICY "Admins can create parent links"
  ON parent_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Only admins can delete parent-member links
CREATE POLICY "Admins can delete parent links"
  ON parent_members
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_parent_members_parent_user_id ON parent_members(parent_user_id);
CREATE INDEX IF NOT EXISTS idx_parent_members_member_id ON parent_members(member_id);
