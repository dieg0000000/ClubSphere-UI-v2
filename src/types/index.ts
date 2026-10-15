export type UserRole = 'admin' | 'committee' | 'coach' | 'assistant_coach' | 'member' | 'public' | 'parent' | 'president' | 'vice_president' | 'responsable_technique' | 'responsable_competitions' | 'supporter'

export interface Profile {
  id: string
  full_name: string
  first_name?: string
  last_name?: string
  phone?: string
  email: string
  role: UserRole
  avatar_url?: string
  team_id?: string
  active: boolean
  created_at: string
  onboarding_completed?: boolean
}

export interface TeamCategory {
  id: string
  type: 'junior' | 'active'
  name: string
  display_order: number
  active: boolean
  age_from: number | null
  age_to: number | null
  max_players: number | null
  created_at: string
}

export interface Team {
  id: string
  type: 'junior' | 'active'
  name: string
  category_id: string
  coach1_first_name: string
  coach1_last_name: string
  coach1_email: string
  coach1_phone: string
  coach2_first_name?: string
  coach2_last_name?: string
  coach2_email?: string
  coach2_phone?: string
  training_days?: string[]
  training_time?: string
  training_location?: string
  season: string
  active: boolean
  created_at: string
  asf_label?: string | null
  team_categories?: TeamCategory
}

export const STAFF_ROLE_LABELS: Record<string, string> = {
  principal: 'Entraîneur principal',
  assistant: 'Assistant',
  aide_moniteur: 'Aide-moniteur',
  preparateur_physique: 'Préparateur physique',
  entraineur_gardiens: 'Entraîneur des gardiens',
  responsable_equipe: 'Responsable d\'équipe',
  autre: 'Autre',
}

export interface TeamStaffEntry {
  team_id: string
  coach_id: string
  role: string
  sort_order: number
  first_name: string
  last_name: string
  phone: string | null
}

export interface TeamStaff {
  id: string
  team_id: string
  coach_id: string
  role: string
  sort_order: number
  notes?: string | null
  coach?: {
    first_name: string
    last_name: string
    member_id?: string | null
  }
}

export interface News {
  id: string
  title: string
  body: string
  category: string
  image_url?: string
  published_at: string
  author_id: string
  created_at: string
}

export interface Event {
  id: string
  title: string
  description: string
  type: string
  date: string
  location: string
  max_attendees?: number
  requires_volunteers?: boolean
  needs_volunteers?: boolean
  max_volunteers?: number
  is_registerable?: boolean
  registration_deadline?: string
  cancellation_deadline_days?: number
  cost_price?: number
  compte?: string
  payment_modes?: string[]
  created_at: string
  updated_at: string
}

export interface EventRegistration {
  id: string
  event_id: string
  user_id: string
  is_volunteer?: boolean
  volunteer_role?: string
  registered_at?: string
  created_at: string
  profiles?: Profile
}

export interface EventWithRegistrations extends Event {
  registrations?: EventRegistration[]
  registration_count?: number
  user_registered?: boolean
}

export interface Document {
  id: string
  name: string
  category: 'Players' | 'Coaches' | 'Administrative'
  file_url: string
  uploaded_by: string
  created_at: string
}

export interface Message {
  id: string
  sender_id: string
  receiver_id: string
  subject: string
  body: string
  read: boolean
  created_at: string
}

export interface Feedback {
  id: string
  user_id: string
  subject: string
  message: string
  category: 'bug' | 'suggestion' | 'other'
  created_at: string
}
