import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme, ThemeMode } from '../context/ThemeContext'
import { LayoutGrid, LogOut, Monitor, Sun, Moon } from 'lucide-react'
import { computeAvailableViews, resolveNavView, VIEW_LABELS, type NavView } from '../config/navMenus'
import useStoredNavView, { persistNavView } from '../hooks/useNavView'

const themeOptions: { mode: ThemeMode; icon: typeof Monitor; label: string }[] = [
  { mode: 'system', icon: Monitor, label: 'Système' },
  { mode: 'light', icon: Sun, label: 'Clair' },
  { mode: 'dark', icon: Moon, label: 'Sombre' },
]

export interface PillTab {
  key: string
  path: string
  label: string
  icon: typeof LayoutGrid
  isActive?: (pathname: string) => boolean
}

export interface PillMenuItem {
  label: string
  icon: typeof LayoutGrid
  path: string
  badge?: boolean | number
  show?: boolean
}

interface ExpandingPillBarProps {
  tabs: PillTab[]
  menuItems: PillMenuItem[]
  unreadCount: number
  menuOpen: boolean
  onMenuToggle: () => void
  menuBadgeOnTab?: string
  shopUrl?: string | null
  extraPanelContent?: ReactNode
}

export default function ExpandingPillBar({
  tabs, menuItems, unreadCount, menuOpen, onMenuToggle,
  menuBadgeOnTab, shopUrl, extraPanelContent,
}: ExpandingPillBarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { signOut, clubRoles, isPlatformAdmin, hasCommitteeAccess } = useAuth()
  const { mode, setMode } = useTheme()
  const storedView = useStoredNavView()
  const [loading, setLoading] = useState(false)
  const [flashTab, setFlashTab] = useState<string | null>(null)
  const [dragY, setDragY] = useState(0)
  const dragStartRef = useRef<number | null>(null)

  const availableViews = computeAvailableViews(clubRoles, isPlatformAdmin, hasCommitteeAccess)
  const currentView: NavView = resolveNavView(storedView, availableViews)

  const visibleItems = menuItems.filter(i => i.show !== false)

  const isTabActive = (tab: PillTab) => {
    if (tab.isActive) return tab.isActive(location.pathname)
    if (tab.path === '/dashboard') return location.pathname === '/dashboard'
    return location.pathname.startsWith(tab.path)
  }

  const selectView = (v: NavView) => {
    if (v === currentView) return
    persistNavView(v)
    onMenuToggle()
    navigate('/dashboard')
  }

  const handleLogout = async () => {
    setLoading(true)
    try {
      localStorage.removeItem('adminMenuOpen')
      await signOut()
    } catch {}
    setLoading(false)
  }

  const handleGridNav = (path: string) => {
    if (path === '__shop__' && shopUrl) {
      window.open(shopUrl, '_blank', 'noopener')
    } else {
      navigate(path)
    }
    onMenuToggle()
  }

  useEffect(() => {
    if (menuOpen) { document.body.style.overflow = 'hidden' }
    else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onMenuToggle() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen, onMenuToggle])

  const handleTouchStart = (e: React.TouchEvent) => { dragStartRef.current = e.touches[0].clientY }
  const handleTouchMove = (e: React.TouchEvent) => {
    if (dragStartRef.current === null) return
    const dy = e.touches[0].clientY - dragStartRef.current
    if (dy > 0) setDragY(dy)
  }
  const handleTouchEnd = () => {
    if (dragY > 80) onMenuToggle()
    setDragY(0)
    dragStartRef.current = null
  }

  return (
    <>
      <div
        className={`expanding-pill-overlay ${menuOpen ? 'expanding-pill-overlay--visible' : ''}`}
        onClick={onMenuToggle}
      />

      <div
        className={`expanding-pill ${menuOpen ? 'expanding-pill--open' : ''}`}
        style={menuOpen && dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
        onTouchStart={menuOpen ? handleTouchStart : undefined}
        onTouchMove={menuOpen ? handleTouchMove : undefined}
        onTouchEnd={menuOpen ? handleTouchEnd : undefined}
      >
        {menuOpen && (
          <div className="expanding-pill__content" onClick={e => e.stopPropagation()}>
            <div className="expanding-pill__handle" />

            {availableViews.length > 1 && (
              <div className="expanding-pill__switcher" role="tablist" aria-label="Changer de vue">
                {availableViews.map(v => {
                  const active = v === currentView
                  return (
                    <button
                      key={v}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={`expanding-pill__switcher-btn ${active ? 'expanding-pill__switcher-btn--active' : ''}`}
                      onClick={() => selectView(v)}
                    >
                      {VIEW_LABELS[v]}
                    </button>
                  )
                })}
              </div>
            )}

            <div className="expanding-pill__grid">
              {visibleItems.map(({ label, icon: Icon, path, badge }) => (
                <button
                  key={path}
                  type="button"
                  className="expanding-pill__grid-item"
                  onClick={() => handleGridNav(path)}
                >
                  <span className="expanding-pill__grid-circle">
                    <Icon size={24} />
                    {badge === true && <span className="expanding-pill__grid-dot" />}
                    {typeof badge === 'number' && badge > 0 && (
                      <span className="expanding-pill__grid-count">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </span>
                  <span className="expanding-pill__grid-label">{label}</span>
                </button>
              ))}

              <button
                type="button"
                className="expanding-pill__grid-item expanding-pill__grid-item--danger"
                onClick={handleLogout}
                disabled={loading}
              >
                <span className="expanding-pill__grid-circle expanding-pill__grid-circle--danger">
                  <LogOut size={24} />
                </span>
                <span className="expanding-pill__grid-label">
                  {loading ? 'Déconnexion...' : 'Déconnexion'}
                </span>
              </button>
            </div>

            {extraPanelContent}

            <div className="expanding-pill__theme-row">
              <span className="expanding-pill__theme-label">Apparence</span>
              <div className="expanding-pill__theme-control">
                {themeOptions.map(({ mode: m, icon: Icon, label }) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    title={label}
                    className={`expanding-pill__theme-btn ${mode === m ? 'expanding-pill__theme-btn--active' : ''}`}
                  >
                    <Icon size={16} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs text-center py-2" style={{ color: 'var(--text-muted)' }}>ClubSphère v{__APP_VERSION__}</p>

            <div className="expanding-pill__separator" />
          </div>
        )}

        {/* Tab row — always visible at bottom */}
        <div className="expanding-pill__tabs" role="tablist" aria-label="Navigation principale">
          {tabs.map(tab => {
            const active = !menuOpen && isTabActive(tab)
            const Icon = tab.icon
            const showBadge = menuBadgeOnTab === tab.key && unreadCount > 0
            const flashing = flashTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                className={`expanding-pill__tab ${active ? 'expanding-pill__tab--active' : ''} ${flashing ? 'expanding-pill__tab--flash' : ''}`}
                onClick={() => {
                  setFlashTab(tab.key)
                  setTimeout(() => setFlashTab(null), 420)
                  if (menuOpen) onMenuToggle()
                  navigate(tab.path)
                }}
              >
                <span className="expanding-pill__tab-icon">
                  <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
                  {showBadge && (
                    <span className="expanding-pill__tab-badge">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </span>
                <span className="expanding-pill__tab-label">{tab.label}</span>
              </button>
            )
          })}

          {/* Menu tab */}
          <button
            type="button"
            role="tab"
            aria-selected={menuOpen}
            className={`expanding-pill__tab ${menuOpen ? 'expanding-pill__tab--active' : ''} ${flashTab === '__menu__' ? 'expanding-pill__tab--flash' : ''}`}
            onClick={() => {
              setFlashTab('__menu__')
              setTimeout(() => setFlashTab(null), 420)
              onMenuToggle()
            }}
          >
            <span className="expanding-pill__tab-icon">
              <LayoutGrid size={22} strokeWidth={menuOpen ? 2.2 : 1.8} />
              {menuBadgeOnTab === 'menu' && unreadCount > 0 && (
                <span className="expanding-pill__tab-badge">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </span>
            <span className="expanding-pill__tab-label">Menu</span>
          </button>
        </div>
      </div>
    </>
  )
}
