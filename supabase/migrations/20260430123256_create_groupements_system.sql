/*
  # Groupements module

  1. club_settings
     - Add `club_asf_number` text column (ASF federation number)

  2. New Tables
     - `groupements` — ASF groupements with a category_type and season
     - `groupement_clubs` — clubs belonging to a groupement

  3. Modified Tables
     - `members` — add `groupement_id`, `origin_club_asf_number`, `origin_club_name`
       and a new `status` column with values actif/inactif/groupement

  4. Security
     - RLS enabled on both new tables
     - Admin/president/vice_president/committee can CRUD; authenticated can SELECT
*/

ALTER TABLE club_settings ADD COLUMN IF NOT EXISTS club_asf_number text;

CREATE TABLE IF NOT EXISTS groupements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category_type text NOT NULL,
  season_id uuid REFERENCES seasons(id) ON DELETE SET NULL,
  managing_club_asf_number text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT groupements_category_type_check CHECK (
    category_type IN ('hommes_actifs', 'juniors', 'femmes', 'seniors', 'autre')
  )
);

ALTER TABLE groupements ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS groupement_clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  groupement_id uuid NOT NULL REFERENCES groupements(id) ON DELETE CASCADE,
  club_asf_number text NOT NULL,
  club_name text NOT NULL,
  is_managing boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE (groupement_id, club_asf_number)
);

ALTER TABLE groupement_clubs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='members' AND column_name='groupement_id'
  ) THEN
    ALTER TABLE members ADD COLUMN groupement_id uuid REFERENCES groupements(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='members' AND column_name='origin_club_asf_number'
  ) THEN
    ALTER TABLE members ADD COLUMN origin_club_asf_number text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='members' AND column_name='origin_club_name'
  ) THEN
    ALTER TABLE members ADD COLUMN origin_club_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='members' AND column_name='status'
  ) THEN
    ALTER TABLE members ADD COLUMN status text DEFAULT 'actif';
  END IF;
END $$;

ALTER TABLE members DROP CONSTRAINT IF EXISTS members_status_check;
ALTER TABLE members ADD CONSTRAINT members_status_check
  CHECK (status IN ('actif', 'inactif', 'groupement'));

CREATE INDEX IF NOT EXISTS idx_members_groupement_id ON members(groupement_id);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);

-- RLS policies for groupements
DROP POLICY IF EXISTS "Authenticated can view groupements" ON groupements;
CREATE POLICY "Authenticated can view groupements"
  ON groupements FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins insert groupements" ON groupements;
CREATE POLICY "Admins insert groupements"
  ON groupements FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.role IN ('admin','president','vice_president','committee'))
  );

DROP POLICY IF EXISTS "Admins update groupements" ON groupements;
CREATE POLICY "Admins update groupements"
  ON groupements FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.role IN ('admin','president','vice_president','committee'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.role IN ('admin','president','vice_president','committee'))
  );

DROP POLICY IF EXISTS "Admins delete groupements" ON groupements;
CREATE POLICY "Admins delete groupements"
  ON groupements FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.role IN ('admin','president','vice_president','committee'))
  );

-- RLS policies for groupement_clubs
DROP POLICY IF EXISTS "Authenticated can view groupement_clubs" ON groupement_clubs;
CREATE POLICY "Authenticated can view groupement_clubs"
  ON groupement_clubs FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins insert groupement_clubs" ON groupement_clubs;
CREATE POLICY "Admins insert groupement_clubs"
  ON groupement_clubs FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.role IN ('admin','president','vice_president','committee'))
  );

DROP POLICY IF EXISTS "Admins update groupement_clubs" ON groupement_clubs;
CREATE POLICY "Admins update groupement_clubs"
  ON groupement_clubs FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.role IN ('admin','president','vice_president','committee'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.role IN ('admin','president','vice_president','committee'))
  );

DROP POLICY IF EXISTS "Admins delete groupement_clubs" ON groupement_clubs;
CREATE POLICY "Admins delete groupement_clubs"
  ON groupement_clubs FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.role IN ('admin','president','vice_president','committee'))
  );
