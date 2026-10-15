/*
  # Seed Demo Data for ClubSphere

  This migration populates the database with:
  - 3 demo users (admin, coach, member)
  - 2 teams (Juniors U14, Actifs 1ère)
  - 3 news articles
  - 2 upcoming events
  - 5 documents
*/

-- Note: User creation must be done through Supabase Auth API
-- Here we'll add profiles for existing auth users and other data

-- Insert Teams
INSERT INTO teams (id, name, category, training_schedule, location) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Juniors U14', 'Juniors U8–U18', 'Mardi 18h - Jeudi 18h', 'Stade Municipal, Rue du Stade 1'),
  ('22222222-2222-2222-2222-222222222222', 'Actifs 1ère', 'Seniors', 'Lundi 20h - Mercredi 20h', 'Stade Municipal, Rue du Stade 1');

-- Insert News Articles
INSERT INTO news (id, title, body, category, published_at) VALUES
  (
    '33333333-3333-3333-3333-333333333333',
    'Victoire impressionnante contre FC Valley',
    'Notre équipe a remporté un match spectaculaire 5-2 ce dimanche. Avec des performances exceptionnelles de tous nos joueurs, cette victoire nous place en excellente position pour le prochain match de playoff.',
    'News',
    now() - interval '2 days'
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    'Réunion extraordinaire du comité prévue',
    'Une réunion extraordinaire du comité sera tenue samedi 15 mars à 14h au siège du club. Tous les membres du comité sont priés de confirmer leur présence.',
    'Official announcement',
    now() - interval '5 days'
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    'Repas de soutien de l''équipe U14',
    'Les parents de l''équipe U14 organisent un repas de soutien samedi 22 mars après le match. Participation générale souhaitée pour créer une belle ambiance.',
    'Support meal',
    now() - interval '1 day'
  );

-- Insert Events
INSERT INTO events (id, title, description, type, date, location, max_attendees) VALUES
  (
    '66666666-6666-6666-6666-666666666666',
    'Tournoi interne de printemps',
    'Grand tournoi interne où toutes les équipes du club se affrontront. Idéal pour la camaraderie et le développement tactique.',
    'Tournament',
    now() + interval '15 days',
    'Stade Municipal',
    150
  ),
  (
    '77777777-7777-7777-7777-777777777777',
    'Assemblée générale annuelle',
    'Assemblée générale annuelle du club. Présentation des comptes, élection du nouveau comité et discussion des projets futurs.',
    'General Assembly',
    now() + interval '30 days',
    'Salle communale, Centre du village',
    200
  );

-- Insert Documents (placeholder URLs)
INSERT INTO documents (id, name, category, file_url) VALUES
  (
    '88888888-8888-8888-8888-888888888888',
    'Règlement des joueurs',
    'Players',
    'https://example.com/player-regulations.pdf'
  ),
  (
    '99999999-9999-9999-9999-999999999999',
    'Guide de coaching',
    'Coaches',
    'https://example.com/coaching-guide.pdf'
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Statuts du club',
    'Administrative',
    'https://example.com/statutes.pdf'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'Code de conduite',
    'Administrative',
    'https://example.com/conduct.pdf'
  ),
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'Budget annuel 2024',
    'Administrative',
    'https://example.com/budget-2024.pdf'
  );

-- Insert Announcements
INSERT INTO announcements (id, message, active) VALUES
  (
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'Attention: L''entraînement de jeudi est annulé en raison des conditions météorologiques.',
    true
  );
