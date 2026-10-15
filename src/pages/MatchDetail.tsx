import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useActiveNavView } from '../hooks/useNavView'
import { displayScore, displayPenalties, matchVerdict, clubTodayISO, isCoachScoreWindowOpen } from '../utils/matchStatus'
import { useTenant } from '../context/TenantContext'
import { useAttendanceDefaultPresent } from '../hooks/useAttendanceDefaultPresent'
import { Calendar, Clock, MapPin, ArrowLeft, Users, Bell, CreditCard as Edit2, LayoutGrid, X as XIcon, Pencil } from 'lucide-react'
import MatchStatusPill from '../components/MatchStatusPill'
import MatchAttendanceWidget from '../components/MatchAttendanceWidget'
import MatchConvocation from '../components/MatchConvocation'
import MatchEmailLog from '../components/MatchEmailLog'
import { Tabs } from '../components/ui/Tabs'
import { StatusPill } from '../components/ui/StatusPill'
import GroupementBadge from '../components/GroupementBadge'
import Button from '../components/ui/Button'
import { Badge, type BadgeVariant } from '../components/ui/Badge'
import { Alert } from '../components/ui/Alert'
import { isUnavailableForMatch, unavailabilityBadgeText } from '../utils/availabilityHelpers'
import { meetingTimeLine } from '../utils/meetingTime'
import { useFootballPositions } from '../hooks/useFootballPositions'
import { useAideMoniteurOnly } from '../hooks/useAideMoniteurOnly'
import { useCanManageTeamAttendance } from '../hooks/useCanManageTeamAttendance'
import { attendanceSaveErrorMessage } from '../utils/attendanceSaveError'
import { MatchGoalsCard, MatchGoalsList } from '../components/MatchGoals'

interface MatchData {
  id: string
  match_date: string
  match_time: string | null
  opponent_name: string
  is_home: boolean
  status: string
  designation: string | null
  match_number: string | null
  cancellation_reason: string | null
  attendance_validated_at: string | null
  attendance_validated_by: string | null
  score_for: number | null
  score_against: number | null
  forfeit: 'for' | 'against' | null
  penalties_for: number | null
  penalties_against: number | null
  score_entered_by: string | null
  score_entered_at: string | null
  venues: { name: string; city: string; field_name: string | null } | null
  teams: { id: string; name: string } | null
}

interface AttendanceRecord {
  id: string
  match_id: string
  member_id: string
  status: 'pending' | 'confirmed' | 'present_real' | 'absent_justified' | 'absent_unjustified'
  absence_reason: string | null
  responded_at: string | null
  members: {
    id: string
    first_name: string
    last_name: string
    availability?: string | null
    availability_until?: string | null
    team_id?: string | null
    team?: { name: string } | null
    profile_photo_url?: never
  } | null
}

type Tab = 'confirmed' | 'absent' | 'pending' | 'convoked' | 'not_retained' | 'unavailable'

const STAFF_ROLES = ['admin', 'responsable_technique', 'coach', 'assistant_coach']
const SCORE_DEADLINE_NOTE = 'Délai de saisie dépassé (2 jours après le match). Pour corriger le score, demandez au comité.'

function formatDateFR(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  const days = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']
  return `${days[date.getDay()]} ${Number(d)} ${months[Number(m) - 1]} ${y}`
}

function formatTime(t: string | null): string {
  if (!t) return 'Heure à confirmer'
  const [h, m] = t.split(':')
  return `${h}h${m}`
}

function Avatar({ member, size = 36 }: { member: AttendanceRecord['members']; size?: number }) {
  const initials = member ? `${member.first_name[0]}${member.last_name[0]}`.toUpperCase() : '?'
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: 'var(--primary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: '700', color: 'var(--accent-ink, var(--text-inverse))', flexShrink: 0
    }}>
      {initials}
    </div>
  )
}

