/*
  # Update Team Categories to Official ACVF Structure

  1. Changes
    - Clear all existing team categories
    - Insert official ACVF (Association Cantonale Vaudoise de Football) categories
    
  2. Junior Categories (Masculins)
    - 22 categories covering ages 6-21
    - From Juniors G (6-7 ans) to Juniors A Youth League (19-21 ans)
    - Includes different degrees (1er, 2ème, 3ème degré)
    - Elite, Promotion, and Youth League levels
    
  3. Junior Categories (Féminines)
    - 7 categories covering ages 6-21
    - FF7 through FF21 age groups
    
  4. Active Categories
    - 7 professional/senior leagues
    - From 5ème ligue to Hoval Promotion League
*/

-- Clear existing categories
DELETE FROM team_categories;

-- Insert official ACVF categories
INSERT INTO team_categories (type, name, display_order, active) VALUES

-- Juniors Masculins
('junior', 'Juniors G (6-7 ans)', 1, true),
('junior', 'Juniors F (8-9 ans)', 2, true),
('junior', 'Juniors E - 1er degré (10-11 ans)', 3, true),
('junior', 'Juniors E - 2ème degré (10-11 ans)', 4, true),
('junior', 'Juniors E - 3ème degré (10-11 ans)', 5, true),
('junior', 'Juniors D7 - 1er degré (12-13 ans)', 6, true),
('junior', 'Juniors D7 - 2ème degré (12-13 ans)', 7, true),
('junior', 'Juniors D7 - 3ème degré (12-13 ans)', 8, true),
('junior', 'Juniors D9 - 1er degré (13-14 ans)', 9, true),
('junior', 'Juniors D9 - 2ème degré (13-14 ans)', 10, true),
('junior', 'Juniors D9 - Elite (13-14 ans)', 11, true),
('junior', 'Juniors C - 1er degré (15-16 ans)', 12, true),
('junior', 'Juniors C - 2ème degré (15-16 ans)', 13, true),
('junior', 'Juniors C - Promotion (15-16 ans)', 14, true),
('junior', 'Juniors C - Youth League (15-16 ans)', 15, true),
('junior', 'Juniors B - 1er degré (17-19 ans)', 16, true),
('junior', 'Juniors B - 2ème degré (17-19 ans)', 17, true),
('junior', 'Juniors B - Promotion (17-19 ans)', 18, true),
('junior', 'Juniors B - Youth League (17-19 ans)', 19, true),
('junior', 'Juniors A - 1er degré (19-21 ans)', 20, true),
('junior', 'Juniors A - Promotion (19-21 ans)', 21, true),
('junior', 'Juniors A - Youth League (19-21 ans)', 22, true),

-- Juniors Féminines
('junior', 'Féminines FF7 (6-7 ans)', 23, true),
('junior', 'Féminines FF9 (8-9 ans)', 24, true),
('junior', 'Féminines FF11 (10-11 ans)', 25, true),
('junior', 'Féminines FF14-7 (12-14 ans)', 26, true),
('junior', 'Féminines FF14-9 (12-14 ans)', 27, true),
('junior', 'Féminines FF17 (15-18 ans)', 28, true),
('junior', 'Féminines FF21 (18-21 ans)', 29, true),

-- Équipes actives
('active', 'Actifs 5ème ligue', 1, true),
('active', 'Actifs 4ème ligue', 2, true),
('active', 'Actifs 3ème ligue', 3, true),
('active', 'Actifs 2ème ligue', 4, true),
('active', '2e ligue interrégionale', 5, true),
('active', '1ère Ligue', 6, true),
('active', 'Hoval Promotion League', 7, true);