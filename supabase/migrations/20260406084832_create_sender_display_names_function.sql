/*
  # Create sender display names function

  1. New Functions
    - `get_sender_display_names(uuid[])` - Returns display names and roles for message senders
      - Checks coaches table first (first_name + last_name from linked member)
      - Falls back to members table (first_name + last_name)
      - Falls back to profiles table (full_name)
      - Final fallback to auth.users email
      - Returns role: 'coach' for coaches, profile role for others, 'member' as default

  2. Security
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
      NULLIF(TRIM(co.first_name || ' ' || co.last_name), ''),
      NULLIF(TRIM(m.first_name || ' ' || m.last_name), ''),
      p.full_name,
      au.email
    ) as full_name,
    COALESCE(
      CASE WHEN co.id IS NOT NULL THEN 'coach' END,
      CASE WHEN p.role IS NOT NULL THEN p.role END,
      'member'
    ) as role
  FROM auth.users au
  LEFT JOIN profiles p ON p.id = au.id
  LEFT JOIN members m ON LOWER(REPLACE(m.email, 'TST_', '')) = LOWER(REPLACE(au.email, 'TST_', ''))
  LEFT JOIN coaches co ON co.member_id = m.id
  WHERE au.id = ANY(user_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;