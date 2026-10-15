/*
  # Update sync_user_profile to handle committee members

  ## Changes
  - Extended the sync_user_profile function to check committee_members table
  - After checking coaches and members, now also checks committee_members by email
  - If matched in committee_members, sets role to their committee role and full_name
  - This fixes login for users created via "Créer un accès" who are linked to committee_members

  ## Logic Order
  1. Skip if already admin/president/vice_president/responsable role
  2. Check coaches table → set role='coach'
  3. Check members table → set role='member' (or keep 'parent')
  4. Check committee_members table → set role=committee role
  5. If no match anywhere: leave profile unchanged (Login.tsx will apply 'member' fallback)
*/

CREATE OR REPLACE FUNCTION sync_user_profile(p_user_id uuid, p_email text)
RETURNS void AS $$
DECLARE
  v_coach coaches%ROWTYPE;
  v_member members%ROWTYPE;
  v_current_role text;
  v_committee_role text;
  v_committee_first_name text;
  v_committee_last_name text;
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

  SELECT role, first_name, last_name
  INTO v_committee_role, v_committee_first_name, v_committee_last_name
  FROM committee_members
  WHERE LOWER(email) = LOWER(p_email)
  LIMIT 1;

  IF FOUND THEN
    INSERT INTO profiles (id, email, role, full_name)
    VALUES (
      p_user_id,
      p_email,
      COALESCE(NULLIF(v_committee_role, ''), 'committee'),
      TRIM(COALESCE(v_committee_first_name, '') || ' ' || COALESCE(v_committee_last_name, ''))
    )
    ON CONFLICT (id) DO UPDATE SET
      role = COALESCE(NULLIF(v_committee_role, ''), 'committee'),
      full_name = TRIM(COALESCE(v_committee_first_name, '') || ' ' || COALESCE(v_committee_last_name, '')),
      email = p_email;
    RETURN;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION sync_user_profile(uuid, text) TO authenticated;
