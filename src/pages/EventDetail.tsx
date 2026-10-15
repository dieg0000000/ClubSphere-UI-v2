import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Calendar, MapPin, ArrowLeft, X, Heart, Ticket, Handshake, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { invokeFunction } from '../lib/invokeFunction'
import { useToast } from '../hooks/useToast'
import { Toast } from '../components/Toast'
import { EventWithRegistrations } from '../types'
import {
  getEventTypeBadgeVariant,
  formatEventDate,
  isEventPast,
  isEventFull
} from '../utils/eventHelpers'
import { useAuth } from '../context/AuthContext'
import { VolunteerModal } from '../components/VolunteerModal'
import EventRegistrationModal from '../components/EventRegistrationModal'
import Button from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Alert } from '../components/ui/Alert'

interface PriceOption {
  id: string
  label: string
  seats: number
  price: number
}

export function EventDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [event, setEvent] = useState<EventWithRegistrations | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { toast, showToast } = useToast()
  const [showVolunteerModal, setShowVolunteerModal] = useState(false)
  const [volunteerRegistered, setVolunteerRegistered] = useState(false)
  const [volunteerSuccessName, setVolunteerSuccessName] = useState<string | null>(null)
  const [volunteerPosts, setVolunteerPosts] = useState<{ id: string; name: string }[]>([])
  const [volunteerCount, setVolunteerCount] = useState(0)
  const [volunteerRequired, setVolunteerRequired] = useState(0)

  const [showRegistrationModal, setShowRegistrationModal] = useState(false)
  const [priceOptions, setPriceOptions] = useState<PriceOption[]>([])
  const [regCount, setRegCount] = useState(0)
  const [registrationSuccess, setRegistrationSuccess] = useState(false)
  const [userRegId, setUserRegId] = useState<string | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    if (id) {
      fetchEvent()
      fetchVolunteerPosts()
      fetchRegistrations()
    }
  }, [id, user])

  async function fetchEvent() {
    try {
      setLoading(true)

      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .single()

      if (eventError) throw eventError

      const { count: memberRegCount } = await supabase
        .from('event_registrations')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', id)

      const { count: volCount } = await supabase
        .from('event_volunteers')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', id)

      const count = (memberRegCount || 0) + (volCount || 0)

      let userRegistered = false
      if (user) {
        const [{ data: registration }, { data: pubByProfile }, { data: volReg }] = await Promise.all([
          supabase.from('event_registrations').select('id').eq('event_id', id).eq('user_id', user.id).maybeSingle(),
          supabase.from('event_public_registrations')
            .select('id')
            .eq('event_id', id!)
            .eq('status', 'confirmed')
            .eq('profile_id', user.id),
          supabase.from('event_volunteers').select('id').eq('event_id', id).eq('user_id', user.id).maybeSingle()
        ])
        const pubReg = pubByProfile && pubByProfile[0]

        userRegistered = !!(registration || pubReg)
        setUserRegId(pubReg?.id || null)
        setVolunteerRegistered(!!volReg)
      }

      setEvent({
        ...eventData,
        registration_count: count || 0,
        user_registered: userRegistered
      })
    } catch (err) {
      console.error('Error fetching event:', err)
      setError("Erreur lors du chargement de l'événement")
    } finally {
      setLoading(false)
    }
  }

  async function fetchVolunteerPosts() {
    const { data } = await supabase
      .from('event_volunteer_posts')
      .select('id, name, required_count')
      .eq('event_id', id)
      .order('name')
    setVolunteerPosts((data || []).map(p => ({ id: p.id, name: p.name })))
    const total = (data || []).reduce((sum, p) => sum + (p.required_count || 0), 0)
    setVolunteerRequired(total)

    const { count } = await supabase
      .from('event_volunteers')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', id)
    setVolunteerCount(count || 0)
  }

  async function fetchRegistrations() {
    const [{ data: priceOpts }, { count }] = await Promise.all([
      supabase.from('event_price_options').select('id, label, seats, price').eq('event_id', id!).eq('active', true).order('display_order'),
      supabase.from('event_public_registrations').select('*', { count: 'exact', head: true }).eq('event_id', id!).eq('status', 'confirmed')
    ])
    setPriceOptions((priceOpts || []) as PriceOption[])
    setRegCount(count || 0)
  }

  const handleRegistrationSuccess = () => {
    setShowRegistrationModal(false)
    setRegistrationSuccess(true)
    fetchRegistrations()
    fetchEvent()
    setTimeout(() => setRegistrationSuccess(false), 8000)
  }

  const handleVolunteerSuccess = async () => {
    setShowVolunteerModal(false)
    setVolunteerRegistered(true)
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name')
        .eq('id', user.id)
        .maybeSingle()
      setVolunteerSuccessName(profile?.first_name || user.email?.split('@')[0] || '')
    }
    setTimeout(() => setVolunteerSuccessName(null), 8000)
  }

  async function handleCancelRegistration() {
    if (!userRegId) return
    setCancelling(true)
    try {
      const { data, error: fnError } = await invokeFunction('cancel-member-event-registration', {
        body: { registration_id: userRegId }
      })
      if (fnError) {
        showToast(fnError || "Impossible d'annuler l'inscription.", 'error')
        return
      }

      if (data?.was_late && data?.fee_invoice_number) {
        showToast(`Inscription annulée. Des frais d'annulation de ${Number(data.fee_amount).toFixed(2)} CHF vous seront facturés.`, 'success')
      } else {
        showToast('Inscription annulée', 'success')
      }
      setShowCancelConfirm(false)
      setUserRegId(null)
      setEvent(prev => prev ? { ...prev, user_registered: false } : prev)
      fetchRegistrations()
    } finally {
      setCancelling(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div style={{ color: 'var(--text-secondary)' }}>Chargement...</div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="text-center py-12">
        <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>Événement introuvable</p>
        <Link to="/events" style={{ color: 'var(--accent)' }}>
          Retour aux événements
        </Link>
      </div>
    )
  }

  const isPast = isEventPast(event.date)
  const isFull = isEventFull(event.registration_count || 0, event.max_attendees)
  const showVolunteerSection = event.needs_volunteers && volunteerPosts.length > 0

  const isRegisterable = event.is_registerable && !isPast
  const deadlinePassed = event.registration_deadline ? new Date(event.registration_deadline) < new Date() : false
  const isExtFull = event.max_attendees ? regCount >= event.max_attendees : false
  const canRegister = isRegisterable && !deadlinePassed && !isExtFull

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {toast && <Toast toast={toast} />}
      <Button
        variant="secondary"
        size="sm"
        leftIcon={<ArrowLeft className="w-4 h-4" />}
        onClick={() => navigate('/events')}
      >
        Retour aux événements
      </Button>

      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <div className="p-8">
          <div className="flex items-start justify-between mb-6">
            <Badge variant={getEventTypeBadgeVariant(event.type)}>
              {event.type}
            </Badge>
          </div>

          <h1 className="text-3xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>{event.title}</h1>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div className="flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
              <Calendar className="w-5 h-5" style={{ color: 'var(--accent)' }} />
              <div>
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Date</div>
                <div className="font-medium">{formatEventDate(event.date)}</div>
              </div>
            </div>

            {event.location && (
              <div className="flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
                <MapPin className="w-5 h-5" style={{ color: 'var(--accent)' }} />
                <div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Lieu</div>
                  <div className="font-medium">{event.location}</div>
                </div>
              </div>
            )}

            {event.needs_volunteers && volunteerPosts.length > 0 && (
              <div className="flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
                <Heart className="w-5 h-5" style={{ color: 'var(--accent)' }} />
                <div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Bénévoles</div>
                  <div className="font-medium">
                    {volunteerCount} / {volunteerRequired} postes pourvus
                  </div>
                </div>
              </div>
            )}
          </div>

          {event.description && (
            <div className="mb-0">
              <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Description</h2>
              <p className="whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{event.description}</p>
            </div>
          )}

          {showVolunteerSection && (
            <>
              <div style={{ borderTop: '1px solid var(--border-color)', margin: '16px 0' }} />
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '10px' }}>
                <Handshake className="w-4 h-4 inline mr-1" />Bénévoles recherchés pour cet événement
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {volunteerPosts.map(post => (
                  <span
                    key={post.id}
                    style={{
                      background: 'var(--accent-soft)',
                      color: 'var(--accent-text)',
                      padding: '4px 12px',
                      borderRadius: '999px',
                      fontSize: '13px',
                      fontWeight: '500'
                    }}
                  >
                    {post.name}
                  </span>
                ))}
              </div>
              <div style={{ borderTop: '1px solid var(--border-color)', margin: '16px 0' }} />
            </>
          )}

          {event.user_registered && (
            <div className="mb-6">
              <Alert variant="success" title="Vous êtes inscrit(e) à cet événement" />
            </div>
          )}

          {isPast && (
            <div className="rounded-lg p-4 mb-6" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-color)' }}>
              <p className="text-center" style={{ color: 'var(--text-secondary)' }}>Cet événement est terminé</p>
            </div>
          )}

          {!isPast && isFull && (
            <div className="mb-6">
              <Alert variant="warning" title="Cet événement est complet" />
            </div>
          )}

          {error && (
            <Alert variant="danger" className="mb-6">{error}</Alert>
          )}

          {volunteerSuccessName !== null && (
            <div className="mb-4">
              <Alert variant="success" title={`Merci ${volunteerSuccessName} !`}>
                Votre inscription a bien été enregistrée. Vous recevrez un email de confirmation.
              </Alert>
            </div>
          )}

          {showVolunteerSection && !isPast && user && (
            volunteerRegistered ? (
              <div className="flex items-center gap-2 justify-center py-3 px-4 rounded-lg" style={{ border: '1px solid var(--success)', background: 'var(--success-soft)' }}>
                <Heart className="w-4 h-4" style={{ color: 'var(--success)' }} fill="currentColor" />
                <span className="text-sm font-semibold" style={{ color: 'var(--success-text)' }}>Inscrit(e) comme bénévole</span>
              </div>
            ) : (
              <Button
                variant="primary"
                className="w-full"
                leftIcon={<Heart className="w-4 h-4" fill="currentColor" />}
                onClick={() => setShowVolunteerModal(true)}
              >
                Je veux être bénévole pour cet événement
              </Button>
            )
          )}

          {registrationSuccess && (
            <div className="mt-4">
              <Alert variant="success" title="Inscription confirmee !">
                Vous recevrez un email de confirmation avec les details de votre inscription.
              </Alert>
            </div>
          )}

          {isRegisterable && !deadlinePassed && isExtFull && (
            <div className="mt-4">
              <Alert variant="warning" title="Complet" />
            </div>
          )}

          {isRegisterable && deadlinePassed && (
            <div className="rounded-lg p-4 mt-4" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-color)' }}>
              <p className="text-center text-sm" style={{ color: 'var(--text-secondary)' }}>La date limite d'inscription est passee</p>
            </div>
          )}

          {canRegister && !registrationSuccess && (
            event.user_registered ? (
              <div className="flex flex-col sm:flex-row gap-3 mt-4">
                <Button
                  variant="secondary"
                  disabled
                  className="flex-1"
                >
                  <Check className="w-4 h-4 inline mr-1" />Déjà inscrit
                </Button>
                {userRegId && (
                  showCancelConfirm ? (
                    <div className="flex-1 flex flex-col gap-2 p-4 rounded-lg" style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger)' }}>
                      <p className="text-sm font-medium text-center" style={{ color: 'var(--danger)' }}>Confirmer l'annulation de votre inscription ?</p>
                      {(() => {
                        const ev = event as any;
                        const deadlineDays = ev?.cancellation_deadline_days;
                        const fee = ev?.late_cancellation_fee;
                        if (deadlineDays && fee > 0 && ev?.date) {
                          const eventDate = new Date(ev.date);
                          const deadlineDate = new Date(eventDate.getTime() - deadlineDays * 86400000);
                          if (new Date() > deadlineDate) {
                            return (
                              <p className="text-xs text-center" style={{ color: 'var(--danger)', fontWeight: 500, margin: '4px 0' }}>
                                Annulation à moins de {deadlineDays} jours de l'événement : des frais de {Number(fee).toFixed(2)} CHF vous seront facturés.
                              </p>
                            );
                          }
                        }
                        return null;
                      })()}
                      <div className="flex gap-2">
                        <Button
                          variant="danger"
                          size="sm"
                          className="flex-1"
                          loading={cancelling}
                          onClick={handleCancelRegistration}
                        >
                          {cancelling ? 'Annulation...' : 'Oui, annuler'}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="flex-1"
                          onClick={() => setShowCancelConfirm(false)}
                        >
                          Non, garder
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="secondary"
                      className="flex-1"
                      leftIcon={<X className="w-4 h-4" />}
                      onClick={() => setShowCancelConfirm(true)}
                    >
                      Annuler mon inscription
                    </Button>
                  )
                )}
              </div>
            ) : (
              <Button
                variant="primary"
                className="w-full mt-4"
                leftIcon={<Ticket className="w-5 h-5" />}
                onClick={() => setShowRegistrationModal(true)}
              >
                S'inscrire à cet événement
              </Button>
            )
          )}

        </div>
      </div>

      {showVolunteerModal && event && (
        <VolunteerModal
          event={event}
          onClose={() => setShowVolunteerModal(false)}
          onSuccess={handleVolunteerSuccess}
        />
      )}

      {showRegistrationModal && event && (
        <EventRegistrationModal
          event={event}
          priceOptions={priceOptions}
          user={user}
          onClose={() => setShowRegistrationModal(false)}
          onSuccess={handleRegistrationSuccess}
        />
      )}
    </div>
  )
}
