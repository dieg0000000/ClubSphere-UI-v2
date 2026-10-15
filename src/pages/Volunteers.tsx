import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Event } from '../types'
import { Calendar, MapPin, Users, Check } from 'lucide-react'
import { VolunteerModal } from '../components/VolunteerModal'
import { Alert } from '../components/ui/Alert'

interface EventWithVolunteers extends Event {
  registered_count: number
  total_required: number
  user_registered: boolean
}

export function Volunteers() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [events, setEvents] = useState<EventWithVolunteers[]>([])
  const [loading, setLoading] = useState(true)
  const [modalEvent, setModalEvent] = useState<EventWithVolunteers | null>(null)
  const [successName, setSuccessName] = useState<string | null>(null)

  useEffect(() => {
    loadEvents()
  }, [user?.id])

  const loadEvents = async () => {
    try {
      const { data: eventsData } = await supabase
        .from('events')
        .select('*')
        .eq('needs_volunteers', true)
        .gte('date', new Date().toISOString())
        .order('date', { ascending: true })

      if (eventsData) {
        const enriched = await Promise.all(eventsData.map(async ev => {
          const [{ count: volunteerCount }, { data: posts }] = await Promise.all([
            supabase
              .from('event_volunteers')
              .select('*', { count: 'exact', head: true })
              .eq('event_id', ev.id),
            supabase
              .from('event_volunteer_posts')
              .select('required_count')
              .eq('event_id', ev.id)
          ])

          const totalRequired = posts?.reduce((sum, p) => sum + (p.required_count || 0), 0) || 0
          console.log('Event:', ev.id, 'volunteers:', volunteerCount, 'total:', totalRequired)

          let userRegistered = false
          if (user?.id) {
            const { data: evReg } = await supabase
              .from('event_volunteers')
              .select('id')
              .eq('event_id', ev.id)
              .eq('user_id', user.id)
              .maybeSingle()
            userRegistered = !!evReg
          }

          return { ...ev, registered_count: volunteerCount || 0, total_required: totalRequired, user_registered: userRegistered }
        }))
        setEvents(enriched)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  const handleSuccess = async () => {
    const eventId = modalEvent?.id || null
    setModalEvent(null)
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name')
        .eq('id', user.id)
        .maybeSingle()
      setSuccessName(profile?.first_name || user.email?.split('@')[0] || '')
    }
    if (eventId) {
      await loadEvents()
    }
    setTimeout(() => setSuccessName(null), 8000)
  }

  return (
    <div style={{ width: '100%' }}>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Bénévolat</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Événements recherchant des bénévoles</p>
      </div>

      {successName !== null && (
        <Alert variant="success" title={`Merci ${successName} !`} className="mb-5">
          Votre inscription a bien été enregistrée. Vous recevrez un email de confirmation.
        </Alert>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2" style={{ borderColor: 'var(--accent)' }} />
        </div>
      ) : events.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {events.map(event => {
            const total = event.total_required || 0
            const pct = total > 0 ? Math.min((event.registered_count / total) * 100, 100) : 0
            return (
              <div
                key={event.id}
                style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                  borderRadius: '12px', padding: '16px 20px', width: '100%',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: '16px', flexWrap: 'wrap', cursor: 'pointer', transition: 'all 0.2s'
                }}
                onClick={() => navigate(`/admin/benevoles?event_id=${event.id}`)}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.transform = 'translateY(0)' }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <span style={{ background: 'var(--info-soft)', color: 'var(--info-text)', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {event.type}
                    </span>
                    <h3 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '16px', fontWeight: '700' }}>{event.title}</h3>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={13} /> {formatDate(event.date)}
                    </span>
                  </div>
                  {event.location && (
                    <p style={{ color: 'var(--text-secondary)', margin: '0 0 8px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <MapPin size={13} /> {event.location}
                    </p>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Users size={13} /> {event.registered_count} / {total || '∞'} bénévoles
                    </span>
                    {total > 0 && (
                      <>
                        <div style={{ width: '120px', height: '6px', background: 'var(--border-color)', borderRadius: '99px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: '99px', transition: 'width 0.3s' }} />
                        </div>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{Math.round(pct)}%</span>
                      </>
                    )}
                  </div>
                </div>
                <div style={{ flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  {event.user_registered ? (
                    <span style={{ color: 'var(--success)', fontWeight: '600', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--success)', background: 'var(--success-soft)' }}>
                      <Check size={16} /> Inscrit(e)
                    </span>
                  ) : (
                    <button
                      onClick={() => setModalEvent(event)}
                      style={{
                        background: 'var(--accent)', color: 'var(--text-inverse)', border: 'none',
                        borderRadius: '8px', padding: '8px 16px', cursor: 'pointer',
                        fontSize: '13px', fontWeight: '600', transition: 'opacity 0.2s'
                      }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                    >
                      Je veux être bénévole →
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-12">
          <p style={{ color: 'var(--text-muted)' }}>Aucun événement recherchant des bénévoles pour le moment</p>
        </div>
      )}

      {modalEvent && (
        <VolunteerModal
          event={modalEvent}
          onClose={() => setModalEvent(null)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  )
}
