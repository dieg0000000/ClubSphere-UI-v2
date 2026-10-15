/*
# Add unique index on payments.camt_transaction_id

1. Changes
  - Add a unique index on `payments.camt_transaction_id` (WHERE NOT NULL)
    to prevent duplicate transaction imports from camt.053/054 files.
  - The partial index (WHERE camt_transaction_id IS NOT NULL) ensures
    that rows without a transaction ID (manual payments, legacy rows) are
    not constrained.

2. Important Notes
  - This enables deduplication: the same bank transaction appearing in
    both a camt.054 notification and the camt.053 daily statement will
    only be imported once.
  - On conflict (error code 23505), the application treats it as
    "already imported" rather than a failure.
*/

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_camt_transaction_id_unique
  ON payments (camt_transaction_id)
  WHERE camt_transaction_id IS NOT NULL;
