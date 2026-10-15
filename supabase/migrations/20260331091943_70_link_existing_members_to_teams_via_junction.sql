/*
  # Link existing members to teams

  1. Changes
    - Populate `team_id` for existing members using team_members junction table
    - Only updates members where team_id is currently NULL
    - Preserves any existing team_id assignments

  2. Purpose
    - Migrate existing team relationships from junction table to direct column
    - Fix the player list display showing "Aucun joueur"
    - Maintain data consistency between both relationship methods
*/

UPDATE members m
SET team_id = tm.team_id
FROM team_members tm
WHERE tm.member_id = m.id
AND m.team_id IS NULL;
