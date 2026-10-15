/*
  # Secure member photo update via SECURITY DEFINER RPC

  1. New Function
    - `public.update_my_photo(p_photo_url text)` returns the updated `members` row.
    - Runs as SECURITY DEFINER with a pinned `search_path = public`.
    - Validates that `photo_url` is either NULL or at most 2000 characters.
    - Updates only rows the authenticated user owns:
        - members where `email` matches the caller's auth email, OR
        - members linked via `parent_members` to the caller's `auth.uid()`.
    - Raises an exception when no row is found.

  2. Security
    - Revokes execution from PUBLIC.
    - Grants EXECUTE to the `authenticated` role only.

  3. Notes
    - `members` table has no `updated_at` column, so it is not set.
    - `members` has no direct `user_id` column; ownership is derived from
      `email` (players) and `parent_members` (parents).
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
  IF p_photo_url IS NOT NULL AND length(p_photo_url) > 2000 THEN
    RAISE EXCEPTION 'photo_url trop longue';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  UPDATE public.members m
     SET photo_url = p_photo_url
   WHERE (
           (v_email IS NOT NULL AND lower(m.email) = lower(v_email))
           OR m.id IN (
             SELECT pm.member_id
               FROM public.parent_members pm
              WHERE pm.parent_user_id = auth.uid()
           )
         )
  RETURNING * INTO v_member;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aucun membre trouvé pour cet utilisateur';
  END IF;

  RETURN v_member;
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_photo(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_my_photo(text) TO authenticated;
