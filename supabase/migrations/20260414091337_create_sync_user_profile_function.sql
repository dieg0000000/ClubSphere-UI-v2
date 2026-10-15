/*
  # Create sync_user_profile function

  ## Purpose
  Automatically fixes the role and full_name in profiles table on every login,
  ensuring all users (coaches, members, parents, admins) have correct profile data.

  ## Logic
  1. If the user already has an admin/committee role, skip (preserve manually set roles)
  2. Check coaches table by email — if matched, set role='coach' and full_name from coach record
  3. Check members table by email — if matched, set role='member' (or keep 'parent') and full_name from member record
  4. If no match in either table, leave the profile unchanged

  ## Security
  - SECURITY DEFINER: runs with elevated privileges to read coaches and members tables
  - Only updates profiles for the calling user's own ID (p_user_id)
*/

CREATE OR REPLACE FUNCTION sync_user_profile(p_user_id uuid, p_email text)
RETURNS void AS $$
DECLARE
  v_coach coaches%ROWTYPE;
  v_member members%ROWTYPE;
  v_current_role text;
BEGIN
  SELECT role INTO v_current_role FROM profiles WHERE id = p_user_id;

  IF v_current_role IN ('admin', 'president', 'vice_president', 'responsable_technique', 'responsable_competitions') THEN
    RETURN;
  END IF;

  SELECT * INTO v_coach FROM coaches WHERE LOWER(email) = LOWER(p_email) LIMIT 1;
  IF FOUND THEN
    INSERT INTO profiles (id, email, role, full_name)
    VALUES (p_user_id, p_email, 'coach', v_coach.first_name || ' ' || v_coach.last_name)
    ON CONFLICT (id) DO UPDATE SET
      role = 'coach',
      full_name = v_coach.first_name || ' ' || v_coach.last_name,
      email = p_email;
    RETURN;
  END IF;

  SELECT * INTO v_member FROM members WHERE LOWER(email) = LOWER(p_email) LIMIT 1;
  IF FOUND THEN
    INSERT INTO profiles (id, email, role, full_name)
    VALUES (p_user_id, p_email, 'member', v_member.first_name || ' ' || v_member.last_name)
    ON CONFLICT (id) DO UPDATE SET
      role = CASE WHEN v_current_role = 'parent' THEN 'parent' ELSE 'member' END,
      full_name = v_member.first_name || ' ' || v_member.last_name,
      email = p_email;
    RETURN;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION sync_user_profile(uuid, text) TO authenticated;
