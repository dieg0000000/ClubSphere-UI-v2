/*
  # Update Invoice FA2526-0001 to use RF Reference

  This migration updates the existing invoice FA2526-0001 to use the ISO 11649 RF reference format (SCOR) instead of the old NON reference type.

  ## Changes Made

  1. Calculate RF reference for invoice number 1
     - Base reference: 000000000000000000001 (21 digits)
     - Check string: 000000000000000000001271500
     - Modulo 97 calculation gives check digits: 42
     - Final RF reference: RF42000000000000000000001

  2. Update the qr_reference column for invoice FA2526-0001

  ## Notes

  - The RF reference format is ISO 11649 compliant
  - The reference type in QR codes will now be SCOR instead of NON
  - This provides better payment tracking and international compatibility
*/

-- Update invoice FA2526-0001 with RF reference
-- Calculate: RF + check digits + 21-digit reference
-- For invoice number 1: RF42000000000000000000001

UPDATE invoices
SET qr_reference = 'RF42000000000000000000001'
WHERE invoice_number = 'FA2526-0001';
