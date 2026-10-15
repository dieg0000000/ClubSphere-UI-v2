import {
  Hop as Home, Calendar, ClipboardCheck, Users,
  MessageSquare, Trophy, FileText, Sparkles, Circle as HelpCircle,
  User, ShoppingBag, BookUser, HandCoins, ListChecks, Images,
} from 'lucide-react'
import ExpandingPillBar, { type PillTab, type PillMenuItem } from './ExpandingPillBar'

interface CoachBottomBarProps {
  unreadCount: number
  menuOpen: boolean
  onMenuToggle: () => void
  shopUrl?: string | null
}

export default function CoachBottomBar({
  unreadCount, menuOpen, onMenuToggle, shopUrl,
}: CoachBottomBarProps) {
  const tabs: PillTab[] = [
    { key: 'home', path: '/dashboard', label: 'Accueil', icon: Home },
    { key: 'planning', path: '/planning-matchs', label: 'Planning', icon: Calendar },
    {
      key: 'presences', path: '/coach-presences', label: 'Présences', icon: ClipboardCheck,
      isActive: (p) => p === '/coach-presences' || p.startsWith('/mes-equipes/presences'),
    },
    {
      key: 'team', path: '/mes-equipes', label: 'Équipe', icon: Users,
      isActive: (p) => p === '/mes-equipes' || /^\/mes-equipes\/[^/]+\/joueurs/.test(p),
    },
  ]

  const menuItems: PillMenuItem[] = [
    { label: 'Messages', icon: MessageSquare, path: '/messages', badge: unreadCount },
    { label: 'Classements & Résultats', icon: Trophy, path: '/classements' },
    { label: 'Sondages', icon: ListChecks, path: '/sondages' },
    { label: 'Documents', icon: FileText, path: '/documents' },
    { label: 'Vie du club', icon: Sparkles, path: '/vie-du-club' },
    { label: 'Galerie', icon: Images, path: '/galerie' },
    { label: 'Annuaire', icon: BookUser, path: '/annuaire-club' },
    { label: 'Notes de frais', icon: HandCoins, path: '/notes-de-frais' },
    { label: 'Boutique', icon: ShoppingBag, path: '__shop__', show: !!shopUrl },
    { label: 'Aide et support', icon: HelpCircle, path: '/aide' },
    { label: 'Mon profil', icon: User, path: '/mon-profil/coach' },
  ]

  return (
    <ExpandingPillBar
      tabs={tabs}
      menuItems={menuItems}
      unreadCount={unreadCount}
      menuOpen={menuOpen}
      onMenuToggle={onMenuToggle}
      menuBadgeOnTab="menu"
      shopUrl={shopUrl}
    />
  )
}
