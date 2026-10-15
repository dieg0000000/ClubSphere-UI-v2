/*
  # Remove TST_ prefix handling from all database functions

  1. Summary
    - Removes all TST_ prefix stripping logic from production SQL functions
    - Email matching now uses simple LOWER() comparison without prefix removal
    - Affected functions: get_sender_display_names, get_all_users_admin,
      get_user_ids_by_emails, auto_populate_conversation_participants trigger

  2. Changes
    - get_sender_display_names: LOWER(email) instead of regexp_replace(LOWER(email), '^tst_', '', 'i')
    - get_all_users_admin: LOWER(email) instead of LOWER(REPLACE(email,'TST_',''))
    - get_user_ids_by_emails: LOWER(email) instead of LOWER(REPLACE(email,'TST_',''))
    - auto_populate_conversation_participants: LOWER(email) direct comparison

  3. Security
    - All functions retain SECURITY DEFINER
    - No RLS changes
*/

-- Fix get_sender_display_names
DROP FUNCTION IF EXISTS get_sender_display_names(uuid[]);

CREATE FUNCTION get_sender_display_names(user_ids uuid[])
RETURNS TABLE(id uuid, full_name text, email text, phone text, gender text, role text) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    au.id,
    COALESCE(
      NULLIF(TRIM(co.first_name || ' ' || co.last_name), ''),
      NULLIF(TRIM(m.first_name || ' ' || m.last_name), ''),
      NULLIF(TRIM(
        CASE 
          WHEN LOWER(m2.legal_rep1_email) = LOWER(au.email)
          THEN m2.legal_rep1_firstname || ' ' || m2.legal_rep1_lastname
          WHEN LOWER(m2.legal_rep2_email) = LOWER(au.email)
          THEN m2.legal_rep2_firstname || ' ' || m2.legal_rep2_lastname
          ELSE NULL
        END
      ), ''),
      p.full_name,
      au.email
    ) as full_name,
    COALESCE(
      co.email,
      m.email,
      CASE 
        WHEN LOWER(m2.legal_rep1_email) = LOWER(au.email)
        THEN m2.legal_rep1_email
        WHEN LOWER(m2.legal_rep2_email) = LOWER(au.email)
        THEN m2.legal_rep2_email
        ELSE NULL
      END,
      au.email
    ) as email,
    COALESCE(
      co.phone,
      m.phone,
      CASE 
        WHEN LOWER(m2.legal_rep1_email) = LOWER(au.email)
        THEN m2.legal_rep1_phone
        WHEN LOWER(m2.legal_rep2_email) = LOWER(au.email)
        THEN m2.legal_rep2_phone
        ELSE NULL
      END
    ) as phone,
    COALESCE(m.gender, '') as gender,
    COALESCE(
      CASE WHEN co.id IS NOT NULL THEN 'coach' END,
      CASE WHEN pm.parent_user_id IS NOT NULL THEN 'parent' END,
      CASE WHEN p.role IS NOT NULL THEN p.role END,
      'member'
    ) as role
  FROM auth.users au
  LEFT JOIN profiles p ON p.id = au.id
  LEFT JOIN members m ON LOWER(m.email) = LOWER(au.email)
  LEFT JOIN coaches co ON co.user_id = au.id
  LEFT JOIN parent_members pm ON pm.parent_user_id = au.id
  LEFT JOIN members m2 ON m2.id = pm.member_id
  WHERE au.id = ANY(user_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_sender_display_names(uuid[]) TO authenticated;

-- Fix get_all_users_admin
DROP FUNCTION IF EXISTS get_all_users_admin();

CREATE OR REPLACE FUNCTION get_all_users_admin()
RETURNS TABLE(
  id uuid, 
  email text, 
  role text, 
  full_name text,
  team_name text, 
  last_sign_in_at timestamptz, 
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (au.id)
    au.id,
    au.email::text,
    COALESCE(p.role, 'unknown')::text as role,
    COALESCE(
      NULLIF(TRIM(co.first_name || ' ' || co.last_name), ''),
      NULLIF(TRIM(m.first_name || ' ' || m.last_name), ''),
      NULLIF(TRIM(m2.legal_rep1_firstname || ' ' || m2.legal_rep1_lastname), ''),
      p.full_name,
      au.email
    )::text as full_name,
    COALESCE(t.name, t2.name, '')::text as team_name,
    au.last_sign_in_at,
    au.created_at
  FROM auth.users au
  LEFT JOIN profiles p ON p.id = au.id
  LEFT JOIN members m ON LOWER(m.email) = LOWER(au.email)
  LEFT JOIN coaches co ON co.user_id = au.id
  LEFT JOIN teams t ON t.id = m.team_id
  LEFT JOIN parent_members pm ON pm.parent_user_id = au.id
  LEFT JOIN members m2 ON m2.id = pm.member_id
  LEFT JOIN teams t2 ON t2.id = m2.team_id
  ORDER BY au.id, au.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_all_users_admin() TO authenticated;

-- Fix get_user_ids_by_emails
CREATE OR REPLACE FUNCTION get_user_ids_by_emails(emails text[])
RETURNS TABLE(id uuid, email text) AS $$
BEGIN
  RETURN QUERY
  SELECT au.id, au.email
  FROM auth.users au
  WHERE LOWER(au.email) = ANY(
    SELECT LOWER(e) FROM unnest(emails) e
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_user_ids_by_emails(text[]) TO authenticated;

-- Fix auto_populate_conversation_participants trigger function
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
  
  IF v_team_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  SELECT c.user_id INTO v_coach_user_id
  FROM teams t
  JOIN coaches c ON c.id = t.coach_id
  WHERE t.id = v_team_id;
  
  IF v_coach_user_id IS NOT NULL THEN
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    VALUES (NEW.id, v_coach_user_id, 'coach')
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;
  
  SELECT c.user_id INTO v_assistant_coach_user_id
  FROM teams t
  JOIN coaches c ON c.id = t.assistant_coach_id
  WHERE t.id = v_team_id;
  
  IF v_assistant_coach_user_id IS NOT NULL THEN
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    VALUES (NEW.id, v_assistant_coach_user_id, 'coach')
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;
  
  INSERT INTO conversation_participants (conversation_id, user_id, role)
  SELECT 
    NEW.id,
    p.id,
    'admin'
  FROM profiles p
  WHERE p.role IN ('admin', 'president', 'vice_president', 'responsable_technique')
  ON CONFLICT (conversation_id, user_id) DO NOTHING;
  
  IF v_conversation_type != 'staff_only' THEN
    FOR v_member_record IN 
      SELECT m.id, m.email
      FROM members m
      WHERE m.team_id = v_team_id
        AND m.email IS NOT NULL
        AND m.email != ''
    LOOP
      SELECT au.id INTO v_user_id
      FROM auth.users au
      WHERE LOWER(au.email) = LOWER(v_member_record.email)
      LIMIT 1;
      
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
