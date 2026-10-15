/*
  # Recreate teams table with complete schema

  1. Changes
    - Drop existing teams table (CASCADE to remove dependencies)
    - Create teams table with all required columns:
      - id (UUID primary key)
      - type (junior or active)
      - name (team name)
      - category_id (foreign key to team_categories)
      - coach_id (foreign key to coaches)
      - assistant_coach_id (foreign key to coaches)
      - training_days (text array for multiple days)
      - training_time (training session time)
      - training_location (venue/field location)
      - season (defaults to '2025-2026')
      - active (boolean, defaults to true)
      - created_at (timestamp)

  2. Security
    - Enable RLS on teams table
    - All authenticated users can read teams
    - Only admins can insert, update, or delete teams

  3. Notes
    - CASCADE removes dependent objects (foreign keys, etc.)
    - Type is constrained to 'junior' or 'active'
    - Multiple coaches supported (head coach + assistant)
*/

DROP TABLE IF EXISTS teams CASCADE;

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL CHECK (type IN ('junior', 'active')),
  name TEXT NOT NULL,
  category_id UUID REFERENCES team_categories(id),
  coach_id UUID REFERENCES coaches(id),
  assistant_coach_id UUID REFERENCES coaches(id),
  training_days TEXT[],
  training_time TEXT,
  training_location TEXT,
  season TEXT DEFAULT '2025-2026',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now()
);

-- RLS
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read teams"
ON teams FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins can insert teams"
ON teams FOR INSERT TO authenticated
WITH CHECK (auth.uid() IN (
  SELECT id FROM profiles WHERE role = 'admin'
));

CREATE POLICY "Admins can update teams"
ON teams FOR UPDATE TO authenticated
USING (auth.uid() IN (
  SELECT id FROM profiles WHERE role = 'admin'
));

CREATE POLICY "Admins can delete teams"
ON teams FOR DELETE TO authenticated
USING (auth.uid() IN (
  SELECT id FROM profiles WHERE role = 'admin'
));
