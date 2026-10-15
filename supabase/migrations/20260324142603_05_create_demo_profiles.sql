/*
  # Create Demo User Profiles

  1. Changes
    - Insert profiles for the 3 existing auth users (admin, coach, member)
    - These profiles match the auth.users already created in Supabase Auth

  2. Security
    - Profiles are created with appropriate roles
    - RLS policies already in place from previous migration
*/

-- Insert demo profiles for existing auth users
INSERT INTO profiles (id, full_name, email, role, active)
SELECT 
  id,
  CASE 
    WHEN email = 'admin@club.ch' THEN 'Admin User'
    WHEN email = 'coach@club.ch' THEN 'Coach User'
    WHEN email = 'member@club.ch' THEN 'Member User'
  END as full_name,
  email,
  CASE 
    WHEN email = 'admin@club.ch' THEN 'admin'
    WHEN email = 'coach@club.ch' THEN 'coach'
    WHEN email = 'member@club.ch' THEN 'member'
  END as role,
  true as active
FROM auth.users
WHERE email IN ('admin@club.ch', 'coach@club.ch', 'member@club.ch')
ON CONFLICT (id) DO NOTHING;