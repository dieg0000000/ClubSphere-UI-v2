import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from './supabase'

export const RESPONSE_GRACE_MS = 2 * 60 * 60 * 1000

// Pre-session intent vocabulary (distinct from the coach's *_real pointage):
// 'confirmed' = will attend, 'absent_justified' = excused.
export type TrainingIntent = 'present' | 'excused'

export const INTENT_STATUS: Record<TrainingIntent, string> = {
  present: 'confirmed',
  excused: 'absent_justified',
}

export interface TrainingAttendanceState {
  status: string | null
  present: boolean | null
  responded_at: string | null
  absence_reason: string | null
}

// Resolve the member IDs the current user may respond for:
// - children linked via parent_members (parent)
// - the user's own member row matched by email (adult player)
// Mirrors the resolution logic used by TrainingRespond.
export async function resolveMyMemberIds(userId: string, email: string | null): Promise<string[]> {
  const ids: string[] = []

  const { data: parentLinks } = await supabase
    .from('parent_members')
    .select('member_id')
    .eq('parent_user_id', userId)

  for (const p of parentLinks || []) {
    if (!ids.includes(p.member_id)) ids.push(p.member_id)
  }

  if (email) {
    const { data: ownMembers } = await supabase
      .from('members')
      .select('id')
      .ilike('email', email)

    for (const m of ownMembers || []) {
      if (!ids.includes(m.id)) ids.push(m.id)
    }
  }

  return ids
}

// Responses are allowed until 2 hours after the session start time.
// When no start time is known, fall back to end of the session day so the
// control is not locked prematurely.
export function trainingResponseDeadline(sessionDate: string, startTime: string | null): Date | null {
  if (!sessionDate) return null
  const time = startTime && /^\d{1,2}:\d{2}/.test(startTime) ? startTime.slice(0, 5) : '23:59'
  const dt = new Date(`${sessionDate}T${time}:00`)
  if (Number.isNaN(dt.getTime())) return null
  return new Date(dt.getTime() + RESPONSE_GRACE_MS)
}

export function isTrainingResponseLocked(
  sessionDate: string,
  startTime: string | null,
  now: Date = new Date()
): boolean {
  const deadline = trainingResponseDeadline(sessionDate, startTime)
  if (!deadline) return false
  return now.getTime() > deadline.getTime()
}

// Write a single member's pre-session response. Only touches the intent
// `status` (+ responded metadata); the coach's `present`/*_real pointage
// columns are left untouched. Never throws — returns { data, error }.
export async function writeTrainingResponse(params: {
  sessionId: string
  memberId: string
  intent: TrainingIntent
  userId: string
  reason?: string
}): Promise<{ data: TrainingAttendanceState | null; error: PostgrestError | null }> {
  const absenceReason = params.intent === 'excused' ? (params.reason?.trim() || null) : null

  const { data, error } = await supabase
    .from('training_attendance')
    .upsert(
      {
        session_id: params.sessionId,
        member_id: params.memberId,
        status: INTENT_STATUS[params.intent],
        absence_reason: absenceReason,
        responded_at: new Date().toISOString(),
        responded_by: params.userId,
      },
      { onConflict: 'session_id,member_id' }
    )
    .select('status, present, responded_at, absence_reason')
    .maybeSingle()

  return { data: (data as TrainingAttendanceState | null) ?? null, error }
}

