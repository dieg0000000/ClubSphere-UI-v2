/*
  # Fix RLS policies blocking saves across multiple tables

  ## Summary
  Several tables were blocking authenticated write operations due to missing or
  overly restrictive RLS policies. This migration enables RLS where needed and
  adds permissive authenticated-user policies for:

  1. coaching_qualifications - enable RLS + allow all authenticated access
  2. terrain_slots - add write policy (RLS already enabled)
  3. team_categories - add write policy for authenticated users
  4. events - enable RLS + allow all authenticated access
  5. news - enable RLS + allow all authenticated access
  6. sponsors - enable RLS + allow all authenticated access
  7. committee_members - enable RLS + allow all authenticated access

  ## Notes
  - pv_seances / minutes table does not exist yet (confirmed via SELECT)
  - team_categories confirmed as the correct table name (not football_categories)
  - Policies use IF NOT EXISTS pattern via DO blocks to be idempotent
*/

-- coaching_qualifications
ALTER TABLE coaching_qualifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'coaching_qualifications' AND policyname = 'auth coaching_qualifications'
  ) THEN
    CREATE POLICY "auth coaching_qualifications"
      ON coaching_qualifications
      FOR ALL TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- terrain_slots
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'terrain_slots' AND policyname = 'auth terrain_slots write'
  ) THEN
    CREATE POLICY "auth terrain_slots write"
      ON terrain_slots
      FOR ALL TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- team_categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'team_categories' AND policyname = 'auth team_categories write'
  ) THEN
    CREATE POLICY "auth team_categories write"
      ON team_categories
      FOR ALL TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- events
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'events' AND policyname = 'auth events'
  ) THEN
    CREATE POLICY "auth events"
      ON events
      FOR ALL TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- news
ALTER TABLE news ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'news' AND policyname = 'auth news'
  ) THEN
    CREATE POLICY "auth news"
      ON news
      FOR ALL TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- sponsors
ALTER TABLE sponsors ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'sponsors' AND policyname = 'auth sponsors'
  ) THEN
    CREATE POLICY "auth sponsors"
      ON sponsors
      FOR ALL TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- committee_members
ALTER TABLE committee_members ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'committee_members' AND policyname = 'auth committee_members'
  ) THEN
    CREATE POLICY "auth committee_members"
      ON committee_members
      FOR ALL TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
