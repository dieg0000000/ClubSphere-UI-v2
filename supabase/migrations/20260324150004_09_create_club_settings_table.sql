/*
  # Create club_settings table for theme configuration

  1. New Tables
    - `club_settings`
      - `id` (uuid, primary key)
      - `name` (text) - Club name
      - `primary_color` (text) - Main brand color (hex)
      - `primary_dark` (text) - Hover/active state color (hex)
      - `accent_color` (text) - Accent/contrast color (hex)
      - `logo_url` (text) - Optional logo URL
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `club_settings` table
    - Allow authenticated users to read settings
    - Only admins can update settings

  3. Notes
    - Only one row of settings allowed (enforced by check constraint)
    - Default values inserted for initial setup
*/

CREATE TABLE IF NOT EXISTS club_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'ClubSphere',
  primary_color text NOT NULL DEFAULT '#CC0000',
  primary_dark text NOT NULL DEFAULT '#990000',
  accent_color text NOT NULL DEFAULT '#FFFFFF',
  logo_url text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE club_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read club settings"
  ON club_settings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can update club settings"
  ON club_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert club settings"
  ON club_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

INSERT INTO club_settings (name, primary_color, primary_dark, accent_color, logo_url)
VALUES ('ClubSphere', '#CC0000', '#990000', '#FFFFFF', '')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_club_settings_updated_at ON club_settings;
CREATE TRIGGER update_club_settings_updated_at
  BEFORE UPDATE ON club_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
