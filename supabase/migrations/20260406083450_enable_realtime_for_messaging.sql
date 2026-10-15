/*
  # Enable Real-time for Messaging System

  1. Purpose
    - Enable real-time subscriptions for the messaging system
    - Allow instant message delivery without page refresh
    - Support real-time conversation list updates

  2. Changes
    - Add conversation_messages table to supabase_realtime publication
    - Add conversations table to supabase_realtime publication
    - Add conversation_participants table to supabase_realtime publication

  3. Security
    - Real-time publications respect existing RLS policies
    - No additional security configuration needed
*/

-- Enable real-time for conversation messages
ALTER PUBLICATION supabase_realtime ADD TABLE conversation_messages;

-- Enable real-time for conversations
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;

-- Enable real-time for conversation participants
ALTER PUBLICATION supabase_realtime ADD TABLE conversation_participants;
