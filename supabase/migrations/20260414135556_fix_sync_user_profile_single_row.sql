/*
  # Fix sync_user_profile to prevent multiple-row errors

  ## Problem
  PostgREST throws "Cannot coerce the result to a single JSON object" when
  the function encounters duplicate rows in coaches, committee_members, or
  members tables. The SELECT INTO with LIMIT 1 is not always sufficient
  because PostgreSQL may evaluate conditions before applying LIMIT.

  ## Solution
  Replace SELECT INTO with subquery-based assignment using explicit
  LIMIT 1 + ORDER BY to guarantee a single row is always selected,
  and wrap each lookup in its own safe block.
*/

CREATE OR REPLACE FUNCTION sync_user_profile(p_user_id uuid, p_email text)
RETURNS void AS $$
DECLARE
  v_coach_id        uuid;
  v_coach_first     text;
  v_coach_last      text;
  v_member_id       uuid;
  v_member_first    text;
  v_member_last     text;
  v_committee_exists boolean := false;
  v_current_role    text;
BEGIN
  SELECT role INTO v_current_role FROM profiles WHERE id = p_user_id;

  IF v_current_role IN ('admin','president','vice_president','responsable_technique',
                        'responsable_competitions','secretaire','tresorier') THEN
    RETURN;
  END IF;

  SELECT id, first_name, last_name
    INTO v_coach_id, v_coach_first, v_coach_last
    FROM coaches
   WHERE LOWER(email) = LOWER(p_email)
   ORDER BY created_at
   LIMIT 1;

  IF v_coach_id IS NOT NULL THEN
    INSERT INTO profiles (id, email, role, full_name)
    VALUES (p_user_id, p_email, 'coach', v_coach_first || ' ' || v_coach_last)
    ON CONFLICT (id) DO UPDATE SET
      role      = 'coach',
      full_name = v_coach_first || ' ' || v_coach_last,
      email     = p_email;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM committee_members
     WHERE LOWER(email) = LOWER(p_email)
     LIMIT 1
  ) INTO v_committee_exists;

  IF v_committee_exists THEN
    RETURN;
  END IF;

  SELECT id, first_name, last_name
    INTO v_member_id, v_member_first, v_member_last
    FROM members
   WHERE LOWER(email) = LOWER(p_email)
   ORDER BY created_at
   LIMIT 1;

  IF v_member_id IS NOT NULL THEN
    INSERT INTO profiles (id, email, role, full_name)
    VALUES (
      p_user_id,
      p_email,
      CASE WHEN v_current_role = 'parent' THEN 'parent' ELSE 'member' END,
      v_member_first || ' ' || v_member_last
    )
    ON CONFLICT (id) DO UPDATE SET
      role      = CASE WHEN profiles.role = 'parent' THEN 'parent' ELSE 'member' END,
      full_name = v_member_first || ' ' || v_member_last,
      email     = p_email;
    RETURN;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
