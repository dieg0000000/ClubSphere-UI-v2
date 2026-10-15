/*
  # Volunteer Management System

  ## Summary
  Creates three new tables to support a complete volunteer management module for club events.

  ## New Tables

  ### volunteer_post_templates
  - Global reusable post library, not tied to any specific event
  - Fields: name, description, default_start_time, default_end_time, default_count

  ### event_volunteer_posts
  - Posts assigned to a specific event (may reference a template for pre-filling)
  - Fields: event_id, template_id, name, description, start_time, end_time, required_count

  ### event_volunteers
  - Volunteer registrations per event
  - Fields: event_id, user_id, first/last name, email, phone, availability window,
    preferred_posts (array), notes, status (pending/confirmed/refused), assigned_post_id

  ## Security
  - RLS enabled on all three tables
  - Authenticated users can read/write all records (admin-managed data)

  ## Seed Data
  - 12 default post templates for Swiss football club events
*/

CREATE TABLE IF NOT EXISTS volunteer_post_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  default_start_time time,
  default_end_time time,
  default_count integer DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_volunteer_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  template_id uuid REFERENCES volunteer_post_templates(id),
  name text NOT NULL,
  description text,
  start_time time NOT NULL,
  end_time time NOT NULL,
  required_count integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_volunteers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text,
  availability_start time,
  availability_end time,
  preferred_posts text[],
  notes text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'refused')),
  assigned_post_id uuid REFERENCES event_volunteer_posts(id),
  registered_at timestamptz DEFAULT now()
);

ALTER TABLE volunteer_post_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_volunteer_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_volunteers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'volunteer_post_templates' AND policyname = 'Authenticated users can manage volunteer post templates'
  ) THEN
    CREATE POLICY "Authenticated users can manage volunteer post templates"
      ON volunteer_post_templates FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'event_volunteer_posts' AND policyname = 'Authenticated users can manage event volunteer posts'
  ) THEN
    CREATE POLICY "Authenticated users can manage event volunteer posts"
      ON event_volunteer_posts FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'event_volunteers' AND policyname = 'Authenticated users can manage event volunteers'
  ) THEN
    CREATE POLICY "Authenticated users can manage event volunteers"
      ON event_volunteers FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

INSERT INTO volunteer_post_templates (name, description, default_start_time, default_end_time, default_count) VALUES
('Accueil des équipes', 'Distribution des équipements, bons de repas, bons de boissons, explications', '07:00', '09:00', 2),
('Arbitre', 'Arbitrage des matchs — idéalement joueurs catégories C, B ou A', '08:00', '18:00', 12),
('Caisse', 'Gestion de la caisse et des entrées', '07:30', '18:00', 2),
('Bar roulotte', 'Service au bar roulotte', '07:30', '18:00', 2),
('Service boissons', 'Distribution des boissons', '07:30', '18:00', 3),
('Service nourriture visiteurs', 'Service repas aux visiteurs', '07:30', '18:00', 3),
('Cuisine', 'Préparation des repas', '07:30', '18:00', 6),
('Service nourriture joueurs', 'Service repas aux joueurs', '11:00', '14:00', 5),
('Speaker matchs', 'Annonce des matchs et résultats', '07:30', '18:00', 2),
('Saisie des résultats', 'Saisie et affichage des résultats', '07:30', '18:00', 2),
('Vidange poubelles', 'Collecte des poubelles sur les terrains', '07:30', '19:00', 2),
('Nettoyage toilettes', 'Contrôle et nettoyage des toilettes toutes les 1h30', '07:30', '18:00', 1)
ON CONFLICT DO NOTHING;
