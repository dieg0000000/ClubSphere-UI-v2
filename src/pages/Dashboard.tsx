import { useEffect, useState, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { reportLoadError } from '../utils/reportLoadError'
import { LoadError } from '../components/LoadError'
import { useAuth } from '../context/AuthContext'
import { useTenant } from '../context/TenantContext'
import { RoleBadges } from '../components/RoleBadges'
import { supabase } from '../lib/supabase'
import { Calendar, Users, UserX, ClipboardList, MessageSquare, Paperclip, TriangleAlert as AlertTriangle, ChevronRight, FlaskConical, X as XIcon, Ban, Check } from 'lucide-react'
import { RainBadge } from '../components/RainBadge'
import { Event, News } from '../types'
import { DepartureReminderBanner } from '../components/DepartureReminderBanner'
import { getUserDisplayName } from '../utils/userHelpers'
import { PlayerParentDashboard } from './PlayerParentDashboard'
import { SupporterDashboard } from './SupporterDashboard'
import NewsCategoryBadge from '../components/NewsCategoryBadge'
import { SponsorsCarousel } from '../components/SponsorsCarousel'
import { getPendingChartesForUser } from '../utils/charteHelpers'
import Button from '../components/ui/Button'
import { Alert } from '../components/ui/Alert'
import { PushNotificationPrompt } from '../components/PushNotificationPrompt'
import ToHandleCard from '../components/ToHandleCard'
import { RainModeToggle } from '../components/RainModeToggle'
import { Toast } from '../components/Toast'
import { useToast } from '../hooks/useToast'
import { useActiveNavView } from '../hooks/useNavView'
import CommitteeMobileHome from './CommitteeMobileHome'
import GalleryReportsAlert from '../components/GalleryReportsAlert'

export function Dashboard() {
  const navigate = useNavigate()
  const { user, effectiveRole, isPlatformAdmin, clubRoles } = useAuth()
  const { clubId } = useTenant()
  const { toast: rainToast, showToast: showRainToast } = useToast()
  const role = effectiveRole
  const currentNavView = useActiveNavView()
  const isAdminView = currentNavView === 'admin'
  const isCoachView = currentNavView === 'coach'
  const isMemberView = currentNavView === 'member'
  const isAdminLike = isAdminView
  const isCoach = isCoachView
  const isParent = isMemberView && clubRoles.includes('parent')
  const [events, setEvents] = useState<Event[]>([])
  const [news, setNews] = useState<News[]>([])
  const [expiringSponsorCount, setExpiringSponsorCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const [simulateDecember, setSimulateDecember] = useState(false)
  const [adminStats, setAdminStats] = useState({
    activePlayers: 0,
    juniorPlayers: 0,
    noTeamPlayers: 0,
    totalMembers: 0,
    activeTeams: 0,
    juniorTeams: 0,
    upcomingEvents: 0,
    pendingInscriptions: 0,
  })
  const [selectedArticle, setSelectedArticle] = useState<News | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [unsavedSessions, setUnsavedSessions] = useState<any[]>([])
  const [coachTeamIds, setCoachTeamIds] = useState<string[]>([])
  const [parentName, setParentName] = useState<string | null>(null)
  const [parentChildren, setParentChildren] = useState<any[]>([])
  const [displayName, setDisplayName] = useState<string>('')
  const [pendingChartes, setPendingChartes] = useState<{ joueurs: number; entraineurs: number }>({ joueurs: 0, entraineurs: 0 })
  const [myPendingCharte, setMyPendingCharte] = useState<{ id: string; title: string } | null>(null)
  const [myPendingCount, setMyPendingCount] = useState(0)
  const [missingAsfNumber, setMissingAsfNumber] = useState(false)
  const [jsRenewalAdminCount, setJsRenewalAdminCount] = useState(0)
  const [jsRenewalAdminHasExpired, setJsRenewalAdminHasExpired] = useState(false)
  const [jsRenewalCoach, setJsRenewalCoach] = useState<{ expiryDate: string; expired: boolean; urgent: boolean } | null>(null)
  const [pendingInscriptionsCount, setPendingInscriptionsCount] = useState(0)
  const [pendingActivationsCount, setPendingActivationsCount] = useState(0)
  const [selfDeletedCoaches, setSelfDeletedCoaches] = useState<{ count: number; names: string[] }>({ count: 0, names: [] })
  const [pendingExpenseCount, setPendingExpenseCount] = useState(0)
  interface AddressAlert {
    id: string;
    person_kind: string;
    person_name: string;
    old_address: string | null;
    new_address: string;
    created_at: string;
  }
  const [addressAlerts, setAddressAlerts] = useState<AddressAlert[]>([])
  const [nextMatch, setNextMatch] = useState<{
    id: string; match_date: string; match_time: string | null; opponent_name: string;
    is_home: boolean; match_type: string | null; venue: { name: string; city: string | null } | null;
  } | null>(null)
  const [nextTraining, setNextTraining] = useState<{
    id: string; team_id: string; session_date: string; start_time: string | null; end_time: string | null; terrain_name: string | null; terrain_half_label?: string | null; team_name?: string | null; cancelled: boolean; cancelled_reason: string | null;
    rain_applied?: boolean;
  } | null>(null)
  const [recentTeamMessages, setRecentTeamMessages] = useState<{
    id: string; body: string; created_at: string; sender_name: string;
    team_name: string; attachment_type: string | null;
  }[]>([])

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoadFailed(false)
        if (isMemberView) {
          setLoading(false)
          return
        }
        setLoading(true)

        if (isParent && user) {
          const { data: parentMembers } = await supabase
            .from('parent_members')
            .select(`
              member_id,
              members:member_id (
                id,
                first_name,
                last_name,
                legal_rep1_firstname,
                legal_rep1_lastname,
                team_id,
                teams:team_id (
                  name,
                  team_categories (name)
                )
              )
            `)
            .eq('parent_user_id', user.id);

          if (parentMembers && parentMembers.length > 0) {
            const { data: prof } = await supabase
              .from('profiles')
              .select('first_name, last_name, full_name')
              .eq('id', user.id)
              .maybeSingle();
            setParentName(
              prof?.first_name
                ? `${prof.first_name} ${prof.last_name || ''}`.trim()
                : prof?.full_name || user.email.split('@')[0]
            );
            setParentChildren(parentMembers.map(pm => pm.members));
          }
        }

        if (isCoach) {
          const { data: { user: authUser } } = await supabase.auth.getUser();
          const { data: coachData } = await supabase
            .from('coaches')
            .select('id')
            .eq('user_id', authUser?.id ?? '')
            .maybeSingle();

          if (coachData) {
            const { data: teamsData } = await supabase
              .from('teams')
              .select('id, name')
              .or(`coach_id.eq.${coachData.id},assistant_coach_id.eq.${coachData.id}`);

            const teamIds = teamsData?.map(t => t.id) || [];
            const teamNameMap: Record<string, string> = Object.fromEntries((teamsData || []).map(t => [t.id, t.name]));
            setCoachTeamIds(teamIds);

            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];

            const { data: recentSessions } = await supabase
              .from('training_sessions')
              .select(`
                id, session_date, team_id, cancelled, validated_at,
                attendance:training_attendance(id)
              `)
              .in('team_id', teamIds)
              .lte('session_date', todayStr);

            const unsaved = recentSessions?.filter(
              s => !s.cancelled && !s.validated_at
            ) || [];

            setUnsavedSessions(unsaved);

            const { data: matchData } = await supabase
              .from('matches')
              .select('id, match_date, match_time, opponent_name, is_home, match_type, venue:venues(name, city)')
              .in('team_id', teamIds)
              .gte('match_date', todayStr)
              .not('status', 'in', '("annulé","cancelled")')
              .order('match_date')
              .order('match_time')
              .limit(1)
              .maybeSingle();

            if (matchData) {
              setNextMatch({
                ...matchData,
                venue: Array.isArray(matchData.venue) ? matchData.venue[0] : matchData.venue
              } as any);
            }

            const in8wStr = new Date(Date.now() + 56 * 24 * 3600 * 1000).toISOString().split('T')[0];
            const { data: bundle } = await supabase.rpc('get_my_teams_bundle', {
              p_start: todayStr,
              p_end: in8wStr,
            });

            if (bundle) {
              const sessions = ((bundle as any).training_sessions || []) as Array<{
                id: string; team_id: string; session_date: string;
                start_time: string | null; end_time: string | null;
                terrain_name: string | null; terrain_half_label: string | null;
                cancelled: boolean; cancelled_reason: string | null;
                rain_applied?: boolean;
              }>;

              const nowZurich = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Zurich' }));
              const nowTime = nowZurich.getHours().toString().padStart(2, '0') + ':' + nowZurich.getMinutes().toString().padStart(2, '0');

              const nextSession = sessions
                .filter(s => teamIds.includes(s.team_id))
                .filter(s => !s.cancelled)
                .filter(s => {
                  if (s.session_date > todayStr) return true;
                  if (s.session_date === todayStr) return (s.end_time || '23:59') > nowTime;
                  return false;
                })
                .sort((a, b) => a.session_date.localeCompare(b.session_date) || (a.start_time || '').localeCompare(b.start_time || ''))
                [0];

              if (nextSession) {
                setNextTraining({
                  id: nextSession.id,
                  team_id: nextSession.team_id,
                  session_date: nextSession.session_date,
                  start_time: nextSession.start_time,
                  end_time: nextSession.end_time,
                  terrain_name: nextSession.terrain_name,
                  terrain_half_label: nextSession.terrain_half_label,
                  team_name: teamIds.length > 1 ? (teamNameMap[nextSession.team_id] || null) : null,
                  cancelled: false,
                  cancelled_reason: null,
                  rain_applied: !!nextSession.rain_applied,
                });
              }
            }

            const { data: convData } = await supabase
              .from('conversations')
              .select('id, team_id, teams:team_id(name)')
              .in('team_id', teamIds)
              .eq('type', 'team_full');

            if (convData && convData.length > 0) {
              const convIds = convData.map(c => c.id);
              const convTeamMap = Object.fromEntries(
                convData.map(c => [c.id, (c.teams as any)?.name || ''])
              );

              const { data: msgData } = await supabase
                .from('conversation_messages')
                .select('id, sender_id, body, created_at, conversation_id, attachment_type')
                .in('conversation_id', convIds)
                .order('created_at', { ascending: false })
                .limit(2);

              if (msgData && msgData.length > 0) {
                const senderIds = [...new Set(msgData.map(m => m.sender_id).filter(Boolean))];
                const { data: senderData } = await supabase.rpc('get_sender_display_names', {
                  user_ids: senderIds
                });
                const senderMap = Object.fromEntries(
                  (senderData || []).map((s: any) => [s.id, s.full_name])
                );
                setRecentTeamMessages(msgData.map(m => ({
                  id: m.id,
                  body: m.body,
                  created_at: m.created_at,
                  sender_name: senderMap[m.sender_id] || 'Inconnu',
                  team_name: convTeamMap[m.conversation_id] || '',
                  attachment_type: m.attachment_type,
                })));
              }
            }
          }
        }

        if (isAdminLike) {
          const [
            activePlayersResult,
            juniorPlayersResult,
            noTeamResult,
            totalMembersResult,
            activeTeamsResult,
            juniorTeamsResult,
            upcomingEventsResult,
            inscriptionsResult,
          ] = await Promise.all([
            supabase
              .from('members')
              .select('id, teams!inner(type)', { count: 'exact', head: true })
              .eq('teams.type', 'active'),
            supabase
              .from('members')
              .select('id, teams!inner(type)', { count: 'exact', head: true })
              .eq('teams.type', 'junior'),
            supabase
              .from('members')
              .select('*', { count: 'exact', head: true })
              .is('team_id', null)
              .neq('status', 'archive'),
            supabase
              .from('members')
              .select('*', { count: 'exact', head: true })
              .or('status.is.null,status.neq.archive'),
            supabase
              .from('teams')
              .select('*', { count: 'exact', head: true })
              .eq('type', 'active'),
            supabase
              .from('teams')
              .select('*', { count: 'exact', head: true })
              .eq('type', 'junior'),
            supabase
              .from('events')
              .select('*', { count: 'exact', head: true })
              .gte('date', new Date().toISOString()),
            supabase
              .from('inscription_requests')
              .select('*', { count: 'exact', head: true })
              .in('status', ['pending', 'in_progress']),
          ]);

          setAdminStats({
            activePlayers: activePlayersResult.count || 0,
            juniorPlayers: juniorPlayersResult.count || 0,
            noTeamPlayers: noTeamResult.count || 0,
            totalMembers: totalMembersResult.count || 0,
            activeTeams: activeTeamsResult.count || 0,
            juniorTeams: juniorTeamsResult.count || 0,
            upcomingEvents: upcomingEventsResult.count || 0,
            pendingInscriptions: inscriptionsResult.count || 0,
          });

          const { data: cs } = await supabase
            .from('club_settings')
            .select('club_asf_number')
            .maybeSingle();
          setMissingAsfNumber(!cs?.club_asf_number);
        }

        const [eventsResult, newsResult] = await Promise.all([
          supabase
            .from('events')
            .select('*')
            .gte('date', new Date().toISOString())
            .order('date', { ascending: true })
            .limit(3),
          supabase
            .from('news')
            .select('*')
            .order('published_at', { ascending: false })
            .limit(3),
        ])

        setEvents(eventsResult.data || [])
        setNews(newsResult.data || [])
        setExpiringSponsorCount(0)
      } catch (error) {
        reportLoadError('Dashboard', error)
        setLoadFailed(true)
      } finally {
        setLoading(false)
      }
    }

    loadData()

    const fetchDisplayName = async () => {
      if (user?.id && !isMemberView) {
        const name = await getUserDisplayName(user.id)
        setDisplayName(name)
      }
    }
    fetchDisplayName()

    const fetchPendingChartes = async () => {
      if (!user?.id || isMemberView) return
      if (isAdminLike) {
        const { data: activeSeasons } = await supabase.from('seasons').select('id, active').eq('active', true).maybeSingle()
        if (!activeSeasons) return
        const { data: chartes } = await supabase
          .from('documents')
          .select('id, category, target_team_ids')
          .in('category', ['charte_joueurs', 'charte_joueurs_mineurs', 'charte_entraineurs'])
          .eq('is_active', true)
          .eq('season_id', activeSeasons.id)
        if (!chartes || chartes.length === 0) return

        const joueursDoc = chartes.find(c => c.category === 'charte_joueurs')
        const mineursDoc = chartes.find(c => c.category === 'charte_joueurs_mineurs')
        const coachDoc = chartes.find(c => c.category === 'charte_entraineurs')

        let joueurPending = 0
        let coachPending = 0

        const cutoff = new Date()
        cutoff.setFullYear(cutoff.getFullYear() - 18)
        const cutoffDate = cutoff.toISOString().split('T')[0]

        if (mineursDoc) {
          const { data: minors } = await supabase
            .from('members')
            .select('id')
            .eq('licence_status', 'actif')
            .not('team_id', 'is', null)
            .or(`birth_date.is.null,birth_date.gte.${cutoffDate}`)
          const minorIds = (minors ?? []).map(m => m.id)
          const { data: parentLinks } = minorIds.length > 0
            ? await supabase.from('parent_members').select('parent_user_id, member_id').in('member_id', minorIds)
            : { data: [] }
          const expected = minorIds.length + new Set((parentLinks ?? []).map(p => p.parent_user_id)).size
          const { count: validated } = await supabase
            .from('document_acknowledgements').select('*', { count: 'exact', head: true }).eq('document_id', mineursDoc.id)
          joueurPending += Math.max(0, expected - (validated ?? 0))
        }

        if (joueursDoc) {
          const { data: adults } = await supabase
            .from('members')
            .select('id')
            .eq('licence_status', 'actif')
            .not('team_id', 'is', null)
            .not('birth_date', 'is', null)
            .lt('birth_date', cutoffDate)
          const adultCount = (adults ?? []).length
          const { count: validated } = await supabase
            .from('document_acknowledgements').select('*', { count: 'exact', head: true }).eq('document_id', joueursDoc.id)
          joueurPending += Math.max(0, adultCount - (validated ?? 0))
        }

        if (coachDoc) {
          let teamsQ = supabase.from('teams').select('coach_id, assistant_coach_id').eq('active', true)
          const targets = (coachDoc as any).target_team_ids as string[] | null
          if (targets && targets.length > 0) teamsQ = teamsQ.in('id', targets)
          const { data: tms } = await teamsQ
          const coachIds = new Set<string>()
          for (const t of tms ?? []) {
            if ((t as any).coach_id) coachIds.add((t as any).coach_id)
            if ((t as any).assistant_coach_id) coachIds.add((t as any).assistant_coach_id)
          }
          const { count: validated } = await supabase
            .from('document_acknowledgements').select('*', { count: 'exact', head: true }).eq('document_id', coachDoc.id)
          coachPending = Math.max(0, coachIds.size - (validated ?? 0))
        }

        setPendingChartes({ joueurs: joueurPending, entraineurs: coachPending })
      }

      if (!effectiveRole) {
        setMyPendingCount(0)
        setMyPendingCharte(null)
      } else {
        const info = await getPendingChartesForUser(user.id, effectiveRole)
        setMyPendingCount(info.pendingForSelf.length)
        if (info.pendingForSelf.length > 0) {
          setMyPendingCharte({ id: info.pendingForSelf[0].id, title: info.pendingForSelf[0].title })
        } else if (info.pendingForChildren.length > 0) {
          const p = info.pendingForChildren[0]
          setMyPendingCharte({ id: p.doc.id, title: `${p.doc.title} (pour ${p.childName})` })
        }
      }
    }
    fetchPendingChartes()

    const fetchJsRenewal = async () => {
      if (!user) return
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const cutoff = new Date(today)
      cutoff.setMonth(cutoff.getMonth() + 10)
      const cutoffStr = cutoff.toISOString().split('T')[0]
      const todayStr = today.toISOString().split('T')[0]

      if (isAdminLike) {
        const { data } = await supabase
          .from('coaches')
          .select('id, diploma_expiry_date, next_js_course_date, wants_js_renewal, coaching_qualifications!inner(validity_years)')
          .not('qualification_id', 'is', null)
          .not('diploma_expiry_date', 'is', null)
          .is('next_js_course_date', null)
          .eq('wants_js_renewal', true)
          .lte('diploma_expiry_date', cutoffStr)

        const rows = (data || []).filter((c: any) => c.coaching_qualifications?.validity_years != null)
        setJsRenewalAdminCount(rows.length)
        setJsRenewalAdminHasExpired(rows.some((c: any) => c.diploma_expiry_date < todayStr))
      }

      if (isCoach) {
        const { data: authData } = await supabase.auth.getUser()
        const authId = authData.user?.id
        if (!authId) return
        const { data: coachRow } = await supabase
          .from('coaches')
          .select('diploma_expiry_date, next_js_course_date, wants_js_renewal, coaching_qualifications(validity_years)')
          .eq('user_id', authId)
          .maybeSingle()
        const c: any = coachRow
        if (!c) return
        if (!c.coaching_qualifications || c.coaching_qualifications.validity_years == null) return
        if (!c.diploma_expiry_date) return
        if (c.next_js_course_date) return
        if (c.wants_js_renewal === false) return
        if (c.diploma_expiry_date > cutoffStr) return

        const expiry = new Date(c.diploma_expiry_date)
        const expired = expiry < today
        const threeMonths = new Date(today)
        threeMonths.setMonth(threeMonths.getMonth() + 3)
        const urgent = expired || expiry < threeMonths
        setJsRenewalCoach({ expiryDate: c.diploma_expiry_date, expired, urgent })
      }
    }
    fetchJsRenewal()

    const fetchPendingInscriptions = async () => {
      if (!user) return
      if (!isAdminLike) return
      const { count } = await supabase
        .from('inscription_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
      setPendingInscriptionsCount(count || 0)
    }
    fetchPendingInscriptions()

    const fetchPendingActivations = async () => {
      if (!user) return
      if (!isAdminLike) return
      const { count } = await supabase
        .from('activation_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
      setPendingActivationsCount(count || 0)
    }
    fetchPendingActivations()

    const fetchSelfDeletedCoaches = async () => {
      if (!user) return
      if (!isAdminLike) return
      const { data, count } = await supabase
        .from('coaches')
        .select('id, first_name, last_name', { count: 'exact' })
        .not('self_deleted_at', 'is', null)
      const names = (data || []).map((c: any) => `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim()).filter(Boolean)
      setSelfDeletedCoaches({ count: count || 0, names })
    }
    fetchSelfDeletedCoaches()

    const fetchPendingExpenses = async () => {
      if (!user || !isAdminLike || !clubId) return
      const { count } = await supabase
        .from('expenses')
        .select('id', { count: 'exact', head: true })
        .eq('club_id', clubId)
        .eq('status', 'submitted')
      setPendingExpenseCount(count || 0)
    }
    fetchPendingExpenses()

    const fetchAddressAlerts = async () => {
      if (!user || !isAdminLike) return
      const { data } = await supabase
        .from('address_change_alerts')
        .select('*')
        .is('acknowledged_at', null)
        .order('created_at', { ascending: false })
      setAddressAlerts((data as AddressAlert[]) || [])
    }
    fetchAddressAlerts()
  }, [user, effectiveRole, currentNavView, retryKey])

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('fr-CH', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  const parseLocalDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  const formatLongDate = (dateStr: string) => {
    const d = parseLocalDate(dateStr);
    return d.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  const formatTime = (timeStr: string) => timeStr.substring(0, 5);


  const StatCard = ({ icon, label, value, path, color }: { icon: React.ReactNode, label: string, value: string | number, path: string, color: string }) => (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        padding: '20px'
      }}
    >
      <div style={{
        color: 'var(--text-muted)',
        fontSize: '13px',
        marginBottom: '8px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        {icon} {label}
      </div>
      <div style={{
        color: 'var(--text-primary)',
        fontSize: '32px',
        fontWeight: '800'
      }}>
        {value}
      </div>
    </div>
  )

  if (isPlatformAdmin && !effectiveRole) {
    return (
      <div className="p-4 lg:p-8 max-w-3xl mx-auto">
        <div
          className="rounded-xl p-6"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          <h1 className="text-2xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
            Bienvenue, super-administrateur
          </h1>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Vous êtes connecté en tant que super-administrateur. Rendez-vous sur la console
            (<a
              href={`https://console.${import.meta.env.VITE_APP_ROOT_DOMAIN || 'clubsphere.cloud'}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent)', fontWeight: 600 }}
            >console.{import.meta.env.VITE_APP_ROOT_DOMAIN || 'clubsphere.cloud'}</a>) pour gérer la plateforme.
          </p>
        </div>
      </div>
    )
  }

  if (isMemberView) {
    const isSupporterOnly =
      clubRoles.includes('supporter') &&
      !clubRoles.some((r) =>
        ['member', 'parent', 'coach', 'assistant_coach', 'admin', 'president', 'vice_president', 'committee'].includes(r)
      )
    if (isSupporterOnly) {
      return <SupporterDashboard />
    }
    return <PlayerParentDashboard />
  }

  const isCommitteeMobile = isAdminView && !window.matchMedia('(min-width: 1024px)').matches
  if (isCommitteeMobile) {
    return <CommitteeMobileHome />
  }

  if (loadFailed) return (
    <div className="page-container">
      <LoadError onRetry={() => { setLoadFailed(false); setRetryKey(k => k + 1) }} />
    </div>
  )

  return (
    <div className="page-container" style={{ overflow: 'hidden' }}>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
          Bienvenue, {displayName ? displayName.split(' ')[0] : user?.full_name.split(' ')[0]}!
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          {isAdminView ? 'Espace administration' : 'Espace entraîneur'}
        </p>
        <div style={{ marginTop: '4px' }}>
          <RoleBadges />
        </div>
        {isAdminLike && (
          <div style={{ marginTop: '12px' }}>
            <RainModeToggle onToast={showRainToast} />
          </div>
        )}
      </div>

      <PushNotificationPrompt />

      <div className="flex flex-col gap-4 mb-6">
        {isAdminLike && <GalleryReportsAlert />}

        {isAdminLike && pendingExpenseCount > 0 && (
          <Alert
            variant="warning"
            title="Attention"
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate('/admin/finances/depenses?tab=a_traiter')}
              >
                Voir →
              </Button>
            }
          >
            {pendingExpenseCount === 1
              ? '1 note de frais à traiter'
              : `${pendingExpenseCount} notes de frais à traiter`}
          </Alert>
        )}

        {isAdminLike && addressAlerts.length > 0 && (
          <Alert variant="warning" title="Attention">
            <div style={{ marginBottom: '8px' }}>Changement(s) d'adresse à reporter dans Clubcorner&nbsp;:</div>
            <div className="flex flex-col gap-3">
              {addressAlerts.map((a) => (
                <div
                  key={a.id}
                  className="flex items-start justify-between gap-3"
                  style={{ fontSize: '13px', lineHeight: 1.5 }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{a.person_kind} — {a.person_name}</div>
                    <div>{a.new_address}</div>
                    {a.old_address && (
                      <div style={{ opacity: 0.65, fontSize: '12px' }}>ancienne&nbsp;: {a.old_address}</div>
                    )}
                    <div style={{ opacity: 0.65, fontSize: '12px' }}>
                      {new Date(a.created_at).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const profileId = user?.id
                      if (!profileId) return
                      const { error } = await supabase
                        .from('address_change_alerts')
                        .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: profileId })
                        .eq('id', a.id)
                      if (!error) {
                        setAddressAlerts((prev) => prev.filter((x) => x.id !== a.id))
                      }
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md transition-colors"
                    style={{
                      flexShrink: 0,
                      marginTop: '2px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    <Check size={14} /> Fait dans Clubcorner
                  </button>
                </div>
              ))}
            </div>
          </Alert>
        )}
      </div>

      <div className="flex flex-col gap-4 mb-8">
      {isAdminView && isPlatformAdmin && !simulateDecember && (
        <Button
          variant="danger"
          size="sm"
          onClick={() => setSimulateDecember(true)}
        >
          <FlaskConical size={16} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle' }} /> TEST — Simuler déclaration partants (décembre)
        </Button>
      )}

      <DepartureReminderBanner
        simulateDecember={simulateDecember}
        onDisableTest={() => setSimulateDecember(false)}
      />

      {jsRenewalAdminCount > 0 && isAdminLike && (
        <Alert
          variant={jsRenewalAdminHasExpired ? 'danger' : 'warning'}
          title="Renouvellement J+S nécessaire"
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate('/admin/entraineurs?filter=js-renewal-needed')}
            >
              Voir la liste →
            </Button>
          }
        >
          {jsRenewalAdminCount === 1
            ? '1 entraîneur doit programmer sa formation de renouvellement.'
            : `${jsRenewalAdminCount} entraîneurs doivent programmer leur formation de renouvellement.`}
        </Alert>
      )}

      {pendingInscriptionsCount > 0 && isAdminLike && (
        <Alert
          variant="warning"
          title="Nouvelles demandes d'inscription"
          action={
            <Button variant="secondary" size="sm" onClick={() => navigate('/admin/inscriptions')}>
              Voir les demandes →
            </Button>
          }
        >
          {pendingInscriptionsCount === 1
            ? "1 nouvelle demande d'inscription en attente."
            : `${pendingInscriptionsCount} nouvelles demandes d'inscription en attente.`}
        </Alert>
      )}

      {pendingActivationsCount > 0 && isAdminLike && (
        <Alert
          variant="warning"
          title={
            pendingActivationsCount === 1
              ? "1 demande d'activation en attente"
              : `${pendingActivationsCount} demandes d'activation en attente`
          }
          action={
            <Button variant="secondary" size="sm" onClick={() => navigate('/admin/activations')}>
              Voir les demandes →
            </Button>
          }
        >
          Des utilisateurs attendent la validation de leur accès (rattachement d'enfant, etc.).
        </Alert>
      )}

      {jsRenewalCoach && isCoach && (
        <Alert
          variant={jsRenewalCoach.urgent ? 'danger' : 'warning'}
          title={jsRenewalCoach.expired ? 'Votre diplôme J+S est expiré' : 'Votre diplôme J+S expire bientôt'}
        >
          Date d'expiration : {new Date(jsRenewalCoach.expiryDate).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })}. Pensez à programmer votre formation de renouvellement.
        </Alert>
      )}

      {myPendingCount > 0 && isCoach && (
        <div style={{
          background: 'var(--warning-soft)',
          border: '1px solid var(--warning)',
          borderRadius: '12px',
          padding: '16px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
        }}>
          <div style={{ color: 'var(--warning-text)', fontWeight: 600, fontSize: '14px' }}>
            <AlertTriangle size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Vous avez {myPendingCount} charte(s) à lire et valider
          </div>
          <button
            onClick={() => navigate('/documents')}
            style={{
              background: 'var(--warning-soft)', color: 'var(--warning-text)',
              border: '1px solid var(--warning)', borderRadius: '8px',
              padding: '8px 16px', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
            }}
          >Voir maintenant →</button>
        </div>
      )}
      {myPendingCharte && myPendingCount === 0 && (
        <Alert
          variant="warning"
          title="Vous avez une charte à valider"
          action={
            <Button variant="secondary" size="sm" onClick={() => navigate('/documents')}>
              Voir maintenant →
            </Button>
          }
        >
          {myPendingCharte.title}
        </Alert>
      )}

      {isAdminLike && selfDeletedCoaches.count > 0 && (
        <div style={{
          background: 'var(--orange-soft)', border: '1px solid var(--warning)',
          borderRadius: '10px', padding: '14px 18px',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flex: 1 }}>
            <AlertTriangle className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--warning-text)', marginTop: '2px' }} />
            <div>
              <div style={{ color: 'var(--warning-text)', fontWeight: 700, fontSize: '14px' }}>
                {selfDeletedCoaches.count === 1
                  ? '1 entraîneur a supprimé son compte'
                  : `${selfDeletedCoaches.count} entraîneurs ont supprimé leur compte`}
              </div>
              {selfDeletedCoaches.names.length > 0 && (
                <div style={{ color: 'var(--text-primary)', fontSize: '13px', marginTop: '4px' }}>
                  {selfDeletedCoaches.names.join(', ')}
                </div>
              )}
              <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
                Ces entraîneurs ont supprimé leur compte depuis l'application. Régularisez leur situation depuis la gestion des entraîneurs (réinviter ou supprimer).
              </div>
            </div>
          </div>
          <button onClick={() => navigate('/admin/entraineurs')}
            style={{ background: 'var(--orange-soft)', color: 'var(--warning-text)', border: '1px solid var(--warning)', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap' }}>
            Gérer les entraîneurs →
          </button>
        </div>
      )}

      {isAdminLike && pendingChartes.joueurs > 0 && (
        <Alert
          variant="warning"
          title={`${pendingChartes.joueurs} joueur${pendingChartes.joueurs > 1 ? 's' : ''}/parent${pendingChartes.joueurs > 1 ? 's' : ''} n'ont pas encore validé la charte joueurs.`}
          action={
            <Button variant="secondary" size="sm" onClick={() => navigate('/admin/documents')}>
              Voir détails →
            </Button>
          }
        />
      )}

      {isAdminLike && pendingChartes.entraineurs > 0 && (
        <Alert
          variant="warning"
          title={`${pendingChartes.entraineurs} entraîneur${pendingChartes.entraineurs > 1 ? 's' : ''} n'ont pas encore validé leur charte.`}
          action={
            <Button variant="secondary" size="sm" onClick={() => navigate('/admin/documents')}>
              Voir détails →
            </Button>
          }
        />
      )}

      {isCoach && unsavedSessions.length > 0 && (
        <Alert
          variant="warning"
          title={`${unsavedSessions.length} liste${unsavedSessions.length > 1 ? 's' : ''} de présence non validée${unsavedSessions.length > 1 ? 's' : ''} !`}
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate(`/mes-equipes/presences/${unsavedSessions[0].team_id}`, { state: { showUnvalidated: true } })}
            >
              Saisir maintenant →
            </Button>
          }
        >
          Séance{unsavedSessions.length > 1 ? 's' : ''} passée{unsavedSessions.length > 1 ? 's' : ''} non validée{unsavedSessions.length > 1 ? 's' : ''}
        </Alert>
      )}

      {missingAsfNumber && isAdminView && isPlatformAdmin && (
        <Alert
          variant="warning"
          title="Numéro ASF du club manquant"
          action={
            <Button variant="secondary" size="sm" onClick={() => navigate('/admin/parametres-club')}>
              Configurer →
            </Button>
          }
        >
          Veuillez le renseigner dans les paramètres du club pour activer le module Groupements.
        </Alert>
      )}

      {expiringSponsorCount > 0 && isAdminLike && (
        <Alert
          variant="warning"
          title={`${expiringSponsorCount} contrat${expiringSponsorCount > 1 ? 's' : ''} sponsor expirant dans moins de 60 jours`}
        >
          Consultez la section Sponsors pour renouveler les contrats.
        </Alert>
      )}

      </div>

      {!isCoach && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', marginBottom: '24px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '16px',
            width: '100%'
          }}>
            <StatCard
              icon={<Users className="w-5 h-5" style={{ opacity: 0.7 }} />}
              label="Joueurs actifs"
              value={adminStats.activePlayers}
              path="/admin/joueurs"
              color="green"
            />
            <StatCard
              icon={<Users className="w-5 h-5" style={{ opacity: 0.7 }} />}
              label="Joueurs juniors"
              value={adminStats.juniorPlayers}
              path="/admin/joueurs"
              color="blue"
            />
            <StatCard
              icon={<UserX className="w-5 h-5" style={{ opacity: 0.7 }} />}
              label="Joueurs sans équipe"
              value={adminStats.noTeamPlayers}
              path="/admin/joueurs"
              color="accent"
            />
            <StatCard
              icon={<Users className="w-5 h-5" style={{ opacity: 0.7 }} />}
              label="Joueurs dans l'annuaire"
              value={adminStats.totalMembers}
              path="/admin/joueurs"
              color="primary"
            />
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '16px',
            width: '100%'
          }}>
            <StatCard
              icon={<Users className="w-5 h-5" style={{ opacity: 0.7 }} />}
              label="Équipes actives"
              value={adminStats.activeTeams}
              path="/equipes"
              color="green"
            />
            <StatCard
              icon={<Users className="w-5 h-5" style={{ opacity: 0.7 }} />}
              label="Équipes juniors"
              value={adminStats.juniorTeams}
              path="/equipes"
              color="blue"
            />
            <StatCard
              icon={<Calendar className="w-5 h-5" style={{ opacity: 0.7 }} />}
              label="Événements à venir"
              value={adminStats.upcomingEvents}
              path="/evenements"
              color="accent"
            />
            <StatCard
              icon={<ClipboardList className="w-5 h-5" style={{ opacity: 0.7 }} />}
              label="Inscriptions en attente"
              value={adminStats.pendingInscriptions}
              path="/admin/inscriptions"
              color="primary"
            />
          </div>
        </div>
      )}

      {isCoach && (() => {
        const matchCard = (
          <div
            onClick={() => nextMatch?.id && navigate(`/matchs/${nextMatch.id}`)}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '20px 24px',
              cursor: nextMatch ? 'pointer' : 'default',
              transition: 'border-color 0.2s',
            }}
            onMouseEnter={e => { if (nextMatch) e.currentTarget.style.borderColor = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{
                color: 'var(--text-muted)',
                fontSize: '13px',
                textTransform: 'uppercase',
                fontWeight: '600',
                letterSpacing: '0.05em',
                marginBottom: '16px'
              }}>
                Prochain match
              </h3>
              {nextMatch && <ChevronRight size={20} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />}
            </div>
            {nextMatch ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <span style={{
                    color: 'var(--text-primary)',
                    fontSize: '18px',
                    fontWeight: '700',
                  }}>
                    {formatLongDate(nextMatch.match_date)}
                  </span>
                  {nextMatch.match_time && (
                    <span style={{ color: 'var(--text-secondary)', fontSize: '16px', fontWeight: '600' }}>
                      {formatTime(nextMatch.match_time)}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 10px',
                    borderRadius: '99px',
                    fontSize: '12px',
                    fontWeight: '600',
                    background: nextMatch.is_home ? 'var(--success-soft)' : 'var(--bg-hover)',
                    color: nextMatch.is_home ? 'var(--success-text)' : 'var(--text-muted)',
                  }}>
                    {nextMatch.is_home ? 'Domicile' : 'Extérieur'}
                  </span>
                  <span style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: '600' }}>
                    vs {nextMatch.opponent_name}
                  </span>
                </div>
                {nextMatch.venue && (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
                    {nextMatch.venue.name}{nextMatch.venue.city ? `, ${nextMatch.venue.city}` : ''}
                  </div>
                )}
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Aucun match à venir</p>
            )}
          </div>
        );

        const trainingCard = (
          <div
            onClick={() => nextTraining?.team_id && navigate(`/mes-equipes/presences/${nextTraining.team_id}`)}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '20px 24px',
              cursor: nextTraining ? 'pointer' : 'default',
              transition: 'border-color 0.2s',
            }}
            onMouseEnter={e => { if (nextTraining) e.currentTarget.style.borderColor = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{
                color: 'var(--text-muted)',
                fontSize: '13px',
                textTransform: 'uppercase',
                fontWeight: '600',
                letterSpacing: '0.05em',
                marginBottom: '16px'
              }}>
                Prochain entraînement
              </h3>
              {nextTraining && <ChevronRight size={20} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />}
            </div>
            {nextTraining ? (
              <div>
                {nextTraining.cancelled && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, background: 'var(--danger-soft)', color: 'var(--danger-text)', marginBottom: '8px' }}>
                    <Ban size={11} aria-hidden="true" /> Annulé
                  </div>
                )}
                {nextTraining.cancelled && nextTraining.cancelled_reason && (
                  <div style={{ fontSize: '13px', color: 'var(--danger-text)', marginBottom: '8px' }}>
                    {nextTraining.cancelled_reason}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <span style={{
                    color: nextTraining.cancelled ? 'var(--text-muted)' : 'var(--text-primary)',
                    fontSize: '18px',
                    fontWeight: '700',
                  }}>
                    {formatLongDate(nextTraining.session_date)}
                  </span>
                </div>
                {(nextTraining.start_time || nextTraining.end_time) && (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '15px', fontWeight: '600', marginBottom: '6px' }}>
                    {nextTraining.start_time ? formatTime(nextTraining.start_time) : ''}
                    {nextTraining.start_time && nextTraining.end_time ? ' – ' : ''}
                    {nextTraining.end_time ? formatTime(nextTraining.end_time) : ''}
                  </div>
                )}
                {nextTraining.terrain_name && (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
                    {nextTraining.terrain_name}{nextTraining.terrain_half_label ? ` – ${nextTraining.terrain_half_label}` : ''}
                  </div>
                )}
                {nextTraining.team_name && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 500, marginTop: '4px' }}>
                    {nextTraining.team_name}
                  </div>
                )}
                {nextTraining.rain_applied && (
                  <RainBadge
                    rain_applied
                    rain_plan_defined={false}
                    rain_note={null}
                    base_terrain_name={null}
                    base_start_time={null}
                    base_end_time={null}
                  />
                )}
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Aucun entraînement planifié</p>
            )}
          </div>
        );

        // Sort cards chronologically: whichever event is sooner comes first
        const matchDate = nextMatch ? new Date(nextMatch.match_date + 'T' + (nextMatch.match_time || '23:59')) : null;
        const trainingDate = nextTraining ? new Date(nextTraining.session_date + 'T' + (nextTraining.start_time || '23:59')) : null;
        const trainingFirst = trainingDate && (!matchDate || trainingDate <= matchDate);

        return (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px', width: '100%' }}>
              {trainingFirst ? <>{trainingCard}{matchCard}</> : <>{matchCard}{trainingCard}</>}
            </div>

            <div style={{ marginBottom: '24px' }}>
              <SponsorsCarousel />
            </div>

            {/* Team chat preview */}
            <div
              onClick={() => navigate('/messages')}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '20px 24px',
                cursor: 'pointer',
                transition: 'border-color 0.2s',
                marginBottom: '24px',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-color)')}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: recentTeamMessages.length > 0 ? '14px' : '0',
              }}>
                <h3 style={{
                  color: 'var(--text-muted)',
                  fontSize: '13px',
                  textTransform: 'uppercase',
                  fontWeight: '600',
                  letterSpacing: '0.05em',
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}>
                  <MessageSquare className="w-4 h-4" />
                  Messages de l'equipe
                </h3>
                <span style={{ color: 'var(--accent)', fontSize: '13px', fontWeight: '600' }}>
                  Voir la messagerie &rarr;
                </span>
              </div>
              {recentTeamMessages.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {recentTeamMessages.map(msg => {
                    const diff = Date.now() - new Date(msg.created_at).getTime();
                    const mins = Math.floor(diff / 60000);
                    let timeLabel: string;
                    if (mins < 1) timeLabel = "a l'instant";
                    else if (mins < 60) timeLabel = `il y a ${mins} min`;
                    else if (mins < 1440) timeLabel = `il y a ${Math.floor(mins / 60)}h`;
                    else timeLabel = new Date(msg.created_at).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit' });

                    const hasAttachmentOnly = msg.attachment_type && (!msg.body || msg.body.trim().length < 5);
                    const preview = hasAttachmentOnly
                      ? null
                      : msg.body.length > 60 ? msg.body.slice(0, 60) + '…' : msg.body;

                    return (
                      <div key={msg.id} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <div style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          background: 'var(--accent)',
                          color: 'var(--accent-ink, var(--text-inverse))',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '14px',
                          fontWeight: '700',
                          flexShrink: 0,
                        }}>
                          {msg.sender_name.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>
                              {msg.sender_name}
                            </span>
                            <span style={{
                              fontSize: '11px',
                              fontWeight: '600',
                              color: 'var(--accent)',
                              background: 'var(--bg-hover)',
                              padding: '1px 8px',
                              borderRadius: '99px',
                            }}>
                              {msg.team_name}
                            </span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginLeft: 'auto', flexShrink: 0 }}>
                              {timeLabel}
                            </span>
                          </div>
                          <p style={{
                            color: 'var(--text-secondary)',
                            fontSize: '13px',
                            margin: '3px 0 0',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {hasAttachmentOnly ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <Paperclip className="w-3.5 h-3.5" /> Piece jointe
                              </span>
                            ) : preview}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '14px 0 0' }}>Aucun message recent</p>
              )}
            </div>
          </>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="rounded-lg p-6" style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color)' }}>
          <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Prochains événements</h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8" style={{ borderTop: '2px solid var(--accent)', borderBottom: '2px solid var(--accent)', borderLeft: '2px solid transparent', borderRight: '2px solid transparent' }}></div>
            </div>
          ) : events.length > 0 ? (
            <div className="space-y-3">
              {events.map((event) => (
                <Link
                  key={event.id}
                  to="/events"
                  style={{ textDecoration: 'none', display: 'block' }}
                >
                  <div
                    style={{
                      cursor: 'pointer',
                      padding: '16px',
                      background: 'var(--bg-card)',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent)';
                      (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-color)';
                      (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                    }}
                  >
                    <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{event.title}</h3>
                    <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{formatDate(event.date)}</p>
                    <p className="text-xs mt-2" style={{ color: 'var(--accent)' }}>{event.type}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Aucun événement prévu</p>
          )}
        </div>

        <div className="rounded-lg p-6" style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color)' }}>
          <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Dernières actualités</h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8" style={{ borderTop: '2px solid var(--accent)', borderBottom: '2px solid var(--accent)', borderLeft: '2px solid transparent', borderRight: '2px solid transparent' }}></div>
            </div>
          ) : news.length > 0 ? (
            <div className="space-y-3">
              {news.map((article) => (
                <div
                  key={article.id}
                  onClick={() => setSelectedArticle(article)}
                  style={{
                    cursor: 'pointer',
                    padding: '16px',
                    background: 'var(--bg-card)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent)';
                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-color)';
                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                  }}
                >
                  <h3 className="font-semibold line-clamp-2" style={{ color: 'var(--text-primary)' }}>{article.title}</h3>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{formatDate(article.published_at)}</p>
                  <div className="flex items-center justify-between mt-2">
                    <NewsCategoryBadge category={article.category} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Aucune actualité</p>
          )}
        </div>
      </div>

      {selectedArticle && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 1000,
            display: 'flex',
            justifyContent: 'flex-end'
          }}
          onClick={() => setSelectedArticle(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '640px',
              maxWidth: '100vw',
              height: '100%',
              background: 'var(--bg-card)',
              borderLeft: '1px solid var(--border-color)',
              overflowY: 'auto',
              padding: '32px',
              boxShadow: '-4px 0 24px rgba(0,0,0,0.5)'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '24px'
              }}
            >
              <NewsCategoryBadge category={selectedArticle.category} />
              <button
                onClick={() => setSelectedArticle(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '24px',
                  cursor: 'pointer',
                  lineHeight: 1
                }}
              >
                <XIcon size={20} aria-hidden="true" />
              </button>
            </div>

            {selectedArticle.image_url && (
              <div
                onClick={() => setLightboxUrl(selectedArticle.image_url!)}
                style={{
                  width: '100%',
                  borderRadius: '12px',
                  marginBottom: '24px',
                  background: 'var(--bg-secondary, #f3f4f6)',
                  cursor: 'pointer',
                  overflow: 'hidden'
                }}
              >
                <img
                  src={selectedArticle.image_url}
                  alt={selectedArticle.title}
                  style={{
                    width: '100%',
                    maxHeight: '60vh',
                    objectFit: 'contain',
                    display: 'block'
                  }}
                />
              </div>
            )}

            <h1
              style={{
                color: 'var(--text-primary)',
                fontSize: '24px',
                fontWeight: '800',
                marginBottom: '8px',
                lineHeight: 1.3
              }}
            >
              {selectedArticle.title}
            </h1>

            <p
              style={{
                color: 'var(--text-muted)',
                fontSize: '14px',
                marginBottom: '24px'
              }}
            >
              <Calendar size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />{new Date(selectedArticle.published_at).toLocaleDateString('fr-CH', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
            </p>

            <div
              style={{
                borderTop: '1px solid var(--border-color)',
                marginBottom: '24px'
              }}
            />

            <div
              style={{
                color: 'var(--text-primary)',
                fontSize: '15px',
                lineHeight: '1.7',
                whiteSpace: 'pre-wrap'
              }}
            >
              {selectedArticle.body}
            </div>
          </div>
        </div>
      )}
      <Toast toast={rainToast} />

      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setLightboxUrl(null) }}
          tabIndex={0}
          ref={(el) => el?.focus()}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            cursor: 'pointer',
            outline: 'none'
          }}
        >
          <img
            src={lightboxUrl}
            alt=""
            style={{
              maxWidth: '100%',
              maxHeight: 'calc(100vh - 100px)',
              objectFit: 'contain',
              borderRadius: '8px'
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            style={{
              marginTop: '16px',
              padding: '8px 24px',
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            Fermer
          </button>
        </div>
      )}
    </div>
  )
}
