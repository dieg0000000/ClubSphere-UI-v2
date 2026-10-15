/*
  # Fix event_registrations RLS policies

  1. Changes
    - Drop all existing policies on event_registrations
    - Create simplified policies that allow all authenticated users to read volunteer registrations
    - Allow users to insert and delete their own registrations
    - Allow admins to delete any registration
  
  2. Security
    - All authenticated users can SELECT any registration (needed for volunteer lists)
    - Users can only INSERT their own registrations
    - Users can only DELETE their own registrations
    - Admins can DELETE any registration
*/

-- Drop all existing policies on event_registrations
DROP POLICY IF EXISTS "Admins can delete any registration" ON event_registrations;
DROP POLICY IF EXISTS "Admins can view all registrations" ON event_registrations;
DROP POLICY IF EXISTS "Users can create own registrations" ON event_registrations;
DROP POLICY IF EXISTS "Users can delete own registrations" ON event_registrations;
DROP POLICY IF EXISTS "Users can register for events" ON event_registrations;
DROP POLICY IF EXISTS "Users can view own registrations" ON event_registrations;
DROP POLICY IF EXISTS "Users can view registrations for their events" ON event_registrations;
DROP POLICY IF EXISTS "Users can view volunteer registrations" ON event_registrations;

-- Allow authenticated users to read all volunteer registrations
CREATE POLICY "Read volunteer registrations"
  ON event_registrations FOR SELECT
  TO authenticated
  USING (true);

-- Allow users to insert own registration
CREATE POLICY "Insert own registration"
  ON event_registrations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow users to delete own, admin delete all
CREATE POLICY "Delete registrations"
  ON event_registrations FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id OR 
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );