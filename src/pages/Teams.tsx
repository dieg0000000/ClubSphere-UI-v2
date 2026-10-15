import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { TeamCategory, STAFF_ROLE_LABELS } from '../types'
import { X, Users, Calendar, MapPin, User, TriangleAlert as AlertTriangle } from 'lucide-react'
import useEscapeKey from '../hooks/useEscapeKey'
import GroupementBadge from '../components/GroupementBadge'
import { Badge, type BadgeVariant } from '../components/ui/Badge'
import { Tabs } from '../components/ui/Tabs'
import { reportLoadError } from '../utils/reportLoadError'
import { LoadError } from '../components/LoadError'

interface Member {
  id: string
  first_name: string
  last_name: string
  birth_date: string
  position?: string
  licence_status: string
  status?: string | null
  groupement_id?: string | null
  groupements?: { id: string; name: string } | null
}

interface TrainingSlot {
  day: number | string
  start_time: string
  end_time: string
  space_used?: string
  terrain?: {
    name: string
  }
  half?: {
    name: string
    label: string
  }
}

interface CardSlot {
  team_id: string
  day: number | string
  start_time: string
  end_time: string
}

interface Team {
  id: string
  name: string
  type: 'junior' | 'active'
  season: string
  category_id?: string
  training_days?: string[]
  training_time?: string
  training_location?: string
  team_categories?: TeamCategory
  staff?: any[]
  slots?: CardSlot[]
  training_start?: string
  training_end?: string
}

const DAY_NAMES: Record<number | string, string> = {
  1: 'Lundi',
  2: 'Mardi',
  3: 'Mercredi',
  4: 'Jeudi',
  5: 'Vendredi',
  6: 'Samedi',
  7: 'Dimanche',
  // Also handle string versions just in case:
  'Lundi': 'Lundi',
  'Mardi': 'Mardi',
  'Mercredi': 'Mercredi',
  'Jeudi': 'Jeudi',
  'Vendredi': 'Vendredi',
  'Samedi': 'Samedi',
  'Dimanche': 'Dimanche'
}

const getDayName = (day: number | string): string => {
  return DAY_NAMES[day] || `Jour ${day}`
}

