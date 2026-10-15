/*
  # Add licence_chez column to members

  1. Changes
    - Add nullable text column `licence_chez` to `public.members`.

  2. Purpose
    - Represents the club holding the player's ASF licence.
    - Distinct from `club_origine` (original club) and from the team/groupement the player currently plays with.
    - Used primarily for groupement imports where licence may reside with a partner club.

  3. Notes
    - Nullable, no default.
    - No RLS change; existing members policies apply.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'members'
      AND column_name = 'licence_chez'
  ) THEN
    ALTER TABLE public.members ADD COLUMN licence_chez text;
  END IF;
END $$;
