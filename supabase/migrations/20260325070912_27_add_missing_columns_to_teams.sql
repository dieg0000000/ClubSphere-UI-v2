/*
  # Add missing columns to teams table

  1. Changes
    - Add 'active' boolean column with DEFAULT true
    - Add 'category_id' foreign key to team_categories
    - Add 'coach_id' foreign key to coaches
    - Add 'assistant_coach_id' foreign key to coaches
    - Add 'training_days' text array for multiple training days
    - Add 'training_time' text field
    - Add 'training_location' text field
    - Add 'season' text field with DEFAULT '2025-2026'

  2. Notes
    - Uses IF NOT EXISTS to prevent errors if columns already exist
    - Foreign keys reference coaches and team_categories tables
    - Training days stored as array to support multiple days per week
*/

ALTER TABLE teams 
ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES team_categories(id),
ADD COLUMN IF NOT EXISTS coach_id UUID REFERENCES coaches(id),
ADD COLUMN IF NOT EXISTS assistant_coach_id UUID REFERENCES coaches(id),
ADD COLUMN IF NOT EXISTS training_days TEXT[],
ADD COLUMN IF NOT EXISTS training_time TEXT,
ADD COLUMN IF NOT EXISTS training_location TEXT,
ADD COLUMN IF NOT EXISTS season TEXT DEFAULT '2025-2026';
