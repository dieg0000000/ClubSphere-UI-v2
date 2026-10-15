/*
# Fix email_events RLS policy to allow reading rows with NULL club_id

## Problem
The Resend webhook inserts email delivery events (email.delivered, email.bounced, etc.)
into `email_events` without a `club_id` because the webhook has no club context.
The existing RLS policy `club_id = current_user_club_id()` filters these rows out,
causing the `invoice_email_status` view's LATERAL JOIN to return NULL for email_status.
This makes delivered invoices show a "pending" clock icon instead of a green check.

## Fix
Update the SELECT policy to also allow reading rows where `club_id IS NULL`.
Security is maintained because:
1. The `invoice_email_status` view already filters through `notification_log`
   which has its own RLS (admin/committee + own club only).
2. Direct email_events access for NULL club_id rows is harmless — these rows
   only contain delivery status metadata (no sensitive content).

## Modified Tables
- `email_events`: Updated SELECT policy to include NULL club_id rows.
*/

DROP POLICY IF EXISTS "View email events of own club" ON email_events;
CREATE POLICY "View email events of own club"
  ON email_events FOR SELECT
  TO authenticated
  USING (club_id = current_user_club_id() OR club_id IS NULL);
