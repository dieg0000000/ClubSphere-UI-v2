/*
  # Extend update_my_profile_photo to sync coaches.avatar_url

  1. Changes
    - `public.update_my_profile_photo(p_photo_url text)` now also updates
      `coaches.avatar_url` for the row where `coaches.user_id = auth.uid()`,
      in addition to its existing sync of `profiles.avatar_url` and
      `members.photo_url` (matched by email).

  2. Security
    - SECURITY DEFINER function, authenticated-only (EXECUTE granted to
      authenticated; revoked from PUBLIC and anon).
    - Each write is scoped to the calling user: profiles by auth.uid(),
      coaches by user_id = auth.uid(), members by lower(email) match.
    - No USING (true) policies introduced.

  3. Notes
    - Length guard on the URL (2000 chars) preserved.
    - Profile update still raises if no row found for the caller.
    - Coaches / members syncs are silent if no matching row exists.
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

  UPDATE public.coaches
     SET avatar_url = p_photo_url
   WHERE user_id = auth.uid();

  RETURN p_photo_url;
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_profile_photo(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_my_profile_photo(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_my_profile_photo(text) TO authenticated;
