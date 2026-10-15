/*
  # Fix get_all_users_admin function - correct coaches join
  
  1. Changes
    - Fixes JOIN for coaches table to use user_id instead of member_id
    - Coaches are joined on au.id = co.user_id
  
  2. Security
    - Function uses SECURITY DEFINER to access auth.users
    - Granted to authenticated users
*/

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
  LEFT JOIN coaches co ON co.user_id = au.id
  LEFT JOIN teams t ON t.id = m.team_id
  LEFT JOIN parent_members pm ON pm.parent_user_id = au.id
  LEFT JOIN members m2 ON m2.id = pm.member_id
  LEFT JOIN teams t2 ON t2.id = m2.team_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_all_users_admin() TO authenticated;
