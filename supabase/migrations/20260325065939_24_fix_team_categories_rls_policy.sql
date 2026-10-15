/*
  # Fix Team Categories RLS Policy

  1. Changes
    - Drop existing SELECT policy on team_categories table
    - Create new unrestricted SELECT policy for authenticated users
    - Ensures all authenticated users can view all team categories

  2. Security
    - Maintains RLS enabled on team_categories table
    - Allows authenticated users to read all team category records
*/

-- Ensure RLS is enabled
ALTER TABLE team_categories ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Authenticated users can view team_categories" ON team_categories;
DROP POLICY IF EXISTS "select_team_categories" ON team_categories;

-- Create new unrestricted SELECT policy
CREATE POLICY "Authenticated users can read team_categories"
ON team_categories FOR SELECT
TO authenticated
USING (true);
