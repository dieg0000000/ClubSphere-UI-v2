/*
  # Fix sponsor_contracts.end_date off-by-one

  1. Context
    - Existing contracts were saved with end_date = start_date + duration_years
    - The new convention is: end_date = anniversary - 1 day (inclusive end)

  2. Changes
    - Subtract 1 day from every existing sponsor_contracts.end_date
    - One-shot data migration; no schema change

  3. Notes
    - Idempotency: this migration MUST run only once. The matching application
      code change ensures all new rows already store the corrected value.
*/

UPDATE public.sponsor_contracts
SET end_date = end_date - INTERVAL '1 day'
WHERE end_date IS NOT NULL;
