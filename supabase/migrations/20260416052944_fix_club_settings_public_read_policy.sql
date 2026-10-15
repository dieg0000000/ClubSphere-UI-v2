/*
  # Fix club_settings public read access

  Ensures unauthenticated (anon) users can read club_settings so the login
  page can display the club logo and name before a user is signed in.

  1. Re-enables RLS (idempotent)
  2. Drops any conflicting SELECT policies
  3. Creates a single clean public-read policy for anon + authenticated
*/

ALTER TABLE club_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read club settings" ON club_settings;
DROP POLICY IF EXISTS "public can read club settings" ON club_settings;

CREATE POLICY "public can read club settings"
  ON club_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);
