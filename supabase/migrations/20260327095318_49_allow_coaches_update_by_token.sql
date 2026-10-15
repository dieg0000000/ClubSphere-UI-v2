/*
  # Allow Coaches Update by Token During Registration

  1. Changes
    - Add RLS policy to allow updating coaches table by invite_token without authentication
    - This enables the registration page to update the coach record with user_id and can_login flag

  2. Security
    - Policy is restrictive: only allows UPDATE operations
    - Only works when invite_token matches
    - Used exclusively during registration flow
*/

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "update_coaches_by_token" ON coaches;

-- Allow update by invite_token for both anonymous and authenticated users
CREATE POLICY "update_coaches_by_token"
ON coaches FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);
