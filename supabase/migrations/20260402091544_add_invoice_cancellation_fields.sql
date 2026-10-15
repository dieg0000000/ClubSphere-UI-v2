/*
  # Add invoice cancellation tracking fields

  1. Changes
    - Add `cancelled_at` column to `invoices` table
      - Timestamp field to record when the invoice was cancelled
    - Add `cancelled_reason` column to `invoices` table
      - Text field to store the reason for cancellation (required for audit trail)
    - Add `updated_at` column to `invoices` table
      - Timestamp field to track last modification

  2. Purpose
    - Enable cancellation of invoices with full audit trail
    - Maintain accounting traceability by preserving cancelled invoice records
    - Store cancellation reason for administrative and legal purposes
*/

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
ADD COLUMN IF NOT EXISTS cancelled_reason text,
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
