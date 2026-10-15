import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, MapPin, Handshake, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { EventWithRegistrations } from '../types'
import { getEventTypeBadgeVariant, formatEventDateShort, isEventPast } from '../utils/eventHelpers'
import { useAuth } from '../context/AuthContext'
import { Tabs } from '../components/ui/Tabs'
import { Badge } from '../components/ui/Badge'
import { reportLoadError } from '../utils/reportLoadError'
import { LoadError } from '../components/LoadError'

export function Events() {
  const [events, setEvents] = useState<EventWithRegistrations[]>([])
  const [volunteerStats, setVolunteerStats] = useState<Record<string, { count: number; required: number }>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'upcoming' | 'past'>('upcoming')
  const { user } = useAuth()
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    fetchEvents()
  }, [filter, user])

  async function fetchEvents() {
    try {
      setLoadFailed(false)
      setLoading(true)
      const now = new Date().toISOString()

      let query = supabase
        .from('events')
        .select(`
          *,
          event_registrations(count),
          event_volunteers(count)
        `)
        .order('date', { ascending: filter === 'upcoming' })

      if (filter === 'upcoming') {
        query = query.gte('date', now)
      } else {
        query = query.lt('date', now)
      }

      const { data, error } = await query

      if (error) throw error

      let eventsWithStatus: EventWithRegistrations[]

      if (user) {
        const [{ data: oldRegs }, { data: pubByProfile }, { data: volRegs }] = await Promise.all([
          supabase.from('event_registrations').select('event_id').eq('user_id', user.id),
          supabase.from('event_public_registrations')
            .select('event_id')
            .eq('status', 'confirmed')
            .eq('profile_id', user.id),
          supabase.from('event_volunteers').select('event_id').eq('user_id', user.id),
        ])

        const registeredEventIds = new Set([
          ...(oldRegs?.map(r => r.event_id) || []),
          ...(pubByProfile?.map(r => r.event_id) || []),
          ...(volRegs?.map(r => r.event_id) || []),
        ])

        eventsWithStatus = data?.map(event => ({
          ...event,
          registration_count: event.event_registrations?.[0]?.count || 0,
          user_registered: registeredEventIds.has(event.id)
        })) || []
      } else {
        eventsWithStatus = data?.map(event => ({
          ...event,
          registration_count: event.event_registrations?.[0]?.count || 0,
          user_registered: false
        })) || []
      }

      setEvents(eventsWithStatus)

      const stats: Record<string, { count: number; required: number }> = {}
      await Promise.all(
        eventsWithStatus
          .filter(e => e.needs_volunteers)
          .map(async (event) => {
            const [{ count: volunteerCount }, { data: posts }] = await Promise.all([
              supabase.from('event_volunteers').select('*', { count: 'exact', head: true }).eq('event_id', event.id),
              supabase.from('event_volunteer_posts').select('required_count').eq('event_id', event.id)
            ])
            const totalRequired = posts?.reduce((sum, p) => sum + (p.required_count || 0), 0) || 0
            stats[event.id] = { count: volunteerCount || 0, required: totalRequired }
          })
      )
      setVolunteerStats(stats)
    } catch (error) {
      reportLoadError('Events', error)
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div style={{ color: 'var(--text-muted)' }}>Chargement...</div>
      </div>
    )
  }

  if (loadFailed) {
    return (
      <div>
        <LoadError onRetry={fetchEvents} />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Événements</h1>
          <p style={{ color: 'var(--text-secondary)' }} className="mt-1">Inscrivez-vous aux événements du club</p>
        </div>
      </div>

      <Tabs
        value={filter}
        onChange={(id) => setFilter(id as 'upcoming' | 'past')}
        items={[
          { key: 'upcoming', label: 'À venir' },
          { key: 'past', label: 'Passés' },
        ]}
        className="mb-6"
      />

      {events.length === 0 ? (
        <div className="rounded-xl p-12 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <Calendar className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
          <p style={{ color: 'var(--text-secondary)' }}>
            {filter === 'upcoming' ? 'Aucun événement à venir' : 'Aucun événement passé'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {events.map((event) => {
            const isPast = isEventPast(event.date)
            const volStats = volunteerStats[event.id]
            const showVolunteers = event.needs_volunteers && volStats && volStats.required > 0

            return (
              <Link
                key={event.id}
                to={`/events/${event.id}`}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  width: '100%',
                  transition: 'border-color 0.2s ease, background 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                  textDecoration: 'none'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary)'
                  e.currentTarget.style.background = 'var(--bg-card-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-color)'
                  e.currentTarget.style.background = 'var(--bg-card)'
                }}
              >
                <div style={{ flex: 1, minWidth: '250px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <Badge variant={getEventTypeBadgeVariant(event.type)}>
                      {event.type}
                    </Badge>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={14} />
                      {formatEventDateShort(event.date)}
                    </span>
                    {event.location && (
                      <span style={{ color: 'var(--text-secondary)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <MapPin size={14} />
                        {event.location}
                      </span>
                    )}
                  </div>
                  <h3 style={{ color: 'var(--text-primary)', margin: '0 0 8px', fontSize: '16px', fontWeight: '700' }}>
                    {event.title}
                  </h3>
                  {showVolunteers && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{
                        color: volStats.count >= volStats.required ? 'var(--success)' : 'var(--warning)',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <Handshake className="w-3.5 h-3.5 inline mr-1" />{volStats.count} / {volStats.required} bénévoles
                      </span>
                    </div>
                  )}
                </div>

                <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                  {event.user_registered && (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      background: 'var(--success-soft)',
                      border: '1px solid var(--success)',
                      color: 'var(--success-text)',
                      fontWeight: '600',
                      fontSize: '12px',
                      padding: '3px 10px',
                      borderRadius: '9999px'
                    }}>
                      <Check className="w-3 h-3 inline mr-1" />Inscrit
                    </span>
                  )}
                  {event.user_registered ? (
                    <span style={{
                      color: 'var(--text-muted)',
                      fontWeight: '500',
                      fontSize: '13px',
                      padding: '6px 14px',
                      borderRadius: '8px',
                      background: 'var(--bg-hover)',
                      border: '1px solid var(--border-color)'
                    }}>
                      Déjà inscrit
                    </span>
                  ) : isPast ? null : (
                    <span style={{
                      color: 'var(--primary)',
                      fontWeight: '600',
                      fontSize: '14px'
                    }}>
                      Voir détails →
                    </span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
