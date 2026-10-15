import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Calendar, MapPin, Clock, Users, ChevronDown, ChevronUp, ChevronRight, CircleCheck, CircleX } from 'lucide-react'
import { displayScore, displayPenalties } from '../utils/matchStatus'
import { useTenant } from '../context/TenantContext'
import { useAttendanceDefaultPresent } from '../hooks/useAttendanceDefaultPresent'
import MatchAttendanceWidget from '../components/MatchAttendanceWidget'
import { isUnavailableForMatch } from '../utils/availabilityHelpers'
import { reportLoadError } from '../utils/reportLoadError'
import { LoadError } from '../components/LoadError'

interface AttendanceSummary {
  confirmed: number
  absent: number
  pending: number
}

interface TeamMemberAvail {
  id: string
  availability: string | null
  availability_until: string | null
}

interface ChildInfo {
  memberId: string
  memberName: string
  availability: string | null
  availability_until: string | null
}

interface AttendanceRecord {
  id: string
  status: string
  absence_reason: string | null
}

const STAFF_ROLES = ['admin', 'responsable_technique', 'coach', 'assistant_coach']

interface Match {
  id: string
  match_date: string
  match_time: string | null
  opponent_name: string
  is_home: boolean
  status: string
  designation: string | null
  cancellation_reason: string | null
  match_number: string | null
  score_for: number | null
  score_against: number | null
  forfeit: 'for' | 'against' | null
  penalties_for: number | null
  penalties_against: number | null
  season_id: string | null
  venues: {
    name: string
    city: string
    field_name: string | null
    address: string | null
  } | null
  teams: {
    id: string
    name: string
  } | null
}

interface Season {
  id: string
  name: string
  start_date: string
  end_date: string
  active: boolean
}

function formatDateFR(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  const days = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']
  return `${days[date.getDay()]} ${Number(d)} ${months[Number(m) - 1]} ${y}`
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return 'Heure à confirmer'
  const [h, m] = timeStr.split(':')
  return `${h}h${m}`
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; text: string; label: string }> = {
    'planifié':    { bg: 'var(--info-soft)',  text: 'var(--info-text)', label: 'Planifié' },
    'scheduled':   { bg: 'var(--info-soft)',  text: 'var(--info-text)', label: 'Planifié' },
    'à confirmer': { bg: 'var(--warning-soft)',  text: 'var(--warning-text)', label: 'À confirmer' },
    'to_confirm':  { bg: 'var(--warning-soft)',  text: 'var(--warning-text)', label: 'À confirmer' },
    'confirmé':    { bg: 'var(--success-soft)',  text: 'var(--success-text)', label: 'Confirmé' },
    'confirmed':   { bg: 'var(--success-soft)',  text: 'var(--success-text)', label: 'Confirmé' },
    'joué':        { bg: 'var(--bg-hover)', text: 'var(--text-muted)', label: 'Joué' },
    'played':      { bg: 'var(--bg-hover)', text: 'var(--text-muted)', label: 'Joué' },
    'annulé':      { bg: 'var(--danger-soft)',   text: 'var(--danger-text)', label: 'Annulé' },
    'cancelled':   { bg: 'var(--danger-soft)',   text: 'var(--danger-text)', label: 'Annulé' },
    'reporté':     { bg: 'var(--warning-soft)',  text: 'var(--warning-text)', label: 'Reporté' },
    'postponed':   { bg: 'var(--warning-soft)',  text: 'var(--warning-text)', label: 'Reporté' },
  }
  const s = styles[status] ?? { bg: 'var(--bg-hover)', text: 'var(--text-muted)', label: status }
  return (
    <span style={{
      background: s.bg,
      color: s.text,
      borderRadius: '999px',
      padding: '2px 10px',
      fontSize: '12px',
      fontWeight: '600',
      display: 'inline-block',
      whiteSpace: 'nowrap'
    }}>
      {s.label}
    </span>
  )
}

