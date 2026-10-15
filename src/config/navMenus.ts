import {
  Hop as Home,
  Newspaper,
  Calendar,
  CalendarDays,
  Users,
  FileText,
  MessageSquare,
  Circle as HelpCircle,
  Heart,
  User as UserIcon,
  Building2,
  BookUser,
  Trophy,
  ClipboardList,
  Sparkles,
  Dumbbell,
  HandCoins,
  ListChecks,
  Images,
} from 'lucide-react'
import type { ComponentType } from 'react'

export type NavView = 'admin' | 'coach' | 'member'
export type MemberVariant = 'player' | 'parent' | 'supporter' | 'generic'

export interface NavItem {
  path: string
  label: string
  icon: ComponentType<{ size?: number | string }>
}

export interface NavMenuContext {
  isStrictAdmin: boolean
  isVolunteer: boolean
  isEventOrganizer: boolean
  hasConversations: boolean
  memberVariant: MemberVariant
  hasTeamContext?: boolean
}

export const VIEW_ORDER: NavView[] = ['admin', 'coach', 'member']

export const VIEW_LABELS: Record<NavView, string> = {
  admin: 'Administration',
  coach: 'Entraîneur',
  member: 'Membre',
}

const ACCUEIL: NavItem = { path: '/dashboard', label: 'Accueil', icon: Home }

export function getDefaultView(available: NavView[]): NavView {
  if (available.includes('admin')) return 'admin'
  if (available.includes('coach')) return 'coach'
  return 'member'
}

export function computeAvailableViews(clubRoles: string[], isPlatformAdmin: boolean, hasCommitteeAccess = false): NavView[] {
  const hasAdminRole =
    ['admin', 'president', 'vice_president', 'committee'].some((r) => clubRoles.includes(r)) || isPlatformAdmin || hasCommitteeAccess
  const hasCoachRole = ['coach', 'assistant_coach'].some((r) => clubRoles.includes(r))
  const views: NavView[] = []
  if (hasAdminRole) views.push('admin')
  if (hasCoachRole) views.push('coach')
  views.push('member')
  return views
}

export function resolveNavView(stored: string | null, available: NavView[]): NavView {
  return available.includes(stored as NavView) ? (stored as NavView) : getDefaultView(available)
}

function coachMenu(ctx: NavMenuContext): NavItem[] {
  return [
    ACCUEIL,
    { path: '/mes-equipes', label: 'Mes Équipes', icon: Users },
    { path: '/planning-matchs', label: 'Planning des matchs', icon: Trophy },
    { path: '/messages', label: 'Messages', icon: MessageSquare },
    { path: '/events', label: 'Événements', icon: Calendar },
    { path: '/sondages', label: 'Sondages', icon: ListChecks },
    { path: '/news', label: 'Actualités', icon: Newspaper },
    { path: '/galerie', label: 'Galerie', icon: Images },
    { path: '/documents', label: 'Documents', icon: FileText },
    { path: '/classements', label: 'Classements & Résultats', icon: Trophy },
    { path: '/annuaire-club', label: 'Annuaire', icon: BookUser },
    { path: '/notes-de-frais', label: 'Notes de frais', icon: HandCoins },
    ...(ctx.isVolunteer ? [{ path: '/benevoles', label: 'Bénévoles', icon: Heart }] : []),
    ...(ctx.isEventOrganizer ? [{ path: '/organisation', label: 'Organisation', icon: ClipboardList }] : []),
    { path: '/mon-profil/coach', label: 'Mon Profil', icon: UserIcon },
    { path: '/aide', label: 'Aide et support', icon: HelpCircle },
  ]
}

