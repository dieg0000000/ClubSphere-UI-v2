import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, MapPin, ClipboardList } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

interface OrgEvent {
  id: string
  event_id: string
  event: {
    id: string
    title: string
    date: string | null
    location: string | null
  }
}

export default function Organisation() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [events, setEvents] = useState<OrgEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) return
    const fetchEvents = async () => {
      const today = new Date().toISOString().slice(0, 10)
      const { data } = await supabase
        .from('event_committee_members')
        .select('id, event_id, events!inner(id, title, date, location)')
        .eq('profile_id', user.id)
        .eq('status', 'active')

      const valid = (data || [])
        .map((row: any) => ({ ...row, event: row.events }))
        .filter((row: any) => {
          const eventDate = row.event?.date?.slice(0, 10)
          if (!eventDate) return true
          const expiry = new Date(eventDate)
          expiry.setDate(expiry.getDate() + 30)
          return expiry.toISOString().slice(0, 10) >= today
        })
        .sort((a: any, b: any) => {
          const da = a.event?.date || ''
          const db = b.event?.date || ''
          return da > db ? -1 : da < db ? 1 : 0
        })

      setEvents(valid)
      setLoading(false)
    }
    fetchEvents()
  }, [user?.id])

  if (loading) {
    return (
      <div style={{ padding: '48px 0', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Chargement...</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ color: 'var(--text-primary)', fontSize: '24px', fontWeight: 700, margin: '0 0 8px' }}>
          Organisation
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
          Vous faites partie du comité d'organisation de ces événements.
        </p>
      </div>

      {events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 24px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <ClipboardList size={40} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '15px' }}>
            Aucun événement actif pour le moment.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {events.map((row) => (
            <div
              key={row.id}
              onClick={() => navigate(`/organisation/${row.event.id}`)}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '20px 24px',
                cursor: 'pointer',
                boxShadow: 'var(--shadow-lg)',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)'
                e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-color)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <h3 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: 600, margin: '0 0 8px' }}>
                {row.event.title}
              </h3>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {row.event.date && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                    <Calendar size={14} />
                    {new Date(row.event.date).toLocaleDateString('fr-CH', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                )}
                {row.event.location && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                    <MapPin size={14} />
                    {row.event.location}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