export default function MatchDetail() {
  const { matchId } = useParams<{ matchId: string }>()
  const navigate = useNavigate()
  const { user, effectiveRole } = useAuth()

  const [match, setMatch] = useState<MatchData | null>(null)
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [myAttendance, setMyAttendance] = useState<AttendanceRecord | null>(null)
  const [myMemberId, setMyMemberId] = useState<string | null>(null)
  const [myMemberAvailability, setMyMemberAvailability] = useState<{ availability: string | null; availability_until: string | null }>({ availability: null, availability_until: null })
  const [childMemberIds, setChildMemberIds] = useState<string[]>([])
  const [childrenInTeam, setChildrenInTeam] = useState<{ id: string; first_name: string; last_name: string; availability?: string | null; availability_until?: string | null }[]>([])
  const [myMemberIsInTeam, setMyMemberIsInTeam] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('confirmed')
  const [loading, setLoading] = useState(true)
  const { clubId } = useTenant()
  const { value: defaultPresent } = useAttendanceDefaultPresent(clubId)
  const [responding, setResponding] = useState(false)
  const [respondError, setRespondError] = useState<string | null>(null)
  const [absenceFormFor, setAbsenceFormFor] = useState<string | null>(null)
  const [absenceReason, setAbsenceReason] = useState('')
  const [convocationRowIds, setConvocationRowIds] = useState<Record<string, string>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editReason, setEditReason] = useState('')
  const [editStatus, setEditStatus] = useState<string>('')
  const [reminderLoading, setReminderLoading] = useState(false)
  const [reminderResult, setReminderResult] = useState<{ success?: boolean; reminded?: number; emails_sent?: number; already_reminded_today?: number; error?: string } | null>(null)
  const [notConvoked, setNotConvoked] = useState(false)
  const [sectionTab, setSectionTab] = useState<'convocation' | 'presences'>('convocation')
  const [staffHasPublishedConvocation, setStaffHasPublishedConvocation] = useState(false)
  const [staffConvokedIds, setStaffConvokedIds] = useState<Set<string>>(new Set())
  const [memberHasPublishedConvocation, setMemberHasPublishedConvocation] = useState(false)
  const [memberMeetingMinutes, setMemberMeetingMinutes] = useState(0)
  const [memberConvokedIds, setMemberConvokedIds] = useState<Set<string>>(new Set())
  const [teamRecordsScore, setTeamRecordsScore] = useState(false)
  const [scoreModalOpen, setScoreModalOpen] = useState(false)
  const [scoreModalSaving, setScoreModalSaving] = useState(false)
  const [scoreModalError, setScoreModalError] = useState('')
  const [smScoreFor, setSmScoreFor] = useState('')
  const [smScoreAgainst, setSmScoreAgainst] = useState('')
  const [smForfeit, setSmForfeit] = useState<'for' | 'against' | null>(null)
  const [smShowPen, setSmShowPen] = useState(false)
  const [smPenFor, setSmPenFor] = useState('')
  const [smPenAgainst, setSmPenAgainst] = useState('')

  const isMemberView = useActiveNavView() === 'member'
  // Staff controls follow the active view, not the picked role, so a coach+parent
  // browsing in Membre view responds as a member instead of seeing staff tools.
  const isStaff = !isMemberView && effectiveRole ? STAFF_ROLES.includes(effectiveRole) : false
  const aideReadOnly = useAideMoniteurOnly(isStaff ? match?.teams?.id : null)
  const aideOfTeam = useAideMoniteurOnly(isMemberView ? null : match?.teams?.id)
  const { canManage: canManageTeam, isClubManager, loaded: canManageLoaded } = useCanManageTeamAttendance(isStaff ? match?.teams?.id : null)
  const staffCanEdit = isStaff && !aideReadOnly && canManageTeam
  const matchSheetOnly = isStaff && !aideReadOnly && canManageLoaded && !canManageTeam

  useEffect(() => {
    if (matchId && user?.id) {
      loadAll()
    }
  }, [matchId, user?.id])

  useEffect(() => {
    if (!matchId) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadAttendance()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [matchId])

  const convocationAttMap = useMemo(() => {
    const map: Record<string, { status: string; absence_reason: string | null }> = {}
    for (const a of attendance) {
      map[a.member_id] = { status: a.status, absence_reason: a.absence_reason }
    }
    return map
  }, [attendance])

  useEffect(() => {
    if (!match) return
    const kickoff = new Date(`${match.match_date}T${match.match_time || '23:59'}`)
    setSectionTab(new Date() >= kickoff ? 'presences' : 'convocation')
  }, [match?.id])

  const loadAll = async () => {
    setLoading(true)
    await Promise.all([loadMatch(), loadAttendance(), resolveMyMember()])
    setLoading(false)
  }

  const loadMatch = async () => {
    const { data } = await supabase
      .from('matches')
      .select(`
        id, match_date, match_time, opponent_name, is_home, status,
        designation, match_number, cancellation_reason,
        attendance_validated_at, attendance_validated_by,
        score_for, score_against, forfeit, penalties_for, penalties_against,
        score_entered_by, score_entered_at,
        venues (name, city, field_name),
        teams (id, name)
      `)
      .eq('id', matchId!)
      .maybeSingle()
    if (data) setMatch(data as any)
  }

  const loadAttendance = async () => {
    const { data } = await supabase
      .from('match_attendance')
      .select(`
        id, match_id, member_id, status, absence_reason, responded_at,
        members (id, first_name, last_name, status, groupement_id, groupements(id, name), availability, availability_until, team_id, team:teams(name))
      `)
      .eq('match_id', matchId!)
      .order('created_at', { ascending: true })
    if (data) setAttendance(data as any)
  }

  const resolveMyMember = async () => {
    if (!user?.id) return
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return

    // Always resolve BOTH the user's own member row and their children,
    // independent of role, so multi-role users can respond in Membre view.
    const { data: ownById, error: ownByIdErr } = await supabase
      .from('members')
      .select('id')
      .eq('id', authUser.id)
      .maybeSingle()
    if (ownByIdErr) console.warn('[MatchDetail] own member by id error', ownByIdErr)
    let ownId = ownById?.id ?? null
    if (!ownId) {
      const { data: ownByEmail, error: ownByEmailErr } = await supabase
        .from('members')
        .select('id')
        .ilike('email', authUser.email ?? '')
        .maybeSingle()
      if (ownByEmailErr) console.warn('[MatchDetail] own member by email error', ownByEmailErr)
      ownId = ownByEmail?.id ?? null
    }
    if (ownId) {
      setMyMemberId(ownId)
      const { data: avData } = await supabase
        .from('members')
        .select('availability, availability_until')
        .eq('id', ownId)
        .maybeSingle()
      if (avData) setMyMemberAvailability({ availability: avData.availability ?? null, availability_until: avData.availability_until ?? null })
    }

    const { data: links, error: linksErr } = await supabase
      .from('parent_members')
      .select('member_id')
      .eq('parent_user_id', authUser.id)
    if (linksErr) console.warn('[MatchDetail] parent_members error', linksErr)
    if (links && links.length > 0) {
      setChildMemberIds(links.map((l: any) => l.member_id))
    }
  }

  useEffect(() => {
    if (myMemberId && attendance.length > 0) {
      const mine = attendance.find(a => a.member_id === myMemberId) || null
      setMyAttendance(mine)
    }
  }, [myMemberId, attendance])

  useEffect(() => {
    if (childMemberIds.length === 0 || !match?.teams?.id) {
      setChildrenInTeam([])
      return
    }
    const loadChildren = async () => {
      const { data } = await supabase
        .from('team_members')
        .select('member_id, members(id, first_name, last_name, availability, availability_until)')
        .eq('team_id', match.teams!.id)
        .in('member_id', childMemberIds)
      if (data) {
        setChildrenInTeam(
          data.map((tm: any) => ({
            id: tm.member_id,
            first_name: tm.members?.first_name ?? '',
            last_name: tm.members?.last_name ?? '',
            availability: tm.members?.availability ?? null,
            availability_until: tm.members?.availability_until ?? null,
          })).filter((c: any) => c.first_name)
        )
      }
    }
    loadChildren()
  }, [childMemberIds, match?.teams?.id])

  // Check if the logged-in user is themselves a player in the match's team
  useEffect(() => {
    if (!myMemberId || !match?.teams?.id) { setMyMemberIsInTeam(false); return }
    supabase
      .from('team_members')
      .select('member_id')
      .eq('team_id', match.teams.id)
      .eq('member_id', myMemberId)
      .maybeSingle()
      .then(({ data }) => setMyMemberIsInTeam(!!data))
  }, [myMemberId, match?.teams?.id])

  // Load convocation row IDs + published-convocation state for the current player + children
  useEffect(() => {
    if (!matchId) return
    const allMemberIds = [myMemberId, ...childMemberIds].filter(Boolean) as string[]
    if (allMemberIds.length === 0) return
    ;(async () => {
      const { data: conv } = await supabase
        .from('match_convocations')
        .select('id, meeting_minutes_before')
        .eq('match_id', matchId)
        .eq('status', 'published')
        .maybeSingle()
      if (!conv) {
        setConvocationRowIds({})
        setMemberHasPublishedConvocation(false)
        setMemberMeetingMinutes(0)
        setMemberConvokedIds(new Set())
        return
      }
      setMemberHasPublishedConvocation(true)
      setMemberMeetingMinutes(typeof conv.meeting_minutes_before === 'number' ? conv.meeting_minutes_before : 0)
      const { data: allPlayers } = await supabase
        .from('v_match_convocation_players')
        .select('id, member_id')
        .eq('convocation_id', conv.id)
      const map: Record<string, string> = {}
      const convokedSet = new Set<string>()
      if (allPlayers) allPlayers.forEach((r: any) => {
        convokedSet.add(r.member_id)
        if (allMemberIds.includes(r.member_id)) map[r.member_id] = r.id
      })
      setConvocationRowIds(map)
      setMemberConvokedIds(convokedSet)
    })()
  }, [matchId, myMemberId, childMemberIds])

  useEffect(() => {
    if (!matchId || !myMemberId) { setNotConvoked(false); return }
    const checkConvocation = async () => {
      const { data: conv } = await supabase
        .from('match_convocations')
        .select('id')
        .eq('match_id', matchId)
        .eq('status', 'published')
        .maybeSingle()
      if (!conv) { setNotConvoked(false); return }
      const { data: row } = await supabase
        .from('v_match_convocation_players')
        .select('id')
        .eq('convocation_id', conv.id)
        .eq('member_id', myMemberId)
        .maybeSingle()
      setNotConvoked(!row)
    }
    checkConvocation()
  }, [matchId, myMemberId])

  useEffect(() => {
    if (!matchId || !isStaff) return
    const loadStaffConvocation = async () => {
      const { data: conv } = await supabase
        .from('match_convocations')
        .select('id')
        .eq('match_id', matchId)
        .eq('status', 'published')
        .maybeSingle()
      if (!conv) { setStaffHasPublishedConvocation(false); setStaffConvokedIds(new Set()); return }
      setStaffHasPublishedConvocation(true)
      const { data: players } = await supabase
        .from('match_convocation_players')
        .select('member_id')
        .eq('convocation_id', conv.id)
      setStaffConvokedIds(new Set((players || []).map((p: any) => p.member_id)))
    }
    loadStaffConvocation()
  }, [matchId, isStaff])

  useEffect(() => {
    if (!match?.teams?.id) { setTeamRecordsScore(false); return }
    supabase.rpc('team_records_score', { p_team_id: match.teams.id }).then(({ data }) => {
      setTeamRecordsScore(data === true)
    })
  }, [match?.teams?.id])

  const canRespond = (): boolean => {
    if (!match) return false
    const matchDate = new Date(match.match_date)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(23, 59, 59, 999)
    return matchDate > tomorrow
  }

  const handleRemindPending = async () => {
    if (!matchId) return
    setReminderLoading(true)
    setReminderResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const res = await fetch(`${supabaseUrl}/functions/v1/match-attendance-notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: 'remind_pending_for_match', match_id: matchId }),
      })
      const result = await res.json()
      if (result.error) {
        setReminderResult({ error: result.error })
      } else {
        setReminderResult({
          success: true,
          reminded: result.reminded ?? 0,
          emails_sent: result.emails_sent ?? 0,
          already_reminded_today: result.already_reminded_today ?? 0,
        })
      }
    } catch (err: any) {
      setReminderResult({ error: err.message })
    }
    setReminderLoading(false)
  }

  const handleConfirm = async (memberId?: string) => {
    const targetMemberId = memberId || myMemberId
    if (!targetMemberId || !matchId) return
    setResponding(true)
    setRespondError(null)
    const existing = attendance.find(a => a.member_id === targetMemberId)
    let err
    if (existing) {
      const { error } = await supabase.from('match_attendance').update({
        status: 'confirmed',
        absence_reason: null,
        responded_at: new Date().toISOString(),
        responded_by: user?.id,
      }).eq('id', existing.id)
      err = error
    } else {
      const { error } = await supabase.from('match_attendance').insert({
        match_id: matchId,
        member_id: targetMemberId,
        status: 'confirmed',
        responded_at: new Date().toISOString(),
        responded_by: user?.id,
      })
      err = error
    }
    if (err) { setRespondError(attendanceSaveErrorMessage(err, '')); setResponding(false); return }
    // If convoked, also confirm convocation via RPC
    const rowId = convocationRowIds[targetMemberId]
    if (rowId) {
      await supabase.rpc('respond_to_convocation', { p_row_id: rowId, p_status: 'confirmed', p_reason: null })
    }
    await loadAttendance()
    setResponding(false)
  }

  const handleAbsent = async (memberId?: string) => {
    const targetMemberId = memberId || myMemberId
    if (!targetMemberId || !matchId || !absenceReason.trim()) return
    setResponding(true)
    setRespondError(null)
    const existing = attendance.find(a => a.member_id === targetMemberId)
    let err
    if (existing) {
      const { error } = await supabase.from('match_attendance').update({
        status: 'absent_justified',
        absence_reason: absenceReason.trim(),
        responded_at: new Date().toISOString(),
        responded_by: user?.id,
      }).eq('id', existing.id)
      err = error
    } else {
      const { error } = await supabase.from('match_attendance').insert({
        match_id: matchId,
        member_id: targetMemberId,
        status: 'absent_justified',
        absence_reason: absenceReason.trim(),
        responded_at: new Date().toISOString(),
        responded_by: user?.id,
      })
      err = error
    }
    if (err) { setRespondError(attendanceSaveErrorMessage(err, '')); setResponding(false); return }
    // If convoked, decline convocation via RPC + notify coaches
    const rowId = convocationRowIds[targetMemberId]
    if (rowId) {
      await supabase.rpc('respond_to_convocation', { p_row_id: rowId, p_status: 'declined', p_reason: absenceReason.trim() })
      // Notify coaches immediately
      const { data: { session } } = await supabase.auth.getSession()
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      fetch(`${supabaseUrl}/functions/v1/notify-convocation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: 'declined', row_id: rowId }),
      }).catch(() => {})
    }
    setAbsenceFormFor(null)
    setAbsenceReason('')
    await loadAttendance()
    setResponding(false)
  }

  const handleCoachOverride = async (attendanceId: string, newStatus: string, reason?: string) => {
    const { error } = await supabase.from('match_attendance').update({
      status: newStatus,
      absence_reason: reason ?? null,
      responded_at: new Date().toISOString(),
      responded_by: user?.id,
    }).eq('id', attendanceId)
    if (error) { setRespondError(attendanceSaveErrorMessage(error, '')); return }
    setEditingId(null)
    setEditReason('')
    setEditStatus('')
    await loadAttendance()
  }

  const matchDate = match?.match_date ?? ''

  const unavailableIds = new Set(
    attendance
      .filter(a => a.members && isUnavailableForMatch(a.members.availability, a.members.availability_until, matchDate))
      .map(a => a.member_id)
  )

  const confirmed = attendance.filter(a => (a.status === 'confirmed' || a.status === 'present_real') && !unavailableIds.has(a.member_id))
  const absent = attendance.filter(a => (a.status === 'absent_justified' || a.status === 'absent_unjustified') && !unavailableIds.has(a.member_id))
  const pending = attendance.filter(a => a.status === 'pending' && !unavailableIds.has(a.member_id))
  const unavailable = attendance.filter(a => unavailableIds.has(a.member_id))

  const expected = defaultPresent ? [...confirmed, ...pending] : confirmed

  const absentIds = new Set(absent.map(a => a.member_id))
  const excludedIds = new Set([...absentIds, ...unavailableIds])
  const convokedNotAbsent = defaultPresent && staffHasPublishedConvocation
    ? attendance.filter(a => staffConvokedIds.has(a.member_id) && !excludedIds.has(a.member_id))
    : []
  const notRetained = defaultPresent && staffHasPublishedConvocation
    ? attendance.filter(a => !staffConvokedIds.has(a.member_id) && !excludedIds.has(a.member_id))
    : []

  const tabCounts: Record<Tab, number> = defaultPresent
    ? staffHasPublishedConvocation
      ? { convoked: convokedNotAbsent.length, not_retained: notRetained.length, unavailable: unavailable.length, absent: absent.length, confirmed: 0, pending: 0 }
      : { confirmed: expected.length, unavailable: unavailable.length, absent: absent.length, pending: 0, convoked: 0, not_retained: 0 }
    : { confirmed: confirmed.length, absent: absent.length, pending: pending.length, unavailable: unavailable.length, convoked: 0, not_retained: 0 }

  const tabList: { key: Tab; label: string }[] = defaultPresent
    ? staffHasPublishedConvocation
      ? [
          { key: 'convoked', label: 'Convoqués' },
          { key: 'not_retained', label: 'Non retenus' },
          ...(unavailable.length > 0 ? [{ key: 'unavailable' as Tab, label: 'Indisponibles' }] : []),
          { key: 'absent', label: 'Absents' },
        ]
      : [
          { key: 'confirmed', label: 'Disponibles' },
          ...(unavailable.length > 0 ? [{ key: 'unavailable' as Tab, label: 'Indisponibles' }] : []),
          { key: 'absent', label: 'Absents' },
        ]
    : [
        { key: 'confirmed', label: 'Présents' },
        { key: 'absent', label: 'Absents' },
        { key: 'pending', label: 'En attente' },
        ...(unavailable.length > 0 ? [{ key: 'unavailable' as Tab, label: 'Indisponibles' }] : []),
      ]

  const firstTab = tabList[0]?.key ?? 'confirmed'
  const effectiveActiveTab = tabList.some(t => t.key === activeTab) ? activeTab : firstTab

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Chargement...</div>
      </div>
    )
  }

  if (!match) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Match introuvable.
      </div>
    )
  }

  const venueStr = match.venues
    ? (match.venues.field_name
      ? `${match.venues.name} – ${match.venues.field_name}, ${match.venues.city}`
      : `${match.venues.name}, ${match.venues.city}`)
    : null

  const matchTitle = match.is_home
    ? `${match.teams?.name ?? '—'} vs ${match.opponent_name}`
    : `${match.opponent_name} vs ${match.teams?.name ?? '—'}`

  const coachScoreWindowOpen = isCoachScoreWindowOpen(match.match_date)
  const canEditScore = staffCanEdit && (isClubManager || coachScoreWindowOpen)
  const staffPastLimit = staffCanEdit && !isClubManager && !coachScoreWindowOpen
  const goalsAsStaff = isStaff || aideOfTeam
  const hasScore = teamRecordsScore && match.score_for !== null && match.score_against !== null

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px 16px' }}>
      <Button
        variant="secondary"
        size="sm"
        leftIcon={<ArrowLeft size={16} />}
        onClick={() => navigate(-1)}
        style={{ marginBottom: '20px' }}
      >
        Retour
      </Button>

      {aideReadOnly && (
        <div style={{ marginBottom: '20px' }}>
          <Alert variant="info" title="Aide-moniteur — accès en lecture seule." />
        </div>
      )}

      {/* Match header card */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        borderRadius: '14px', padding: '20px', marginBottom: '24px'
      }}>
        <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px', lineHeight: '1.3' }}>
          {matchTitle}
        </div>
        {match.designation && (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
            Catégorie : {match.designation}
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginBottom: venueStr ? '8px' : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-secondary)', fontSize: '13px' }}>
            <Calendar size={13} />
            <span>{formatDateFR(match.match_date)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-secondary)', fontSize: '13px' }}>
            <Clock size={13} />
            <span>{formatTime(match.match_time)}</span>
          </div>
          {match.match_number && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)', fontSize: '13px' }}>
              <span style={{ fontWeight: '600', color: 'var(--text-muted)' }}>#</span>
              <span>No {match.match_number}</span>
            </div>
          )}
        </div>
        {!isStaff && memberHasPublishedConvocation && memberMeetingMinutes > 0 && meetingTimeLine(match.match_time, memberMeetingMinutes) && (
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginTop: venueStr ? 0 : '8px', marginBottom: venueStr ? '8px' : 0 }}>
            {meetingTimeLine(match.match_time, memberMeetingMinutes)}
          </div>
        )}
        {venueStr && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-muted)', fontSize: '13px' }}>
            <MapPin size={13} />
            <span>{venueStr}</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <StatusPill variant={match.is_home ? 'green' : 'blue'}>
            {match.is_home ? 'Domicile' : 'Extérieur'}
          </StatusPill>
          {match.attendance_validated_at && (
            <Badge variant="green">Présences validées</Badge>
          )}
        </div>

        {/* Score display */}
        {teamRecordsScore && match.score_for !== null && match.score_against !== null && (() => {
          const [dHome, dAway] = displayScore(match.score_for, match.score_against, match.is_home)
          const hasPen = match.penalties_for !== null && match.penalties_against !== null
          const [pHome, pAway] = hasPen ? displayPenalties(match.penalties_for!, match.penalties_against!, match.is_home) : [0, 0]
          const verdict = matchVerdict(match.score_for, match.score_against, match.forfeit ?? null)
          return (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>
                  {dHome} – {dAway}
                </span>
                {match.forfeit && (
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)' }}>(forfait)</span>
                )}
                {hasPen && (
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)' }}>t.a.b. {pHome} – {pAway}</span>
                )}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 4 }}>
                {verdict}
              </div>
              {!goalsAsStaff && match.score_for > 0 && (
                <MatchGoalsList matchId={match.id} scoreFor={match.score_for} />
              )}
            </div>
          )
        })()}
      </div>

      {/* Score edit button + modal */}
      {teamRecordsScore && match.score_for !== null && (canEditScore || staffPastLimit) && (
          <div style={{ marginBottom: 24 }}>
            {canEditScore && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Pencil size={14} />}
                onClick={() => {
                  setSmScoreFor(match.score_for !== null ? String(match.score_for) : '')
                  setSmScoreAgainst(match.score_against !== null ? String(match.score_against) : '')
                  setSmForfeit(match.forfeit)
                  setSmShowPen(match.penalties_for !== null)
                  setSmPenFor(match.penalties_for !== null ? String(match.penalties_for) : '')
                  setSmPenAgainst(match.penalties_against !== null ? String(match.penalties_against) : '')
                  setScoreModalError('')
                  setScoreModalOpen(true)
                }}
              >
                Modifier le score
              </Button>
            )}
            {staffPastLimit && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: canEditScore ? 8 : 0 }}>
                {SCORE_DEADLINE_NOTE}
              </p>
            )}
          </div>
      )}

      {goalsAsStaff && hasScore && (match.score_for ?? 0) > 0 && (
        <MatchGoalsCard matchId={match.id} scoreFor={match.score_for ?? 0} canEdit={canEditScore} />
      )}

      {/* Score edit modal */}
      {scoreModalOpen && (
        <ScoreEditModal
          matchId={match.id}
          scoreFor={smScoreFor} setScoreFor={setSmScoreFor}
          scoreAgainst={smScoreAgainst} setScoreAgainst={setSmScoreAgainst}
          forfeit={smForfeit} setForfeit={setSmForfeit}
          showPenalties={smShowPen} setShowPenalties={setSmShowPen}
          penaltiesFor={smPenFor} setPenaltiesFor={setSmPenFor}
          penaltiesAgainst={smPenAgainst} setPenaltiesAgainst={setSmPenAgainst}
          saving={scoreModalSaving} error={scoreModalError}
          onSave={async () => {
            const sf = smForfeit === 'for' ? '3' : smForfeit === 'against' ? '0' : smScoreFor.trim()
            const sa = smForfeit === 'for' ? '0' : smForfeit === 'against' ? '3' : smScoreAgainst.trim()
            if ((sf !== '' && sa === '') || (sf === '' && sa !== '')) {
              setScoreModalError('Indiquez les deux scores.'); return
            }
            if (sf === '' && sa === '') { setScoreModalError('Indiquez les deux scores.'); return }
            setScoreModalSaving(true); setScoreModalError('')
            const { error } = await supabase.rpc('set_match_score', {
              p_match_id: match.id,
              p_score_for: parseInt(sf), p_score_against: parseInt(sa),
              p_forfeit: smForfeit,
              p_penalties_for: smShowPen && smPenFor.trim() ? parseInt(smPenFor) : null,
              p_penalties_against: smShowPen && smPenAgainst.trim() ? parseInt(smPenAgainst) : null,
            })
            setScoreModalSaving(false)
            if (error) { setScoreModalError(attendanceSaveErrorMessage(error, '')); return }
            setScoreModalOpen(false)
            loadMatch()
          }}
          onClear={async () => {
            setScoreModalSaving(true); setScoreModalError('')
            const { error } = await supabase.rpc('set_match_score', {
              p_match_id: match.id,
              p_score_for: null, p_score_against: null,
              p_forfeit: null, p_penalties_for: null, p_penalties_against: null,
            })
            setScoreModalSaving(false)
            if (error) { setScoreModalError(attendanceSaveErrorMessage(error, '')); return }
            setScoreModalOpen(false)
            loadMatch()
          }}
          onClose={() => setScoreModalOpen(false)}
        />
      )}

      {/* My response section (player — only if user is a player in this team) */}
      {isMemberView && myMemberId && myMemberIsInTeam && canRespond() && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: '14px', padding: '20px', marginBottom: '24px'
        }}>
          <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>
            Ma réponse
          </div>
          <MatchAttendanceWidget
            matchId={matchId!}
            matchDate={match.match_date}
            isCancelled={false}
            respondedBy={user!.id}
            onUpdate={loadAll}
            convocationRowIds={convocationRowIds}
            attendanceDefaultPresent={defaultPresent}
            hasPublishedConvocation={memberHasPublishedConvocation}
            convokedMemberIds={memberConvokedIds}
            children={[{
              memberId: myMemberId,
              memberName: '',
              record: myAttendance ?? null,
              availability: myMemberAvailability.availability,
              availability_until: myMemberAvailability.availability_until,
            }]}
          />
          {respondError && (
            <p style={{ marginTop: '10px', color: 'var(--danger)', fontSize: '13px' }}>{respondError}</p>
          )}
        </div>
      )}

      {/* Parent response for children */}
      {isMemberView && childrenInTeam.length > 0 && canRespond() && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: '14px', padding: '20px', marginBottom: '24px'
        }}>
          <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>
            Réponses pour mes enfants
          </div>
          <MatchAttendanceWidget
            matchId={matchId!}
            matchDate={match.match_date}
            isCancelled={false}
            respondedBy={user!.id}
            onUpdate={loadAll}
            convocationRowIds={convocationRowIds}
            attendanceDefaultPresent={defaultPresent}
            hasPublishedConvocation={memberHasPublishedConvocation}
            convokedMemberIds={memberConvokedIds}
            children={childrenInTeam.map(child => ({
              memberId: child.id,
              memberName: `${child.first_name} ${child.last_name}`,
              record: attendance.find(a => a.member_id === child.id) as any ?? null,
              availability: child.availability ?? null,
              availability_until: child.availability_until ?? null,
            }))}
          />
        </div>
      )}

      {/* Composition read-only (member/parent view) */}
      {!isStaff && match.teams?.id && (
        <ReadOnlyComposition matchId={matchId!} viewerMemberIds={[...(myMemberId ? [myMemberId] : []), ...childMemberIds]} />
      )}

      {matchSheetOnly && match.teams?.id && (
        <PresentPlayersCard
          attendance={attendance}
          teamId={match.teams.id}
          validated={!!match.attendance_validated_at}
        />
      )}

      {/* Staff: two-tab layout — Convocation & Présences */}
      {isStaff && (aideReadOnly || (canManageLoaded && canManageTeam)) && match.teams?.id && (
        <>
          <div style={{ marginBottom: '16px' }}>
            <Tabs
              items={[
                { key: 'convocation', label: 'Convocation' },
                { key: 'presences', label: 'Présences' },
              ]}
              value={sectionTab}
              onChange={(k) => setSectionTab(k as 'convocation' | 'presences')}
            />
          </div>

          {sectionTab === 'convocation' && (
            <>
              <MatchConvocation matchId={matchId!} teamId={match.teams.id} matchDate={match.match_date} matchTime={match.match_time} attendanceDefaultPresent={defaultPresent} attendanceMap={convocationAttMap} onAttendanceChanged={loadAttendance} readOnly={!staffCanEdit} />

              <MatchEmailLog matchId={matchId!} />

              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                borderRadius: '14px', overflow: 'hidden', marginTop: '24px'
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '16px 20px',
                  borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap'
                }}>
                  <Users size={18} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)' }}>Réponses</span>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    {defaultPresent && staffHasPublishedConvocation
                      ? `${convokedNotAbsent.length} convoqué${convokedNotAbsent.length > 1 ? 's' : ''} / ${attendance.length} joueur${attendance.length > 1 ? 's' : ''}`
                      : `${attendance.length} joueur${attendance.length > 1 ? 's' : ''}`}
                  </span>
                  {!staffCanEdit ? null : defaultPresent ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        leftIcon={<Bell size={14} />}
                        onClick={handleRemindPending}
                        loading={reminderLoading}
                      >
                        Envoyer un rappel du match
                      </Button>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', maxWidth: '240px', textAlign: 'right' }}>
                        Rappel informatif envoyé à toute l'équipe ; les joueurs n'ont rien à confirmer
                      </span>
                    </div>
                  ) : pending.length > 0 && (
                    <Button
                      variant="secondary"
                      size="sm"
                      leftIcon={<Bell size={14} />}
                      onClick={handleRemindPending}
                      loading={reminderLoading}
                    >
                      Relancer les joueurs en attente
                    </Button>
                  )}
                </div>

                {reminderResult && (
                  <div style={{ padding: '12px 20px 0' }}>
                    {reminderResult.error ? (
                      <Alert variant="danger" title="Erreur" onClose={() => setReminderResult(null)}>
                        {reminderResult.error}
                      </Alert>
                    ) : (
                      <Alert variant="success" title="Relance envoyée" onClose={() => setReminderResult(null)}>
                        {reminderResult.reminded} joueur(s) relancé(s), {reminderResult.emails_sent} email(s) envoyé(s)
                        {(reminderResult.already_reminded_today ?? 0) > 0 && (
                          <> — {reminderResult.already_reminded_today} déjà relancé(s) aujourd'hui</>
                        )}
                      </Alert>
                    )}
                  </div>
                )}

                <div style={{ padding: '8px 12px 0' }}>
                  <Tabs
                    items={tabList.map(tab => ({
                      key: tab.key,
                      label: tab.label,
                      count: tabCounts[tab.key],
                    }))}
                    value={effectiveActiveTab}
                    onChange={(id) => setActiveTab(id as Tab)}
                  />
                </div>

                <div style={{ padding: '16px' }}>
                  {effectiveActiveTab === 'confirmed' && (
                    <MemberList
                      items={defaultPresent ? expected : confirmed}
                      emptyText={defaultPresent ? "Aucun joueur disponible pour l'instant." : "Aucun joueur confirmé pour l'instant."}
                      defaultPresent={defaultPresent}
                      showReason={false}
                      isStaff={staffCanEdit}
                      editingId={editingId}
                      editStatus={editStatus}
                      editReason={editReason}
                      setEditingId={setEditingId}
                      setEditStatus={setEditStatus}
                      setEditReason={setEditReason}
                      onOverride={handleCoachOverride}
                    />
                  )}
                  {effectiveActiveTab === 'convoked' && (
                    <MemberList
                      items={convokedNotAbsent}
                      emptyText="Aucun joueur convoqué."
                      defaultPresent={defaultPresent}
                      showReason={false}
                      isStaff={staffCanEdit}
                      editingId={editingId}
                      editStatus={editStatus}
                      editReason={editReason}
                      setEditingId={setEditingId}
                      setEditStatus={setEditStatus}
                      setEditReason={setEditReason}
                      onOverride={handleCoachOverride}
                    />
                  )}
                  {effectiveActiveTab === 'not_retained' && (
                    <MemberList
                      items={notRetained}
                      emptyText="Tous les joueurs disponibles sont convoqués."
                      defaultPresent={defaultPresent}
                      showReason={false}
                      isStaff={staffCanEdit}
                      editingId={editingId}
                      editStatus={editStatus}
                      editReason={editReason}
                      setEditingId={setEditingId}
                      setEditStatus={setEditStatus}
                      setEditReason={setEditReason}
                      onOverride={handleCoachOverride}
                    />
                  )}
                  {effectiveActiveTab === 'absent' && (
                    <MemberList
                      items={absent}
                      emptyText="Aucune absence signalée."
                      showReason={isStaff}
                      defaultPresent={defaultPresent}
                      isStaff={staffCanEdit}
                      editingId={editingId}
                      editStatus={editStatus}
                      editReason={editReason}
                      setEditingId={setEditingId}
                      setEditStatus={setEditStatus}
                      setEditReason={setEditReason}
                      onOverride={handleCoachOverride}
                    />
                  )}
                  {effectiveActiveTab === 'pending' && (
                    <MemberList
                      items={pending}
                      emptyText="Tous les joueurs ont répondu."
                      showReason={false}
                      isStaff={staffCanEdit}
                      editingId={editingId}
                      editStatus={editStatus}
                      editReason={editReason}
                      setEditingId={setEditingId}
                      setEditStatus={setEditStatus}
                      setEditReason={setEditReason}
                      onOverride={handleCoachOverride}
                    />
                  )}
                  {effectiveActiveTab === 'unavailable' && (
                    <UnavailableList items={unavailable} matchDate={matchDate} />
                  )}
                </div>

                {staffCanEdit && <AddMemberPanel matchId={matchId!} existingMemberIds={attendance.map(a => a.member_id)} onAdded={loadAttendance} userId={user?.id} />}
              </div>
            </>
          )}

          {sectionTab === 'presences' && (
            <AttendanceEntryPanel
              match={match}
              teamId={match.teams.id}
              attendance={attendance}
              userId={user?.id}
              onSaved={() => { loadAll(); loadMatch() }}
              teamRecordsScore={teamRecordsScore}
              readOnly={aideReadOnly}
              scoreLocked={staffPastLimit}
            />
          )}
        </>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: BadgeVariant; label: string }> = {
    confirmed:           { variant: 'green',  label: 'Confirmé' },
    present_real:        { variant: 'green',  label: 'Présent' },
    absent_justified:    { variant: 'red',    label: 'Absent justifié' },
    absent_unjustified:  { variant: 'orange', label: 'Absent injustifié' },
    pending:             { variant: 'yellow', label: 'En attente' },
  }
  const s = map[status] ?? { variant: 'neutral' as BadgeVariant, label: status }
  return <Badge variant={s.variant}>{s.label}</Badge>
}

