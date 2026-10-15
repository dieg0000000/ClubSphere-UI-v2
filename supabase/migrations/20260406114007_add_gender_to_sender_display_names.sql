/*
  # Add Gender Support to get_sender_display_names Function
  
  Updates the function to return gender information for members so the UI can display:
  - Female members → 'Joueuse' badge
  - Male members → 'Joueur' badge
  
  The function now returns a composite role that includes gender when applicable:
  - 'coach' → stays 'coach'
  - 'admin' → stays 'admin'
  - 'member' + female gender → 'joueuse'
  - 'member' + male gender → 'joueur'
  - 'member' + no gender → 'member'
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
      CASE 
        WHEN m.gender = 'female' THEN 'joueuse'
        WHEN m.gender = 'male' THEN 'joueur'
        ELSE 'member'
      END
    ) as role
  FROM auth.users au
  LEFT JOIN profiles p ON p.id = au.id
  LEFT JOIN coaches co ON co.user_id = au.id
  LEFT JOIN members m ON LOWER(REPLACE(m.email, 'TST_', '')) = LOWER(REPLACE(au.email, 'TST_', ''))
  WHERE au.id = ANY(user_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;