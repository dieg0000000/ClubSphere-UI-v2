import { useState } from 'react'
import { writeMatchResponse } from '../lib/trainingAttendance'
import { CircleCheck } from 'lucide-react'
import { isUnavailableForMatch, unavailabilityBadgeText } from '../utils/availabilityHelpers'
import AttendanceButtons from './AttendanceButtons'

interface AttendanceRecord {
  id: string
  status: string
  absence_reason: string | null
}

interface ChildAttendance {
  memberId: string
  memberName: string
  record: AttendanceRecord | null
  availability?: string | null
  availability_until?: string | null
  gender?: string | null
}

interface Props {
  matchId: string
  matchDate?: string
  isCancelled: boolean
  children: ChildAttendance[]
  respondedBy: string
  onUpdate: () => void
  convocationRowIds?: Record<string, string>
  attendanceDefaultPresent?: boolean
  hasPublishedConvocation?: boolean
  convokedMemberIds?: Set<string>
}

function SingleAttendanceWidget({
  matchId,
  matchDate,
  child,
  respondedBy,
  onUpdate,
  convocationRowId,
  attendanceDefaultPresent,
  hasPublishedConvocation,
  isConvoked,
}: {
  matchId: string
  matchDate?: string
  child: ChildAttendance
  respondedBy: string
  onUpdate: () => void
  convocationRowId?: string
  attendanceDefaultPresent?: boolean
  hasPublishedConvocation?: boolean
  isConvoked?: boolean
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const upsertAttendance = async (status: string, absenceReason?: string) => {
    setSubmitting(true)
    setError(null)
    const { error: upsertError } = await writeMatchResponse({
      matchId, memberId: child.memberId, status, respondedBy, convocationRowId, absenceReason,
    })

    if (upsertError) {
      console.error('[MatchAttendance]', upsertError)
      setSubmitting(false)
      setError(upsertError.message || 'Erreur lors de la mise à jour')
      return
    }

    setSubmitting(false)
    if (status === 'confirmed') showToast('Présence confirmée')
    onUpdate()
  }

  const handlePresent = () => upsertAttendance('confirmed')

  const handleAbsent = (reason: string) => upsertAttendance('absent_justified', reason)

  const handleRevert = () => {
    if (attendanceDefaultPresent) {
      upsertAttendance('pending')
    } else {
      upsertAttendance('confirmed')
    }
  }

  const { record } = child
  const status = record?.status ?? null
  const isAbsent = status === 'absent_justified' || status === 'absent_unjustified'
  const isConfirmed = status === 'confirmed'
  const isPendingOrNull = status === null || status === 'pending'

  const notRetained = hasPublishedConvocation && !isConvoked
  const memberUnavailable = matchDate ? isUnavailableForMatch(child.availability, child.availability_until, matchDate) : false

  if (memberUnavailable) {
    return (
      <div style={{ marginTop: '8px' }}>
        {child.memberName && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: '500' }}>
            {child.memberName}
          </div>
        )}
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          padding: '4px 12px', borderRadius: '999px', fontSize: '12px',
          background: 'var(--warning-soft)', color: 'var(--warning-text)', fontWeight: 700,
          whiteSpace: 'nowrap',
        }}>
          {unavailabilityBadgeText(child.availability, child.availability_until)}
        </span>
      </div>
    )
  }

  if (notRetained) {
    return (
      <div style={{ marginTop: '8px' }}>
        {child.memberName && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: '500' }}>
            {child.memberName}
          </div>
        )}
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          padding: '4px 12px', borderRadius: '999px', fontSize: '12px',
          background: 'var(--bg-hover)', color: 'var(--text-muted)', fontWeight: 700,
          whiteSpace: 'nowrap',
        }}>
          Non retenu(e) pour ce match
        </span>
      </div>
    )
  }

  const attendanceState = isAbsent
    ? 'absent' as const
    : isConfirmed
      ? 'confirmed' as const
      : attendanceDefaultPresent
        ? 'default_present' as const
        : 'unanswered' as const

  return (
    <div>
      {toast && (
        <div style={{
          padding: '6px 12px', borderRadius: '8px',
          background: 'var(--success-soft)', color: 'var(--success-text)',
          fontSize: '12px', fontWeight: '600', marginBottom: '6px', display: 'inline-block',
        }}>
          {toast}
        </div>
      )}

      <AttendanceButtons
        state={attendanceState}
        gender={child.gender}
        memberName={child.memberName || undefined}
        locked={false}
        submitting={submitting}
        error={error}
        onPresent={handlePresent}
        onAbsent={handleAbsent}
        onRevert={handleRevert}
      />

      {hasPublishedConvocation && isConvoked && (
        <div style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
          <span style={{ color: 'var(--success)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
            <CircleCheck size={12} aria-hidden="true" /> Convoqué(e)
          </span>
        </div>
      )}
    </div>
  )
}

export default function MatchAttendanceWidget({
  matchId,
  matchDate,
  isCancelled,
  children,
  respondedBy,
  onUpdate,
  convocationRowIds,
  attendanceDefaultPresent,
  hasPublishedConvocation,
  convokedMemberIds,
}: Props) {
  if (isCancelled || children.length === 0) return null

  return (
    <div style={{ marginTop: '10px' }}>
      {children.map(child => {
        const isConvoked = convokedMemberIds?.has(child.memberId) ?? false

        return (
          <SingleAttendanceWidget
            key={child.memberId}
            matchId={matchId}
            matchDate={matchDate}
            child={child}
            respondedBy={respondedBy}
            onUpdate={onUpdate}
            convocationRowId={convocationRowIds?.[child.memberId]}
            attendanceDefaultPresent={attendanceDefaultPresent}
            hasPublishedConvocation={hasPublishedConvocation}
            isConvoked={isConvoked}
          />
        )
      })}
    </div>
  )
}
