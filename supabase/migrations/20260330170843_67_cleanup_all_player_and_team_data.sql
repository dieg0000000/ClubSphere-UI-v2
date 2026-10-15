/*
  # Cleanup all player and team data for fresh import

  1. Changes
    - Delete all team member associations
    - Delete all members (players)
    - Remove coach references from teams
    - Delete all teams

  2. Security
    - This is a data cleanup operation to prepare for CSV import
    - All foreign key constraints are respected
    - RLS policies remain unchanged
*/

DELETE FROM team_members;
DELETE FROM members;
UPDATE teams SET coach_id = null, assistant_coach_id = null;
DELETE FROM teams;