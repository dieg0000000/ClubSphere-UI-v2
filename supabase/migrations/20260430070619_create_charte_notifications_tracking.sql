/*
  # Charte notifications tracking

  1. New Table
    - `charte_notifications`: tracks which recipient received the charte email
      - `id` uuid PK
      - `document_id` uuid FK documents
      - `recipient_email` text
      - `recipient_user_id` uuid (nullable)
      - `recipient_member_id` uuid (nullable) — for a minor
      - `is_test` boolean default false
      - `sent_at` timestamptz default now()
      - `sent_by` uuid FK profiles (the admin who triggered the send)
  2. Security
    - RLS enabled, only admin/committee roles can read/write
*/

CREATE TABLE IF NOT EXISTS charte_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  recipient_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  recipient_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  is_test boolean NOT NULL DEFAULT false,
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by uuid REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_charte_notifications_document_id ON charte_notifications(document_id);
CREATE INDEX IF NOT EXISTS idx_charte_notifications_recipient_email ON charte_notifications(recipient_email);

ALTER TABLE charte_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read charte notifications" ON charte_notifications;
CREATE POLICY "Admins can read charte notifications"
  ON charte_notifications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'president', 'vice_president', 'committee')
    )
  );

DROP POLICY IF EXISTS "Admins can insert charte notifications" ON charte_notifications;
CREATE POLICY "Admins can insert charte notifications"
  ON charte_notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'president', 'vice_president', 'committee')
    )
  );
