/*
  # Create Training Attendance System

  1. New Tables
    - `training_sessions`
      - `id` (uuid, primary key)
      - `team_id` (uuid, references teams)
      - `session_date` (date) - Training session date
      - `slot_id` (uuid, references terrain_slots) - Optional link to scheduled slot
      - `notes` (text) - Optional session notes
      - `created_by` (uuid, references profiles) - Who created the session
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - UNIQUE constraint on (team_id, session_date, slot_id)
    
    - `training_attendance`
      - `id` (uuid, primary key)
      - `session_id` (uuid, references training_sessions)
      - `member_id` (uuid, references members)
      - `present` (boolean) - True if present, false if absent
      - `notes` (text) - Optional notes about attendance
      - `created_at` (timestamptz)
      - UNIQUE constraint on (session_id, member_id)

  2. Security
    - Enable RLS on both tables
    - Authenticated users (coaches and admins) can manage sessions and attendance
    - Sessions are automatically deleted when team is deleted (CASCADE)
    - Attendance records are automatically deleted when session is deleted (CASCADE)

  3. Important Notes
    - Each session is unique per team, date, and slot combination
    - Each player can have only one attendance record per session
    - Default attendance is false (absent) until marked present
    - Timestamps track when records are created/modified
*/

-- Training sessions table
CREATE TABLE IF NOT EXISTS training_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  slot_id UUID REFERENCES terrain_slots(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(team_id, session_date, slot_id)
);

-- Attendance records table
CREATE TABLE IF NOT EXISTS training_attendance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  present BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, member_id)
);

-- Enable RLS
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_attendance ENABLE ROW LEVEL SECURITY;

-- RLS Policies for training_sessions
CREATE POLICY "Authenticated can view training_sessions"
  ON training_sessions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert training_sessions"
  ON training_sessions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update training_sessions"
  ON training_sessions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete training_sessions"
  ON training_sessions FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for training_attendance
CREATE POLICY "Authenticated can view training_attendance"
  ON training_attendance FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert training_attendance"
  ON training_attendance FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update training_attendance"
  ON training_attendance FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete training_attendance"
  ON training_attendance FOR DELETE
  TO authenticated
  USING (true);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_training_sessions_team_date 
  ON training_sessions(team_id, session_date DESC);

CREATE INDEX IF NOT EXISTS idx_training_attendance_session 
  ON training_attendance(session_id);

CREATE INDEX IF NOT EXISTS idx_training_attendance_member 
  ON training_attendance(member_id);
