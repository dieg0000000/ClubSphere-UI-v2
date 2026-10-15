/*
  # Create secure AVS lookup function

  1. New Functions
    - `lookup_member_by_avs(text)` - Secure function to lookup member by AVS number
      - Returns only id, first_name, last_name (never returns AVS number)
      - Uses SECURITY DEFINER to bypass RLS
      - Granted to anonymous users for registration flow

  2. Security
    - Function uses SECURITY DEFINER to run with elevated privileges
    - Only returns non-sensitive data (id, name)
    - Anonymous users can execute this function
    - Rate limiting should be handled at application layer
*/

CREATE OR REPLACE FUNCTION lookup_member_by_avs(avs_input text)
RETURNS TABLE(id uuid, first_name text, last_name text) AS $$
BEGIN
  -- Only return id and name, never the AVS number itself
  RETURN QUERY
  SELECT m.id, m.first_name, m.last_name
  FROM members m
  WHERE m.avs_number = TRIM(avs_input)
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Allow anonymous access to this function only
GRANT EXECUTE ON FUNCTION lookup_member_by_avs(text) TO anon;

COMMENT ON FUNCTION lookup_member_by_avs IS 'Securely lookup member by AVS number. Returns only id and name, never the AVS number itself. Available to anonymous users for registration.';
