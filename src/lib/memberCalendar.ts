import { supabase } from './supabase'
import type { TrainingAttendanceState } from './trainingAttendance'

export interface ScheduleTeam {
  id: string
  name: string
}

export interface ScheduleChild {
  memberId: string
  memberName: string
  teamId: string
  gender: string | null
}

export interface MatchRow {
  id: string
  match_date: string
  match_time: string | null
  opponent_name: string
  is_home: boolean
  status: string
  designation: string | null
  cancellation_reason: string | null
  match_number: string | null
  score_for: number | null
  score_against: number | null
  forfeit: 'for' | 'against' | null
  penalties_for: number | null
  penalties_against: number | null
  venues: {
    name: string
    city: string
    field_name: string | null
    address: string | null
  } | null
  teams: {
    id: string
    name: string
  } | null
}

export interface TrainingSessionRow {
  id: string
  team_id: string
  session_date: string
  start_time: string | null
  end_time: string | null
  terrain_name: string | null
  cancelled: boolean
  cancelled_reason: string | null
  rain_applied?: boolean
  rain_plan_defined?: boolean
  rain_note?: string | null
  base_terrain_name?: string | null
  base_start_time?: string | null
  base_end_time?: string | null
}

export interface MatchAttendanceSummary {
  confirmed: number
  absent: number
  pending: number
}

export interface MatchAttendanceRecord {
  id: string
  status: string
  absence_reason: string | null
}

const MATCH_SELECT = `
  id, match_date, match_time, opponent_name, is_home, status,
  designation, cancellation_reason, match_number,
  score_for, score_against, forfeit, penalties_for, penalties_against,
  venues (name, city, field_name, address),
  teams (id, name)
`

const VIEW_SESSION_SELECT = `
  id, team_id, session_date, cancelled, cancelled_reason,
  effective_start_time, effective_end_time,
  effective_terrain_name, base_terrain_name, terrain_half_label,
  rain_applied, rain_plan_defined, rain_note,
  base_start_time, base_end_time
`

