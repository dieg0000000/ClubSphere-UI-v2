import { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * AccordionList — pattern du design system (clubsphere-design-spec §3).
 * Ligne repliée = résumé (titre + sous-titre) + barre de bandes + valeur.
 * Ligne dépliée = détail inline (children).
 * Contrôlé par le parent (openId / onToggle) → un seul item ouvert à la fois.
 */

export interface AccordionBand {
  /** Poids relatif du segment (ex. nombre de présences). Les segments à 0 sont ignorés. */
  value: number
  /** Couleur CSS du segment (var(--success), #f59e0b, ...). */
  color: string
  /** Libellé accessible (title). */
  label?: string
}

export interface AccordionListItem {
  id: string
  title: ReactNode
  subtitle?: ReactNode
  /** Barre de bandes proportionnelles affichée au centre de la ligne repliée. */
  bands?: AccordionBand[]
  /** Valeur à droite (ex. "82%"). */
  value?: ReactNode
  /** Contenu du détail inline (affiché quand l'item est ouvert). */
  children?: ReactNode
}

export function BandBar({ bands, height = 8 }: { bands: AccordionBand[]; height?: number }) {
  const total = bands.reduce((acc, b) => acc + Math.max(0, b.value), 0)
  if (total <= 0) {
    return (
      <div
        style={{
          height,
          borderRadius: 999,
          background: 'var(--bg-hover)',
          border: '1px solid var(--border-color)',
          width: '100%',
        }}
      />
    )
  }
  return (
    <div
      style={{
        display: 'flex',
        height,
        borderRadius: 999,
        overflow: 'hidden',
        width: '100%',
        background: 'var(--bg-hover)',
      }}
    >
      {bands
        .filter(b => b.value > 0)
        .map((b, i) => (
          <div
            key={i}
            title={b.label}
            style={{
              width: `${(b.value / total) * 100}%`,
              background: b.color,
              minWidth: 2,
            }}
          />
        ))}
    </div>
  )
}

export function AccordionList({
  items,
  openId,
  onToggle,
}: {
  items: AccordionListItem[]
  openId: string | null
  onToggle: (id: string) => void
}) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {items.map((item, idx) => {
        const isOpen = openId === item.id
        return (
          <div key={item.id} style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--border-color)' }}>
            <button
              type="button"
              onClick={() => onToggle(item.id)}
              aria-expanded={isOpen}
              style={{
                width: '100%',
                display: 'grid',
                gridTemplateColumns: 'minmax(160px, 1.2fr) minmax(120px, 1fr) 90px 28px',
                alignItems: 'center',
                gap: 16,
                padding: '14px 18px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--bg-hover)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    color: 'var(--text-primary)',
                    fontWeight: 600,
                    fontSize: 14,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.title}
                </div>
                {item.subtitle && (
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>{item.subtitle}</div>
                )}
              </div>

              <div>{item.bands ? <BandBar bands={item.bands} /> : null}</div>

              <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 15 }}>{item.value}</div>

              <ChevronDown
                size={17}
                style={{
                  color: 'var(--text-secondary)',
                  transition: 'transform 0.25s ease',
                  transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  justifySelf: 'end',
                }}
              />
            </button>

            <div
              style={{
                maxHeight: isOpen ? 2400 : 0,
                overflow: 'hidden',
                transition: 'max-height 0.3s ease',
              }}
            >
              {isOpen && (
                <div style={{ padding: '0 18px 18px', borderTop: '1px solid var(--border-color)' }}>
                  {item.children}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
