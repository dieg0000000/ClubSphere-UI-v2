/*
  # Seed Team Categories with Correct Structure

  1. Changes
    - Clear existing team categories
    - Add junior categories as specified
    - Add active categories as specified

  2. Junior Categories (10 items)
    1. Youth League A
    2. 1er degré
    3. 2e degré
    4. Youth League
    5. D-9 (à 9)
    6. D-7 (à 7)
    7. Football Enfants Catégorie FF-11 (Brack.ch play more football)
    8. FF-14 (9v9 ou 7v7)
    9. FF-17
    10. ACVF +4

  3. Active Categories (6 items)
    1. 3ème ligue
    2. 4ème ligue
    3. 5ème ligue
    4. Seniors +30
    5. Seniors +40
    6. Seniors +50
*/

-- Clear existing categories
DELETE FROM team_categories;

-- Insert junior categories
INSERT INTO team_categories (type, name, display_order, active) VALUES
  ('junior', 'Youth League A', 1, true),
  ('junior', '1er degré', 2, true),
  ('junior', '2e degré', 3, true),
  ('junior', 'Youth League', 4, true),
  ('junior', 'D-9 (à 9)', 5, true),
  ('junior', 'D-7 (à 7)', 6, true),
  ('junior', 'Football Enfants Catégorie FF-11 (Brack.ch play more football)', 7, true),
  ('junior', 'FF-14 (9v9 ou 7v7)', 8, true),
  ('junior', 'FF-17', 9, true),
  ('junior', 'ACVF +4', 10, true);

-- Insert active categories
INSERT INTO team_categories (type, name, display_order, active) VALUES
  ('active', '3ème ligue', 1, true),
  ('active', '4ème ligue', 2, true),
  ('active', '5ème ligue', 3, true),
  ('active', 'Seniors +30', 4, true),
  ('active', 'Seniors +40', 5, true),
  ('active', 'Seniors +50', 6, true);