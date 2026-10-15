import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useTenant } from '../context/TenantContext'
import { reportLoadError } from '../utils/reportLoadError'
import { LoadError } from '../components/LoadError'
import { RainBadge } from '../components/RainBadge'
import {
  Calendar, MapPin, Clock, ChevronDown, ChevronUp, ChevronRight,
  Volleyball, Activity, Ban, X, FileText, Trophy,
} from 'lucide-react'
import { fetchGoals, type SavedGoal } from '../components/MatchGoals'
import {
  fetchMatchesByTeamIds,
  fetchTrainingSessionsForTeams,
  type ScheduleTeam,
  type MatchRow,
  type TrainingSessionRow,
} from '../lib/memberCalendar'

/* ── helpers ── */

const MONTHS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
const DAYS = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']

function formatDateFR(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  return `${DAYS[date.getDay()]} ${Number(d)} ${MONTHS[Number(m) - 1]}`
}
function formatTime(t: string | null): string {
  if (!t) return '—'
  const [h, m] = t.split(':')
  return `${h}h${m}`
}
function toTimestamp(dateStr: string, timeStr: string | null): number {
  const time = timeStr && /^\d{1,2}:\d{2}/.test(timeStr) ? timeStr.slice(0, 5) : '12:00'
  const v = new Date(`${dateStr}T${time}:00`).getTime()
  return Number.isNaN(v) ? new Date(dateStr).getTime() : v
}

const MATCH_STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  'planifié':  { bg: 'var(--info-soft)',    text: 'var(--info-text)',    label: 'Planifié' },
  'scheduled': { bg: 'var(--info-soft)',    text: 'var(--info-text)',    label: 'Planifié' },
  'à confirmer': { bg: 'var(--warning-soft)', text: 'var(--warning-text)', label: 'À confirmer' },
  'to_confirm':  { bg: 'var(--warning-soft)', text: 'var(--warning-text)', label: 'À confirmer' },
  'confirmé':  { bg: 'var(--success-soft)', text: 'var(--success-text)', label: 'Confirmé' },
  'confirmed': { bg: 'var(--success-soft)', text: 'var(--success-text)', label: 'Confirmé' },
  'joué':   { bg: 'var(--bg-hover)',     text: 'var(--text-muted)',   label: 'Joué' },
  'played': { bg: 'var(--bg-hover)',     text: 'var(--text-muted)',   label: 'Joué' },
  'annulé':    { bg: 'var(--danger-soft)',  text: 'var(--danger-text)',  label: 'Annulé' },
  'cancelled': { bg: 'var(--danger-soft)',  text: 'var(--danger-text)',  label: 'Annulé' },
  'reporté':   { bg: 'var(--warning-soft)', text: 'var(--warning-text)', label: 'Reporté' },
  'postponed': { bg: 'var(--warning-soft)', text: 'var(--warning-text)', label: 'Reporté' },
}

/* ── type chip ── */

function TypeChip({ kind }: { kind: 'match' | 'training' }) {
  const conf = kind === 'match'
    ? { bg: 'var(--accent-soft)', color: 'var(--accent-text)', icon: <Volleyball size={11} />, label: 'Match' }
    : { bg: 'var(--info-soft)', color: 'var(--info-text)', icon: <Activity size={11} />, label: 'Entraînement' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '2px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 700,
      background: conf.bg, color: conf.color, whiteSpace: 'nowrap',
    }}>
      {conf.icon} {conf.label}
    </span>
  )
}

/* ── data types ── */

type CalItem =
  | { kind: 'match'; ts: number; match: MatchRow }
  | { kind: 'training'; ts: number; session: TrainingSessionRow; teamName: string }

type TypeFilter = 'tous' | 'match' | 'training'

const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: 'tous', label: 'Tous' },
  { key: 'match', label: 'Matchs' },
  { key: 'training', label: 'Entraînements' },
]

/* ── main component ── */

