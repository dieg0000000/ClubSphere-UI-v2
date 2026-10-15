/*
  # Add 'supporter' to profiles role check constraint

  The profiles_role_check constraint was missing 'supporter' and 'assistant_coach'
  roles that are used throughout the application. This migration drops the old
  constraint and recreates it with all valid roles.
*/

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY[
    'admin', 'committee', 'coach', 'assistant_coach',
    'member', 'public', 'parent', 'supporter',
    'president', 'vice_president', 'responsable_technique',
    'responsable_competitions', 'secretaire', 'tresorier'
  ]));
