import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useTenant } from '../context/TenantContext'
import { waitForBundleIfPending } from '../lib/dashboardCache'
import { STAFF_ROLE_LABELS } from '../types'

interface CoachTeam {
  name: string
  roleLabel: string
}

interface RoleBadgesProps {
  childNames?: string[]
  childTeamNames?: string[]
}

export function RoleBadges({ childNames, childTeamNames }: RoleBadgesProps) {
  const { user, clubRoles } = useAuth()
  const { clubId } = useTenant()
  const [ownTeamName, setOwnTeamName] = useState<string | null>(null)
  const [coachTeams, setCoachTeams] = useState<CoachTeam[]>([])
  const [confrerieLabel, setConfrerieLabel] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [teamsExpanded, setTeamsExpanded] = useState(false)

  const isCommittee = clubRoles.includes('admin') || clubRoles.includes('committee')
  const isParent = clubRoles.includes('parent')
  const isMember = clubRoles.includes('member')

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false

    async function load() {
      const cached = await waitForBundleIfPending()
      if (cached) {
        if (cancelled) return
        setOwnTeamName(cached.memberTeamName)
        setCoachTeams([])
        const confr = await loadConfrerie()
        if (!cancelled) setConfrerieLabel(confr)
        setLoaded(true)
        return
      }

      const [playerResult, coachResult, confrerieResult] = await Promise.all([
        loadPlayerTeam(),
        loadCoachTeams(),
        loadConfrerie(),
      ])
      if (cancelled) return
      setOwnTeamName(playerResult)
      setCoachTeams(coachResult)
      setConfrerieLabel(confrerieResult)
      setLoaded(true)
    }

    async function loadPlayerTeam(): Promise<string | null> {
      const { data: byProfile } = await supabase
        .from('members')
        .select('team_id')
        .eq('profile_id', user!.id)
        .neq('status', 'archive')
        .maybeSingle()
      const teamId = byProfile?.team_id
      if (!teamId) {
        const { data: byEmail } = await supabase
          .from('members')
          .select('team_id')
          .ilike('email', user!.email)
          .neq('status', 'archive')
          .maybeSingle()
        if (!byEmail?.team_id) return null
        const { data: t } = await supabase.from('teams').select('name').eq('id', byEmail.team_id).maybeSingle()
        return t?.name || null
      }
      const { data: t } = await supabase.from('teams').select('name').eq('id', teamId).maybeSingle()
      return t?.name || null
    }

    async function loadCoachTeams(): Promise<CoachTeam[]> {
      let coachIds: string[] = []
      const { data: byUserId } = await supabase.from('coaches').select('id').eq('user_id', user!.id)
      if (byUserId && byUserId.length > 0) {
        coachIds = byUserId.map(c => c.id)
      } else {
        const { data: byEmail } = await supabase.from('coaches').select('id').ilike('email', user!.email)
        if (!byEmail || byEmail.length === 0) return []
        coachIds = byEmail.map(c => c.id)
      }
      const { data: staffRows } = await supabase
        .from('team_staff')
        .select('role, sort_order, teams(name, active)')
        .in('coach_id', coachIds)
        .order('sort_order')
      if (!staffRows) return []
      return (staffRows as any[]).filter(r => r.teams?.active && r.teams?.name).map(r => ({
        name: r.teams.name,
        roleLabel: STAFF_ROLE_LABELS[r.role] || r.role,
      }))
    }

    async function loadConfrerie(): Promise<string | null> {
      const { data } = await supabase.rpc('get_my_confrerie_badge')
      if (!data || !data.is_member) return null
      const { data: settings } = await supabase
        .from('club_settings')
        .select('confrerie_label')
        .maybeSingle()
      return settings?.confrerie_label || 'Confrérie'
    }

    load()
    return () => { cancelled = true }
  }, [user?.id, user?.email])

  if (!loaded && !isCommittee && !(childNames && childNames.length > 0)) return null

  const hasExternalTeams = childTeamNames && childTeamNames.length > 0
  const hasBadge = ownTeamName || coachTeams.length > 0 || isCommittee || isParent || isMember || confrerieLabel || (childNames && childNames.length > 0) || hasExternalTeams

  const badgeStyle = (bg: string, color: string) => ({
    display: 'inline-block' as const, fontSize: '11px', fontWeight: '600' as const,
    background: bg, color, borderRadius: '6px', padding: '2px 8px',
    marginBottom: '2px', marginRight: '4px',
  })

  const sortedChildTeams = childTeamNames ? [...childTeamNames].sort((a, b) => a.localeCompare(b, 'fr')) : []
  const MAX_VISIBLE = 4
  const visibleTeams = teamsExpanded ? sortedChildTeams : sortedChildTeams.slice(0, MAX_VISIBLE - 1)
  const hiddenCount = sortedChildTeams.length - visibleTeams.length

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0' }}>
      {!hasExternalTeams && ownTeamName && (
        <span style={badgeStyle('var(--accent-soft, rgba(0,100,200,0.08))', 'var(--accent)')}>
          {ownTeamName}
        </span>
      )}
      {sortedChildTeams.length > 0 && visibleTeams.map(name => (
        <span key={name} style={badgeStyle('var(--accent-soft, rgba(0,100,200,0.08))', 'var(--accent)')}>
          {name}
        </span>
      ))}
      {hiddenCount > 0 && (
        <span
          onClick={() => setTeamsExpanded(true)}
          style={{
            ...badgeStyle('var(--bg-hover)', 'var(--text-secondary)'),
            cursor: 'pointer',
          }}
        >
          +{hiddenCount}
        </span>
      )}
      {coachTeams.map((ct, i) => (
        <span key={ct.name + ct.roleLabel + i} style={badgeStyle('var(--success-soft, rgba(0,140,60,0.08))', 'var(--success, #059669)')}>
          {ct.roleLabel} · {ct.name}
        </span>
      ))}
      {isParent && (
        <span style={badgeStyle('var(--accent-soft, rgba(0,100,200,0.08))', 'var(--accent)')}>
          Parent
        </span>
      )}
      {isMember && !ownTeamName && !hasExternalTeams && (
        <span style={badgeStyle('var(--accent-soft, rgba(0,100,200,0.08))', 'var(--accent)')}>
          Membre
        </span>
      )}
      {isCommittee && (
        <span style={badgeStyle('var(--warning-soft, rgba(200,140,0,0.08))', 'var(--warning, #d97706)')}>
          {clubRoles.includes('admin') ? 'Administrateur' : 'Comité'}
        </span>
      )}
      {confrerieLabel && (
        <span style={badgeStyle('var(--accent-soft, rgba(0,100,200,0.08))', 'var(--accent)')}>
          {confrerieLabel}
        </span>
      )}
      {!hasBadge && loaded && (
        <span style={badgeStyle('var(--bg-hover)', 'var(--text-secondary)')}>
          Supporter
        </span>
      )}
      {childNames && childNames.length > 0 && (
        <p style={{ width: '100%', color: 'var(--text-secondary)', fontSize: '13px', marginTop: '2px', marginBottom: 0 }}>
          Suivi de{' '}
          <span style={{ color: 'var(--accent)', fontWeight: '600' }}>
            {formatChildNames(childNames)}
          </span>
        </p>
      )}
    </div>
  )
}

function formatChildNames(names: string[]): string {
  const lastNames = names.map(n => n.split(' ').slice(1).join(' '))
  const allSameLastName = lastNames.length > 0 && lastNames.every(l => l === lastNames[0]) && lastNames[0]
  if (allSameLastName) {
    const firsts = names.map(n => n.split(' ')[0])
    const joined = firsts.length <= 1 ? firsts[0] : firsts.slice(0, -1).join(', ') + ' et ' + firsts[firsts.length - 1]
    return `${joined} ${allSameLastName}`
  }
  return names.length <= 1 ? names[0] : names.slice(0, -1).join(', ') + ' et ' + names[names.length - 1]
}
