/*
  # Harden update_my_photo RPC

  1. Changes
    - Restrict updates to ONLY the caller's own member row (matched by
      `auth.users.email` = `members.email`, case-insensitive).
    - Remove the `parent_members` branch so a parent cannot overwrite
      their children's photos via this RPC.
    - Add explicit guards for unauthenticated callers and missing email.

  2. Security
    - REVOKE ALL from PUBLIC.
    - REVOKE ALL from anon (Supabase grants EXECUTE to anon by default
      on functions created in public, so this is required).
    - GRANT EXECUTE only to authenticated.
*/

CREATE OR REPLACE FUNCTION public.update_my_photo(p_photo_url text)
RETURNS public.members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member public.members;
  v_email  text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_photo_url IS NOT NULL AND length(p_photo_url) > 2000 THEN
    RAISE EXCEPTION 'photo_url too long';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'No email found for current user';
  END IF;

  UPDATE public.members m
     SET photo_url = p_photo_url
   WHERE lower(m.email) = lower(v_email)
  RETURNING * INTO v_member;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No member row found for current user';
  END IF;

  RETURN v_member;
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_photo(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_my_photo(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_my_photo(text) TO authenticated;
