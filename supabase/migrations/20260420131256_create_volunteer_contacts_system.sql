/*
  # Create Volunteer Contacts System

  ## Summary
  Adds a persistent contacts list for volunteers, independent of individual event registrations.

  ## New Tables
  - `volunteer_contacts`
    - `id` (uuid, primary key)
    - `first_name` (text, NOT NULL)
    - `last_name` (text, NOT NULL)
    - `email` (text, nullable)
    - `phone` (text, nullable)
    - `profile_id` (uuid, FK → profiles.id, nullable) — linked if they have a ClubSphere account
    - `receive_volunteer_alerts` (boolean, default true) — opt-in for alert emails
    - `notes` (text, nullable)
    - `created_at`, `updated_at` (timestamptz)

  ## Security
  - RLS enabled with a single policy allowing all authenticated users full access
    (managed by club admins only via the admin interface)

  ## Notes
  - This table serves as the club's persistent volunteer contact book
  - Records are auto-created when admins manually add volunteers to events
  - profile_id is populated when a contact creates a ClubSphere account
*/

CREATE TABLE IF NOT EXISTS volunteer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  receive_volunteer_alerts boolean DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE volunteer_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage volunteer contacts"
  ON volunteer_contacts
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS volunteer_contacts_email_idx ON volunteer_contacts (email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS volunteer_contacts_profile_id_idx ON volunteer_contacts (profile_id) WHERE profile_id IS NOT NULL;