export function Teams() {
  const [juniorTeams, setJuniorTeams] = useState<Team[]>([])
  const [activeTeams, setActiveTeams] = useState<Team[]>([])
  const [categories, setCategories] = useState<TeamCategory[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [detailTab, setDetailTab] = useState<'info' | 'players'>('info')
  const [teamPlayers, setTeamPlayers] = useState<Member[]>([])
  const [trainingSlots, setTrainingSlots] = useState<TrainingSlot[]>([])
  const [playerCount, setPlayerCount] = useState<Record<string, number>>({})
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  useEscapeKey(() => {
    if (selectedTeam) {
      setSelectedTeam(null)
    }
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoadFailed(false)
      setLoading(true)

      const { data: teams, error } = await supabase
        .from('teams')
        .select(`
          id, name, level_rank, type, season, active,
          category_id,
          coach_id,
          assistant_coach_id,
          training_start, training_end,
          team_categories(id, name, type, display_order)
        `)
        .eq('active', true)
        .order('level_rank')
        .order('name')

      console.log('Public teams debug:', teams, error)

      if (error) {
        console.error('Query error:', error)
        throw error
      }

      const { data: allStaff } = await supabase
        .from('team_staff')
        .select('team_id, role, sort_order, coaches(first_name, last_name, email, phone, coaching_qualifications(name, description))')
        .order('sort_order')

      const staffByTeam = new Map<string, any[]>()
      for (const row of (allStaff || []) as any[]) {
        if (!row.coaches) continue
        const tid = row.team_id
        if (!staffByTeam.has(tid)) staffByTeam.set(tid, [])
        staffByTeam.get(tid)!.push({ ...row.coaches, role: row.role, sort_order: row.sort_order })
      }

      const { data: allSlots } = await supabase
        .from('terrain_slots')
        .select('team_id, day, start_time, end_time')
        .order('day')

      const teamsWithCoaches = (teams || []).map(team => ({
        ...team,
        staff: staffByTeam.get(team.id) || [],
        slots: allSlots?.filter(s => s.team_id === team.id) || []
      }))

      const juniors = teamsWithCoaches.filter(t => t.type === 'junior') as any as Team[]
      const actives = teamsWithCoaches.filter(t => t.type === 'active') as any as Team[]

      setJuniorTeams(juniors)
      setActiveTeams(actives)

      const uniqueCategories = teamsWithCoaches
        .map((t: any) => t.team_categories)
        .filter((cat: any) => !!cat)
        .filter((cat: any, index: number, self: any[]) =>
          index === self.findIndex((c: any) => c.id === cat.id)
        )
        .sort((a: any, b: any) => a.display_order - b.display_order) as TeamCategory[]

      setCategories(uniqueCategories)

      const counts: Record<string, number> = {}
      await Promise.all(
        teamsWithCoaches.map(async (team) => {
          const [pRes, sRes] = await Promise.all([
            supabase.from('members').select('*', { count: 'exact', head: true }).eq('team_id', team.id),
            supabase.from('team_members').select('*', { count: 'exact', head: true }).eq('team_id', team.id),
          ])
          counts[team.id] = (pRes.count || 0) + (sRes.count || 0)
        })
      )
      setPlayerCount(counts)
    } catch (error) {
      reportLoadError('Teams', error)
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }

  const filterTeams = (teams: Team[]) => {
    if (selectedCategory === 'all') return teams
    return teams.filter(team => team.category_id === selectedCategory)
  }

  const openTeamDetail = async (team: Team) => {
    setSelectedTeam(team)
    setDetailTab('info')
    setLoadingDetail(true)

    try {
      const { data: players } = await supabase
        .from('members')
        .select('id, first_name, last_name, birth_date, position, licence_status, status, groupement_id, groupements(id, name)')
        .eq('team_id', team.id)
        .order('last_name')

      const normalized = (players || []).map((p: any) => ({
        ...p,
        groupements: Array.isArray(p.groupements) ? p.groupements[0] : p.groupements,
      }))
      setTeamPlayers(normalized)

      const { data: slots } = await supabase
        .from('terrain_slots')
        .select(`
          day, start_time, end_time, space_used,
          terrain:terrains(name),
          half:terrain_halves(name, label)
        `)
        .eq('team_id', team.id)
        .order('day')

      setTrainingSlots((slots || []) as any as TrainingSlot[])
    } catch (error) {
      console.error('Error loading team details:', error)
    } finally {
      setLoadingDetail(false)
    }
  }

  const closeDetail = () => {
    setSelectedTeam(null)
    setTeamPlayers([])
    setTrainingSlots([])
  }

  const getCategoryBadgeStyle = (teamType: string) => {
    if (teamType === 'junior') {
      return {
        background: 'var(--info-soft)',
        color: 'var(--info-text)',
        border: '1px solid var(--info-text)',
        borderRadius: '99px',
        padding: '3px 10px',
        fontSize: '11px',
        fontWeight: '700',
        whiteSpace: 'nowrap',
        flexShrink: 0
      }
    }
    // active
    return {
      background: 'var(--success-soft)',
      color: 'var(--success-text)',
      border: '1px solid var(--success-text)',
      borderRadius: '99px',
      padding: '3px 10px',
      fontSize: '11px',
      fontWeight: '700',
      whiteSpace: 'nowrap',
      flexShrink: 0
    }
  }

  const TeamCard = ({ team }: { team: Team }) => {
    const dayAbbreviations: Record<string, string> = {
      'Lundi': 'Lu',
      'Mardi': 'Ma',
      'Mercredi': 'Me',
      'Jeudi': 'Je',
      'Vendredi': 'Ve',
      'Samedi': 'Sa',
      'Dimanche': 'Di'
    }

    const formatSlots = (slots: CardSlot[]) => {
      if (!slots || slots.length === 0) return null
      return slots.map(s => {
        const start = s.start_time?.substring(0, 5)
        const end = s.end_time?.substring(0, 5)
        return `${getDayName(s.day)} ${start}-${end}`
      }).join(' · ')
    }

    return (
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          padding: '14px 16px',
          cursor: 'pointer',
          transition: 'border-color 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--primary)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-color)'
        }}
        onClick={() => openTeamDetail(team)}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '12px',
          marginBottom: '8px'
        }}>
          <div style={{
            color: 'var(--text-primary)',
            fontWeight: '700',
            fontSize: '14px',
            lineHeight: '1.3',
            flex: 1
          }}>
            {team.name}
          </div>
          {team.team_categories && (
            <span style={getCategoryBadgeStyle(team.type)}>
              {team.team_categories.name}
            </span>
          )}
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}>
            {team.staff && team.staff.length > 0 ? (
              <>
                <User size={12} aria-hidden="true" />
                <span style={{ color: 'var(--text-secondary)' }}>
                  {`${team.staff[0].first_name} ${team.staff[0].last_name}`}
                </span>
              </>
            ) : (
              <span style={{
                color: 'var(--warning-text)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <AlertTriangle size={12} aria-hidden="true" />
                <span>Staff non renseigné</span>
              </span>
            )}
          </div>

          <div style={{
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            flexShrink: 0
          }}>
            {team.slots && team.slots.length > 0 ? (
              <>
                <Calendar size={12} aria-hidden="true" />
                <span style={{ color: 'var(--text-secondary)' }}>{formatSlots(team.slots)}</span>
              </>
            ) : (
              <span style={{
                color: 'var(--warning-text)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <AlertTriangle size={12} aria-hidden="true" />
                <span>Pas d'entraînement planifié</span>
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2" style={{ borderColor: 'var(--accent)' }}></div>
      </div>
    )
  }

  if (loadFailed) {
    return (
      <div style={{ padding: 0 }}>
        <LoadError onRetry={loadData} />
      </div>
    )
  }

  const filteredJuniorTeams = filterTeams(juniorTeams)
  const filteredActiveTeams = filterTeams(activeTeams)
  const juniorCategories = categories.filter(c => c.type === 'junior')
  const activeCategories = categories.filter(c => c.type === 'active')

  return (
    <div style={{ padding: 0 }}>
      <h1 className="text-3xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Nos équipes</h1>

      <div className="mb-8">
        <label className="block text-sm font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
          Filtrer par catégorie
        </label>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="rounded-lg px-4 py-2 focus:outline-none"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
        >
          <option value="all">Toutes les catégories</option>
          {juniorCategories.length > 0 && (
            <optgroup label="Juniors">
              {juniorCategories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </optgroup>
          )}
          {activeCategories.length > 0 && (
            <optgroup label="Équipes actives">
              {activeCategories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      {filteredJuniorTeams.length > 0 && (
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Juniors</h2>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            width: '100%'
          }}>
            {filteredJuniorTeams.map(team => (
              <TeamCard key={team.id} team={team} />
            ))}
          </div>
        </section>
      )}

      {filteredActiveTeams.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Équipes actives</h2>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            width: '100%'
          }}>
            {filteredActiveTeams.map(team => (
              <TeamCard key={team.id} team={team} />
            ))}
          </div>
        </section>
      )}

      {filteredJuniorTeams.length === 0 && filteredActiveTeams.length === 0 && (
        <div style={{ color: 'var(--text-secondary)', padding: '40px', textAlign: 'center' }}>
          Aucune équipe trouvée
        </div>
      )}

      {selectedTeam && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              zIndex: 40
            }}
            onClick={closeDetail}
          />
          <div
            style={{
              position: 'fixed',
              right: 0,
              top: 0,
              bottom: 0,
              width: '680px',
              maxWidth: '100vw',
              background: 'var(--bg-card)',
              boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.3)',
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{
              padding: '24px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h2 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {selectedTeam.name}
                </h2>
                <span style={{
                  background: selectedTeam.type === 'junior' ? 'var(--info-soft)' : 'var(--success-soft)',
                  color: selectedTeam.type === 'junior' ? 'var(--info-text)' : 'var(--success-text)',
                  padding: '4px 12px',
                  borderRadius: '99px',
                  fontSize: '12px',
                  fontWeight: '600'
                }}>
                  {selectedTeam.type === 'junior' ? 'Junior' : 'Actif'}
                </span>
              </div>
              <button
                onClick={closeDetail}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '8px'
                }}
              >
                <X size={24} />
              </button>
            </div>

            <div style={{ padding: '0 24px' }}>
              <Tabs
                items={[
                  { key: 'info', label: 'Équipe' },
                  { key: 'players', label: 'Joueurs' },
                ]}
                value={detailTab}
                onChange={(key) => setDetailTab(key as 'info' | 'players')}
              />
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
              {loadingDetail ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  Chargement...
                </div>
              ) : (
                <>
                  {detailTab === 'info' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                      <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>
                          CATÉGORIE
                        </div>
                        <div style={{ color: 'var(--text-primary)', fontSize: '16px' }}>
                          {selectedTeam.team_categories?.name || 'Non définie'}
                        </div>
                      </div>

                      <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>
                          SAISON
                        </div>
                        <div style={{ color: 'var(--text-primary)', fontSize: '16px' }}>
                          {selectedTeam.season}
                        </div>
                      </div>

                      {selectedTeam.staff && selectedTeam.staff.length > 0 ? (
                        <div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '600', marginBottom: '12px' }}>
                            STAFF
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {selectedTeam.staff.map((s: any, i: number) => (
                              <div key={i}>
                                <div style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>
                                  {s.first_name} {s.last_name}
                                </div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' }}>
                                  {STAFF_ROLE_LABELS[s.role] || s.role}
                                </div>
                                {s.coaching_qualifications && (
                                  <div style={{
                                    background: 'var(--bg-hover)',
                                    color: 'var(--text-secondary)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '99px',
                                    padding: '4px 12px',
                                    fontSize: '12px',
                                    display: 'inline-block',
                                    marginBottom: '4px'
                                  }}>
                                    {s.coaching_qualifications.name}
                                  </div>
                                )}
                                {s.email && (
                                  <div style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '2px' }}>
                                    {s.email}
                                  </div>
                                )}
                                {s.phone && (
                                  <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                                    {s.phone}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>
                            STAFF
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Staff non renseigné</div>
                        </div>
                      )}

                      {/* Training section */}
                      <div style={{ marginTop: '16px' }}>
                        <div style={{
                          color: 'var(--text-secondary)',
                          fontSize: '12px',
                          textTransform: 'uppercase',
                          fontWeight: '600',
                          letterSpacing: '0.05em',
                          marginBottom: '8px'
                        }}>
                          Entraînements
                        </div>
                        {trainingSlots.length > 0 ? (
                          trainingSlots.map((slot, i) => (
                            <div key={i} style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '8px 0',
                              borderBottom: '1px solid var(--border-color)',
                              color: 'var(--text-primary)',
                              fontSize: '14px'
                            }}>
                              <Calendar size={16} aria-hidden="true" style={{ color: 'var(--accent)' }} />
                              <span style={{ fontWeight: '600', minWidth: '90px' }}>
                                {getDayName(slot.day)}
                              </span>
                              <span style={{ color: 'var(--text-secondary)' }}>
                                {slot.start_time?.substring(0, 5)} – {slot.end_time?.substring(0, 5)}
                              </span>
                              {slot.terrain?.name && (
                                <span style={{
                                  color: 'var(--text-muted)',
                                  fontSize: '12px',
                                  marginLeft: 'auto'
                                }}>
                                  {slot.terrain.name}
                                </span>
                              )}
                            </div>
                          ))
                        ) : (
                          <div style={{ color: 'var(--warning-text)', fontSize: '14px' }}>
                            <AlertTriangle size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Pas d'entraînement planifié
                          </div>
                        )}
                      </div>

                      {(selectedTeam.training_start && selectedTeam.training_end) && (
                        <div style={{ marginTop: '16px' }}>
                          <div style={{
                            color: 'var(--text-secondary)', fontSize: '12px',
                            textTransform: 'uppercase', fontWeight: '600',
                            letterSpacing: '0.05em', marginBottom: '8px'
                          }}>
                            Période d'entraînement
                          </div>

                          <div style={{
                            color: 'var(--text-primary)', fontSize: '14px',
                            padding: '6px 0'
                          }}>
                            {new Date(selectedTeam.training_start).toLocaleDateString('fr-CH')}
                            {' – '}
                            {new Date(selectedTeam.training_end).toLocaleDateString('fr-CH')}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {detailTab === 'players' && (
                    <div>
                      {teamPlayers.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                          Aucun joueur dans cette équipe
                        </div>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <th style={{ textAlign: 'left', padding: '8px', color: 'var(--text-secondary)', fontSize: '12px' }}>Nom</th>
                              <th style={{ textAlign: 'left', padding: '8px', color: 'var(--text-secondary)', fontSize: '12px' }}>Prénom</th>
                              <th style={{ textAlign: 'left', padding: '8px', color: 'var(--text-secondary)', fontSize: '12px' }}>Naissance</th>
                              <th style={{ textAlign: 'left', padding: '8px', color: 'var(--text-secondary)', fontSize: '12px' }}>Position</th>
                              <th style={{ textAlign: 'left', padding: '8px', color: 'var(--text-secondary)', fontSize: '12px' }}>Statut</th>
                            </tr>
                          </thead>
                          <tbody>
                            {teamPlayers.map(player => (
                              <tr key={player.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <td style={{ padding: '8px', color: 'var(--text-primary)', fontWeight: '600' }}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                                    {player.last_name}
                                    <GroupementBadge
                                      status={player.status}
                                      groupementId={player.groupement_id}
                                      groupementName={player.groupements?.name}
                                    />
                                  </span>
                                </td>
                                <td style={{ padding: '8px', color: 'var(--text-primary)' }}>{player.first_name}</td>
                                <td style={{ padding: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                                  {player.birth_date
                                    ? new Date(player.birth_date).toLocaleDateString('fr-CH')
                                    : '—'}
                                </td>
                                <td style={{ padding: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>{player.position || '—'}</td>
                                <td style={{ padding: '8px' }}>
                                  <Badge variant={
                                    (player.licence_status === 'actif' ? 'green'
                                      : player.licence_status === 'inactif' ? 'red'
                                      : 'yellow') as BadgeVariant
                                  }>
                                    {player.licence_status || '—'}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
