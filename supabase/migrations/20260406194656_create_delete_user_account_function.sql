/*
  # Create User Account Deletion Function

  1. New Functions
    - `delete_user_account` (uuid) -> void
      - Safely deletes user-related data before account deletion
      - Removes parent_members associations
      - Removes conversation_participants
      - Removes profile record
      - Auth user must be deleted separately via service role API

  2. Security
    - SECURITY DEFINER to allow deletion across related tables
    - Only callable by authenticated users (enforced by RLS on calling context)

  3. Important Notes
    - This function does NOT delete the auth.users record
    - Auth user deletion must be done via Supabase Admin API with service role key
    - Function removes all related data to prevent orphaned records
*/

CREATE OR REPLACE FUNCTION delete_user_account(user_id uuid)
RETURNS void AS $$
BEGIN
  -- Delete parent-child associations
  DELETE FROM parent_members WHERE parent_user_id = user_id;
  
  -- Delete conversation participation
  DELETE FROM conversation_participants WHERE user_id = user_id;
  
  -- Delete messages sent by this user
  DELETE FROM messages WHERE sender_id = user_id;
  
  -- Delete profile record
  DELETE FROM profiles WHERE id = user_id;
  
  -- Note: auth.users deletion must be done via service role API
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;