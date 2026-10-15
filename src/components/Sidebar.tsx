import { Link, useLocation, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { Settings, LogOut, Heart, UserPlus, Calendar, ClipboardList, Activity, ChartBar as BarChart3, Wallet, Newspaper, Map, Trophy, GraduationCap, Tag, Palette, File as FileEdit, Lock, Dumbbell, Bell, Folder, Files, ChevronDown, Users, User, Handshake, FileText, Volleyball, ReceiptText, ShoppingBag, Globe, ListChecks, Images } from 'lucide-react'
import { useState, useEffect, useMemo, type ReactNode } from 'react'
import buildNavMenu, { VIEW_LABELS, computeAvailableViews, resolveNavView, type NavView, type NavMenuContext, type MemberVariant } from '../config/navMenus'
import { useHasTeamContext } from '../hooks/useHasTeamContext'
import { useIsEventOrganizer } from '../hooks/useIsEventOrganizer'
import useStoredNavView, { persistNavView } from '../hooks/useNavView'
import { supabase } from '../lib/supabase'
import { uniqueChannelName } from '../lib/realtime'
import { getUserDisplayName } from '../utils/userHelpers'
import { useAllModuleAccess } from '../hooks/useAllModuleAccess'
import { useFinanceModuleEnabled } from '../hooks/useFinanceModuleEnabled'
import { useWebsiteModuleEnabled } from '../hooks/useWebsiteModuleEnabled'
import { getPendingChartesForUser } from '../utils/charteHelpers'
import { useInvoiceNotification } from '../hooks/useInvoiceNotification'
import { ThemeToggle } from './ThemeToggle'
import { waitForBundleIfPending } from '../lib/dashboardCache'

interface SidebarProps {
  mobile?: boolean
  onClose?: () => void
}

interface AdminMenuItem {
  label: string
  subtitle: string
  path?: string
  icon: ReactNode
  moduleKey?: string
  items?: { label: string; path: string; icon: ReactNode; moduleKey?: string }[]
}

export function Sidebar({ mobile, onClose }: SidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, signOut, effectiveRole, isPlatformAdmin, hasRole, clubRoles, hasCommitteeAccess } = useAuth()
  const { theme, isLoading: themeLoading } = useTheme()
  const [loading, setLoading] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [openSubmenus, setOpenSubmenus] = useState<Record<string, boolean>>({})
  const [memberGender, setMemberGender] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string>('')
  const [isVolunteer, setIsVolunteer] = useState<boolean>(false)
  const [hasConversations, setHasConversations] = useState<boolean>(false)
  const [committeeRoleLabel, setCommitteeRoleLabel] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [hasPendingCharte, setHasPendingCharte] = useState<boolean>(false)
  const [shopUrl, setShopUrl] = useState<string | null>(null)
  const { canView: moduleCanView } = useAllModuleAccess()
  const { enabled: financeEnabled } = useFinanceModuleEnabled()
  const { enabled: websiteEnabled } = useWebsiteModuleEnabled()
  const parentDot = useInvoiceNotification(user?.id, user?.email, 'parent', financeEnabled && hasRole('parent'))
  const memberDot = useInvoiceNotification(user?.id, user?.email, 'member', financeEnabled && hasRole('member'))
  const invoiceDot =
    parentDot === 'red' || memberDot === 'red'
      ? 'red'
      : parentDot === 'green' || memberDot === 'green'
      ? 'green'
      : null

  useEffect(() => {
    if (!user?.id || !effectiveRole) {
      setHasPendingCharte(false)
      return
    }
    let cancelled = false
    ;(async () => {
      const cached = await waitForBundleIfPending()
      if (cancelled) return
      if (cached) {
        setHasPendingCharte(cached.hasPendingCharte)
        return
      }
      const info = await getPendingChartesForUser(user.id, effectiveRole)
      if (!cancelled) setHasPendingCharte(info.pendingForSelf.length > 0 || info.pendingForChildren.length > 0)
    })()
    return () => { cancelled = true }
  }, [user?.id, effectiveRole])

  const committeeRoleMap: Record<string, string> = {
    'Président': 'Président',
    'Vice président': 'Vice-Président',
    'Vice-Président': 'Vice-Président',
    'Secrétaire': 'Secrétaire',
    'Trésorier': 'Trésorier',
    'Resp. Technique': 'Resp. Technique',
    'Responsable technique': 'Resp. Technique',
    'Resp. Compétitions': 'Resp. Compétitions',
    'Responsable compétitions': 'Resp. Compétitions',
    'Administrateur': 'Administrateur',
  }

  const role = effectiveRole
  const isAdmin = role === 'admin' || role === 'president' || role === 'vice_president'
  const isCommittee = role === 'committee'

  const availableViews: NavView[] = useMemo(
    () => computeAvailableViews(clubRoles, isPlatformAdmin, hasCommitteeAccess),
    [clubRoles, isPlatformAdmin, hasCommitteeAccess]
  )

  const memberVariant: MemberVariant = clubRoles.includes('parent')
    ? 'parent'
    : clubRoles.includes('member')
    ? 'player'
    : clubRoles.includes('supporter')
    ? 'supporter'
    : 'generic'

  const hasTeamContext = useHasTeamContext(user?.id, user?.email, memberVariant)
  const isEventOrganizer = useIsEventOrganizer(user?.id)

  const storedView = useStoredNavView()

  const isDesktopDevice =
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true

  const currentView: NavView = resolveNavView(storedView, availableViews)

  useEffect(() => {
    const saved = localStorage.getItem('adminMenuOpen')
    if (saved === 'true') setAdminOpen(true)
    const savedSubmenus = localStorage.getItem('adminSubmenusOpen')
    if (savedSubmenus) {
      try {
        setOpenSubmenus(JSON.parse(savedSubmenus))
      } catch {}
    } else {
      const savedFinance = localStorage.getItem('financeMenuOpen')
      if (savedFinance === 'true') setOpenSubmenus({ Finances: true })
    }

    ;(async () => {
      const cached = await waitForBundleIfPending()
      if (cached) {
        if (cached.memberGender) setMemberGender(cached.memberGender)
        setDisplayName(cached.displayName)
        if (cached.avatarUrl) setAvatarUrl(cached.avatarUrl)
        setIsVolunteer(cached.isVolunteer)
        return
      }

      if (effectiveRole === 'member' && user?.id) {
        const { data } = await supabase
          .from('members')
          .select('gender')
          .eq('id', user.id)
          .maybeSingle()
        if (data) setMemberGender(data.gender)
      }

      if (user?.id) {
        const name = await getUserDisplayName(user.id)
        setDisplayName(name)
      }

      if (user?.id) {
        const { data } = await supabase
          .from('profiles')
          .select('avatar_url')
          .eq('id', user.id)
          .maybeSingle()
        if (data?.avatar_url) setAvatarUrl(data.avatar_url)
      }

      if (user?.id) {
        const { data: volunteerCheck } = await supabase
          .from('event_registrations')
          .select('id')
          .eq('user_id', user.id)
          .eq('is_volunteer', true)
          .limit(1)
        setIsVolunteer(!!(volunteerCheck && volunteerCheck.length > 0))
      }
    })()

    ;(async () => {
      const { data: csData } = await supabase
        .from('club_settings')
        .select('shop_url')
        .limit(1)
        .maybeSingle()
      setShopUrl(csData?.shop_url || null)
    })()

    const fetchCommitteeRole = async () => {
      if (effectiveRole === 'committee' && user?.email) {
        const { data } = await supabase
          .from('committee_members')
          .select('role')
          .ilike('email', user.email)
          .maybeSingle()
        if (data?.role) {
          setCommitteeRoleLabel(committeeRoleMap[data.role] ?? data.role)
        }
      }
    }
    fetchCommitteeRole()

    // Check if user participates in at least one conversation
    async function checkConversationParticipation() {
      if (!user?.id) return
      const { count } = await supabase
        .from('conversation_participants')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
      setHasConversations((count ?? 0) > 0)
    }
    checkConversationParticipation()

    // Subscribe to realtime changes in event_registrations
    if (user?.id) {
      const channel = supabase
        .channel(uniqueChannelName('event_registrations'))
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'event_registrations',
            filter: `user_id=eq.${user.id}`
          },
          async () => {
            const { data: volunteerCheck } = await supabase
              .from('event_registrations')
              .select('id')
              .eq('user_id', user.id)
              .eq('is_volunteer', true)
              .limit(1)
            setIsVolunteer(!!(volunteerCheck && volunteerCheck.length > 0))
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [user?.id, effectiveRole])

  const toggleAdmin = () => {
    const newState = !adminOpen
    setAdminOpen(newState)
    localStorage.setItem('adminMenuOpen', String(newState))
  }

  const toggleSubmenu = (label: string) => {
    setOpenSubmenus((prev) => {
      const next = { ...prev, [label]: !prev[label] }
      localStorage.setItem('adminSubmenusOpen', JSON.stringify(next))
      return next
    })
  }

  const navCtx: NavMenuContext = {
    isStrictAdmin: ['admin', 'president', 'vice_president'].some((r) => clubRoles.includes(r)) || isPlatformAdmin,
    isVolunteer,
    isEventOrganizer,
    hasConversations,
    memberVariant,
    hasTeamContext,
  }

  const navItems = buildNavMenu(currentView, navCtx)

  const adminMenuItems: AdminMenuItem[] = [
    { label: 'Utilisateurs', subtitle: 'Gestion des comptes', path: '/admin/utilisateurs', icon: <Users size={16} aria-hidden="true" />, moduleKey: 'utilisateurs' },
    { label: 'Activations', subtitle: "Demandes d'activation", path: '/admin/activations', icon: <Lock size={16} aria-hidden="true" />, moduleKey: 'utilisateurs' },
    { label: 'Joueurs', subtitle: 'Gestion des joueurs', path: '/admin/annuaire/joueurs', icon: <User size={16} aria-hidden="true" />, moduleKey: 'joueurs' },
    { label: 'Inscriptions', subtitle: 'Demandes d\'inscription', path: '/admin/inscriptions', icon: <UserPlus size={16} aria-hidden="true" />, moduleKey: 'joueurs' },
    { label: 'Entraîneurs', subtitle: 'Gestion des entraîneurs', path: '/admin/entraineurs', icon: <Activity size={16} aria-hidden="true" />, moduleKey: 'entraineurs' },
    { label: 'Annuaire Club', subtitle: 'Comité et membres', path: '/admin/annuaire/club', icon: <ClipboardList size={16} aria-hidden="true" />, moduleKey: 'annuaire' },
    {
      label: 'Sportif',
      subtitle: 'Gestion sportive',
      icon: <Volleyball size={16} aria-hidden="true" />,
      items: [
        { label: 'Équipes', path: '/admin/equipes', icon: <Volleyball size={14} aria-hidden="true" />, moduleKey: 'equipes' },
        { label: 'Catégories', path: '/admin/categories', icon: <Tag size={14} aria-hidden="true" />, moduleKey: 'categories' },
        { label: 'Qualifications', path: '/admin/qualifications', icon: <GraduationCap size={14} aria-hidden="true" />, moduleKey: 'qualifications' },
        { label: 'Matchs', path: '/admin/matchs', icon: <Trophy size={14} aria-hidden="true" />, moduleKey: 'matchs' },
        { label: 'Terrains', path: '/admin/terrains', icon: <Map size={14} aria-hidden="true" />, moduleKey: 'terrains' },
        { label: 'Entraînements', path: '/admin/entrainements', icon: <Dumbbell size={14} aria-hidden="true" />, moduleKey: 'entrainements' },
        { label: 'J+S Présences', path: '/admin/js-presences', icon: <BarChart3 size={14} aria-hidden="true" />, moduleKey: 'js_presences' },
      ],
    },
    {
      label: 'Événements & Activités',
      subtitle: 'Événements et bénévoles',
      icon: <Calendar size={16} aria-hidden="true" />,
      items: [
        { label: 'Événements', path: '/admin/events', icon: <Calendar size={14} aria-hidden="true" />, moduleKey: 'evenements' },
        { label: 'Bénévoles', path: '/admin/benevoles', icon: <Heart size={14} aria-hidden="true" />, moduleKey: 'evenements' },
        { label: 'Sondages', path: '/sondages', icon: <ListChecks size={14} aria-hidden="true" />, moduleKey: 'sondages' },
      ],
    },
    {
      label: 'Communication',
      subtitle: 'Communication interne',
      icon: <Newspaper size={16} aria-hidden="true" />,
      items: [
        { label: 'Actualités', path: '/admin/news', icon: <Newspaper size={14} aria-hidden="true" />, moduleKey: 'actualites' },
        { label: 'Galeries', path: '/admin/galeries', icon: <Images size={14} aria-hidden="true" />, moduleKey: 'galeries' },
        { label: 'Notifications', path: '/admin/notifications', icon: <Bell size={14} aria-hidden="true" />, moduleKey: 'notifications' },
        { label: 'Séances', path: '/admin/pv-seances', icon: <FileEdit size={14} aria-hidden="true" />, moduleKey: 'pv_seances' },
        { label: 'Documents', path: '/admin/documents', icon: <Folder size={14} aria-hidden="true" />, moduleKey: 'actualites' },
      ],
    },
    {
      label: 'Finances',
      subtitle: 'Facturation et paiements',
      icon: <Wallet size={16} aria-hidden="true" />,
      moduleKey: 'finances',
      items: [
        { label: 'Tableau de bord', path: '/admin/finances/dashboard', icon: <BarChart3 size={14} aria-hidden="true" />, moduleKey: 'finances' },
        { label: 'Situation financière', path: '/admin/finances/situation', icon: <Files size={14} aria-hidden="true" />, moduleKey: 'finances' },
        { label: 'Tableau des factures', path: '/admin/finances/factures', icon: <ClipboardList size={14} aria-hidden="true" />, moduleKey: 'finances' },
        { label: 'Facturation', path: '/admin/finances/facturation', icon: <FileText size={14} aria-hidden="true" />, moduleKey: 'finances' },
        { label: 'Dépenses', path: '/admin/finances/depenses', icon: <ReceiptText size={14} aria-hidden="true" />, moduleKey: 'finances' },
        { label: 'Saisons', path: '/admin/finances/saisons', icon: <Calendar size={14} aria-hidden="true" />, moduleKey: 'finances' },
        { label: 'Configuration', path: '/admin/finances/config', icon: <Settings size={14} aria-hidden="true" />, moduleKey: 'finances' },
      ],
    },
    { label: 'Sponsors', subtitle: 'Gestion des sponsors', path: '/admin/sponsors', icon: <Handshake size={16} aria-hidden="true" />, moduleKey: 'sponsors' },
    { label: 'Site internet', subtitle: 'Contenus publiés', path: '/admin/site-internet', icon: <Globe size={16} aria-hidden="true" />, moduleKey: 'parametres' },
    {
      label: 'Configuration',
      subtitle: 'Paramètres du club',
      icon: <Settings size={16} aria-hidden="true" />,
      items: [
        { label: 'Paramètres', path: '/admin/parametres-club', icon: <Settings size={14} aria-hidden="true" />, moduleKey: 'parametres' },
        { label: 'Groupements', path: '/admin/groupements', icon: <Handshake size={14} aria-hidden="true" />, moduleKey: 'parametres' },
        { label: 'Thème', path: '/admin/theme', icon: <Palette size={14} aria-hidden="true" />, moduleKey: 'theme' },
      ],
    },
  ]

  const selectView = (v: NavView) => {
    if (v !== currentView) {
      persistNavView(v)
      const paths = new Set(buildNavMenu(v, navCtx).map((i) => i.path))
      if (v === 'admin') {
        adminMenuItems.forEach((mi) => {
          if (mi.path) paths.add(mi.path)
          mi.items?.forEach((c) => paths.add(c.path))
        })
      }
      const inTarget = [...paths].some(
        (p) => location.pathname === p || location.pathname.startsWith(p + '/')
      )
      if (!inTarget) navigate('/dashboard')
    }
    onClose?.()
  }

  const handleLogout = async () => {
    setLoading(true)
    try {
      localStorage.removeItem('adminMenuOpen')
      await signOut()
    } catch (error) {
      console.error('Logout error:', error)
    }
    setLoading(false)
  }

  const isActive = (path: string) => {
    if (path === '/events') {
      return location.pathname === '/events' || location.pathname.startsWith('/events/')
    }
    if (path === '/benevoles') {
      return location.pathname === '/benevoles' || location.pathname.startsWith('/benevoles/')
    }
    if (path === '/teams') {
      return location.pathname === '/teams' || location.pathname === '/equipes'
    }
    if (path === '/mes-equipes') {
      return location.pathname === '/mes-equipes' || location.pathname.startsWith('/mes-equipes/')
    }
    if (path === '/mon-profil/coach') {
      return location.pathname === '/mon-profil/coach'
    }
    if (path === '/mon-profil/joueur') {
      return location.pathname === '/mon-profil/joueur'
    }
    if (path === '/annuaire-club') {
      return location.pathname === '/annuaire-club' || location.pathname.startsWith('/annuaire-club/')
    }
    if (path === '/annuaire/joueurs') {
      return location.pathname === '/annuaire/joueurs' || location.pathname.startsWith('/annuaire/joueurs/')
    }
    if (path === '/terrains') {
      return location.pathname === '/terrains' || location.pathname === '/planning'
    }
    return location.pathname === path
  }

  return (
    <div className="h-full flex flex-col p-4" style={{ background: 'var(--bg-sidebar)' }}>
      {!mobile && (
        <div style={{
          padding: '20px 16px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '24px'
        }}>
          {theme.logoUrl ? (
            <div style={{
              background: 'var(--bg-card)',
              borderRadius: '8px',
              padding: '4px',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              border: '1px solid var(--border-color)'
            }}>
              <img
                src={theme.logoUrl}
                alt="Logo"
                style={{
                  maxWidth: '32px',
                  maxHeight: '32px',
                  objectFit: 'contain'
                }}
              />
            </div>
          ) : !themeLoading ? (
            <div style={{
              width: '40px',
              height: '40px',
              background: 'var(--accent)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-ink, var(--text-inverse))',
              fontWeight: '700',
              fontSize: '18px',
              flexShrink: 0
            }}>
              {theme.name?.[0] || 'C'}
            </div>
          ) : null}
          <div>
            <div style={{
              color: 'var(--text-primary)',
              fontWeight: '700',
              fontSize: '14px',
              lineHeight: '1.2'
            }}>
              {!themeLoading ? theme.name : ''}
            </div>
          </div>
        </div>
      )}

      {availableViews.length > 1 && (
        <div
          role="tablist"
          aria-label="Changer de vue"
          style={{
            display: 'flex',
            gap: '4px',
            padding: '4px',
            background: 'var(--bg-hover)',
            borderRadius: '10px',
            marginBottom: '16px',
          }}
        >
          {availableViews.map((v) => {
            const active = v === currentView
            return (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectView(v)}
                style={{
                  flex: 1,
                  padding: '7px 6px',
                  borderRadius: '7px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  lineHeight: 1.2,
                  background: active ? 'var(--grad)' : 'transparent',
                  color: active ? 'var(--text-inverse)' : 'var(--text-secondary)',
                  transition: 'background 0.15s ease, color 0.15s ease',
                }}
              >
                {VIEW_LABELS[v]}
              </button>
            )
          })}
        </div>
      )}

      <nav className="flex-1 space-y-2 overflow-y-auto">
        {navItems.map(({ path, label, icon: Icon }) => (
          <Link
            key={path}
            to={path}
            onClick={onClose}
            className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors"
            style={isActive(path)
              ? { backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }
              : { color: 'var(--text-secondary)' }}
          >
            <Icon size={20} />
            <span className="text-sm font-medium">{label}</span>
            {path === '/documents' && hasPendingCharte && (
              <span style={{
                marginLeft: 'auto',
                background: 'var(--warning)',
                width: '8px', height: '8px', borderRadius: '50%',
                display: 'inline-block',
              }} />
            )}
            {(path === '/mon-profil/parent' || path === '/mon-profil/joueur') && invoiceDot && (
              <span style={{
                marginLeft: 'auto',
                background: invoiceDot === 'red' ? 'var(--danger)' : 'var(--success)',
                width: '8px', height: '8px', borderRadius: '50%',
                display: 'inline-block',
              }} />
            )}
          </Link>
        ))}

        {shopUrl && (currentView === 'member' || currentView === 'coach') && (
          <a
            href={shopUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors"
            style={{ color: 'var(--text-secondary)' }}
          >
            <ShoppingBag size={20} />
            <span className="text-sm font-medium">Boutique</span>
          </a>
        )}

        {currentView === 'admin' && (isAdmin || isCommittee) && (
          <div style={{ marginTop: '16px' }}>
            <div
              onClick={toggleAdmin}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                cursor: 'pointer',
                borderRadius: '8px',
                color: adminOpen ? 'var(--accent)' : 'var(--text-secondary)',
                background: adminOpen ? 'var(--accent-soft)' : 'transparent',
                fontWeight: adminOpen ? '600' : '400',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Settings size={20} />
                <span style={{ fontSize: '14px', fontWeight: '500' }}>Administration</span>
              </div>
              <ChevronDown
                size={14}
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  transform: adminOpen ? 'rotate(180deg)' : 'rotate(0)',
                  transition: 'transform 0.2s ease'
                }}
              />
            </div>

            {adminOpen && (
              <div
                style={{
                  paddingLeft: '16px',
                  borderLeft: '2px solid var(--border-color)',
                  marginLeft: '20px',
                  marginTop: '4px'
                }}
              >
                {adminMenuItems
                  .filter((item) => item.moduleKey !== 'finances' || financeEnabled)
                  .filter((item) => item.label !== 'Site internet' || websiteEnabled)
                  .filter((item) => {
                    if (isAdmin) return true
                    if (item.items) {
                      return item.items.some((child) => child.moduleKey ? moduleCanView(child.moduleKey) : false)
                    }
                    return item.moduleKey ? moduleCanView(item.moduleKey) : false
                  })
                  .map((item) => {
                  if (item.items) {
                    const visibleChildren = isAdmin ? item.items : item.items.filter((child) => child.moduleKey && moduleCanView(child.moduleKey))
                    const isSubmenuActive = visibleChildren.some((sub) => location.pathname === sub.path || location.pathname.startsWith(sub.path + '/'))
                    const isOpen = !!openSubmenus[item.label]
                    return (
                      <div key={item.label}>
                        <div
                          onClick={() => toggleSubmenu(item.label)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '7px 12px',
                            cursor: 'pointer',
                            borderRadius: '6px',
                            color: isOpen || isSubmenuActive ? 'var(--accent)' : 'var(--text-secondary)',
                            background: isOpen || isSubmenuActive ? 'var(--accent-soft)' : 'transparent',
                            marginBottom: '2px',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {item.icon}
                            <span style={{ fontSize: '14px' }}>{item.label}</span>
                          </div>
                          <ChevronDown
                            size={12}
                            aria-hidden="true"
                            style={{
                              flexShrink: 0,
                              transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
                              transition: 'transform 0.2s ease'
                            }}
                          />
                        </div>
                        {isOpen && (
                          <div style={{ paddingLeft: '20px', marginTop: '2px' }}>
                            {visibleChildren.map((subItem) => (
                              <NavLink
                                key={subItem.path}
                                to={subItem.path}
                                onClick={onClose}
                                style={({ isActive }) => ({
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                                  background: isActive ? 'var(--accent-soft)' : 'transparent',
                                  fontSize: '13px',
                                  textDecoration: 'none',
                                  marginBottom: '2px',
                                  transition: 'all 0.15s ease'
                                })}
                              >
                                {subItem.icon}
                                <span>{subItem.label}</span>
                              </NavLink>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  }
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path!}
                      onClick={onClose}
                      style={({ isActive }) => ({
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                        background: isActive ? 'var(--accent-soft)' : 'transparent',
                        fontSize: '14px',
                        textDecoration: 'none',
                        marginBottom: '2px',
                        transition: 'all 0.15s ease'
                      })}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </NavLink>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </nav>

      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '16px' }}>
        <div className="rounded-lg mb-4" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-hover)' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{
                width: '100%',
                height: '100%',
                background: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-ink, var(--text-inverse))',
                fontWeight: '700',
                fontSize: '15px'
              }}>
                {(displayName || user?.full_name || '?').charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div style={{ overflow: 'hidden', minWidth: 0 }}>
            <p style={{ fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '1.3' }}>
              {displayName || user?.full_name}
            </p>
            {isPlatformAdmin && !effectiveRole ? (
              <p style={{ fontSize: '12px', color: 'var(--accent)', lineHeight: '1.3' }}>Super-admin</p>
            ) : effectiveRole === 'committee' ? (
              <>
                {committeeRoleLabel && (
                  <p style={{ fontSize: '12px', color: 'var(--accent)', lineHeight: '1.3' }}>{committeeRoleLabel}</p>
                )}
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.3' }}>Comité</p>
              </>
            ) : effectiveRole === 'member' ? (
              <p style={{ fontSize: '12px', color: 'var(--accent)', lineHeight: '1.3' }}>
                {memberGender === 'F' ? 'Joueuse' : 'Joueur'}
              </p>
            ) : effectiveRole === 'admin' || effectiveRole === 'president' || effectiveRole === 'vice_president' ? (
              <p style={{ fontSize: '12px', color: 'var(--accent)', lineHeight: '1.3' }}>Administrateur</p>
            ) : effectiveRole === 'coach' ? (
              <p style={{ fontSize: '12px', color: 'var(--accent)', lineHeight: '1.3' }}>Entraîneur</p>
            ) : effectiveRole === 'assistant_coach' ? (
              <p style={{ fontSize: '12px', color: 'var(--accent)', lineHeight: '1.3' }}>Adjoint</p>
            ) : effectiveRole === 'parent' ? (
              <p style={{ fontSize: '12px', color: 'var(--accent)', lineHeight: '1.3' }}>Parent</p>
            ) : effectiveRole === 'supporter' ? (
              <p style={{ fontSize: '12px', color: 'var(--accent)', lineHeight: '1.3' }}>Supporter</p>
            ) : (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.3' }}>&nbsp;</p>
            )}
          </div>
        </div>

        <button
          onClick={handleLogout}
          disabled={loading}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors disabled:opacity-50"
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'var(--danger-soft)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent' }}
        >
          <LogOut size={20} />
          <span className="text-sm font-medium">
            {loading ? 'Déconnexion...' : 'Déconnexion'}
          </span>
        </button>

        <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '12px' }}>
          <ThemeToggle />
          {onClose ? (
            <p className="text-xs text-center py-2" style={{ color: 'var(--text-muted)' }}>ClubSphère v{__APP_VERSION__}</p>
          ) : (
            <div style={{ textAlign: 'center', marginTop: '8px', paddingBottom: '4px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>v{__APP_VERSION__}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
