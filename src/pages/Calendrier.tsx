import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useTenant } from '../context/TenantContext'
import { displayScore, displayPenalties } from '../utils/matchStatus'
import { reportLoadError } from '../utils/reportLoadError'
import { LoadError } from '../components/LoadError'
import { Calendar, MapPin, Clock, ChevronDown, ChevronUp, ChevronRight, Volleyball, Activity, Ban } from 'lucide-react'
import MatchAttendanceWidget from '../components/MatchAttendanceWidget'
import TrainingAttendanceControl from '../components/TrainingAttendanceControl'
import { RainBadge } from '../components/RainBadge'
import {
  fetchMatchesByTeamIds,
  fetchMatchAttendance,
  type ScheduleTeam,
  type ScheduleChild,
  type MatchRow,
  type TrainingSessionRow,
  type MatchAttendanceSummary,
  type MatchAttendanceRecord,
} from '../lib/memberCalendar'
import type { TrainingAttendanceState } from '../lib/trainingAttendance'
import { useAttendanceDefaultPresent } from '../hooks/useAttendanceDefaultPresent'

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

function formatDateFR(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  return `${DAYS[date.getDay()]} ${Number(d)} ${MONTHS[Number(m) - 1]}`
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return '—'
  const [h, m] = timeStr.split(':')
  return `${h}h${m}`
}

function toTimestamp(dateStr: string, timeStr: string | null): number {
  const time = timeStr && /^\d{1,2}:\d{2}/.test(timeStr) ? timeStr.slice(0, 5) : '12:00'
  const t = new Date(`${dateStr}T${time}:00`).getTime()
  return Number.isNaN(t) ? new Date(dateStr).getTime() : t
}

const MATCH_STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  'planifié': { bg: 'var(--info-soft)', text: 'var(--info-text)', label: 'Planifié' },
  'scheduled': { bg: 'var(--info-soft)', text: 'var(--info-text)', label: 'Planifié' },
  'à confirmer': { bg: 'var(--warning-soft)', text: 'var(--warning-text)', label: 'À confirmer' },
  'to_confirm': { bg: 'var(--warning-soft)', text: 'var(--warning-text)', label: 'À confirmer' },
  'confirmé': { bg: 'var(--success-soft)', text: 'var(--success-text)', label: 'Confirmé' },
  'confirmed': { bg: 'var(--success-soft)', text: 'var(--success-text)', label: 'Confirmé' },
  'joué': { bg: 'var(--bg-hover)', text: 'var(--text-muted)', label: 'Joué' },
  'played': { bg: 'var(--bg-hover)', text: 'var(--text-muted)', label: 'Joué' },
  'annulé': { bg: 'var(--danger-soft)', text: 'var(--danger-text)', label: 'Annulé' },
  'cancelled': { bg: 'var(--danger-soft)', text: 'var(--danger-text)', label: 'Annulé' },
  'reporté': { bg: 'var(--warning-soft)', text: 'var(--warning-text)', label: 'Reporté' },
  'postponed': { bg: 'var(--warning-soft)', text: 'var(--warning-text)', label: 'Reporté' },
}

function TypeChip({ kind }: { kind: 'match' | 'training' }) {
  const styles = {
    match: { bg: 'var(--accent-soft)', color: 'var(--accent-text)', icon: Volleyball, label: 'Match' },
    training: { bg: 'var(--info-soft)', color: 'var(--info-text)', icon: Activity, label: 'Entraînement' },
  }[kind]
  const Icon = styles.icon
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '2px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 700,
      background: styles.bg, color: styles.color, whiteSpace: 'nowrap',
    }}>
      <Icon size={11} aria-hidden="true" /> {styles.label}
    </span>
  )
}

type CalItem =
  | { kind: 'match'; ts: number; match: MatchRow }
  | { kind: 'training'; ts: number; session: TrainingSessionRow; teamName: string; kids: ScheduleChild[] }

