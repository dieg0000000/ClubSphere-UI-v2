-- Allow anon + authenticated to read club_settings by club_id
-- This is needed so the login page / theme can load before authentication
CREATE POLICY "public_read_club_settings"
  ON club_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);
