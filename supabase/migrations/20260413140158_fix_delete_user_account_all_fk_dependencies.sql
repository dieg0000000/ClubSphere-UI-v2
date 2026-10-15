/*
  # Fix delete_user_account to handle all FK dependencies

  The previous version missed many tables that have foreign keys referencing
  profiles.id. This update nullifies or deletes all related rows before
  deleting the profile, preventing FK constraint violations.

  Tables handled:
  - attendance_match (responded_by, coach_override_by -> SET NULL)
  - camt_imports (imported_by -> SET NULL)
  - conversation_messages (sender_id -> DELETE rows)
  - conversation_participants (user_id -> DELETE rows)
  - conversations (created_by -> SET NULL)
  - documents (uploaded_by -> SET NULL)
  - event_registrations (user_id -> DELETE rows)
  - feedback (user_id -> DELETE rows)
  - match_attendance (responded_by -> DELETE rows)
  - matches (updated_by -> SET NULL)
  - meetings (created_by -> SET NULL)
  - messages (sender_id -> DELETE rows)
  - news (author_id -> SET NULL)
  - parent_members (parent_user_id -> DELETE rows)
  - training_attendance (responded_by, coach_override_by -> SET NULL)
  - training_sessions (validated_by, created_by -> SET NULL)
  - profiles (id -> DELETE row)
*/

CREATE OR REPLACE FUNCTION delete_user_account(p_user_id uuid)
RETURNS void AS $$
BEGIN
  -- Hard deletes (ownership rows)
  DELETE FROM parent_members WHERE parent_user_id = p_user_id;
  DELETE FROM conversation_participants WHERE user_id = p_user_id;
  DELETE FROM conversation_messages WHERE sender_id = p_user_id;
  DELETE FROM event_registrations WHERE user_id = p_user_id;
  DELETE FROM match_attendance WHERE responded_by = p_user_id;
  DELETE FROM messages WHERE sender_id = p_user_id;

  DELETE FROM feedback WHERE user_id = p_user_id;

  -- Nullify audit/author references
  UPDATE attendance_match SET responded_by = NULL WHERE responded_by = p_user_id;
  UPDATE attendance_match SET coach_override_by = NULL WHERE coach_override_by = p_user_id;
  UPDATE camt_imports SET imported_by = NULL WHERE imported_by = p_user_id;
  UPDATE conversations SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE documents SET uploaded_by = NULL WHERE uploaded_by = p_user_id;
  UPDATE matches SET updated_by = NULL WHERE updated_by = p_user_id;
  UPDATE meetings SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE news SET author_id = NULL WHERE author_id = p_user_id;
  UPDATE training_attendance SET responded_by = NULL WHERE responded_by = p_user_id;
  UPDATE training_attendance SET coach_override_by = NULL WHERE coach_override_by = p_user_id;
  UPDATE training_sessions SET validated_by = NULL WHERE validated_by = p_user_id;
  UPDATE training_sessions SET created_by = NULL WHERE created_by = p_user_id;

  -- Finally delete the profile
  DELETE FROM profiles WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
