/*
  # Create Notification System

  1. New Tables
    - `notification_routing`
      - `id` (uuid, primary key)
      - `event_type` (text)
      - `recipient_type` (text: role/user)
      - `recipient_id` (text - role name or user uuid)
      - `channel` (text: email/push/both)
      - `active` (boolean)
    
    - `notification_log`
      - `id` (uuid, primary key)
      - `event_type` (text)
      - `recipient_id` (uuid)
      - `sent_at` (timestamptz)
      - `channel` (text)
      - `payload` (jsonb)
      - `success` (boolean)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users based on role
*/

-- Create notification_routing table
CREATE TABLE IF NOT EXISTS notification_routing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN ('absence_justified', 'absence_unjustified', 'match_cancelled', 'match_postponed', 'match_last_minute', 'reminder_r1', 'reminder_r2', 'new_message', 'training_reminder_j8', 'training_reminder_j3', 'training_reminder_j1', 'match_reminder_j5', 'match_reminder_j2')),
  recipient_type text NOT NULL CHECK (recipient_type IN ('role', 'user')),
  recipient_id text NOT NULL,
  channel text DEFAULT 'both' CHECK (channel IN ('email', 'push', 'both')),
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notification_routing ENABLE ROW LEVEL SECURITY;

-- Create notification_log table
CREATE TABLE IF NOT EXISTS notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  recipient_id uuid NOT NULL,
  sent_at timestamptz DEFAULT now(),
  channel text NOT NULL,
  payload jsonb,
  success boolean DEFAULT false
);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_notification_routing_event_type ON notification_routing(event_type);
CREATE INDEX IF NOT EXISTS idx_notification_routing_active ON notification_routing(active);
CREATE INDEX IF NOT EXISTS idx_notification_log_event_type ON notification_log(event_type);
CREATE INDEX IF NOT EXISTS idx_notification_log_recipient_id ON notification_log(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_sent_at ON notification_log(sent_at DESC);

-- RLS Policies for notification_routing
CREATE POLICY "Admins can view notification routing"
  ON notification_routing FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert notification routing"
  ON notification_routing FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  );

CREATE POLICY "Admins can update notification routing"
  ON notification_routing FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete notification routing"
  ON notification_routing FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  );

-- RLS Policies for notification_log
CREATE POLICY "Admins can view notification log"
  ON notification_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  );

CREATE POLICY "System can insert notification log"
  ON notification_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Insert default notification routing rules
INSERT INTO notification_routing (event_type, recipient_type, recipient_id, channel, active)
VALUES 
  ('absence_justified', 'role', 'coach', 'both', true),
  ('absence_unjustified', 'role', 'coach', 'both', true),
  ('match_cancelled', 'role', 'member', 'both', true),
  ('match_postponed', 'role', 'member', 'both', true)
ON CONFLICT DO NOTHING;