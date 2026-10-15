/*
  # Create sponsor impressions daily tracking table

  1. New Tables
    - `sponsor_impressions_daily`
      - `id` (uuid, primary key)
      - `sponsor_id` (uuid, references sponsors)
      - `date` (date, the day of the impression)
      - `impressions_count` (integer, number of impressions that day)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - Unique constraint on (sponsor_id, date)

  2. New Functions
    - `increment_sponsor_impression(p_sponsor_id uuid, p_date date)` 
      - SECURITY DEFINER function to atomically upsert impression counts
      - Inserts a new row with count 1 or increments existing count

  3. Indexes
    - `idx_sponsor_impressions_daily_lookup` on (sponsor_id, date DESC)

  4. Security
    - Enable RLS on `sponsor_impressions_daily`
    - SELECT policy for admin, committee, president, vice_president roles
    - INSERT/UPDATE policy for any authenticated user (carousel tracking)
*/

CREATE TABLE IF NOT EXISTS sponsor_impressions_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id uuid NOT NULL REFERENCES sponsors(id) ON DELETE CASCADE,
  date date NOT NULL,
  impressions_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sponsor_id, date)
);

CREATE INDEX IF NOT EXISTS idx_sponsor_impressions_daily_lookup
  ON sponsor_impressions_daily (sponsor_id, date DESC);

ALTER TABLE sponsor_impressions_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and committee can read sponsor impressions"
  ON sponsor_impressions_daily
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'committee', 'president', 'vice_president')
    )
  );

CREATE POLICY "Authenticated users can insert sponsor impressions"
  ON sponsor_impressions_daily
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sponsors WHERE sponsors.id = sponsor_id
    )
  );

CREATE POLICY "Authenticated users can update sponsor impressions"
  ON sponsor_impressions_daily
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sponsors WHERE sponsors.id = sponsor_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sponsors WHERE sponsors.id = sponsor_id
    )
  );

CREATE OR REPLACE FUNCTION increment_sponsor_impression(
  p_sponsor_id uuid,
  p_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO sponsor_impressions_daily
    (sponsor_id, date, impressions_count)
  VALUES
    (p_sponsor_id, p_date, 1)
  ON CONFLICT (sponsor_id, date)
  DO UPDATE SET
    impressions_count = sponsor_impressions_daily.impressions_count + 1,
    updated_at = now();
END;
$$;
