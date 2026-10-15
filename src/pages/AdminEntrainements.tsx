import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Dumbbell,
  ChevronRight,
  RefreshCw,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTenant } from '../context/TenantContext'
import { Tabs } from '../components/ui/Tabs'
import { Badge } from '../components/ui/Badge'
import { Alert } from '../components/ui/Alert'
import { AccordionList, type AccordionListItem } from '../components/ui/AccordionList'
import SearchInput from '../components/ui/SearchInput'
import Button from '../components/ui/Button'
import { ConfirmModal } from '../components/ConfirmModal'
import { useToast } from '../hooks/useToast'
import { Toast } from '../components/Toast'

interface Team {
  id: string
  name: string
  type: string
  level_rank: number | null
  training_start: string | null
  training_end: string | null
}

interface TerrainSlot {
  id: string
  day: number
  start_time: string
  end_time: string
}

interface TrainingSession {
  id: string
  team_id: string
  session_date: string
  slot_id: string | null
  cancelled: boolean
  cancelled_reason: string | null
  validated_at: string | null
  validated_by: string | null
  attendance_count: number
}

interface TeamStats {
  total: number
  validated: number
  unvalidated: number
  cancelled: number
  upcoming: number
}

const DAY_NAMES: Record<number, string> = {
  1: 'Lundi',
  2: 'Mardi',
  3: 'Mercredi',
  4: 'Jeudi',
  5: 'Vendredi',
  6: 'Samedi',
  7: 'Dimanche',
}

