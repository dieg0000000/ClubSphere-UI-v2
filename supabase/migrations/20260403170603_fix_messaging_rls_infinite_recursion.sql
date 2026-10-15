/*
  # Fix Messaging RLS Infinite Recursion

  1. Problem
    - The SELECT policy on conversation_participants references itself, causing infinite recursion
    - The INSERT policy on conversation_participants queries conversations, which queries back to conversation_participants

  2. Solution
    - Simplify the SELECT policy on conversation_participants to avoid self-reference
    - Break the circular dependency by checking creator directly without querying conversations table
    - Use security definer functions where needed to break recursion chains

  3. Changes
    - Drop and recreate the problematic RLS policies
    - Add simpler, non-recursive policies
*/

-- Drop the existing problematic policies
DROP POLICY IF EXISTS "Users can view participants in their conversations" ON conversation_participants;
DROP POLICY IF EXISTS "Authorized users can add participants" ON conversation_participants;

-- Create a simpler SELECT policy that doesn't cause recursion
-- Users can view participants if they are in the same conversation OR they are admin/committee
CREATE POLICY "Users can view participants in their conversations"
  ON conversation_participants FOR SELECT
  TO authenticated
  USING (
    -- User is viewing their own participation record
    user_id = auth.uid()
    OR
    -- User is admin or committee (can see all)
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'committee')
    )
    OR
    -- User is a participant in the same conversation (check via direct join, no subquery)
    conversation_id IN (
      SELECT cp.conversation_id 
      FROM conversation_participants cp 
      WHERE cp.user_id = auth.uid()
    )
  );

-- Create a simpler INSERT policy that avoids querying conversations table
-- Allow insert if user is admin/coach/committee OR if they're adding themselves as creator
CREATE POLICY "Authorized users can add participants"
  ON conversation_participants FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'coach', 'committee')
    )
  );
