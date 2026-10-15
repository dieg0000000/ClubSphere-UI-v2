import { CloudRain } from 'lucide-react'

interface RainInfoProps {
  rain_applied: boolean
  rain_plan_defined: boolean
  rain_note?: string | null
  base_terrain_name?: string | null
  base_start_time?: string | null
  base_end_time?: string | null
}

const fmt = (t: string | null | undefined) => t?.slice(0, 5) ?? ''

export function RainBadge({ rain_applied, rain_plan_defined, rain_note, base_terrain_name, base_start_time, base_end_time }: RainInfoProps) {
  if (!rain_applied) return null

  return (
    <div style={{ marginTop: '4px' }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        fontSize: '11px', fontWeight: 600,
        background: 'var(--info)', color: '#fff',
        borderRadius: '4px', padding: '1px 6px', lineHeight: '18px',
      }}>
        <CloudRain size={11} />
        Pluie
      </span>
      {rain_plan_defined ? (
        <>
          {(base_terrain_name || base_start_time) && (
            <span style={{
              display: 'inline-block', marginLeft: '8px',
              fontSize: '12px', color: 'var(--text-muted)',
              textDecoration: 'line-through',
            }}>
              {base_terrain_name}{base_start_time ? ` ${fmt(base_start_time)}–${fmt(base_end_time)}` : ''}
            </span>
          )}
          {rain_note && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '2px' }}>
              {rain_note}
            </div>
          )}
        </>
      ) : (
        <span style={{ display: 'inline-block', marginLeft: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
          Plan pluie non défini, l'entraîneur vous informe
        </span>
      )}
    </div>
  )
}
