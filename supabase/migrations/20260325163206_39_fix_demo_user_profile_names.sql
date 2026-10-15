/*
  # Fix demo user profile names

  1. Changes
    - Update profile names for demo users (admin, coach, member)
    - Set correct first_name and last_name for each demo account
    - Clear phone numbers for demo accounts

  2. Updates
    - admin@club.ch → Admin ClubSphere
    - coach@club.ch → Coach Demo  
    - member@club.ch → Membre Demo
*/

UPDATE profiles SET 
  first_name = 'Admin',
  last_name = 'ClubSphere',
  phone = null
WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@club.ch');

UPDATE profiles SET 
  first_name = 'Coach',
  last_name = 'Demo',
  phone = null
WHERE id = (SELECT id FROM auth.users WHERE email = 'coach@club.ch');

UPDATE profiles SET 
  first_name = 'Membre',
  last_name = 'Demo',
  phone = null
WHERE id = (SELECT id FROM auth.users WHERE email = 'member@club.ch');