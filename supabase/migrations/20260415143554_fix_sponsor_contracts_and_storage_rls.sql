/*
  # Fix RLS policies for sponsor_contracts and contracts storage

  ## Changes
  1. sponsor_contracts table
     - Enable RLS
     - Add separate SELECT, INSERT, UPDATE, DELETE policies for authenticated users
  2. storage.objects for sponsor-contracts bucket
     - Add separate SELECT, INSERT, UPDATE, DELETE policies for authenticated users
*/

ALTER TABLE sponsor_contracts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'sponsor_contracts' AND policyname = 'Authenticated users can read sponsor contracts'
  ) THEN
    CREATE POLICY "Authenticated users can read sponsor contracts"
      ON sponsor_contracts FOR SELECT
      TO authenticated
      USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'sponsor_contracts' AND policyname = 'Authenticated users can insert sponsor contracts'
  ) THEN
    CREATE POLICY "Authenticated users can insert sponsor contracts"
      ON sponsor_contracts FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'sponsor_contracts' AND policyname = 'Authenticated users can update sponsor contracts'
  ) THEN
    CREATE POLICY "Authenticated users can update sponsor contracts"
      ON sponsor_contracts FOR UPDATE
      TO authenticated
      USING (auth.uid() IS NOT NULL)
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'sponsor_contracts' AND policyname = 'Authenticated users can delete sponsor contracts'
  ) THEN
    CREATE POLICY "Authenticated users can delete sponsor contracts"
      ON sponsor_contracts FOR DELETE
      TO authenticated
      USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated users can read sponsor contract files'
  ) THEN
    CREATE POLICY "Authenticated users can read sponsor contract files"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'contracts');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated users can upload sponsor contract files'
  ) THEN
    CREATE POLICY "Authenticated users can upload sponsor contract files"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'contracts');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated users can update sponsor contract files'
  ) THEN
    CREATE POLICY "Authenticated users can update sponsor contract files"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'contracts')
      WITH CHECK (bucket_id = 'contracts');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated users can delete sponsor contract files'
  ) THEN
    CREATE POLICY "Authenticated users can delete sponsor contract files"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'contracts');
  END IF;
END $$;
