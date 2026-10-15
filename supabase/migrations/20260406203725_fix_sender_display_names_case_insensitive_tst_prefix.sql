/*
  # Fix get_sender_display_names to handle case-insensitive TST_ prefix
  
  1. Changes
    - Makes the TST_ prefix removal case-insensitive by converting to lowercase first
    - This ensures parent emails like 'tst_email@example.com' match 'TST_email@example.com'
    - Uses regex replace for case-insensitive matching
  
  2. Fix Applied
    - Changes REPLACE(email, 'TST_', '') to regexp_replace(LOWER(email), '^tst_', '', 'i')
    - This handles both 'TST_' and 'tst_' prefixes correctly
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
