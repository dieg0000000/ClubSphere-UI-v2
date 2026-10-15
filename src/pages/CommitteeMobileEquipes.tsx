import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useTenant } from '../context/TenantContext'
import { useWebsiteModuleEnabled } from '../hooks/useWebsiteModuleEnabled'
import { Phone, Mail, Users, Globe } from 'lucide-react'
import SearchInput from '../components/ui/SearchInput'
import { STAFF_ROLE_LABELS } from '../types'

const DAY_SHORT: Record<number, string> = {
  1: 'Lun', 2: 'Mar', 3: 'Mer', 4: 'Jeu', 5: 'Ven', 6: 'Sam', 7: 'Dim',
}

const ROLE_PRIORITY: Record<string, number> = {
  principal: 0, assistant: 1, aide_moniteur: 2, preparateur_physique: 3,
  entraineur_gardiens: 4, responsable_equipe: 5, autre: 6,
}

function fmtTime(t: string): string {
  return (t || '').slice(0, 5)
}

interface StaffMember {
  name: string
  role: string
  roleLabel: string
  email: string | null
  phone: string | null
}

interface TeamRow {
  id: string
  name: string
  categoryName: string
  displayOrder: number
  staff: StaffMember[]
  trainingLines: string[]
  playerCount: number
  publishRoster: boolean
}

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

export default function CommitteeMobileEquipes() {
  const { clubId } = useTenant()
  const { enabled: websiteEnabled } = useWebsiteModuleEnabled()
  const [teamsData, setTeamsData] = useState<TeamRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedTeam, setSelectedTeam] = useState<TeamRow | null>(null)

  const fetchTeams = useCallback(async () => {
    if (!clubId) return
    setLoaded(false)

    const [teamsRes, staffRes, slotsRes, countRes, seasonRes] = await Promise.all([
      supabase
        .from('teams')
        .select('id, name, active, publish_roster, team_categories(name, display_order)')
        .eq('club_id', clubId)
        .eq('active', true),
      supabase
        .from('team_staff')
        .select('team_id, role, sort_order, coaches(first_name, last_name, email, phone)')
        .eq('club_id', clubId),
      supabase
        .from('terrain_slots')
        .select('team_id, day, start_time, end_time, season, terrain_half_id, terrain_halves(name, terrain_id, terrains(name))')
        .not('team_id', 'is', null),
      supabase
        .from('members')
        .select('team_id')
        .eq('club_id', clubId)
        .neq('status', 'archive')
        .not('team_id', 'is', null),
      supabase
        .from('seasons')
        .select('name')
        .eq('active', true)
        .limit(1)
        .maybeSingle(),
    ])

    const activeSeason = seasonRes.data?.name || '2025-2026'

    const staffByTeam = new Map<string, StaffMember[]>()
    for (const s of (staffRes.data || []) as any[]) {
      const coach = s.coaches as any
      if (!coach) continue
      const entry: StaffMember = {
        name: `${coach.first_name} ${coach.last_name}`,
        role: s.role,
        roleLabel: STAFF_ROLE_LABELS[s.role] || s.role,
        email: coach.email || null,
        phone: coach.phone || null,
      }
      const arr = staffByTeam.get(s.team_id) || []
      arr.push({ ...entry, _sortOrder: s.sort_order ?? 999, _rolePriority: ROLE_PRIORITY[s.role] ?? 99 } as any)
      staffByTeam.set(s.team_id, arr)
    }
    for (const [, arr] of staffByTeam) {
      arr.sort((a: any, b: any) => a._sortOrder - b._sortOrder || a._rolePriority - b._rolePriority)
    }

    const memberCounts = new Map<string, number>()
    for (const m of countRes.data || []) {
      memberCounts.set(m.team_id, (memberCounts.get(m.team_id) || 0) + 1)
    }

    const slotsByTeam = new Map<string, any[]>()
    for (const s of slotsRes.data || []) {
      if (!s.team_id) continue
      const arr = slotsByTeam.get(s.team_id) || []
      arr.push(s)
      slotsByTeam.set(s.team_id, arr)
    }

    const rows: TeamRow[] = ((teamsRes.data || []) as any[]).map(t => {
      const cat = t.team_categories as any

      const allSlots = slotsByTeam.get(t.id) || []
      let teamSlots = allSlots.filter((s: any) => s.season === activeSeason)
      if (teamSlots.length === 0 && allSlots.length > 0) {
        const seasons = [...new Set(allSlots.map((s: any) => s.season as string))].sort()
        const fallback = seasons[seasons.length - 1]
        teamSlots = allSlots.filter((s: any) => s.season === fallback)
      }

      const trainingLines: string[] = teamSlots.map((s: any) => {
        const dayNum = typeof s.day === 'number' ? s.day : parseInt(s.day, 10)
        const dayLabel = DAY_SHORT[dayNum] || `Jour ${s.day}`
        const half = s.terrain_halves as any
        const terrainName = half?.terrains?.name || ''
        const halfName = half?.name || ''
        const time = `${fmtTime(s.start_time)}–${fmtTime(s.end_time)}`
        let line = `${dayLabel} ${time}`
        if (terrainName) line += ` · ${terrainName}`
        if (halfName) line += ` · ${halfName}`
        return line
      })

      return {
        id: t.id,
        name: t.name,
        categoryName: cat?.name || '',
        displayOrder: cat?.display_order ?? 999,
        staff: staffByTeam.get(t.id) || [],
        trainingLines,
        playerCount: memberCounts.get(t.id) || 0,
        publishRoster: !!t.publish_roster,
      }
    })

    rows.sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, 'fr'))
    setTeamsData(rows)
    setLoaded(true)
  }, [clubId])

  useEffect(() => { fetchTeams() }, [fetchTeams])

  const filteredTeams = useMemo(() => {
    if (!search.trim()) return teamsData
    const nq = normalize(search)
    return teamsData.filter(t => {
      const staffNames = t.staff.map(s => s.name).join(' ')
      const hay = normalize(`${t.name} ${t.categoryName} ${staffNames}`)
      return nq.split(' ').filter(Boolean).every(tok => hay.includes(tok))
    })
  }, [teamsData, search])

  return (
    <div style={{ maxWidth: 500, margin: '0 auto' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px' }}>
        Équipes
      </h1>

      <div style={{ marginBottom: '14px' }}>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Chercher une équipe..."
        />
      </div>

      {!loaded ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
          <div className="animate-spin" style={{ width: 24, height: 24, border: '2.5px solid var(--border-color)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} />
        </div>
      ) : filteredTeams.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', padding: '32px 0' }}>
          {search.trim() ? 'Aucun résultat' : 'Aucune équipe active'}
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {filteredTeams.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedTeam(t)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '12px 14px', borderRadius: '12px',
                  border: '1px solid var(--border-color)', background: 'var(--bg-card)',
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.name}
                  </p>
                  {t.categoryName && (
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>{t.categoryName}</p>
                  )}
                  {websiteEnabled && t.publishRoster && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', marginTop: '3px', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', background: 'var(--bg-hover)', padding: '1px 7px', borderRadius: '999px' }}>
                      <Globe size={10} /> Effectif publié
                    </span>
                  )}
                  {t.staff.length > 0 ? (
                    t.staff.map((s, i) => (
                      <p key={i} style={{ margin: i === 0 ? '2px 0 0' : '1px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                        {s.name} — <span style={{ fontSize: '10px' }}>{s.roleLabel}</span>
                      </p>
                    ))
                  ) : (
                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Aucun staff</p>
                  )}
                  {t.trainingLines.length > 0 && (
                    <div style={{ marginTop: '4px' }}>
                      {t.trainingLines.map((line, i) => (
                        <p key={i} style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)' }}>{line}</p>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                  <Users size={14} style={{ color: 'var(--text-muted)' }} />
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{t.playerCount}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>joueurs</span>
                </div>
              </button>
            ))}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '10px' }}>
            {filteredTeams.length} équipe{filteredTeams.length !== 1 ? 's' : ''}
          </p>
        </>
      )}

      {selectedTeam && (
        <TeamDetailSheet team={selectedTeam} onClose={() => setSelectedTeam(null)} />
      )}
    </div>
  )
}