export async function writeMatchResponse(params: {
  matchId: string
  memberId: string
  status: string
  respondedBy: string
  convocationRowId?: string | null
  absenceReason?: string
}): Promise<{ error: PostgrestError | null }> {
  const { matchId, memberId, status, respondedBy, convocationRowId, absenceReason } = params
  const payload: Record<string, unknown> = {
    match_id: matchId,
    member_id: memberId,
    status,
    responded_by: respondedBy,
    responded_at: new Date().toISOString(),
  }
  if (absenceReason !== undefined) payload.absence_reason = absenceReason
  else if (status === 'pending' || status === 'confirmed') payload.absence_reason = null

  const { error } = await supabase
    .from('match_attendance')
    .upsert(payload, { onConflict: 'match_id,member_id' })
  if (error) return { error }

  if (convocationRowId) {
    if (status === 'confirmed') {
      await supabase.rpc('respond_to_convocation', { p_row_id: convocationRowId, p_status: 'confirmed', p_reason: null })
    } else if (status === 'absent_justified' || status === 'absent_unjustified') {
      await supabase.rpc('respond_to_convocation', { p_row_id: convocationRowId, p_status: 'declined', p_reason: absenceReason || null })
      const { data: { session } } = await supabase.auth.getSession()
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      fetch(`${supabaseUrl}/functions/v1/notify-convocation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: 'declined', row_id: convocationRowId }),
      }).catch(() => {})
    }
  }
  return { error: null }
}

// ── Match attendance with "default present" support ──
// When defaultPresent is ON the club considers every convoked player present
// unless they declined. When OFF only explicit confirmations count.

export interface MatchAttendanceRec {
  member_id: string
  status: string // present_real | absent_justified | absent_unjustified | pending
}

export interface MatchAttendanceResult {
  attendance: Record<string, MatchAttendanceRec[]>
  convokedCount: Record<string, number>
}

export async function buildMatchAttendanceMap(
  matchIds: string[],
  defaultPresent: boolean,
): Promise<Record<string, MatchAttendanceRec[]>> {
  return (await buildMatchAttendanceFull(matchIds, defaultPresent)).attendance
}

export async function buildMatchAttendanceFull(
  matchIds: string[],
  defaultPresent: boolean,
): Promise<MatchAttendanceResult> {
  const attendance: Record<string, MatchAttendanceRec[]> = {}
  const convokedCount: Record<string, number> = {}
  if (matchIds.length === 0) return { attendance, convokedCount }

  // Fetch published convocations and their players for these matches
  const { data: convocations } = await supabase
    .from('match_convocations')
    .select('id, match_id')
    .in('match_id', matchIds)
    .eq('status', 'published')

  const convocationList = (convocations || []) as { id: string; match_id: string }[]
  const convocationIds = convocationList.map(c => c.id)
  const convIdToMatchId = new Map(convocationList.map(c => [c.id, c.match_id]))

  if (convocationIds.length > 0) {
    const { data: players } = await supabase
      .from('match_convocation_players')
      .select('convocation_id, member_id, status')
      .in('convocation_id', convocationIds)

    for (const row of (players || []) as { convocation_id: string; member_id: string; status: string }[]) {
      const matchId = convIdToMatchId.get(row.convocation_id)
      if (!matchId) continue
      convokedCount[matchId] = (convokedCount[matchId] || 0) + 1
      if (!attendance[matchId]) attendance[matchId] = []
      if (defaultPresent) {
        const declined = row.status === 'declined'
        attendance[matchId].push({
          member_id: row.member_id,
          status: declined ? 'absent_justified' : 'present_real',
        })
      } else {
        const isConfirmed = row.status === 'confirmed'
        if (isConfirmed) {
          attendance[matchId].push({ member_id: row.member_id, status: 'present_real' })
        }
      }
    }
  }

  // For matches without a published convocation and defaultPresent OFF,
  // fall back to match_attendance table
  if (!defaultPresent) {
    const matchesWithConvocation = new Set(convocationList.map(c => c.match_id))
    const remaining = matchIds.filter(id => !matchesWithConvocation.has(id))
    if (remaining.length > 0) {
      const { data } = await supabase
        .from('match_attendance')
        .select('match_id, member_id, status')
        .in('match_id', remaining)
      for (const row of (data || []) as { match_id: string; member_id: string; status: string }[]) {
        if (!attendance[row.match_id]) attendance[row.match_id] = []
        const mapped = row.status === 'confirmed' ? 'present_real' : row.status
        attendance[row.match_id].push({ member_id: row.member_id, status: mapped })
      }
    }
  }

  return { attendance, convokedCount }
}
