/*
  # Create Auto-Populate Conversation Participants Function
  
  1. Purpose
    - Automatically adds participants when a conversation is created
    - For team conversations: adds team members + coaches + admins
    - For staff_only conversations: adds coaches + admins only
  
  2. Participants Added
    - Team members (players) - via members table linked by team_id
    - Coaches - via team_members junction table where is_coach = true
    - Admins/Committee - via profiles table with admin roles
  
  3. Security
    - Uses SECURITY DEFINER to access auth.users
    - Only adds participants, doesn't modify conversation data
*/

CREATE OR REPLACE FUNCTION auto_populate_conversation_participants()
RETURNS TRIGGER AS $$
DECLARE
  v_team_id uuid;
  v_conversation_type text;
  v_member_record RECORD;
  v_user_id uuid;
BEGIN
  v_team_id := NEW.team_id;
  v_conversation_type := NEW.conversation_type;
  
  -- If no team_id, nothing to auto-populate
  IF v_team_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Step 1: Add all coaches of the team
  INSERT INTO conversation_participants (conversation_id, user_id, role)
  SELECT 
    NEW.id,
    tm.member_id,
    'coach'
  FROM team_members tm
  WHERE tm.team_id = v_team_id 
    AND tm.is_coach = true
  ON CONFLICT (conversation_id, user_id) DO NOTHING;
  
  -- Step 2: Add all admins/committee members
  INSERT INTO conversation_participants (conversation_id, user_id, role)
  SELECT 
    NEW.id,
    p.id,
    'admin'
  FROM profiles p
  WHERE p.role IN ('admin', 'president', 'vice_president', 'responsable_technique')
  ON CONFLICT (conversation_id, user_id) DO NOTHING;
  
  -- Step 3: Add team members (players) ONLY if not staff_only
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

-- Drop the trigger if it exists
DROP TRIGGER IF EXISTS trigger_auto_populate_conversation_participants ON conversations;

-- Create the trigger
CREATE TRIGGER trigger_auto_populate_conversation_participants
  AFTER INSERT ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION auto_populate_conversation_participants();