export default function CommitteeMobileCalendar() {
  const { clubId } = useTenant()
  const [loading, setLoading] = useState(true)
  const [teams, setTeams] = useState<ScheduleTeam[]>([])
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [sessions, setSessions] = useState<TrainingSessionRow[]>([])
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('tous')
  const [teamFilter, setTeamFilter] = useState<string>('all')
  const [showPast, setShowPast] = useState(false)
  const [selectedMatch, setSelectedMatch] = useState<MatchRow | null>(null)
  const [convocationPublished, setConvocationPublished] = useState<Set<string>>(new Set())
  const [loadFailed, setLoadFailed] = useState(false)

  const load = useCallback(async () => {
    if (!clubId) { setLoading(false); return }
    setLoadFailed(false)
    setLoading(true)

    try {
      const fromDate = new Date(Date.now() - 60 * 24 * 3600_000).toISOString().split('T')[0]
      const toDate = new Date(Date.now() + 120 * 24 * 3600_000).toISOString().split('T')[0]

      const { data: allTeams } = await supabase
        .from('teams')
        .select('id, name')
        .eq('club_id', clubId)
        .eq('active', true)
        .order('name')

      const clubTeams: ScheduleTeam[] = (allTeams || []).map(t => ({ id: t.id, name: t.name }))
      setTeams(clubTeams)

      const teamIds = clubTeams.map(t => t.id)

      const [matchRows, sessionRows] = await Promise.all([
        teamIds.length > 0 ? fetchMatchesByTeamIds(teamIds) : Promise.resolve([]),
        fetchTrainingSessionsForTeams(teamIds, fromDate, toDate),
      ])

      const mRows = matchRows as MatchRow[]
      setMatches(mRows)
      setSessions(sessionRows)

      const mIds = mRows.map(m => m.id)
      if (mIds.length > 0) {
        const { data: pubConvs } = await supabase
          .from('match_convocations')
          .select('match_id')
          .in('match_id', mIds)
          .eq('status', 'published')
        if (pubConvs) setConvocationPublished(new Set(pubConvs.map(c => c.match_id)))
      }

      setLoading(false)
    } catch (error) {
      reportLoadError('CommitteeMobileCalendar', error)
      setLoadFailed(true)
      setLoading(false)
    }
  }, [clubId])

  useEffect(() => { load() }, [load])

  const teamNameMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of teams) m.set(t.id, t.name)
    return m
  }, [teams])

  const items: CalItem[] = useMemo(() => {
    let list: CalItem[] = []

    if (typeFilter === 'tous' || typeFilter === 'match') {
      let fm = matches
      if (teamFilter !== 'all') fm = fm.filter(m => m.teams?.id === teamFilter)
      list.push(...fm.map((m): CalItem => ({ kind: 'match', ts: toTimestamp(m.match_date, m.match_time), match: m })))
    }

    if (typeFilter === 'tous' || typeFilter === 'training') {
      let fs = sessions
      if (teamFilter !== 'all') fs = fs.filter(s => s.team_id === teamFilter)
      list.push(...fs.map((s): CalItem => ({
        kind: 'training', ts: toTimestamp(s.session_date, s.start_time),
        session: s, teamName: teamNameMap.get(s.team_id) || '',
      })))
    }

    return list
  }, [matches, sessions, typeFilter, teamFilter, teamNameMap])

  const now = Date.now()
  const upcoming = useMemo(() => items.filter(i => i.ts >= now).sort((a, b) => a.ts - b.ts), [items, now])
  const past = useMemo(() => items.filter(i => i.ts < now).sort((a, b) => b.ts - a.ts), [items, now])
  const totalCount = upcoming.length + past.length

  /* ── chip style helper ── */
  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 12px', borderRadius: '16px', fontSize: '12px', fontWeight: 600,
    border: '1px solid', cursor: 'pointer', transition: 'all 0.15s',
    borderColor: active ? 'var(--accent)' : 'var(--border-color)',
    background: active ? 'var(--accent)' : 'var(--bg-card)',
    color: active ? '#fff' : 'var(--text-secondary)',
  })

  /* ── card renderers ── */

  const renderMatch = (match: MatchRow) => {
    const isCancelled = match.status === 'annulé' || match.status === 'cancelled'
    const isPostponed = match.status === 'reporté' || match.status === 'postponed'
    const reason = (isCancelled || isPostponed) ? match.cancellation_reason : null
    const s = MATCH_STATUS_STYLES[match.status] ?? { bg: 'var(--bg-hover)', text: 'var(--text-muted)', label: match.status }

    return (
      <div
        key={`m-${match.id}`}
        onClick={() => setSelectedMatch(match)}
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
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', lineHeight: 1.3 }}>
              {match.is_home
                ? <>{match.teams?.name ?? '—'} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>vs</span> {match.opponent_name}</>
                : <>{match.opponent_name} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>vs</span> {match.teams?.name ?? '—'}</>}
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
      </div>
    )
  }

  const renderTraining = (session: TrainingSessionRow, teamName: string) => {
    const isCancelled = session.cancelled
    return (
      <div key={`t-${session.id}`} style={{
        background: isCancelled ? 'var(--danger-soft)' : 'var(--bg-card)',
        border: isCancelled ? '1px solid var(--danger)' : '1px solid var(--border-color)',
        borderRadius: '12px', padding: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
          <TypeChip kind="training" />
          {isCancelled && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '2px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 800,
              background: 'var(--danger)', color: '#fff', whiteSpace: 'nowrap',
              letterSpacing: '0.03em', textTransform: 'uppercase',
            }}>
              <Ban size={11} /> Annulé
            </span>
          )}
          {teamName && <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>{teamName}</span>}
        </div>
        <div style={{
          fontSize: '16px', fontWeight: 700, marginBottom: '6px',
          color: isCancelled ? 'var(--danger-text)' : 'var(--text-primary)',
          textDecoration: isCancelled ? 'line-through' : undefined,
        }}>Entraînement</div>
        {isCancelled && session.cancelled_reason && (
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
            {formatTime(session.start_time)}{session.end_time ? ` – ${formatTime(session.end_time)}` : ''}
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
      </div>
    )
  }

  const renderItem = (item: CalItem) => {
    if (item.kind === 'match') return renderMatch(item.match)
    return renderTraining(item.session, item.teamName)
  }

  /* ── render ── */

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <div className="animate-spin" style={{ width: 24, height: 24, border: '2.5px solid var(--border-color)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} />
      </div>
    )
  }

  if (loadFailed) {
    return <LoadError onRetry={load} />
  }

  return (
    <div style={{ maxWidth: 500, margin: '0 auto' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
        Calendrier du club
      </h1>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
        {totalCount} activité{totalCount !== 1 ? 's' : ''}
      </p>

      {/* Type filter chips + team select */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
        {TYPE_FILTERS.map(f => (
          <button key={f.key} type="button" onClick={() => setTypeFilter(f.key)} style={chipStyle(typeFilter === f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: '16px' }}>
        <select
          value={teamFilter}
          onChange={e => setTeamFilter(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            fontSize: '14px',
            fontWeight: 500,
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            appearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 10px center',
            paddingRight: '32px',
          }}
        >
          <option value="all">Toutes les équipes</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {/* Content */}
      {upcoming.length === 0 && past.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '48px 24px', textAlign: 'center' }}>
          <Calendar size={40} style={{ margin: '0 auto 12px', color: 'var(--text-muted)', display: 'block' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
            {typeFilter === 'match' ? 'Aucun match à venir.' : typeFilter === 'training' ? 'Aucun entraînement à venir.' : 'Aucun match ni entraînement à venir.'}
          </p>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {upcoming.map(renderItem)}
            </div>
          )}

          {past.length > 0 && (
            <div style={{ marginTop: '28px' }}>
              <button
                type="button"
                onClick={() => setShowPast(v => !v)}
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

      {/* Match detail bottom sheet */}
      {selectedMatch && (
        <MatchDetailSheet
          match={selectedMatch}
          hasConvocation={convocationPublished.has(selectedMatch.id)}
          onClose={() => setSelectedMatch(null)}
        />
      )}
    </div>
  )
}

/* ── Read-only match detail bottom sheet ── */

function MatchDetailSheet({ match, hasConvocation, onClose }: {
  match: MatchRow
  hasConvocation: boolean
  onClose: () => void
}) {
  const isCancelled = match.status === 'annulé' || match.status === 'cancelled'
  const isPostponed = match.status === 'reporté' || match.status === 'postponed'
  const reason = (isCancelled || isPostponed) ? match.cancellation_reason : null
  const hasResult = match.score_for != null && match.score_against != null
  const s = hasResult && !isCancelled && !isPostponed
    ? { bg: 'var(--success-soft)', text: 'var(--success-text)', label: 'Joué' }
    : MATCH_STATUS_STYLES[match.status] ?? { bg: 'var(--bg-hover)', text: 'var(--text-muted)', label: match.status }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column' }}
      onClick={onClose}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
      <div
        style={{
          position: 'relative', marginTop: 'auto', background: 'var(--bg-card)',
          borderRadius: '16px 16px 0 0', padding: '20px', maxHeight: '80vh', overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-color)', margin: '0 auto 16px' }} />

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute', top: '16px', right: '16px',
            background: 'var(--bg-hover)', border: 'none', borderRadius: '50%',
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--text-secondary)',
          }}
        >
          <X size={16} />
        </button>

        {/* Matchup title */}
        <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', lineHeight: 1.3, paddingRight: '40px' }}>
          {match.is_home
            ? <>{match.teams?.name ?? '—'} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>vs</span> {match.opponent_name}</>
            : <>{match.opponent_name} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>vs</span> {match.teams?.name ?? '—'}</>}
        </div>

        {/* Badges row */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {match.teams?.name && (
            <span style={{ fontSize: '12px', padding: '2px 10px', borderRadius: '999px', fontWeight: 600, background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
              {match.teams.name}
            </span>
          )}
          <span style={{
            fontSize: '12px', padding: '2px 8px', borderRadius: '999px', fontWeight: 600,
            background: match.is_home ? 'var(--success-soft)' : 'var(--info-soft)',
            color: match.is_home ? 'var(--success-text)' : 'var(--info-text)',
          }}>
            {match.is_home ? 'Domicile' : 'Extérieur'}
          </span>
          <span style={{ background: s.bg, color: s.text, borderRadius: '999px', padding: '2px 10px', fontSize: '12px', fontWeight: 600 }}>
            {s.label}
          </span>
        </div>

        {/* Info rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
          {hasResult && <ResultRow match={match} />}
          <InfoRow icon={<Calendar size={15} />} label="Date" value={formatDateFR(match.match_date)} />
          <InfoRow
            icon={<Clock size={15} />}
            label="Heure"
            value={match.match_time ? formatTime(match.match_time) : 'À confirmer'}
            warn={!match.match_time}
          />
          {match.venues && (
            <InfoRow
              icon={<MapPin size={15} />}
              label="Lieu"
              value={match.venues.field_name
                ? `${match.venues.name} – ${match.venues.field_name}, ${match.venues.city}`
                : `${match.venues.name}, ${match.venues.city}`}
            />
          )}
          {match.designation && (
            <InfoRow icon={<Volleyball size={15} />} label="Désignation" value={match.designation} />
          )}
          {match.match_number && (
            <InfoRow icon={<FileText size={15} />} label="N° de match" value={match.match_number} />
          )}
        </div>

        {/* Cancellation / postponement reason */}
        {reason && (
          <div style={{
            padding: '10px 12px', borderRadius: '8px', marginBottom: '16px',
            background: isCancelled ? 'var(--danger-soft)' : 'var(--warning-soft)',
            color: isCancelled ? 'var(--danger-text)' : 'var(--warning-text)',
            fontSize: '13px', fontWeight: 500,
          }}>
            {isCancelled ? "Motif d'annulation : " : 'Motif de report : '}{reason}
          </div>
        )}

        {/* Convocation notice */}
        {hasConvocation && (
          <div style={{
            padding: '10px 12px', borderRadius: '8px', marginBottom: '16px',
            background: 'var(--accent-soft)', color: 'var(--accent-text)',
            fontSize: '13px', fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <FileText size={14} /> Convocation publiée
          </div>
        )}

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          style={{
            width: '100%', padding: '12px',
            background: 'var(--bg-hover)', color: 'var(--text-primary)',
            border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Fermer
        </button>
      </div>
    </div>
  )
}

function ResultRow({ match }: { match: MatchRow }) {
  const [goals, setGoals] = useState<SavedGoal[]>([])

  useEffect(() => {
    let cancelled = false
    fetchGoals(match.id).then(g => { if (!cancelled) setGoals(g ?? []) })
    return () => { cancelled = true }
  }, [match.id])

  const scoreFor = match.score_for ?? 0
  const scoreAgainst = match.score_against ?? 0
  const outcome = scoreFor > scoreAgainst
    ? { label: 'Victoire', color: 'var(--success-text)' }
    : scoreFor < scoreAgainst
      ? { label: 'Défaite', color: 'var(--danger-text)' }
      : { label: 'Match nul', color: 'var(--text-muted)' }
  const [leftScore, rightScore] = match.is_home
    ? [match.score_for, match.score_against]
    : [match.score_against, match.score_for]
  const hasPenalties = match.penalties_for != null && match.penalties_against != null
  const [leftPen, rightPen] = match.is_home
    ? [match.penalties_for, match.penalties_against]
    : [match.penalties_against, match.penalties_for]

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
      <span style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: '1px' }}><Trophy size={15} /></span>
      <div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '1px' }}>Résultat</div>
        <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px', lineHeight: 1.5 }}>
          <span style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{leftScore} – {rightScore}</span>
          <span style={{ fontSize: '14px', fontWeight: 600, color: outcome.color }}>{outcome.label}</span>
          {(match.forfeit || hasPenalties) && (
            <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-muted)' }}>
              {[match.forfeit && '(forfait)', hasPenalties && `(tab ${leftPen}-${rightPen})`].filter(Boolean).join(' ')}
            </span>
          )}
        </div>
        {goals.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
            {goals.map(g => (
              <div key={g.goal_index} style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                {g.own_goal ? '⚽ Autogoal adverse' : (
                  <>
                    ⚽ {g.scorer_name ?? ''}
                    {g.assist_name && <span style={{ color: 'var(--text-muted)' }}> (passe : {g.assist_name})</span>}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function InfoRow({ icon, label, value, warn }: { icon: React.ReactNode; label: string; value: string; warn?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
      <span style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: '1px' }}>{icon}</span>
      <div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '1px' }}>{label}</div>
        <div style={{ fontSize: '14px', fontWeight: 500, color: warn ? 'var(--warning)' : 'var(--text-primary)' }}>{value}</div>
      </div>
    </div>
  )
}
