/*
  # Add theme preference column to profiles

  1. Changes
    - Add `theme` column to `profiles` table
    - Allows values: 'light', 'dark', 'system', or NULL (same as system)
    - Default is NULL (follow OS prefers-color-scheme)

  2. Security
    - Existing RLS policies on profiles already cover this column
    - Users can update their own profile (existing policy)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'theme'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN theme text DEFAULT NULL;
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_theme_check
      CHECK (theme IS NULL OR theme IN ('light', 'dark', 'system'));
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.theme IS
  'User theme preference. NULL means follow OS preferences (prefers-color-scheme). Values: light, dark, system.';
