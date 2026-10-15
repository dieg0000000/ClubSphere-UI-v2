/*
  # Fix contracts storage bucket policies

  ## Problem
  The upload, update, and delete policies on the `contracts` storage bucket
  only allowed users with role = 'admin'. Committee members and other
  authorized roles were blocked from uploading sponsor contract PDFs.

  ## Changes
  - Drop the three admin-only policies (INSERT, UPDATE, DELETE) on the contracts bucket
  - Recreate them to allow any authenticated user with role IN ('admin', 'committee')
    so committee members can also manage sponsor contracts
*/

DROP POLICY IF EXISTS "Admins can upload contracts" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update contracts" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete contracts" ON storage.objects;

CREATE POLICY "Admin or committee can upload contracts"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'contracts'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'committee')
    )
  );

CREATE POLICY "Admin or committee can update contracts"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'contracts'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'committee')
    )
  )
  WITH CHECK (
    bucket_id = 'contracts'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'committee')
    )
  );

CREATE POLICY "Admin or committee can delete contracts"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'contracts'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'committee')
    )
  );
