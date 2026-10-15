/*
  # Add member photo_url column and member-photos storage bucket

  1. Changes
    - Adds `photo_url` column (text, nullable) to `members` for storing each member's profile photo URL.
    - Creates public storage bucket `member-photos` with a 1 MB size limit and restricted to webp/jpeg/png.
    - Adds RLS policies on storage.objects so authenticated users can only insert/update/delete files under their own `{auth.uid()}/` folder, while everyone can read photos (public bucket).

  2. Security
    - Write access scoped to the user's own folder via `auth.uid()` path check.
    - Public read is intentional since member photos are rendered in the team list.
*/

ALTER TABLE members ADD COLUMN IF NOT EXISTS photo_url TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'member-photos',
  'member-photos',
  true,
  1048576,
  ARRAY['image/webp', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 1048576,
  allowed_mime_types = ARRAY['image/webp', 'image/jpeg', 'image/png'];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'member_photos_insert_own'
  ) THEN
    CREATE POLICY "member_photos_insert_own"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'member-photos'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'member_photos_update_own'
  ) THEN
    CREATE POLICY "member_photos_update_own"
      ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'member-photos'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'member_photos_delete_own'
  ) THEN
    CREATE POLICY "member_photos_delete_own"
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'member-photos'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'member_photos_public_read'
  ) THEN
    CREATE POLICY "member_photos_public_read"
      ON storage.objects FOR SELECT TO public
      USING (bucket_id = 'member-photos');
  END IF;
END $$;
