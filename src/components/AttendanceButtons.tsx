import { useState } from 'react'
import { CircleCheck, CircleX, Lock } from 'lucide-react'
import AbsenceReasonSheet from './AbsenceReasonSheet'

type AttendanceState = 'default_present' | 'confirmed' | 'absent' | 'unanswered'

interface Props {
  state: AttendanceState
  gender?: string | null
  memberName?: string
  locked?: boolean
  submitting?: boolean
  error?: string | null
  onPresent: () => void
  onAbsent: (reason: string) => void
  onRevert: () => void
}

function genderLabel(gender: string | null | undefined, base: 'present' | 'absent' | 'excused'): string {
  const g = (gender || '').toLowerCase()
  if (base === 'present') {
    if (g === 'f' || g === 'feminin' || g === 'féminin') return 'Présente'
    if (g === 'm' || g === 'masculin') return 'Présent'
    return 'Présent(e)'
  }
  if (base === 'excused') {
    if (g === 'f' || g === 'feminin' || g === 'féminin') return 'Excusée'
    if (g === 'm' || g === 'masculin') return 'Excusé'
    return 'Excusé(e)'
  }
  if (g === 'f' || g === 'feminin' || g === 'féminin') return 'Absente'
  if (g === 'm' || g === 'masculin') return 'Absent'
  return 'Absent(e)'
}

export default function AttendanceButtons({
  state,
  gender,
  memberName,
  locked,
  submitting,
  error,
  onPresent,
  onAbsent,
  onRevert,
}: Props) {
  const [reasonOpen, setReasonOpen] = useState(false)

  const presentLabel = genderLabel(gender, 'present')
  const absentLabel = genderLabel(gender, 'absent')
  const disabled = locked || submitting
  const displayError = error

  const openReasonDialog = () => {
    if (disabled) return
    setReasonOpen(true)
  }

  const pillBase: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    padding: '8px 10px',
    borderRadius: '999px',
    fontWeight: 600,
    fontSize: '13px',
    textAlign: 'center',
    lineHeight: 1.3,
    whiteSpace: 'normal',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.15s, border-color 0.15s, color 0.15s',
  }

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

      {locked ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {(state === 'confirmed' || state === 'default_present') && (
            <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, background: 'var(--success-soft)', color: 'var(--success-text)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <CircleCheck size={12} aria-hidden="true" /> {presentLabel}{state === 'default_present' ? ' (par défaut)' : ''}
            </span>
          )}
          {state === 'absent' && (
            <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, background: 'var(--danger-soft)', color: 'var(--danger-text)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <CircleX size={12} aria-hidden="true" /> {absentLabel}
            </span>
          )}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
            <Lock size={12} aria-hidden="true" />
            Délai dépassé
          </span>
        </div>
      ) : state === 'absent' ? (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch', width: '100%' }}>
          <span style={{
            ...pillBase,
            background: 'var(--danger-soft)', color: 'var(--danger-text)',
            border: '1px solid var(--danger)', cursor: 'default',
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <CircleX size={12} aria-hidden="true" />{absentLabel}
            </span>
          </span>
          <button type="button" onClick={onRevert} disabled={!!disabled} style={{
            ...pillBase,
            background: 'transparent', color: 'var(--text-secondary)',
            border: '1px solid var(--border-color)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.6 : 1,
          }}>
            <span>{presentLabel}</span>
            <span style={{ fontSize: '11px', fontWeight: 500, opacity: 0.7 }}>annuler</span>
          </button>
          {displayError && (
            <span style={{ fontSize: '11px', color: 'var(--danger-text)', fontWeight: 600, alignSelf: 'center' }}>{displayError}</span>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch', width: '100%' }}>
          <span style={{
            ...pillBase,
            background: (state === 'confirmed' || state === 'default_present') ? 'var(--success-soft)' : 'var(--warning-soft)',
            color: (state === 'confirmed' || state === 'default_present') ? 'var(--success-text)' : 'var(--warning-text)',
            border: `1px solid ${(state === 'confirmed' || state === 'default_present') ? 'var(--success)' : 'var(--warning)'}`,
            cursor: 'default',
            opacity: state === 'default_present' ? 0.85 : 1,
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <CircleCheck size={12} aria-hidden="true" />{presentLabel}
            </span>
            {state === 'default_present' && (
              <span style={{ fontSize: '11px', fontWeight: 500, opacity: 0.7 }}>par défaut</span>
            )}
          </span>
          <button type="button" onClick={openReasonDialog} disabled={!!disabled} style={{
            ...pillBase,
            background: 'var(--danger-soft)', color: 'var(--danger-text)',
            border: '1px solid var(--danger)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.6 : 1,
          }}>
            <span>Signaler</span>
            <span style={{ fontSize: '11px', fontWeight: 500 }}>une absence</span>
          </button>
          {displayError && (
            <span style={{ fontSize: '11px', color: 'var(--danger-text)', fontWeight: 600, alignSelf: 'center' }}>{displayError}</span>
          )}
        </div>
      )}

      {reasonOpen && (
        <AbsenceReasonSheet
          memberName={memberName}
          submitting={submitting}
          onCancel={() => setReasonOpen(false)}
          onConfirm={(reason) => { setReasonOpen(false); onAbsent(reason) }}
        />
      )}
    </div>
  )
}

export function AttendancePill({ variant, children }: { variant: 'present' | 'absent'; children: React.ReactNode }) {
  const present = variant === 'present'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
      background: present ? 'var(--success-soft)' : 'var(--danger-soft)',
      color: present ? 'var(--success-text)' : 'var(--danger-text)',
    }}>
      {present ? <CircleCheck size={12} aria-hidden="true" /> : <CircleX size={12} aria-hidden="true" />}
      {children}
    </span>
  )
}

export { genderLabel }
