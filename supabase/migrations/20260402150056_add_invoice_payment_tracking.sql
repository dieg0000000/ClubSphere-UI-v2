/*
  # Add invoice payment tracking

  1. New Columns
    - `paid_amount` (decimal) - Actual amount received
    - `balance` (decimal) - Remaining balance (positive = underpaid, negative = overpaid)

  2. Changes
    - Add columns to invoices table if they don't exist
    - Support partial and overpaid invoice tracking
    - Allow 'partial' status in addition to existing statuses
*/

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS balance DECIMAL(10,2);
