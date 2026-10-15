/*
  # Normalize coaches.email and backfill coaches.user_id

  1. Changes
    - Lowercase all non-null `coaches.email` values so they match the
      format stored in `auth.users.email` (Supabase lowercases on signup).
    - Populate `coaches.user_id` for rows where it is currently NULL,
      using a case-insensitive match between `coaches.email` and
      `auth.users.email`.

  2. Security
    - No schema changes. No RLS changes. No policy changes.
    - Data-only migration scoped to the `coaches` table.

  3. Notes
    - Idempotent: the lowercase update skips rows already in lowercase;
      the user_id backfill only touches rows where `user_id IS NULL`.
    - Coaches without a matching auth user remain with `user_id = NULL`
      (they have no login account yet).
*/

UPDATE public.coaches
   SET email = lower(email)
 WHERE email IS NOT NULL
   AND email <> lower(email);

UPDATE public.coaches c
   SET user_id = u.id
  FROM auth.users u
 WHERE c.user_id IS NULL
   AND c.email IS NOT NULL
   AND lower(c.email) = lower(u.email);
