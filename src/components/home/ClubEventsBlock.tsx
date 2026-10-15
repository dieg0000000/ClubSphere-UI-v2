import { Link } from 'react-router-dom'
import { Calendar, ChevronRight, MapPin } from 'lucide-react'

export interface ClubEvent {
  id: string
  title: string
  date: string
  location: string | null
  type: string
}

const formatEventDate = (d: string) =>
  new Date(d).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })

export default function ClubEventsBlock({ events }: { events: ClubEvent[] }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: '14px', padding: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Calendar size={16} style={{ color: 'var(--accent)' }} />
          <span style={{ color: 'var(--text-primary)', fontWeight: '700', fontSize: '14px' }}>Prochains événements</span>
        </div>
        <Link to="/events" style={{ color: 'var(--accent)', fontSize: '12px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '2px' }}>
          Voir tout <ChevronRight size={14} />
        </Link>
      </div>
      {events.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {events.map(ev => (
            <Link key={ev.id} to="/events" style={{ textDecoration: 'none' }}>
              <div
                style={{
                  padding: '12px 14px',
                  background: 'var(--bg-hover)',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  transition: 'border-color 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-color)')}
              >
                <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>
                  {ev.title}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Calendar size={12} aria-hidden="true" /> {formatEventDate(ev.date)}</span>
                  {ev.location && <span style={{ color: 'var(--text-secondary)', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><MapPin size={12} aria-hidden="true" /> {ev.location}</span>}
                  {ev.type && (
                    <span style={{
                      background: 'var(--accent-soft)',
                      color: 'var(--accent-text)',
                      border: '1px solid var(--accent)',
                      borderRadius: '99px',
                      padding: '1px 8px',
                      fontSize: '11px',
                      fontWeight: '600',
                    }}>
                      {ev.type}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '12px 0' }}>Aucun événement à venir</p>
      )}
    </div>
  )
}
