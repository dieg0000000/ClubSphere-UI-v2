/*
  # Fix delete_user_account function

  Replaces the existing function with a version that cleans up all related
  data before deletion can proceed. The auth.users deletion itself is handled
  by the Edge Function using the service role key.

  Tables cleaned up:
  - parent_members (parent_user_id)
  - conversation_participants (user_id)
  - match_attendance (responded_by)
  - messages (sender_id)
  - profiles (id)
*/

CREATE OR REPLACE FUNCTION delete_user_account(p_user_id uuid)
RETURNS void AS $$
BEGIN
  DELETE FROM parent_members WHERE parent_user_id = p_user_id;
  DELETE FROM conversation_participants WHERE user_id = p_user_id;
  DELETE FROM match_attendance WHERE responded_by = p_user_id;
  DELETE FROM messages WHERE sender_id = p_user_id;
  DELETE FROM profiles WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
