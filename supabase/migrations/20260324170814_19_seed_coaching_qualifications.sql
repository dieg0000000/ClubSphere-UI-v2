/*
  # Seed Coaching Qualifications

  1. New Data
    - Insert 14 coaching qualifications as specified
    - Ordered from basic to advanced levels
    - Includes goalkeeper and fitness trainer certifications

  2. Qualifications List
    1. Cours d'animateur
    2. Diplôme D ASF
    3. Diplôme C Basic (ASF/J+S)
    4. Diplôme C+ / UEFA C
    5. Diplôme B UEFA
    6. Diplôme A UEFA
    7. Diplôme A-Youth Elite UEFA
    8. Licence Pro UEFA
    9-11. Goalkeeper certifications (3 levels)
    12-14. Fitness trainer certifications (3 levels)
*/

-- Insert coaching qualifications
INSERT INTO coaching_qualifications (name, description, display_order, active) VALUES
  (
    'Cours d''animateur',
    'Initiation pour les plus jeunes',
    1,
    true
  ),
  (
    'Diplôme D ASF',
    'Approfondissement pédagogique du football des enfants, souvent en modules',
    2,
    true
  ),
  (
    'Diplôme C Basic (ASF/J+S)',
    'Formation de base pour entraîneurs actifs (actifs, juniors)',
    3,
    true
  ),
  (
    'Diplôme C+ / UEFA C',
    'Suite du C Basic, permet d''entraîner jusqu''en 2e ligue régionale et jeunes juniors',
    4,
    true
  ),
  (
    'Diplôme B UEFA',
    'Formation permettant d''entraîner en 2e ligue interrégionale, CCJL, et juniors',
    5,
    true
  ),
  (
    'Diplôme A UEFA',
    'Nécessaire pour les ligues supérieures (1ère ligue, féminine LNA)',
    6,
    true
  ),
  (
    'Diplôme A-Youth Elite UEFA',
    'Axé sur les équipes espoirs (M-18, M-21)',
    7,
    true
  ),
  (
    'Licence Pro UEFA',
    'Plus haut niveau, requis pour la Super League et la Challenge League',
    8,
    true
  ),
  (
    'Diplôme de Gardien de But Niveau 1',
    'Formation de base pour entraîneur de gardiens de but',
    9,
    true
  ),
  (
    'Diplôme de Gardien de But Niveau 2',
    'Formation avancée pour entraîneur de gardiens de but',
    10,
    true
  ),
  (
    'Diplôme de Gardien de But UEFA GK B',
    'Certification UEFA pour entraîneur de gardiens de but',
    11,
    true
  ),
  (
    'Diplôme de Préparateur Physique ASF Niveau 1',
    'Formation de base en préparation physique',
    12,
    true
  ),
  (
    'Diplôme de Préparateur Physique ASF Niveau 2',
    'Formation intermédiaire en préparation physique',
    13,
    true
  ),
  (
    'Diplôme de Préparateur Physique ASF Niveau 3',
    'Formation avancée en préparation physique',
    14,
    true
  );