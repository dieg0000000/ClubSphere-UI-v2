/*
  # Create Event Registration System

  1. Modified Tables
    - `events` - Added registration-related columns:
      - `is_registerable` (boolean) - Whether the event accepts registrations
      - `registration_deadline` (timestamptz) - Deadline for registrations
      - `cancellation_deadline_days` (integer) - Days before event for free cancellation
      - `cost_price` (decimal) - Cost price per person for late cancellation
      - `payment_modes` (text[]) - Accepted payment modes
  
  2. New Tables
    - `event_tariffs` - Pricing tiers for events
      - `id` (uuid, primary key)
      - `event_id` (uuid, references events)
      - `label` (text) - Tariff label e.g. "Adulte", "Enfant"
      - `price` (decimal) - Price in CHF
      - `created_at` (timestamptz)
    
    - `event_ext_registrations` - External/public registrations for events
      - `id` (uuid, primary key)
      - `event_id` (uuid, references events)
      - `registrant_first_name`, `registrant_last_name`, `registrant_email`, `registrant_phone` - Contact info
      - `profile_id` (uuid, nullable) - Link to profile if logged in
      - `tariff_id` (uuid, nullable) - Selected tariff
      - `total_amount` (decimal) - Calculated total
      - `guest_count` (integer) - Number of additional guests
      - `guests` (jsonb) - Guest details array
      - `payment_mode` (text) - invoice or cash_card
      - `payment_icon` (text) - Display icon type
      - `status` (text) - confirmed or cancelled
      - `cancelled_at` (timestamptz) - When cancelled
      - `cancellation_late` (boolean) - Whether cancellation was late
      - `reminder_8_sent`, `reminder_3_sent`, `reminder_1_sent` (boolean) - Reminder tracking
      - `created_at` (timestamptz)

  3. Security
    - RLS enabled on both new tables
    - Authenticated users can read all tariffs and registrations for events
    - Authenticated users can insert their own registrations
    - Anon users can read tariffs and insert registrations (public events)
    - Admin/committee users can manage all data
*/

-- Add columns to events table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'is_registerable'
  ) THEN
    ALTER TABLE events ADD COLUMN is_registerable boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'registration_deadline'
  ) THEN
    ALTER TABLE events ADD COLUMN registration_deadline timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'cancellation_deadline_days'
  ) THEN
    ALTER TABLE events ADD COLUMN cancellation_deadline_days integer DEFAULT 7;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'cost_price'
  ) THEN
    ALTER TABLE events ADD COLUMN cost_price decimal(10,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'payment_modes'
  ) THEN
    ALTER TABLE events ADD COLUMN payment_modes text[] DEFAULT '{}';
  END IF;
END $$;

-- Create event_tariffs table
CREATE TABLE IF NOT EXISTS event_tariffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label text NOT NULL,
  price decimal(10,2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE event_tariffs ENABLE ROW LEVEL SECURITY;

-- Tariff policies: everyone can read, admins can manage
CREATE POLICY "Authenticated users can read event tariffs"
  ON event_tariffs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon users can read event tariffs"
  ON event_tariffs FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Admins can insert event tariffs"
  ON event_tariffs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'president', 'vice_president', 'committee')
    )
    OR
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
      AND committee_access.module = 'evenements'
      AND committee_access.can_edit = true
    )
  );

CREATE POLICY "Admins can update event tariffs"
  ON event_tariffs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'president', 'vice_president', 'committee')
    )
    OR
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
      AND committee_access.module = 'evenements'
      AND committee_access.can_edit = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'president', 'vice_president', 'committee')
    )
    OR
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
      AND committee_access.module = 'evenements'
      AND committee_access.can_edit = true
    )
  );

CREATE POLICY "Admins can delete event tariffs"
  ON event_tariffs FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'president', 'vice_president', 'committee')
    )
    OR
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
      AND committee_access.module = 'evenements'
      AND committee_access.can_edit = true
    )
  );

-- Create event_ext_registrations table (separate from existing event_registrations)
CREATE TABLE IF NOT EXISTS event_ext_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  registrant_first_name text NOT NULL,
  registrant_last_name text NOT NULL,
  registrant_email text NOT NULL,
  registrant_phone text,
  profile_id uuid REFERENCES profiles(id),
  tariff_id uuid REFERENCES event_tariffs(id),
  total_amount decimal(10,2),
  guest_count integer DEFAULT 0,
  guests jsonb DEFAULT '[]',
  payment_mode text,
  payment_icon text,
  status text DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  cancelled_at timestamptz,
  cancellation_late boolean DEFAULT false,
  reminder_8_sent boolean DEFAULT false,
  reminder_3_sent boolean DEFAULT false,
  reminder_1_sent boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE event_ext_registrations ENABLE ROW LEVEL SECURITY;

-- Registration policies
CREATE POLICY "Anyone can read event ext registrations"
  ON event_ext_registrations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon can read event ext registrations"
  ON event_ext_registrations FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated users can insert own registrations"
  ON event_ext_registrations FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid() OR profile_id IS NULL);

CREATE POLICY "Anon users can insert registrations"
  ON event_ext_registrations FOR INSERT
  TO anon
  WITH CHECK (profile_id IS NULL);

CREATE POLICY "Users can update own registrations"
  ON event_ext_registrations FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Anon can update registrations by id"
  ON event_ext_registrations FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can update all registrations"
  ON event_ext_registrations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'president', 'vice_president', 'committee')
    )
    OR
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
      AND committee_access.module = 'evenements'
      AND committee_access.can_edit = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'president', 'vice_president', 'committee')
    )
    OR
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
      AND committee_access.module = 'evenements'
      AND committee_access.can_edit = true
    )
  );

CREATE POLICY "Admins can delete registrations"
  ON event_ext_registrations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'president', 'vice_president', 'committee')
    )
    OR
    EXISTS (
      SELECT 1 FROM committee_access
      WHERE committee_access.profile_id = auth.uid()
      AND committee_access.module = 'evenements'
      AND committee_access.can_edit = true
    )
  );

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_event_ext_registrations_event_id ON event_ext_registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_ext_registrations_status ON event_ext_registrations(status);
CREATE INDEX IF NOT EXISTS idx_event_tariffs_event_id ON event_tariffs(event_id);
