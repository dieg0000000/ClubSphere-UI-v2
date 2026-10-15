/*
  # Create committee_access table

  ## Purpose
  Allows configurable module-level access control for committee members.
  Each row defines whether a specific committee profile can view or edit a given module.

  ## New Tables
  - `committee_access`
    - `id` (uuid, primary key)
    - `profile_id` (uuid, FK to profiles.id, CASCADE on delete)
    - `module` (text, the module key e.g. 'utilisateurs', 'finances', etc.)
    - `can_view` (boolean, default false)
    - `can_edit` (boolean, default false)
    - `created_at` (timestamptz)
    - UNIQUE constraint on (profile_id, module)

  ## Security
  - RLS enabled
  - Single policy: authenticated users can read/write (admin manages this table)
*/

CREATE TABLE IF NOT EXISTS committee_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  module text NOT NULL,
  can_view boolean DEFAULT false,
  can_edit boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(profile_id, module)
);

ALTER TABLE committee_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth committee_access"
  ON committee_access
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
