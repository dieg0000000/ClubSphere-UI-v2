/*
  # Restrict Coach Conversation Creation Permissions

  1. Problem
    - Coaches can currently create conversations for any team
    - Need to restrict coaches to only create conversations for teams they are assigned to

  2. Solution
    - Update the INSERT policy on conversations table
    - Coaches can only insert conversations where team_id matches their assigned teams
    - Admin roles (admin, president, vice_president, responsable_technique, committee) can still create for any team

  3. Changes
    - Drop and recreate the "Authorized users can create conversations" policy
    - Add check to ensure coaches can only create for their assigned teams
*/

-- Drop the existing INSERT policy
DROP POLICY IF EXISTS "Authorized users can create conversations" ON conversations;

-- Create new INSERT policy with team assignment check for coaches
CREATE POLICY "Authorized users can create conversations"
  ON conversations FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND
    (
      -- Admin roles can create conversations for any team
      EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'president', 'vice_president', 'responsable_technique', 'committee')
      )
      OR
      -- Coaches can only create conversations for teams they are assigned to
      (
        EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid()
          AND p.role IN ('coach', 'assistant_coach')
        )
        AND
        (
          -- Team-based conversations: must be coach or assistant of that team
          (
            team_id IS NOT NULL
            AND
            EXISTS (
              SELECT 1 
              FROM teams t
              INNER JOIN coaches c ON (c.id = t.coach_id OR c.id = t.assistant_coach_id)
              WHERE t.id = conversations.team_id
              AND c.user_id = auth.uid()
            )
          )
          OR
          -- Non-team conversations (club announcements, parent-coach): coaches can create
          team_id IS NULL
        )
      )
    )
  );
