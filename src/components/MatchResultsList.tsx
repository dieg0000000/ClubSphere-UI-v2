import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fetchGoals, type SavedGoal } from './MatchGoals'
import { LoadError } from './LoadError'
import { reportLoadError } from '../utils/reportLoadError'
import { displayPenalties, displayScore } from '../utils/matchStatus'

interface Season {
  id: string
  name: string
  active: boolean
}

interface TeamOption {
  id: string
  name: string
  active: boolean
}

interface ResultMatch {
  id: string
  team_id: string | null
  match_date: string
  opponent_name: string | null
  is_home: boolean
  score_for: number
  score_against: number
  forfeit: string | null
  penalties_for: number | null
  penalties_against: number | null
  teams: { name: string } | null
}

const ALL_TEAMS = ''

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px',
}

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: '8px',
  border: '1px solid var(--border-color)', background: 'var(--bg-input)',
  color: 'var(--text-primary)', fontSize: '14px', outline: 'none',
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${d}.${m}.${y}`
}

function outcomeOf(m: ResultMatch) {
  if (m.score_for > m.score_against) return { label: 'Victoire', color: 'var(--success-text)' }
  if (m.score_for < m.score_against) return { label: 'Défaite', color: 'var(--danger-text)' }
  return { label: 'Match nul', color: 'var(--text-muted)' }
}

function GoalsPanel({ matchId }: { matchId: string }) {
  const [goals, setGoals] = useState<SavedGoal[] | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    fetchGoals(matchId).then(g => { if (!cancelled) setGoals(g) })
    return () => { cancelled = true }
  }, [matchId])

  if (goals === undefined) return <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Chargement...</p>
  if (goals === null) return <p style={{ fontSize: '13px', color: 'var(--danger-text)' }}>Impossible de charger les buts.</p>
  if (goals.length === 0) return <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Aucun buteur enregistré.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
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
  )
}

function ResultItem({ match }: { match: ResultMatch }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const teamName = match.teams?.name ?? '—'
  const opponent = match.opponent_name ?? '—'
  const [home, away] = match.is_home ? [teamName, opponent] : [opponent, teamName]
  const [left, right] = displayScore(match.score_for, match.score_against, match.is_home)
  const hasPenalties = match.penalties_for != null && match.penalties_against != null
  const pens = hasPenalties ? displayPenalties(match.penalties_for!, match.penalties_against!, match.is_home) : null
  const outcome = outcomeOf(match)
  const suffix = [match.forfeit && '(forfait)', pens && `(tab ${pens[0]}-${pens[1]})`].filter(Boolean).join(' ')

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '16px' }}>
        <button
          type="button"
          onClick={() => navigate(`/matchs/${match.id}`)}
          style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
            <span>{formatDate(match.match_date)}</span>
            <span>{teamName}</span>
          </div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3, marginBottom: '4px' }}>
            {home} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>vs</span> {away}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px', lineHeight: 1.5 }}>
            <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{left} – {right}</span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: outcome.color }}>{outcome.label}</span>
            {suffix && <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-muted)' }}>{suffix}</span>}
          </div>
        </button>
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? 'Masquer les buts' : 'Afficher les buts'}
          onClick={() => setOpen(o => !o)}
          style={{
            flexShrink: 0, width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-muted)',
          }}
        >
          <ChevronDown size={18} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </button>
      </div>
      {open && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
          <GoalsPanel matchId={match.id} />
        </div>
      )}
    </div>
  )
}

export function MatchResultsList() {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [teams, setTeams] = useState<TeamOption[]>([])
  const [seasonId, setSeasonId] = useState('')
  const [teamId, setTeamId] = useState(ALL_TEAMS)
  const [matches, setMatches] = useState<ResultMatch[]>([])
  const [loadingFilters, setLoadingFilters] = useState(true)
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  const loadFilters = async () => {
    setLoadFailed(false)
    setLoadingFilters(true)
    const [seasonRes, teamRes] = await Promise.all([
      supabase.from('seasons').select('id, name, active').order('start_date', { ascending: false }),
      supabase.from('teams').select('id, name, active').order('level_rank', { ascending: true }).order('name', { ascending: true }),
    ])
    if (seasonRes.error || teamRes.error) {
      reportLoadError('Classements résultats', seasonRes.error ?? teamRes.error)
      setLoadFailed(true)
      setLoadingFilters(false)
      return
    }
    const s = (seasonRes.data || []) as Season[]
    setSeasons(s)
    setTeams((teamRes.data || []) as TeamOption[])
    setSeasonId((s.find(x => x.active) ?? s[0])?.id ?? '')
    setLoadingFilters(false)
  }

  useEffect(() => { loadFilters() }, [])

  useEffect(() => {
    if (!seasonId) { setMatches([]); return }
    let cancelled = false
    setLoadingMatches(true)
    supabase
      .from('matches')
      .select('id, team_id, match_date, opponent_name, is_home, score_for, score_against, forfeit, penalties_for, penalties_against, teams(name)')
      .eq('season_id', seasonId)
      .not('score_for', 'is', null)
      .not('score_against', 'is', null)
      .order('match_date', { ascending: false })
      .order('match_time', { ascending: false, nullsFirst: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          reportLoadError('Classements résultats', error)
          setLoadFailed(true)
        } else {
          setMatches((data || []) as unknown as ResultMatch[])
        }
        setLoadingMatches(false)
      })
    return () => { cancelled = true }
  }, [seasonId])

  const teamOptions = useMemo(() => {
    const played = new Set(matches.map(m => m.team_id))
    return teams.filter(t => t.active || played.has(t.id) || t.id === teamId)
  }, [teams, matches, teamId])

  const visible = teamId === ALL_TEAMS ? matches : matches.filter(m => m.team_id === teamId)

  if (loadingFilters) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2" style={{ borderColor: 'var(--accent)' }} />
      </div>
    )
  }
  if (loadFailed) return <LoadError onRetry={loadFilters} />

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px', maxWidth: '640px' }}>
        <div>
          <label htmlFor="results-season" style={labelStyle}>Saison</label>
          <select id="results-season" value={seasonId} onChange={e => setSeasonId(e.target.value)} style={selectStyle}>
            {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="results-team" style={labelStyle}>Équipe</label>
          <select id="results-team" value={teamId} onChange={e => setTeamId(e.target.value)} style={selectStyle}>
            <option value={ALL_TEAMS}>Toutes les équipes</option>
            {teamOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>

      {loadingMatches ? (
        <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Chargement...</p>
      ) : visible.length === 0 ? (
        <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Aucun résultat pour cette saison.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {visible.map(m => <ResultItem key={m.id} match={m} />)}
        </div>
      )}
    </div>
  )
}
