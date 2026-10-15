/*
  # Fix profiles RLS policy and add updated_at column

  1. Changes
    - Drop and recreate the profiles UPDATE policy to fix RLS issues
    - Add updated_at column if missing for tracking profile changes

  2. Security
    - Ensures users can only update their own profile
    - Uses both USING and WITH CHECK clauses for UPDATE policy
*/

-- Drop existing update policy if it exists
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Recreate with proper USING and WITH CHECK
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Add updated_at column if it doesn't exist
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();