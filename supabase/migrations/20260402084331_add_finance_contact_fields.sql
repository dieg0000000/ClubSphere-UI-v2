/*
  # Add finance contact fields to finance_config

  1. Changes
    - Add `contact_phone` column to finance_config table
    - Add `contact_name` column to finance_config table
  
  2. Purpose
    - Store finance-specific contact information
    - Display on invoices for payment-related questions
*/

ALTER TABLE finance_config
ADD COLUMN IF NOT EXISTS contact_phone TEXT,
ADD COLUMN IF NOT EXISTS contact_name TEXT;