export default function Calendrier() {
  const { user, effectiveRole, clubRoles } = useAuth()
  const { clubId } = useTenant()
  const { value: attendanceDefaultPresent } = useAttendanceDefaultPresent(clubId)
  const isSupporter = effectiveRole === 'supporter'
  const isAdminOrCommittee = clubRoles.includes('admin') || clubRoles.includes('committee')
  const [loading, setLoading] = useState(true)
  const [teams, setTeams] = useState<ScheduleTeam[]>([])
  const [children, setChildren] = useState<ScheduleChild[]>([])
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [sessions, setSessions] = useState<TrainingSessionRow[]>([])
  const [summaries, setSummaries] = useState<Record<string, MatchAttendanceSummary>>({})
  const [personal, setPersonal] = useState<Record<string, Record<string, MatchAttendanceRecord>>>({})
  const [trainingAtt, setTrainingAtt] = useState<Record<string, TrainingAttendanceState>>({})
  const [notConvokedByMatch, setNotConvokedByMatch] = useState<Record<string, string[]>>({})
  const [convocationRowIdsByMatch, setConvocationRowIdsByMatch] = useState<Record<string, Record<string, string>>>({})
  const [publishedConvocations, setPublishedConvocations] = useState<Set<string>>(new Set())
  const [convokedSets, setConvokedSets] = useState<Record<string, Set<string>>>({})
  const [convocationCounts, setConvocationCounts] = useState<Record<string, { convoked: number; notRetained: number; absentConvoked: number }>>({})
  const [filterTeam, setFilterTeam] = useState<string>('all')
  const [filterType, setFilterType] = useState<string>('all')
  const [showPast, setShowPast] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setLoadFailed(false)
    setLoading(true)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { setLoading(false); return }

    // Club-wide mode: supporter or any user without a player/parent link
    if (isSupporter) {
      const showTraining = isAdminOrCommittee
      const { data: allTeams } = await supabase
        .from('teams')
        .select('id, name, level_rank')
        .eq('club_id', clubId!)
        .eq('active', true)
        .order('level_rank')
        .order('name')
      const clubTeams: ScheduleTeam[] = (allTeams || []).map(t => ({ id: t.id, name: t.name }))
      setTeams(clubTeams)
      setChildren([])

      const teamIds = clubTeams.map(t => t.id)
      if (teamIds.length === 0) {
        setMatches([]); setSessions([]); setLoading(false); return
      }
      const matchRows = await fetchMatchesByTeamIds(teamIds)
      setMatches(matchRows)

      if (showTraining) {
        const fromDate = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString().split('T')[0]
        const toDate = new Date(Date.now() + 120 * 24 * 3600 * 1000).toISOString().split('T')[0]
        const { data: sessionData } = await supabase
          .from('training_sessions')
          .select('id, team_id, session_date, start_time, end_time, cancelled, cancelled_reason, rain_terrain_id, rain_start_time, rain_end_time, rain_note')
          .in('team_id', teamIds)
          .gte('session_date', fromDate)
          .lte('session_date', toDate)
          .order('session_date')
        const sessionRows: TrainingSessionRow[] = (sessionData || []).map((s: any) => ({
          id: s.id, team_id: s.team_id, session_date: s.session_date,
          start_time: s.start_time, end_time: s.end_time,
          terrain_name: null, cancelled: s.cancelled, cancelled_reason: s.cancelled_reason,
          rain_applied: !!s.rain_terrain_id || !!s.rain_start_time,
          rain_plan_defined: false, rain_note: s.rain_note || null,
          base_terrain_name: null, base_start_time: null, base_end_time: null,
        }))
        setSessions(sessionRows)
      } else {
        setSessions([])
      }

      const mIds = matchRows.map(m => m.id)
      if (mIds.length > 0) {
        const { data: pubConvs } = await supabase
          .from('match_convocations')
          .select('match_id')
          .in('match_id', mIds)
          .eq('status', 'published')
        if (pubConvs) setPublishedConvocations(new Set(pubConvs.map(c => c.match_id)))
      }
      setLoading(false)
      return
    }

    const fromDate = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString().split('T')[0]
    const toDate = new Date(Date.now() + 120 * 24 * 3600 * 1000).toISOString().split('T')[0]

    const { data: bundle, error: rpcErr } = await supabase.rpc('get_calendar_bundle', {
      p_start: fromDate,
      p_end: toDate,
    })
    if (rpcErr || !bundle) {
      reportLoadError('Calendrier', rpcErr)
      setLoadFailed(true)
      setLoading(false)
      return
    }

    // Teams
    const rpcTeams: ScheduleTeam[] = (bundle.teams || []).map((t: any) => ({ id: t.id, name: t.name }))
    setTeams(rpcTeams)

    // Children (members + effective team mapping — one member may have several teams)
    const memberTeamsMulti = new Map<string, string[]>()
    for (const mt of (bundle.member_teams || []) as any[]) {
      const arr = memberTeamsMulti.get(mt.member_id) || []
      arr.push(mt.team_id)
      memberTeamsMulti.set(mt.member_id, arr)
    }
    const rpcChildren: ScheduleChild[] = []
    for (const m of (bundle.members || []) as any[]) {
      const tids = memberTeamsMulti.get(m.id) || []
      if (tids.length === 0) {
        rpcChildren.push({ memberId: m.id, memberName: `${m.first_name || ''} ${m.last_name || ''}`.trim(), teamId: '', gender: m.gender ?? null })
      } else {
        for (const tid of tids) {
          rpcChildren.push({ memberId: m.id, memberName: `${m.first_name || ''} ${m.last_name || ''}`.trim(), teamId: tid, gender: m.gender ?? null })
        }
      }
    }
    setChildren(rpcChildren)

    const teamIds = rpcTeams.map(t => t.id)
    if (teamIds.length === 0) {
      setMatches([]); setSessions([]); setLoading(false); return
    }

    // Matches → MatchRow shape (flatten venue/team fields back to nested objects)
    const teamsById = new Map(rpcTeams.map(t => [t.id, t]))
    const matchRows: MatchRow[] = (bundle.matches || []).map((m: any) => ({
      id: m.id,
      match_date: m.match_date,
      match_time: m.match_time,
      opponent_name: m.opponent_name,
      is_home: m.is_home,
      status: m.status,
      designation: m.designation,
      cancellation_reason: m.cancellation_reason,
      match_number: m.match_number,
      score_for: m.score_for ?? null,
      score_against: m.score_against ?? null,
      forfeit: m.forfeit ?? null,
      penalties_for: m.penalties_for ?? null,
      penalties_against: m.penalties_against ?? null,
      venues: m.venue_name ? {
        name: m.venue_name,
        city: m.venue_city,
        field_name: m.venue_field_name,
        address: m.venue_address,
      } : null,
      teams: teamsById.has(m.team_id) ? { id: m.team_id, name: teamsById.get(m.team_id)!.name } : null,
    }))
    setMatches(matchRows)

    // Match attendance → summaries (all rows) + personal (my members only)
    const memberIds = rpcChildren.map(c => c.memberId)
    const mineSet = new Set(memberIds)
    const newSummaries: Record<string, MatchAttendanceSummary> = {}
    const newPersonal: Record<string, Record<string, MatchAttendanceRecord>> = {}
    for (const row of (bundle.match_attendance || []) as any[]) {
      if (!newSummaries[row.match_id]) newSummaries[row.match_id] = { confirmed: 0, absent: 0, pending: 0 }
      if (row.status === 'confirmed') newSummaries[row.match_id].confirmed++
      else if (row.status === 'absent_justified' || row.status === 'absent_unjustified') newSummaries[row.match_id].absent++
      else newSummaries[row.match_id].pending++

      if (mineSet.has(row.member_id)) {
        if (!newPersonal[row.match_id]) newPersonal[row.match_id] = {}
        newPersonal[row.match_id][row.member_id] = {
          id: row.id,
          status: row.status,
          absence_reason: row.absence_reason,
        }
      }
    }
    setSummaries(newSummaries)
    setPersonal(newPersonal)

    // Convocations → published set, not-convoked map, row-ID map, convoked sets
    const ncMap: Record<string, string[]> = {}
    const rowIdsMap: Record<string, Record<string, string>> = {}
    const pubSet = new Set<string>()
    const newConvokedSets: Record<string, Set<string>> = {}
    const convs = (bundle.convocations || []) as any[]
    if (convs.length > 0) {
      const convPlayers = (bundle.convocation_players || []) as any[]
      const convokedSet = new Set(convPlayers.map((p: any) => `${p.convocation_id}:${p.member_id}`))
      for (const conv of convs) {
        pubSet.add(conv.match_id)
        const nc = memberIds.filter(mId => !convokedSet.has(`${conv.id}:${mId}`))
        if (nc.length > 0) ncMap[conv.match_id] = nc
        const matchRowIds: Record<string, string> = {}
        const matchConvoked = new Set<string>()
        for (const cp of convPlayers) {
          if (cp.convocation_id === conv.id) {
            matchRowIds[cp.member_id] = cp.id
            matchConvoked.add(cp.member_id)
          }
        }
        newConvokedSets[conv.match_id] = matchConvoked
        if (Object.keys(matchRowIds).length > 0) rowIdsMap[conv.match_id] = matchRowIds
      }
    }
    setNotConvokedByMatch(ncMap)
    setConvocationRowIdsByMatch(rowIdsMap)
    setPublishedConvocations(pubSet)
    setConvokedSets(newConvokedSets)

    // Compute convocation display counts from attendance + convoked sets
    const attRows = (bundle.match_attendance || []) as any[]
    const absentByMatch: Record<string, Set<string>> = {}
    const totalByMatch: Record<string, number> = {}
    for (const row of attRows) {
      totalByMatch[row.match_id] = (totalByMatch[row.match_id] || 0) + 1
      if (row.status === 'absent_justified' || row.status === 'absent_unjustified') {
        if (!absentByMatch[row.match_id]) absentByMatch[row.match_id] = new Set()
        absentByMatch[row.match_id].add(row.member_id)
      }
    }
    const newConvCounts: Record<string, { convoked: number; notRetained: number; absentConvoked: number }> = {}
    for (const [matchId, cSet] of Object.entries(newConvokedSets)) {
      let absentConvoked = 0
      const absSet = absentByMatch[matchId]
      if (absSet) { for (const mid of absSet) { if (cSet.has(mid)) absentConvoked++ } }
      newConvCounts[matchId] = {
        convoked: cSet.size - absentConvoked,
        notRetained: Math.max(0, (totalByMatch[matchId] || 0) - cSet.size),
        absentConvoked,
      }
    }
    setConvocationCounts(newConvCounts)

    // Training sessions → TrainingSessionRow shape (times/terrain already resolved server-side)
    const sessionRows: TrainingSessionRow[] = (bundle.training_sessions || []).map((s: any) => ({
      id: s.id,
      team_id: s.team_id,
      session_date: s.session_date,
      start_time: s.start_time,
      end_time: s.end_time,
      terrain_name: s.terrain_half_label
        ? `${s.terrain_name} – ${s.terrain_half_label}`
        : s.terrain_name || null,
      cancelled: s.cancelled,
      cancelled_reason: s.cancelled_reason,
      rain_applied: !!s.rain_applied,
      rain_plan_defined: !!s.rain_plan_defined,
      rain_note: s.rain_note || null,
      base_terrain_name: s.base_terrain_name || null,
      base_start_time: s.base_start_time || null,
      base_end_time: s.base_end_time || null,
    }))
    setSessions(sessionRows)

    // Training attendance
    const attMap: Record<string, TrainingAttendanceState> = {}
    for (const r of (bundle.training_attendance || []) as any[]) {
      attMap[`${r.session_id}:${r.member_id}`] = {
        status: r.status,
        present: r.present,
        responded_at: r.responded_at,
        absence_reason: r.absence_reason,
      }
    }
    setTrainingAtt(attMap)
    setLoading(false)
  }, [user?.role, isSupporter, isAdminOrCommittee, clubId])

  useEffect(() => {
    if (user?.id && (!isSupporter || clubId)) load()
  }, [user?.id, load, isSupporter, clubId])

  const reloadMatchAttendance = useCallback(async () => {
    const matchAtt = await fetchMatchAttendance(matches.map((m) => m.id), children.map((c) => c.memberId))
    setSummaries(matchAtt.summaries)
    setPersonal(matchAtt.personal)
    // Recompute convocation counts with fresh absence data
    const newConvCounts: Record<string, { convoked: number; notRetained: number; absentConvoked: number }> = {}
    for (const [matchId, cSet] of Object.entries(convokedSets)) {
      let absentConvoked = 0
      const absSet = matchAtt.absentByMatch[matchId]
      if (absSet) { for (const mid of absSet) { if (cSet.has(mid)) absentConvoked++ } }
      newConvCounts[matchId] = {
        convoked: cSet.size - absentConvoked,
        notRetained: Math.max(0, (matchAtt.totalByMatch[matchId] || 0) - cSet.size),
        absentConvoked,
      }
    }
    setConvocationCounts(newConvCounts)
  }, [matches, children, convokedSets])

  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? ''
  const showTraining = !isSupporter || isAdminOrCommittee
  const teamMatches = filterTeam === 'all' ? matches : matches.filter((m) => m.teams?.id === filterTeam)
  const teamSessions = showTraining ? (filterTeam === 'all' ? sessions : sessions.filter((s) => s.team_id === filterTeam)) : []

  const allItems: CalItem[] = [
    ...teamMatches.map((m): CalItem => ({ kind: 'match', ts: toTimestamp(m.match_date, m.match_time), match: m })),
    ...teamSessions.map((s): CalItem => ({
      kind: 'training',
      ts: toTimestamp(s.session_date, s.start_time),
      session: s,
      teamName: teamName(s.team_id),
      kids: children.filter((c) => c.teamId === s.team_id),
    })),
  ]
  const items = filterType === 'all' ? allItems : allItems.filter(i => i.kind === filterType)

  const now = Date.now()
  const upcoming = items.filter((i) => i.ts >= now).sort((a, b) => a.ts - b.ts)
  const past = items.filter((i) => i.ts < now).sort((a, b) => b.ts - a.ts)

  const showChildName = children.length > 1

  const renderMatch = (match: MatchRow) => {
    const isCancelled = match.status === 'annulé' || match.status === 'cancelled'
    const isPostponed = match.status === 'reporté' || match.status === 'postponed'
    const reason = (isCancelled || isPostponed) ? match.cancellation_reason : null
    const s = MATCH_STATUS_STYLES[match.status] ?? { bg: 'var(--bg-hover)', text: 'var(--text-muted)', label: match.status }
    const summary = !isSupporter ? summaries[match.id] : undefined
    const kids = !isSupporter ? children.filter((c) => c.teamId === match.teams?.id) : []
    const childrenWithAttendance = kids.map((child) => ({
      memberId: child.memberId,
      memberName: showChildName ? child.memberName : '',
      record: personal[match.id]?.[child.memberId] ?? null,
      gender: child.gender,
    }))

    const hasConvocation = publishedConvocations.has(match.id)

    return (
      <div
        onClick={() => navigate(`/matchs/${match.id}`)}
        style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: '12px', padding: '16px', opacity: isCancelled ? 0.65 : 1,
          cursor: 'pointer', transition: 'box-shadow 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)')}
        onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
              <TypeChip kind="match" />
              {match.teams?.name && (
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>{match.teams.name}</span>
              )}
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', lineHeight: 1.3, display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
              <span>
              {match.is_home
                ? <>{match.teams?.name ?? '—'} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>vs</span> {match.opponent_name}</>
                : <>{match.opponent_name} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>vs</span> {match.teams?.name ?? '—'}</>}
              </span>
              {match.score_for !== null && match.score_against !== null && (
                <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                  {(() => { const [h, a] = displayScore(match.score_for!, match.score_against!, match.is_home); return `${h} – ${a}` })()}
                  {match.forfeit ? <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginLeft: 4 }}>(f.)</span> : null}
                  {match.penalties_for !== null && match.penalties_against !== null ? (() => { const [ph, pa] = displayPenalties(match.penalties_for!, match.penalties_against!, match.is_home); return <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginLeft: 4 }}>t.a.b. {ph}–{pa}</span> })() : null}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', marginBottom: '4px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                <Calendar size={13} />{formatDateFR(match.match_date)}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: match.match_time ? 'var(--text-secondary)' : 'var(--warning)', fontSize: '13px' }}>
                <Clock size={13} />{match.match_time ? formatTime(match.match_time) : 'Heure à confirmer'}
              </span>
            </div>
            {match.venues && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                <MapPin size={13} />
                <span>{match.venues.field_name ? `${match.venues.name} – ${match.venues.field_name}, ${match.venues.city}` : `${match.venues.name}, ${match.venues.city}`}</span>
              </div>
            )}
            {reason && (
              <div style={{
                marginTop: '8px', padding: '6px 10px', borderRadius: '6px',
                background: isCancelled ? 'var(--danger-soft)' : 'var(--warning-soft)',
                color: isCancelled ? 'var(--danger-text)' : 'var(--warning-text)',
                fontSize: '12px', fontWeight: 500,
              }}>
                {isCancelled ? "Motif d'annulation : " : 'Motif de report : '}{reason}
              </div>
            )}
          </div>
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
            <span style={{
              fontSize: '12px', padding: '2px 8px', borderRadius: '999px', fontWeight: 600,
              background: match.is_home ? 'var(--success-soft)' : 'var(--info-soft)',
              color: match.is_home ? 'var(--success-text)' : 'var(--info-text)', whiteSpace: 'nowrap',
            }}>
              {match.is_home ? 'Domicile' : 'Extérieur'}
            </span>
            <span style={{ background: s.bg, color: s.text, borderRadius: '999px', padding: '2px 10px', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {s.label}
            </span>
            <ChevronRight size={18} style={{ color: 'var(--text-muted)', marginTop: '4px' }} />
          </div>
        </div>
        {!isSupporter && user?.id && (
          <div onClick={e => e.stopPropagation()}>
            <MatchAttendanceWidget
              matchId={match.id}
              isCancelled={isCancelled}
              children={childrenWithAttendance}
              respondedBy={user.id}
              onUpdate={reloadMatchAttendance}
              convocationRowIds={convocationRowIdsByMatch[match.id]}
              attendanceDefaultPresent={attendanceDefaultPresent}
              hasPublishedConvocation={hasConvocation}
              convokedMemberIds={convokedSets[match.id]}
            />
          </div>
        )}
        {hasConvocation && (
          <div style={{ marginTop: '10px' }}>
            <span style={{
              fontSize: '13px', fontWeight: 600, color: 'var(--accent)',
              display: 'inline-flex', alignItems: 'center', gap: '4px',
            }}>
              Voir la convocation <ChevronRight size={14} />
            </span>
          </div>
        )}
      </div>
    )
  }

  const renderTraining = (item: Extract<CalItem, { kind: 'training' }>) => {
    const { session, teamName, kids } = item
    const isCancelledSession = session.cancelled
    return (
      <div style={{
        background: isCancelledSession ? 'var(--danger-soft)' : 'var(--bg-card)',
        border: isCancelledSession ? '1px solid var(--danger)' : '1px solid var(--border-color)',
        borderRadius: '12px', padding: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
          <TypeChip kind="training" />
          {isCancelledSession && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '2px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 800,
              background: 'var(--danger)', color: '#fff', whiteSpace: 'nowrap',
              letterSpacing: '0.03em', textTransform: 'uppercase',
            }}>
              <Ban size={11} aria-hidden="true" /> Annulé
            </span>
          )}
          {teamName && <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>{teamName}</span>}
        </div>
        <div style={{
          fontSize: '16px', fontWeight: 700, marginBottom: '6px',
          color: isCancelledSession ? 'var(--danger-text)' : 'var(--text-primary)',
          textDecoration: isCancelledSession ? 'line-through' : undefined,
        }}>Entraînement</div>
        {isCancelledSession && session.cancelled_reason && (
          <div style={{ fontSize: '13px', color: 'var(--danger-text)', fontWeight: 500, marginBottom: '6px' }}>
            {session.cancelled_reason}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', marginBottom: '4px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-secondary)', fontSize: '13px' }}>
            <Calendar size={13} />{formatDateFR(session.session_date)}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-secondary)', fontSize: '13px' }}>
            <Clock size={13} />
            {formatTime(session.start_time)}{session.end_time ? ` - ${formatTime(session.end_time)}` : ''}
          </span>
        </div>
        {session.terrain_name && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-secondary)', fontSize: '13px' }}>
            <MapPin size={13} /><span>{session.terrain_name}</span>
          </div>
        )}
        <RainBadge
          rain_applied={!!session.rain_applied}
          rain_plan_defined={!!session.rain_plan_defined}
          rain_note={session.rain_note}
          base_terrain_name={session.base_terrain_name}
          base_start_time={session.base_start_time}
          base_end_time={session.base_end_time}
        />
        {!isCancelledSession && user?.id && kids.map((kid) => {
          const att = trainingAtt[`${session.id}:${kid.memberId}`]
          return (
            <TrainingAttendanceControl
              key={kid.memberId}
              sessionId={session.id}
              sessionDate={session.session_date}
              startTime={session.start_time}
              memberId={kid.memberId}
              memberName={showChildName ? kid.memberName : undefined}
              status={att?.status ?? null}
              present={att?.present ?? null}
              respondedAt={att?.responded_at ?? null}
              userId={user.id}
              defaultPresent={attendanceDefaultPresent}
              gender={kid.gender}
            />
          )
        })}
      </div>
    )
  }

  const renderItem = (item: CalItem) => {
    if (item.kind === 'match') return <div key={`m-${item.match.id}`}>{renderMatch(item.match)}</div>
    return <div key={`t-${item.session.id}`}>{renderTraining(item)}</div>
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Chargement du calendrier...</div>
      </div>
    )
  }

  if (loadFailed) {
    return <LoadError onRetry={load} />
  }

  return (
    <div className="page-container">
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Calendrier</h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{isSupporter ? 'Calendrier du club' : 'Vos matchs et entraînements à venir'}</p>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {(['all', 'match', ...(showTraining ? ['training'] : [])] as const).map(k => {
          const labels: Record<string, string> = { all: 'Tous', match: 'Matchs', training: 'Entraînements' }
          const active = filterType === k
          return (
            <button
              key={k}
              onClick={() => setFilterType(k)}
              style={{
                padding: '6px 14px', borderRadius: '999px', fontSize: '13px', fontWeight: 600,
                border: '1px solid var(--border-color)', cursor: 'pointer',
                background: active ? 'var(--accent)' : 'var(--bg-card)',
                color: active ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {labels[k]}
            </button>
          )
        })}
      </div>

      {teams.length > 1 && (
        <div style={{ marginBottom: '20px' }}>
          <select
            value={filterTeam}
            onChange={(e) => setFilterTeam(e.target.value)}
            style={{
              padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)',
              fontSize: '14px', background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer',
              maxWidth: '100%', boxSizing: 'border-box' as const, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
            }}
          >
            <option value="all">{isSupporter ? 'Toutes les équipes' : 'Toutes mes équipes'}</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}

      {upcoming.length === 0 && past.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '48px 24px', textAlign: 'center' }}>
          <Calendar size={40} style={{ margin: '0 auto 12px', color: 'var(--text-muted)', display: 'block' }} />
          {teams.length === 0 && !isSupporter ? (
            <>
              <p style={{ color: 'var(--text-secondary)', fontSize: '15px', margin: '0 0 8px' }}>
                Vous n'êtes rattaché·e à aucune équipe pour le moment.
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>
                Votre calendrier se remplira dès que vous serez lié·e à une équipe comme joueur, parent ou entraîneur.
              </p>
            </>
          ) : (
            <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
              {filterType === 'match' ? 'Aucun match à venir.' : filterType === 'training' ? 'Aucun entraînement à venir.' : 'Aucun match ni entraînement à venir.'}
            </p>
          )}
        </div>
      ) : (
        <>
          {upcoming.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {upcoming.map(renderItem)}
            </div>
          ) : (
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              {filterType === 'match' ? 'Aucun match à venir.' : filterType === 'training' ? 'Aucun entraînement à venir.' : 'Aucun match ni entraînement à venir.'}
            </p>
          )}

          {past.length > 0 && (
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
                <span>Passés ({past.length})</span>
                {showPast ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
              {showPast && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                  {past.map(renderItem)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
