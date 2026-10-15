import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTenant } from '../context/TenantContext'
import { supabase } from '../lib/supabase'
import { ChevronRight, Newspaper, AlertTriangle } from 'lucide-react'
import { isUnavailableForMatch, unavailabilityBadgeText } from '../utils/availabilityHelpers'
import { SponsorsCarousel } from '../components/SponsorsCarousel'
import NewsCategoryBadge from '../components/NewsCategoryBadge'
import { Alert } from '../components/ui/Alert'
import { PushNotificationPrompt } from '../components/PushNotificationPrompt'
import { RoleBadges } from '../components/RoleBadges'
import { isTrainingResponseLocked } from '../lib/trainingAttendance'
import { useDashboardBundle, type DashboardBundle } from '../hooks/useDashboardBundle'
import { calcAge } from '../utils/charteHelpers'
import { LoadError } from '../components/LoadError'
import HomeEventTile, { type HomeTileEvent, type TileAnswer } from '../components/home/HomeEventTile'
import RecentMessagesBlock from '../components/home/RecentMessagesBlock'
import ClubEventsBlock from '../components/home/ClubEventsBlock'
import LatestAlbumBlock from '../components/home/LatestAlbumBlock'

type AvailMap = Record<string, { availability: string | null; availability_until: string | null }>

const EVENTS_PER_PLAYER = 2
const TILES_BEFORE_SPONSORS = 2

