/*
  # Link volunteer_contacts profile_id on profile creation

  ## Summary
  When a new profile is created (i.e., a user registers on ClubSphere),
  automatically links their profile_id in volunteer_contacts if a record
  with the same email already exists.

  ## How it works
  - A trigger fires AFTER INSERT on the profiles table
  - It searches volunteer_contacts for a matching email (case-insensitive)
  - If found and profile_id is not yet set, it updates the record with the new profile id

  ## Security
  - Trigger runs as SECURITY DEFINER to bypass RLS for the internal update
  - Only updates records where profile_id IS NULL (won't overwrite existing links)
*/

CREATE OR REPLACE FUNCTION link_volunteer_contact_to_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    UPDATE volunteer_contacts
    SET profile_id = NEW.id
    WHERE LOWER(email) = LOWER(NEW.email)
      AND profile_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_created_link_volunteer ON profiles;

CREATE TRIGGER on_profile_created_link_volunteer
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION link_volunteer_contact_to_profile();