export default function MatchSchedule() {
  const { user, effectiveRole } = useAuth()
  const navigate = useNavigate()
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [teamIds, setTeamIds] = useState<string[]>([])
  const [filterTeam, setFilterTeam] = useState<string>('all')
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([])
  const [attendanceSummaries, setAttendanceSummaries] = useState<Record<string, AttendanceSummary>>({})
  const [myChildren, setMyChildren] = useState<ChildInfo[]>([])
  const [myAttendance, setMyAttendance] = useState<Record<string, Record<string, AttendanceRecord>>>({})
  const [notConvokedByMatch, setNotConvokedByMatch] = useState<Record<string, string[]>>({})
  const [publishedConvocations, setPublishedConvocations] = useState<Set<string>>(new Set())
  const [convokedSets, setConvokedSets] = useState<Record<string, Set<string>>>({})
  const [convocationCounts, setConvocationCounts] = useState<Record<string, { convoked: number; notRetained: number; absentConvoked: number; unnotified: number }>>({})  
  const [teamMembersMap, setTeamMembersMap] = useState<Record<string, TeamMemberAvail[]>>({})
  const [showPast, setShowPast] = useState(false)
  const [activeSeason, setActiveSeason] = useState<Season | null>(null)
  const { clubId } = useTenant()
  const { value: defaultPresent } = useAttendanceDefaultPresent(clubId)
  const [loadFailed, setLoadFailed] = useState(false)

  const isStaff = effectiveRole ? STAFF_ROLES.includes(effectiveRole) : false
  const isMemberOrParent = effectiveRole === 'member' || effectiveRole === 'parent'

  useEffect(() => {
    if (user?.id && effectiveRole) {
      resolveTeamIds()
      loadActiveSeason()
    }
  }, [user?.id, effectiveRole])

  const loadActiveSeason = async () => {
    const { data } = await supabase
      .from('seasons')
      .select('id, name, start_date, end_date, active')
      .eq('active', true)
      .maybeSingle()
    if (data) setActiveSeason(data as Season)
  }

  useEffect(() => {
    if (teamIds.length > 0) {
      loadMatches(teamIds)
    } else if (!loading) {
      setMatches([])
    }
  }, [teamIds, filterTeam])

  const resolveTeamIds = async () => {
    setLoading(true)
    let ids: string[] = []
    const children: ChildInfo[] = []

    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { setLoading(false); return }

    // Staff teams: lookup by user_id, not gated by profile.role
    const { data: coachRecord } = await supabase
      .from('coaches')
      .select('id')
      .eq('user_id', authUser.id)
      .maybeSingle()

    if (coachRecord?.id) {
      const { data: staffRows } = await supabase
        .from('team_staff')
        .select('teams(id, name)')
        .eq('coach_id', coachRecord.id)
      if (staffRows) {
        const staffTeamEntries = staffRows
          .filter((r: any) => r.teams)
          .map((r: any) => ({ id: r.teams.id as string, name: r.teams.name as string }))
        ids = staffTeamEntries.map(t => t.id)
        setTeams(staffTeamEntries)
      }
    }

    // Member / parent teams (only when no staff teams, so the coach view takes priority)
    if (ids.length === 0) {
      const { data: parentLinks } = await supabase
        .from('parent_members')
        .select('members(id, team_id, first_name, last_name, availability, availability_until)')
        .eq('parent_user_id', authUser.id)

      for (const link of (parentLinks as any[]) || []) {
        const m = link.members
        if (m?.team_id) {
          ids.push(m.team_id)
          children.push({
            memberId: m.id,
            memberName: `${m.first_name || ''} ${m.last_name || ''}`.trim(),
            availability: m.availability ?? null,
            availability_until: m.availability_until ?? null,
          })
        }
      }

      if (ids.length === 0) {
        const { data: memberRecord } = await supabase
          .from('members')
          .select('id, team_id, first_name, last_name, availability, availability_until')
          .ilike('email', authUser.email ?? '')
          .maybeSingle()

        if (memberRecord?.team_id) {
          ids = [memberRecord.team_id]
          children.push({
            memberId: memberRecord.id,
            memberName: `${memberRecord.first_name || ''} ${memberRecord.last_name || ''}`.trim(),
            availability: memberRecord.availability ?? null,
            availability_until: memberRecord.availability_until ?? null,
          })
        }
      }
    }

    setMyChildren(children)
    const uniqueIds = [...new Set(ids)]
    setTeamIds(uniqueIds)

    if (uniqueIds.length === 0) {
      setLoading(false)
    }
  }

  const loadMatches = async (ids: string[]) => {
    setLoading(true)
    setLoadFailed(false)
    const targetIds = filterTeam !== 'all' ? [filterTeam] : ids

    const { data, error } = await supabase
      .from('matches')
      .select(`
        id, match_date, match_time, opponent_name, is_home, status,
        designation, cancellation_reason, match_number, season_id,
        score_for, score_against, forfeit, penalties_for, penalties_against,
        venues (name, city, field_name, address),
        teams (id, name)
      `)
      .in('team_id', targetIds)
      .order('match_date', { ascending: true })

    if (error) { reportLoadError('MatchSchedule', error); setLoadFailed(true); setLoading(false); return }

    if (data) {
      setMatches(data as any)

      if (!isStaff) {
        const uniqueTeams = Array.from(
          new Map(
            data
              .filter((m: any) => m.teams)
              .map((m: any) => [m.teams.id, m.teams])
          ).values()
        ) as { id: string; name: string }[]
        setTeams(uniqueTeams)
      }

      const matchIds = data.map((m: any) => m.id)
      if (matchIds.length > 0) {
        await loadAttendanceSummaries(matchIds)
      }
      const matchTeamIds = [...new Set(data.filter((m: any) => m.teams?.id).map((m: any) => m.teams.id))]
      if (matchTeamIds.length > 0) {
        await loadTeamMembersAvailability(matchTeamIds)
      }
    }
    setLoading(false)
  }

  const loadTeamMembersAvailability = async (tIds: string[]) => {
    const [junctionRes, directRes] = await Promise.all([
      supabase.from('team_members').select('team_id, members(id, availability, availability_until)').in('team_id', tIds),
      supabase.from('members').select('id, team_id, availability, availability_until').in('team_id', tIds),
    ])
    const map: Record<string, TeamMemberAvail[]> = {}
    const seen = new Set<string>()
    for (const row of (junctionRes.data as any[]) || []) {
      const m = row.members
      if (!m) continue
      const tid = row.team_id as string
      if (!map[tid]) map[tid] = []
      if (!seen.has(`${tid}-${m.id}`)) {
        map[tid].push({ id: m.id, availability: m.availability ?? null, availability_until: m.availability_until ?? null })
        seen.add(`${tid}-${m.id}`)
      }
    }
    for (const m of (directRes.data as any[]) || []) {
      const tid = m.team_id as string
      if (!map[tid]) map[tid] = []
      if (!seen.has(`${tid}-${m.id}`)) {
        map[tid].push({ id: m.id, availability: m.availability ?? null, availability_until: m.availability_until ?? null })
        seen.add(`${tid}-${m.id}`)
      }
    }
    setTeamMembersMap(map)
  }

  const loadAttendanceSummaries = async (matchIds: string[]) => {
    const { data: attData } = await supabase
      .from('match_attendance')
      .select('match_id, member_id, id, status, absence_reason')
      .in('match_id', matchIds)

    if (!attData) return

    const summaries: Record<string, AttendanceSummary> = {}
    const personalAttendance: Record<string, Record<string, AttendanceRecord>> = {}
    const absentByMatch: Record<string, Set<string>> = {}
    const totalByMatch: Record<string, number> = {}

    const myMemberIds = new Set(myChildren.map(c => c.memberId))

    for (const row of attData as any[]) {
      if (!summaries[row.match_id]) summaries[row.match_id] = { confirmed: 0, absent: 0, pending: 0 }
      if (row.status === 'confirmed') summaries[row.match_id].confirmed++
      else if (row.status === 'absent_justified' || row.status === 'absent_unjustified') summaries[row.match_id].absent++
      else summaries[row.match_id].pending++

      totalByMatch[row.match_id] = (totalByMatch[row.match_id] || 0) + 1

      if (row.status === 'absent_justified' || row.status === 'absent_unjustified') {
        if (!absentByMatch[row.match_id]) absentByMatch[row.match_id] = new Set()
        absentByMatch[row.match_id].add(row.member_id)
      }

      if (myMemberIds.has(row.member_id)) {
        if (!personalAttendance[row.match_id]) personalAttendance[row.match_id] = {}
        personalAttendance[row.match_id][row.member_id] = {
          id: row.id,
          status: row.status,
          absence_reason: row.absence_reason,
        }
      }
    }

    setAttendanceSummaries(summaries)
    setMyAttendance(personalAttendance)

    // Fetch convocation data
    const memberIds = myChildren.map(c => c.memberId)
    const ncMap: Record<string, string[]> = {}
    const pubSet = new Set<string>()
    const newConvokedSets: Record<string, Set<string>> = {}

    let convs: { id: string; match_id: string }[] | null = null
    let cPlayers: { convocation_id: string; member_id: string; notified_at: string | null; status: string }[] | null = null

    if (matchIds.length > 0) {
      const { data: convData } = await supabase
        .from('match_convocations')
        .select('id, match_id')
        .in('match_id', matchIds)
        .eq('status', 'published')
      convs = convData
      if (convs && convs.length > 0) {
        const convIds = convs.map(c => c.id)
        const { data: cpData } = await supabase
          .from('match_convocation_players')
          .select('convocation_id, member_id, notified_at, status')
          .in('convocation_id', convIds)
        cPlayers = cpData

        for (const conv of convs) {
          pubSet.add(conv.match_id)
          const matchConvoked = new Set<string>()
          for (const cp of (cPlayers || [])) {
            if (cp.convocation_id === conv.id) matchConvoked.add(cp.member_id)
          }
          newConvokedSets[conv.match_id] = matchConvoked

          if (memberIds.length > 0) {
            const convokedLookup = new Set((cPlayers || []).filter(p => p.convocation_id === conv.id).map(p => p.member_id))
            const nc = memberIds.filter(mId => !convokedLookup.has(mId))
            if (nc.length > 0) ncMap[conv.match_id] = nc
          }
        }
      }
    }
    setNotConvokedByMatch(ncMap)
    setPublishedConvocations(pubSet)
    setConvokedSets(newConvokedSets)

    // Compute convocation display counts
    const newConvCounts: Record<string, { convoked: number; notRetained: number; absentConvoked: number; unnotified: number }> = {}
    for (const [matchId, cSet] of Object.entries(newConvokedSets)) {
      let absentConvoked = 0
      const absSet = absentByMatch[matchId]
      if (absSet) { for (const mid of absSet) { if (cSet.has(mid)) absentConvoked++ } }
      const conv = convs?.find(c => c.match_id === matchId)
      const convPlayers = conv ? (cPlayers || []).filter(p => p.convocation_id === conv.id) : []
      const unnotified = convPlayers.filter(p => !p.notified_at && p.status !== 'declined').length
      newConvCounts[matchId] = {
        convoked: cSet.size - absentConvoked,
        notRetained: Math.max(0, (totalByMatch[matchId] || 0) - cSet.size),
        absentConvoked,
        unnotified,
      }
    }
    setConvocationCounts(newConvCounts)
  }

  const handleAttendanceUpdate = async () => {
    const matchIds = matches.map(m => m.id)
    if (matchIds.length > 0) {
      await loadAttendanceSummaries(matchIds)
    }
  }

  const renderMatchCard = (match: Match) => {
    const isCancelled = match.status === 'annulé'
    const isPostponed = match.status === 'reporté'
    const reason = (isCancelled || isPostponed) ? match.cancellation_reason : null

    const childrenWithAttendance = myChildren.map(child => ({
      memberId: child.memberId,
      memberName: myChildren.length > 1 ? child.memberName : '',
      record: myAttendance[match.id]?.[child.memberId] ?? null,
      availability: child.availability,
      availability_until: child.availability_until,
    }))

    const hasPublished = publishedConvocations.has(match.id)
    const convokedCount = convokedSets[match.id]?.size ?? 0

    return (
      <div
        key={match.id}
        onClick={isStaff ? () => navigate(`/matchs/${match.id}`) : undefined}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '16px',
          opacity: isCancelled ? 0.65 : 1,
          ...(isStaff ? { cursor: 'pointer', transition: 'box-shadow 0.15s' } : {}),
        }}
        onMouseEnter={isStaff ? e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)') : undefined}
        onMouseLeave={isStaff ? e => (e.currentTarget.style.boxShadow = 'none') : undefined}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* Line 1: Team vs Opponent + Score */}
            <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px', lineHeight: '1.3', display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
              <span>
              {match.is_home
                ? <>{match.teams?.name ?? '—'} <span style={{ color: 'var(--text-muted)', fontWeight: '400' }}>vs</span> {match.opponent_name}</>
                : <>{match.opponent_name} <span style={{ color: 'var(--text-muted)', fontWeight: '400' }}>vs</span> {match.teams?.name ?? '—'}</>
              }
              </span>
              {match.score_for !== null && match.score_against !== null && (
                <span style={{ fontSize: '16px', fontWeight: '800', color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                  {(() => { const [h, a] = displayScore(match.score_for!, match.score_against!, match.is_home); return `${h} – ${a}` })()}
                  {match.forfeit ? <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', marginLeft: 4 }}>(f.)</span> : null}
                  {match.penalties_for !== null && match.penalties_against !== null ? (() => { const [ph, pa] = displayPenalties(match.penalties_for!, match.penalties_against!, match.is_home); return <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', marginLeft: 4 }}>t.a.b. {ph}–{pa}</span> })() : null}
                </span>
              )}
            </div>

            {/* Line 2: Catégorie */}
            {match.designation && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: '1.4' }}>
                Catégorie : {match.designation}
              </div>
            )}

            {/* Line 3: Date / Time / Match number */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', marginBottom: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                <Calendar size={13} />
                <span>{formatDateFR(match.match_date)}</span>
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                color: match.match_time ? 'var(--text-secondary)' : 'var(--warning)',
                fontSize: '13px'
              }}>
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

            {/* Line 4: Venue */}
            {match.venues && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                <MapPin size={13} />
                <span>
                  {match.venues.field_name
                    ? `${match.venues.name} – ${match.venues.field_name}, ${match.venues.city}`
                    : `${match.venues.name}, ${match.venues.city}`}
                </span>
              </div>
            )}

            {/* Convocation status line (staff only) */}
            {isStaff && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', marginTop: '4px' }}>
                {hasPublished ? (
                  convocationCounts[match.id]?.unnotified > 0 ? (
                    <span style={{ color: 'var(--warning-text)', fontWeight: 600 }}>
                      Convocation publiée &middot; {convokedCount} joueur{convokedCount > 1 ? 's' : ''} — {convocationCounts[match.id].unnotified} à notifier
                    </span>
                  ) : (
                    <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                      Convocation publiée &middot; {convokedCount} joueur{convokedCount > 1 ? 's' : ''}
                    </span>
                  )
                ) : (
                  <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
                    Convocation non publiée
                  </span>
                )}
              </div>
            )}

            {reason && (
              <div style={{
                marginTop: '8px',
                padding: '6px 10px',
                borderRadius: '6px',
                background: isCancelled ? 'var(--danger-soft)' : 'var(--warning-soft)',
                color: isCancelled ? 'var(--danger-text)' : 'var(--warning-text)',
                fontSize: '12px',
                fontWeight: '500'
              }}>
                {isCancelled ? "Motif d'annulation : " : 'Motif de report : '}{reason}
              </div>
            )}

            {/* Attendance summary */}
            <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {attendanceSummaries[match.id] && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', flexWrap: 'wrap' }}>
                  <Users size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  {publishedConvocations.has(match.id) && convocationCounts[match.id] ? (<>
                    <span style={{ color: 'var(--success)', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><CircleCheck size={13} aria-hidden="true" /> {convocationCounts[match.id].convoked} convoqué{convocationCounts[match.id].convoked > 1 ? 's' : ''}</span>
                    <span style={{ color: 'var(--text-muted)' }}>&middot;</span>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>{convocationCounts[match.id].notRetained} non retenu{convocationCounts[match.id].notRetained > 1 ? 's' : ''}</span>
                    <span style={{ color: 'var(--text-muted)' }}>&middot;</span>
                    <span style={{ color: 'var(--danger)', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><CircleX size={13} aria-hidden="true" /> {convocationCounts[match.id].absentConvoked} absent{convocationCounts[match.id].absentConvoked > 1 ? 's' : ''}</span>
                  </>) : (<>
                    {(() => {
                      const teamId = match.teams?.id
                      const members = teamId ? (teamMembersMap[teamId] || []) : []
                      const unavailCount = members.filter(m => isUnavailableForMatch(m.availability, m.availability_until, match.match_date)).length
                      const rawDisp = attendanceSummaries[match.id].confirmed + attendanceSummaries[match.id].pending
                      const disp = Math.max(0, rawDisp - unavailCount)
                      return (<>
                        <span style={{ color: 'var(--success)', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><CircleCheck size={13} aria-hidden="true" /> {disp} disponible{disp > 1 ? 's' : ''}</span>
                        {unavailCount > 0 && (<>
                          <span style={{ color: 'var(--text-muted)' }}>&middot;</span>
                          <span style={{ color: 'var(--warning-text)', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>{unavailCount} indisponible{unavailCount > 1 ? 's' : ''}</span>
                        </>)}
                        <span style={{ color: 'var(--text-muted)' }}>&middot;</span>
                        <span style={{ color: 'var(--danger)', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><CircleX size={13} aria-hidden="true" /> {attendanceSummaries[match.id].absent} absent{attendanceSummaries[match.id].absent > 1 ? 's' : ''}</span>
                      </>)
                    })()}
                  </>)}
                </div>
              )}
            </div>

            {/* Member/Parent attendance widget */}
            {isMemberOrParent && user?.id && (
              <MatchAttendanceWidget
                matchId={match.id}
                matchDate={match.match_date}
                isCancelled={isCancelled}
                children={childrenWithAttendance}
                respondedBy={user.id}
                onUpdate={handleAttendanceUpdate}
                attendanceDefaultPresent={defaultPresent}
                hasPublishedConvocation={publishedConvocations.has(match.id)}
                convokedMemberIds={convokedSets[match.id]}
              />
            )}
          </div>

          {/* Badges: Domicile/Extérieur + Status + Chevron */}
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
            <span style={{
              fontSize: '12px',
              padding: '2px 8px',
              borderRadius: '999px',
              fontWeight: '600',
              background: match.is_home ? 'var(--success-soft)' : 'var(--info-soft)',
              color: match.is_home ? 'var(--success-text)' : 'var(--info-text)',
              whiteSpace: 'nowrap'
            }}>
              {match.is_home ? 'Domicile' : 'Extérieur'}
            </span>
            <StatusBadge status={match.status} />
            {isStaff && <ChevronRight size={18} style={{ color: 'var(--text-muted)', marginTop: '4px' }} />}
          </div>
        </div>
      </div>
    )
  }

  const todayStr = (() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  })()
  const sortKey = (m: Match) => `${m.match_date}T${m.match_time ?? '00:00'}`

  const isInActiveSeason = (m: Match): boolean => {
    if (!activeSeason) return true
    if (m.season_id) return m.season_id === activeSeason.id
    return m.match_date >= activeSeason.start_date && m.match_date <= activeSeason.end_date
  }

  const seasonMatches = isStaff && activeSeason ? matches.filter(isInActiveSeason) : matches
  const upcomingMatches = seasonMatches.filter(m => m.match_date >= todayStr).sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  const pastMatches = seasonMatches.filter(m => m.match_date < todayStr).sort((a, b) => sortKey(b).localeCompare(sortKey(a)))

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Chargement du planning...</div>
      </div>
    )
  }

  if (loadFailed) {
    return <LoadError onRetry={() => loadMatches(teamIds)} />
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
          Planning des matchs
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
          Calendrier des rencontres de votre équipe
        </p>
      </div>

      {teams.length > 1 && (
        <div style={{ marginBottom: '20px' }}>
          <select
            value={filterTeam}
            onChange={(e) => setFilterTeam(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              fontSize: '14px',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              maxWidth: '100%',
              boxSizing: 'border-box',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            <option value="all">Toutes mes équipes</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      {seasonMatches.length === 0 ? (
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          padding: '48px 24px',
          textAlign: 'center'
        }}>
          <Calendar size={40} style={{ margin: '0 auto 12px', color: 'var(--text-muted)', display: 'block' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>Aucun match planifié pour le moment.</p>
        </div>
      ) : (
        <>
          {upcomingMatches.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {upcomingMatches.map(renderMatchCard)}
            </div>
          ) : (
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Aucun match à venir.</p>
          )}

          {pastMatches.length > 0 && (
            <div style={{ marginTop: '28px' }}>
              <button
                onClick={() => setShowPast((v) => !v)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', borderRadius: '12px', cursor: 'pointer',
                  background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px',
                }}
              >
                <span>Passés ({pastMatches.length})</span>
                {showPast ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
              {showPast && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                  {pastMatches.map(renderMatchCard)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
