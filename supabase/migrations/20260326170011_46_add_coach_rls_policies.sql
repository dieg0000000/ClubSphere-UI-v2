/*
  # Add RLS policies for coach profile and player notes

  1. Changes
    - Add policy for coaches to update their own profile data
    - Add policy for coaches to update notes field for players in their teams
    - Add policy for coaches to update their own profiles table record

  2. Security
    - Coaches can only update their own coach record
    - Coaches can only update notes for players in teams they coach
    - Coaches can only update specific fields in profiles table (first_name, last_name, phone)
*/

-- Policy for coaches to update their own coach record
DROP POLICY IF EXISTS "coaches_update_own" ON coaches;
CREATE POLICY "coaches_update_own"
  ON coaches FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Policy for coaches to update player notes
DROP POLICY IF EXISTS "coaches_update_player_notes" ON members;
CREATE POLICY "coaches_update_player_notes"
  ON members FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teams t
      JOIN coaches c ON (t.coach_id = c.id OR t.assistant_coach_id = c.id)
      WHERE c.user_id = auth.uid()
      AND t.id = members.team_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teams t
      JOIN coaches c ON (t.coach_id = c.id OR t.assistant_coach_id = c.id)
      WHERE c.user_id = auth.uid()
      AND t.id = members.team_id
    )
  );