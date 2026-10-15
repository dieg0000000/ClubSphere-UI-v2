/*
  # Delete all members and team_members data

  1. Changes
    - Delete all rows from team_members junction table
    - Delete all rows from members table

  2. Notes
    - This is a data cleanup operation
    - Order matters: junction table must be deleted first due to foreign key constraints
*/

DELETE FROM team_members;
DELETE FROM members;
