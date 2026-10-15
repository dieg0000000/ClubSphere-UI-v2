/*
# Create MFA Grace Periods Table

1. New Tables
   - `mfa_grace_periods`
     - `profile_id` (uuid, primary key, references profiles.id)
     - `first_prompted_at` (timestamptz, default now())
     - Tracks when admin/committee users were first prompted to enable MFA.
     - After 7 days from first_prompted_at, MFA enrollment becomes mandatory.

2. Security
   - Enable RLS on `mfa_grace_periods`.
   - Authenticated users can SELECT their own row only.
   - Authenticated users can INSERT their own row only (one-time).
   - No UPDATE or DELETE allowed (immutable once created).
*/

CREATE TABLE IF NOT EXISTS mfa_grace_periods (
  profile_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  first_prompted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mfa_grace_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_mfa_grace" ON mfa_grace_periods;
CREATE POLICY "select_own_mfa_grace" ON mfa_grace_periods FOR SELECT
  TO authenticated USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS "insert_own_mfa_grace" ON mfa_grace_periods;
CREATE POLICY "insert_own_mfa_grace" ON mfa_grace_periods FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = profile_id);
