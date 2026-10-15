/*
  # Fix get_all_users_admin: correct legal_rep column names

  The members table uses legal_rep1_firstname / legal_rep1_lastname (no underscore
  between first and name). Updated the function accordingly.
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
  SELECT DISTINCT ON (au.id)
    au.id,
    au.email::text,
    COALESCE(p.role, 'unknown')::text AS role,
    COALESCE(
      NULLIF(TRIM(co.first_name || ' ' || co.last_name), ''),
      NULLIF(TRIM(m.first_name || ' ' || m.last_name), ''),
      NULLIF(TRIM(m2.legal_rep1_firstname || ' ' || m2.legal_rep1_lastname), ''),
      p.full_name,
      au.email
    )::text AS full_name,
    COALESCE(
      t_coach.name,
      t_member.name,
      t_parent.name,
      ''
    )::text AS team_name,
    au.last_sign_in_at,
    au.created_at
  FROM auth.users au
  LEFT JOIN profiles p ON p.id = au.id
  LEFT JOIN coaches co ON LOWER(co.email) = LOWER(au.email)
  LEFT JOIN teams t_coach ON t_coach.coach_id = co.id OR t_coach.assistant_coach_id = co.id
  LEFT JOIN members m ON LOWER(m.email) = LOWER(au.email)
  LEFT JOIN teams t_member ON t_member.id = m.team_id
  LEFT JOIN parent_members pm ON pm.parent_user_id = au.id
  LEFT JOIN members m2 ON m2.id = pm.member_id
  LEFT JOIN teams t_parent ON t_parent.id = m2.team_id
  ORDER BY au.id, au.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_all_users_admin() TO authenticated;
