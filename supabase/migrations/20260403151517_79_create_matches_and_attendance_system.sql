/*
  # Create Matches and Attendance System

  1. New Tables
    - `venues`
      - `id` (uuid, primary key)
      - `name` (text)
      - `address` (text, nullable)
      - `city` (text, nullable)
      - `gps_lat` (numeric, nullable)
      - `gps_lng` (numeric, nullable)
      - `google_maps_url` (text, nullable)
    
    - `matches`
      - `id` (uuid, primary key)
      - `team_id` (uuid, foreign key to teams)
      - `season_id` (uuid, nullable, foreign key to seasons)
      - `match_date` (date)
      - `match_time` (time, nullable)
      - `opponent_name` (text)
      - `opponent_club_id` (uuid, nullable)
      - `venue_id` (uuid, nullable, foreign key to venues)
      - `is_home` (boolean)
      - `status` (text: scheduled/cancelled/postponed)
      - `postponed_to` (date, nullable)
      - `cancellation_reason` (text, nullable)
      - `imported_from_csv` (boolean)
      - `csv_row_ref` (text, nullable)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `updated_by` (uuid, nullable, foreign key to profiles)
    
    - `attendance_match`
      - `id` (uuid, primary key)
      - `match_id` (uuid, foreign key to matches)
      - `member_id` (uuid, foreign key to members)
      - `notified_at` (timestamptz, nullable)
      - `responded_at` (timestamptz, nullable)
      - `responded_by` (uuid, nullable, foreign key to profiles)
      - `status` (text)
      - `absence_reason` (text, nullable)
      - `coach_override_at` (timestamptz, nullable)
      - `coach_override_by` (uuid, nullable, foreign key to profiles)

  2. Updates to training_attendance
    - Add notification workflow columns
    
  3. Security
    - Enable RLS on all tables
    - Add policies for authenticated users based on role
*/

-- Create venues table
CREATE TABLE IF NOT EXISTS venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  city text,
  gps_lat numeric,
  gps_lng numeric,
  google_maps_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

-- Create matches table
CREATE TABLE IF NOT EXISTS matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  season_id uuid REFERENCES seasons(id) ON DELETE SET NULL,
  match_date date NOT NULL,
  match_time time,
  opponent_name text NOT NULL,
  opponent_club_id uuid,
  venue_id uuid REFERENCES venues(id) ON DELETE SET NULL,
  is_home boolean DEFAULT true,
  status text DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled', 'postponed')),
  postponed_to date,
  cancellation_reason text,
  imported_from_csv boolean DEFAULT false,
  csv_row_ref text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

-- Create attendance_match table
CREATE TABLE IF NOT EXISTS attendance_match (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  notified_at timestamptz,
  responded_at timestamptz,
  responded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'absent_justified', 'absent_unjustified', 'convoqué', 'non_convoqué', 'present_real', 'absent_real', 'match_annulé', 'match_reporté')),
  absence_reason text,
  coach_override_at timestamptz,
  coach_override_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(match_id, member_id)
);

ALTER TABLE attendance_match ENABLE ROW LEVEL SECURITY;

-- Add columns to training_attendance if not exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_attendance' AND column_name = 'notified_at'
  ) THEN
    ALTER TABLE training_attendance ADD COLUMN notified_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_attendance' AND column_name = 'responded_at'
  ) THEN
    ALTER TABLE training_attendance ADD COLUMN responded_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_attendance' AND column_name = 'responded_by'
  ) THEN
    ALTER TABLE training_attendance ADD COLUMN responded_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_attendance' AND column_name = 'status'
  ) THEN
    ALTER TABLE training_attendance ADD COLUMN status text DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'absent_justified', 'absent_unjustified', 'present_real', 'absent_real'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_attendance' AND column_name = 'absence_reason'
  ) THEN
    ALTER TABLE training_attendance ADD COLUMN absence_reason text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_attendance' AND column_name = 'coach_override_at'
  ) THEN
    ALTER TABLE training_attendance ADD COLUMN coach_override_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_attendance' AND column_name = 'coach_override_by'
  ) THEN
    ALTER TABLE training_attendance ADD COLUMN coach_override_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_matches_team_id ON matches(team_id);
CREATE INDEX IF NOT EXISTS idx_matches_season_id ON matches(season_id);
CREATE INDEX IF NOT EXISTS idx_matches_match_date ON matches(match_date);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_attendance_match_match_id ON attendance_match(match_id);
CREATE INDEX IF NOT EXISTS idx_attendance_match_member_id ON attendance_match(member_id);
CREATE INDEX IF NOT EXISTS idx_attendance_match_status ON attendance_match(status);

-- RLS Policies for venues
CREATE POLICY "Everyone can view venues"
  ON venues FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert venues"
  ON venues FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'committee')
    )
  );

CREATE POLICY "Admins can update venues"
  ON venues FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'committee')
    )
  );

-- RLS Policies for matches
CREATE POLICY "Everyone can view matches"
  ON matches FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authorized users can insert matches"
  ON matches FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'coach', 'committee')
    )
  );

CREATE POLICY "Authorized users can update matches"
  ON matches FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'committee')
    )
    OR
    EXISTS (
      SELECT 1 FROM coaches c
      JOIN teams t ON (t.coach_id = c.id OR t.assistant_coach_id = c.id)
      WHERE c.user_id = auth.uid()
      AND t.id = matches.team_id
    )
  );

CREATE POLICY "Authorized users can delete matches"
  ON matches FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  );

-- RLS Policies for attendance_match
CREATE POLICY "Users can view match attendance"
  ON attendance_match FOR SELECT
  TO authenticated
  USING (
    member_id IN (
      SELECT m.id FROM members m WHERE m.id = (
        SELECT mm.id FROM members mm WHERE mm.avs_number IN (
          SELECT mp.avs_number FROM members mp
          JOIN profiles pp ON pp.id = auth.uid()
        )
      )
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'coach', 'committee')
    )
    OR
    EXISTS (
      SELECT 1 FROM coaches c
      JOIN matches m ON m.team_id IN (
        SELECT t.id FROM teams t WHERE t.coach_id = c.id OR t.assistant_coach_id = c.id
      )
      WHERE c.user_id = auth.uid()
      AND m.id = attendance_match.match_id
    )
  );

CREATE POLICY "Coaches can insert match attendance"
  ON attendance_match FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'coach', 'committee')
    )
  );

CREATE POLICY "Authorized users can update match attendance"
  ON attendance_match FOR UPDATE
  TO authenticated
  USING (
    member_id IN (
      SELECT m.id FROM members m WHERE m.id = (
        SELECT mm.id FROM members mm WHERE mm.avs_number IN (
          SELECT mp.avs_number FROM members mp
          JOIN profiles pp ON pp.id = auth.uid()
        )
      )
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'coach', 'committee')
    )
    OR
    EXISTS (
      SELECT 1 FROM coaches c
      JOIN matches m ON m.team_id IN (
        SELECT t.id FROM teams t WHERE t.coach_id = c.id OR t.assistant_coach_id = c.id
      )
      WHERE c.user_id = auth.uid()
      AND m.id = attendance_match.match_id
    )
  );