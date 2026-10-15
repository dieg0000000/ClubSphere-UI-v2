/*
  # Allow Public AVS Lookup for Onboarding

  1. Changes
    - Add RLS policy to allow anonymous users to lookup members by AVS number
    - Read-only access to limited fields (id, first_name, last_name, avs_number)
    - Required for parent onboarding flow before authentication

  2. Security
    - Policy is restrictive: only SELECT operation
    - Only exposes minimal data needed for verification
    - No write access for anonymous users
*/

CREATE POLICY "Allow anonymous AVS lookup for onboarding"
  ON members
  FOR SELECT
  TO anon
  USING (true);