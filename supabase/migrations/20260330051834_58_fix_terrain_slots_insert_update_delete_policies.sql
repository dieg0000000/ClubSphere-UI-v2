/*
  # Fix terrain_slots Insert/Update/Delete RLS Policies

  1. Changes
    - Drop existing INSERT/UPDATE/DELETE policies on terrain_slots
    - Create new admin-only policies with proper authentication checks
    - Ensure admins can insert, update, and delete terrain slots

  2. Security
    - Only authenticated users with admin role can modify terrain_slots
    - Uses proper auth.uid() checks against profiles table
*/

-- Drop existing policies
DROP POLICY IF EXISTS "insert_terrain_slots" ON terrain_slots;
DROP POLICY IF EXISTS "Admins can insert terrain slots" ON terrain_slots;
DROP POLICY IF EXISTS "update_terrain_slots" ON terrain_slots;
DROP POLICY IF EXISTS "Admins can update terrain slots" ON terrain_slots;
DROP POLICY IF EXISTS "delete_terrain_slots" ON terrain_slots;
DROP POLICY IF EXISTS "Admins can delete terrain slots" ON terrain_slots;

-- Create new admin-only INSERT policy
CREATE POLICY "Admins can insert terrain_slots"
ON terrain_slots FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Create new admin-only UPDATE policy
CREATE POLICY "Admins can update terrain_slots"
ON terrain_slots FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Create new admin-only DELETE policy
CREATE POLICY "Admins can delete terrain_slots"
ON terrain_slots FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);
