/*
  # Fix terrain_slots table - add all missing columns

  1. Changes to `terrain_slots`
    - Add `team_id` column (UUID foreign key to teams)
    - Add `season` column (text, default '2025-2026')
    - Add `space_used` column (text, default 'half')
    - Add `notes` column (text)
    - Add `day` column (text for day of week)
    - Add `start_time` column (time)
    - Add `end_time` column (time)
    - Add `terrain_id` column (UUID foreign key to terrains)
    - Add `terrain_half_id` column (UUID foreign key to terrain_halves)

  2. Notes
    - Uses IF NOT EXISTS to safely add columns
    - All columns nullable or have defaults for flexibility
    - Foreign keys ensure referential integrity
*/

ALTER TABLE terrain_slots
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id),
ADD COLUMN IF NOT EXISTS season TEXT DEFAULT '2025-2026',
ADD COLUMN IF NOT EXISTS space_used TEXT DEFAULT 'half',
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS day TEXT,
ADD COLUMN IF NOT EXISTS start_time TIME,
ADD COLUMN IF NOT EXISTS end_time TIME,
ADD COLUMN IF NOT EXISTS terrain_id UUID REFERENCES terrains(id),
ADD COLUMN IF NOT EXISTS terrain_half_id UUID REFERENCES terrain_halves(id);
