/*
  # Create match_attendance table

  ## Summary
  Adds match attendance tracking for all team members per match.

  ## New Table: match_attendance
  - `id` - Primary key
  - `match_id` - Reference to matches table (cascade delete)
  - `member_id` - Reference to members table (cascade delete)
  - `status` - Attendance status: pending, confirmed, absent_justified, absent_unjustified
  - `absence_reason` - Optional reason (only visible to staff/admin)
  - `notified_at` - Timestamp when first J-10 notification was sent
  - `reminded_at_5` - Timestamp when J-5 reminder was sent
  - `reminded_at_3` - Timestamp when J-3 final reminder was sent
  - `responded_at` - Timestamp when member/parent responded
  - `responded_by` - Profile id of who responded (can be parent)
  - `created_at` - Record creation timestamp
  - UNIQUE constraint on (match_id, member_id)

  ## Security
  - RLS enabled with permissive policy for authenticated users
    (fine-grained logic handled at application layer)
*/

CREATE TABLE IF NOT EXISTS match_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid REFERENCES matches(id) ON DELETE CASCADE,
  member_id uuid REFERENCES members(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','absent_justified','absent_unjustified')),
  absence_reason text,
  notified_at timestamptz,
  reminded_at_5 timestamptz,
  reminded_at_3 timestamptz,
  responded_at timestamptz,
  responded_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(match_id, member_id)
);

ALTER TABLE match_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read match_attendance"
  ON match_attendance FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert match_attendance"
  ON match_attendance FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update match_attendance"
  ON match_attendance FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete match_attendance"
  ON match_attendance FOR DELETE
  TO authenticated
  USING (true);
