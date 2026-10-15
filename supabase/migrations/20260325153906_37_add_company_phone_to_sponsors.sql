/*
  # Add company phone to sponsors table

  1. Changes
    - Add `company_phone` column to `sponsors` table
      - TEXT type for formatted phone numbers
      - Optional field (nullable)
      - For landline phone numbers in Swiss format (+41 21 123 45 67)

  2. Notes
    - This is distinct from the contact mobile phone (phone column)
    - Used for company's main landline number
    - Visible to all users including members (unlike contact mobile)
*/

ALTER TABLE sponsors 
ADD COLUMN IF NOT EXISTS company_phone TEXT;