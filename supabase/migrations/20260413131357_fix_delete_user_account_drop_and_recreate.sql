/*
  # Fix delete_user_account function - drop and recreate

  Drops the existing function and recreates it with the parameter renamed from
  `user_id` to `p_user_id` to resolve the ambiguous column reference error
  when deleting from conversation_participants.
*/

DROP FUNCTION IF EXISTS delete_user_account(uuid);

CREATE FUNCTION delete_user_account(p_user_id uuid)
RETURNS void AS $$
BEGIN
  DELETE FROM parent_members WHERE parent_user_id = p_user_id;
  DELETE FROM conversation_participants WHERE user_id = p_user_id;
  DELETE FROM match_attendance WHERE responded_by = p_user_id;
  DELETE FROM profiles WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
