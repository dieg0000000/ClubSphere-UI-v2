/*
  # Add Remaining Messaging Policies

  1. Changes
    - Add UPDATE policy for conversation_participants
    - Add DELETE policy for conversations
    - Create indexes for conversations and conversation_participants

  2. Security
    - Participants: Conversation creator or admins can update participant permissions
    - Conversations: Only creator or admins can delete
*/

-- Add UPDATE policy for conversation_participants
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'conversation_participants' 
    AND policyname = 'Conversation creator can update participants'
  ) THEN
    CREATE POLICY "Conversation creator can update participants"
      ON conversation_participants FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM conversations c
          WHERE c.id = conversation_participants.conversation_id
          AND (
            c.created_by = auth.uid()
            OR
            EXISTS (
              SELECT 1 FROM profiles p
              WHERE p.id = auth.uid()
              AND p.role IN ('admin', 'president', 'vice_president')
            )
          )
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM conversations c
          WHERE c.id = conversation_participants.conversation_id
          AND (
            c.created_by = auth.uid()
            OR
            EXISTS (
              SELECT 1 FROM profiles p
              WHERE p.id = auth.uid()
              AND p.role IN ('admin', 'president', 'vice_president')
            )
          )
        )
      );
  END IF;
END $$;

-- Add DELETE policy for conversations
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'conversations' 
    AND policyname = 'Conversation creator or admins can delete'
  ) THEN
    CREATE POLICY "Conversation creator or admins can delete"
      ON conversations FOR DELETE
      TO authenticated
      USING (
        created_by = auth.uid()
        OR
        EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid()
          AND p.role IN ('admin', 'president', 'vice_president')
        )
      );
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_conversations_team_id ON conversations(team_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_by ON conversations(created_by);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation_id ON conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id ON conversation_participants(user_id);
