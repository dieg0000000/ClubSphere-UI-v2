/*
  # Fix Trigger to Use Correct Column Name
  
  1. Change
    - Use NEW.type instead of NEW.conversation_type
    - Column in conversations table is named 'type', not 'conversation_type'
*/

CREATE OR REPLACE FUNCTION auto_populate_conversation_participants()
RETURNS TRIGGER AS $$
DECLARE
  v_team_id uuid;
  v_conversation_type text;
  v_member_record RECORD;
  v_user_id uuid;
  v_coach_user_id uuid;
  v_assistant_coach_user_id uuid;
BEGIN
  v_team_id := NEW.team_id;
  v_conversation_type := NEW.type;
  
  -- If no team_id, nothing to auto-populate
  IF v_team_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Step 1: Add the head coach if exists
  SELECT c.user_id INTO v_coach_user_id
  FROM teams t
  JOIN coaches c ON c.id = t.coach_id
  WHERE t.id = v_team_id;
  
  IF v_coach_user_id IS NOT NULL THEN
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    VALUES (NEW.id, v_coach_user_id, 'coach')
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;
  
  -- Step 2: Add the assistant coach if exists
  SELECT c.user_id INTO v_assistant_coach_user_id
  FROM teams t
  JOIN coaches c ON c.id = t.assistant_coach_id
  WHERE t.id = v_team_id;
  
  IF v_assistant_coach_user_id IS NOT NULL THEN
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    VALUES (NEW.id, v_assistant_coach_user_id, 'coach')
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;
  
  -- Step 3: Add all admins/committee members
  INSERT INTO conversation_participants (conversation_id, user_id, role)
  SELECT 
    NEW.id,
    p.id,
    'admin'
  FROM profiles p
  WHERE p.role IN ('admin', 'president', 'vice_president', 'responsable_technique')
  ON CONFLICT (conversation_id, user_id) DO NOTHING;
  
  -- Step 4: Add team members (players) ONLY if not staff_only
  IF v_conversation_type != 'staff_only' THEN
    -- Loop through all members of the team and find their auth user IDs
    FOR v_member_record IN 
      SELECT m.id, m.email
      FROM members m
      WHERE m.team_id = v_team_id
        AND m.email IS NOT NULL
        AND m.email != ''
    LOOP
      -- Find the auth user by email (handling TST_ prefix)
      SELECT au.id INTO v_user_id
      FROM auth.users au
      WHERE LOWER(REPLACE(au.email, 'TST_', '')) = LOWER(REPLACE(v_member_record.email, 'TST_', ''))
      LIMIT 1;
      
      -- If we found a matching user, add them as a participant
      IF v_user_id IS NOT NULL THEN
        INSERT INTO conversation_participants (conversation_id, user_id, role)
        VALUES (NEW.id, v_user_id, 'member')
        ON CONFLICT (conversation_id, user_id) DO NOTHING;
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
DROP TRIGGER IF EXISTS trigger_auto_populate_conversation_participants ON conversations;

CREATE TRIGGER trigger_auto_populate_conversation_participants
  AFTER INSERT ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION auto_populate_conversation_participants();