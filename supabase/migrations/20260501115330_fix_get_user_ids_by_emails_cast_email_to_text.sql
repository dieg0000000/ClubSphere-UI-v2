/*
  # Fix get_user_ids_by_emails return type mismatch

  1. Problem
    - RPC `public.get_user_ids_by_emails(text[])` declares return column
      `email text` but selects `auth.users.email` which is
      `character varying(255)`. PostgreSQL raises 42804
      ("Returned type character varying(255) does not match expected
      type text in column 2"), causing every call to fail.
    - Failure was silent in Messages.tsx (only logged to console), so
      team_full conversations never included member participants.

  2. Changes
    - Recreate `public.get_user_ids_by_emails(text[])` with
      `au.email::text` cast so the returned type matches the declared
      signature.
    - Keep SECURITY DEFINER (function reads from `auth.users`).
    - Reaffirm least-privilege grants: REVOKE from PUBLIC and anon,
      GRANT EXECUTE to authenticated only.

  3. Behavior
    - Unchanged: case-insensitive match via `LOWER(au.email)`.
    - Unchanged: one row per matching auth user.
*/

CREATE OR REPLACE FUNCTION public.get_user_ids_by_emails(emails text[])
RETURNS TABLE (id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN QUERY
  SELECT au.id, au.email::text
  FROM auth.users au
  WHERE LOWER(au.email) = ANY (
    SELECT LOWER(e) FROM unnest(emails) e
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_ids_by_emails(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_ids_by_emails(text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_ids_by_emails(text[]) TO authenticated;
