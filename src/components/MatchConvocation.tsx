import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useTenant } from '../context/TenantContext'
import { Users, Plus, Check, X, Send, ChevronDown, ChevronUp, LayoutGrid, CircleCheck, CircleX, AlertTriangle } from 'lucide-react'
import Button from './ui/Button'
import { Badge } from './ui/Badge'
import { Alert } from './ui/Alert'
import SearchInput from './ui/SearchInput'
import { CompositionSheet } from './CompositionSheet'
import { Toggle } from './Toggle'
import { useFootballPositions } from '../hooks/useFootballPositions'
import { meetingTimeLine } from '../utils/meetingTime'
import { availabilityBadgeVariant, availabilityLabel, availabilitySummary, isUnavailableForMatch, unavailabilityBadgeText } from '../utils/availabilityHelpers'

interface Props {
  matchId: string
  teamId: string
  matchDate: string
  matchTime?: string | null
  attendanceDefaultPresent?: boolean
  attendanceMap: Record<string, { status: string; absence_reason: string | null }>
  onAttendanceChanged?: () => void
  readOnly?: boolean
}

interface ConvocationHeader {
  id: string
  match_id: string
  team_id: string
  club_id: string
  status: 'draft' | 'published'
  published_at: string | null
  created_by: string | null
  publish_lineup: boolean
  meeting_minutes_before: number
}

interface ConvocationPlayer {
  id: string
  convocation_id: string
  member_id: string
  origin_team_id: string | null
  status: 'convoked' | 'confirmed' | 'declined'
  decline_reason: string | null
  sort_order: number | null
  notified_at: string | null
  role: 'starter' | 'sub' | null
  position_id: string | null
  members: {
    id: string
    first_name: string
    last_name: string
    birth_date: string | null
    position_main_id?: string | null
    availability?: string | null
    availability_until?: string | null
    availability_note?: string | null
    jersey_number?: number | null
    receives_convocations?: boolean
  } | null
  origin_team?: { name: string } | null
}

interface RosterMember {
  id: string
  first_name: string
  last_name: string
  birth_date: string | null
  availability: string | null
  availability_until: string | null
  availability_note: string | null
  jersey_number: number | null
  receives_convocations: boolean
}

interface AttendanceInfo {
  member_id: string
  status: string
  absence_reason: string | null
}

type GameFormat = 'foot11' | 'foot9' | 'foot7' | 'ecole'

const FORMAT_STARTERS: Record<GameFormat, number> = {
  foot11: 11,
  foot9: 9,
  foot7: 7,
  ecole: 7,
}

