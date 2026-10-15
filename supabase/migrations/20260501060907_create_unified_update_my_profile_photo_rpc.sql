/*
  # Unified profile photo RPC

  1. Changes
    - New `public.update_my_profile_photo(p_photo_url text)` replaces the
      previous `update_my_photo(text)` function.
    - Always writes to `profiles.avatar_url` for the current auth user.
    - Additionally syncs `members.photo_url` when a member row exists
      with the same email as the authenticated user (case-insensitive).
    - Parents / supporters (no member row) succeed via the profiles
      update; the members update is simply a no-op for them.
    - Drops the superseded `update_my_photo(text)` function.

  2. Security
    - SECURITY DEFINER with fixed search_path.
    - REVOKE ALL from PUBLIC and from anon; GRANT EXECUTE to authenticated
      only.
*/

CREATE OR REPLACE FUNCTION public.update_my_profile_photo(p_photo_url text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_photo_url IS NOT NULL AND length(p_photo_url) > 2000 THEN
    RAISE EXCEPTION 'photo_url too long';
  END IF;

  UPDATE public.profiles
     SET avatar_url = p_photo_url,
         updated_at = NOW()
   WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No profile found for current user';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  IF v_email IS NOT NULL THEN
    UPDATE public.members
       SET photo_url = p_photo_url
     WHERE lower(email) = lower(v_email);
  END IF;

  RETURN p_photo_url;
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_profile_photo(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_my_profile_photo(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_my_profile_photo(text) TO authenticated;

DROP FUNCTION IF EXISTS public.update_my_photo(text);
