import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Event } from '../types'
import { Calendar, MapPin, Users, ArrowLeft, Clock, Star } from 'lucide-react'

interface VolunteerEntry {
  id: string
  first_name: string
  last_name: string
  availability_start: string | null
  availability_end: string | null
  preferred_posts: string[] | null
  status: string
  assigned_post_id: string | null
}

export function VolunteerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [event, setEvent] = useState<Event | null>(null)
  const [volunteers, setVolunteers] = useState<VolunteerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [userVolunteer, setUserVolunteer] = useState<VolunteerEntry | null>(null)

  useEffect(() => {
    loadData()
  }, [id, user?.id])

  const loadData = async () => {
    try {
      const { data: eventData } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      setEvent(eventData)

      const [{ data: evVols }, { data: regVols }] = await Promise.all([
        supabase
          .from('event_volunteers')
          .select('id, first_name, last_name, availability_start, availability_end, preferred_posts, status, assigned_post_id')
          .eq('event_id', id)
          .order('registered_at', { ascending: true }),
        supabase
          .from('event_registrations')
          .select('id, volunteer_role, created_at, profiles(first_name, last_name)')
          .eq('event_id', id)
          .eq('is_volunteer', true)
          .order('created_at', { ascending: true })
      ])

      const evVolList: VolunteerEntry[] = evVols || []
      const evVolIds = new Set(evVolList.map(v => v.id))

      const regVolList: VolunteerEntry[] = (regVols || [])
        .filter((r) => !evVolIds.has(r.id))
        .map((r) => {
          const prof = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
          return {
            id: r.id,
            first_name: prof?.first_name || '',
            last_name: prof?.last_name || '',
            availability_start: null,
            availability_end: null,
            preferred_posts: r.volunteer_role ? [r.volunteer_role] : null,
            status: 'confirmed',
            assigned_post_id: null
          }
        })

      setVolunteers([...evVolList, ...regVolList])

      if (user?.id) {
        const { data: mine } = await supabase
          .from('event_volunteers')
          .select('id, first_name, last_name, availability_start, availability_end, preferred_posts, status, assigned_post_id')
          .eq('event_id', id)
          .eq('user_id', user.id)
          .maybeSingle()
        setUserVolunteer(mine)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; color: string; bg: string; border: string }> = {
      pending: { label: 'En attente', color: 'var(--warning-text)', bg: 'var(--warning-soft)', border: 'var(--warning)' },
      confirmed: { label: 'Confirmé', color: 'var(--success-text)', bg: 'var(--success-soft)', border: 'var(--success)' },
      refused: { label: 'Refusé', color: 'var(--danger-text)', bg: 'var(--danger-soft)', border: 'var(--danger)' },
    }
    const s = map[status] || map.pending
    return (
      <span style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}`, borderRadius: '6px', padding: '3px 10px', fontSize: '12px', fontWeight: '600' }}>
        {s.label}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2" style={{ borderColor: 'var(--accent)' }} />
      </div>
    )
  }

  if (!event) {
    return (
      <div>
        <p style={{ color: 'var(--text-muted)' }}>Événement introuvable</p>
      </div>
    )
  }

  const max = event.max_volunteers || 0
  const pct = max > 0 ? Math.min((volunteers.length / max) * 100, 100) : 0

  return (
    <div className="max-w-4xl mx-auto">
      <button
        onClick={() => navigate('/benevoles')}
        className="flex items-center gap-2 mb-6 transition-colors"
        style={{ color: 'var(--text-muted)' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
      >
        <ArrowLeft size={20} />
        <span>Retour aux bénévolats</span>
      </button>

      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        borderRadius: '12px', padding: '24px', marginBottom: '20px'
      }}>
        <h1 style={{ color: 'var(--text-primary)', margin: '0 0 8px', fontSize: '22px', fontWeight: '700' }}>{event.title}</h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Calendar size={15} /> {formatDate(event.date)}
          </span>
          {event.location && (
            <span style={{ color: 'var(--text-muted)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MapPin size={15} /> {event.location}
            </span>
          )}
        </div>

        {event.description && (
          <p style={{ color: 'var(--text-secondary)', margin: '0 0 16px', fontSize: '14px', lineHeight: '1.6' }}>{event.description}</p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Users size={15} /> {volunteers.length} / {max || '∞'} bénévoles
          </span>
          {max > 0 && (
            <>
              <div style={{ flex: 1, maxWidth: '200px', height: '6px', background: 'var(--bg-hover)', borderRadius: '99px', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--primary)', borderRadius: '99px', transition: 'width 0.3s' }} />
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{Math.round(pct)}%</span>
            </>
          )}
        </div>
      </div>

      {userVolunteer && (
        <div style={{
          background: 'var(--success-soft)', border: '1px solid var(--success)',
          borderRadius: '12px', padding: '16px 20px', marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <p style={{ color: 'var(--success-text)', margin: '0 0 4px', fontSize: '14px', fontWeight: '700' }}>Vous êtes inscrit(e) comme bénévole</p>
              <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '13px' }}>
                Disponibilités : {userVolunteer.availability_start?.substring(0, 5)} – {userVolunteer.availability_end?.substring(0, 5)}
                {userVolunteer.preferred_posts && userVolunteer.preferred_posts.length > 0 && (
                  <> · Souhaits : {userVolunteer.preferred_posts.join(', ')}</>
                )}
              </p>
            </div>
            {statusBadge(userVolunteer.status)}
          </div>
        </div>
      )}

      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        borderRadius: '12px', padding: '24px'
      }}>
        <h2 style={{ color: 'var(--text-primary)', margin: '0 0 16px', fontSize: '18px', fontWeight: '700' }}>
          Bénévoles inscrits ({volunteers.length})
        </h2>

        {volunteers.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {volunteers.map(v => (
              <div key={v.id} style={{
                background: 'var(--bg-main)', border: '1px solid var(--border-color)',
                borderRadius: '8px', padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap'
              }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '14px', fontWeight: '700' }}>
                    {v.first_name.charAt(0)}{v.last_name.charAt(0)}
                  </span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>
                    {v.first_name} {v.last_name}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '10px', marginTop: '2px', flexWrap: 'wrap' }}>
                    {v.availability_start && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Clock size={11} /> {v.availability_start.substring(0, 5)}–{v.availability_end?.substring(0, 5)}
                      </span>
                    )}
                    {v.preferred_posts && v.preferred_posts.length > 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Star size={11} /> {v.preferred_posts.slice(0, 2).join(', ')}{v.preferred_posts.length > 2 ? '…' : ''}
                      </span>
                    )}
                  </div>
                </div>
                {statusBadge(v.status)}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <p style={{ color: 'var(--text-muted)' }}>Soyez le premier à vous inscrire !</p>
          </div>
        )}
      </div>
    </div>
  )
}
