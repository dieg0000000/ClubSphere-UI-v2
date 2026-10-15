/*
  # Scope coach access to parent_members to their own teams only

  1. Problem
    - Previous migration added `"Any coach can view parent links"` which let
      any user with a row in `coaches` SELECT every row in `parent_members`.
    - Per domain rules, coaches must only see parent links for members of
      the teams they coach (as head or assistant).

  2. Changes
    - Drop the over-permissive `"Any coach can view parent links"` policy.
    - Drop the legacy equivalent `"Coaches can view parent links for their
      team members"` so we consolidate on a single, clearly named policy.
    - Create `"coaches_can_view_parent_links_of_their_teams"` that joins
      parent_members -> members -> teams -> coaches and checks the current
      user is the head or assistant coach of the member's team.

  3. Unchanged
    - `"Admins can view all parent links"` (admin governance visibility)
    - `"Committee can view all parent links"` (committee governance visibility)
    - `"Parents can view own children links"` (own-data access)
    - All INSERT / UPDATE / DELETE policies.

  4. Security
    - Scoped USING clause: coach must have c.user_id = auth.uid() AND be
      linked to the member's team via teams.coach_id or teams.assistant_coach_id.
    - Authenticated role only. No WITH CHECK (SELECT-only policy).
*/

DROP POLICY IF EXISTS "Any coach can view parent links"
  ON public.parent_members;

DROP POLICY IF EXISTS "Coaches can view parent links for their team members"
  ON public.parent_members;

DROP POLICY IF EXISTS "coaches_can_view_parent_links_of_their_teams"
  ON public.parent_members;

CREATE POLICY "coaches_can_view_parent_links_of_their_teams"
  ON public.parent_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.members m
      JOIN public.teams t ON t.id = m.team_id
      JOIN public.coaches c ON (
        c.user_id = auth.uid()
        AND (t.coach_id = c.id OR t.assistant_coach_id = c.id)
      )
      WHERE m.id = parent_members.member_id
    )
  );
