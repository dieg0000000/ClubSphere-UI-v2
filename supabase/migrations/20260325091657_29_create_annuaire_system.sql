/*
  # Create Annuaire System (Players and Club Directory)

  ## Overview
  Creates two separate directory systems:
  - Annuaire 1: Members (Players) - imported from ClubCorner
  - Annuaire 2: Committee, Supporters, Referees, Sponsors
  - Linking system to connect club people with player records

  ## New Tables

  ### 1. members (Joueurs - Annuaire 1)
  - `id` (uuid, primary key)
  - Personal info: first_name, last_name, birth_date, nationality
  - Sensitive: avs_number, passport_number (admin only)
  - Contact: email, phone, address, postal_code, city, canton
  - Club: team_id, js_number, licence_status
  - Legal representatives (2 sets of fields)
  - notes, created_at

  ### 2. committee_members (Comité - Annuaire 2)
  - `id` (uuid, primary key)
  - `member_id` (optional link to members table)
  - Personal/contact info (auto-filled if linked)
  - role, profile_photo_url, coach_id
  - avs_number (admin only)
  - created_at

  ### 3. supporters (Annuaire 2)
  - `id` (uuid, primary key)
  - `member_id` (optional link to members table)
  - Personal/contact info
  - member_since
  - created_at

  ### 4. referees (Annuaire 2)
  - `id` (uuid, primary key)
  - `member_id` (optional link to members table)
  - Personal/contact info
  - licence_level, active
  - created_at

  ### 5. sponsors (Annuaire 2)
  - `id` (uuid, primary key)
  - Company info: company_name, logo_url, website_url
  - Contact person (with optional member_id link)
  - Address info
  - Sponsoring details: type, amount, since
  - notes, active
  - created_at

  ## Security
  - All tables enable RLS
  - SELECT: authenticated users
  - INSERT/UPDATE/DELETE: admin only
  - Sensitive fields handled at application level
*/

-- Table 1: members (Players - Annuaire 1)
CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  birth_date date,
  nationality text,
  avs_number text,
  passport_number text,
  email text,
  phone text,
  address text,
  postal_code text,
  city text,
  canton text,
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  js_number text,
  licence_status text DEFAULT 'actif',
  legal_rep1_firstname text,
  legal_rep1_lastname text,
  legal_rep1_phone text,
  legal_rep1_email text,
  legal_rep2_firstname text,
  legal_rep2_lastname text,
  legal_rep2_phone text,
  legal_rep2_email text,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Table 2: committee_members (Comité - Annuaire 2)
CREATE TABLE IF NOT EXISTS committee_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  birth_date date,
  email text,
  phone text,
  address text,
  postal_code text,
  city text,
  role text,
  avs_number text,
  profile_photo_url text,
  coach_id uuid REFERENCES coaches(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Table 3: supporters (Annuaire 2)
CREATE TABLE IF NOT EXISTS supporters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  address text,
  postal_code text,
  city text,
  member_since date,
  created_at timestamptz DEFAULT now()
);

-- Table 4: referees (Annuaire 2)
CREATE TABLE IF NOT EXISTS referees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  licence_level text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Table 5: sponsors (Annuaire 2)
CREATE TABLE IF NOT EXISTS sponsors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  contact_first_name text,
  contact_last_name text,
  contact_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  email text,
  phone text,
  address text,
  postal_code text,
  city text,
  sponsoring_type text,
  sponsoring_amount decimal,
  sponsoring_since date,
  logo_url text,
  website_url text,
  notes text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE committee_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE supporters ENABLE ROW LEVEL SECURITY;
ALTER TABLE referees ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsors ENABLE ROW LEVEL SECURITY;

-- RLS Policies for members
CREATE POLICY "Authenticated users can view members"
  ON members FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert members"
  ON members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update members"
  ON members FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete members"
  ON members FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- RLS Policies for committee_members
CREATE POLICY "Authenticated users can view committee_members"
  ON committee_members FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert committee_members"
  ON committee_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update committee_members"
  ON committee_members FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete committee_members"
  ON committee_members FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- RLS Policies for supporters
CREATE POLICY "Authenticated users can view supporters"
  ON supporters FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert supporters"
  ON supporters FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update supporters"
  ON supporters FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete supporters"
  ON supporters FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- RLS Policies for referees
CREATE POLICY "Authenticated users can view referees"
  ON referees FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert referees"
  ON referees FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update referees"
  ON referees FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete referees"
  ON referees FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- RLS Policies for sponsors
CREATE POLICY "Authenticated users can view sponsors"
  ON sponsors FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert sponsors"
  ON sponsors FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update sponsors"
  ON sponsors FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete sponsors"
  ON sponsors FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_members_team_id ON members(team_id);
CREATE INDEX IF NOT EXISTS idx_members_name ON members(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_committee_members_member_id ON committee_members(member_id);
CREATE INDEX IF NOT EXISTS idx_supporters_member_id ON supporters(member_id);
CREATE INDEX IF NOT EXISTS idx_referees_member_id ON referees(member_id);
CREATE INDEX IF NOT EXISTS idx_sponsors_contact_member_id ON sponsors(contact_member_id);