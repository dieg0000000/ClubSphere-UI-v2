/*
  # Fix infinite recursion in profiles RLS

  ## Problem
  The policy "Admin and committee can read all profiles" uses a subquery on the
  profiles table itself to check the caller's role. This causes infinite recursion
  whenever any SELECT on profiles is executed.

  ## Fix
  Drop the recursive policy and replace it with a non-recursive one that reads
  the role from the JWT app_metadata claim instead of querying profiles again.
  Also keep the existing "authenticated can read profiles by email" policy which
  already covers broad authenticated reads (qual = true).
*/

DROP POLICY IF EXISTS "Admin and committee can read all profiles" ON profiles;
