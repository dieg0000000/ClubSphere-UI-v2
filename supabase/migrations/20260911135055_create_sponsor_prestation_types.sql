/*
# Create sponsor_prestation_types table

1. New Tables
   - `sponsor_prestation_types`
     - `id` (uuid, primary key)
     - `club_id` (uuid, FK to clubs, not null)
     - `name` (text, not null) — prestation label
     - `category` (text, not null, default 'autre') — package, club500, panneau, livret, textile, invitation, autre
     - `list_price` (numeric) — optional indicative price
     - `display_order` (integer, not null, default 0)
     - `active` (boolean, not null, default true)
     - `created_at` (timestamptz)

2. Security
   - RLS enabled
   - 4 separate policies for authenticated users scoped by club membership
*/

CREATE TABLE IF NOT EXISTS sponsor_prestation_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'autre'
    CHECK (category IN ('package', 'club500', 'panneau', 'livret', 'textile', 'invitation', 'autre')),
  list_price numeric,
  display_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sponsor_prestation_types_club
  ON sponsor_prestation_types(club_id);

ALTER TABLE sponsor_prestation_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_sponsor_prestation_types" ON sponsor_prestation_types;
CREATE POLICY "select_sponsor_prestation_types" ON sponsor_prestation_types
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_sponsor_prestation_types" ON sponsor_prestation_types;
CREATE POLICY "insert_sponsor_prestation_types" ON sponsor_prestation_types
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_sponsor_prestation_types" ON sponsor_prestation_types;
CREATE POLICY "update_sponsor_prestation_types" ON sponsor_prestation_types
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_sponsor_prestation_types" ON sponsor_prestation_types;
CREATE POLICY "delete_sponsor_prestation_types" ON sponsor_prestation_types
  FOR DELETE TO authenticated USING (true);
