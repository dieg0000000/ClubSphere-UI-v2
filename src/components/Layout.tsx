import { useState, useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Menu, X } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { supabase } from '../lib/supabase'
import { uniqueChannelName } from '../lib/realtime'
import { MfaGraceBanner } from './MfaGraceBanner'
import { ClubNoticeBanner } from './ClubNoticeBanner'
import { RainModeBanner } from './RainModeBanner'
import { InstallBanner } from './InstallBanner'
import MemberBottomBar from './MemberBottomBar'
import CoachBottomBar from './CoachBottomBar'
import CommitteeBottomBar from './CommitteeBottomBar'
import { useActiveNavView } from '../hooks/useNavView'
import { useHasTeamContext } from '../hooks/useHasTeamContext'
import { useIsEventOrganizer } from '../hooks/useIsEventOrganizer'
import type { MemberVariant } from '../config/navMenus'
import { getProfilePath } from '../utils/profilePath'
import { getPendingChartesForUser } from '../utils/charteHelpers'
import { useTenant } from '../context/TenantContext'
import { waitForBundleIfPending } from '../lib/dashboardCache'
import { ensurePushSubscription, needsRefresh, pushSupported } from '../lib/pushSubscription'

const SIDEBAR_MIN_WIDTH = 200
const SIDEBAR_MAX_WIDTH = 400
const SIDEBAR_DEFAULT_WIDTH = 280

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [menuSheetOpen, setMenuSheetOpen] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return SIDEBAR_DEFAULT_WIDTH
    const stored = Number(window.localStorage.getItem('sidebar_width'))
    if (!stored || Number.isNaN(stored)) return SIDEBAR_DEFAULT_WIDTH
    return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, stored))
  })
  const [isResizing, setIsResizing] = useState(false)
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true
  )

  const { user, effectiveRole, clubRoles, canRegisterPush } = useAuth()
  const { clubId } = useTenant()
  const location = useLocation()
  const navigate = useNavigate()
  const activeView = useActiveNavView()

  const isMemberMobile = !isDesktop && activeView === 'member'
  const isCoachMobile = !isDesktop && activeView === 'coach'
  const isCommitteeMobile = !isDesktop && activeView === 'admin'
  const hasBottomBar = isMemberMobile || isCoachMobile || isCommitteeMobile

  const memberVariant: MemberVariant = clubRoles.includes('parent')
    ? 'parent'
    : clubRoles.includes('member')
    ? 'player'
    : clubRoles.includes('supporter')
    ? 'supporter'
    : 'generic'
  const hasTeamContext = useHasTeamContext(user?.id, user?.email, memberVariant)
  const isEventOrganizer = useIsEventOrganizer(user?.id)

  // Member-specific state for the menu sheet
  const [hasPendingCharte, setHasPendingCharte] = useState(false)
  const [shopUrl, setShopUrl] = useState<string | null>(null)

  const profilePath = getProfilePath(clubRoles)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    if (!isResizing) return
    const onMove = (e: MouseEvent) => {
      const next = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, e.clientX))
      setSidebarWidth(next)
    }
    const onUp = () => {
      setIsResizing(false)
      try { window.localStorage.setItem('sidebar_width', String(sidebarWidthRef.current)) } catch {}
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isResizing])

  const sidebarWidthRef = useRef(sidebarWidth)
  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth
    try { window.localStorage.setItem('sidebar_width', String(sidebarWidth)) } catch {}
  }, [sidebarWidth])

  // Fetch unread message count scoped to current segment
  const fetchUnreadCount = async () => {
    if (!user) return
    const scope = activeView === 'admin' ? 'admin' : activeView === 'member' ? 'member' : undefined
    const rpcArgs = scope ? { p_scope: scope } : {}
    const { data, error } = await supabase.rpc('get_unread_message_count', rpcArgs)
    if (error) { console.error('[Layout] get_unread_message_count error', error); return }
    setUnreadCount(typeof data === 'number' ? data : 0)
  }

  useEffect(() => {
    if (!user) return
    fetchUnreadCount()
    const iv = setInterval(fetchUnreadCount, 60_000)
    return () => clearInterval(iv)
  }, [user, activeView])

  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel(uniqueChannelName('global-messages'))
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversation_messages',
        },
        (payload) => {
          const newMsg = payload.new as any

          if (newMsg.sender_id === user.id) return

          ;(async () => {
            const { data: participant } = await supabase
              .from('conversation_participants')
              .select('user_id')
              .eq('conversation_id', newMsg.conversation_id)
              .eq('user_id', user.id)
              .maybeSingle()

            if (!participant) return

            setUnreadCount(prev => prev + 1)

            if (
              pushSupported() &&
              Notification.permission === 'granted' &&
              document.hidden
            ) {
              const { data: senderData } = await supabase.rpc('get_sender_display_names', {
                user_ids: [newMsg.sender_id]
              })

              const { data: conv } = await supabase
                .from('conversations')
                .select('name, team_id, teams(name)')
                .eq('id', newMsg.conversation_id)
                .maybeSingle()

              const sender = senderData?.[0]
              const senderName = sender?.full_name || 'Un membre'
              const messageBody = newMsg.body?.substring(0, 60) || 'Nouvelle pièce jointe'

              const teamName = conv?.teams && !Array.isArray(conv.teams) ? (conv.teams as any).name : null
              const conversationLabel = teamName && conv
                ? `${teamName} · ${conv.name}`
                : conv?.name || 'Message'

              const notificationBody = `${conversationLabel} — ${messageBody}`

              const notification = new Notification(`\u{1F4AC} ${senderName}`, {
                body: notificationBody,
                icon: '/logo.png',
                tag: `message-${newMsg.conversation_id}`,
                silent: false
              })

              notification.onclick = () => {
                window.focus()
                navigate('/messages')
                notification.close()
              }

              setTimeout(() => notification.close(), 5000)
            }
          })()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, navigate])

  useEffect(() => {
    if (unreadCount > 0) {
      document.title = `(${unreadCount}) ClubSphere`
    } else {
      document.title = 'ClubSphere'
    }
  }, [unreadCount])

  useEffect(() => {
    if (location.pathname.startsWith('/messages') && !document.hidden) {
      setTimeout(() => { setUnreadCount(0); fetchUnreadCount() }, 1000)
    }
  }, [location.pathname])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && location.pathname.startsWith('/messages')) {
        setUnreadCount(0)
        document.title = 'ClubSphere'
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [location.pathname])

  useEffect(() => {
    setSidebarOpen(false)
    setMenuSheetOpen(false)
  }, [location.pathname])

  // Member menu sheet: fetch organizer status and pending chartes
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false

    ;(async () => {
      const cached = await waitForBundleIfPending()
      if (cancelled) return
      if (cached) {
        setHasPendingCharte(cached.hasPendingCharte)
      } else {
        if (effectiveRole) {
          const info = await getPendingChartesForUser(user.id, effectiveRole)
          if (!cancelled) setHasPendingCharte(info.pendingForSelf.length > 0 || info.pendingForChildren.length > 0)
        }
      }

      if (!cancelled && clubId) {
        const { data: csData } = await supabase
          .from('club_settings')
          .select('shop_url')
          .eq('club_id', clubId)
          .maybeSingle()
        if (!cancelled) setShopUrl(csData?.shop_url || null)
      }
    })()
    return () => { cancelled = true }
  }, [user?.id, effectiveRole, clubId])

  useEffect(() => {
    if (!user?.id || !clubId || !canRegisterPush) return
    if (!pushSupported() || Notification.permission !== 'granted') return

    if (needsRefresh(clubId)) {
      ensurePushSubscription(clubId)
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && needsRefresh(clubId)) {
        ensurePushSubscription(clubId)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [user?.id, clubId, canRegisterPush])

  const [redirectToast, setRedirectToast] = useState<string | null>(null)
  useEffect(() => {
    const msg = typeof window !== 'undefined' ? sessionStorage.getItem('finance_module_redirect_toast') : null
    if (msg) {
      sessionStorage.removeItem('finance_module_redirect_toast')
      setRedirectToast(msg)
      const t = setTimeout(() => setRedirectToast(null), 4000)
      return () => clearTimeout(t)
    }
  }, [location.pathname])

  return (
    <div className="flex flex-col" style={{ height: '100dvh', background: 'var(--bg-page)' }}>
      <RainModeBanner />
      <div className="flex flex-1 min-h-0">
      <ClubNoticeBanner />
      {/* Desktop sidebar — always visible, fixed left */}
      <div
        className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 border-r"
        style={{ width: `${sidebarWidth}px`, borderColor: 'var(--border-color)', background: 'var(--bg-sidebar)', zIndex: 30 }}
      >
        <Sidebar />
        <div
          onMouseDown={(e) => { e.preventDefault(); setIsResizing(true) }}
          style={{
            position: 'absolute',
            top: 0,
            right: -2,
            width: 4,
            height: '100%',
            cursor: 'col-resize',
            zIndex: 40,
            background: isResizing ? 'var(--border-color)' : 'transparent',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { if (!isResizing) (e.currentTarget as HTMLDivElement).style.background = 'var(--border-color)' }}
          onMouseLeave={(e) => { if (!isResizing) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
        />
      </div>

      {/* Mobile sidebar overlay — only for views without a bottom bar */}
      {sidebarOpen && !hasBottomBar && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="fixed inset-0"
            style={{ background: 'rgba(0,0,0,0.5)' }}
            onClick={() => setSidebarOpen(false)}
          />
          <div
            className="fixed left-0 top-0 bottom-0 flex flex-col"
            style={{ width: '280px', background: 'var(--bg-sidebar)', zIndex: 51 }}
          >
            <div
              className="flex items-center justify-end p-3 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--border-color)' }}
            >
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-2 rounded-lg transition-colors"
                style={{ color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <Sidebar onClose={() => setSidebarOpen(false)} />
            </div>
          </div>
        </div>
      )}

      {/* Main content — offset by sidebar width on desktop */}
      <div
        className="flex-1 flex flex-col overflow-hidden"
        style={{
          paddingLeft: isDesktop ? `${sidebarWidth}px` : undefined,
          ['--app-bottom-nav-space' as string]: hasBottomBar
            ? 'calc(var(--bottom-nav-h) + var(--bottom-nav-gap) + env(safe-area-inset-bottom, 0px))'
            : '0px',
        }}
      >
        {/* Mobile/tablet top bar with hamburger — hidden for views with a bottom bar */}
        {!hasBottomBar && (
          <div
            className="lg:hidden flex items-center gap-3 px-4 py-3 flex-shrink-0 border-b"
            style={{ borderColor: 'var(--border-color)', background: 'var(--bg-sidebar)' }}
          >
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg transition-colors"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Menu size={22} />
            </button>
            <span className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>ClubSphere</span>
          </div>
        )}

        <main
          className="flex-1 overflow-y-auto"
          style={{
            background: 'var(--bg-page)',
            padding: hasBottomBar ? '16px 16px var(--bottom-bar-space, 100px)' : '24px 32px',
          }}
        >
          <InstallBanner />
          <MfaGraceBanner />
          <Outlet />
        </main>
      </div>

      {/* Member mobile bottom bar */}
      {isMemberMobile && (
        <MemberBottomBar
          unreadCount={unreadCount}
          menuOpen={menuSheetOpen}
          onMenuToggle={() => setMenuSheetOpen(o => !o)}
          hasTeamContext={hasTeamContext}
          isEventOrganizer={isEventOrganizer}
          hasPendingCharte={hasPendingCharte}
          profilePath={profilePath}
          shopUrl={shopUrl}
        />
      )}

      {/* Coach mobile bottom bar */}
      {isCoachMobile && (
        <CoachBottomBar
          unreadCount={unreadCount}
          menuOpen={menuSheetOpen}
          onMenuToggle={() => setMenuSheetOpen(o => !o)}
          shopUrl={shopUrl}
        />
      )}

      {/* Committee mobile bottom bar */}
      {isCommitteeMobile && (
        <CommitteeBottomBar
          unreadCount={unreadCount}
          menuOpen={menuSheetOpen}
          onMenuToggle={() => setMenuSheetOpen(o => !o)}
        />
      )}

      {redirectToast && (
        <div style={{
          position: 'fixed', bottom: hasBottomBar ? 'var(--bottom-bar-space, 100px)' : '24px', right: '24px', zIndex: 100,
          background: 'var(--info-soft)', color: 'var(--info)',
          border: '1px solid var(--info)',
          borderRadius: 10, padding: '12px 18px', fontWeight: 600, fontSize: 14,
          boxShadow: 'var(--shadow-lg)'
        }}>{redirectToast}</div>
      )}
    </div>
    </div>
  )
}
