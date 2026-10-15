import {
  Hop as Home, BookUser, Calendar, MessageSquare, Newspaper,
  Users, TrendingUp, FileText, BookOpen, Handshake, FolderOpen,
  Headset as SupportIcon, User, Monitor as DesktopIcon,
  ListChecks,
} from 'lucide-react'
import ExpandingPillBar, { type PillTab, type PillMenuItem } from './ExpandingPillBar'

interface CommitteeBottomBarProps {
  unreadCount: number
  menuOpen: boolean
  onMenuToggle: () => void
}

const tabs: PillTab[] = [
  { key: 'home', path: '/dashboard', label: 'Accueil', icon: Home },
  { key: 'annuaire', path: '/comite/annuaire', label: 'Annuaire', icon: BookUser },
  { key: 'calendar', path: '/calendrier', label: 'Calendrier', icon: Calendar },
  { key: 'messages', path: '/messages', label: 'Messages', icon: MessageSquare },
]

const menuItems: PillMenuItem[] = [
  { label: 'Actualités', icon: Newspaper, path: '/comite/actualites' },
  { label: 'Événements', icon: Calendar, path: '/comite/evenements' },
  { label: 'Sondages', icon: ListChecks, path: '/sondages' },
  { label: 'Équipes', icon: Users, path: '/comite/equipes' },
  { label: 'Situation financière', icon: TrendingUp, path: '/comite/finances' },
  { label: 'Facturation', icon: FileText, path: '/comite/facturation' },
  { label: 'Séances', icon: BookOpen, path: '/comite/seances' },
  { label: 'Sponsors', icon: Handshake, path: '/comite/sponsors' },
  { label: 'Documents & chartes', icon: FolderOpen, path: '/comite/documents' },
  { label: 'Support', icon: SupportIcon, path: '/comite/support' },
  { label: 'Mon profil', icon: User, path: '/mon-profil' },
]

function DesktopCtaCard() {
  return (
    <div className="expanding-pill__cta-card">
      <p className="expanding-pill__cta-title">
        <DesktopIcon size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
        Poste de travail complet
      </p>
      <p className="expanding-pill__cta-text">
        La facturation, les imports, la configuration et le planning des terrains se gèrent depuis un ordinateur&nbsp;: <strong style={{ color: 'var(--text-primary)' }}>{typeof window !== 'undefined' ? window.location.host : ''}</strong>
      </p>
    </div>
  )
}

export default function CommitteeBottomBar({ unreadCount, menuOpen, onMenuToggle }: CommitteeBottomBarProps) {
  return (
    <ExpandingPillBar
      tabs={tabs}
      menuItems={menuItems}
      unreadCount={unreadCount}
      menuOpen={menuOpen}
      onMenuToggle={onMenuToggle}
      menuBadgeOnTab="messages"
      extraPanelContent={<DesktopCtaCard />}
    />
  )
}
