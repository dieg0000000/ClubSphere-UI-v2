import { useEffect, useRef, useState } from 'react'
import { ChartBar as BarChart3, Circle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Tabs } from '../components/ui/Tabs'
import { AttendanceDonut } from '../components/AttendanceDonut'
import { Badge } from '../components/ui/Badge'

interface Session {
  id: string
  team_id: string
  session_date: string
  cancelled: boolean
  validated_at: string | null
  validated_by: string | null
  attendance: Array<{ member_id: string; present: boolean; status: string | null }>
}

interface Team {
  id: string
  name: string
  type: string
  training_start: string | null
  category: { name: string } | null
}

interface Player {
  id: string
  first_name: string
  last_name: string
  team_id: string
  team?: { name: string }
}

interface StatBundle {
  totalSessions: number
  totalPresences: number
  totalPossible: number
  globalPct: number
}

function SummaryCard({ title, stats, getColor }: { title: string; stats: StatBundle; getColor: (p: number) => string }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: '16px',
      padding: '28px',
    }}>
      <div style={{
        color: 'var(--text-muted)',
        fontSize: '13px',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        marginBottom: '8px',
        fontWeight: 600,
      }}>
        {title}
      </div>
      <div style={{
        fontSize: '56px',
        fontWeight: '900',
        color: getColor(stats.globalPct),
        lineHeight: 1,
      }}>
        {stats.globalPct}%
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          {stats.totalPresences} présences / {stats.totalPossible} possibles
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          {stats.totalSessions} séances
        </span>
      </div>
    </div>
  )
}

interface DonutStat {
  sessionCount: number
  presentReal: number
  absentJustified: number
  absentUnjustified: number
  totalRecorded: number
  rate: number
}

