/*
  # Create Meetings Management System (PV Séances)

  1. New Tables
    - `meetings` - Main meeting records (séances)
      - `id` (uuid, primary key)
      - `type` (text) - comite, ag, commission_technique
      - `title` (text) - Meeting title
      - `date` (timestamp) - Meeting date and time
      - `location` (text) - Meeting location
      - `status` (text) - brouillon, finalise, approuve
      - `event_id` (uuid, optional link to events)
      - `secretary_id` (uuid, references committee_members)
      - `previous_meeting_id` (uuid, self-reference)
      - `previous_pv_approved` (boolean)
      - `notes` (text) - General notes
      - `created_by` (uuid, references profiles)
      - `created_at`, `updated_at` (timestamps)

    - `meeting_attendees` - Participant attendance
      - `id` (uuid, primary key)
      - `meeting_id` (uuid, references meetings)
      - `committee_member_id` (uuid, references committee_members)
      - `status` (text) - present, absent, excuse
      - `signature_url` (text) - Electronic signature
      - `signed_at` (timestamp)

    - `meeting_agenda_items` - Agenda points
      - `id` (uuid, primary key)
      - `meeting_id` (uuid, references meetings)
      - `order_number` (int) - Order in agenda
      - `title` (text) - Item title
      - `description` (text) - Item description
      - `brought_by_id` (uuid, references committee_members)
      - `responsible_id` (uuid, references committee_members)
      - `due_date` (date) - Action item due date
      - `status` (text) - ouvert, en_cours, clos, reporte
      - `created_at` (timestamp)

    - `meeting_decisions` - Decisions per agenda item
      - `id` (uuid, primary key)
      - `agenda_item_id` (uuid, references meeting_agenda_items)
      - `decision_text` (text) - Decision content
      - `votes_for` (int) - Votes in favor
      - `votes_against` (int) - Votes against
      - `votes_abstention` (int) - Abstentions
      - `is_vote` (boolean) - Is this a vote?
      - `created_at` (timestamp)

    - `meeting_documents` - Attached documents
      - `id` (uuid, primary key)
      - `meeting_id` (uuid, references meetings)
      - `agenda_item_id` (uuid, optional)
      - `name` (text) - Document name
      - `file_url` (text) - Storage URL
      - `uploaded_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - meetings SELECT: admin only (committee_members don't have user_id link)
    - All other operations: admin only
*/

-- Create meetings table
CREATE TABLE IF NOT EXISTS meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('comite', 'ag', 'commission_technique')),
  title text NOT NULL,
  date timestamptz NOT NULL,
  location text,
  status text DEFAULT 'brouillon' CHECK (status IN ('brouillon', 'finalise', 'approuve')),
  event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  secretary_id uuid REFERENCES committee_members(id) ON DELETE SET NULL,
  previous_meeting_id uuid REFERENCES meetings(id) ON DELETE SET NULL,
  previous_pv_approved boolean DEFAULT false,
  notes text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create meeting_attendees table
CREATE TABLE IF NOT EXISTS meeting_attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  committee_member_id uuid NOT NULL REFERENCES committee_members(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('present', 'absent', 'excuse')),
  signature_url text,
  signed_at timestamptz,
  UNIQUE(meeting_id, committee_member_id)
);

-- Create meeting_agenda_items table
CREATE TABLE IF NOT EXISTS meeting_agenda_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  order_number int NOT NULL,
  title text NOT NULL,
  description text,
  brought_by_id uuid REFERENCES committee_members(id) ON DELETE SET NULL,
  responsible_id uuid REFERENCES committee_members(id) ON DELETE SET NULL,
  due_date date,
  status text DEFAULT 'ouvert' CHECK (status IN ('ouvert', 'en_cours', 'clos', 'reporte')),
  created_at timestamptz DEFAULT now()
);

-- Create meeting_decisions table
CREATE TABLE IF NOT EXISTS meeting_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_item_id uuid NOT NULL REFERENCES meeting_agenda_items(id) ON DELETE CASCADE,
  decision_text text NOT NULL,
  votes_for int DEFAULT 0,
  votes_against int DEFAULT 0,
  votes_abstention int DEFAULT 0,
  is_vote boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create meeting_documents table
CREATE TABLE IF NOT EXISTS meeting_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  agenda_item_id uuid REFERENCES meeting_agenda_items(id) ON DELETE CASCADE,
  name text NOT NULL,
  file_url text NOT NULL,
  uploaded_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(date DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_type ON meetings(type);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);
CREATE INDEX IF NOT EXISTS idx_meeting_attendees_meeting ON meeting_attendees(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_agenda_items_meeting ON meeting_agenda_items(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_decisions_agenda_item ON meeting_decisions(agenda_item_id);
CREATE INDEX IF NOT EXISTS idx_meeting_documents_meeting ON meeting_documents(meeting_id);

-- Enable RLS
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_agenda_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies for meetings
CREATE POLICY "Admin can read meetings"
  ON meetings FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'admin'
    )
  );

CREATE POLICY "Admin can insert meetings"
  ON meetings FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'admin'
    )
  );

CREATE POLICY "Admin can update meetings"
  ON meetings FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'admin'
    )
  );

CREATE POLICY "Admin can delete meetings"
  ON meetings FOR DELETE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'admin'
    )
  );

-- RLS Policies for meeting_attendees
CREATE POLICY "Admin can read attendees"
  ON meeting_attendees FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'admin'
    )
  );

CREATE POLICY "Admin can insert attendees"
  ON meeting_attendees FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'admin'
    )
  );

CREATE POLICY "Admin can update attendees"
  ON meeting_attendees FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'admin'
    )
  );

CREATE POLICY "Admin can delete attendees"
  ON meeting_attendees FOR DELETE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'admin'
    )
  );

-- RLS Policies for meeting_agenda_items
CREATE POLICY "Admin can read agenda items"
  ON meeting_agenda_items FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'admin'
    )
  );

CREATE POLICY "Admin can insert agenda items"
  ON meeting_agenda_items FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'admin'
    )
  );

CREATE POLICY "Admin can update agenda items"
  ON meeting_agenda_items FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'admin'
    )
  );

CREATE POLICY "Admin can delete agenda items"
  ON meeting_agenda_items FOR DELETE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'admin'
    )
  );

-- RLS Policies for meeting_decisions
CREATE POLICY "Admin can read decisions"
  ON meeting_decisions FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'admin'
    )
  );

CREATE POLICY "Admin can insert decisions"
  ON meeting_decisions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'admin'
    )
  );

CREATE POLICY "Admin can update decisions"
  ON meeting_decisions FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'admin'
    )
  );

CREATE POLICY "Admin can delete decisions"
  ON meeting_decisions FOR DELETE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'admin'
    )
  );

-- RLS Policies for meeting_documents
CREATE POLICY "Admin can read documents"
  ON meeting_documents FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'admin'
    )
  );

CREATE POLICY "Admin can insert documents"
  ON meeting_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'admin'
    )
  );

CREATE POLICY "Admin can update documents"
  ON meeting_documents FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'admin'
    )
  );

CREATE POLICY "Admin can delete documents"
  ON meeting_documents FOR DELETE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'admin'
    )
  );
