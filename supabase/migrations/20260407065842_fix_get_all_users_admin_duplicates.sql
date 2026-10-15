/*
  # Fix duplicate users in get_all_users_admin function

  1. Problem
    - The JOIN returns duplicates when a user matches both members and parent_members tables
    - This causes users to appear multiple times in the admin users list

  2. Solution
    - Use DISTINCT ON (au.id) to deduplicate results based on user ID
    - Order by au.id and au.created_at to ensure consistent results
    - Each user will only appear once in the results

  3. Changes
    - Drop existing function
    - Create new function with DISTINCT ON clause
    - Grant execute permission to authenticated users
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
  LEFT JOIN members m ON LOWER(REPLACE(m.email,'TST_','')) = LOWER(REPLACE(au.email,'TST_',''))
  LEFT JOIN coaches co ON co.user_id = au.id
  LEFT JOIN teams t ON t.id = m.team_id
  LEFT JOIN parent_members pm ON pm.parent_user_id = au.id
  LEFT JOIN members m2 ON m2.id = pm.member_id
  LEFT JOIN teams t2 ON t2.id = m2.team_id
  ORDER BY au.id, au.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_all_users_admin() TO authenticated;
