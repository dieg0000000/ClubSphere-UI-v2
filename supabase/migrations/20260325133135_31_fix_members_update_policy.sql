/*
  # Fix members table UPDATE policy
  
  1. Changes
    - Drop existing problematic update policy on members table
    - Create new restrictive policy allowing only admins to update members
    - Uses auth.uid() check against profiles table to verify admin role
  
  2. Security
    - Only authenticated users with admin role can update member records
    - Policy checks role from profiles table for secure authorization
*/

DROP POLICY IF EXISTS "update_members" ON members;
DROP POLICY IF EXISTS "Admins can update members" ON members;

CREATE POLICY "Admins can update members"
  ON members FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'admin'
    )
  );
