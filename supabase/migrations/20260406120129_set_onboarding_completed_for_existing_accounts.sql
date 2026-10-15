/*
  # Set onboarding_completed for existing accounts

  ## Summary
  This migration sets onboarding_completed = true for all existing accounts to prevent them from being redirected to the onboarding flow. Only new users without a role will need to complete onboarding.

  ## Changes
  - Update all existing profiles to have onboarding_completed = true
  - This ensures that admin, coach, committee, and existing member accounts are not affected by the new onboarding flow
*/

-- Set onboarding_completed = true for all existing profiles
UPDATE profiles
SET onboarding_completed = true
WHERE onboarding_completed IS NULL OR onboarding_completed = false;
