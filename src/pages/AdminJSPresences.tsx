import { useEffect, useMemo, useState } from 'react'
import { ChartBar as BarChart3, TriangleAlert as AlertTriangle, ChevronUp, ChevronDown, ChevronsUpDown, Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { buildMatchAttendanceFull } from '../lib/trainingAttendance'
import { useAttendanceDefaultPresent } from '../hooks/useAttendanceDefaultPresent'
import { useTenant } from '../context/TenantContext'
import { Tabs } from '../components/ui/Tabs'
import { Badge } from '../components/ui/Badge'
import { Alert } from '../components/ui/Alert'
import { AccordionList, AccordionListItem } from '../components/ui/AccordionList'
import SearchInput from '../components/ui/SearchInput'
import Button from '../components/ui/Button'
import { BdnsExportModal } from '../components/BdnsExportModal'

/**
 * J+S Présences — vue réassemblée (design system).
 * - AccordionList par équipe (ligne = résumé + barre de bandes + taux ; dépliée = détail inline).
 * - Portées : Entraînements (donnée J+S saisie par les coachs), Matchs (provisoire : basé sur les
 *   confirmations de convocation), Cumul J+S (entraînements + matchs).
 * - La logique de calcul des entraînements est identique à l'ancienne page (/admin/js-presences-old)
 *   pour permettre la comparaison des chiffres.
 */

type Scope = 'trainings' | 'matches' | 'cumul'

interface AttendanceRec {
  member_id: string
  status: string | null // present_real | absent_justified | absent_unjustified | pending
}

interface Activity {
  id: string
  team_id: string
  date: string
  kind: 'training' | 'match'
  opponent?: string | null
  isHome?: boolean | null
  validated: boolean
  attendance: AttendanceRec[]
  convokedCount?: number
}

interface Team {
  id: string
  name: string
  type: string
  training_start: string | null
}

interface Player {
  id: string
  first_name: string
  last_name: string
  team_id: string
  team?: { name: string } | null
}

const COLOR_PRESENT = 'var(--success)'
const COLOR_JUSTIFIED = 'var(--warning)'
const COLOR_UNJUSTIFIED = 'var(--danger)'

function getColorForPct(pct: number) {
  if (pct >= 75) return 'var(--success)'
  if (pct >= 50) return 'var(--warning)'
  return 'var(--danger)'
}

function formatDateFR(date: string) {
  return new Date(date).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })
}

function SummaryCard({
  title,
  stats,
}: {
  title: string
  stats: { totalActivities: number; totalPresences: number; totalPossible: number; globalPct: number }
}) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 16,
        padding: 28,
      }}
    >
      <div
        style={{
          color: 'var(--text-muted)',
          fontSize: 13,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          marginBottom: 8,
          fontWeight: 600,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 56, fontWeight: 900, color: getColorForPct(stats.globalPct), lineHeight: 1 }}>
        {stats.globalPct}%
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          {stats.totalPresences} présences / {stats.totalPossible} possibles
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          {stats.totalActivities} activité{stats.totalActivities > 1 ? 's' : ''}
        </span>
      </div>
    </div>
  )
}

function ColorLegend() {
  const Item = ({ color, label }: { color: string; label: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 10, height: 10, borderRadius: 999, background: color, display: 'inline-block' }} />
      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{label}</span>
    </div>
  )
  return (
    <div
      style={{
        display: 'flex',
        gap: 24,
        flexWrap: 'wrap',
        justifyContent: 'center',
        padding: '12px 16px',
        background: 'var(--bg-hover)',
        border: '1px solid var(--border-color)',
        borderRadius: 8,
        marginBottom: 24,
      }}
    >
      <Item color="var(--success)" label="≥ 75% — Bonne assiduité" />
      <Item color="var(--warning)" label="≥ 50% — Assiduité moyenne" />
      <Item color="var(--danger)" label="< 50% — Assiduité insuffisante" />
    </div>
  )
}

