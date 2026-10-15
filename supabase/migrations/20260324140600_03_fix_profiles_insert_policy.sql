/*
  # Fix profiles INSERT policy

  1. Changes
    - Add INSERT policy to allow users to create their own profile during signup
    
  2. Security
    - Users can only insert their own profile (auth.uid() = id)
    - This is necessary for the signup flow to work properly
*/

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);
