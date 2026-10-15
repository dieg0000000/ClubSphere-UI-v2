/*
  # Public player inscription — Phase 1.1

  1. New Tables
    - `inscription_requests`
        Stores public player inscription submissions pending admin validation.
        Captures player identity, address, contact, legal representatives (for minors),
        photo consent, paths to uploaded ID card images in Supabase Storage, and
        workflow fields (status, processing, validation/rejection metadata).

  2. Modified Tables
    - `club_settings`
        Added `inscription_slug` (text, unique) — public slug used in inscription
        form URLs. Backfilled for existing row with `fc-romanel-<7-char-random>`.

  3. Indices
    - `idx_inscription_requests_status`
    - `idx_inscription_requests_submitted_at` (desc)
    - `idx_inscription_requests_birth_date`

  4. Security
    - RLS enabled on `inscription_requests`
    - INSERT: anyone (anonymous + authenticated) — validated further by edge function
    - SELECT / UPDATE / DELETE: only authenticated admin / committee / president / vice_president

  5. Notes
    - `club_id` is nullable for now (multi-tenant ready; filled after multi-tenant refactor).
    - Edge function will use the service role for controlled writes; RLS is defense-in-depth.
    - Storage bucket `inscription-id-cards` and its policies are created in a separate step.
*/

CREATE TABLE IF NOT EXISTS public.inscription_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  club_id uuid,

  has_played_before boolean NOT NULL DEFAULT false,
  asf_licence_number text,

  first_name text NOT NULL,
  last_name text NOT NULL,
  birth_date date NOT NULL,
  gender text,
  nationality text,
  place_of_origin text,

  address text,
  postal_code text,
  city text,

  player_email text,
  player_phone text,

  legal_rep1_firstname text,
  legal_rep1_lastname text,
  legal_rep1_email text,
  legal_rep1_phone text,
  legal_rep2_firstname text,
  legal_rep2_lastname text,
  legal_rep2_email text,
  legal_rep2_phone text,

  photo_consent boolean NOT NULL,
  photo_consent_date timestamptz,

  id_card_front_path text,
  id_card_back_path text,
  passport_photo_path text,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'validated', 'rejected')),
  processed_by uuid REFERENCES public.profiles(id),
  processing_started_at timestamptz,
  validated_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,

  member_id uuid REFERENCES public.members(id),
  team_id uuid REFERENCES public.teams(id),

  submitted_at timestamptz DEFAULT now(),
  submitted_ip text,
  user_agent text,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_inscription_requests_status
  ON public.inscription_requests(status);
CREATE INDEX IF NOT EXISTS idx_inscription_requests_submitted_at
  ON public.inscription_requests(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_inscription_requests_birth_date
  ON public.inscription_requests(birth_date);

ALTER TABLE public.inscription_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit inscription requests"
  ON public.inscription_requests FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins and committee can view inscription requests"
  ON public.inscription_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'committee', 'president', 'vice_president')
    )
  );

CREATE POLICY "Admins and committee can update inscription requests"
  ON public.inscription_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'committee', 'president', 'vice_president')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'committee', 'president', 'vice_president')
    )
  );

CREATE POLICY "Admins and committee can delete inscription requests"
  ON public.inscription_requests FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'committee', 'president', 'vice_president')
    )
  );

ALTER TABLE public.club_settings
  ADD COLUMN IF NOT EXISTS inscription_slug text UNIQUE;

COMMENT ON COLUMN public.club_settings.inscription_slug IS
  'Unique slug used in the public inscription form URL, e.g. romanel-x7k2p9q';

DO $$
DECLARE
  v_suffix text;
  v_alphabet text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_i int;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.club_settings WHERE inscription_slug IS NULL
  ) THEN
    v_suffix := '';
    FOR v_i IN 1..7 LOOP
      v_suffix := v_suffix || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;

    UPDATE public.club_settings
    SET inscription_slug = regexp_replace(lower(club_name), '[^a-z0-9]+', '-', 'g')
      || '-' || v_suffix
    WHERE inscription_slug IS NULL;
  END IF;
END $$;
