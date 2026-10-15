/*
  # Recreate Messages Table for Conversation System

  1. Problem
    - The existing messages table uses sender_id/receiver_id (direct messaging)
    - Need conversation-based messaging with conversation_id

  2. Changes
    - Drop the old messages table
    - Create new messages table with:
      - conversation_id (references conversations)
      - sender_id (references profiles)
      - body (message content)
      - read_by (array tracking who read)
      - created_at (timestamp)
    
  3. Security
    - Enable RLS
    - Add policies for SELECT, INSERT, UPDATE, DELETE
*/

-- Drop the old messages table and its policies
DROP TABLE IF EXISTS messages CASCADE;

-- Create new messages table for conversation system
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz DEFAULT now(),
  read_by uuid[] DEFAULT '{}'
);

-- Enable RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- SELECT: Users can view messages in conversations they're participants of
CREATE POLICY "Users can view messages in their conversations"
  ON messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
      AND cp.user_id = auth.uid()
    )
  );

-- INSERT: Users can send messages if they're participants with write permission
CREATE POLICY "Participants can send messages"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
      AND cp.user_id = auth.uid()
      AND cp.can_write = true
    )
  );

-- UPDATE: Users can update messages for read tracking
CREATE POLICY "Users can update messages for read tracking"
  ON messages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
      AND cp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
      AND cp.user_id = auth.uid()
    )
  );

-- DELETE: Only message sender or admins can delete messages
CREATE POLICY "Sender or admins can delete messages"
  ON messages FOR DELETE
  TO authenticated
  USING (
    sender_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'president', 'vice_president')
    )
  );

-- Create indexes for better performance
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
