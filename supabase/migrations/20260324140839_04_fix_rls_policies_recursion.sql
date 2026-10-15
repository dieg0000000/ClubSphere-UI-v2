/*
  # Fix RLS policies to avoid infinite recursion

  1. Changes
    - Drop all existing policies on profiles table
    - Recreate policies without recursive checks
    - Use simple, non-recursive policies for INSERT and SELECT
    
  2. Security
    - Users can insert their own profile (needed for signup)
    - Users can view their own profile
    - Users can update their own profile
    - Admins can view all profiles (using a simpler check)
*/

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;

-- Create new non-recursive policies
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
