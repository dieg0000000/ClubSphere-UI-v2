/*
  # Fix sender display names function to support parents

  1. Changes
    - Add support for parent users by joining with parent_members table
    - Fetch parent names from legal_rep fields in members table
    - Match parent email with legal_rep1_email or legal_rep2_email
    - Properly identify parent role in the result
    - Maintain existing support for coaches and members

  2. Logic Flow
    - First check if user is a coach (via coaches table)
    - Then check if user is a member (via members table direct match)
    - Then check if user is a parent (via parent_members and legal_rep fields)
    - Fall back to profile full_name
    - Final fallback to email

  3. Security
    - Function uses SECURITY DEFINER to access auth.users table
    - Only returns name and role information, no sensitive data
*/

CREATE OR REPLACE FUNCTION get_sender_display_names(user_ids uuid[])
RETURNS TABLE(id uuid, full_name text, role text) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    au.id,
    COALESCE(
      -- Coach name (from their member record)
      NULLIF(TRIM(co.first_name || ' ' || co.last_name), ''),
      -- Member name (direct match by email)
      NULLIF(TRIM(m.first_name || ' ' || m.last_name), ''),
      -- Parent name (from legal_rep fields of their child)
      NULLIF(TRIM(
        CASE 
          WHEN LOWER(REPLACE(m2.legal_rep1_email, 'TST_', '')) = LOWER(REPLACE(au.email, 'TST_', ''))
          THEN m2.legal_rep1_first_name || ' ' || m2.legal_rep1_last_name
          WHEN LOWER(REPLACE(m2.legal_rep2_email, 'TST_', '')) = LOWER(REPLACE(au.email, 'TST_', ''))
          THEN m2.legal_rep2_first_name || ' ' || m2.legal_rep2_last_name
          ELSE NULL
        END
      ), ''),
      -- Profile full_name
      p.full_name,
      -- Fallback to email
      au.email
    ) as full_name,
    COALESCE(
      CASE WHEN co.id IS NOT NULL THEN 'coach' END,
      CASE WHEN pm.parent_user_id IS NOT NULL THEN 'parent' END,
      CASE WHEN p.role IS NOT NULL THEN p.role END,
      'member'
    ) as role
  FROM auth.users au
  LEFT JOIN profiles p ON p.id = au.id
  LEFT JOIN members m ON LOWER(REPLACE(m.email, 'TST_', '')) = LOWER(REPLACE(au.email, 'TST_', ''))
  LEFT JOIN coaches co ON co.member_id = m.id
  LEFT JOIN parent_members pm ON pm.parent_user_id = au.id
  LEFT JOIN members m2 ON m2.id = pm.member_id
  WHERE au.id = ANY(user_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;