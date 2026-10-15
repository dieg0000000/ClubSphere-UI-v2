/*
  # Drop auto_populate_conversation_participants trigger and function

  1. Changes
    - Drop trigger `trigger_auto_populate_conversation_participants` on
      `public.conversations`.
    - Drop function `public.auto_populate_conversation_participants()`.

  2. Rationale
    - The client (src/pages/Messages.tsx handleCreateConversation) is now the
      single source of truth for the initial participants list when creating
      a conversation. The server-side trigger and the client-side insert both
      wrote overlapping rows into `conversation_participants`, which caused
      duplicate-key violations on the `(conversation_id, user_id)` unique
      constraint.

  3. Security
    - No policy changes. No schema changes. No data changes.
    - Removing the trigger does not weaken access control; RLS on
      `conversation_participants` remains unchanged.

  4. Notes
    - Idempotent: `DROP ... IF EXISTS` so re-running is safe.
*/

DROP TRIGGER IF EXISTS trigger_auto_populate_conversation_participants
  ON public.conversations;

DROP FUNCTION IF EXISTS public.auto_populate_conversation_participants();
