/*
  # Add can_login field to coaches table

  1. Changes
    - Add `can_login` column to coaches table
      - Boolean field with default value false
      - Controls whether a coach can access the application

  2. Notes
    - This field allows admins to enable/disable login access for coaches
    - When false, coaches cannot log in even if they have a user account
    - Used in conjunction with user_id to manage application access
*/

ALTER TABLE coaches 
ADD COLUMN IF NOT EXISTS can_login BOOLEAN DEFAULT false;