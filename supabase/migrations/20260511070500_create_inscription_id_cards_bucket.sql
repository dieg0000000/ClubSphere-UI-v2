/*
  # Public player inscription — Storage bucket

  1. New Storage
    - Bucket `inscription-id-cards` (private)
      - File size limit: 5 MB
      - Allowed MIME types: image/jpeg, image/png, image/webp

  2. Security — storage.objects policies for this bucket
    - INSERT: allow anyone (anon + authenticated). The edge function
      enforces the path convention `{inscription_request_id}/{front|back|photo}`.
    - SELECT: authenticated admin / committee / president / vice_president only
    - DELETE: authenticated admin / committee / president / vice_president only
      (automated cleanup uses service role, which bypasses RLS).
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inscription-id-cards',
  'inscription-id-cards',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Anyone can upload inscription id cards"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'inscription-id-cards');

CREATE POLICY "Admins and committee can view inscription id cards"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'inscription-id-cards'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'committee', 'president', 'vice_president')
    )
  );

CREATE POLICY "Admins and committee can delete inscription id cards"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'inscription-id-cards'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'committee', 'president', 'vice_president')
    )
  );
