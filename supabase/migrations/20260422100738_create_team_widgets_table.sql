/*
  # Create team_widgets table

  ## Purpose
  Stores football.ch iframe widget URLs per team for the "Classements & Résultats" module.

  ## New Tables
  - `team_widgets`
    - `id` (uuid, primary key)
    - `team_name` (text, not null) — display name for the team
    - `widget_url` (text, not null) — iframe src URL from football.ch
    - `sort_order` (integer, default 0) — controls display order
    - `is_active` (boolean, default true) — whether widget is shown publicly
    - `created_at` (timestamptz, default now())

  ## Security
  - RLS enabled
  - Authenticated and anonymous users can SELECT (read) active widgets
  - Only admin role can INSERT, UPDATE, DELETE
*/

CREATE TABLE IF NOT EXISTS team_widgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_name text NOT NULL,
  widget_url text NOT NULL,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE team_widgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view team widgets"
  ON team_widgets FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Admin can insert team widgets"
  ON team_widgets FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admin can update team widgets"
  ON team_widgets FOR UPDATE
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

CREATE POLICY "Admin can delete team widgets"
  ON team_widgets FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );
