/*
  # Create sponsor_impressions table and track_sponsor_impression RPC

  1. New Tables
    - `sponsor_impressions`
      - `id` (uuid, primary key)
      - `sponsor_id` (uuid, references sponsors, NOT NULL)
      - `date` (date, defaults to CURRENT_DATE)
      - `count` (integer, impression count for that day)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - Unique constraint on (sponsor_id, date)

  2. Indexes
    - `idx_sponsor_impressions_sponsor_date` on (sponsor_id, date DESC)

  3. Security
    - Enable RLS on `sponsor_impressions`
    - SELECT policy: any authenticated user can read impressions

  4. New Functions
    - `track_sponsor_impression(p_sponsor_id uuid)` — atomic upsert that
      inserts a new row with count=1 or increments existing count for today.
      SECURITY DEFINER so any caller can write without direct table INSERT policy.
*/

CREATE TABLE IF NOT EXISTS sponsor_impressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id uuid NOT NULL REFERENCES sponsors(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (sponsor_id, date)
);

CREATE INDEX IF NOT EXISTS idx_sponsor_impressions_sponsor_date
ON sponsor_impressions (sponsor_id, date DESC);

ALTER TABLE sponsor_impressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read sponsor_impressions authenticated"
  ON sponsor_impressions FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION track_sponsor_impression(p_sponsor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO sponsor_impressions (sponsor_id, date, count)
  VALUES (p_sponsor_id, CURRENT_DATE, 1)
  ON CONFLICT (sponsor_id, date)
  DO UPDATE SET count = sponsor_impressions.count + 1,
                updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION track_sponsor_impression(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION track_sponsor_impression(uuid) TO anon;
