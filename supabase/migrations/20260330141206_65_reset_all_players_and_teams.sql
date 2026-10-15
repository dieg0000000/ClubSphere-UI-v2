/*
  # Reset All Players and Teams

  This migration completely removes all existing data related to players, teams, and their associations
  to prepare for a fresh import.

  1. Data Cleanup
    - Remove all player-team assignments from `team_members`
    - Remove all players from `members`
    - Remove coach assignments from `teams` (set to null)
    - Remove all teams from `teams`

  2. Important Notes
    - This is a destructive operation that will remove all existing player and team data
    - Coaches themselves are NOT deleted, only their team assignments
    - Categories and qualifications remain intact
    - Event registrations remain intact (they reference profiles, not members)
    - This prepares the database for a clean import of new data
*/

-- 1. Remove all player-team assignments
DELETE FROM team_members;

-- 2. Remove all members (players)
DELETE FROM members;

-- 3. Remove coach assignments from teams
UPDATE teams SET 
  coach_id = null,
  assistant_coach_id = null;

-- 4. Remove all teams
DELETE FROM teams;
