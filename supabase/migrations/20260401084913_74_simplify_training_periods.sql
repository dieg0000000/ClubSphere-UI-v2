/*
  # Simplify Training Periods System

  1. Changes to Teams Table
    - Remove tour1_start, tour1_end, tour2_start, tour2_end columns
    - Add training_start and training_end columns
    - Simpler single-period model (e.g., July 1 - June 30)

  2. Changes to Training Sessions Table
    - Remove tour column
    - Sessions no longer grouped by tour periods
    - All sessions part of one continuous season

  3. Purpose
    - Simplify training management
    - Remove complexity of two-tour system
    - Easier for admins to configure season dates
    - Single "Generate Sessions" action per team

  4. Important Notes
    - Session generation now handled by admins only
    - Coaches view and fill attendance for generated sessions
    - Default season: July 1 - June 30
*/

-- Remove tour-based columns from teams
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'teams' AND column_name = 'tour1_start'
  ) THEN
    ALTER TABLE teams DROP COLUMN tour1_start;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'teams' AND column_name = 'tour1_end'
  ) THEN
    ALTER TABLE teams DROP COLUMN tour1_end;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'teams' AND column_name = 'tour2_start'
  ) THEN
    ALTER TABLE teams DROP COLUMN tour2_start;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'teams' AND column_name = 'tour2_end'
  ) THEN
    ALTER TABLE teams DROP COLUMN tour2_end;
  END IF;
END $$;

-- Add simplified training period columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'teams' AND column_name = 'training_start'
  ) THEN
    ALTER TABLE teams ADD COLUMN training_start DATE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'teams' AND column_name = 'training_end'
  ) THEN
    ALTER TABLE teams ADD COLUMN training_end DATE;
  END IF;
END $$;

-- Remove tour column from training_sessions
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_sessions' AND column_name = 'tour'
  ) THEN
    ALTER TABLE training_sessions DROP COLUMN tour;
  END IF;
END $$;

-- Drop the tour-based index if it exists
DROP INDEX IF EXISTS idx_training_sessions_cancelled;

-- Add new index for common queries
CREATE INDEX IF NOT EXISTS idx_training_sessions_team_date 
  ON training_sessions(team_id, cancelled, session_date DESC);
