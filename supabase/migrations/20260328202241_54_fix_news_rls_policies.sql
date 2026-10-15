/*
  # Fix News Table RLS Policies

  1. Changes
    - Drop existing INSERT, UPDATE, DELETE policies
    - Create new policies with proper WITH CHECK clauses for INSERT and UPDATE
    - Ensure UPDATE policies have both USING and WITH CHECK
    - All policies restricted to admin users only

  2. Security
    - INSERT: Admins can insert news with WITH CHECK
    - UPDATE: Admins can update news with both USING and WITH CHECK
    - DELETE: Admins can delete news with USING
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage news" ON news;
DROP POLICY IF EXISTS "Admins can update news" ON news;
DROP POLICY IF EXISTS "Admins can delete news" ON news;

-- Create new INSERT policy with WITH CHECK
CREATE POLICY "Admins can insert news"
  ON news
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'admin'
    )
  );

-- Create new UPDATE policy with both USING and WITH CHECK
CREATE POLICY "Admins can update news"
  ON news
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'admin'
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'admin'
    )
  );

-- Create new DELETE policy with USING
CREATE POLICY "Admins can delete news"
  ON news
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'admin'
    )
  );