/*
  # Allow authenticated users to read any profile by email

  ## Problem
  The existing SELECT policy on `profiles` only allows users to read their own
  profile (`auth.uid() = id`). This blocks admin/committee lookups that need to
  find another user's profile by email (e.g., loading access config in
  AdminAnuaireClub).

  ## Change
  - Add a new SELECT policy that permits any authenticated user to read any
    profile row. The existing owner-only policy is kept alongside it.

  ## Security note
  Profiles contain display names, roles, and contact info that are already
  visible to authenticated club members through other parts of the app. Allowing
  any authenticated user to SELECT profiles is consistent with that exposure.
*/

CREATE POLICY "authenticated can read profiles by email"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (true);
