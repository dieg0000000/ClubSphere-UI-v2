/*
  # Add policy for viewing volunteer registrations

  1. Changes
    - Add policy allowing all authenticated users to view volunteer registrations
    - This enables the volunteer detail page to display volunteer lists to all users
  
  2. Security
    - Authenticated users can SELECT registrations where is_volunteer = true
    - This is safe as volunteer information is meant to be visible to all club members
*/

-- All authenticated users can view volunteer registrations
CREATE POLICY "Users can view volunteer registrations"
  ON event_registrations FOR SELECT
  TO authenticated
  USING (is_volunteer = true);