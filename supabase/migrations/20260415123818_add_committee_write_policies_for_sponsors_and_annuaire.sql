/*
  # Add write policies for committee members on sponsors, committee_members, supporters, referees

  Committee members with can_edit=true on their respective modules should be able
  to insert, update, and delete records in those tables.

  This migration adds policies that check committee_access for the current user.
*/

CREATE POLICY "Committee editors can insert sponsors"
  ON sponsors FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'sponsors'
        AND committee_access.can_edit = true
    )
  );

CREATE POLICY "Committee editors can update sponsors"
  ON sponsors FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'sponsors'
        AND committee_access.can_edit = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'sponsors'
        AND committee_access.can_edit = true
    )
  );

CREATE POLICY "Committee editors can delete sponsors"
  ON sponsors FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'sponsors'
        AND committee_access.can_edit = true
    )
  );

CREATE POLICY "Committee editors can insert committee_members"
  ON committee_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'annuaire'
        AND committee_access.can_edit = true
    )
  );

CREATE POLICY "Committee editors can update committee_members"
  ON committee_members FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'annuaire'
        AND committee_access.can_edit = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'annuaire'
        AND committee_access.can_edit = true
    )
  );

CREATE POLICY "Committee editors can delete committee_members"
  ON committee_members FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'annuaire'
        AND committee_access.can_edit = true
    )
  );

CREATE POLICY "Committee editors can insert supporters"
  ON supporters FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'annuaire'
        AND committee_access.can_edit = true
    )
  );

CREATE POLICY "Committee editors can update supporters"
  ON supporters FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'annuaire'
        AND committee_access.can_edit = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'annuaire'
        AND committee_access.can_edit = true
    )
  );

CREATE POLICY "Committee editors can delete supporters"
  ON supporters FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'annuaire'
        AND committee_access.can_edit = true
    )
  );

CREATE POLICY "Committee editors can insert referees"
  ON referees FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'annuaire'
        AND committee_access.can_edit = true
    )
  );

CREATE POLICY "Committee editors can update referees"
  ON referees FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'annuaire'
        AND committee_access.can_edit = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'annuaire'
        AND committee_access.can_edit = true
    )
  );

CREATE POLICY "Committee editors can delete referees"
  ON referees FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'annuaire'
        AND committee_access.can_edit = true
    )
  );
