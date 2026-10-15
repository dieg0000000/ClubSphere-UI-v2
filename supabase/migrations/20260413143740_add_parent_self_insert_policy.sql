/*
  # Allow parents to insert their own parent_members links during registration

  ## Problem
  The existing INSERT policy on parent_members only allows admins.
  When a new parent registers, they are not yet an admin, so the insert
  is silently blocked by RLS.

  ## Fix
  Add a policy allowing authenticated users to insert a row where
  parent_user_id = auth.uid() (i.e. linking themselves to a child).
*/

CREATE POLICY "Parents can insert own links"
  ON parent_members
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = parent_user_id);
