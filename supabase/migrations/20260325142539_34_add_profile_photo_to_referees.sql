/*
  # Add Profile Photo to Referees

  1. Changes
    - Add profile_photo_url column to referees table
    - Allows storing referee profile pictures

  2. Security
    - No changes to RLS policies
*/

-- Add profile_photo_url column to referees table
ALTER TABLE referees 
ADD COLUMN IF NOT EXISTS profile_photo_url text;
