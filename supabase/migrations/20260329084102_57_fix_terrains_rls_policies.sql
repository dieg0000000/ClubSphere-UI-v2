/*
  # Fix RLS Policies for Terrains System

  1. Changes
    - Drop existing policies that may be blocking public/authenticated reads
    - Create new policies allowing authenticated users to read terrains data
    - Ensure terrain_halves, terrain_slots, and terrain_restrictions are readable

  2. Security
    - All authenticated users can read terrains and related data
    - Only admins can modify (existing policies remain)
*/

-- Fix terrains table policies
DROP POLICY IF EXISTS "select_terrains" ON terrains;
DROP POLICY IF EXISTS "Authenticated users can view terrains" ON terrains;
DROP POLICY IF EXISTS "Anyone can view active terrains" ON terrains;

CREATE POLICY "Authenticated can read terrains"
ON terrains FOR SELECT TO authenticated
USING (true);

-- Fix terrain_halves table policies
DROP POLICY IF EXISTS "select_terrain_halves" ON terrain_halves;
DROP POLICY IF EXISTS "Authenticated users can view terrain halves" ON terrain_halves;
DROP POLICY IF EXISTS "Anyone can view active terrain halves" ON terrain_halves;

CREATE POLICY "Authenticated can read terrain_halves"
ON terrain_halves FOR SELECT TO authenticated
USING (true);

-- Fix terrain_slots table policies
DROP POLICY IF EXISTS "select_terrain_slots" ON terrain_slots;
DROP POLICY IF EXISTS "Authenticated users can view terrain slots" ON terrain_slots;
DROP POLICY IF EXISTS "Anyone can view terrain slots" ON terrain_slots;

CREATE POLICY "Authenticated can read terrain_slots"
ON terrain_slots FOR SELECT TO authenticated
USING (true);

-- Fix terrain_restrictions table policies
DROP POLICY IF EXISTS "select_terrain_restrictions" ON terrain_restrictions;
DROP POLICY IF EXISTS "Authenticated users can view terrain restrictions" ON terrain_restrictions;

CREATE POLICY "Authenticated can read terrain_restrictions"
ON terrain_restrictions FOR SELECT TO authenticated
USING (true);
