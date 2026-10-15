/*
  # Fix Team Categories and Coaching Qualifications Seeding

  1. Changes
    - Clear incorrect data from team_categories table
    - Reseed team_categories with correct junior and active categories
    - Clear coaching_qualifications table
    - Reseed coaching_qualifications with correct Swiss football certifications

  2. Team Categories
    - 10 junior categories (Youth League A, 1er degré, 2e degré, etc.)
    - 6 active categories (3ème ligue, 4ème ligue, 5ème ligue, Seniors)

  3. Coaching Qualifications
    - 14 official Swiss football coaching certifications
    - From basic animation courses to UEFA Pro License
    - Includes goalkeeper and physical trainer specializations
*/

-- Clear existing data
DELETE FROM team_categories;
DELETE FROM coaching_qualifications;

-- Reseed team_categories with correct data
INSERT INTO team_categories (type, name, display_order, active) VALUES
-- Juniors
('junior', 'Youth League A', 1, true),
('junior', '1er degré', 2, true),
('junior', '2e degré', 3, true),
('junior', 'Youth League', 4, true),
('junior', 'D-9 (à 9)', 5, true),
('junior', 'D-7 (à 7)', 6, true),
('junior', 'Football Enfants Catégorie FF-11 (Brack.ch play more football)', 7, true),
('junior', 'FF-14 (9v9 ou 7v7)', 8, true),
('junior', 'FF-17', 9, true),
('junior', 'ACVF +4', 10, true),
-- Actives
('active', '3ème ligue', 1, true),
('active', '4ème ligue', 2, true),
('active', '5ème ligue', 3, true),
('active', 'Seniors +30', 4, true),
('active', 'Seniors +40', 5, true),
('active', 'Seniors +50', 6, true);

-- Reseed coaching_qualifications with correct data
INSERT INTO coaching_qualifications (name, description, display_order, active) VALUES
('Cours d''animateur', 'Initiation pour les plus jeunes', 1, true),
('Diplôme D ASF', 'Approfondissement pédagogique du football des enfants, souvent en modules', 2, true),
('Diplôme C Basic (ASF/J+S)', 'Formation de base pour entraîneurs actifs (actifs, juniors)', 3, true),
('Diplôme C+ / UEFA C', 'Suite du C Basic, permet d''entraîner jusqu''en 2e ligue régionale et jeunes juniors', 4, true),
('Diplôme B UEFA', 'Formation permettant d''entraîner en 2e ligue interrégionale, CCJL, et juniors', 5, true),
('Diplôme A UEFA', 'Nécessaire pour les ligues supérieures (1ère ligue, féminine LNA)', 6, true),
('Diplôme A-Youth Elite UEFA', 'Axé sur les équipes espoirs (M-18, M-21)', 7, true),
('Licence Pro UEFA', 'Plus haut niveau, requis pour la Super League et la Challenge League', 8, true),
('Diplôme de Gardien de But Niveau 1', 'Gardien de but - niveau 1', 9, true),
('Diplôme de Gardien de But Niveau 2', 'Gardien de but - niveau 2', 10, true),
('Diplôme de Gardien de But UEFA GK B', 'Gardien de but - UEFA GK B', 11, true),
('Diplôme de Préparateur Physique ASF Niveau 1', 'Préparateur physique - niveau 1', 12, true),
('Diplôme de Préparateur Physique ASF Niveau 2', 'Préparateur physique - niveau 2', 13, true),
('Diplôme de Préparateur Physique ASF Niveau 3', 'Préparateur physique - niveau 3', 14, true);