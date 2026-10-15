/*
  # Add finance_module_enabled flag to club_settings

  1. Changes
    - Adds boolean column `finance_module_enabled` to `club_settings` (default true, NOT NULL).
    - When false, the Finances module will be hidden everywhere in the app
      (sidebar, /admin/finances routes, billing UI, etc.).

  2. Notes
    - Default true preserves existing behavior for all existing clubs.
    - Idempotent: uses IF NOT EXISTS.
*/

ALTER TABLE public.club_settings
  ADD COLUMN IF NOT EXISTS finance_module_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.club_settings.finance_module_enabled IS
  'When false, the Finances module is hidden everywhere in the app: sidebar menu, /admin/finances routes, billing tabs in player views, send-invoice options, parent/player billing pages. Useful for clubs using a third-party billing tool.';
