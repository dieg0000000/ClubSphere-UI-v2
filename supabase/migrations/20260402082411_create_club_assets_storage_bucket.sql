/*
  # Create club assets storage bucket

  1. Storage Bucket
    - Creates `club-assets` bucket for storing club logos and assets
    - Public bucket for easy access
  
  2. Security
    - Authenticated users can upload to bucket
    - Public read access for assets
*/

-- Create bucket for club assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('club-assets', 'club-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload club assets
CREATE POLICY "Authenticated can upload club assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'club-assets');

-- Allow public read access to club assets
CREATE POLICY "Public can read club assets"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'club-assets');

-- Allow authenticated users to delete club assets
CREATE POLICY "Authenticated can delete club assets"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'club-assets');