interface StatusOption { value: string; label: string; dot: 'green' | 'red' }

function StatusSelect({ value, options, onChange }: { value: string; options: StatusOption[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const focusIdx = useRef(0)
  const listRef = useRef<HTMLUListElement>(null)

  const selected = options.find(o => o.value === value)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); return }
    }
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick) }
  }, [open, close])

  useEffect(() => {
    if (open) {
      focusIdx.current = Math.max(0, options.findIndex(o => o.value === value))
      requestAnimationFrame(() => {
        const items = listRef.current?.querySelectorAll('[role="option"]')
        ;(items?.[focusIdx.current] as HTMLElement)?.focus()
      })
    }
  }, [open])

  const handleListKeyDown = (e: React.KeyboardEvent) => {
    const items = listRef.current?.querySelectorAll('[role="option"]')
    if (!items) return
    if (e.key === 'ArrowDown') { e.preventDefault(); focusIdx.current = Math.min(focusIdx.current + 1, items.length - 1); (items[focusIdx.current] as HTMLElement).focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusIdx.current = Math.max(focusIdx.current - 1, 0); (items[focusIdx.current] as HTMLElement).focus() }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const opt = options[focusIdx.current]; if (opt) { onChange(opt.value); close() } }
    else if (e.key === 'Escape') close()
  }

  const dotColor = (d: 'green' | 'red') => d === 'green' ? 'var(--success)' : 'var(--danger)'

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
          padding: '7px 10px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
          background: 'var(--bg-card)', border: '1.5px solid var(--primary)', color: 'var(--text-primary)',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        {selected && <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor(selected.dot), flexShrink: 0 }} />}
        <span style={{ flex: 1 }}>{selected?.label ?? 'Choisir...'}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }}><path d="M6 9l6 6 6-6"/></svg>
      </button>
      {open && (
        <ul
          ref={listRef}
          role="listbox"
          onKeyDown={handleListKeyDown}
          style={{
            position: 'absolute', left: 0, right: 0, top: 'calc(100% + 4px)', zIndex: 50,
            background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: '4px 0', margin: 0, listStyle: 'none',
          }}
        >
          {options.map((opt, i) => {
            const isSelected = opt.value === value
            return (
              <li
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                tabIndex={-1}
                onClick={() => { onChange(opt.value); close() }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--primary) 12%, var(--bg-card))' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isSelected ? 'color-mix(in srgb, var(--primary) 8%, var(--bg-card))' : 'transparent' }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 12px', fontSize: '13px', cursor: 'pointer',
                  color: 'var(--text-primary)', fontWeight: isSelected ? 600 : 400,
                  background: isSelected ? 'color-mix(in srgb, var(--primary) 8%, var(--bg-card))' : 'transparent',
                  outline: 'none',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor(opt.dot), flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{opt.label}</span>
                {isSelected && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

const DP_STATUS_OPTIONS: StatusOption[] = [
  { value: 'pending', label: 'Présent(e) — par défaut', dot: 'green' },
  { value: 'present_real', label: 'Présent(e) — constaté', dot: 'green' },
  { value: 'absent_justified', label: 'Absent(e) justifié(e)', dot: 'red' },
  { value: 'absent_unjustified', label: 'Absent(e) injustifié(e)', dot: 'red' },
]

const STANDARD_STATUS_OPTIONS: StatusOption[] = [
  { value: 'confirmed', label: 'Confirmé', dot: 'green' },
  { value: 'present_real', label: 'Présent (constaté)', dot: 'green' },
  { value: 'absent_justified', label: 'Absent justifié', dot: 'red' },
  { value: 'absent_unjustified', label: 'Absent injustifié', dot: 'red' },
  { value: 'pending', label: 'En attente', dot: 'red' },
]

interface MemberListProps {
  items: AttendanceRecord[]
  emptyText: string
  showReason: boolean
  defaultPresent?: boolean
  isStaff: boolean
  editingId: string | null
  editStatus: string
  editReason: string
  setEditingId: (id: string | null) => void
  setEditStatus: (s: string) => void
  setEditReason: (s: string) => void
  onOverride: (id: string, status: string, reason?: string) => void
}

function UnavailableList({ items, matchDate }: { items: AttendanceRecord[]; matchDate: string }) {
  if (items.length === 0) {
    return <div style={{ color: 'var(--text-muted)', fontSize: '14px', padding: '8px 0' }}>Aucun joueur indisponible.</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {items.map(att => (
        <div key={att.id} style={{
          display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '10px 12px',
          borderRadius: '10px', background: 'var(--bg-sidebar)'
        }}>
          <Avatar member={att.members} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
              {att.members ? `${att.members.first_name} ${att.members.last_name}` : '—'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--warning-text)', marginTop: '2px', fontWeight: 500 }}>
              {unavailabilityBadgeText(att.members?.availability, att.members?.availability_until)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function MemberList({ items, emptyText, showReason, defaultPresent: dpMode, isStaff, editingId, editStatus, editReason, setEditingId, setEditStatus, setEditReason, onOverride }: MemberListProps) {
  if (items.length === 0) {
    return <div style={{ color: 'var(--text-muted)', fontSize: '14px', padding: '8px 0' }}>{emptyText}</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {items.map(att => (
        <div key={att.id} style={{
          display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '10px 12px',
          borderRadius: '10px', background: 'var(--bg-sidebar)'
        }}>
          <Avatar member={att.members} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center' }}>
              {att.members ? `${att.members.first_name} ${att.members.last_name}` : '—'}
              {att.members && (
                <GroupementBadge
                  status={(att.members as any).status}
                  groupementId={(att.members as any).groupement_id}
                  groupementName={Array.isArray((att.members as any).groupements) ? (att.members as any).groupements[0]?.name : (att.members as any).groupements?.name}
                />
              )}
            </div>
            {dpMode && (att.status === 'pending' || att.status === 'confirmed') && (
              <div style={{ fontSize: '11px', color: 'var(--success-text)', marginTop: '2px', fontWeight: 500 }}>Présent(e) par défaut</div>
            )}
            {dpMode && (att.status === 'absent_justified' || att.status === 'absent_unjustified') && (
              <div style={{ fontSize: '11px', color: 'var(--danger-text)', marginTop: '2px', fontWeight: 500 }}>
                Absent(e){att.absence_reason ? ` — ${att.absence_reason}` : ''}
              </div>
            )}
            {!dpMode && showReason && att.absence_reason && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Raison: {att.absence_reason}
              </div>
            )}
            {!dpMode && (att.status === 'absent_justified' || att.status === 'absent_unjustified') && !showReason && (
              <div style={{ marginTop: '2px' }}>
                <StatusBadge status={att.status} />
              </div>
            )}

            {/* Coach edit form */}
            {isStaff && editingId === att.id && (
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <StatusSelect
                  value={dpMode && (editStatus === 'pending' || editStatus === 'confirmed') ? 'pending' : editStatus}
                  options={dpMode ? DP_STATUS_OPTIONS : STANDARD_STATUS_OPTIONS}
                  onChange={v => setEditStatus(v)}
                />
                {(editStatus === 'absent_justified' || editStatus === 'absent_unjustified') && (
                  <input
                    value={editReason}
                    onChange={e => setEditReason(e.target.value)}
                    placeholder="Raison (optionnel)"
                    style={{
                      padding: '6px 10px', borderRadius: '8px', fontSize: '13px',
                      background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)'
                    }}
                  />
                )}
                <div style={{ display: 'flex', gap: '6px' }}>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onOverride(att.id, editStatus, editReason || undefined)}
                  >
                    Enregistrer
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => { setEditingId(null); setEditStatus(''); setEditReason('') }}
                  >
                    Annuler
                  </Button>
                </div>
              </div>
            )}
          </div>

          {isStaff && editingId !== att.id && (
            <button
              onClick={() => { setEditingId(att.id); setEditStatus(att.status); setEditReason(att.absence_reason || '') }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}
              title="Modifier le statut"
            >
              <Edit2 size={15} />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   Saisie des présences post-match (donnée J+S).
   ───────────────────────────────────────────────────────────── */

type RealStatus = 'present_real' | 'absent_justified' | 'absent_unjustified'
type RowStatus = RealStatus | 'none'

interface EntryRow {
  member_id: string
  name: string
  gender: string | null
  isReinforcement: boolean
  teamName?: string | null
  status: RowStatus
  absence_reason: string | null
  availability: string | null
  receives_convocations: boolean
  isDefaultPresent: boolean
}

const scoreInputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 18, fontWeight: 700,
  textAlign: 'center', background: 'var(--bg-input)', border: '1px solid var(--border-color)',
  color: 'var(--text-primary)', appearance: 'textfield',
}

function ScoreInputBlock({
  scoreFor, setScoreFor, scoreAgainst, setScoreAgainst,
  forfeit, setForfeit, showPenalties, setShowPenalties,
  penaltiesFor, setPenaltiesFor, penaltiesAgainst, setPenaltiesAgainst,
}: {
  scoreFor: string; setScoreFor: (v: string) => void
  scoreAgainst: string; setScoreAgainst: (v: string) => void
  forfeit: 'for' | 'against' | null; setForfeit: (v: 'for' | 'against' | null) => void
  showPenalties: boolean; setShowPenalties: (v: boolean) => void
  penaltiesFor: string; setPenaltiesFor: (v: string) => void
  penaltiesAgainst: string; setPenaltiesAgainst: (v: string) => void
}) {
  const isForfeit = forfeit !== null
  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Nous</label>
          <input
            type="number" inputMode="numeric" min={0} max={99}
            value={isForfeit ? (forfeit === 'for' ? '3' : '0') : scoreFor}
            onChange={e => setScoreFor(e.target.value)}
            disabled={isForfeit}
            placeholder="–"
            style={{ ...scoreInputStyle, opacity: isForfeit ? 0.5 : 1 }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Adversaire</label>
          <input
            type="number" inputMode="numeric" min={0} max={99}
            value={isForfeit ? (forfeit === 'for' ? '0' : '3') : scoreAgainst}
            onChange={e => setScoreAgainst(e.target.value)}
            disabled={isForfeit}
            placeholder="–"
            style={{ ...scoreInputStyle, opacity: isForfeit ? 0.5 : 1 }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={forfeit === 'for'}
            onChange={e => setForfeit(e.target.checked ? 'for' : null)}
            style={{ accentColor: 'var(--accent)' }}
          />
          <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>Match gagné par forfait</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={forfeit === 'against'}
            onChange={e => setForfeit(e.target.checked ? 'against' : null)}
            style={{ accentColor: 'var(--accent)' }}
          />
          <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>Match perdu par forfait</span>
        </label>
      </div>

      {!showPenalties ? (
        <button
          type="button"
          onClick={() => setShowPenalties(true)}
          style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}
        >
          + Tirs au but
        </button>
      ) : (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Tirs au but</div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Nous</label>
              <input
                type="number" inputMode="numeric" min={0} max={99}
                value={penaltiesFor}
                onChange={e => setPenaltiesFor(e.target.value)}
                placeholder="–"
                style={{ ...scoreInputStyle, fontSize: 14 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Adversaire</label>
              <input
                type="number" inputMode="numeric" min={0} max={99}
                value={penaltiesAgainst}
                onChange={e => setPenaltiesAgainst(e.target.value)}
                placeholder="–"
                style={{ ...scoreInputStyle, fontSize: 14 }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ScoreEditModal({
  matchId,
  scoreFor, setScoreFor, scoreAgainst, setScoreAgainst,
  forfeit, setForfeit, showPenalties, setShowPenalties,
  penaltiesFor, setPenaltiesFor, penaltiesAgainst, setPenaltiesAgainst,
  saving, error, onSave, onClear, onClose,
}: {
  matchId: string
  scoreFor: string; setScoreFor: (v: string) => void
  scoreAgainst: string; setScoreAgainst: (v: string) => void
  forfeit: 'for' | 'against' | null; setForfeit: (v: 'for' | 'against' | null) => void
  showPenalties: boolean; setShowPenalties: (v: boolean) => void
  penaltiesFor: string; setPenaltiesFor: (v: string) => void
  penaltiesAgainst: string; setPenaltiesAgainst: (v: string) => void
  saving: boolean; error: string
  onSave: () => void; onClear: () => void; onClose: () => void
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)', padding: 16,
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 16, padding: 24,
        width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>Score du match</div>
        <ScoreInputBlock
          scoreFor={scoreFor} setScoreFor={setScoreFor}
          scoreAgainst={scoreAgainst} setScoreAgainst={setScoreAgainst}
          forfeit={forfeit} setForfeit={setForfeit}
          showPenalties={showPenalties} setShowPenalties={setShowPenalties}
          penaltiesFor={penaltiesFor} setPenaltiesFor={setPenaltiesFor}
          penaltiesAgainst={penaltiesAgainst} setPenaltiesAgainst={setPenaltiesAgainst}
        />
        {error && (
          <div style={{ marginTop: 12 }}><Alert variant="danger">{error}</Alert></div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20, flexWrap: 'wrap' }}>
          <Button variant="secondary" size="sm" onClick={onClear} disabled={saving}>
            Effacer le score
          </Button>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button variant="primary" size="sm" onClick={onSave} disabled={saving}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function AttendanceEntryPanel({
  match,
  teamId,
  attendance,
  userId,
  onSaved,
  teamRecordsScore,
  readOnly = false,
  scoreLocked = false,
}: {
  match: MatchData
  teamId: string
  attendance: AttendanceRecord[]
  userId?: string
  onSaved: () => void
  teamRecordsScore: boolean
  readOnly?: boolean
  scoreLocked?: boolean
}) {
  const { clubId } = useTenant()
  const { value: defaultPresent, loaded: dpLoaded } = useAttendanceDefaultPresent(clubId)
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<EntryRow[]>([])
  const [clubMembers, setClubMembers] = useState<any[]>([])
  const [reinforcementId, setReinforcementId] = useState('')
  const [saving, setSaving] = useState(false)
  const [scoreFor, setScoreFor] = useState('')
  const [scoreAgainst, setScoreAgainst] = useState('')
  const [scoreForfeit, setScoreForfeit] = useState<'for' | 'against' | null>(null)
  const [showPenalties, setShowPenalties] = useState(false)
  const [penaltiesFor, setPenaltiesFor] = useState('')
  const [penaltiesAgainst, setPenaltiesAgainst] = useState('')
  const [error, setError] = useState('')
  const isValidated = !!match.attendance_validated_at

  const isExcluded = (m: { availability: string | null; receives_convocations: boolean }) => {
    return (m.availability && m.availability !== 'disponible') || !m.receives_convocations
  }

  const initRows = async () => {
    const { data: teamPlayers } = await supabase
      .from('members')
      .select('id, first_name, last_name, gender, availability, receives_convocations')
      .eq('team_id', teamId)
      .order('last_name')

    const attByMember: Record<string, AttendanceRecord> = {}
    for (const a of attendance) attByMember[a.member_id] = a

    const toReal = (s: string | undefined, dp: boolean): RealStatus | 'dp_present' => {
      if (s === 'confirmed' || s === 'present_real') return 'present_real'
      if (s === 'absent_justified') return 'absent_justified'
      if (s === 'absent_unjustified') return 'absent_unjustified'
      if (dp) return 'dp_present'
      return 'absent_unjustified'
    }

    const teamIdsSet = new Set((teamPlayers || []).map((m: any) => m.id))

    const base: EntryRow[] = (teamPlayers || []).map((m: any) => {
      const a = attByMember[m.id]
      const excluded = isExcluded(m)
      const hasRecord = !!a
      let status: RowStatus
      let isDP = false
      if (hasRecord) {
        const mapped = toReal(a.status, defaultPresent)
        if (mapped === 'dp_present') {
          status = 'present_real'
          isDP = true
        } else {
          status = mapped
        }
      } else if (excluded) {
        status = 'none'
      } else if (defaultPresent) {
        status = 'present_real'
        isDP = true
      } else {
        status = 'none'
      }
      return {
        member_id: m.id,
        name: `${m.first_name} ${m.last_name}`,
        gender: m.gender ?? null,
        isReinforcement: false,
        status,
        absence_reason: a?.absence_reason ?? null,
        availability: m.availability ?? null,
        receives_convocations: m.receives_convocations !== false,
        isDefaultPresent: isDP,
      }
    })

    const extras: EntryRow[] = attendance
      .filter(a => !teamIdsSet.has(a.member_id))
      .map(a => ({
        member_id: a.member_id,
        name: a.members ? `${a.members.first_name} ${a.members.last_name}` : '—',
        gender: null,
        isReinforcement: true,
        status: toReal(a.status, false) as RowStatus,
        absence_reason: a.absence_reason ?? null,
        availability: null,
        receives_convocations: true,
        isDefaultPresent: false,
      }))

    setRows([...base, ...extras])

    const { data: others } = await supabase
      .from('members')
      .select('id, first_name, last_name, team_id, team:teams(name)')
      .neq('team_id', teamId)
      .not('team_id', 'is', null)
      .order('last_name')
    setClubMembers(others || [])
  }

  const handleOpen = async () => {
    setOpen(true)
    await initRows()
  }

  const setRowStatus = (memberId: string, status: RealStatus) => {
    setRows(prev => prev.map(r => (r.member_id === memberId ? { ...r, status, isDefaultPresent: false } : r)))
  }

  const addReinforcement = () => {
    if (!reinforcementId) return
    const m = clubMembers.find((c: any) => c.id === reinforcementId)
    if (!m || rows.some(r => r.member_id === m.id)) {
      setReinforcementId('')
      return
    }
    setRows(prev => [
      ...prev,
      {
        member_id: m.id,
        name: `${m.first_name} ${m.last_name}`,
        gender: null,
        isReinforcement: true,
        teamName: m.team?.name ?? null,
        status: 'present_real',
        absence_reason: null,
        availability: null,
        receives_convocations: true,
        isDefaultPresent: false,
      },
    ])
    setReinforcementId('')
  }

  const removeRow = (memberId: string) => {
    setRows(prev => prev.filter(r => !(r.member_id === memberId && r.isReinforcement)))
  }

  const showScoreBlock = teamRecordsScore && match.match_date <= clubTodayISO()
  const scoreEditable = showScoreBlock && !scoreLocked
  const hasSavedScore = match.score_for !== null && match.score_against !== null

  const handleValidate = async () => {
    if (scoreEditable) {
      const sf = scoreForfeit === 'for' ? '3' : scoreForfeit === 'against' ? '0' : scoreFor.trim()
      const sa = scoreForfeit === 'for' ? '0' : scoreForfeit === 'against' ? '3' : scoreAgainst.trim()
      if ((sf !== '' && sa === '') || (sf === '' && sa !== '')) {
        setError('Indiquez les deux scores.')
        return
      }
    }

    setSaving(true)
    setError('')
    try {
      const now = new Date().toISOString()
      const payload = rows
        .filter(r => r.status !== 'none')
        .map(r => ({
          match_id: match.id,
          member_id: r.member_id,
          status: r.status,
          responded_at: now,
          responded_by: userId ?? null,
        }))
      const { error: upErr } = await supabase
        .from('match_attendance')
        .upsert(payload, { onConflict: 'match_id,member_id' })
      if (upErr) throw upErr

      const { error: mErr } = await supabase
        .from('matches')
        .update({ attendance_validated_at: now, attendance_validated_by: userId ?? null })
        .eq('id', match.id)
      if (mErr) throw mErr

      if (scoreEditable) {
        const sf = scoreForfeit === 'for' ? '3' : scoreForfeit === 'against' ? '0' : scoreFor.trim()
        const sa = scoreForfeit === 'for' ? '0' : scoreForfeit === 'against' ? '3' : scoreAgainst.trim()
        if (sf !== '' && sa !== '') {
          const { error: scoreErr } = await supabase.rpc('set_match_score', {
            p_match_id: match.id,
            p_score_for: parseInt(sf), p_score_against: parseInt(sa),
            p_forfeit: scoreForfeit,
            p_penalties_for: showPenalties && penaltiesFor.trim() ? parseInt(penaltiesFor) : null,
            p_penalties_against: showPenalties && penaltiesAgainst.trim() ? parseInt(penaltiesAgainst) : null,
          })
          if (scoreErr) throw scoreErr
        }
      }

      setOpen(false)
      onSaved()
    } catch (e: any) {
      console.error('Validation présences match:', e)
      setError(attendanceSaveErrorMessage(e, 'Erreur lors de la validation.'))
    } finally {
      setSaving(false)
    }
  }

  const activeRows = rows.filter(r => !isExcluded(r))
  const presentCount = activeRows.filter(r => r.status === 'present_real').length

  const availabilityLabel = (a: string | null) => {
    if (!a) return null
    const map: Record<string, string> = { blesse: 'Blessé', malade: 'Malade', pause: 'En pause', suspendu: 'Suspendu' }
    return map[a] ?? a
  }

  const genderPresentLabel = (g: string | null) => {
    const gl = (g || '').toLowerCase()
    if (gl === 'f' || gl === 'feminin' || gl === 'féminin') return 'Présente'
    return 'Présent'
  }

  const StatusToggle = ({ row }: { row: EntryRow }) => {
    const excluded = isExcluded(row)
    if (excluded) {
      return (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          {row.availability && row.availability !== 'disponible' && (
            <Badge variant="orange">{availabilityLabel(row.availability)}</Badge>
          )}
          {!row.receives_convocations && (
            <Badge variant="neutral">Non convoqué</Badge>
          )}
        </div>
      )
    }
    const opts: { key: RealStatus; label: string; color: string }[] = [
      { key: 'present_real', label: genderPresentLabel(row.gender), color: 'var(--success)' },
      { key: 'absent_justified', label: 'Abs. just.', color: 'var(--warning)' },
      { key: 'absent_unjustified', label: 'Abs. injust.', color: 'var(--danger)' },
    ]
    return (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        {opts.map(o => {
          const active = row.status === o.key
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => setRowStatus(row.member_id, o.key)}
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                border: `1px solid ${active ? o.color : 'var(--border-color)'}`,
                background: active ? 'color-mix(in srgb, ' + o.color + ' 15%, transparent)' : 'transparent',
                color: active ? o.color : 'var(--text-muted)',
              }}
            >
              {o.label}
            </button>
          )
        })}
        {row.isDefaultPresent && (
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            {genderPresentLabel(row.gender)} (par défaut)
          </span>
        )}
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: '14px', padding: '20px', marginBottom: '24px'
    }}>
      {!open ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: 4 }}>
              Présences du match
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {isValidated
                ? `Validées le ${new Date(match.attendance_validated_at!).toLocaleDateString('fr-CH')}.`
                : 'À saisir après le match — pré-rempli avec les réponses des joueurs.'}
            </div>
          </div>
          {!readOnly && (
            <Button variant={isValidated ? 'secondary' : 'primary'} onClick={handleOpen}>
              {isValidated ? 'Modifier la saisie' : 'Saisir les présences'}
            </Button>
          )}
        </div>
      ) : (
        <>
          <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: 12 }}>
            Saisie des présences — {activeRows.length} joueur{activeRows.length > 1 ? 's' : ''}, {presentCount} présent{presentCount > 1 ? 's' : ''}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {rows.map(r => {
              const excluded = isExcluded(r)
              return (
              <div
                key={r.member_id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 12, padding: '8px 12px', borderRadius: 10,
                  background: 'var(--bg-hover)', flexWrap: 'wrap',
                  opacity: excluded ? 0.5 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: excluded ? 'var(--text-muted)' : 'var(--text-primary)' }}>{r.name}</span>
                  {r.isReinforcement && (
                    <>
                      <Badge variant="violet">Renfort{r.teamName ? ` — ${r.teamName}` : ''}</Badge>
                      <button
                        type="button"
                        onClick={() => removeRow(r.member_id)}
                        title="Retirer ce renfort"
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
                <StatusToggle row={r} />
              </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
            <select
              value={reinforcementId}
              onChange={e => setReinforcementId(e.target.value)}
              style={{
                flex: 1, minWidth: 220, padding: '8px 12px', borderRadius: 8, fontSize: 13,
                background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
              }}
            >
              <option value="">Ajouter un renfort d'une autre équipe...</option>
              {clubMembers
                .filter((m: any) => !rows.some(r => r.member_id === m.id))
                .map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.last_name} {m.first_name}{m.team?.name ? ` — ${m.team.name}` : ''}
                  </option>
                ))}
            </select>
            <Button variant="secondary" size="sm" onClick={addReinforcement} disabled={!reinforcementId}>
              Ajouter
            </Button>
          </div>

          {showScoreBlock && scoreLocked ? (
              <div style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Score du match</div>
                {hasSavedScore ? (
                  <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                    {(() => { const [h, a] = displayScore(match.score_for!, match.score_against!, match.is_home); return `Score final ${h} - ${a}` })()}
                    {match.forfeit ? ' (forfait)' : ''}
                    {match.penalties_for != null && match.penalties_against != null
                      ? (() => { const [ph, pa] = displayPenalties(match.penalties_for!, match.penalties_against!, match.is_home); return ` (tab ${ph}-${pa})` })()
                      : ''}
                  </div>
                ) : (
                  <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Pas de résultat saisi</div>
                )}
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8, marginBottom: 0 }}>{SCORE_DEADLINE_NOTE}</p>
              </div>
          ) : scoreEditable && (
            <div style={{
              background: 'var(--bg-hover)', border: '1px solid var(--border-color)',
              borderRadius: 12, padding: 16, marginBottom: 16,
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Score du match</div>
              <ScoreInputBlock
                scoreFor={scoreFor} setScoreFor={setScoreFor}
                scoreAgainst={scoreAgainst} setScoreAgainst={setScoreAgainst}
                forfeit={scoreForfeit} setForfeit={setScoreForfeit}
                showPenalties={showPenalties} setShowPenalties={setShowPenalties}
                penaltiesFor={penaltiesFor} setPenaltiesFor={setPenaltiesFor}
                penaltiesAgainst={penaltiesAgainst} setPenaltiesAgainst={setPenaltiesAgainst}
              />
            </div>
          )}

          {error && (
            <div style={{ marginBottom: 12 }}>
              <Alert variant="danger">{error}</Alert>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Annuler
            </Button>
            <Button variant="primary" onClick={handleValidate} disabled={saving || rows.length === 0}>
              {saving ? 'Validation...' : 'Valider les présences'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function PresentPlayersCard({ attendance, teamId, validated }: { attendance: AttendanceRecord[]; teamId: string; validated: boolean }) {
  const present = attendance
    .filter(a => a.status === 'present_real' && a.members)
    .map(a => a.members!)
    .sort((a, b) => a.last_name.localeCompare(b.last_name, 'fr') || a.first_name.localeCompare(b.first_name, 'fr'))

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: '14px', padding: '20px', marginBottom: '24px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: validated ? 12 : 4 }}>
        <Users size={18} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Joueurs présents</span>
        {validated && (
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {present.length} joueur{present.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
      {!validated ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Présences pas encore validées.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {present.map(m => (
            <div key={m.id} style={{ fontSize: 14, color: 'var(--text-primary)' }}>
              {m.first_name} {m.last_name}
              {m.team_id && m.team_id !== teamId && m.team?.name && (
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}> — {m.team.name}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   Read-only convocation + composition for team members / parents
   ───────────────────────────────────────────────────────────── */

interface CompositionRow {
  member_id: string
  first_name: string
  last_name: string
  response_status: 'convoked' | 'confirmed' | 'declined'
  lineup_role: 'starter' | 'sub' | null
  position_id: string | null
  row_sort: number | null
}

function ReadOnlyComposition({ matchId, viewerMemberIds }: { matchId: string; viewerMemberIds: string[] }) {
  const { positions } = useFootballPositions()
  const [rows, setRows] = useState<CompositionRow[]>([])
  const [lineupPublished, setLineupPublished] = useState(true)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: conv, error: convError } = await supabase
        .from('match_convocations')
        .select('id, publish_lineup')
        .eq('match_id', matchId)
        .eq('status', 'published')
        .maybeSingle()
      if (cancelled) return
      if (convError || !conv) {
        if (convError) console.warn('[ReadOnlyComposition] convocation error', convError)
        setRows([])
        setLoaded(true)
        return
      }
      const [viewRes, namesRes] = await Promise.all([
        supabase
          .from('v_match_convocation_players')
          .select('member_id, status, role, position_id, sort_order')
          .eq('convocation_id', conv.id),
        supabase.rpc('get_match_composition', { p_match_id: matchId }),
      ])
      if (cancelled) return
      if (viewRes.error || namesRes.error) {
        console.warn('[ReadOnlyComposition] load error', viewRes.error || namesRes.error)
        setRows([])
        setLoaded(true)
        return
      }
      const names = new Map<string, { first_name: string; last_name: string }>()
      for (const n of (namesRes.data as { member_id: string; first_name: string; last_name: string }[]) || []) {
        names.set(n.member_id, { first_name: n.first_name, last_name: n.last_name })
      }
      const viewRows = (viewRes.data as { member_id: string; status: CompositionRow['response_status']; role: CompositionRow['lineup_role']; position_id: string | null; sort_order: number | null }[]) || []
      setRows(viewRows.map(r => ({
        member_id: r.member_id,
        first_name: names.get(r.member_id)?.first_name || '',
        last_name: names.get(r.member_id)?.last_name || '',
        response_status: r.status,
        lineup_role: r.role,
        position_id: r.position_id,
        row_sort: r.sort_order,
      })))
      setLineupPublished(conv.publish_lineup !== false)
      setLoaded(true)
    })()
    return () => { cancelled = true }
  }, [matchId])

  if (!loaded || rows.length === 0) return null

  const byName = (a: CompositionRow, b: CompositionRow) =>
    `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, 'fr')

  if (!lineupPublished) {
    const convoked = rows.filter(r => r.response_status !== 'declined').sort(byName)
    return (
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        borderRadius: '14px', padding: '20px', marginBottom: '24px'
      }}>
        <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <LayoutGrid size={16} style={{ color: 'var(--accent)' }} />
          Composition
        </div>
        <div style={{ marginBottom: '16px' }}>
          <Alert variant="info">La composition n'est pas publiée pour ce match.</Alert>
        </div>
        <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
          Joueurs convoqués ({convoked.length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {convoked.map(r => (
            <div key={r.member_id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '10px',
              background: 'var(--bg-hover)', gap: '8px'
            }}>
              <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)' }}>
                {r.first_name} {r.last_name}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const positionOf = (id: string | null) => (id ? positions.find(p => p.id === id) : undefined)

  const starters = rows
    .filter(r => r.lineup_role === 'starter')
    .sort((a, b) => (positionOf(a.position_id)?.sort_order ?? 99) - (positionOf(b.position_id)?.sort_order ?? 99) || (a.row_sort ?? 99) - (b.row_sort ?? 99))
  const subs = rows
    .filter(r => r.lineup_role === 'sub')
    .sort(byName)
  const others = rows
    .filter(r => r.lineup_role === null)
    .sort(byName)

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: '14px', padding: '20px', marginBottom: '24px'
    }}>
      <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <LayoutGrid size={16} style={{ color: 'var(--accent)' }} />
        Composition
      </div>

      {starters.length > 0 && (
        <div style={{ marginBottom: subs.length > 0 || others.length > 0 ? '16px' : 0 }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            Titulaires ({starters.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {starters.map(r => {
              const isDeclined = r.response_status === 'declined'
              return (
                <div key={r.member_id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', borderRadius: '10px',
                  background: isDeclined ? 'var(--danger-soft)' : 'var(--success-soft)', gap: '8px'
                }}>
                  <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)', textDecoration: isDeclined ? 'line-through' : undefined, opacity: isDeclined ? 0.6 : 1 }}>
                    {r.first_name} {r.last_name}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {isDeclined && <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--danger-text)', background: 'var(--danger-soft)', padding: '2px 8px', borderRadius: '999px' }}>Absent</span>}
                    {positionOf(r.position_id)?.name && <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '500' }}>{positionOf(r.position_id)?.name}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {subs.length > 0 && (
        <div style={{ marginBottom: others.length > 0 ? '16px' : 0 }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            Remplaçants ({subs.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {subs.map(r => {
              const isDeclined = r.response_status === 'declined'
              return (
                <div key={r.member_id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '10px',
                  background: isDeclined ? 'var(--danger-soft)' : 'var(--bg-hover)', gap: '8px'
                }}>
                  <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)', textDecoration: isDeclined ? 'line-through' : undefined, opacity: isDeclined ? 0.6 : 1 }}>
                    {r.first_name} {r.last_name}
                  </span>
                  {isDeclined && <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--danger-text)', background: 'var(--danger-soft)', padding: '2px 8px', borderRadius: '999px' }}>Absent</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {others.length > 0 && (
        <div>
          <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            {rows.some(r => viewerMemberIds.includes(r.member_id)) ? 'Autres convoqués' : 'Joueurs convoqués'} ({others.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {others.map(r => {
              const isDeclined = r.response_status === 'declined'
              return (
                <div key={r.member_id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '10px',
                  background: isDeclined ? 'var(--danger-soft)' : 'var(--bg-hover)', gap: '8px'
                }}>
                  <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)', textDecoration: isDeclined ? 'line-through' : undefined, opacity: isDeclined ? 0.6 : 1 }}>
                    {r.first_name} {r.last_name}
                  </span>
                  {isDeclined && <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--danger-text)', background: 'var(--danger-soft)', padding: '2px 8px', borderRadius: '999px' }}>Absent</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function AddMemberPanel({ matchId, existingMemberIds, onAdded, userId }: {
  matchId: string
  existingMemberIds: string[]
  onAdded: () => void
  userId?: string
}) {
  const [members, setMembers] = useState<any[]>([])
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    supabase
      .from('match_attendance')
      .select('match_id, matches(team_id)')
      .eq('match_id', matchId)
      .limit(1)
      .maybeSingle()
      .then(async ({ data }) => {
        const teamId = (data?.matches as any)?.team_id
        if (!teamId) {
          const { data: matchData } = await supabase
            .from('matches')
            .select('team_id')
            .eq('id', matchId)
            .maybeSingle()
          if (matchData?.team_id) loadMembers(matchData.team_id)
          return
        }
        loadMembers(teamId)
      })
  }, [matchId])

  const loadMembers = async (teamId: string) => {
    const { data } = await supabase
      .from('members')
      .select('id, first_name, last_name')
      .eq('team_id', teamId)
      .order('last_name')
    if (data) setMembers(data.filter(m => !existingMemberIds.includes(m.id)))
  }

  const handleAdd = async () => {
    if (!selectedMemberId) return
    setAdding(true)
    const { error } = await supabase.from('match_attendance').insert({
      match_id: matchId,
      member_id: selectedMemberId,
      status: 'confirmed',
      responded_at: new Date().toISOString(),
      responded_by: userId,
    })
    if (error) { setAdding(false); return }
    setSelectedMemberId('')
    onAdded()
    setAdding(false)
  }

  if (members.length === 0) return null

  return (
    <div style={{ padding: '16px', borderTop: '1px solid var(--border-color)' }}>
      <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '10px' }}>
        Ajouter un joueur manuellement
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <select
          value={selectedMemberId}
          onChange={e => setSelectedMemberId(e.target.value)}
          style={{
            flex: 1, padding: '8px 12px', borderRadius: '8px', fontSize: '13px',
            background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)'
          }}
        >
          <option value="">Sélectionner un joueur...</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>{m.last_name} {m.first_name}</option>
          ))}
        </select>
        <Button
          variant="primary"
          size="sm"
          onClick={handleAdd}
          disabled={!selectedMemberId || adding}
        >
          {adding ? '...' : 'Ajouter présent'}
        </Button>
      </div>
    </div>
  )
}