// Resolve a member's team: direct FK first, then the team_members junction.
// Mirrors the dashboard's working resolveTeamId so all screens agree.
async function resolveTeamId(memberId: string): Promise<string | null> {
  const { data: member, error: memberErr } = await supabase
    .from('members')
    .select('team_id')
    .eq('id', memberId)
    .maybeSingle()
  if (memberErr) console.warn('[getMemberContext] members.team_id lookup error', memberErr)
  if (member?.team_id) return member.team_id

  const { data: tm, error: tmErr } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('member_id', memberId)
    .order('joined_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (tmErr) console.warn('[getMemberContext] team_members lookup error', tmErr)
  return tm?.team_id ?? null
}

// Single source of truth for "my teams / my children" in the member hat.
// ALWAYS combines BOTH sources, independent of any other role the user holds:
//   1. the user's own member row (if they are a player themselves)
//   2. parent_members: their children
// Team resolution uses the junction fallback, so a child linked only via
// team_members (no members.team_id) is still found.
export async function getMemberContext(
  userId: string,
  email: string
): Promise<{ teams: ScheduleTeam[]; children: ScheduleChild[] }> {
  const candidates: { id: string; name: string; gender: string | null }[] = []

  // Own member row: profile_id first, then email, then members.id last.
  let own: { id: string; first_name: string; last_name: string; gender?: string | null } | null = null
  const { data: ownByProfile, error: ownByProfileErr } = await supabase
    .from('members')
    .select('id, first_name, last_name, gender')
    .eq('profile_id', userId)
    .maybeSingle()
  if (ownByProfileErr) console.warn('[getMemberContext] own member by profile_id error', ownByProfileErr)
  own = (ownByProfile as any) ?? null
  if (!own && email) {
    const { data: ownByEmail, error: ownByEmailErr } = await supabase
      .from('members')
      .select('id, first_name, last_name, gender')
      .ilike('email', email)
      .maybeSingle()
    if (ownByEmailErr) console.warn('[getMemberContext] own member by email error', ownByEmailErr)
    own = (ownByEmail as any) ?? null
  }
  if (!own) {
    const { data: ownById, error: ownByIdErr } = await supabase
      .from('members')
      .select('id, first_name, last_name, gender')
      .eq('id', userId)
      .maybeSingle()
    if (ownByIdErr) console.warn('[getMemberContext] own member by id error', ownByIdErr)
    own = (ownById as any) ?? null
  }
  if (own) {
    candidates.push({ id: own.id, name: `${own.first_name || ''} ${own.last_name || ''}`.trim(), gender: (own as any).gender ?? null })
  }

  // Children via parent_members (filtered on parent_user_id = auth user id).
  const { data: parentLinks, error: parentErr } = await supabase
    .from('parent_members')
    .select('members:member_id (id, first_name, last_name, gender)')
    .eq('parent_user_id', userId)
  if (parentErr) console.warn('[getMemberContext] parent_members error', parentErr)

  for (const link of (parentLinks as any[]) || []) {
    const m = link.members
    if (m) candidates.push({ id: m.id, name: `${m.first_name || ''} ${m.last_name || ''}`.trim(), gender: m.gender ?? null })
  }

  // Resolve each unique member to a team (via junction fallback).
  const seen = new Set<string>()
  const children: ScheduleChild[] = []
  for (const c of candidates) {
    if (seen.has(c.id)) continue
    seen.add(c.id)
    const teamId = await resolveTeamId(c.id)
    children.push({ memberId: c.id, memberName: c.name, teamId: teamId || '', gender: c.gender })
  }

  // Fetch names for the resolved teams.
  const teamsMap = new Map<string, ScheduleTeam>()
  const teamIds = [...new Set(children.map((c) => c.teamId).filter(Boolean))]
  if (teamIds.length > 0) {
    const { data: teamRows, error: teamsErr } = await supabase
      .from('teams')
      .select('id, name')
      .in('id', teamIds)
    if (teamsErr) console.warn('[getMemberContext] teams lookup error', teamsErr)
    for (const t of (teamRows as any[]) || []) teamsMap.set(t.id, { id: t.id, name: t.name })
  }

  return { teams: [...teamsMap.values()], children }
}

export async function fetchMatchesByTeamIds(teamIds: string[]): Promise<MatchRow[]> {
  if (teamIds.length === 0) return []
  const { data } = await supabase
    .from('matches')
    .select(MATCH_SELECT)
    .in('team_id', teamIds)
    .order('match_date', { ascending: true })
  return (data as unknown as MatchRow[]) || []
}

export async function fetchMatchAttendance(
  matchIds: string[],
  myMemberIds: string[]
): Promise<{
  summaries: Record<string, MatchAttendanceSummary>
  personal: Record<string, Record<string, MatchAttendanceRecord>>
  absentByMatch: Record<string, Set<string>>
  totalByMatch: Record<string, number>
}> {
  const summaries: Record<string, MatchAttendanceSummary> = {}
  const personal: Record<string, Record<string, MatchAttendanceRecord>> = {}
  const absentByMatch: Record<string, Set<string>> = {}
  const totalByMatch: Record<string, number> = {}
  if (matchIds.length === 0) return { summaries, personal, absentByMatch, totalByMatch }

  const { data } = await supabase
    .from('match_attendance')
    .select('match_id, member_id, id, status, absence_reason')
    .in('match_id', matchIds)

  const mine = new Set(myMemberIds)
  for (const row of (data as any[]) || []) {
    if (!summaries[row.match_id]) summaries[row.match_id] = { confirmed: 0, absent: 0, pending: 0 }
    if (row.status === 'confirmed') summaries[row.match_id].confirmed++
    else if (row.status === 'absent_justified' || row.status === 'absent_unjustified') summaries[row.match_id].absent++
    else summaries[row.match_id].pending++

    totalByMatch[row.match_id] = (totalByMatch[row.match_id] || 0) + 1

    if (row.status === 'absent_justified' || row.status === 'absent_unjustified') {
      if (!absentByMatch[row.match_id]) absentByMatch[row.match_id] = new Set()
      absentByMatch[row.match_id].add(row.member_id)
    }

    if (mine.has(row.member_id)) {
      if (!personal[row.match_id]) personal[row.match_id] = {}
      personal[row.match_id][row.member_id] = {
        id: row.id,
        status: row.status,
        absence_reason: row.absence_reason,
      }
    }
  }

  return { summaries, personal, absentByMatch, totalByMatch }
}

export async function fetchTrainingSessionsForTeam(
  teamId: string,
  fromDate: string,
  toDate: string
): Promise<TrainingSessionRow[]> {
  const { data } = await supabase
    .from('v_training_sessions_effective')
    .select(VIEW_SESSION_SELECT)
    .eq('team_id', teamId)
    .gte('session_date', fromDate)
    .lte('session_date', toDate)
    .order('session_date', { ascending: true })

  return ((data as any[]) || []).map((s) => {
    return {
      id: s.id,
      team_id: s.team_id,
      session_date: s.session_date,
      start_time: s.effective_start_time || null,
      end_time: s.effective_end_time || null,
      terrain_name: s.effective_terrain_name || null,
      cancelled: !!s.cancelled,
      cancelled_reason: s.cancelled_reason || null,
      rain_applied: !!s.rain_applied,
      rain_plan_defined: !!s.rain_plan_defined,
      rain_note: s.rain_note || null,
      base_terrain_name: s.base_terrain_name || null,
      base_start_time: s.base_start_time || null,
      base_end_time: s.base_end_time || null,
    };
  })
}

const FLAT_SESSION_SELECT = `
  id, team_id, session_date, cancelled, cancelled_reason,
  effective_start_time, effective_end_time,
  effective_terrain_name, base_terrain_name, terrain_half_label,
  rain_applied, rain_plan_defined, rain_note,
  base_start_time, base_end_time
`

export async function fetchTrainingSessionsForTeams(
  teamIds: string[],
  fromDate: string,
  toDate: string
): Promise<TrainingSessionRow[]> {
  if (teamIds.length === 0) return []
  const { data, error } = await supabase
    .from('v_training_sessions_effective')
    .select(FLAT_SESSION_SELECT)
    .in('team_id', teamIds)
    .gte('session_date', fromDate)
    .lte('session_date', toDate)
    .order('session_date', { ascending: true })

  if (error) {
    console.error('[fetchTrainingSessionsForTeams]', error)
    return []
  }

  return ((data as any[]) || []).map((s) => ({
    id: s.id,
    team_id: s.team_id,
    session_date: s.session_date,
    start_time: s.effective_start_time || null,
    end_time: s.effective_end_time || null,
    terrain_name: s.terrain_half_label
      ? `${s.effective_terrain_name} – ${s.terrain_half_label}`
      : s.effective_terrain_name || null,
    cancelled: !!s.cancelled,
    cancelled_reason: s.cancelled_reason || null,
    rain_applied: !!s.rain_applied,
    rain_plan_defined: !!s.rain_plan_defined,
    rain_note: s.rain_note || null,
    base_terrain_name: s.base_terrain_name || null,
    base_start_time: s.base_start_time || null,
    base_end_time: s.base_end_time || null,
  }))
}

export async function fetchMemberTrainingAttendance(
  memberId: string,
  sessionIds: string[]
): Promise<Record<string, TrainingAttendanceState>> {
  const map: Record<string, TrainingAttendanceState> = {}
  if (sessionIds.length === 0) return map

  const { data } = await supabase
    .from('training_attendance')
    .select('session_id, status, present, responded_at, absence_reason')
    .eq('member_id', memberId)
    .in('session_id', sessionIds)

  for (const r of (data as any[]) || []) {
    map[r.session_id] = {
      status: r.status,
      present: r.present,
      responded_at: r.responded_at,
      absence_reason: r.absence_reason,
    }
  }
  return map
}
