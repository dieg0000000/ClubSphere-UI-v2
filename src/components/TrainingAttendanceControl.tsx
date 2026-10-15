import { useEffect, useState } from 'react'
import { isTrainingResponseLocked, writeTrainingResponse, type TrainingIntent } from '../lib/trainingAttendance'
import AttendanceButtons, { AttendancePill, genderLabel } from './AttendanceButtons'
import AbsenceReasonSheet from './AbsenceReasonSheet'
import Button from './ui/Button'

export { genderLabel }

interface Props {
  sessionId: string
  sessionDate: string
  startTime: string | null
  memberId: string
  memberName?: string
  status: string | null
  present: boolean | null
  respondedAt: string | null
  userId: string
  onUpdated?: () => void
  defaultPresent?: boolean
  gender?: string | null
}

type Selection = 'present' | 'excused' | null

function deriveSelection(status: string | null): Selection {
  if (status === 'confirmed') return 'present'
  if (status === 'absent_justified') return 'excused'
  return null
}

export default function TrainingAttendanceControl({
  sessionId,
  sessionDate,
  startTime,
  memberId,
  memberName,
  status,
  userId,
  onUpdated,
  defaultPresent,
  gender,
}: Props) {
  const [selection, setSelection] = useState<Selection>(deriveSelection(status))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [reasonOpen, setReasonOpen] = useState(false)

  useEffect(() => {
    setSelection(deriveSelection(status))
  }, [status])

  const locked = isTrainingResponseLocked(sessionDate, startTime)

  const respond = async (intent: TrainingIntent, reason?: string) => {
    if (locked || submitting) return
    const previous = selection
    setSubmitting(true)
    setError(null)
    setSelection(intent === 'present' ? 'present' : 'excused')

    const { data, error: writeError } = await writeTrainingResponse({ sessionId, memberId, intent, userId, reason })
    setSubmitting(false)

    if (writeError) {
      setSelection(previous)
      setError('Erreur, réessayez')
      return
    }

    setEditing(false)
    setSelection(deriveSelection(data?.status ?? (intent === 'present' ? 'confirmed' : 'absent_justified')))
    onUpdated?.()
  }

  if (locked) {
    const lockedState = selection === 'excused'
      ? 'absent' as const
      : selection === 'present'
        ? 'confirmed' as const
        : defaultPresent
          ? 'default_present' as const
          : 'unanswered' as const
    return (
      <AttendanceButtons
        state={lockedState}
        gender={gender}
        memberName={memberName}
        locked
        submitting={submitting}
        error={error}
        onPresent={() => respond('present')}
        onAbsent={(reason) => respond('excused', reason)}
        onRevert={() => respond('present')}
      />
    )
  }

  const presentLabel = genderLabel(gender, 'present')
  const absentLabel = genderLabel(gender, 'absent')

  return (
    <div style={{ marginTop: '8px' }}>
      {memberName && (
        <>
          <div style={{ borderTop: '1px solid var(--border-color)', marginBottom: '6px' }} />
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 500 }}>
            {memberName}
          </div>
        </>
      )}

      {editing ? (
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="primary" size="sm" style={{ flex: 1 }} disabled={submitting} onClick={() => respond('present')}>
            {presentLabel}
          </Button>
          <Button variant="secondary" size="sm" style={{ flex: 1 }} disabled={submitting} onClick={() => setReasonOpen(true)}>
            {absentLabel}
          </Button>
        </div>
      ) : selection === null ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <AttendancePill variant="present">{presentLabel}</AttendancePill>
          <Button variant="ghost" size="sm" disabled={submitting} onClick={() => setReasonOpen(true)}>
            Signaler une absence
          </Button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <AttendancePill variant={selection === 'present' ? 'present' : 'absent'}>
            {selection === 'present' ? presentLabel : absentLabel}
          </AttendancePill>
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={submitting}
            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          >
            Modifier
          </button>
        </div>
      )}

      {error && (
        <div style={{ fontSize: '11px', color: 'var(--danger-text)', fontWeight: 600, marginTop: '4px' }}>{error}</div>
      )}

      {reasonOpen && (
        <AbsenceReasonSheet
          memberName={memberName}
          submitting={submitting}
          onCancel={() => setReasonOpen(false)}
          onConfirm={(reason) => { setReasonOpen(false); respond('excused', reason) }}
        />
      )}
    </div>
  )
}
