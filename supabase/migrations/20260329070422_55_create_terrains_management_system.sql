/*
  # Create Terrains Management System

  1. New Tables
    - `terrains`
      - `id` (uuid, primary key)
      - `name` (text) - Name of the terrain/field
      - `location` (text) - Physical location/address
      - `total_space` (integer) - Total space units (e.g., quarters)
      - `active` (boolean) - Whether terrain is active
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `terrain_halves`
      - `id` (uuid, primary key)
      - `terrain_id` (uuid, foreign key to terrains)
      - `name` (text) - Half A, Half B, etc.
      - `space_capacity` (integer) - Space units available on this half
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `terrain_restrictions`
      - `id` (uuid, primary key)
      - `terrain_half_id` (uuid, foreign key to terrain_halves)
      - `day_of_week` (integer) - 1=Monday, 7=Sunday
      - `reason` (text) - Why it's restricted
      - `created_at` (timestamptz)

    - `terrain_slots`
      - `id` (uuid, primary key)
      - `terrain_half_id` (uuid, foreign key to terrain_halves)
      - `team_id` (uuid, foreign key to teams)
      - `day_of_week` (integer) - 1=Monday, 7=Sunday
      - `start_time` (time) - Training start time
      - `end_time` (time) - Training end time
      - `space_used` (integer) - Space units used
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - SELECT: All authenticated users can view
    - INSERT/UPDATE/DELETE: Only admins

  3. Important Notes
    - Space management: Terrains divided into halves, each with capacity
    - Conflict detection done client-side based on overlapping times/space
    - Days stored as integers (1=Monday through 7=Sunday)
*/

-- Create terrains table
CREATE TABLE IF NOT EXISTS terrains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text,
  total_space integer NOT NULL DEFAULT 4,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create terrain_halves table
CREATE TABLE IF NOT EXISTS terrain_halves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  terrain_id uuid NOT NULL REFERENCES terrains(id) ON DELETE CASCADE,
  name text NOT NULL,
  space_capacity integer NOT NULL DEFAULT 2,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create terrain_restrictions table
CREATE TABLE IF NOT EXISTS terrain_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  terrain_half_id uuid NOT NULL REFERENCES terrain_halves(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week >= 1 AND day_of_week <= 7),
  reason text,
  created_at timestamptz DEFAULT now()
);

-- Create terrain_slots table
CREATE TABLE IF NOT EXISTS terrain_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  terrain_half_id uuid NOT NULL REFERENCES terrain_halves(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week >= 1 AND day_of_week <= 7),
  start_time time NOT NULL,
  end_time time NOT NULL,
  space_used integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE terrains ENABLE ROW LEVEL SECURITY;
ALTER TABLE terrain_halves ENABLE ROW LEVEL SECURITY;
ALTER TABLE terrain_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE terrain_slots ENABLE ROW LEVEL SECURITY;

-- Policies for terrains
CREATE POLICY "Authenticated users can view terrains"
  ON terrains FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert terrains"
  ON terrains FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update terrains"
  ON terrains FOR UPDATE
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

CREATE POLICY "Admins can delete terrains"
  ON terrains FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Policies for terrain_halves
CREATE POLICY "Authenticated users can view terrain halves"
  ON terrain_halves FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert terrain halves"
  ON terrain_halves FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update terrain halves"
  ON terrain_halves FOR UPDATE
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

CREATE POLICY "Admins can delete terrain halves"
  ON terrain_halves FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Policies for terrain_restrictions
CREATE POLICY "Authenticated users can view terrain restrictions"
  ON terrain_restrictions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert terrain restrictions"
  ON terrain_restrictions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update terrain restrictions"
  ON terrain_restrictions FOR UPDATE
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

CREATE POLICY "Admins can delete terrain restrictions"
  ON terrain_restrictions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Policies for terrain_slots
CREATE POLICY "Authenticated users can view terrain slots"
  ON terrain_slots FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert terrain slots"
  ON terrain_slots FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update terrain slots"
  ON terrain_slots FOR UPDATE
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

CREATE POLICY "Admins can delete terrain slots"
  ON terrain_slots FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_terrain_halves_terrain_id ON terrain_halves(terrain_id);
CREATE INDEX IF NOT EXISTS idx_terrain_restrictions_terrain_half_id ON terrain_restrictions(terrain_half_id);
CREATE INDEX IF NOT EXISTS idx_terrain_slots_terrain_half_id ON terrain_slots(terrain_half_id);
CREATE INDEX IF NOT EXISTS idx_terrain_slots_team_id ON terrain_slots(team_id);
CREATE INDEX IF NOT EXISTS idx_terrain_slots_day_of_week ON terrain_slots(day_of_week);
