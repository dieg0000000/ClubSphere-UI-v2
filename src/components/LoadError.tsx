import { AlertTriangle, RotateCw } from 'lucide-react'

interface LoadErrorProps {
  onRetry?: () => void
  message?: string
}

export function LoadError({ onRetry, message }: LoadErrorProps) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: '12px',
      border: '1px solid var(--border-color)',
      padding: '48px 24px',
      textAlign: 'center',
    }}>
      <AlertTriangle
        size={40}
        style={{ margin: '0 auto 12px', color: 'var(--warning)', display: 'block' }}
      />
      <p style={{ color: 'var(--text-secondary)', fontSize: '15px', margin: '0 0 16px' }}>
        {message || 'Impossible de charger les données.'}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 20px',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-card)',
            color: 'var(--accent)',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--bg-hover)'
            e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'var(--bg-card)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          <RotateCw size={14} />
          Réessayer
        </button>
      )}
    </div>
  )
}
