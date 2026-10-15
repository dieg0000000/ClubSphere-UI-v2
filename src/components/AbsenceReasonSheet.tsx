import { useState } from 'react'

interface Props {
  memberName?: string
  submitting?: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void
}

export default function AbsenceReasonSheet({ memberName, submitting, onCancel, onConfirm }: Props) {
  const [reasonText, setReasonText] = useState('')
  const reasonValid = reasonText.trim().length >= 2

  const confirmReason = () => {
    if (!reasonValid) return
    onConfirm(reasonText.trim())
  }

  return (
    <div
      onClick={() => !submitting && onCancel()}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: '0',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '480px',
          background: 'var(--bg-card)',
          borderTopLeftRadius: '16px', borderTopRightRadius: '16px',
          border: '1px solid var(--border-color)',
          padding: '20px', paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
          boxShadow: '0 -8px 30px rgba(0,0,0,0.25)',
        }}
      >
        <h3 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>
          Raison de l'absence
        </h3>
        {memberName && (
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '12px' }}>{memberName}</p>
        )}
        <input
          type="text"
          value={reasonText}
          onChange={(e) => setReasonText(e.target.value)}
          autoFocus
          placeholder="Ex : malade, école, vacances"
          maxLength={120}
          onKeyDown={(e) => { if (e.key === 'Enter' && reasonValid) confirmReason() }}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '10px 12px', fontSize: '14px',
            borderRadius: '10px', border: '1px solid var(--border-color)',
            background: 'var(--bg-input, var(--bg-app))', color: 'var(--text-primary)',
            outline: 'none',
          }}
        />
        <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '6px' }}>
          Ce motif est obligatoire (au moins 2 caractères).
        </p>
        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={!!submitting}
            style={{
              flex: 1, padding: '11px', borderRadius: '10px', fontWeight: 600, fontSize: '14px',
              background: 'transparent', color: 'var(--text-secondary)',
              border: '1px solid var(--border-color)', cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={confirmReason}
            disabled={!reasonValid || !!submitting}
            style={{
              flex: 1, padding: '11px', borderRadius: '10px', fontWeight: 700, fontSize: '14px',
              background: reasonValid && !submitting ? 'var(--danger)' : 'var(--border-color)',
              color: reasonValid && !submitting ? 'var(--danger-contrast, #fff)' : 'var(--text-muted)',
              border: 'none', cursor: reasonValid && !submitting ? 'pointer' : 'not-allowed',
            }}
          >
            {submitting ? 'Envoi...' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  )
}
