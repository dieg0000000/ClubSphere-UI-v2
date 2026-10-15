/*
  # Update finance_module_enabled column comment

  1. Context
    - The toggle was renamed in the UI to "Module Facturation des cotisations"
    - The Sponsors module is now independent of this toggle
    - The DB column name stays unchanged for backwards compatibility

  2. Changes
    - Update column comment to reflect the new scope
*/

COMMENT ON COLUMN public.club_settings.finance_module_enabled IS
  'When false, the cotisation invoicing module is hidden (Finances dashboard, invoices, configuration, seasons, cotisations). The Sponsors module remains accessible.';
