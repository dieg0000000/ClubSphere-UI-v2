/*
  # Fix Coaches RLS Policy

  1. Changes
    - Drop existing SELECT policy on coaches table
    - Create new unrestricted SELECT policy for authenticated users
    - Ensures all authenticated users can view all coaches

  2. Security
    - Maintains RLS enabled on coaches table
    - Allows authenticated users to read all coach records
*/

-- Ensure RLS is enabled
ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Authenticated users can view coaches" ON coaches;
DROP POLICY IF EXISTS "select_coaches" ON coaches;

-- Create new unrestricted SELECT policy
CREATE POLICY "Authenticated users can read coaches"
ON coaches FOR SELECT
TO authenticated
USING (true);
