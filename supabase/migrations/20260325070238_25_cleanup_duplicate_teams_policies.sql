/*
  # Cleanup Duplicate Teams Table Policies

  1. Changes
    - Remove duplicate and redundant policies on teams table
    - Keep only the essential policies with clear names

  2. Security
    - Maintains same security posture
    - Ensures only one policy per operation type
*/

-- Drop redundant duplicate policies
DROP POLICY IF EXISTS "Anyone can view teams" ON teams;
DROP POLICY IF EXISTS "Admins can manage teams" ON teams;

-- Ensure we have the correct set of policies
-- (The other policies already exist and are correct)
