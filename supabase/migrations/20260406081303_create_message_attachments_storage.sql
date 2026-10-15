/*
  # Create Message Attachments Storage System

  1. Storage Bucket
    - Creates 'message-attachments' bucket for storing images and videos
    - Public read access for viewing attachments
    - Authenticated write access for uploading

  2. New Columns in conversation_messages
    - `attachment_url` (text) - URL to the stored file
    - `attachment_type` (text) - Type of attachment: 'image' or 'video'
    - `attachment_name` (text) - Original filename

  3. Security
    - Public can read all attachments
    - Authenticated users can upload attachments
    - Only authenticated users can delete their own attachments
*/

-- Create storage bucket for message attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-attachments',
  'message-attachments',
  true,
  52428800, -- 50MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/x-msvideo']
)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Public can view message attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload message attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own message attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own message attachments" ON storage.objects;

-- Set up storage policies for message-attachments bucket
CREATE POLICY "Public can view message attachments"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'message-attachments');

CREATE POLICY "Authenticated users can upload message attachments"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'message-attachments');

CREATE POLICY "Users can update their own message attachments"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'message-attachments' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'message-attachments' AND owner = auth.uid());

CREATE POLICY "Users can delete their own message attachments"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'message-attachments' AND owner = auth.uid());

-- Add attachment columns to conversation_messages table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversation_messages' AND column_name = 'attachment_url'
  ) THEN
    ALTER TABLE conversation_messages ADD COLUMN attachment_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversation_messages' AND column_name = 'attachment_type'
  ) THEN
    ALTER TABLE conversation_messages ADD COLUMN attachment_type text CHECK (attachment_type IN ('image', 'video'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversation_messages' AND column_name = 'attachment_name'
  ) THEN
    ALTER TABLE conversation_messages ADD COLUMN attachment_name text;
  END IF;
END $$;