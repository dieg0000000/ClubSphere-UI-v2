CREATE OR REPLACE FUNCTION lookup_member_by_avs(avs_input text, p_club_id uuid)
RETURNS TABLE(id uuid, first_name text, last_name text) AS $$
BEGIN
  RETURN QUERY
  SELECT m.id, m.first_name, m.last_name
  FROM members m
  WHERE m.avs_number = TRIM(avs_input)
    AND m.club_id = p_club_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION lookup_member_by_avs(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION lookup_member_by_avs(text, uuid) TO authenticated;

COMMENT ON FUNCTION lookup_member_by_avs(text, uuid) IS 'Securely lookup member by AVS number scoped to a specific club. Returns only id and name.';
