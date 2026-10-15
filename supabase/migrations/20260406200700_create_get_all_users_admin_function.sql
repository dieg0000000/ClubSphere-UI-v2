/*
  # Create admin function to fetch all users

  1. New Functions
    - `get_all_users_admin()` - Returns all users from auth.users with their associated data
      - Fetches from auth.users table (requires SECURITY DEFINER)
      - Joins with profiles for role and full_name
      - Joins with members table for member info (matching by email)
      - Joins with coaches table for coach info
      - Joins with teams for member/coach team associations
      - Joins with parent_members for parent-child relationships
      - Returns parent team via their child's team assignment
      - Handles TST_ email prefix matching
      - Returns comprehensive user data for admin management

  2. Return Fields
    - id: User UUID from auth.users
    - email: User email from auth.users
    - role: User role from profiles (or 'unknown' if not set)
    - full_name: Prioritized name from multiple sources
    - team_name: Associated team name (member team, coach team, or parent's child team)
    - last_sign_in_at: Last sign-in timestamp
    - created_at: Account creation timestamp

  3. Security
    - Function uses SECURITY DEFINER to access auth.users table
    - Granted to authenticated users (admin check happens in frontend)
    - Only returns non-sensitive user information
*/

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
    au.email,
    COALESCE(p.role, 'unknown') as role,
    COALESCE(
      p.full_name,
      NULLIF(TRIM(co.first_name || ' ' || co.last_name), ''),
      NULLIF(TRIM(m.first_name || ' ' || m.last_name), ''),
      NULLIF(TRIM(
        CASE 
          WHEN LOWER(REPLACE(m2.legal_rep1_email, 'TST_', '')) = LOWER(REPLACE(au.email, 'TST_', ''))
          THEN m2.legal_rep1_first_name || ' ' || m2.legal_rep1_last_name
          WHEN LOWER(REPLACE(m2.legal_rep2_email, 'TST_', '')) = LOWER(REPLACE(au.email, 'TST_', ''))
          THEN m2.legal_rep2_first_name || ' ' || m2.legal_rep2_last_name
          ELSE NULL
        END
      ), ''),
      au.email
    ) as full_name,
    COALESCE(t.name, t2.name, '') as team_name,
    au.last_sign_in_at,
    au.created_at
  FROM auth.users au
  LEFT JOIN profiles p ON p.id = au.id
  LEFT JOIN members m ON LOWER(REPLACE(m.email, 'TST_', '')) = LOWER(REPLACE(au.email, 'TST_', ''))
  LEFT JOIN coaches co ON co.member_id = m.id
  LEFT JOIN teams t ON t.id = m.team_id
  LEFT JOIN parent_members pm ON pm.parent_user_id = au.id
  LEFT JOIN members m2 ON m2.id = pm.member_id
  LEFT JOIN teams t2 ON t2.id = m2.team_id
  ORDER BY au.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution permission to authenticated users
GRANT EXECUTE ON FUNCTION get_all_users_admin() TO authenticated;