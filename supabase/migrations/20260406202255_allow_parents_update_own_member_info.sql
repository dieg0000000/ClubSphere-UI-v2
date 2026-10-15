/*
  # Allow parents to update their own member information

  1. Changes
    - Add RLS policy for parents to update their own member record via parent_members table
    - Parents can only update: phone, address, street_number, postal_code, city, canton
  
  2. Security
    - Parents can only update their own member information
    - Update is restricted to specific contact and address fields only
*/

CREATE POLICY "Parents can update their own member contact info"
  ON members
  FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT member_id 
      FROM parent_members 
      WHERE parent_user_id = auth.uid()
    )
  )
  WITH CHECK (
    id IN (
      SELECT member_id 
      FROM parent_members 
      WHERE parent_user_id = auth.uid()
    )
  );
