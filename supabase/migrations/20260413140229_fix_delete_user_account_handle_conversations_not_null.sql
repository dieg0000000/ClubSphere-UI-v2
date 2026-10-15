/*
  # Fix delete_user_account: handle conversations.created_by NOT NULL constraint

  conversations.created_by is NOT NULL, so we cannot nullify it.
  Instead we delete conversations created by the user — which cascades to
  conversation_messages, conversation_participants, and messages automatically.

  Order of operations:
  1. Delete conversations created by user (cascades to messages/participants)
  2. Remove user from any remaining conversations as participant
  3. Delete remaining message/attendance ownership rows
  4. Nullify audit references on other tables
  5. Delete the profile
*/

CREATE OR REPLACE FUNCTION delete_user_account(p_user_id uuid)
RETURNS void AS $$
BEGIN
  -- Delete conversations the user created (cascades to conversation_messages, conversation_participants, messages)
  DELETE FROM conversations WHERE created_by = p_user_id;

  -- Remove user from any conversations they participate in but didn't create
  DELETE FROM conversation_participants WHERE user_id = p_user_id;
  DELETE FROM conversation_messages WHERE sender_id = p_user_id;

  -- Other ownership rows
  DELETE FROM parent_members WHERE parent_user_id = p_user_id;
  DELETE FROM event_registrations WHERE user_id = p_user_id;
  DELETE FROM match_attendance WHERE responded_by = p_user_id;
  DELETE FROM messages WHERE sender_id = p_user_id;
  DELETE FROM feedback WHERE user_id = p_user_id;

  -- Nullify audit/author references (all nullable)
  UPDATE attendance_match SET responded_by = NULL WHERE responded_by = p_user_id;
  UPDATE attendance_match SET coach_override_by = NULL WHERE coach_override_by = p_user_id;
  UPDATE camt_imports SET imported_by = NULL WHERE imported_by = p_user_id;
  UPDATE documents SET uploaded_by = NULL WHERE uploaded_by = p_user_id;
  UPDATE matches SET updated_by = NULL WHERE updated_by = p_user_id;
  UPDATE meetings SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE news SET author_id = NULL WHERE author_id = p_user_id;
  UPDATE training_attendance SET responded_by = NULL WHERE responded_by = p_user_id;
  UPDATE training_attendance SET coach_override_by = NULL WHERE coach_override_by = p_user_id;
  UPDATE training_sessions SET validated_by = NULL WHERE validated_by = p_user_id;
  UPDATE training_sessions SET created_by = NULL WHERE created_by = p_user_id;

  -- Delete the profile last
  DELETE FROM profiles WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
