/*
  # Create club_notification_config table

  ## Summary
  Centralizes notification settings at the club level instead of per-user.

  ## New Tables
  - `club_notification_config`
    - `id` (uuid, primary key)
    - `notification_type` (text, unique) — the type key
    - `enabled` (boolean, default true) — whether this notification type is active club-wide
    - `description` (text) — human-readable label
    - `created_at` (timestamptz)

  ## Security
  - RLS enabled
  - Single policy: authenticated users can read; write requires admin (enforced at app level via canEdit)

  ## Notes
  - Seeds 8 default notification types
  - Uses ON CONFLICT DO NOTHING to be safe on re-runs
*/

CREATE TABLE IF NOT EXISTS club_notification_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type text NOT NULL UNIQUE,
  enabled boolean DEFAULT true,
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE club_notification_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth club_notification_config"
  ON club_notification_config
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

INSERT INTO club_notification_config (notification_type, enabled, description) VALUES
  ('new_message', true, 'Nouveau message dans une conversation'),
  ('match_reminder', true, 'Rappel avant un match'),
  ('training_reminder', true, 'Rappel avant un entraînement'),
  ('invoice_sent', true, 'Facture envoyée'),
  ('invoice_reminder', true, 'Rappel de paiement'),
  ('event_reminder', true, 'Rappel avant un événement'),
  ('news_published', true, 'Nouvelle actualité publiée'),
  ('attendance_request', true, 'Demande de présence match')
ON CONFLICT DO NOTHING;
