/*
  # Add widget fields to teams, drop team_widgets table

  ## Changes
  - Add `widget_url` (text, nullable) to `teams` table
  - Add `show_widget` (boolean, default false) to `teams` table
  - Drop `team_widgets` table (no longer needed — data moved to teams)

  ## Notes
  - No existing data is lost; team_widgets was empty (never populated)
  - The public /classements page will now query the teams table
*/

ALTER TABLE teams ADD COLUMN IF NOT EXISTS widget_url text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'teams' AND column_name = 'show_widget'
  ) THEN
    ALTER TABLE teams ADD COLUMN show_widget boolean DEFAULT false;
  END IF;
END $$;

DROP TABLE IF EXISTS team_widgets;
