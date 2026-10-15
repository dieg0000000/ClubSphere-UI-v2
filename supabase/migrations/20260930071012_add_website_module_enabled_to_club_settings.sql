/*
# Add website_module_enabled to club_settings

1. Modified Tables
   - `club_settings`
     - `website_module_enabled` (boolean, default false) — controls visibility of website publishing features in the UI

2. Notes
   - When false, all website publishing UI is hidden but stored publication choices are preserved.
   - Only club admins can change this via existing club_settings RLS policies.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'club_settings'
      AND column_name = 'website_module_enabled'
  ) THEN
    ALTER TABLE club_settings ADD COLUMN website_module_enabled boolean NOT NULL DEFAULT false;
  END IF;
END $$;
