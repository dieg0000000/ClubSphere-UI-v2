/*
  # Backfill member_id on adult self-acknowledgements

  1. Purpose
    - Historical adult self-validations of charter documents stored only
      `user_id`, leaving `member_id` NULL. The admin "Suivi des chartes"
      page joins acknowledgements by `member_id`, so adult self-validations
      were invisible.

  2. Changes
    - Updates `document_acknowledgements` rows where `member_id IS NULL`
      and `validated_by_parent_id IS NULL`, matching the `user_id` to
      a `members.id` via case-insensitive email lookup against
      `auth.users.email`.

  3. Safety
    - Read-only join; only populates NULL values. No data is overwritten
      or deleted. Parent-validation rows (with `validated_by_parent_id`)
      are excluded and unaffected.
*/

UPDATE public.document_acknowledgements ack
   SET member_id = m.id
  FROM auth.users au
  JOIN public.members m ON lower(m.email) = lower(au.email)
 WHERE ack.user_id = au.id
   AND ack.member_id IS NULL
   AND ack.validated_by_parent_id IS NULL;
