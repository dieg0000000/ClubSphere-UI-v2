/*
  # Allow admin and committee to read all profiles

  ## Problem
  The Annuaire Supporters tab queries profiles WHERE role = 'supporter', but
  the existing SELECT RLS policy only allows users to read their own row.
  Admin and committee users need to list all profiles to manage the directory.

  ## Change
  - Add a SELECT policy granting admin and committee roles read access to all profiles.
*/

CREATE POLICY "Admin and committee can read all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'committee', 'president', 'vice_president',
                       'responsable_technique', 'responsable_competitions')
    )
  );
