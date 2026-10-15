/*
  # Add auto send invoices configuration

  1. Changes
    - Add `auto_send_invoices` column to `finance_config` table
      - Boolean field to control automatic invoice sending
      - Defaults to false (manual sending required)

  2. Purpose
    - When enabled, invoices are automatically sent via email upon generation
    - When disabled, invoices are created as drafts and require manual sending
*/

ALTER TABLE finance_config
ADD COLUMN IF NOT EXISTS auto_send_invoices BOOLEAN DEFAULT false;
