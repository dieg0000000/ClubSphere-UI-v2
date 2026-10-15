/*
  # Restore get_sender_display_names function

  1. Changes
    - Restore the working version of get_sender_display_names function
    - This function retrieves display names and roles for messaging participants
    - Fixes issue where the function was accidentally broken in a previous migration
  
  2. Function Logic
    - Takes an array of user IDs
    - Returns id, full_name, and role for each user
    - Priority for full_name: coach name > member name > parent legal rep name > profile name > email
    - Priority for role: coach > parent > profile role > member
    - Handles TST_ email prefix matching
    - Uses SECURITY DEFINER to access auth.users table
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
      NULLIF(TRIM(
        CASE 
          WHEN LOWER(REPLACE(m2.legal_rep1_email, 'TST_', '')) = LOWER(REPLACE(au.email, 'TST_', ''))
          THEN m2.legal_rep1_first_name || ' ' || m2.legal_rep1_last_name
          WHEN LOWER(REPLACE(m2.legal_rep2_email, 'TST_', '')) = LOWER(REPLACE(au.email, 'TST_', ''))
          THEN m2.legal_rep2_first_name || ' ' || m2.legal_rep2_last_name
          ELSE NULL
        END
      ), ''),
      p.full_name,
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