export default function MatchConvocation({ matchId, teamId, matchDate, matchTime = null, attendanceDefaultPresent = false, attendanceMap, onAttendanceChanged, readOnly = false }: Props) {
  const { user } = useAuth()
  const { clubId } = useTenant()
  const { positions } = useFootballPositions()

  const [gameFormat, setGameFormat] = useState<GameFormat | null>(null)
  const [limit, setLimit] = useState<number | null>(null)
  const [convocation, setConvocation] = useState<ConvocationHeader | null>(null)
  const [players, setPlayers] = useState<ConvocationPlayer[]>([])
  const [roster, setRoster] = useState<RosterMember[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [notifying, setNotifying] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const [otherSearch, setOtherSearch] = useState('')
  const [otherResults, setOtherResults] = useState<(RosterMember & { team_name: string; team_id: string })[]>([])
  const [searchingOthers, setSearchingOthers] = useState(false)
  const [othersExpanded, setOthersExpanded] = useState(false)
  const [noConvExpanded, setNoConvExpanded] = useState(false)

  const [compoSheet, setCompoSheet] = useState<ConvocationPlayer | null>(null)
  const [compoSaving, setCompoSaving] = useState(false)
  const [lineupSaving, setLineupSaving] = useState(false)

  const convokedCount = players.length
  const isAtLimit = limit !== null && convokedCount >= limit
  const isOverLimit = limit !== null && convokedCount > limit

  const startersMax = gameFormat ? FORMAT_STARTERS[gameFormat] : 11
  const starters = players.filter(p => p.role === 'starter')
  const subs = players.filter(p => p.role === 'sub')
  const starterCount = starters.length
  const startersAtLimit = starterCount >= startersMax

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      await Promise.all([loadFormat(), loadConvocation(), loadRoster()])
    } catch (e) {
      // ignore — individual loaders handle their own errors
    }
    setLoading(false)
  }, [matchId, teamId, clubId])

  useEffect(() => { loadAll() }, [loadAll])

  const loadFormat = async () => {
    const { data, error } = await supabase.rpc('get_team_game_format', { p_team_id: teamId })
    if (error || !data) return
    const fmt = data as GameFormat
    setGameFormat(fmt)
    const { data: lim } = await supabase.rpc('get_convocation_limit', { p_format: fmt })
    setLimit(typeof lim === 'number' ? lim : null)
  }

  const loadConvocation = async () => {
    const { data: conv } = await supabase
      .from('match_convocations')
      .select('*')
      .eq('match_id', matchId)
      .maybeSingle()
    setConvocation(conv as ConvocationHeader | null)
    if (conv) {
      const { data: rows } = await supabase
        .from('match_convocation_players')
        .select(`
          id, convocation_id, member_id, origin_team_id, status,
          decline_reason, sort_order, notified_at, role, position_id,
          members (id, first_name, last_name, birth_date, position_main_id, availability, availability_until, availability_note, jersey_number, receives_convocations),
          teams:origin_team_id (name)
        `)
        .eq('convocation_id', conv.id)
        .order('sort_order', { ascending: true, nullsFirst: false })
      if (rows) setPlayers(rows.map((r: any) => ({ ...r, origin_team: r.teams || null })))
    } else {
      setPlayers([])
    }
  }

  const loadRoster = async () => {
    const [junctionRes, directRes] = await Promise.all([
      supabase
        .from('team_members')
        .select('members (id, first_name, last_name, birth_date, availability, availability_until, availability_note, jersey_number, receives_convocations)')
        .eq('team_id', teamId),
      supabase
        .from('members')
        .select('id, first_name, last_name, birth_date, availability, availability_until, availability_note, jersey_number, receives_convocations')
        .eq('team_id', teamId),
    ])
    const fromJunction: RosterMember[] = (junctionRes.data as any[] || [])
      .map((r: any) => r.members)
      .filter(Boolean)
    const fromDirect: RosterMember[] = (directRes.data as any[] || [])
    const seen = new Set<string>()
    const merged: RosterMember[] = []
    for (const m of [...fromJunction, ...fromDirect]) {
      if (!seen.has(m.id)) { seen.add(m.id); merged.push(m) }
    }
    merged.sort((a, b) => a.last_name.localeCompare(b.last_name, 'fr') || a.first_name.localeCompare(b.first_name, 'fr'))
    setRoster(merged)
  }

  const ensureConvocation = async (): Promise<string | null> => {
    if (convocation) return convocation.id
    if (!clubId) return null
    const { data, error } = await supabase
      .from('match_convocations')
      .insert({
        match_id: matchId,
        team_id: teamId,
        club_id: clubId,
        status: 'draft',
        created_by: user?.id || null,
      })
      .select('*')
      .single()
    if (error || !data) return null
    setConvocation(data as ConvocationHeader)
    return data.id
  }

  const addPlayer = async (memberId: string, originTeamId: string | null = null) => {
    if (isAtLimit) return
    setSaving(true)
    const convId = await ensureConvocation()
    if (!convId) { setSaving(false); return }
    const { data, error } = await supabase
      .from('match_convocation_players')
      .insert({
        convocation_id: convId,
        club_id: clubId,
        member_id: memberId,
        origin_team_id: originTeamId,
        status: 'convoked',
        sort_order: convokedCount + 1,
      })
      .select(`
        id, convocation_id, member_id, origin_team_id, status,
        decline_reason, sort_order, notified_at, role, position_id,
        members (id, first_name, last_name, birth_date, position_main_id, availability, availability_until, availability_note)
      `)
      .single()
    if (!error && data) {
      setPlayers(prev => [...prev, data as any])
    }
    setSaving(false)
  }

  const removePlayer = async (playerId: string) => {
    setSaving(true)
    const player = players.find(p => p.id === playerId)
    const isPublishedNow = convocation?.status === 'published'
    const wasNotified = player?.notified_at != null

    if (isPublishedNow && wasNotified && player?.member_id && convocation) {
      const { data: { session } } = await supabase.auth.getSession()
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const removePayload = {
          action: 'removed',
          convocation_id: convocation.id,
          member_id: player.member_id,
        }
      console.log('[Convocation] notify', removePayload)
      const res = await fetch(`${supabaseUrl}/functions/v1/notify-convocation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(removePayload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setToast(body.error || 'Erreur lors de la notification')
        setSaving(false)
        return
      }
    }

    const { error } = await supabase
      .from('match_convocation_players')
      .delete()
      .eq('convocation_id', convocation!.id)
      .eq('member_id', player!.member_id)
    if (error) {
      setToast(`Erreur: ${error.message}`)
      setSaving(false)
      return
    }

    await loadConvocation()
    setSaving(false)

    if (isPublishedNow && wasNotified) {
      setToast('Joueur retiré et notifié')
    }
  }

  const updateComposition = async (role: 'starter' | 'sub' | null, positionId: string | null) => {
    if (!compoSheet || !convocation) return
    setCompoSaving(true)
    const wasDeclined = compoSheet.status === 'declined'
    const updatePayload: Record<string, unknown> = { role, position_id: positionId }
    if (wasDeclined && role) {
      updatePayload.status = 'convoked'
      updatePayload.decline_reason = null
      updatePayload.responded_at = null
    }
    const { error } = await supabase
      .from('match_convocation_players')
      .update(updatePayload)
      .eq('id', compoSheet.id)
    if (!error) {
      setPlayers(prev => prev.map(p =>
        p.id === compoSheet.id ? { ...p, role, position_id: positionId, ...(wasDeclined && role ? { status: 'convoked' as const, decline_reason: null, responded_at: null } : {}) } : p
      ))
      if (wasDeclined && role) {
        const playerName = `${compoSheet.members?.last_name || ''} ${compoSheet.members?.first_name || ''}`.trim()
        const { data: { session } } = await supabase.auth.getSession()
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const reconvokePayload = { action: 'published', convocation_id: convocation.id, row_ids: [compoSheet.id] }
        console.log('[Convocation] notify', reconvokePayload)
        fetch(`${supabaseUrl}/functions/v1/notify-convocation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
          body: JSON.stringify(reconvokePayload),
        }).catch(() => {})
        setToast(`${playerName} re-convoqué et notifié`)
      }
    } else {
      setToast(`Erreur: ${error.message}`)
    }
    setCompoSaving(false)
  }

  const swapStarter = async (outgoingId: string, inheritedPositionId: string | null) => {
    if (!compoSheet || !convocation) return
    setCompoSaving(true)
    const outgoing = players.find(p => p.id === outgoingId)
    const outgoingIsDeclined = outgoing?.status === 'declined'
    const incomingWasDeclined = compoSheet.status === 'declined'

    let res1: { error: any }
    if (outgoingIsDeclined) {
      res1 = await supabase.from('match_convocation_players').delete().eq('id', outgoingId)
    } else {
      res1 = await supabase.from('match_convocation_players').update({ role: 'sub' as const, position_id: null }).eq('id', outgoingId)
    }
    const incomingUpdate: Record<string, unknown> = { role: 'starter' as const, position_id: inheritedPositionId }
    if (incomingWasDeclined) {
      incomingUpdate.status = 'convoked'
      incomingUpdate.decline_reason = null
      incomingUpdate.responded_at = null
    }
    const res2 = await supabase.from('match_convocation_players').update(incomingUpdate).eq('id', compoSheet.id)

    if (!res1.error && !res2.error) {
      if (outgoingIsDeclined) {
        setPlayers(prev => prev
          .filter(p => p.id !== outgoingId)
          .map(p => p.id === compoSheet.id ? { ...p, role: 'starter' as const, position_id: inheritedPositionId, ...(incomingWasDeclined ? { status: 'convoked' as const, decline_reason: null, responded_at: null } : {}) } : p)
        )
      } else {
        setPlayers(prev => prev.map(p => {
          if (p.id === outgoingId) return { ...p, role: 'sub' as const, position_id: null }
          if (p.id === compoSheet.id) return { ...p, role: 'starter' as const, position_id: inheritedPositionId, ...(incomingWasDeclined ? { status: 'convoked' as const, decline_reason: null, responded_at: null } : {}) }
          return p
        }))
      }
      const inName = `${compoSheet.members?.last_name || ''} ${compoSheet.members?.first_name || ''}`.trim()
      const outName = outgoing ? `${outgoing.members?.last_name || ''} ${outgoing.members?.first_name || ''}`.trim() : ''

      if (incomingWasDeclined) {
        const { data: { session } } = await supabase.auth.getSession()
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const swapPayload = { action: 'published', convocation_id: convocation.id, row_ids: [compoSheet.id] }
        console.log('[Convocation] notify', swapPayload)
        fetch(`${supabaseUrl}/functions/v1/notify-convocation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
          body: JSON.stringify(swapPayload),
        }).catch(() => {})
        setToast(`${inName} re-convoqué et notifié`)
      } else if (outgoingIsDeclined) {
        setToast(`${inName} remplace ${outName} — ${outName} retiré de la convocation`)
      } else {
        setToast(`${inName} remplace ${outName}`)
      }
    } else {
      setToast(`Erreur: ${res1.error?.message || res2.error?.message}`)
    }
    setCompoSaving(false)
  }

  const publish = async () => {
    if (!convocation) return
    setPublishing(true)
    await supabase
      .from('match_convocations')
      .update({ status: 'published', published_at: new Date().toISOString() })
      .eq('id', convocation.id)
    setConvocation(prev => prev ? { ...prev, status: 'published', published_at: new Date().toISOString() } : prev)

    const { data: { session } } = await supabase.auth.getSession()
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const payload = { action: 'published', convocation_id: convocation.id }
    console.log('[Convocation] notify', payload)
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/notify-convocation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(payload),
      })
      const result = await res.json()
      const count = result?.notified ?? players.length
      const now = new Date().toISOString()
      setPlayers(prev => prev.map(p => p.notified_at ? p : { ...p, notified_at: now }))
      setToast(`${count} joueur${count > 1 ? 's' : ''} notifié${count > 1 ? 's' : ''}`)
      await loadConvocation()
    } catch {
      setToast('Convocation publiée')
    }
    setPublishing(false)
  }

  const changeMeetingMinutes = async (delta: number) => {
    if (!convocation) return
    const previous = convocation.meeting_minutes_before ?? 45
    const value = Math.min(240, Math.max(0, previous + delta))
    if (value === previous) return
    setConvocation(prev => prev ? { ...prev, meeting_minutes_before: value } : prev)
    const { error } = await supabase
      .from('match_convocations')
      .update({ meeting_minutes_before: value })
      .eq('id', convocation.id)
    if (error) {
      setConvocation(prev => prev ? { ...prev, meeting_minutes_before: previous } : prev)
      setToast(`Erreur: ${error.message}`)
    }
  }

  const togglePublishLineup = async (value: boolean) => {
    if (!convocation) return
    const previous = convocation.publish_lineup
    setConvocation(prev => prev ? { ...prev, publish_lineup: value } : prev)
    setLineupSaving(true)
    const { error } = await supabase
      .from('match_convocations')
      .update({ publish_lineup: value })
      .eq('id', convocation.id)
    if (error) {
      setConvocation(prev => prev ? { ...prev, publish_lineup: previous } : prev)
      setToast(`Erreur: ${error.message}`)
    }
    setLineupSaving(false)
  }

  const notifyNew = async () => {
    if (!convocation) return
    const unnotified = players.filter(p => !p.notified_at && p.status !== 'declined')
    if (unnotified.length === 0) return
    setNotifying(true)
    const { data: { session } } = await supabase.auth.getSession()
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const payload = { action: 'published', convocation_id: convocation.id, row_ids: unnotified.map(p => p.id) }
    console.log('[Convocation] notify', payload)
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/notify-convocation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(payload),
      })
      const result = await res.json()
      const count = result?.notified ?? unnotified.length
      const now = new Date().toISOString()
      setPlayers(prev => prev.map(p => !p.notified_at && p.status !== 'declined' ? { ...p, notified_at: now } : p))
      setToast(`${count} joueur${count > 1 ? 's' : ''} notifié${count > 1 ? 's' : ''}`)
      await loadConvocation()
    } catch {
      setToast('Notification envoyée')
    }
    setNotifying(false)
  }

  const searchOtherPlayers = async (query: string) => {
    setOtherSearch(query)
    if (query.length < 2) { setOtherResults([]); return }
    setSearchingOthers(true)
    const { data } = await supabase
      .from('team_members')
      .select('team_id, teams (id, name), members (id, first_name, last_name, birth_date)')
      .neq('team_id', teamId)
    if (data) {
      const q = query.toLowerCase()
      const filtered = (data as any[])
        .filter(r => r.members && (
          r.members.first_name.toLowerCase().includes(q) ||
          r.members.last_name.toLowerCase().includes(q)
        ))
        .map(r => ({
          ...r.members,
          team_name: r.teams?.name || 'Autre équipe',
          team_id: r.team_id,
        }))
      filtered.sort((a, b) => a.last_name.localeCompare(b.last_name, 'fr') || a.first_name.localeCompare(b.first_name, 'fr'))
      setOtherResults(filtered)
    }
    setSearchingOthers(false)
  }

  const isPlayerConvoked = (memberId: string) => players.some(p => p.member_id === memberId)

  const getBirthYear = (birthDate: string | null) => {
    if (!birthDate) return ''
    return birthDate.split('-')[0]
  }

  const getAttendanceBadge = (memberId: string) => {
    const att = attendanceMap[memberId]
    const status = att?.status
    if (attendanceDefaultPresent) {
      if (status === 'present_real') return { label: 'Présent(e) — constaté', variant: 'green' as const, isAbsent: false }
      if (status === 'absent_justified' || status === 'absent_unjustified') {
        const reason = att?.absence_reason
        const label = reason ? `Absent(e) — ${reason}` : 'Absent(e)'
        return { label, variant: 'red' as const, isAbsent: true }
      }
      return { label: 'Présent(e) par défaut', variant: 'green-outline' as const, isAbsent: false }
    }
    if (!status || status === 'pending') return { label: 'Sans réponse', variant: 'neutral' as const, isAbsent: false }
    if (status === 'confirmed' || status === 'present_real') return { label: 'Présent', variant: 'green' as const, isAbsent: false }
    return { label: 'Absent', variant: 'red' as const, isAbsent: false }
  }

  const getPlayerStatusLine = (player: ConvocationPlayer) => {
    if (attendanceDefaultPresent) {
      if (player.status === 'declined') {
        const reason = player.decline_reason ? ` — ${player.decline_reason}` : ''
        return { text: `Convoqué · Absent(e)${reason}`, color: 'var(--danger-text)', icon: 'x' as const }
      }
      const att = player.member_id ? attendanceMap[player.member_id] : undefined
      const aStatus = att?.status
      if (aStatus === 'absent_justified' || aStatus === 'absent_unjustified') {
        const reason = att?.absence_reason ? ` — ${att.absence_reason}` : ''
        return { text: `Convoqué · Absent(e)${reason}`, color: 'var(--danger-text)', icon: 'x' as const }
      }
      if (aStatus === 'present_real') return { text: 'Convoqué · Présent(e) — constaté', color: 'var(--success-text)', icon: 'check' as const }
      return { text: 'Convoqué · Présent(e) par défaut', color: 'var(--success-text)', icon: 'check' as const }
    }
    if (player.status === 'confirmed') return { text: 'Confirmé', color: 'var(--success-text)', icon: 'check' as const }
    if (player.status === 'declined') {
      const reason = player.decline_reason ? ` — ${player.decline_reason}` : ''
      return { text: `Décliné${reason}`, color: 'var(--danger-text)', icon: 'x' as const }
    }
    return { text: 'Convoqué · Sans réponse', color: 'var(--text-muted)', icon: null }
  }

  const getPositionName = (posId: string | null) => {
    if (!posId) return null
    return positions.find(p => p.id === posId)?.name || null
  }

  const getCompoLabel = (player: ConvocationPlayer) => {
    if (player.role === 'starter') {
      const pos = getPositionName(player.position_id)
      return pos ? `Titulaire — ${pos}` : 'Titulaire'
    }
    if (player.role === 'sub') return 'Remplaçant'
    return null
  }

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000)
      return () => clearTimeout(t)
    }
  }, [toast])

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Chargement convocation...
      </div>
    )
  }

  if (gameFormat === 'ecole') return null

  const isDraft = !convocation || convocation.status === 'draft'
  const isPublished = convocation?.status === 'published'
  const hasUnnotified = isPublished && players.some(p => !p.notified_at && p.status !== 'declined')
  const publishLineup = convocation?.publish_lineup !== false

  const unavailableConvoked = players.filter(p => {
    return isUnavailableForMatch(p.members?.availability, p.members?.availability_until, matchDate)
  })

  const sortedPlayers = [...players].sort((a, b) => {
    const aLast = a.members?.last_name || ''
    const bLast = b.members?.last_name || ''
    const aFirst = a.members?.first_name || ''
    const bFirst = b.members?.first_name || ''
    return aLast.localeCompare(bLast, 'fr') || aFirst.localeCompare(bFirst, 'fr')
  })

  const compositionPlayers = [...players].sort((a, b) => {
    const roleOrder = (r: string | null) => r === 'starter' ? 0 : r === 'sub' ? 1 : 2
    const ra = roleOrder(a.role)
    const rb = roleOrder(b.role)
    if (ra !== rb) return ra - rb
    const posA = a.position_id ? (positions.find(p => p.id === a.position_id)?.sort_order ?? 999) : 999
    const posB = b.position_id ? (positions.find(p => p.id === b.position_id)?.sort_order ?? 999) : 999
    if (posA !== posB) return posA - posB
    return (a.members?.last_name || '').localeCompare(b.members?.last_name || '', 'fr')
  })

  const availableRosterAll = roster.filter(m => !isPlayerConvoked(m.id))
  const availableRoster = availableRosterAll.filter(m => m.receives_convocations !== false)
  const noConvRoster = availableRosterAll.filter(m => m.receives_convocations === false)
  const availableOthers = otherResults.filter(m => !isPlayerConvoked(m.id))

  return (
    <div className="conv-wrapper">
      {/* Header */}
      <div className="conv-header">
        <Users size={18} style={{ color: 'var(--accent)' }} />
        <span className="conv-title">Convocation</span>
      </div>

      {/* Sticky counter */}
      <div className={`conv-counter ${isAtLimit ? 'conv-counter--limit' : ''} ${isOverLimit ? 'conv-counter--over' : ''}`}>
        Convoqués : {convokedCount}{limit ? `/${limit}` : ''}
        {isAtLimit && !isOverLimit && <span className="conv-counter-hint"> — Limite atteinte</span>}
        {isOverLimit && <span className="conv-counter-hint"> — Limite dépassée</span>}
      </div>

      {/* Unavailable convoked warning */}
      {unavailableConvoked.length > 0 && (
        <div style={{ padding: '10px 16px 0' }}>
          <div style={{ background: 'color-mix(in srgb, var(--warning) 12%, var(--bg-card))', border: '1px solid var(--warning)', borderRadius: '10px', padding: '12px 14px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <AlertTriangle size={18} style={{ color: 'var(--warning-text)', flexShrink: 0, marginTop: '1px' }} />
            <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: '1.5' }}>
              {unavailableConvoked.length === 1 ? (
                <span>
                  1 joueur convoqué est indisponible : {unavailableConvoked[0].members?.last_name} {unavailableConvoked[0].members?.first_name} — {availabilityLabel(unavailableConvoked[0].members?.availability)}{unavailableConvoked[0].members?.availability_until ? `, retour prévu le ${new Date(unavailableConvoked[0].members.availability_until).toLocaleDateString('fr-CH')}` : ', durée non précisée'}
                </span>
              ) : (
                <>
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>{unavailableConvoked.length} joueurs convoqués sont indisponibles :</div>
                  {unavailableConvoked.map(p => (
                    <div key={p.id}>{p.members?.last_name} {p.members?.first_name} — {availabilityLabel(p.members?.availability)}{p.members?.availability_until ? `, retour prévu le ${new Date(p.members.availability_until).toLocaleDateString('fr-CH')}` : ', durée non précisée'}</div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Draft banner */}
      {isDraft && players.length > 0 && (
        <div style={{ padding: '10px 16px' }}>
          <Alert variant="warning" title="Brouillon — les joueurs ne sont pas encore notifiés" />
        </div>
      )}

      {/* Amber alert for unnotified players */}
      {hasUnnotified && !readOnly && (() => {
        const unnotifiedPlayers = players.filter(p => !p.notified_at && p.status !== 'declined')
        return (
          <div style={{ padding: '10px 16px 0' }}>
            <div style={{ background: 'color-mix(in srgb, var(--warning) 12%, var(--bg-card))', border: '1px solid var(--warning)', borderRadius: '10px', padding: '12px 14px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <AlertTriangle size={18} style={{ color: 'var(--warning-text)', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', color: 'var(--warning-text)', fontWeight: 600, flex: 1 }}>
                {unnotifiedPlayers.length} joueur{unnotifiedPlayers.length > 1 ? 's' : ''} ajouté{unnotifiedPlayers.length > 1 ? 's' : ''} pas encore notifié{unnotifiedPlayers.length > 1 ? 's' : ''}
              </span>
              <Button
                variant="primary"
                size="sm"
                loading={notifying}
                onClick={notifyNew}
                disabled={isOverLimit}
                leftIcon={<Send size={14} />}
                style={{ background: 'var(--warning)', color: '#fff', flexShrink: 0 }}
              >
                Notifier les modifications
              </Button>
            </div>
          </div>
        )
      })()}

      {/* Convoked player cards */}
      <div className="conv-cards">
        {players.length === 0 && (
          <div className="conv-empty">
            {readOnly ? 'Aucun joueur convoqué.' : 'Aucun joueur convoqué. Sélectionnez des joueurs ci-dessous.'}
          </div>
        )}
        {sortedPlayers.map(player => {
          const statusLine = isPublished ? getPlayerStatusLine(player) : null
          const compoLabel = getCompoLabel(player)
          const isDeclined = player.status === 'declined'
          const pAvail = player.members?.availability
          const pIsUnavailable = isUnavailableForMatch(pAvail, player.members?.availability_until, matchDate)
          const pBadgeVar = pIsUnavailable ? availabilityBadgeVariant(pAvail) : null
          const cardStyle: React.CSSProperties = isDeclined
            ? { border: '2px solid var(--danger)', background: 'color-mix(in srgb, var(--danger) 8%, var(--bg-card))' }
            : pIsUnavailable
            ? { opacity: 0.55 }
            : {}
          return (
            <div key={player.id} className="conv-card conv-card--selected" style={cardStyle}>
              <div className="conv-card-main">
                <div className="conv-card-info">
                  <div className="conv-card-name" style={isDeclined ? { textDecoration: 'line-through', opacity: 0.7 } : undefined}>
                    {player.members?.jersey_number != null && <span style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', fontSize: '10px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', marginRight: '2px' }}>#{player.members.jersey_number}</span>}
                    {player.members?.last_name} {player.members?.first_name}
                    {player.members?.birth_date && (
                      <span className="conv-card-year">({getBirthYear(player.members.birth_date)})</span>
                    )}
                    {isPublished && !player.notified_at && player.status !== 'declined' && (
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', background: 'color-mix(in srgb, var(--warning) 18%, var(--bg-card))', color: 'var(--warning-text)', marginLeft: '4px', whiteSpace: 'nowrap' }}>À notifier</span>
                    )}
                  </div>
                  {player.origin_team_id && player.origin_team && (
                    <span className="conv-card-sub">{player.origin_team.name}</span>
                  )}
                  {pIsUnavailable && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {pBadgeVar && <Badge variant={pBadgeVar}>{availabilityLabel(pAvail)}</Badge>}
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {player.members?.availability_until
                          ? `Retour prévu le ${new Date(player.members.availability_until).toLocaleDateString('fr-CH')}`
                          : 'Durée non précisée'}
                      </span>
                    </div>
                  )}
                  {pIsUnavailable && player.members?.availability_note && (
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      Remarque : {player.members.availability_note}
                    </span>
                  )}
                  {compoLabel && (
                    <span className={`conv-card-compo ${player.role === 'starter' ? 'conv-card-compo--starter' : 'conv-card-compo--sub'}`}>
                      {compoLabel}
                    </span>
                  )}
                  {statusLine && (
                    <span className="conv-card-status" style={{ color: statusLine.color, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      {statusLine.icon === 'check' && <CircleCheck size={12} aria-hidden="true" />}
                      {statusLine.icon === 'x' && <CircleX size={12} aria-hidden="true" />}
                      {statusLine.text}
                    </span>
                  )}
                </div>
                {!readOnly && (
                  <button
                    onClick={() => removePlayer(player.id)}
                    disabled={saving}
                    className="conv-btn-remove"
                    title="Retirer"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Composition section */}
      {players.length > 0 && (
        <div className="conv-section">
          <div className="conv-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
            <LayoutGrid size={18} style={{ color: 'var(--accent)' }} />
            <span className="conv-title">Composition</span>
          </div>

          {!publishLineup && (
            <div style={{ padding: '4px 16px 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Composition non publiée — visible seulement par le staff
            </div>
          )}

          {/* Sticky starters counter */}
          <div className="conv-counter compo-starter-counter">
            Titulaires : {starterCount}/{startersMax}
          </div>

          <div className="conv-cards">
            {compositionPlayers.map(player => {
              const compoLabel = getCompoLabel(player)
              const isDeclined = player.status === 'declined'
              const cAvail = player.members?.availability
              const cIsUnavailable = isUnavailableForMatch(cAvail, player.members?.availability_until, matchDate)
              const cBadgeVar = cIsUnavailable ? availabilityBadgeVariant(cAvail) : null
              const compoStyle: React.CSSProperties = {
                cursor: readOnly ? 'default' : 'pointer',
                ...(isDeclined ? { border: '2px solid var(--danger)', background: 'color-mix(in srgb, var(--danger) 8%, var(--bg-card))' } : cIsUnavailable ? { opacity: 0.55 } : {}),
              }
              return (
                <div
                  key={player.id}
                  className={`conv-card ${player.role === 'starter' ? 'conv-card--starter' : player.role === 'sub' ? 'conv-card--sub' : ''}`}
                  onClick={readOnly ? undefined : () => setCompoSheet(player)}
                  style={compoStyle}
                >
                  <div className="conv-card-main">
                    <div className="conv-card-info">
                      <div className="conv-card-name" style={{ textDecoration: isDeclined ? 'line-through' : undefined, opacity: isDeclined ? 0.6 : 1 }}>
                        {player.members?.jersey_number != null && <span style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', fontSize: '10px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', marginRight: '2px' }}>#{player.members.jersey_number}</span>}
                        {player.members?.last_name} {player.members?.first_name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {isDeclined && <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--danger-text)', background: 'var(--danger-soft)', padding: '2px 8px', borderRadius: '999px' }}>Absent</span>}
                        {cIsUnavailable && cBadgeVar && <Badge variant={cBadgeVar}>{availabilityLabel(cAvail)}</Badge>}
                        {compoLabel ? (
                          <span className={`conv-card-compo ${player.role === 'starter' ? 'conv-card-compo--starter' : 'conv-card-compo--sub'}`}>
                            {compoLabel}
                          </span>
                        ) : (
                          <span className="conv-card-compo" style={{ color: 'var(--text-muted)' }}>Non placé</span>
                        )}
                      </div>
                    </div>
                    {!readOnly && <ChevronDown size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Roster: team players not yet convoked */}
      <div className="conv-section">
        <div className="conv-section-title">Effectif de l'équipe</div>
        {availableRoster.length === 0 ? (
          <div className="conv-empty">Tous les joueurs de l'équipe sont déjà convoqués.</div>
        ) : (
          <div className="conv-cards">
            {availableRoster.map(member => {
              const att = getAttendanceBadge(member.id)
              const isUnavailable = isUnavailableForMatch(member.availability, member.availability_until, matchDate)
              const addDisabled = isAtLimit || saving || att.isAbsent || isUnavailable
              const addTitle = isUnavailable ? 'Joueur indisponible' : att.isAbsent ? 'Joueur absent' : isAtLimit ? 'Limite atteinte' : 'Convoquer'
              return (
                <div key={member.id} className="conv-card" style={isUnavailable ? { opacity: 0.55 } : undefined}>
                  <div className="conv-card-main">
                    <div className="conv-card-info">
                      <div className="conv-card-name">
                        {member.jersey_number != null && <span style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', fontSize: '10px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', marginRight: '2px' }}>#{member.jersey_number}</span>}
                        {member.last_name} {member.first_name}
                        {member.birth_date && (
                          <span className="conv-card-year">({getBirthYear(member.birth_date)})</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {isUnavailable ? (
                          <Badge variant="orange" className="max-w-full min-w-0">
                            <span className="truncate" title={unavailabilityBadgeText(member.availability, member.availability_until)}>{unavailabilityBadgeText(member.availability, member.availability_until)}</span>
                          </Badge>
                        ) : (
                          <Badge variant={att.variant} className="max-w-full min-w-0">
                            <span className="truncate" title={att.label}>{att.label}</span>
                          </Badge>
                        )}
                      </div>
                    </div>
                    {!readOnly && (
                      <button
                        onClick={() => addPlayer(member.id)}
                        disabled={addDisabled}
                        className={`conv-btn-add ${addDisabled ? 'conv-btn-add--disabled' : ''}`}
                        title={addTitle}
                      >
                        <Plus size={18} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Sans convocation - collapsed group */}
      {noConvRoster.length > 0 && (
        <div className="conv-section">
          <button
            onClick={() => setNoConvExpanded(!noConvExpanded)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0', color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600, width: '100%' }}
          >
            {noConvExpanded ? '▾' : '▸'} Sans convocation ({noConvRoster.length})
          </button>
          {noConvExpanded && (
            <div className="conv-cards">
              {noConvRoster.map(member => (
                <div key={member.id} className="conv-card" style={{ opacity: 0.55 }}>
                  <div className="conv-card-main">
                    <div className="conv-card-info">
                      <div className="conv-card-name">
                        {member.jersey_number != null && <span style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', fontSize: '10px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', marginRight: '2px' }}>#{member.jersey_number}</span>}
                        {member.last_name} {member.first_name}
                      </div>
                      <Badge variant="neutral">Sans convocation</Badge>
                    </div>
                    {!readOnly && (
                      <button
                        onClick={() => addPlayer(member.id)}
                        disabled={isAtLimit || saving}
                        className={`conv-btn-add ${isAtLimit ? 'conv-btn-add--disabled' : ''}`}
                        title={isAtLimit ? 'Limite atteinte' : 'Convoquer'}
                      >
                        <Plus size={18} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Other players - collapsible on mobile */}
      {!readOnly && (
      <div className="conv-section conv-others">
        <button
          className="conv-others-toggle"
          onClick={() => setOthersExpanded(!othersExpanded)}
        >
          <span className="conv-section-title" style={{ margin: 0 }}>Autres joueurs du club</span>
          {othersExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {othersExpanded && (
          <div className="conv-others-content">
            <SearchInput
              value={otherSearch}
              onChange={searchOtherPlayers}
              placeholder="Rechercher un joueur..."
              inputSize="sm"
            />
            {availableOthers.length > 0 && (
              <div className="conv-cards" style={{ marginTop: '8px' }}>
                {availableOthers.map(member => {
                  const att = getAttendanceBadge(member.id)
                  const addDisabled = isAtLimit || saving || att.isAbsent
                  const addTitle = att.isAbsent ? 'Joueur absent' : isAtLimit ? 'Limite atteinte' : 'Convoquer'
                  return (
                    <div key={member.id} className="conv-card">
                      <div className="conv-card-main">
                        <div className="conv-card-info">
                          <div className="conv-card-name">
                            {member.last_name} {member.first_name}
                            {member.birth_date && (
                              <span className="conv-card-year">({getBirthYear(member.birth_date)})</span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <Badge variant="sky">{member.team_name}</Badge>
                            <Badge variant={att.variant}>{att.label}</Badge>
                          </div>
                        </div>
                        <button
                          onClick={() => addPlayer(member.id, member.team_id)}
                          disabled={addDisabled}
                          className={`conv-btn-add ${addDisabled ? 'conv-btn-add--disabled' : ''}`}
                          title={addTitle}
                        >
                          <Plus size={18} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* Action buttons */}
      {players.length > 0 && (!readOnly || isPublished) && (
        <div className="conv-actions">
          {convocation && !readOnly && (
            <div style={{ width: '100%' }}>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Rendez-vous avant le match</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => changeMeetingMinutes(-15)}
                  disabled={(convocation.meeting_minutes_before ?? 45) <= 0}
                  aria-label="Diminuer de 15 minutes"
                >
                  −
                </Button>
                <span style={{ minWidth: '64px', textAlign: 'center', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {convocation.meeting_minutes_before ?? 45} min
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => changeMeetingMinutes(15)}
                  disabled={(convocation.meeting_minutes_before ?? 45) >= 240}
                  aria-label="Augmenter de 15 minutes"
                >
                  +
                </Button>
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                {meetingTimeLine(matchTime, convocation.meeting_minutes_before ?? 45) ?? 'Heure du match pas encore fixée'}
              </p>
            </div>
          )}
          {convocation && !readOnly && (
            <div style={{ width: '100%' }}>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Publier la composition</label>
              <Toggle checked={publishLineup} onChange={togglePublishLineup} disabled={lineupSaving} />
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                {publishLineup
                  ? 'Les joueurs et les parents verront les titulaires, les remplaçants et les postes.'
                  : 'Les joueurs et les parents verront la liste des convoqués, sans les postes ni les titulaires.'}
              </p>
            </div>
          )}
          {isDraft && !readOnly && (
            <Button
              variant="primary"
              size="sm"
              loading={publishing}
              onClick={publish}
              disabled={isOverLimit}
              leftIcon={<Send size={14} />}
            >
              Publier et notifier
            </Button>
          )}

          {isOverLimit && !readOnly && (
            <span style={{ fontSize: '13px', color: 'var(--danger-text)' }}>
              Retirez des joueurs avant de publier
            </span>
          )}
          {isPublished && !hasUnnotified && (
            <div style={{ fontSize: '13px', color: 'var(--success-text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Check size={14} /> Convocation publiée et notifiée
            </div>
          )}
        </div>
      )}

      {/* Composition sheet */}
      {compoSheet && !readOnly && (
        <CompositionSheet
          jerseyNumber={compoSheet.members?.jersey_number}
          open={!!compoSheet}
          onClose={() => setCompoSheet(null)}
          playerName={`${compoSheet.members?.last_name || ''} ${compoSheet.members?.first_name || ''}`}
          currentRole={compoSheet.role}
          currentPositionId={compoSheet.position_id}
          defaultPositionId={compoSheet.members?.position_main_id || null}
          startersAtLimit={startersAtLimit}
          currentStarters={starters.map(s => ({
            id: s.id,
            member_id: s.member_id,
            playerName: `${s.members?.last_name || ''} ${s.members?.first_name || ''}`,
            position_id: s.position_id,
            positionName: getPositionName(s.position_id),
          }))}
          onSave={updateComposition}
          onSwap={swapStarter}
          saving={compoSaving}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="conv-toast">{toast}</div>
      )}
    </div>
  )
}
