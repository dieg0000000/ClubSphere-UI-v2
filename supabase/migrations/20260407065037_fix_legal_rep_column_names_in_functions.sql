/*
  # Fix legal representative column names in database functions
  
  1. Changes
    - Updates get_sender_display_names to use correct column names:
      - Uses legal_rep1_firstname (not legal_rep1_first_name)
      - Uses legal_rep1_lastname (not legal_rep1_last_name)
      - Same for legal_rep2
    - Recreates get_all_users_admin with correct column names
  
  2. Security
    - Both functions use SECURITY DEFINER to access auth.users
    - Granted to authenticated users
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
          WHEN regexp_replace(LOWER(m2.legal_rep1_email), '^tst_', '', 'i') = regexp_replace(LOWER(au.email), '^tst_', '', 'i')
          THEN m2.legal_rep1_firstname || ' ' || m2.legal_rep1_lastname
          WHEN regexp_replace(LOWER(m2.legal_rep2_email), '^tst_', '', 'i') = regexp_replace(LOWER(au.email), '^tst_', '', 'i')
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
        WHEN regexp_replace(LOWER(m2.legal_rep1_email), '^tst_', '', 'i') = regexp_replace(LOWER(au.email), '^tst_', '', 'i')
        THEN m2.legal_rep1_email
        WHEN regexp_replace(LOWER(m2.legal_rep2_email), '^tst_', '', 'i') = regexp_replace(LOWER(au.email), '^tst_', '', 'i')
        THEN m2.legal_rep2_email
        ELSE NULL
      END,
      au.email
    ) as email,
    COALESCE(
      co.phone,
      m.phone,
      CASE 
        WHEN regexp_replace(LOWER(m2.legal_rep1_email), '^tst_', '', 'i') = regexp_replace(LOWER(au.email), '^tst_', '', 'i')
        THEN m2.legal_rep1_phone
        WHEN regexp_replace(LOWER(m2.legal_rep2_email), '^tst_', '', 'i') = regexp_replace(LOWER(au.email), '^tst_', '', 'i')
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
  LEFT JOIN members m ON regexp_replace(LOWER(m.email), '^tst_', '', 'i') = regexp_replace(LOWER(au.email), '^tst_', '', 'i')
  LEFT JOIN coaches co ON co.user_id = au.id
  LEFT JOIN parent_members pm ON pm.parent_user_id = au.id
  LEFT JOIN members m2 ON m2.id = pm.member_id
  WHERE au.id = ANY(user_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate get_all_users_admin
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
  SELECT 
    au.id,
    au.email::text,
    COALESCE(p.role, 'unknown')::text as role,
    COALESCE(
      co.first_name || ' ' || co.last_name,
      m.first_name || ' ' || m.last_name,
      m2.legal_rep1_firstname || ' ' || m2.legal_rep1_lastname,
      p.full_name,
      au.email
    )::text as full_name,
    COALESCE(t.name, t2.name, '')::text as team_name,
    au.last_sign_in_at,
    au.created_at
  FROM auth.users au
  LEFT JOIN profiles p ON p.id = au.id
  LEFT JOIN members m ON LOWER(REPLACE(m.email,'TST_','')) = LOWER(REPLACE(au.email,'TST_',''))
  LEFT JOIN coaches co ON co.member_id = m.id
  LEFT JOIN teams t ON t.id = m.team_id
  LEFT JOIN parent_members pm ON pm.parent_user_id = au.id
  LEFT JOIN members m2 ON m2.id = pm.member_id
  LEFT JOIN teams t2 ON t2.id = m2.team_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_all_users_admin() TO authenticated;
