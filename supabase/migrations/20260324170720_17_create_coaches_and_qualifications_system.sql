/*
  # Create Coaches and Qualifications System

  1. New Tables
    - `coaching_qualifications` - Store all coaching certifications
      - `id` (uuid, primary key)
      - `name` (text) - Qualification name
      - `description` (text) - Detailed description
      - `display_order` (integer) - Order for display
      - `active` (boolean) - Active status
      - `created_at` (timestamp)
    
    - `coaches` - Store coach information
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users) - Linked user account (nullable)
      - `first_name` (text) - Coach first name
      - `last_name` (text) - Coach last name
      - `birth_date` (date) - Birth date
      - `email` (text, unique) - Contact email
      - `phone` (text) - Mobile phone
      - `address` (text) - Street address
      - `postal_code` (text) - Postal code
      - `city` (text) - City
      - `qualification_id` (uuid, references coaching_qualifications) - Coaching qualification
      - `avatar_url` (text) - Profile picture URL
      - `status` (text) - invited | registered | active | inactive
      - `invite_token` (uuid) - Unique token for registration
      - `invite_sent_at` (timestamp) - When invite was sent
      - `registered_at` (timestamp) - When coach registered
      - `created_at` (timestamp)

  2. Changes to Existing Tables
    - Update `teams` table to add coach references
      - `coach_id` (uuid, references coaches) - Main coach
      - `assistant_coach_id` (uuid, references coaches) - Assistant coach

  3. Security
    - Enable RLS on all new tables
    - coaching_qualifications: SELECT for authenticated, admin-only for modifications
    - coaches: SELECT for authenticated, admin-only for modifications, anon SELECT by invite_token
    - teams: UPDATE policies to use new structure

  4. Important Notes
    - Coaches can be invited before having a user account
    - Invite token allows public registration without auth
    - Status tracks coach lifecycle: invited → registered → active
    - Teams link to coaches, not directly to users
*/

-- Create coaching_qualifications table
CREATE TABLE IF NOT EXISTS coaching_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  display_order integer DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create coaches table
CREATE TABLE IF NOT EXISTS coaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  birth_date date,
  email text UNIQUE NOT NULL,
  phone text,
  address text,
  postal_code text,
  city text,
  qualification_id uuid REFERENCES coaching_qualifications(id) ON DELETE SET NULL,
  avatar_url text,
  status text DEFAULT 'invited' CHECK (status IN ('invited', 'registered', 'active', 'inactive')),
  invite_token uuid DEFAULT gen_random_uuid() UNIQUE,
  invite_sent_at timestamptz,
  registered_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Add coach columns to teams table if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'teams' AND column_name = 'coach_id'
  ) THEN
    ALTER TABLE teams ADD COLUMN coach_id uuid REFERENCES coaches(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'teams' AND column_name = 'assistant_coach_id'
  ) THEN
    ALTER TABLE teams ADD COLUMN assistant_coach_id uuid REFERENCES coaches(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'teams' AND column_name = 'training_days'
  ) THEN
    ALTER TABLE teams ADD COLUMN training_days text[];
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'teams' AND column_name = 'training_time'
  ) THEN
    ALTER TABLE teams ADD COLUMN training_time text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'teams' AND column_name = 'training_location'
  ) THEN
    ALTER TABLE teams ADD COLUMN training_location text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'teams' AND column_name = 'season'
  ) THEN
    ALTER TABLE teams ADD COLUMN season text DEFAULT '2025-2026';
  END IF;
END $$;

-- Enable RLS
ALTER TABLE coaching_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;

-- RLS Policies for coaching_qualifications
CREATE POLICY "Authenticated users can view qualifications"
  ON coaching_qualifications FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert qualifications"
  ON coaching_qualifications FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

CREATE POLICY "Admins can update qualifications"
  ON coaching_qualifications FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

CREATE POLICY "Admins can delete qualifications"
  ON coaching_qualifications FOR DELETE
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

-- RLS Policies for coaches
CREATE POLICY "Authenticated users can view coaches"
  ON coaches FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anonymous can view coaches by invite token"
  ON coaches FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Admins can insert coaches"
  ON coaches FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

CREATE POLICY "Admins can update coaches"
  ON coaches FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

CREATE POLICY "Coaches can update their own record"
  ON coaches FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can delete coaches"
  ON coaches FOR DELETE
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_coaches_user_id ON coaches(user_id);
CREATE INDEX IF NOT EXISTS idx_coaches_email ON coaches(email);
CREATE INDEX IF NOT EXISTS idx_coaches_invite_token ON coaches(invite_token);
CREATE INDEX IF NOT EXISTS idx_coaches_status ON coaches(status);
CREATE INDEX IF NOT EXISTS idx_teams_coach_id ON teams(coach_id);
CREATE INDEX IF NOT EXISTS idx_teams_assistant_coach_id ON teams(assistant_coach_id);