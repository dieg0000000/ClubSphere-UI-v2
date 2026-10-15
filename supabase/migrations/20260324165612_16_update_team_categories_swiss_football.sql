/*
  # Update Team Categories with Swiss Football Levels

  1. Changes
    - Delete existing team categories
    - Add new Swiss football categories for juniors
    - Add new Swiss football categories for active teams
  
  2. New Junior Categories
    - Football de Base / Enfants (J+S) - Training levels
    - Various youth levels with official ASF/UEFA designations
    - ACVF and ACVF+ categories

  3. New Active Categories
    - Performance levels (2e ligue, 1ère ligue, etc.)
    - Senior age categories (+30, +40, +50)
    - Professional levels for reference

  4. Security
    - No changes to RLS policies
*/

-- Delete existing categories (this is safe as we're in setup phase)
DELETE FROM team_categories;

-- Insert new junior categories with proper Swiss football structure
INSERT INTO team_categories (type, name, display_order, active) VALUES
  ('junior', 'Football de Base / Enfants (J+S)', 1, true),
  ('junior', 'Cours d''animateur', 2, true),
  ('junior', 'Diplôme D ASF', 3, true),
  ('junior', 'Diplôme C Basic (ASF/J+S)', 4, true),
  ('junior', 'Diplôme C+ / UEFA C', 5, true),
  ('junior', 'J+S Jeunesse et Sport', 6, true),
  ('junior', 'M-18 (U18)', 7, true),
  ('junior', 'M-21 (U21)', 8, true),
  ('junior', 'ACVF', 9, true),
  ('junior', 'ACVF +4', 10, true);

-- Insert new active team categories
INSERT INTO team_categories (type, name, display_order, active) VALUES
  ('active', '3ème ligue', 1, true),
  ('active', '4ème ligue', 2, true),
  ('active', '5ème ligue', 3, true),
  ('active', '2e ligue régionale', 4, true),
  ('active', '2e ligue interrégionale', 5, true),
  ('active', '1ère ligue', 6, true),
  ('active', 'Seniors +30', 7, true),
  ('active', 'Seniors +40', 8, true),
  ('active', 'Seniors +50', 9, true),
  ('active', 'Diplôme B UEFA', 10, true),
  ('active', 'Diplôme A UEFA', 11, true),
  ('active', 'Licence Pro UEFA', 12, true);