function InfoRow({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{label}</span>
      {href ? (
        <a href={href} style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>
          {value}
        </a>
      ) : (
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>
          {value}
        </span>
      )}
    </div>
  )
}

function TeamDetailSheet({ team: t, onClose }: { team: TeamRow; onClose: () => void }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column' }}
      onClick={onClose}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
      <div
        style={{
          position: 'relative', marginTop: 'auto', background: 'var(--bg-card)',
          borderRadius: '16px 16px 0 0', padding: '20px', maxHeight: '80vh',
          overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-color)', margin: '0 auto 16px' }} />
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
          {t.name}
        </h2>
        {t.categoryName && (
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 14px' }}>{t.categoryName}</p>
        )}

        <div style={{ padding: '4px 0 0', borderBottom: t.staff.length > 0 ? '1px solid var(--border-color)' : undefined }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Staff</span>
          {t.staff.length > 0 ? (
            t.staff.map((s, i) => (
              <div key={i} style={{ padding: '6px 0', borderTop: i > 0 ? '1px solid var(--border-color)' : undefined }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{s.roleLabel}</span>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{s.name}</span>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {s.phone && <a href={`tel:${s.phone}`} style={{ color: 'var(--accent)' }}><Phone size={16} /></a>}
                    {s.email && <a href={`mailto:${s.email}`} style={{ color: 'var(--accent)' }}><Mail size={16} /></a>}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p style={{ margin: '4px 0 8px', fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Aucun staff</p>
          )}
        </div>

        <InfoRow label="Joueurs" value={String(t.playerCount)} />

        {t.trainingLines.length > 0 && (
          <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Entraînements</span>
            {t.trainingLines.map((line, i) => (
              <p key={i} style={{ margin: '3px 0 0', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{line}</p>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: '16px', width: '100%', padding: '12px',
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
