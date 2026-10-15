/*
  # Create get_user_ids_by_emails Function
  
  1. Purpose
    - Maps email addresses to auth.users IDs
    - Handles TST_ prefix stripping for test accounts
    - Used for automatically adding team members to conversations
  
  2. Security
    - SECURITY DEFINER allows function to access auth.users table
    - Only returns user IDs and emails, no sensitive data
*/

CREATE OR REPLACE FUNCTION get_user_ids_by_emails(emails text[])
RETURNS TABLE(id uuid, email text) AS $$
BEGIN
  RETURN QUERY
  SELECT au.id, au.email
  FROM auth.users au
  WHERE LOWER(REPLACE(au.email, 'TST_', '')) = ANY(
    SELECT LOWER(REPLACE(e, 'TST_', '')) FROM unnest(emails) e
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;