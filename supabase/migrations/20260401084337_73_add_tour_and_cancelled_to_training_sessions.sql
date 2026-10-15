/*
  # Add Tour and Cancellation Support to Training Sessions

  1. New Columns
    - `tour` (integer) - Indicates which tour period (1 or 2)
    - `cancelled` (boolean) - Whether the session is cancelled
    - `cancelled_reason` (text) - Optional reason for cancellation

  2. Purpose
    - Support auto-generation of sessions based on tour periods
    - Allow coaches to mark sessions as cancelled without deleting them
    - Preserve attendance data even for cancelled sessions
    - Distinguish between 1er tour (juillet-décembre) and 2ème tour (février-juin)

  3. Important Notes
    - Default tour is 1 for backwards compatibility
    - Default cancelled is false (active sessions)
    - Cancelled sessions are excluded from statistics
    - Cancelled sessions still maintain their attendance records
*/

-- Add tour tracking and cancellation support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_sessions' AND column_name = 'tour'
  ) THEN
    ALTER TABLE training_sessions ADD COLUMN tour INTEGER DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_sessions' AND column_name = 'cancelled'
  ) THEN
    ALTER TABLE training_sessions ADD COLUMN cancelled BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_sessions' AND column_name = 'cancelled_reason'
  ) THEN
    ALTER TABLE training_sessions ADD COLUMN cancelled_reason TEXT;
  END IF;
END $$;

-- Add index for common queries filtering by cancelled status
CREATE INDEX IF NOT EXISTS idx_training_sessions_cancelled 
  ON training_sessions(team_id, cancelled, session_date DESC);