function TeamSection({
  title,
  teams,
  calculateTeamDonut,
  onSelect,
}: {
  title: string
  teams: Team[]
  calculateTeamDonut: (id: string) => DonutStat
  onSelect: (id: string) => void
}) {
  if (teams.length === 0) return null
  return (
    <div style={{ marginBottom: '32px' }}>
      <h2 style={{
        color: 'var(--text-primary)',
        fontSize: '18px',
        fontWeight: 700,
        marginBottom: '16px',
      }}>
        {title}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {teams.map(team => {
          const stat = calculateTeamDonut(team.id)
          const empty = stat.sessionCount === 0 || stat.totalRecorded === 0
          return (
            <button
              key={team.id}
              type="button"
              onClick={() => onSelect(team.id)}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '20px',
                cursor: 'pointer',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                color: 'inherit',
                transition: 'transform 0.15s ease, border-color 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)' }}
            >
              <div style={{
                color: 'var(--text-primary)',
                fontWeight: 600,
                fontSize: '13px',
                lineHeight: 1.3,
                minHeight: 34,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}>
                {team.name}
              </div>
              <AttendanceDonut
                presentReal={stat.presentReal}
                absentJustified={stat.absentJustified}
                absentUnjustified={stat.absentUnjustified}
                centerLabel={empty ? '—' : `${stat.rate}%`}
                empty={empty}
              />
              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                {stat.sessionCount === 0
                  ? 'Aucune séance'
                  : `${stat.sessionCount} séance${stat.sessionCount > 1 ? 's' : ''}`}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function AdminJSPresencesOld() {
  const [activeTab, setActiveTab] = useState<'global' | 'player'>('global')
  const [playerSubTab, setPlayerSubTab] = useState<'team' | 'club'>('team')
  const [sessions, setSessions] = useState<Session[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [playerCountByTeam, setPlayerCountByTeam] = useState<Record<string, number>>({})
  const detailRef = useRef<HTMLDivElement>(null)

  const handleSelectTeam = (id: string) => {
    setSelectedTeamId(id)
    setTimeout(() => {
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (selectedTeamId) {
      loadTeamPlayers(selectedTeamId)
    }
  }, [selectedTeamId])

  const loadData = async () => {
    try {
      const today = new Date().toISOString().split('T')[0]

      const { data: teamsData } = await supabase
        .from('teams')
        .select('id, name, type, training_start')
        .in('type', ['junior', 'active'])
        .eq('active', true)

      const teamsList = (teamsData || []) as Team[]
      setTeams(teamsList)

      const teamIds = teamsList.map(t => t.id)

      const { data: sessionsData } = teamIds.length === 0
        ? { data: [] as any[] }
        : await supabase
            .from('training_sessions')
            .select(`
              id, team_id, session_date, cancelled,
              validated_at, validated_by,
              attendance:training_attendance(member_id, present, status)
            `)
            .in('team_id', teamIds)
            .eq('cancelled', false)
            .lte('session_date', today)
            .order('session_date', { ascending: false })

      // Filter sessions by training_start per team
      const validSessions = (sessionsData || []).filter(s => {
        const team = teamsList.find(t => t.id === s.team_id)
        if (!team) return false
        if (!team.training_start) return true
        return s.session_date >= team.training_start
      })

      setSessions(validSessions)

      // Count ALL members with team_id, no status filter
      const { data: allTeamMembers } = await supabase
        .from('members')
        .select('id, team_id')
        .in('team_id', teamsList.map(t => t.id))

      const countMap: Record<string, number> = {}
      allTeamMembers?.forEach(m => {
        if (m.team_id) {
          countMap[m.team_id] = (countMap[m.team_id] || 0) + 1
        }
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

      setPlayers(data || [])
    } catch (error) {
      console.error('Error loading players:', error)
    }
  }

  const formatDateFR = (date: string) => {
    return new Date(date).toLocaleDateString('fr-CH', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  const calculateStatsForTeams = (teamIds: string[]) => {
    const idSet = new Set(teamIds)
    const filtered = sessions.filter(s => idSet.has(s.team_id))
    const totalSessions = filtered.length
    const totalPresences = filtered.reduce((acc, s) =>
      acc + s.attendance.filter(a => a.status === 'present_real').length, 0)
    const totalPossible = filtered.reduce((acc, s) => {
      const teamPlayerCount = playerCountByTeam[s.team_id] || 0
      return acc + teamPlayerCount
    }, 0)
    const globalPct = totalPossible > 0
      ? Math.round(totalPresences / totalPossible * 100)
      : 0
    return { totalSessions, totalPresences, totalPossible, globalPct }
  }

  const calculateTeamDonut = (teamId: string) => {
    const teamSessions = sessions.filter(s => s.team_id === teamId)
    let presentReal = 0
    let absentJustified = 0
    let absentUnjustified = 0
    for (const s of teamSessions) {
      for (const a of s.attendance) {
        if (a.status === 'present_real') presentReal++
        else if (a.status === 'absent_justified') absentJustified++
        else if (a.status === 'absent_unjustified') absentUnjustified++
      }
    }
    const totalRecorded = presentReal + absentJustified + absentUnjustified
    const rate = totalRecorded > 0 ? Math.round((presentReal / totalRecorded) * 100) : 0
    return {
      sessionCount: teamSessions.length,
      presentReal,
      absentJustified,
      absentUnjustified,
      totalRecorded,
      rate,
    }
  }

  const getTeamSessions = (teamId: string) => {
    return sessions
      .filter(s => s.team_id === teamId)
      .sort((a, b) => new Date(b.session_date).getTime() - new Date(a.session_date).getTime())
  }

  const calculatePlayerStats = (teamId: string) => {
    const teamSessions = sessions.filter(s => s.team_id === teamId)

    return players.map(player => {
      const present = teamSessions.filter(s =>
        s.attendance.some(a => a.member_id === player.id && a.status === 'present_real')
      ).length
      const total = teamSessions.filter(s =>
        s.attendance.some(a => a.member_id === player.id)
      ).length
      const pct = total > 0 ? Math.round(present / total * 100) : 0

      return { ...player, present, total, pct }
    }).sort((a, b) => b.pct - a.pct)
  }

  const calculateGlobalPlayerStats = async () => {
    const { data: allPlayers } = await supabase
      .from('members')
      .select('id, first_name, last_name, team_id, team:teams(name)')
      .eq('licence_status', 'actif')
      .in('team_id', teams.map(t => t.id))

    if (!allPlayers) return []

    return allPlayers.map(player => {
      const present = sessions.filter(s =>
        s.attendance.some(a => a.member_id === player.id && a.status === 'present_real')
      ).length
      const total = sessions.filter(s =>
        s.attendance.some(a => a.member_id === player.id)
      ).length
      const pct = total > 0 ? Math.round(present / total * 100) : 0

      return { ...player, present, total, pct }
    })
      .filter(p => p.total > 0)
      .sort((a, b) => b.pct - a.pct)
  }

  const [globalPlayerStats, setGlobalPlayerStats] = useState<any[]>([])

  useEffect(() => {
    if (playerSubTab === 'club' && teams.length > 0) {
      calculateGlobalPlayerStats().then(setGlobalPlayerStats)
    }
  }, [playerSubTab, teams, sessions])

  const getColorForPct = (pct: number) => {
    if (pct >= 75) return 'var(--success)'
    if (pct >= 50) return 'var(--warning)'
    return 'var(--danger)'
  }

  const getSessionStatus = (session: Session): 'validated' | 'in_progress' | 'not_filled' => {
    if (session.validated_at) return 'validated'
    if (session.attendance.length > 0) return 'in_progress'
    return 'not_filled'
  }

  const STATUS_CONFIG = {
    validated: {
      label: 'Validée',
      color: 'var(--success-text)',
      bg: 'var(--success-soft)',
      border: 'var(--success)'
    },
    in_progress: {
      label: 'En cours',
      color: 'var(--info-text)',
      bg: 'var(--info-soft)',
      border: 'var(--accent)'
    },
    not_filled: {
      label: 'Non saisie',
      color: 'var(--warning-text)',
      bg: 'var(--warning-soft)',
      border: 'var(--warning)'
    }
  }

  const StatusBadge = ({ status }: { status: 'validated' | 'in_progress' | 'not_filled' }) => {
    const variantMap: Record<string, 'green' | 'blue' | 'orange'> = {
      validated: 'green',
      in_progress: 'blue',
      not_filled: 'orange',
    }
    const iconMap: Record<string, string> = {
      validated: '✓',
      in_progress: '✎',
      not_filled: '!',
    }
    const config = STATUS_CONFIG[status]
    return (
      <Badge variant={variantMap[status]} icon={<span>{iconMap[status]}</span>}>
        {config.label}
      </Badge>
    )
  }

  const juniorTeams = teams.filter(t => t.type === 'junior')
  const activeTeams = teams.filter(t => t.type === 'active')
  const juniorStats = calculateStatsForTeams(juniorTeams.map(t => t.id))
  const activeStats = calculateStatsForTeams(activeTeams.map(t => t.id))
  const teamSessions = selectedTeamId ? getTeamSessions(selectedTeamId) : []
  const playerStats = selectedTeamId ? calculatePlayerStats(selectedTeamId) : []

  const ColorLegend = () => (
    <div style={{
      display: 'flex',
      gap: '24px',
      justifyContent: 'center',
      padding: '16px',
      background: 'var(--bg-hover)',
      borderRadius: '8px',
      marginBottom: '24px',
      fontSize: '13px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Circle className="w-4 h-4" style={{ color: 'var(--success)', fill: 'var(--success)' }} />
        <span style={{ color: 'var(--text-muted)' }}>≥ 75% — Bonne assiduité</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Circle className="w-4 h-4" style={{ color: 'var(--warning)', fill: 'var(--warning)' }} />
        <span style={{ color: 'var(--text-muted)' }}>≥ 50% — Assiduité moyenne</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Circle className="w-4 h-4" style={{ color: 'var(--danger)', fill: 'var(--danger)' }} />
        <span style={{ color: 'var(--text-muted)' }}>&lt; 50% — Assiduité insuffisante</span>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div style={{ padding: '32px', textAlign: 'center' }}>
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[var(--accent)] mx-auto"></div>
      </div>
    )
  }

  return (
    <div style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto' }}>
      <style>{`
        .jspresences-sticky-head thead th { position: relative; }
        .jspresences-sticky-head thead th::after {
          content: '';
          position: absolute;
          left: 0; right: 0; bottom: -8px;
          height: 8px;
          pointer-events: none;
          background: linear-gradient(to bottom, rgba(0,0,0,0.28), rgba(0,0,0,0));
        }
      `}</style>
      <div style={{ marginBottom: '32px' }}>
        <h1 className="text-2xl font-bold flex items-center gap-3" style={{ marginBottom: '8px', color: 'var(--text-primary)' }}>
          <BarChart3 className="w-5 h-5" />
          J+S Présences
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Suivi assiduité juniors
        </p>
      </div>

      <Tabs
        items={[
          { key: 'global', label: 'Vue globale' },
          { key: 'player', label: 'Par joueur' },
        ]}
        value={activeTab}
        onChange={(k) => { setActiveTab(k as 'global' | 'player'); setSelectedTeamId('') }}
        className="mb-8"
      />

      {activeTab === 'global' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <SummaryCard title="Juniors" stats={juniorStats} getColor={getColorForPct} />
            <SummaryCard title="Actifs" stats={activeStats} getColor={getColorForPct} />
          </div>

          <ColorLegend />

          <TeamSection
            title="Juniors"
            teams={juniorTeams}
            calculateTeamDonut={calculateTeamDonut}
            onSelect={handleSelectTeam}
          />

          <TeamSection
            title="Actifs"
            teams={activeTeams}
            calculateTeamDonut={calculateTeamDonut}
            onSelect={handleSelectTeam}
          />

          {selectedTeamId && (
            <div ref={detailRef}>
              <button
                type="button"
                onClick={() => {
                  setSelectedTeamId('')
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: 'transparent', border: '1px solid var(--border-color)',
                  borderRadius: '8px', padding: '8px 14px', marginBottom: '16px',
                  color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                ↑ Choisir une autre équipe
              </button>
            <>
              {(() => {
                const team = teams.find(t => t.id === selectedTeamId)
                const teamSession = teamSessions
                const teamPlayerCount = playerCountByTeam[selectedTeamId] || 0
                const present = teamSession.reduce((acc, s) =>
                  acc + s.attendance.filter(a => a.status === 'present_real').length, 0)
                const possible = teamSession.length * teamPlayerCount
                const pct = possible > 0 ? Math.round(present / possible * 100) : 0

                return (
                  <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    padding: '20px',
                    marginBottom: '24px',
                    display: 'flex',
                    justifyContent: 'space-around',
                    alignItems: 'center',
                    textAlign: 'center'
                  }}>
                    <div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' }}>
                        Équipe
                      </div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: '700', fontSize: '16px' }}>
                        {team?.name}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' }}>
                        Séances
                      </div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: '700', fontSize: '16px' }}>
                        {teamSession.length}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' }}>
                        Présence moyenne
                      </div>
                      <div style={{
                        color: getColorForPct(pct),
                        fontWeight: '900',
                        fontSize: '24px'
                      }}>
                        {pct}%
                      </div>
                    </div>
                  </div>
                )
              })()}

              <div className="std-table-wrap" style={{ maxHeight: 'calc(100vh - 240px)', overflowY: 'auto', overflowX: 'auto' }}>
                <table className="std-table jspresences-sticky-head" style={{ borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                    <tr>
                      <th style={{ padding: '16px', textAlign: 'left', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>Date</th>
                      <th style={{ padding: '16px', textAlign: 'center', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>Présents</th>
                      <th style={{ padding: '16px', textAlign: 'center', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>Absents</th>
                      <th style={{ padding: '16px', textAlign: 'center', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>%</th>
                      <th style={{ padding: '16px', textAlign: 'center', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamSessions.map((session, idx) => {
                      const present = session.attendance.filter(a => a.status === 'present_real').length
                      const totalPlayers = playerCountByTeam[session.team_id] || 0
                      const absent = Math.max(0, totalPlayers - present)
                      const pct = totalPlayers > 0
                        ? Math.min(100, Math.round(present / totalPlayers * 100))
                        : 0
                      const hasRecords = session.attendance.length > 0
                      const isSaisie = hasRecords

                      return (
                        <tr key={session.id}>
                          <td style={{ padding: '16px', color: 'var(--text-primary)', fontSize: '14px' }}>
                            {formatDateFR(session.session_date)}
                          </td>
                          <td style={{
                            padding: '16px',
                            textAlign: 'center',
                            color: 'var(--success)',
                            fontWeight: '600',
                            fontSize: '14px'
                          }}>
                            {present}
                          </td>
                          <td style={{
                            padding: '16px',
                            textAlign: 'center',
                            color: 'var(--danger)',
                            fontWeight: '600',
                            fontSize: '14px'
                          }}>
                            {absent}
                          </td>
                          <td style={{ padding: '16px', textAlign: 'center' }}>
                            <span style={{
                              color: getColorForPct(pct),
                              fontWeight: '700',
                              fontSize: '14px'
                            }}>
                              {pct}%
                            </span>
                          </td>
                          <td style={{ padding: '16px', textAlign: 'center', fontSize: '14px' }}>
                            <StatusBadge status={getSessionStatus(session)} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
            </div>
          )}
        </>
      )}

      {activeTab === 'player' && (
        <>
          <ColorLegend />

          <Tabs
            value={playerSubTab}
            onChange={(k) => setPlayerSubTab(k as 'team' | 'club')}
            items={[
              { key: 'team', label: 'Par équipe' },
              { key: 'club', label: 'Global club' },
            ]}
            className="mb-6"
          />

          {playerSubTab === 'team' && (
            <>
              <div style={{ marginBottom: '24px' }}>
                <select
                  value={selectedTeamId}
                  onChange={e => setSelectedTeamId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  <option value="">— Sélectionner une équipe —</option>
                  {teams.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              {selectedTeamId && playerStats.length > 0 && (
                <div className="std-table-wrap" style={{ maxHeight: 'calc(100vh - 240px)', overflowY: 'auto', overflowX: 'auto' }}>
                  <table className="std-table jspresences-sticky-head" style={{ borderCollapse: 'collapse' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                      <tr>
                        <th style={{ padding: '16px', textAlign: 'left', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>Joueur</th>
                        <th style={{ padding: '16px', textAlign: 'center', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>Présences</th>
                        <th style={{ padding: '16px', textAlign: 'center', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>Total séances</th>
                        <th style={{ padding: '16px', textAlign: 'center', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>%</th>
                        <th style={{ padding: '16px', textAlign: 'left', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>Assiduité</th>
                      </tr>
                    </thead>
                    <tbody>
                      {playerStats.map((player, idx) => (
                        <tr key={player.id}>
                          <td style={{ padding: '16px', color: 'var(--text-primary)', fontSize: '14px' }}>
                            {player.first_name} {player.last_name}
                          </td>
                          <td style={{
                            padding: '16px',
                            textAlign: 'center',
                            color: 'var(--success)',
                            fontWeight: '600',
                            fontSize: '14px'
                          }}>
                            {player.present}
                          </td>
                          <td style={{
                            padding: '16px',
                            textAlign: 'center',
                            color: 'var(--text-primary)',
                            fontSize: '14px'
                          }}>
                            {player.total}
                          </td>
                          <td style={{ padding: '16px', textAlign: 'center' }}>
                            <span style={{
                              color: getColorForPct(player.pct),
                              fontWeight: '700',
                              fontSize: '14px'
                            }}>
                              {player.pct}%
                            </span>
                          </td>
                          <td style={{ padding: '16px' }}>
                            <div style={{
                              background: 'var(--bg-hover)',
                              borderRadius: '99px',
                              height: '8px',
                              width: '100%',
                              maxWidth: '200px'
                            }}>
                              <div style={{
                                background: getColorForPct(player.pct),
                                borderRadius: '99px',
                                height: '8px',
                                width: `${player.pct}%`
                              }} />
                            </div>
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
            <div className="std-table-wrap" style={{ maxHeight: 'calc(100vh - 240px)', overflowY: 'auto', overflowX: 'auto' }}>
              <table className="std-table jspresences-sticky-head" style={{ borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  <tr>
                    <th style={{ padding: '16px', textAlign: 'left', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>Joueur</th>
                    <th style={{ padding: '16px', textAlign: 'left', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>Équipe</th>
                    <th style={{ padding: '16px', textAlign: 'center', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>Présences</th>
                    <th style={{ padding: '16px', textAlign: 'center', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>Total séances</th>
                    <th style={{ padding: '16px', textAlign: 'center', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>%</th>
                    <th style={{ padding: '16px', textAlign: 'left', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>Assiduité</th>
                  </tr>
                </thead>
                <tbody>
                  {globalPlayerStats.map((player, idx) => (
                    <tr key={player.id}>
                      <td style={{ padding: '16px', color: 'var(--text-primary)', fontSize: '14px' }}>
                        {player.first_name} {player.last_name}
                      </td>
                      <td style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '13px' }}>
                        {player.team?.name || '—'}
                      </td>
                      <td style={{
                        padding: '16px',
                        textAlign: 'center',
                        color: 'var(--success)',
                        fontWeight: '600',
                        fontSize: '14px'
                      }}>
                        {player.present}
                      </td>
                      <td style={{
                        padding: '16px',
                        textAlign: 'center',
                        color: 'var(--text-primary)',
                        fontSize: '14px'
                      }}>
                        {player.total}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'center' }}>
                        <span style={{
                          color: getColorForPct(player.pct),
                          fontWeight: '700',
                          fontSize: '14px'
                        }}>
                          {player.pct}%
                        </span>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{
                          background: 'var(--bg-hover)',
                          borderRadius: '99px',
                          height: '8px',
                          width: '100%',
                          maxWidth: '200px'
                        }}>
                          <div style={{
                            background: getColorForPct(player.pct),
                            borderRadius: '99px',
                            height: '8px',
                            width: `${player.pct}%`
                          }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
