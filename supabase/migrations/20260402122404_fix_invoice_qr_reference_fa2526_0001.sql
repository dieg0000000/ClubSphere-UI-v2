/*
  # Fix QR Reference for Invoice FA2526-0001

  1. Updates
    - Corrects the `qr_reference` for invoice FA2526-0001 to use proper mod-10 recursive check digit
    - The reference was incorrectly set to "1", now fixed to proper 27-digit format
    
  2. Details
    - Invoice number 1 generates base: 00000000000000000000000001 (26 digits)
    - Mod-10 recursive algorithm calculates check digit: 1
    - Final QR reference: 000000000000000000000000011 (27 digits)
*/

-- Fix the QR reference for the existing invoice
UPDATE invoices 
SET qr_reference = '000000000000000000000000011'
WHERE invoice_number = 'FA2526-0001';
