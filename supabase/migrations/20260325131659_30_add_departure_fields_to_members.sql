/*
  # Add departure management fields to members

  1. Changes
    - Add `departure_note` TEXT column to store reason for departure
    - Add `departure_date` DATE column to store the departure date
    - Update existing data to ensure columns exist

  2. Notes
    - departure_note: Contains the reason why the player is leaving
    - departure_date: Date when the player left or will leave
    - Both fields are optional and only used when status is 'a_declarer_partant' or 'parti'
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'departure_note'
  ) THEN
    ALTER TABLE members ADD COLUMN departure_note TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'departure_date'
  ) THEN
    ALTER TABLE members ADD COLUMN departure_date DATE;
  END IF;
END $$;