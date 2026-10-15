/*
  # Fix get_sender_display_names function to use correct phone column
  
  1. Changes
    - Uses m.phone instead of m.mobile_phone for members table
    - All other fields remain the same
  
  2. Return Fields
    - id: User UUID
    - full_name: Display name (coach > member > parent > profile > email)
    - email: Email address (coach > member > parent legal rep > auth user)
    - phone: Phone number (coach > member > parent legal rep)
    - gender: Gender (member gender)
    - role: User role (coach > parent > profile role > member)
*/

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
          WHEN LOWER(REPLACE(m2.legal_rep1_email, 'TST_', '')) = LOWER(REPLACE(au.email, 'TST_', ''))
          THEN m2.legal_rep1_firstname || ' ' || m2.legal_rep1_lastname
          WHEN LOWER(REPLACE(m2.legal_rep2_email, 'TST_', '')) = LOWER(REPLACE(au.email, 'TST_', ''))
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
        WHEN LOWER(REPLACE(m2.legal_rep1_email, 'TST_', '')) = LOWER(REPLACE(au.email, 'TST_', ''))
        THEN m2.legal_rep1_email
        WHEN LOWER(REPLACE(m2.legal_rep2_email, 'TST_', '')) = LOWER(REPLACE(au.email, 'TST_', ''))
        THEN m2.legal_rep2_email
        ELSE NULL
      END,
      au.email
    ) as email,
    COALESCE(
      co.phone,
      m.phone,
      CASE 
        WHEN LOWER(REPLACE(m2.legal_rep1_email, 'TST_', '')) = LOWER(REPLACE(au.email, 'TST_', ''))
        THEN m2.legal_rep1_phone
        WHEN LOWER(REPLACE(m2.legal_rep2_email, 'TST_', '')) = LOWER(REPLACE(au.email, 'TST_', ''))
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
  LEFT JOIN members m ON LOWER(REPLACE(m.email, 'TST_', '')) = LOWER(REPLACE(au.email, 'TST_', ''))
  LEFT JOIN coaches co ON co.user_id = au.id
  LEFT JOIN parent_members pm ON pm.parent_user_id = au.id
  LEFT JOIN members m2 ON m2.id = pm.member_id
  WHERE au.id = ANY(user_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
