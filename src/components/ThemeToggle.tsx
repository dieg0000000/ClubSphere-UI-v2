import { Monitor, Sun, Moon } from 'lucide-react'
import { useTheme, ThemeMode } from '../context/ThemeContext'

const options: { mode: ThemeMode; icon: typeof Monitor; label: string }[] = [
  { mode: 'system', icon: Monitor, label: 'Système' },
  { mode: 'light', icon: Sun, label: 'Clair' },
  { mode: 'dark', icon: Moon, label: 'Sombre' },
]

export function ThemeToggle() {
  const { mode, setMode } = useTheme()

  return (
    <div style={{ padding: '12px 16px' }}>
      <p style={{
        fontSize: '10px',
        fontWeight: 600,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        marginBottom: '8px',
      }}>
        Apparence
      </p>
      <div style={{ display: 'flex', gap: '4px' }}>
        {options.map(({ mode: m, icon: Icon, label }) => {
          const active = mode === m
          return (
            <button
              key={m}
              onClick={() => setMode(m)}
              title={label}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                background: active ? 'var(--accent-soft)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              <Icon size={16} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function CompactThemeToggle() {
  const { mode, setMode } = useTheme()

  return (
    <div style={{ display: 'flex', gap: 4, background: 'var(--bg-hover)', borderRadius: 8, padding: 3 }}>
      {options.map(({ mode: m, icon: Icon, label }) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          title={label}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 30,
            height: 30,
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            background: mode === m ? 'var(--bg-card)' : 'transparent',
            color: mode === m ? 'var(--text-primary)' : 'var(--text-muted)',
            boxShadow: mode === m ? 'var(--shadow-sm)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <Icon size={15} />
        </button>
      ))}
    </div>
  )
}
