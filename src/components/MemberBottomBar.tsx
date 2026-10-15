import {
  Hop as Home, Calendar, CalendarDays, MessageSquare, Users,
  Trophy, ClipboardList, Sparkles, FileText, Circle as HelpCircle,
  User, ShoppingBag, BookUser, ListChecks, Images,
} from 'lucide-react'
import ExpandingPillBar, { type PillTab, type PillMenuItem } from './ExpandingPillBar'

interface MemberBottomBarProps {
  unreadCount: number
  menuOpen: boolean
  onMenuToggle: () => void
  hasTeamContext: boolean
  isEventOrganizer: boolean
  hasPendingCharte: boolean
  profilePath: string
  shopUrl?: string | null
}

export default function MemberBottomBar({
  unreadCount, menuOpen, onMenuToggle, hasTeamContext,
  isEventOrganizer, hasPendingCharte, profilePath, shopUrl,
}: MemberBottomBarProps) {
  const tabs: PillTab[] = [
    { key: 'home', path: '/dashboard', label: 'Accueil', icon: Home },
    { key: 'calendar', path: '/calendrier', label: 'Calendrier', icon: Calendar },
    { key: 'messages', path: '/messages', label: 'Messages', icon: MessageSquare },
    hasTeamContext
      ? { key: 'team', path: '/mon-equipe', label: 'Équipe', icon: Users }
      : { key: 'events', path: '/events', label: 'Événements', icon: CalendarDays },
  ]

  const menuItems: PillMenuItem[] = [
    { label: 'Classements & Résultats', icon: Trophy, path: '/classements' },
    { label: 'Sondages', icon: ListChecks, path: '/sondages' },
    { label: 'Organisation', icon: ClipboardList, path: '/organisation', show: isEventOrganizer },
    { label: 'Vie du club', icon: Sparkles, path: '/vie-du-club' },
    { label: 'Galerie', icon: Images, path: '/galerie' },
    { label: 'Annuaire', icon: BookUser, path: '/annuaire-club' },
    { label: 'Documents', icon: FileText, path: '/documents', badge: hasPendingCharte },
    { label: 'Boutique', icon: ShoppingBag, path: '__shop__', show: !!shopUrl },
    { label: 'Aide et support', icon: HelpCircle, path: '/aide' },
    { label: 'Mon profil', icon: User, path: profilePath },
  ]

  return (
    <ExpandingPillBar
      tabs={tabs}
      menuItems={menuItems}
      unreadCount={unreadCount}
      menuOpen={menuOpen}
      onMenuToggle={onMenuToggle}
      menuBadgeOnTab="messages"
      shopUrl={shopUrl}
    />
  )
}
