/*
  # Create Teams and Categories System

  1. New Tables
    - `team_categories`
      - `id` (uuid, primary key)
      - `type` (text, 'junior' or 'active')
      - `name` (text)
      - `display_order` (int)
      - `active` (boolean)
      - `created_at` (timestamp)
    
    - `teams`
      - `id` (uuid, primary key)
      - `type` (text, 'junior' or 'active')
      - `name` (text)
      - `category_id` (uuid, references team_categories)
      - `coach1_first_name` (text)
      - `coach1_last_name` (text)
      - `coach1_email` (text)
      - `coach1_phone` (text)
      - `coach2_first_name` (text, optional)
      - `coach2_last_name` (text, optional)
      - `coach2_email` (text, optional)
      - `coach2_phone` (text, optional)
      - `training_days` (text array)
      - `training_time` (text)
      - `training_location` (text)
      - `season` (text)
      - `active` (boolean)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - All authenticated users can SELECT
    - Only admins can INSERT, UPDATE, DELETE

  3. Data
    - Seed default junior categories (10 categories)
    - Seed default active categories (6 categories)
*/

-- Create team_categories table
CREATE TABLE IF NOT EXISTS team_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('junior', 'active')),
  name text NOT NULL,
  display_order int DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create teams table
CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('junior', 'active')),
  name text NOT NULL,
  category_id uuid REFERENCES team_categories(id) ON DELETE RESTRICT,
  coach1_first_name text NOT NULL,
  coach1_last_name text NOT NULL,
  coach1_email text NOT NULL,
  coach1_phone text NOT NULL,
  coach2_first_name text,
  coach2_last_name text,
  coach2_email text,
  coach2_phone text,
  training_days text[],
  training_time text,
  training_location text,
  season text DEFAULT '2025-2026',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE team_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

-- RLS Policies for team_categories
CREATE POLICY "All authenticated users can view categories"
  ON team_categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert categories"
  ON team_categories FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update categories"
  ON team_categories FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete categories"
  ON team_categories FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- RLS Policies for teams
CREATE POLICY "All authenticated users can view teams"
  ON teams FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert teams"
  ON teams FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update teams"
  ON teams FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete teams"
  ON teams FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Seed junior categories
INSERT INTO team_categories (type, name, display_order) VALUES
  ('junior', 'Youth League A', 1),
  ('junior', '1er degré', 2),
  ('junior', '2e degré', 3),
  ('junior', 'Youth League', 4),
  ('junior', 'D-9 (à 9)', 5),
  ('junior', 'D-7 (à 7)', 6),
  ('junior', 'Football Enfants Catégorie FF-11 (Brack.ch play more football)', 7),
  ('junior', 'FF-14 (9v9 ou 7v7)', 8),
  ('junior', 'FF-17', 9),
  ('junior', 'ACVF +4', 10);

-- Seed active categories
INSERT INTO team_categories (type, name, display_order) VALUES
  ('active', '3ème ligue', 1),
  ('active', '4ème ligue', 2),
  ('active', '5ème ligue', 3),
  ('active', 'Seniors +30', 4),
  ('active', 'Seniors +40', 5),
  ('active', 'Seniors +50', 6);