function memberMenu(ctx: NavMenuContext): NavItem[] {
  if (ctx.memberVariant === 'supporter') {
    return [
      ACCUEIL,
      { path: '/calendrier', label: 'Calendrier', icon: Calendar },
      ...(ctx.hasConversations ? [{ path: '/messages', label: 'Messages', icon: MessageSquare }] : []),
      { path: '/events', label: 'Événements', icon: CalendarDays },
      { path: '/sondages', label: 'Sondages', icon: ListChecks },
      { path: '/classements', label: 'Classements & Résultats', icon: Trophy },
      { path: '/annuaire-club', label: 'Annuaire', icon: BookUser },
      ...(ctx.isVolunteer ? [{ path: '/benevoles', label: 'Bénévoles', icon: Heart }] : []),
      ...(ctx.isEventOrganizer ? [{ path: '/organisation', label: 'Organisation', icon: ClipboardList }] : []),
      { path: '/vie-du-club', label: 'Vie du club', icon: Sparkles },
      { path: '/galerie', label: 'Galerie', icon: Images },
      { path: '/aide', label: 'Aide et support', icon: HelpCircle },
      { path: '/mon-profil', label: 'Mon Profil', icon: UserIcon },
    ]
  }

  const profilePath =
    ctx.memberVariant === 'parent'
      ? '/mon-profil/parent'
      : ctx.memberVariant === 'player'
      ? '/mon-profil/joueur'
      : '/mon-profil'

  const teamOrEvents: NavItem = ctx.hasTeamContext !== false
    ? { path: '/mon-equipe', label: 'Mon équipe', icon: Users }
    : { path: '/events', label: 'Événements', icon: CalendarDays }

  return [
    ACCUEIL,
    teamOrEvents,
    { path: '/calendrier', label: 'Calendrier', icon: Calendar },
    { path: '/messages', label: 'Messages', icon: MessageSquare },
    { path: '/classements', label: 'Classements & Résultats', icon: Trophy },
    { path: '/sondages', label: 'Sondages', icon: ListChecks },
    { path: '/annuaire-club', label: 'Annuaire', icon: BookUser },
    ...(ctx.isVolunteer ? [{ path: '/benevoles', label: 'Bénévoles', icon: Heart }] : []),
    ...(ctx.isEventOrganizer ? [{ path: '/organisation', label: 'Organisation', icon: ClipboardList }] : []),
    { path: '/vie-du-club', label: 'Vie du club', icon: Sparkles },
    { path: '/galerie', label: 'Galerie', icon: Images },
    { path: '/documents', label: 'Documents', icon: FileText },
    { path: '/aide', label: 'Aide et support', icon: HelpCircle },
    { path: profilePath, label: 'Mon Profil', icon: UserIcon },
  ]
}

function adminMenu(ctx: NavMenuContext): NavItem[] {
  return [
    ACCUEIL,
    { path: '/mon-profil', label: 'Mon Profil', icon: UserIcon },
    { path: '/news', label: 'Actualités', icon: Newspaper },
    { path: '/events', label: 'Événements', icon: Calendar },
    { path: '/sondages', label: 'Sondages', icon: ListChecks },
    ...(!ctx.isStrictAdmin ? [{ path: '/classements', label: 'Classements & Résultats', icon: Trophy }] : []),
    { path: '/benevoles', label: 'Bénévoles', icon: Heart },
    ...(ctx.isEventOrganizer ? [{ path: '/organisation', label: 'Organisation', icon: ClipboardList }] : []),
    { path: '/teams', label: 'Équipes', icon: Users },
    { path: '/annuaire-club', label: 'Annuaire', icon: BookUser },
    { path: '/terrains', label: 'Terrains', icon: Building2 },
    { path: '/admin/entrainements', label: 'Entraînements', icon: Dumbbell },
    { path: '/messages', label: 'Messages', icon: MessageSquare },
    { path: '/documents', label: 'Documents', icon: FileText },
    { path: '/aide', label: 'Aide et support', icon: HelpCircle },
  ]
}

export default function buildNavMenu(view: NavView, ctx: NavMenuContext): NavItem[] {
  switch (view) {
    case 'admin':
      return adminMenu(ctx)
    case 'coach':
      return coachMenu(ctx)
    default:
      return memberMenu(ctx)
  }
}
