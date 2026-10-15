/*
# Add public read policy to clubs table

1. Security Changes
   - Add SELECT policy on `clubs` for anon + authenticated roles.
   - Only active clubs are readable (`active = true`).
   - This is required for subdomain-based tenant resolution: the frontend
     queries `clubs` by slug before the user is authenticated.

2. Important Notes
   - No table or column changes — only a new RLS policy.
   - The clubs table already has RLS enabled but had zero policies,
     which blocked all reads from the PostgREST API.
*/

DROP POLICY IF EXISTS "public_read_active_clubs" ON clubs;
CREATE POLICY "public_read_active_clubs"
  ON clubs FOR SELECT
  TO anon, authenticated
  USING (active = true);