function formatDateFR(date: string) {
  return new Date(date + 'T00:00:00').toLocaleDateString('fr-CH', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatDateShort(date: string) {
  return new Date(date + 'T00:00:00').toLocaleDateString('fr-CH', {
    day: 'numeric',
    month: 'short',
  })
}

export default function AdminEntrainements() {
  const navigate = useNavigate()
  const { clubId } = useTenant()
  const { toast, showToast } = useToast()

  const [loading, setLoading] = useState(true)
  const [teams, setTeams] = useState<Team[]>([])
  const [sessions, setSessions] = useState<TrainingSession[]>([])
  const [slotsByTeam, setSlotsByTeam] = useState<Record<string, TerrainSlot[]>>({})
  const [memberCountByTeam, setMemberCountByTeam] = useState<Record<string, number>>({})

  const [filterType, setFilterType] = useState<'all' | 'junior' | 'active'>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'unvalidated' | 'validated' | 'cancelled'>('all')
  const [search, setSearch] = useState('')
  const [openTeamId, setOpenTeamId] = useState<string | null>(null)
  const [generatingTeamId, setGeneratingTeamId] = useState<string | null>(null)

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean
    title: string
    message: React.ReactNode
    confirmLabel: string
    cancelLabel: string
    confirmStyle: 'danger' | 'warning' | 'primary'
    onConfirm: () => void
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Confirmer',
    cancelLabel: 'Annuler',
    confirmStyle: 'primary',
    onConfirm: () => {},
  })

  const showConfirm = (config: Partial<typeof confirmState>) => {
    setConfirmState(prev => ({ ...prev, ...config, isOpen: true }))
  }
  const hideConfirm = () => {
    setConfirmState(prev => ({ ...prev, isOpen: false }))
  }

  useEffect(() => {
    document.title = 'Entraînements — ClubSphère'
  }, [])

  useEffect(() => {
    loadData()
  }, [clubId])

  const loadData = async () => {
    if (!clubId) return
    try {
      setLoading(true)

      const { data: teamsData } = await supabase
        .from('teams')
        .select('id, name, level_rank, type, training_start, training_end')
        .eq('club_id', clubId)
        .eq('active', true)
        .order('level_rank')
        .order('name')

      const teamsList = (teamsData || []) as Team[]
      setTeams(teamsList)
      const teamIds = teamsList.map(t => t.id)

      if (teamIds.length === 0) {
        setSessions([])
        setSlotsByTeam({})
        setMemberCountByTeam({})
        setLoading(false)
        return
      }

      const { data: sessionsData } = await supabase
        .from('training_sessions')
        .select(`
          id, team_id, session_date, slot_id, cancelled, cancelled_reason,
          validated_at, validated_by,
          attendance:training_attendance(id)
        `)
        .in('team_id', teamIds)
        .order('session_date', { ascending: false })

      setSessions(
        (sessionsData || []).map((s: any) => ({
          id: s.id,
          team_id: s.team_id,
          session_date: s.session_date,
          slot_id: s.slot_id,
          cancelled: s.cancelled || false,
          cancelled_reason: s.cancelled_reason,
          validated_at: s.validated_at,
          validated_by: s.validated_by,
          attendance_count: (s.attendance || []).length,
        }))
      )

      const { data: slotsData } = await supabase
        .from('terrain_slots')
        .select('id, team_id, day, start_time, end_time')
        .in('team_id', teamIds)
        .order('day')

      const slotsMap: Record<string, TerrainSlot[]> = {}
      for (const slot of slotsData || []) {
        const s = slot as any
        if (!slotsMap[s.team_id]) slotsMap[s.team_id] = []
        slotsMap[s.team_id].push({ id: s.id, day: s.day, start_time: s.start_time, end_time: s.end_time })
      }
      setSlotsByTeam(slotsMap)

      const { data: membersData } = await supabase
        .from('members')
        .select('id, team_id')
        .in('team_id', teamIds)

      const countMap: Record<string, number> = {}
      for (const m of membersData || []) {
        const tid = (m as any).team_id
        if (tid) countMap[tid] = (countMap[tid] || 0) + 1
      }
      setMemberCountByTeam(countMap)
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const today = new Date().toISOString().split('T')[0]

  const getTeamStats = (teamId: string): TeamStats => {
    const teamSessions = sessions.filter(s => s.team_id === teamId)
    const cancelled = teamSessions.filter(s => s.cancelled).length
    const active = teamSessions.filter(s => !s.cancelled)
    const validated = active.filter(s => s.validated_at).length
    const upcoming = active.filter(s => s.session_date > today).length
    const past = active.filter(s => s.session_date <= today)
    const unvalidated = past.filter(s => !s.validated_at).length
    return { total: teamSessions.length, validated, unvalidated, cancelled, upcoming }
  }

  const getValidationRate = (teamId: string) => {
    const stats = getTeamStats(teamId)
    const pastActive = stats.validated + stats.unvalidated
    if (pastActive === 0) return 0
    return Math.round((stats.validated / pastActive) * 100)
  }

  const filteredTeams = useMemo(() => {
    let list = teams
    if (filterType !== 'all') list = list.filter(t => t.type === filterType)
    if (search.trim()) {
      const q = search.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      list = list.filter(t => t.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q))
    }
    return list
  }, [teams, filterType, search])

  const juniorTeams = filteredTeams.filter(t => t.type === 'junior')
  const activeTeams = filteredTeams.filter(t => t.type === 'active')

  const globalStats = useMemo(() => {
    const allTeamIds = filteredTeams.map(t => t.id)
    const filtered = sessions.filter(s => allTeamIds.includes(s.team_id))
    const active = filtered.filter(s => !s.cancelled)
    const past = active.filter(s => s.session_date <= today)
    return {
      totalSessions: filtered.length,
      validated: past.filter(s => s.validated_at).length,
      unvalidated: past.filter(s => !s.validated_at).length,
      cancelled: filtered.filter(s => s.cancelled).length,
      upcoming: active.filter(s => s.session_date > today).length,
    }
  }, [sessions, filteredTeams, today])

  const generateSessions = async (team: Team) => {
    if (!team.training_start || !team.training_end) {
      showToast('Période d\'entraînement non définie pour cette équipe.', 'warning')
      return
    }
    const teamSlots = slotsByTeam[team.id]
    if (!teamSlots || teamSlots.length === 0) {
      showToast('Aucun créneau configuré pour cette équipe.', 'warning')
      return
    }

    showConfirm({
      title: 'Générer les séances',
      message: (
        <>
          Générer toutes les séances d'entraînement pour <strong>{team.name}</strong> du{' '}
          {new Date(team.training_start).toLocaleDateString('fr-CH')} au{' '}
          {new Date(team.training_end).toLocaleDateString('fr-CH')} ?
          <br /><br />
          <span style={{ color: 'var(--danger-text)', fontWeight: 600 }}>
            Les séances existantes seront supprimées et recréées.
          </span>
        </>
      ),
      confirmLabel: 'Oui, générer',
      cancelLabel: 'Non',
      confirmStyle: 'warning',
      onConfirm: async () => {
        hideConfirm()
        setGeneratingTeamId(team.id)
        try {
          const { error: deleteError } = await supabase.from('training_sessions').delete().eq('team_id', team.id)
          if (deleteError) { showToast('Erreur suppression : ' + deleteError.message, 'error'); return }

          const { data: userData } = await supabase.auth.getUser()
          const parseLocalDate = (d: string) => { const [y, m, day] = d.split('-').map(Number); return new Date(y, m - 1, day) }
          const startDate = parseLocalDate(team.training_start!)
          const endDate = parseLocalDate(team.training_end!)
          const sessionsToInsert: any[] = []

          for (const slot of teamSlots) {
            const targetDay = Number(slot.day) === 7 ? 0 : Number(slot.day)
            const date = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
            let diff = targetDay - date.getDay(); if (diff < 0) diff += 7
            date.setDate(date.getDate() + diff)

            while (date <= endDate) {
              const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
              sessionsToInsert.push({ team_id: team.id, session_date: dateStr, slot_id: slot.id, created_by: userData.user?.id })
              date.setDate(date.getDate() + 7)
            }
          }

          if (sessionsToInsert.length === 0) { showToast('Aucune séance à générer pour cette période.', 'warning'); return }

          const BATCH_SIZE = 100
          for (let i = 0; i < sessionsToInsert.length; i += BATCH_SIZE) {
            const { error: insertError } = await supabase.from('training_sessions').insert(sessionsToInsert.slice(i, i + BATCH_SIZE))
            if (insertError) { showToast('Erreur génération : ' + insertError.message, 'error'); return }
          }

          showToast(`${sessionsToInsert.length} séance(s) générée(s) pour ${team.name}.`, 'success')
          await loadData()
        } catch (error) {
          console.error('Error generating sessions:', error)
          showToast('Erreur lors de la génération des séances.', 'error')
        } finally {
          setGeneratingTeamId(null)
        }
      },
    })
  }

  const getTeamSessions = (teamId: string) => {
    let teamSessions = sessions.filter(s => s.team_id === teamId)
    if (filterStatus === 'unvalidated') teamSessions = teamSessions.filter(s => !s.cancelled && !s.validated_at && s.session_date <= today)
    else if (filterStatus === 'validated') teamSessions = teamSessions.filter(s => !s.cancelled && !!s.validated_at)
    else if (filterStatus === 'cancelled') teamSessions = teamSessions.filter(s => s.cancelled)
    return teamSessions.sort((a, b) => b.session_date.localeCompare(a.session_date))
  }

  const getSessionStatus = (s: TrainingSession): 'validated' | 'to_validate' | 'cancelled' | 'upcoming' => {
    if (s.cancelled) return 'cancelled'
    if (s.validated_at) return 'validated'
    if (s.session_date <= today) return 'to_validate'
    return 'upcoming'
  }

  const StatusBadge = ({ status }: { status: ReturnType<typeof getSessionStatus> }) => {
    const map = {
      validated: { variant: 'green' as const, label: 'Validée' },
      to_validate: { variant: 'orange' as const, label: 'À valider' },
      cancelled: { variant: 'neutral' as const, label: 'Annulée' },
      upcoming: { variant: 'blue' as const, label: 'À venir' },
    }
    const c = map[status]
    return <Badge variant={c.variant}>{c.label}</Badge>
  }

  const buildAccordionItems = (list: Team[]): AccordionListItem[] =>
    list.map(team => {
      const stats = getTeamStats(team.id)
      const rate = getValidationRate(team.id)
      const memberCount = memberCountByTeam[team.id] || 0
      const teamSlots = slotsByTeam[team.id] || []
      const isGenerating = generatingTeamId === team.id

      return {
        id: team.id,
        title: team.name,
        subtitle: stats.total === 0
          ? 'Aucune séance'
          : `${stats.total} séance${stats.total > 1 ? 's' : ''} · ${memberCount} joueur${memberCount > 1 ? 's' : ''}`,
        bands: [
          { value: stats.validated, color: 'var(--success)', label: `${stats.validated} validée(s)` },
          { value: stats.unvalidated, color: 'var(--warning)', label: `${stats.unvalidated} non validée(s)` },
          { value: stats.upcoming, color: 'var(--accent)', label: `${stats.upcoming} à venir` },
          { value: stats.cancelled, color: 'var(--text-muted)', label: `${stats.cancelled} annulée(s)` },
        ],
        value: stats.validated + stats.unvalidated === 0
          ? <span style={{ color: 'var(--text-muted)' }}>—</span>
          : <span style={{ color: rate >= 75 ? 'var(--success)' : rate >= 50 ? 'var(--warning)' : 'var(--danger)' }}>{rate}%</span>,
        children: (
          <div style={{ paddingTop: 16 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Période</span>
                <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                  {team.training_start && team.training_end
                    ? `${formatDateShort(team.training_start)} — ${formatDateShort(team.training_end)}`
                    : 'Non définie'}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Créneaux</span>
                <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                  {teamSlots.length === 0
                    ? 'Aucun'
                    : teamSlots.map(s => `${DAY_NAMES[s.day]} ${s.start_time.slice(0, 5)}-${s.end_time.slice(0, 5)}`).join(', ')}
                </span>
              </div>
              <span className="admin-entrainements-counter" style={{ fontSize: 13 }}>
                <strong style={{ color: 'var(--success-text)' }}>{stats.validated}</strong> validée(s) /{' '}
                <strong style={{ color: 'var(--warning-text)' }}>{stats.unvalidated}</strong> à valider /{' '}
                <strong>{stats.upcoming}</strong> à venir
              </span>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              <Button variant="primary" size="sm" leftIcon={<ChevronRight size={14} />} onClick={() => navigate(`/admin/equipes/presences/${team.id}`)}>
                Gérer les présences
              </Button>
              <Button variant="secondary" size="sm" leftIcon={<RefreshCw size={14} />} onClick={() => generateSessions(team)} disabled={isGenerating || !team.training_start || !team.training_end}>
                {isGenerating ? 'Génération...' : 'Générer les séances'}
              </Button>
            </div>

            {stats.unvalidated > 0 && (
              <div style={{ marginBottom: 12 }}>
                <Alert variant="warning">
                  {stats.unvalidated} séance{stats.unvalidated > 1 ? 's' : ''} passée{stats.unvalidated > 1 ? 's' : ''} non validée{stats.unvalidated > 1 ? 's' : ''}.{' '}
                  <button onClick={() => navigate(`/admin/equipes/presences/${team.id}`, { state: { showUnvalidated: true } })} style={{ textDecoration: 'underline', fontWeight: 600, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>
                    Voir
                  </button>
                </Alert>
              </div>
            )}

            {(() => {
              const teamSessions = getTeamSessions(team.id)
              if (teamSessions.length === 0) return <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>Aucune séance{filterStatus !== 'all' ? ' pour ce filtre' : ''}</p>
              const display = teamSessions.slice(0, 20)
              return (
                <div className="std-table-wrap" style={{ maxHeight: 360, overflowY: 'auto', boxShadow: 'none' }}>
                  <table className="std-table">
                    <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                      <tr>
                        <th style={{ position: 'sticky', top: 0, background: 'var(--table-header-bg)' }}>Date</th>
                        <th style={{ position: 'sticky', top: 0, background: 'var(--table-header-bg)', textAlign: 'center' }}>Présences</th>
                        <th style={{ position: 'sticky', top: 0, background: 'var(--table-header-bg)', textAlign: 'center' }}>Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {display.map(s => {
                        const status = getSessionStatus(s)
                        return (
                          <tr key={s.id} style={{ cursor: 'pointer', opacity: s.cancelled ? 0.5 : 1 }} onClick={() => navigate(`/admin/equipes/presences/${team.id}`)}>
                            <td style={{ textDecoration: s.cancelled ? 'line-through' : 'none' }}>{formatDateFR(s.session_date)}</td>
                            <td style={{ textAlign: 'center' }}>
                              {s.attendance_count > 0 ? <span style={{ fontWeight: 600 }}>{s.attendance_count} / {memberCount}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                            </td>
                            <td style={{ textAlign: 'center' }}><StatusBadge status={status} /></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {teamSessions.length > 20 && (
                    <div style={{ textAlign: 'center', padding: '12px 0' }}>
                      <button onClick={() => navigate(`/admin/equipes/presences/${team.id}`)} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
                        Voir les {teamSessions.length} séances
                      </button>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        ),
      }
    })

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[var(--accent)] mx-auto" />
      </div>
    )
  }

  return (
    <div style={{ padding: 32, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="text-2xl font-bold flex items-center gap-3" style={{ marginBottom: 8, color: 'var(--text-primary)' }}>
          <Dumbbell className="w-5 h-5" />
          Entraînements
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Gestion et suivi des séances d'entraînement par équipe</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total séances', value: globalStats.totalSessions, color: 'var(--text-primary)' },
          { label: 'Validées', value: globalStats.validated, color: 'var(--success)' },
          { label: 'À valider', value: globalStats.unvalidated, color: globalStats.unvalidated > 0 ? 'var(--warning)' : 'var(--text-primary)' },
          { label: 'À venir', value: globalStats.upcoming, color: 'var(--accent)' },
        ].map(card => (
          <div key={card.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{card.label}</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 24 }}>
        <Tabs
          items={[{ key: 'all', label: 'Toutes' }, { key: 'junior', label: 'Juniors' }, { key: 'active', label: 'Actifs' }]}
          value={filterType}
          onChange={k => { setFilterType(k as typeof filterType); setOpenTeamId(null) }}
        />
        <Tabs
          items={[
            { key: 'all', label: 'Tous les statuts' },
            { key: 'unvalidated', label: `Non validées${globalStats.unvalidated > 0 ? ` (${globalStats.unvalidated})` : ''}` },
            { key: 'validated', label: 'Validées' },
            { key: 'cancelled', label: 'Annulées' },
          ]}
          value={filterStatus}
          onChange={k => setFilterStatus(k as typeof filterStatus)}
        />
        <div style={{ flex: 1, minWidth: 200 }}>
          <SearchInput value={search} onChange={setSearch} onClear={() => setSearch('')} placeholder="Rechercher une équipe…" inputSize="sm" />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center', padding: '10px 16px', background: 'var(--bg-hover)', border: '1px solid var(--border-color)', borderRadius: 8, marginBottom: 24 }}>
        {[
          { color: 'var(--success)', label: 'Validée' },
          { color: 'var(--warning)', label: 'Non validée' },
          { color: 'var(--accent)', label: 'À venir' },
          { color: 'var(--text-muted)', label: 'Annulée' },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: item.color, display: 'inline-block' }} />
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{item.label}</span>
          </div>
        ))}
      </div>

      {(() => {
        const teamsNoPeriod = filteredTeams.filter(t => !t.training_start || !t.training_end)
        if (teamsNoPeriod.length === 0) return null
        return (
          <div style={{ marginBottom: 24 }}>
            <Alert variant="warning">
              <strong>{teamsNoPeriod.length} équipe{teamsNoPeriod.length > 1 ? 's' : ''}</strong> sans période d'entraînement définie : {teamsNoPeriod.map(t => t.name).join(', ')}.
              Configurez les dates dans la gestion des équipes.
            </Alert>
          </div>
        )
      })()}

      {(() => {
        const teamsNoSlot = filteredTeams.filter(t => !(slotsByTeam[t.id]?.length > 0))
        if (teamsNoSlot.length === 0) return null
        return (
          <div style={{ marginBottom: 24 }}>
            <Alert variant="info">
              <strong>{teamsNoSlot.length} équipe{teamsNoSlot.length > 1 ? 's' : ''}</strong> sans créneau d'entraînement : {teamsNoSlot.map(t => t.name).join(', ')}.
              Configurez les créneaux dans la page Terrains.
            </Alert>
          </div>
        )
      })()}

      {(filterType === 'all' || filterType === 'junior') && juniorTeams.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Juniors</h2>
          <AccordionList items={buildAccordionItems(juniorTeams)} openId={openTeamId} onToggle={id => setOpenTeamId(prev => prev === id ? null : id)} />
        </div>
      )}

      {(filterType === 'all' || filterType === 'active') && activeTeams.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Actifs</h2>
          <AccordionList items={buildAccordionItems(activeTeams)} openId={openTeamId} onToggle={id => setOpenTeamId(prev => prev === id ? null : id)} />
        </div>
      )}

      {filteredTeams.length === 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          Aucune équipe trouvée
        </div>
      )}

      <ConfirmModal {...confirmState} onCancel={hideConfirm} />
      <Toast toast={toast} />
    </div>
  )
}
