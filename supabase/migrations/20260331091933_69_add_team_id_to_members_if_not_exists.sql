/*
  # Add team_id column to members table

  1. Changes
    - Add `team_id` column to `members` table if it doesn't exist
    - References `teams(id)` as foreign key
    - Allows NULL values for members not assigned to teams

  2. Purpose
    - Enable direct team assignment on members table
    - Complement the existing team_members junction table
    - Support faster queries for team player lists
*/

ALTER TABLE members 
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