function localToday(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function matchAnswer(status: string | undefined): TileAnswer {
  if (status === 'confirmed') return 'present'
  if (status === 'absent_justified' || status === 'absent_unjustified') return 'absent'
  return null
}

function buildTiles(bundle: DashboardBundle, availMap: AvailMap): HomeTileEvent[] {
  const todayStr = localToday()
  const teamName = new Map((bundle.teams || []).map(t => [t.id, t.name]))
  const memberTeams = new Map<string, Set<string>>()
  for (const mt of bundle.member_teams || []) {
    const set = memberTeams.get(mt.member_id) || new Set<string>()
    set.add(mt.team_id)
    memberTeams.set(mt.member_id, set)
  }

  const tiles: HomeTileEvent[] = []
  for (const member of bundle.members || []) {
    const teamIds = new Set(memberTeams.get(member.id) || [])
    if (member.team_id) teamIds.add(member.team_id)
    if (teamIds.size === 0) continue

    const fullName = `${member.first_name} ${member.last_name}`.trim()
    const avail = availMap[member.id]
    const base = {
      memberId: member.id,
      memberFirstName: member.first_name,
      memberFullName: fullName,
      gender: member.gender,
    }
    const candidates: HomeTileEvent[] = []

    for (const m of bundle.next_matches || []) {
      if (!teamIds.has(m.team_id) || m.match_date < todayStr) continue
      const att = (bundle.match_attendance || []).find(a => a.match_id === m.id && a.member_id === member.id)
      const conv = (bundle.convocations || []).find(c => c.match_id === m.id)
      const convPlayer = conv
        ? (bundle.convocation_players || []).find(p => p.convocation_id === conv.id && p.member_id === member.id)
        : undefined
      const unavailable = avail ? isUnavailableForMatch(avail.availability, avail.availability_until, m.match_date) : false
      candidates.push({
        ...base,
        key: `match-${m.id}-${member.id}`,
        type: 'match',
        id: m.id,
        date: m.match_date,
        time: m.match_time,
        endTime: null,
        teamName: m.team_name || teamName.get(m.team_id) || '',
        opponentName: m.opponent_name,
        isHome: m.is_home,
        location: m.venue_name ? (m.venue_city ? `${m.venue_name}, ${m.venue_city}` : m.venue_name) : null,
        answer: matchAnswer(att?.status),
        notConvoked: !!conv && !convPlayer,
        convocationRowId: convPlayer?.id ?? null,
        unavailableText: unavailable && avail ? unavailabilityBadgeText(avail.availability, avail.availability_until) : null,
      })
    }

    for (const s of bundle.next_sessions || []) {
      if (!teamIds.has(s.team_id) || s.session_date < todayStr) continue
      const att = (bundle.training_attendance || []).find(a => a.session_id === s.id && a.member_id === member.id)
      candidates.push({
        ...base,
        key: `training-${s.id}-${member.id}`,
        type: 'training',
        id: s.id,
        date: s.session_date,
        time: s.start_time,
        endTime: s.end_time,
        teamName: teamName.get(s.team_id) || '',
        location: s.terrain_name || null,
        answer: matchAnswer(att?.status),
        cancelled: s.cancelled,
        cancelledReason: s.cancelled_reason,
        locked: isTrainingResponseLocked(s.session_date, s.start_time),
        rain_applied: !!s.rain_applied,
        rain_plan_defined: !!s.rain_plan_defined,
        rain_note: s.rain_note ?? null,
        base_terrain_name: s.base_terrain_name ?? null,
        base_start_time: s.base_start_time ?? null,
        base_end_time: s.base_end_time ?? null,
      })
    }

    candidates.sort(compareTiles)
    tiles.push(...candidates.slice(0, EVENTS_PER_PLAYER))
  }
  return tiles.sort(compareTiles)
}

function compareTiles(a: HomeTileEvent, b: HomeTileEvent): number {
  return a.date.localeCompare(b.date) || (a.time || '99').localeCompare(b.time || '99')
}

export function PlayerParentDashboard() {
  const { user } = useAuth()
  const { clubId } = useTenant()
  const { bundle, loading: bundleLoading, error: bundleError, reload: reloadBundle } = useDashboardBundle()

  const [greeting, setGreeting] = useState('')
  const [allChildNames, setAllChildNames] = useState<string[]>([])
  const [allChildTeamNames, setAllChildTeamNames] = useState<string[]>([])
  const [answerOverrides, setAnswerOverrides] = useState<Record<string, Exclude<TileAnswer, null>>>({})
  const [chartePending, setChartePending] = useState<{
    count: number;
    forChildNames: string[];
    selfPending: boolean;
    firstTab: string | null;
  }>({ count: 0, forChildNames: [], selfPending: false, firstTab: null })
  const [unavailableAlerts, setUnavailableAlerts] = useState<{ name: string; status: string; until: string | null; isSelf: boolean }[]>([])
  const [memberAvailMap, setMemberAvailMap] = useState<AvailMap>({})

  useEffect(() => {
    if (!bundle || !user) return

    const members = bundle.members || []
    const profile = bundle.profile

    if (members.length === 0) {
      setGreeting(profile?.full_name?.split(' ')[0] || user.email.split('@')[0])
      return
    }

    const memberTeamMap = new Map<string, string>()
    const memberTeamsMulti = new Map<string, string[]>()
    for (const mt of bundle.member_teams || []) {
      if (!memberTeamMap.has(mt.member_id)) memberTeamMap.set(mt.member_id, mt.team_id)
      const arr = memberTeamsMulti.get(mt.member_id) || []
      arr.push(mt.team_id)
      memberTeamsMulti.set(mt.member_id, arr)
    }
    const teamsMap = new Map<string, string>()
    for (const t of bundle.teams || []) teamsMap.set(t.id, t.name)

    const primary = members[0]
    const primaryTeamId = primary.team_id || memberTeamMap.get(primary.id) || null
    const primaryIsChild = !primary.is_self
    const profileFirstName = profile?.full_name?.split(' ')[0] || ''

    if (primaryIsChild) {
      setGreeting(profileFirstName)
      if (primaryTeamId) ensureParentInTeamConversations(user.id, primaryTeamId)
    } else {
      setGreeting(profileFirstName || primary.first_name || '')
    }

    const followedChildren = primaryIsChild ? members : members.slice(1)
    if (followedChildren.length > 0) {
      setAllChildNames(followedChildren.map(c => `${c.first_name} ${c.last_name}`.trim()))
    }
    const allTeamIds = new Set<string>()
    if (primaryTeamId) allTeamIds.add(primaryTeamId)
    for (const c of followedChildren) {
      const tids = memberTeamsMulti.get(c.id) || (c.team_id ? [c.team_id] : [])
      for (const tid of tids) allTeamIds.add(tid)
    }
    const allTeamNamesList = [...allTeamIds].map(id => teamsMap.get(id)).filter(Boolean) as string[]
    setAllChildTeamNames([...new Set(allTeamNamesList)])

    computeChartePending(bundle, members)

    const memberIds = members.map(m => m.id)
    supabase
      .from('members')
      .select('id, first_name, last_name, availability, availability_until')
      .in('id', memberIds)
      .then(({ data: avRows }) => {
        if (!avRows) return
        const alerts: { name: string; status: string; until: string | null; isSelf: boolean }[] = []
        const avMap: AvailMap = {}
        for (const row of avRows as any[]) {
          avMap[row.id] = { availability: row.availability ?? null, availability_until: row.availability_until ?? null }
          if (!row.availability || row.availability === 'disponible') continue
          const mem = members.find(m => m.id === row.id)
          alerts.push({
            name: `${row.first_name} ${row.last_name}`.trim(),
            status: row.availability,
            until: row.availability_until || null,
            isSelf: mem?.is_self ?? false,
          })
        }
        setUnavailableAlerts(alerts)
        setMemberAvailMap(avMap)
      })
  }, [bundle, user?.id])

  function computeChartePending(
    b: DashboardBundle,
    members: DashboardBundle['members'],
  ) {
    const docs = b.charter_documents || []
    const acks = b.charter_acknowledgements || []
    if (docs.length === 0) {
      setChartePending({ count: 0, forChildNames: [], selfPending: false, firstTab: null })
      return
    }

    const selfMember = members.find(m => m.is_self)
    const childMembers = members.filter(m => !m.is_self)

    const pendingSelfDocs: { id: string; title: string; category: string }[] = []
    const pendingChildEntries: { childName: string; category: string }[] = []

    const joueurAdultDoc = docs.find(d => d.category === 'charte_joueurs')
    const joueurMinorDoc = docs.find(d => d.category === 'charte_joueurs_mineurs')

    if (joueurAdultDoc && selfMember) {
      const age = calcAge(selfMember.birth_date)
      if (age !== null && age >= 18) {
        const already = acks.some(a => a.document_id === joueurAdultDoc.id && a.member_id === selfMember.id)
        if (!already) pendingSelfDocs.push(joueurAdultDoc)
      }
    }

    if (joueurMinorDoc) {
      for (const child of childMembers) {
        const age = calcAge(child.birth_date)
        if (age === null || age < 18) {
          const already = acks.some(a => a.document_id === joueurMinorDoc.id && a.member_id === child.id)
          if (!already) {
            pendingChildEntries.push({
              childName: `${child.first_name} ${child.last_name}`.trim(),
              category: joueurMinorDoc.category,
            })
          }
        }
      }
    }

    const total = pendingSelfDocs.length + pendingChildEntries.length
    const names = [...new Set(pendingChildEntries.map(e => e.childName))]

    let firstTab: string | null = null
    if (pendingSelfDocs.length > 0) firstTab = pendingSelfDocs[0].category
    else if (pendingChildEntries.length > 0) firstTab = pendingChildEntries[0].category

    setChartePending({
      count: total,
      forChildNames: names,
      selfPending: pendingSelfDocs.length > 0,
      firstTab,
    })
  }

  const ensureParentInTeamConversations = async (parentUserId: string, teamId: string) => {
    const { data: teamConvs } = await supabase
      .from('conversations')
      .select('id')
      .eq('team_id', teamId)

    for (const conv of teamConvs || []) {
      const { error } = await supabase
        .from('conversation_participants')
        .upsert(
          { conversation_id: conv.id, user_id: parentUserId, role: 'parent', can_write: true, club_id: clubId },
          { onConflict: 'conversation_id,user_id', ignoreDuplicates: true }
        )
      if (error) console.error('conversation_participants upsert error:', error)
    }
  }

  const tiles = useMemo(() => {
    if (!bundle) return []
    return buildTiles(bundle, memberAvailMap).map(t =>
      answerOverrides[t.key] ? { ...t, answer: answerOverrides[t.key] } : t
    )
  }, [bundle, memberAvailMap, answerOverrides])

  const messages = useMemo(() => {
    if (!bundle) return []
    const myTeamNames = new Set((bundle.teams || []).map(t => t.name))
    return (bundle.recent_messages || [])
      .filter(m => m.team_name && myTeamNames.has(m.team_name))
      .map(m => ({
        id: m.id,
        body: (m.body || '').substring(0, 60),
        created_at: m.created_at,
        senderName: m.sender_name || 'Inconnu',
      }))
  }, [bundle])

  const news = bundle?.news || []
  const clubEvents = bundle?.events || []

  const handleAnswered = (key: string, answer: Exclude<TileAnswer, null>) =>
    setAnswerOverrides(prev => ({ ...prev, [key]: answer }))

  const renderTiles = (list: HomeTileEvent[]) => list.length > 0 && user?.id && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {list.map(t => (
        <HomeEventTile key={t.key} event={t} userId={user.id} onAnswered={handleAnswered} />
      ))}
    </div>
  )

  return (
    <div className="page-container">
      {bundleError && !bundle && (
        <LoadError onRetry={reloadBundle} />
      )}

      {chartePending.count > 0 && (
        <Alert
          variant="warning"
          title={
            chartePending.selfPending && chartePending.forChildNames.length > 0
              ? `${chartePending.count} document(s) à valider (vous + ${chartePending.forChildNames.join(', ')})`
              : chartePending.forChildNames.length > 0
                ? (chartePending.forChildNames.length === 1
                    ? `${chartePending.count} document(s) à valider pour ${chartePending.forChildNames[0]}`
                    : `${chartePending.count} document(s) à valider pour vos enfants`)
                : `Vous avez ${chartePending.count} charte(s) à lire et valider`
          }
          className="mb-4"
        >
          <Link to={`/documents${chartePending.firstTab ? `?cat=${chartePending.firstTab}` : ''}`} style={{
            display: 'inline-block',
            background: 'var(--warning-soft)',
            color: 'var(--warning-text)',
            border: '1px solid var(--warning)',
            borderRadius: '8px',
            padding: '6px 14px',
            fontWeight: 600,
            fontSize: '13px',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            marginTop: '8px',
          }}>Voir maintenant →</Link>
        </Alert>
      )}

      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '2px' }}>
          Bonjour{greeting ? ` ${greeting}` : ''} !
        </h1>
        <RoleBadges childNames={allChildNames} childTeamNames={allChildTeamNames} />
      </div>

      {unavailableAlerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
          {unavailableAlerts.map((a, i) => {
            const statusWord = a.status === 'blesse' ? 'blessé' : a.status === 'malade' ? 'malade' : 'en pause'
            const text = a.isSelf
              ? `Vous êtes déclaré ${statusWord}${a.until ? ` jusqu'au ${new Date(a.until).toLocaleDateString('fr-CH')}` : ''}`
              : `${a.name} est déclaré ${statusWord}${a.until ? ` jusqu'au ${new Date(a.until).toLocaleDateString('fr-CH')}` : ''}`
            const link = a.isSelf ? '/mon-profil/joueur' : '/mon-profil/parent'
            return (
              <Link
                key={i}
                to={link}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  background: 'var(--warning-soft)', border: '1px solid var(--warning)',
                  borderRadius: '10px', padding: '10px 14px', textDecoration: 'none',
                }}
              >
                <AlertTriangle size={16} style={{ color: 'var(--warning-text)', flexShrink: 0 }} />
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--warning-text)', flex: 1 }}>{text}</span>
                <ChevronRight size={16} style={{ color: 'var(--warning-text)', flexShrink: 0 }} />
              </Link>
            )
          })}
        </div>
      )}

      <div style={{ marginBottom: '12px' }}>
        <PushNotificationPrompt />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {bundleLoading && !bundle && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Chargement...</span>
          </div>
        )}

        {renderTiles(tiles.slice(0, TILES_BEFORE_SPONSORS))}

        <SponsorsCarousel />

        {renderTiles(tiles.slice(TILES_BEFORE_SPONSORS))}

        <RecentMessagesBlock messages={messages} />

        <LatestAlbumBlock />

        <ClubEventsBlock events={clubEvents} />

        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: '14px', padding: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Newspaper size={16} style={{ color: 'var(--accent)' }} />
              <span style={{ color: 'var(--text-primary)', fontWeight: '700', fontSize: '14px' }}>Actualités</span>
            </div>
            <Link to="/news" style={{ color: 'var(--accent)', fontSize: '12px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '2px' }}>
              Voir tout <ChevronRight size={14} />
            </Link>
          </div>
          {news.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {news.map(n => (
                <Link key={n.id} to="/news" style={{ textDecoration: 'none', display: 'block' }}>
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '8px 10px', background: 'var(--bg-hover)',
                      borderRadius: '8px', border: '1px solid var(--border-color)',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-color)')}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: '600', marginBottom: '3px' }}>{n.title}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <NewsCategoryBadge category={n.category} />
                        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                          {new Date(n.published_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long' })}
                        </span>
                      </div>
                    </div>
                    <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '8px 0' }}>Aucune actualité</p>
          )}
        </div>
      </div>
    </div>
  )
}
