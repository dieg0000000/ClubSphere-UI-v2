/*
  # Broaden parent_members SELECT policies

  1. Problem
    - `canCreateConversation` on the client allows admin, coach, and committee roles
      to create conversations for a team.
    - The conversation creation flow reads `parent_members` to auto-add parents as
      participants.
    - Current `parent_members` SELECT policies cover only:
        * admins (profiles.role = 'admin')
        * the coach of THAT team (via teams.coach_id / assistant_coach_id)
        * the parent themselves
    - Committee members, and coaches creating a conversation for a team other
      than their own (rare but possible via admin UI), get an empty set, so no
      parent rows are added as participants.

  2. Changes
    - Add SELECT policy for committee members (profiles.role = 'committee').
    - Add SELECT policy for any authenticated coach (i.e. any user that has
      an entry in the coaches table). Creating conversations is already a
      privileged action; letting coaches see parent links across teams is
      consistent with their ability to create cross-team conversations from
      the admin UI.

  3. Security
    - Policies stay RESTRICTIVE: only authenticated users with a specific role
      or a coaches row can SELECT.
    - No change to INSERT/UPDATE/DELETE policies.
    - Idempotent: guarded by IF NOT EXISTS via DROP/CREATE pattern.
*/

DROP POLICY IF EXISTS "Committee can view all parent links"
  ON public.parent_members;

CREATE POLICY "Committee can view all parent links"
  ON public.parent_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'committee'
    )
  );

DROP POLICY IF EXISTS "Any coach can view parent links"
  ON public.parent_members;

CREATE POLICY "Any coach can view parent links"
  ON public.parent_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM coaches c
      WHERE c.user_id = auth.uid()
    )
  );
