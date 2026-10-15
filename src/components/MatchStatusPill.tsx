import { UserX, CircleCheck, CircleX } from 'lucide-react'

type Variant = 'confirmed' | 'absent' | 'not_convoked'

const STYLES: Record<Variant, { bg: string; color: string }> = {
  confirmed: { bg: 'var(--success-soft)', color: 'var(--success-text)' },
  absent: { bg: 'var(--danger-soft)', color: 'var(--danger-text)' },
  not_convoked: { bg: 'var(--bg-hover)', color: 'var(--text-secondary)' },
}

const LABELS: Record<Variant, string> = {
  confirmed: 'Présence confirmée',
  absent: 'Absent(e) justifié(e)',
  not_convoked: 'Non convoqué',
}

export default function MatchStatusPill({ variant, label }: { variant: Variant; label?: string }) {
  const s = STYLES[variant]
  const text = label ?? LABELS[variant]

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      padding: '3px 10px',
      borderRadius: '999px',
      fontSize: '12px',
      fontWeight: '600',
      background: s.bg,
      color: s.color,
      whiteSpace: 'nowrap',
    }}>
      {variant === 'confirmed' ? (
        <CircleCheck size={12} aria-hidden="true" style={{ flexShrink: 0 }} />
      ) : variant === 'absent' ? (
        <CircleX size={12} aria-hidden="true" style={{ flexShrink: 0 }} />
      ) : (
        <UserX size={12} aria-hidden="true" style={{ flexShrink: 0 }} />
      )}
      {text}
    </span>
  )
}
