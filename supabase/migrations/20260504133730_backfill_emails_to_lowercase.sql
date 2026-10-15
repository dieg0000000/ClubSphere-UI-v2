/*
  # Backfill all emails to lowercase

  One-shot normalization that aligns existing email values with the
  import/update pipeline (which now lowercases on write).

  1. Changes
     - Lowercases `members.email`, `members.legal_rep1_email`,
       `members.legal_rep2_email`, `members.email_pro`
     - Lowercases `profiles.email`
     - Lowercases `coaches.email`
  2. Notes
     - Only updates rows where value differs from its lowercase form.
     - No schema changes, no RLS changes.
*/

UPDATE public.members
   SET email = lower(email)
 WHERE email IS NOT NULL AND email <> lower(email);

UPDATE public.members
   SET legal_rep1_email = lower(legal_rep1_email)
 WHERE legal_rep1_email IS NOT NULL AND legal_rep1_email <> lower(legal_rep1_email);

UPDATE public.members
   SET legal_rep2_email = lower(legal_rep2_email)
 WHERE legal_rep2_email IS NOT NULL AND legal_rep2_email <> lower(legal_rep2_email);

UPDATE public.members
   SET email_pro = lower(email_pro)
 WHERE email_pro IS NOT NULL AND email_pro <> lower(email_pro);

UPDATE public.profiles
   SET email = lower(email)
 WHERE email IS NOT NULL AND email <> lower(email);

UPDATE public.coaches
   SET email = lower(email)
 WHERE email IS NOT NULL AND email <> lower(email);