export function AdminJSPresences() {
  const { clubId } = useTenant()
  const { value: defaultPresent } = useAttendanceDefaultPresent(clubId)
  const [activeTab, setActiveTab] = useState<'global' | 'player'>('global')
  const [scope, setScope] = useState<Scope>('trainings')
  const [playerSubTab, setPlayerSubTab] = useState<'team' | 'club'>('team')

  const [teams, setTeams] = useState<Team[]>([])
  const [trainings, setTrainings] = useState<Activity[]>([])
  const [matches, setMatches] = useState<Activity[]>([])
  const [playerCountByTeam, setPlayerCountByTeam] = useState<Record<string, number>>({})
  const [players, setPlayers] = useState<Player[]>([])
  const [globalPlayerStats, setGlobalPlayerStats] = useState<any[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [openTeamId, setOpenTeamId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [globalSearch, setGlobalSearch] = useState('')
  const [globalSort, setGlobalSort] = useState<{ field: string; dir: 'asc' | 'desc' }>({ field: '', dir: 'asc' })
  const [bdnsModalOpen, setBdnsModalOpen] = useState(false)

  const filteredSortedGlobalStats = useMemo(() => {
    let rows = globalPlayerStats
    if (globalSearch.trim()) {
      const q = globalSearch.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      rows = rows.filter((p: any) => {
        const name = `${p.first_name} ${p.last_name}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        const team = (p.team?.name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        return name.includes(q) || team.includes(q)
      })
    }
    if (globalSort.field) {
      rows = [...rows].sort((a: any, b: any) => {
        let cmp = 0
        switch (globalSort.field) {
          case 'name':
            cmp = `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`, 'fr')
            break
          case 'team':
            cmp = (a.team?.name || '').localeCompare(b.team?.name || '', 'fr')
            break
          case 'present':
            cmp = a.present - b.present
            break
          case 'total':
            cmp = a.total - b.total
            break
          case 'pct':
            cmp = a.pct - b.pct
            break
          default:
            break
        }
        return globalSort.dir === 'desc' ? -cmp : cmp
      })
    }
    return rows
  }, [globalPlayerStats, globalSearch, globalSort])

  const handleGlobalSort = (field: string) => {
    setGlobalSort(prev => prev.field === field ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' })
  }

  const GlobalSortIcon = ({ field }: { field: string }) => {
    if (globalSort.field !== field) return <ChevronsUpDown size={14} style={{ opacity: 0.4 }} />
    return globalSort.dir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
  }

  useEffect(() => { document.title = 'J+S Présences - ClubSphere' }, [])

  const handleExportExcel = async () => {
    try {
    const XLSX = await import('xlsx')
    const rows: Record<string, string | number>[] = []
    const allTeams = [...juniorTeams, ...activeTeams]
    for (const team of allTeams) {
      const acts = getTeamActivities(team.id)
      const teamPlayerCount = playerCountByTeam[team.id] || 0
      for (const a of acts) {
        const p = a.attendance.filter(r => r.status === 'present_real').length
        const actTotal = a.convokedCount ?? teamPlayerCount
        const absent = Math.max(0, actTotal - p)
        const actPct = actTotal > 0 ? Math.min(100, Math.round((p / actTotal) * 100)) : 0
        rows.push({
          'Équipe': team.name,
          'Date': formatDateFR(a.date),
          'Type': a.kind === 'training' ? 'Entraînement' : 'Match',
          'Adversaire': a.kind === 'match' ? (a.opponent || '—') : '—',
          'Dom./Ext.': a.kind === 'match' ? (a.isHome ? 'Dom.' : 'Ext.') : '',
          'Présents': p,
          'Absents': absent,
          '%': actPct,
          'Statut': getActivityStatus(a) === 'validated' ? 'Saisie' : getActivityStatus(a) === 'in_progress' ? 'En cours' : 'Non saisie',
        })
      }
    }
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 24 }, { wch: 20 }, { wch: 14 }, { wch: 24 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 6 }, { wch: 12 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Cumul J+S')
    const year = new Date().getFullYear()
    XLSX.writeFile(wb, `cumul-js-${year}-${year + 1}.xlsx`)
    } catch (e) { console.error('Export failed', e); }
  }

  useEffect(() => {
    loadData()
  }, [defaultPresent])

  useEffect(() => {
    if (selectedTeamId) loadTeamPlayers(selectedTeamId)
  }, [selectedTeamId])

  const loadData = async () => {
    try {
      const today = new Date().toISOString().split('T')[0]

      const { data: teamsData } = await supabase
        .from('teams')
        .select('id, name, level_rank, type, training_start')
        .in('type', ['junior', 'active'])
        .eq('active', true)
        .order('level_rank')
        .order('name')

      const teamsList = (teamsData || []) as Team[]
      setTeams(teamsList)
      const teamIds = teamsList.map(t => t.id)
      if (teamIds.length === 0) {
        setTrainings([])
        setMatches([])
        setLoading(false)
        return
      }

      // ── Entraînements — logique IDENTIQUE à l'ancienne page ──
      const { data: sessionsData } = await supabase
        .from('training_sessions')
        .select(
          `id, team_id, session_date, cancelled, validated_at, validated_by,
           attendance:training_attendance(member_id, present, status)`
        )
        .in('team_id', teamIds)
        .eq('cancelled', false)
        .lte('session_date', today)
        .order('session_date', { ascending: false })

      const validSessions = (sessionsData || []).filter((s: any) => {
        const team = teamsList.find(t => t.id === s.team_id)
        if (!team) return false
        if (!team.training_start) return true
        return s.session_date >= team.training_start
      })

      setTrainings(
        validSessions.map((s: any) => ({
          id: s.id,
          team_id: s.team_id,
          date: s.session_date,
          kind: 'training' as const,
          validated: !!s.validated_at,
          attendance: (s.attendance || []) as AttendanceRec[],
        }))
      )

      // ── Matchs joués (date passée, non annulés/reportés) ──
      const { data: matchesData } = await supabase
        .from('matches')
        .select('id, team_id, match_date, opponent_name, is_home, status, attendance_validated_at')
        .in('team_id', teamIds)
        .lte('match_date', today)
        .order('match_date', { ascending: false })

      const played = (matchesData || []).filter(
        (m: any) => !['annulé', 'annule', 'reporté', 'reporte', 'cancelled'].includes((m.status || '').toLowerCase())
      )

      const matchIds = played.map((m: any) => m.id)
      const { attendance: attendanceByMatch, convokedCount } = await buildMatchAttendanceFull(matchIds, defaultPresent)

      setMatches(
        played.map((m: any) => ({
          id: m.id,
          team_id: m.team_id,
          date: m.match_date,
          kind: 'match' as const,
          opponent: m.opponent_name,
          isHome: m.is_home,
          validated: !!m.attendance_validated_at,
          attendance: attendanceByMatch[m.id] || [],
          convokedCount: convokedCount[m.id],
        }))
      )

      // ── Effectif par équipe (tous les membres avec team_id, sans filtre) — identique à l'ancienne page ──
      const { data: allTeamMembers } = await supabase.from('members').select('id, team_id').in('team_id', teamIds)
      const countMap: Record<string, number> = {}
      allTeamMembers?.forEach((m: any) => {
        if (m.team_id) countMap[m.team_id] = (countMap[m.team_id] || 0) + 1
      })
      setPlayerCountByTeam(countMap)
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadTeamPlayers = async (teamId: string) => {
    try {
      const { data } = await supabase
        .from('members')
        .select('id, first_name, last_name, team_id')
        .eq('team_id', teamId)
        .eq('licence_status', 'actif')
        .order('last_name', { ascending: true })
      setPlayers((data || []) as Player[])
    } catch (error) {
      console.error('Error loading players:', error)
    }
  }

  // ── Portée courante ──
  const activitiesForScope = (sc: Scope): Activity[] => {
    if (sc === 'trainings') return trainings
    if (sc === 'matches') return matches
    return [...trainings, ...matches]
  }
  const activities = activitiesForScope(scope)

  // ── Calculs (formules transplantées de l'ancienne page, généralisées à "activité") ──
  const calcSummary = (teamIds: string[]) => {
    const idSet = new Set(teamIds)
    const filtered = activities.filter(a => idSet.has(a.team_id))
    const totalActivities = filtered.length
    const totalPresences = filtered.reduce(
      (acc, a) => acc + a.attendance.filter(r => r.status === 'present_real').length,
      0
    )
    const totalPossible = filtered.reduce((acc, a) => acc + (a.convokedCount ?? playerCountByTeam[a.team_id] ?? 0), 0)
    const globalPct = totalPossible > 0 ? Math.round((totalPresences / totalPossible) * 100) : 0
    return { totalActivities, totalPresences, totalPossible, globalPct }
  }

  const calcTeamBands = (teamId: string) => {
    const teamActs = activities.filter(a => a.team_id === teamId)
    let presentReal = 0
    let absentJustified = 0
    let absentUnjustified = 0
    for (const a of teamActs) {
      for (const r of a.attendance) {
        if (r.status === 'present_real') presentReal++
        else if (r.status === 'absent_justified') absentJustified++
        else if (r.status === 'absent_unjustified') absentUnjustified++
      }
    }
    const totalRecorded = presentReal + absentJustified + absentUnjustified
    const rate = totalRecorded > 0 ? Math.round((presentReal / totalRecorded) * 100) : 0
    return { count: teamActs.length, presentReal, absentJustified, absentUnjustified, totalRecorded, rate }
  }

  const getTeamActivities = (teamId: string) =>
    activities
      .filter(a => a.team_id === teamId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const calcPlayerStats = (teamId: string) => {
    const teamActs = activities.filter(a => a.team_id === teamId)
    return players
      .map(player => {
        const present = teamActs.filter(a =>
          a.attendance.some(r => r.member_id === player.id && r.status === 'present_real')
        ).length
        const total = teamActs.filter(a => a.attendance.some(r => r.member_id === player.id)).length
        const pct = total > 0 ? Math.round((present / total) * 100) : 0
        return { ...player, present, total, pct }
      })
      .sort((a, b) => b.pct - a.pct)
  }

  const calcGlobalPlayerStats = async () => {
    const { data: allPlayers } = await supabase
      .from('members')
      .select('id, first_name, last_name, team_id, team:teams(name)')
      .eq('licence_status', 'actif')
      .in('team_id', teams.map(t => t.id))
    if (!allPlayers) return []
    return (allPlayers as any[])
      .map(player => {
        const present = activities.filter(a =>
          a.attendance.some(r => r.member_id === player.id && r.status === 'present_real')
        ).length
        const total = activities.filter(a => a.attendance.some(r => r.member_id === player.id)).length
        const pct = total > 0 ? Math.round((present / total) * 100) : 0
        return { ...player, present, total, pct }
      })
      .filter(p => p.total > 0)
      .sort((a, b) => b.pct - a.pct)
  }

  useEffect(() => {
    if (activeTab === 'player' && playerSubTab === 'club' && teams.length > 0) {
      calcGlobalPlayerStats().then(setGlobalPlayerStats)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerSubTab, activeTab, teams, trainings, matches, scope])

  // ── Statut d'une activité ──
  const getActivityStatus = (a: Activity): 'validated' | 'in_progress' | 'not_filled' => {
    if (a.kind === 'training') {
      if (a.validated) return 'validated'
      if (a.attendance.length > 0) return 'in_progress'
      return 'not_filled'
    }
    if (a.validated) return 'validated'
    return a.attendance.length > 0 ? 'in_progress' : 'not_filled'
  }

  const StatusBadge = ({ status }: { status: 'validated' | 'in_progress' | 'not_filled' }) => {
    const map = {
      validated: { variant: 'green' as const, icon: '✓', label: 'Saisie' },
      in_progress: { variant: 'blue' as const, icon: '✎', label: 'En cours' },
      not_filled: { variant: 'orange' as const, icon: '!', label: 'Non saisie' },
    }
    const c = map[status]
    return (
      <Badge variant={c.variant} icon={<span>{c.icon}</span>}>
        {c.label}
      </Badge>
    )
  }

  // ── Détail inline d'une équipe (contenu de l'accordéon) ──
  const TeamDetail = ({ teamId }: { teamId: string }) => {
    const acts = getTeamActivities(teamId)
    const teamPlayerCount = playerCountByTeam[teamId] || 0
    const present = acts.reduce((acc, a) => acc + a.attendance.filter(r => r.status === 'present_real').length, 0)
    const possible = acts.reduce((acc, a) => acc + (a.convokedCount ?? teamPlayerCount), 0)
    const pct = possible > 0 ? Math.round((present / possible) * 100) : 0
    const showType = scope === 'cumul'
    const showOpponent = scope !== 'trainings'

    return (
      <div style={{ paddingTop: 16 }}>
        <div
          style={{
            display: 'flex',
            gap: 24,
            flexWrap: 'wrap',
            marginBottom: 16,
            color: 'var(--text-muted)',
            fontSize: 13,
          }}
        >
          <span>
            <strong style={{ color: 'var(--text-primary)' }}>{acts.length}</strong> activité{acts.length > 1 ? 's' : ''}
          </span>
          <span>
            Présence moyenne :{' '}
            <strong style={{ color: getColorForPct(pct), fontSize: 15 }}>{pct}%</strong>
          </span>
          <span>
            Effectif : <strong style={{ color: 'var(--text-primary)' }}>{teamPlayerCount}</strong>
          </span>
        </div>

        <div className="std-table-wrap" style={{ maxHeight: 420, overflowY: 'auto', boxShadow: 'none' }}>
          <table className="std-table">
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr>
                <th style={{ position: 'sticky', top: 0, background: 'var(--table-header-bg)' }}>Date</th>
                {showType && <th style={{ position: 'sticky', top: 0, background: 'var(--table-header-bg)' }}>Type</th>}
                {showOpponent && (
                  <th style={{ position: 'sticky', top: 0, background: 'var(--table-header-bg)' }}>Adversaire</th>
                )}
                <th style={{ position: 'sticky', top: 0, background: 'var(--table-header-bg)', textAlign: 'center' }}>
                  Présents
                </th>
                <th style={{ position: 'sticky', top: 0, background: 'var(--table-header-bg)', textAlign: 'center' }}>
                  Absents
                </th>
                <th style={{ position: 'sticky', top: 0, background: 'var(--table-header-bg)', textAlign: 'center' }}>
                  %
                </th>
                <th style={{ position: 'sticky', top: 0, background: 'var(--table-header-bg)', textAlign: 'center' }}>
                  Statut
                </th>
              </tr>
            </thead>
            <tbody>
              {acts.map(a => {
                const p = a.attendance.filter(r => r.status === 'present_real').length
                const actTotal = a.convokedCount ?? teamPlayerCount
                const absent = Math.max(0, actTotal - p)
                const actPct = actTotal > 0 ? Math.min(100, Math.round((p / actTotal) * 100)) : 0
                return (
                  <tr key={a.id}>
                    <td>{formatDateFR(a.date)}</td>
                    {showType && (
                      <td>
                        <Badge variant={a.kind === 'training' ? 'sky' : 'violet'}>
                          {a.kind === 'training' ? 'Entraînement' : 'Match'}
                        </Badge>
                      </td>
                    )}
                    {showOpponent && (
                      <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                        {a.kind === 'match' ? (
                          <>
                            {a.opponent || '—'}{' '}
                            <span style={{ opacity: 0.7 }}>({a.isHome ? 'Dom.' : 'Ext.'})</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    )}
                    <td style={{ textAlign: 'center', color: 'var(--success)', fontWeight: 600 }}>{p}</td>
                    <td style={{ textAlign: 'center', color: 'var(--danger)', fontWeight: 600 }}>{absent}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ color: getColorForPct(actPct), fontWeight: 700 }}>{actPct}%</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <StatusBadge status={getActivityStatus(a)} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // ── Items de l'accordéon pour une liste d'équipes ──
  const buildAccordionItems = (list: Team[]): AccordionListItem[] =>
    list.map(team => {
      const s = calcTeamBands(team.id)
      const empty = s.count === 0 || s.totalRecorded === 0
      return {
        id: team.id,
        title: team.name,
        subtitle:
          s.count === 0 ? 'Aucune activité' : `${s.count} activité${s.count > 1 ? 's' : ''}`,
        bands: [
          { value: s.presentReal, color: COLOR_PRESENT, label: `${s.presentReal} présences` },
          { value: s.absentJustified, color: COLOR_JUSTIFIED, label: `${s.absentJustified} absences justifiées` },
          { value: s.absentUnjustified, color: COLOR_UNJUSTIFIED, label: `${s.absentUnjustified} absences injustifiées` },
        ],
        value: empty ? (
          <span style={{ color: 'var(--text-muted)' }}>—</span>
        ) : (
          <span style={{ color: getColorForPct(s.rate) }}>{s.rate}%</span>
        ),
        children: <TeamDetail teamId={team.id} />,
      }
    })

  const juniorTeams = teams.filter(t => t.type === 'junior')
  const activeTeams = teams.filter(t => t.type === 'active')
  const playerStats = selectedTeamId ? calcPlayerStats(selectedTeamId) : []

  const PlayerBar = ({ pct }: { pct: number }) => (
    <div style={{ background: 'var(--bg-hover)', borderRadius: 99, height: 8, width: '100%', maxWidth: 200 }}>
      <div style={{ background: getColorForPct(pct), borderRadius: 99, height: 8, width: `${pct}%` }} />
    </div>
  )

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[var(--accent)] mx-auto"></div>
      </div>
    )
  }

  return (
    <div style={{ padding: 32, maxWidth: 1400, margin: '0 auto' }}>
      {/* PageHeader */}
      <div style={{ marginBottom: 24 }}>
        <h1
          className="text-2xl font-bold flex items-center gap-3"
          style={{ marginBottom: 8, color: 'var(--text-primary)' }}
        >
          <BarChart3 className="w-5 h-5" />
          J+S Présences
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          Suivi de l'assiduité — entraînements et matchs
        </p>
      </div>

      <Tabs
        items={[
          { key: 'global', label: 'Vue globale' },
          { key: 'player', label: 'Par joueur' },
        ]}
        value={activeTab}
        onChange={k => {
          setActiveTab(k as 'global' | 'player')
          setSelectedTeamId('')
          setOpenTeamId(null)
        }}
        className="mb-4"
      />

      {/* Portée */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <Tabs
          items={[
            { key: 'trainings', label: 'Entraînements' },
            { key: 'matches', label: 'Matchs' },
            { key: 'cumul', label: 'Cumul J+S' },
          ]}
          value={scope}
          onChange={k => {
            setScope(k as Scope)
            setOpenTeamId(null)
          }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => setBdnsModalOpen(true)} leftIcon={<Download size={18} />}>
            Export J+S (BDNS)
          </Button>
          {scope === 'cumul' && (
            <Button variant="secondary" onClick={handleExportExcel} leftIcon={<Download size={18} />}>
              Export Excel
            </Button>
          )}
        </div>
      </div>

      {scope !== 'trainings' && (
        <div style={{ marginBottom: 24 }}>
          <Alert variant="info">
            {defaultPresent
              ? 'Les présences aux matchs sont basées sur les convocations : un joueur convoqué est présent sauf s\'il s\'est désisté.'
              : 'Les présences aux matchs sont provisoirement basées sur les confirmations de convocation, en attendant la saisie des présences après match par les entraîneurs.'}
          </Alert>
        </div>
      )}

      {activeTab === 'global' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <SummaryCard title="Juniors" stats={calcSummary(juniorTeams.map(t => t.id))} />
            <SummaryCard title="Actifs" stats={calcSummary(activeTeams.map(t => t.id))} />
          </div>

          <ColorLegend />

          {juniorTeams.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
                Juniors
              </h2>
              <AccordionList
                items={buildAccordionItems(juniorTeams)}
                openId={openTeamId}
                onToggle={id => setOpenTeamId(prev => (prev === id ? null : id))}
              />
            </div>
          )}

          {activeTeams.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
                Actifs
              </h2>
              <AccordionList
                items={buildAccordionItems(activeTeams)}
                openId={openTeamId}
                onToggle={id => setOpenTeamId(prev => (prev === id ? null : id))}
              />
            </div>
          )}
        </>
      )}

      {activeTab === 'player' && (
        <>
          <ColorLegend />

          <Tabs
            value={playerSubTab}
            onChange={k => setPlayerSubTab(k as 'team' | 'club')}
            items={[
              { key: 'team', label: 'Par équipe' },
              { key: 'club', label: 'Global club' },
            ]}
            className="mb-6"
          />

          {playerSubTab === 'team' && (
            <>
              <div style={{ marginBottom: 24 }}>
                <select
                  value={selectedTeamId}
                  onChange={e => setSelectedTeamId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 8,
                    color: 'var(--text-primary)',
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  <option value="">— Sélectionner une équipe —</option>
                  {teams.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedTeamId && playerStats.length > 0 && (
                <div className="std-table-wrap" style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
                  <table className="std-table">
                    <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                      <tr>
                        <th style={{ position: 'sticky', top: 0, background: 'var(--table-header-bg)' }}>Joueur</th>
                        <th style={{ position: 'sticky', top: 0, background: 'var(--table-header-bg)', textAlign: 'center' }}>
                          Présences
                        </th>
                        <th style={{ position: 'sticky', top: 0, background: 'var(--table-header-bg)', textAlign: 'center' }}>
                          Total activités
                        </th>
                        <th style={{ position: 'sticky', top: 0, background: 'var(--table-header-bg)', textAlign: 'center' }}>
                          %
                        </th>
                        <th style={{ position: 'sticky', top: 0, background: 'var(--table-header-bg)' }}>Assiduité</th>
                      </tr>
                    </thead>
                    <tbody>
                      {playerStats.map(player => (
                        <tr key={player.id}>
                          <td>{player.first_name} {player.last_name}</td>
                          <td style={{ textAlign: 'center', color: 'var(--success)', fontWeight: 600 }}>{player.present}</td>
                          <td style={{ textAlign: 'center' }}>{player.total}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ color: getColorForPct(player.pct), fontWeight: 700 }}>{player.pct}%</span>
                          </td>
                          <td>
                            <PlayerBar pct={player.pct} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {playerSubTab === 'club' && (
            <>
              <div style={{ marginBottom: 16 }}>
                <SearchInput
                  value={globalSearch}
                  onChange={setGlobalSearch}
                  onClear={() => setGlobalSearch('')}
                  placeholder="Rechercher un joueur…"
                  inputSize="md"
                />
              </div>
              {filteredSortedGlobalStats.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: '32px 0' }}>
                  Aucun joueur trouvé
                </p>
              ) : (
              <div className="std-table-wrap" style={{ maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
                <table className="std-table">
                  <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                    <tr>
                      <th onClick={() => handleGlobalSort('name')} style={{ position: 'sticky', top: 0, background: 'var(--table-header-bg)', cursor: 'pointer', userSelect: 'none' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Joueur <GlobalSortIcon field="name" /></span>
                      </th>
                      <th onClick={() => handleGlobalSort('team')} style={{ position: 'sticky', top: 0, background: 'var(--table-header-bg)', cursor: 'pointer', userSelect: 'none' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Équipe <GlobalSortIcon field="team" /></span>
                      </th>
                      <th onClick={() => handleGlobalSort('present')} style={{ position: 'sticky', top: 0, background: 'var(--table-header-bg)', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>Présences <GlobalSortIcon field="present" /></span>
                      </th>
                      <th onClick={() => handleGlobalSort('total')} style={{ position: 'sticky', top: 0, background: 'var(--table-header-bg)', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>Total activités <GlobalSortIcon field="total" /></span>
                      </th>
                      <th onClick={() => handleGlobalSort('pct')} style={{ position: 'sticky', top: 0, background: 'var(--table-header-bg)', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>% <GlobalSortIcon field="pct" /></span>
                      </th>
                      <th onClick={() => handleGlobalSort('pct')} style={{ position: 'sticky', top: 0, background: 'var(--table-header-bg)', cursor: 'pointer', userSelect: 'none' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Assiduité <GlobalSortIcon field="pct" /></span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSortedGlobalStats.map((player: any) => (
                      <tr key={player.id}>
                        <td>{player.first_name} {player.last_name}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{player.team?.name || '—'}</td>
                        <td style={{ textAlign: 'center', color: 'var(--success)', fontWeight: 600 }}>{player.present}</td>
                        <td style={{ textAlign: 'center' }}>{player.total}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ color: getColorForPct(player.pct), fontWeight: 700 }}>{player.pct}%</span>
                        </td>
                        <td>
                          <PlayerBar pct={player.pct} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </>
          )}
        </>
      )}

      <BdnsExportModal
        isOpen={bdnsModalOpen}
        onClose={() => setBdnsModalOpen(false)}
        teams={teams}
      />
    </div>
  )
}
