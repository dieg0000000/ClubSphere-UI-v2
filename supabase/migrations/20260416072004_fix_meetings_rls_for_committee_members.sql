/*
  # Fix meetings RLS policies for committee members

  ## Summary
  All meeting-related tables (meetings, meeting_agenda_items, meeting_attendees,
  meeting_decisions, meeting_documents) were restricted to admin-only access.
  Committee members with access to the 'pv_seances' module could not view or edit
  PV séances.

  ## Changes
  - Add SELECT policy for committee members with can_view on 'pv_seances' module
  - Add INSERT policy for committee members with can_edit on 'pv_seances' module
  - Add UPDATE policy for committee members with can_edit on 'pv_seances' module
  - Add DELETE policy for committee members with can_edit on 'pv_seances' module
  - Applied to all 5 tables: meetings, meeting_agenda_items, meeting_attendees,
    meeting_decisions, meeting_documents
*/

-- Helper: is_admin
-- (reused pattern already in codebase)

-- ============================================================
-- meetings
-- ============================================================

CREATE POLICY "Committee can read meetings"
  ON meetings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'pv_seances'
        AND committee_access.can_view = true
    )
  );

CREATE POLICY "Committee can insert meetings"
  ON meetings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'pv_seances'
        AND committee_access.can_edit = true
    )
  );

CREATE POLICY "Committee can update meetings"
  ON meetings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'pv_seances'
        AND committee_access.can_edit = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'pv_seances'
        AND committee_access.can_edit = true
    )
  );

CREATE POLICY "Committee can delete meetings"
  ON meetings FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'pv_seances'
        AND committee_access.can_edit = true
    )
  );

-- ============================================================
-- meeting_agenda_items
-- ============================================================

CREATE POLICY "Committee can read agenda items"
  ON meeting_agenda_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'pv_seances'
        AND committee_access.can_view = true
    )
  );

CREATE POLICY "Committee can insert agenda items"
  ON meeting_agenda_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'pv_seances'
        AND committee_access.can_edit = true
    )
  );

CREATE POLICY "Committee can update agenda items"
  ON meeting_agenda_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'pv_seances'
        AND committee_access.can_edit = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'pv_seances'
        AND committee_access.can_edit = true
    )
  );

CREATE POLICY "Committee can delete agenda items"
  ON meeting_agenda_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'pv_seances'
        AND committee_access.can_edit = true
    )
  );

-- ============================================================
-- meeting_attendees
-- ============================================================

CREATE POLICY "Committee can read attendees"
  ON meeting_attendees FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'pv_seances'
        AND committee_access.can_view = true
    )
  );

CREATE POLICY "Committee can insert attendees"
  ON meeting_attendees FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'pv_seances'
        AND committee_access.can_edit = true
    )
  );

CREATE POLICY "Committee can update attendees"
  ON meeting_attendees FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'pv_seances'
        AND committee_access.can_edit = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'pv_seances'
        AND committee_access.can_edit = true
    )
  );

CREATE POLICY "Committee can delete attendees"
  ON meeting_attendees FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'pv_seances'
        AND committee_access.can_edit = true
    )
  );

-- ============================================================
-- meeting_decisions
-- ============================================================

CREATE POLICY "Committee can read decisions"
  ON meeting_decisions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'pv_seances'
        AND committee_access.can_view = true
    )
  );

CREATE POLICY "Committee can insert decisions"
  ON meeting_decisions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'pv_seances'
        AND committee_access.can_edit = true
    )
  );

CREATE POLICY "Committee can update decisions"
  ON meeting_decisions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'pv_seances'
        AND committee_access.can_edit = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'pv_seances'
        AND committee_access.can_edit = true
    )
  );

CREATE POLICY "Committee can delete decisions"
  ON meeting_decisions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'pv_seances'
        AND committee_access.can_edit = true
    )
  );

-- ============================================================
-- meeting_documents
-- ============================================================

CREATE POLICY "Committee can read meeting documents"
  ON meeting_documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'pv_seances'
        AND committee_access.can_view = true
    )
  );

CREATE POLICY "Committee can insert meeting documents"
  ON meeting_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'pv_seances'
        AND committee_access.can_edit = true
    )
  );

CREATE POLICY "Committee can update meeting documents"
  ON meeting_documents FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'pv_seances'
        AND committee_access.can_edit = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'pv_seances'
        AND committee_access.can_edit = true
    )
  );

CREATE POLICY "Committee can delete meeting documents"
  ON meeting_documents FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
        AND committee_access.module = 'pv_seances'
        AND committee_access.can_edit = true
    )
  );
