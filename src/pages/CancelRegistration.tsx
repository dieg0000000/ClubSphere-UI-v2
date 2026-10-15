import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Calendar, MapPin, TriangleAlert as AlertTriangle, Check, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatEventDate } from '../utils/eventHelpers'
import { useToast } from '../hooks/useToast'
import { Toast } from '../components/Toast'

interface RegistrationData {
  id: string
  first_name: string
  last_name: string
  email: string
  quantity: number
  total_amount: number | null
  option_label: string | null
  status: string
  event_id: string
  event_title: string
  event_date: string
  event_location: string | null
  cancellation_deadline_days: number
  late_cancellation_fee: number | null
}

export default function CancelRegistration() {
  const [searchParams] = useSearchParams()
  const registrationId = searchParams.get('id')

  const [loading, setLoading] = useState(true)
  const [registration, setRegistration] = useState<RegistrationData | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const [error, setError] = useState('')
  const { toast, showToast } = useToast()

  useEffect(() => {
    if (registrationId) fetchRegistration()
    else {
      setError('Paramètre manquant')
      setLoading(false)
    }
  }, [registrationId])

  async function fetchRegistration() {
    try {
      const { data, error: fetchError } = await supabase
        .from('event_public_registrations')
        .select(`
          id, first_name, last_name, email, quantity,
          total_amount, option_label, status, event_id,
          events!inner(title, date, location, cancellation_deadline_days, late_cancellation_fee)
        `)
        .eq('id', registrationId!)
        .eq('status', 'confirmed')
        .maybeSingle()

      if (fetchError) throw fetchError
      if (!data) {
        setError('Inscription introuvable ou déjà annulée')
        return
      }

      const ev = data.events as any
      setRegistration({
        id: data.id,
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        quantity: data.quantity || 1,
        total_amount: data.total_amount,
        option_label: data.option_label,
        status: data.status,
        event_id: data.event_id,
        event_title: ev.title,
        event_date: ev.date,
        event_location: ev.location,
        cancellation_deadline_days: ev.cancellation_deadline_days ?? 7,
        late_cancellation_fee: ev.late_cancellation_fee,
      })
    } catch (err) {
      console.error('Error fetching registration:', err)
      setError('Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }

  function isLate(): boolean {
    if (!registration) return false
    const eventDate = new Date(registration.event_date)
    const deadlineDays = registration.cancellation_deadline_days || 7
    const deadline = new Date(eventDate.getTime() - deadlineDays * 24 * 60 * 60 * 1000)
    return new Date() > deadline
  }

  async function handleCancel() {
    if (!registration) return
    setCancelling(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('Vous devez être connecté pour annuler')
        return
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cancel-member-event-registration`
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ registration_id: registration.id }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Erreur serveur')
      }

      setCancelled(true)
      showToast('Inscription annulée', 'success')
    } catch (err: any) {
      console.error('Error cancelling:', err)
      setError(err.message || "Erreur lors de l'annulation")
    } finally {
      setCancelling(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-app)' }}>
        <div style={{ color: 'var(--text-secondary)' }}>Chargement...</div>
      </div>
    )
  }

  if (error || !registration) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-app)' }}>
        <div className="max-w-md w-full p-8 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 22, boxShadow: 'var(--shadow-lg)' }}>
          <X className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--danger-text)' }} />
          <p className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{error || 'Inscription introuvable'}</p>
          <Link to="/events" className="text-sm" style={{ color: 'var(--accent)' }}>
            Retour aux événements
          </Link>
        </div>
      </div>
    )
  }

  const late = isLate()

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-app)' }}>
      <Toast toast={toast} />
      <div className="max-w-lg w-full overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 22, boxShadow: 'var(--shadow-lg)' }}>
        <div className="p-6" style={{ background: 'var(--bg-modal-header)', borderBottom: '1px solid var(--border-color)' }}>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-modal-header)' }}>Annulation d'inscription</h1>
        </div>

        <div className="p-6 space-y-4">
          {cancelled ? (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ background: 'var(--success-soft)' }}>
                <Check className="w-8 h-8" style={{ color: 'var(--success-text)' }} />
              </div>
              <p className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>Inscription annulée</p>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Votre inscription à {registration.event_title} a été annulée.
                {late && registration.late_cancellation_fee && (
                  <> Des frais de CHF {registration.late_cancellation_fee.toFixed(2)} par personne peuvent être facturés.</>
                )}
              </p>
              <Link
                to="/events"
                className="inline-block px-4 py-2 rounded-lg font-medium transition-opacity hover:opacity-90"
                style={{ backgroundColor: 'var(--danger)', color: 'var(--text-inverse)' }}
              >
                Retour aux événements
              </Link>
            </div>
          ) : (
            <>
              <div className="rounded-lg p-4 space-y-2" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)' }}>
                <div className="flex items-center gap-2 font-semibold" style={{ color: 'var(--text-primary)' }}>
                  <Calendar className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  {registration.event_title}
                </div>
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{formatEventDate(registration.event_date)}</div>
                {registration.event_location && (
                  <div className="text-sm flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                    <MapPin className="w-3 h-3" />
                    {registration.event_location}
                  </div>
                )}
                <div className="pt-2 mt-2 space-y-1 text-sm" style={{ borderTop: '1px solid var(--border-color)' }}>
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--text-secondary)' }}>Inscrit</span>
                    <span style={{ color: 'var(--text-primary)' }}>{registration.first_name} {registration.last_name}</span>
                  </div>
                  {registration.option_label && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Tarif</span>
                      <span style={{ color: 'var(--text-primary)' }}>{registration.option_label}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--text-secondary)' }}>Personnes</span>
                    <span style={{ color: 'var(--text-primary)' }}>{registration.quantity}</span>
                  </div>
                  {registration.total_amount != null && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Total</span>
                      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>CHF {registration.total_amount.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>

              {late && registration.late_cancellation_fee ? (
                <div className="rounded-lg p-4" style={{ background: 'var(--warning-soft)', border: '1px solid var(--warning)' }}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--warning-text)' }} />
                    <div>
                      <p className="text-sm font-semibold mb-1" style={{ color: 'var(--warning-text)' }}>Annulation tardive</p>
                      <p className="text-sm" style={{ color: 'var(--warning-text)', opacity: 0.85 }}>
                        Le délai d'annulation gratuite est dépassé. Des frais de CHF {registration.late_cancellation_fee.toFixed(2)} par personne peuvent être facturés.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg p-4" style={{ background: 'var(--success-soft)', border: '1px solid var(--success)' }}>
                  <p className="text-sm" style={{ color: 'var(--success-text)' }}>Annulation gratuite — aucun frais ne sera facturé.</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Link
                  to="/events"
                  className="flex-1 px-4 py-3 rounded-lg text-center font-medium transition-colors"
                  style={{ border: '1px solid var(--border-color)', color: 'var(--text-secondary)', background: 'var(--bg-card)' }}
                >
                  Retour
                </Link>
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="flex-1 px-4 py-3 rounded-lg font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: 'var(--danger)', color: 'var(--text-inverse)' }}
                >
                  {cancelling ? 'Annulation...' : late ? 'Annuler quand même' : 'Annuler gratuitement'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
