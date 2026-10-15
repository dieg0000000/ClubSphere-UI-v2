/*
  # Fix sync_user_profile to never overwrite existing profiles

  ## Problem
  The function was overwriting role, full_name, and implicitly onboarding_completed
  for any user whose email matched a coach or member record, even if the profile
  already existed with a valid role (e.g. 'supporter').

  ## Changes
  - Add 'supporter' and 'committee' to the early-exit safe-role list so those
    profiles are never touched
  - Coach UPSERT: on conflict, only update email — never touch role, full_name,
    or onboarding_completed
  - Member UPSERT: same — on conflict, only update email
  - New profiles (INSERT path) still get role and full_name set correctly
*/

CREATE OR REPLACE FUNCTION public.sync_user_profile(p_user_id uuid, p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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

  -- If this profile already has a known role, leave it completely alone
  IF v_current_role IN (
    'admin','president','vice_president','responsable_technique',
    'responsable_competitions','secretaire','tresorier',
    'supporter','committee','coach','assistant_coach','parent','member'
  ) THEN
    RETURN;
  END IF;

  SELECT id, first_name, last_name
  INTO v_coach_id, v_coach_first, v_coach_last
  FROM coaches
  WHERE LOWER(email) = LOWER(p_email)
  ORDER BY created_at
  LIMIT 1;

  IF v_coach_id IS NOT NULL THEN
    INSERT INTO profiles (id, email, role, full_name, onboarding_completed)
    VALUES (p_user_id, p_email, 'coach', v_coach_first || ' ' || v_coach_last, true)
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email;
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
    INSERT INTO profiles (id, email, role, full_name, onboarding_completed)
    VALUES (
      p_user_id,
      p_email,
      CASE WHEN v_current_role = 'parent' THEN 'parent' ELSE 'member' END,
      v_member_first || ' ' || v_member_last,
      false
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email;
    RETURN;
  END IF;
END;
$function$;
