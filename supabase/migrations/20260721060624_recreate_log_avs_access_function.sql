/*
# Recreate log_avs_access RPC function and avs_access_log table

1. Tables (create if not exists)
   - `avs_access_log`
     - `id` (uuid, primary key)
     - `user_id` (uuid, the authenticated user who revealed the AVS)
     - `member_id` (uuid, the member whose AVS was revealed)
     - `action` (text, e.g. 'AVS_REVEAL')
     - `context` (text, e.g. 'annuaire_joueurs')
     - `created_at` (timestamptz)

2. Functions
   - Drops and recreates `log_avs_access(p_member_id uuid, p_action text, p_context text)`

3. Security
   - RLS enabled on avs_access_log
   - Authenticated users can INSERT (their own user_id auto-set)
   - SELECT blocked for regular authenticated users (admin audit only via service role)
*/

CREATE TABLE IF NOT EXISTS avs_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id uuid NOT NULL,
  action text NOT NULL,
  context text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE avs_access_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert_own_avs_access_log" ON avs_access_log;
CREATE POLICY "insert_own_avs_access_log" ON avs_access_log FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "select_avs_access_log_none" ON avs_access_log;
CREATE POLICY "select_avs_access_log_none" ON avs_access_log FOR SELECT
  TO authenticated USING (false);

DROP FUNCTION IF EXISTS log_avs_access(uuid, text, text);

CREATE FUNCTION log_avs_access(p_member_id uuid, p_action text, p_context text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO avs_access_log (user_id, member_id, action, context)
  VALUES (auth.uid(), p_member_id, p_action, p_context);
END;
$$;
