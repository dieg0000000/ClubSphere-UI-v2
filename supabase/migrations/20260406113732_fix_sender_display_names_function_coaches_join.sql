/*
  # Fix get_sender_display_names Function - Coaches Join
  
  Corrects the function to properly join coaches table using user_id instead of member_id.
  The coaches table has:
  - user_id (not member_id)
  - email, first_name, last_name directly in the table
  
  This ensures proper name resolution for coaches sending messages.
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
  LEFT JOIN coaches co ON co.user_id = au.id
  LEFT JOIN members m ON LOWER(REPLACE(m.email, 'TST_', '')) = LOWER(REPLACE(au.email, 'TST_', ''))
  WHERE au.id = ANY(user_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;