/*
  # Fix Teams RLS for Public Access

  1. Security Changes
    - Add policy for authenticated users to read active teams
    - Add policy for anonymous users to read active teams
  
  2. Data Updates
    - Set active = true for all teams where active is NULL or false
  
  This ensures the public /equipes page works for all user roles including admins.
*/

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Anyone can read active teams" ON teams;
DROP POLICY IF EXISTS "Anon can read active teams" ON teams;

-- Allow authenticated users to read active teams
CREATE POLICY "Anyone can read active teams"
ON teams FOR SELECT
TO authenticated
USING (active = true);

-- Allow anonymous users to read active teams
CREATE POLICY "Anon can read active teams"
ON teams FOR SELECT
TO anon
USING (active = true);

-- Set all teams to active
UPDATE teams SET active = true 
WHERE active IS NULL OR active = false;
