import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toLocalDatetimeValue } from '../utils/formatHelpers'
import { Calendar, MapPin, Plus, CreditCard as Edit2, Trash2, X, FileText, Heart, Ticket, RefreshCw, Copy, Check, Link as LinkIcon, Eye, Settings } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { EventWithRegistrations, Event } from '../types'
import useEscapeKey from '../hooks/useEscapeKey'
import { useToast } from '../hooks/useToast'
import { Toast } from '../components/Toast'
import ConfirmModal from '../components/ConfirmModal'
import { useModuleAccess } from '../hooks/useModuleAccess'
import { useTenant } from '../context/TenantContext'
import { useWebsiteModuleEnabled } from '../hooks/useWebsiteModuleEnabled'
import PageTitleCount from '../components/PageTitleCount'
import {
  getEventTypeBadgeVariant,
  formatEventDateShort,
} from '../utils/eventHelpers'
import Button from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Toggle } from '../components/Toggle'

type EventFormData = Omit<Event, 'id' | 'created_at' | 'updated_at'> & { publish_on_site: boolean }

interface PriceOptionRow {
  id?: string
  label: string
  seats: string
  price: string
  active: boolean
}

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function generateSlug(title: string): string {
  const base = slugify(title)
  const rand = Math.random().toString(36).substring(2, 9)
  return `${base}-${rand}`
}

export function AdminEvents() {
  const navigate = useNavigate()
  const { canEdit } = useModuleAccess('evenements')
  const [events, setEvents] = useState<EventWithRegistrations[]>([])
  const [volunteerStats, setVolunteerStats] = useState<Record<string, { count: number; required: number }>>({})
  const [placeCounts, setPlaceCounts] = useState<Record<string, number>>({})

  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState<EventWithRegistrations | null>(null)
  const [formData, setFormData] = useState<EventFormData>({
    title: '',
    description: '',
    date: '',
    location: '',
    type: '',
    max_attendees: undefined,
    requires_volunteers: false,
    needs_volunteers: false,
    max_volunteers: 0,
    is_registerable: false,
    registration_deadline: undefined,
    cancellation_deadline_days: 7,
    cost_price: undefined,
    compte: '',
    payment_modes: [],
    publish_on_site: false
  })
  const [paymentModeSelection, setPaymentModeSelection] = useState<string>('both')
  const { toast, showToast } = useToast()
  const { clubId } = useTenant()
  const { enabled: websiteEnabled } = useWebsiteModuleEnabled()

  const [publicRegOpen, setPublicRegOpen] = useState(false)
  const [publicRegSlug, setPublicRegSlug] = useState<string | null>(null)
  const [lateCancellationFee, setLateCancellationFee] = useState<number>(60)
  const [priceOptionRows, setPriceOptionRows] = useState<PriceOptionRow[]>([])
  const [slugCopied, setSlugCopied] = useState(false)
  const [notifyMembers, setNotifyMembers] = useState(false)
  const [isPaid, setIsPaid] = useState(false)
  const [paidError, setPaidError] = useState<string | null>(null)

  const [editingVolunteerTotal, setEditingVolunteerTotal] = useState(0)

  const [eventTypeOptions, setEventTypeOptions] = useState<string[]>([])

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    confirmLabel: string;
    cancelLabel: string;
    confirmStyle: 'danger' | 'warning' | 'primary';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Confirmer',
    cancelLabel: 'Annuler',
    confirmStyle: 'danger',
    onConfirm: () => {}
  })

  const showConfirm = (config: Partial<typeof confirmState>) => {
    setConfirmState(prev => ({ ...prev, ...config, isOpen: true }))
  }

  const hideConfirm = () => {
    setConfirmState(prev => ({ ...prev, isOpen: false }))
  }

  useEffect(() => {
    document.title = 'Admin Événements - ClubSphere'
    fetchEvents()
    loadEventTypes()
  }, [])

  const handleCloseForm = useCallback(() => {
    setShowForm(false)
  }, [])

  useEscapeKey(handleCloseForm)

  async function loadEventTypes() {
    const { data } = await supabase
      .from('event_types')
      .select('name')
      .eq('active', true)
      .order('display_order')
    setEventTypeOptions(data?.map(r => r.name) || [])
  }

  async function fetchEvents() {
    try {
      setLoading(true)

      const { data, error } = await supabase
        .from('events')
        .select(`
          *,
          event_registrations(count),
          event_volunteers(count)
        `)
        .order('date', { ascending: false })

      if (error) throw error

      const eventsWithCount = data?.map(event => ({
        ...event,
        registration_count: event.event_registrations?.[0]?.count || 0,
        volunteer_count: (event as { event_volunteers?: { count: number }[] }).event_volunteers?.[0]?.count || 0
      })) || []

      setEvents(eventsWithCount)

      const eventIds = eventsWithCount.map(e => e.id)

      const { data: pubRegs } = await supabase
        .from('event_public_registrations')
        .select('event_id, option_seats, quantity, status')
        .in('event_id', eventIds)

      const counts: Record<string, number> = {}
      for (const r of pubRegs || []) {
        if (r.status !== 'confirmed') continue
        counts[r.event_id] = (counts[r.event_id] || 0) + (r.option_seats || 1) * (r.quantity || 1)
      }
      setPlaceCounts(counts)

      const stats: Record<string, { count: number; required: number }> = {}
      await Promise.all(
        eventsWithCount.map(async (event) => {
          const { count: volunteersCount } = await supabase
            .from('event_volunteers')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', event.id)

          const { data: posts } = await supabase
            .from('event_volunteer_posts')
            .select('required_count')
            .eq('event_id', event.id)

          const totalRequired = posts?.reduce((sum, p) => sum + (p.required_count || 0), 0) || 0
          stats[event.id] = { count: volunteersCount || 0, required: totalRequired }
        })
      )
      setVolunteerStats(stats)
    } catch (error) {
      console.error('Error fetching events:', error)
    } finally {
      setLoading(false)
    }
  }

  function openCreateForm() {
    setEditingEvent(null)
    setFormData({
      title: '',
      description: '',
      date: '',
      location: '',
      type: '',
      max_attendees: undefined,
      requires_volunteers: false,
      needs_volunteers: false,
      max_volunteers: 0,
      is_registerable: false,
      registration_deadline: undefined,
      cancellation_deadline_days: 7,
      cost_price: undefined,
      payment_modes: [],
      publish_on_site: false
    })
    setPaymentModeSelection('both')
    setPublicRegOpen(false)
    setPublicRegSlug(null)
    setLateCancellationFee(60)
    setPriceOptionRows([])
    setIsPaid(false)
    setPaidError(null)
    setNotifyMembers(false)
    setShowForm(true)
  }

  async function openEditForm(event: EventWithRegistrations) {
    setEditingEvent(event)
    const dateForInput = toLocalDatetimeValue(event.date)
    const deadlineForInput = event.registration_deadline
      ? toLocalDatetimeValue(event.registration_deadline)
      : undefined

    const modes = event.payment_modes || []
    let modeSelection = 'both'
    if (modes.length === 1 && modes[0] === 'invoice') modeSelection = 'invoice'
    else if (modes.length === 1 && modes[0] === 'cash_card') modeSelection = 'cash_card'

    setFormData({
      title: event.title,
      description: event.description,
      date: dateForInput,
      location: event.location,
      type: event.type,
      max_attendees: event.max_attendees,
      requires_volunteers: event.requires_volunteers,
      needs_volunteers: event.needs_volunteers || false,
      max_volunteers: event.max_volunteers || 0,
      is_registerable: event.is_registerable || false,
      registration_deadline: deadlineForInput,
      cancellation_deadline_days: event.cancellation_deadline_days ?? 7,
      cost_price: event.cost_price,
      compte: event.compte || '',
      payment_modes: modes,
      publish_on_site: (event as any).publish_on_site ?? false
    })
    setPaymentModeSelection(modeSelection)

    const { data: posts } = await supabase
      .from('event_volunteer_posts')
      .select('required_count')
      .eq('event_id', event.id)
    const total = posts?.reduce((sum, p) => sum + (p.required_count || 0), 0) || 0
    setEditingVolunteerTotal(total)

    setPublicRegOpen((event as any).public_registration_open || false)
    setPublicRegSlug((event as any).public_registration_slug || null)
    setLateCancellationFee((event as any).late_cancellation_fee ?? 60)

    const { data: priceOpts } = await supabase
      .from('event_price_options')
      .select('*')
      .eq('event_id', event.id)
      .order('display_order')
    const mappedPriceOpts = (priceOpts || []).map(o => ({
      id: o.id,
      label: o.label,
      seats: String(o.seats),
      price: String(o.price),
      active: o.active ?? true
    }))
    setPriceOptionRows(mappedPriceOpts)
    setIsPaid(mappedPriceOpts.some(o => o.active))
    setPaidError(null)

    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingEvent(null)
  }

  async function handleStartMeeting(event: EventWithRegistrations) {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const meetingType = event.type === 'General Assembly' ? 'ag' : 'comite'
      const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
        'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
      const eventDate = new Date(event.date)
      const title = meetingType === 'ag'
        ? `Assemblée Générale - ${monthNames[eventDate.getMonth()]} ${eventDate.getFullYear()}`
        : `Séance de comité - ${monthNames[eventDate.getMonth()]} ${eventDate.getFullYear()}`

      const { data: meeting, error } = await supabase
        .from('meetings')
        .insert([{
          type: meetingType,
          title,
          date: event.date,
          location: event.location || null,
          event_id: event.id,
          created_by: user?.id || null,
          status: 'brouillon'
        }])
        .select()
        .single()

      if (error) throw error

      if (meeting) {
        navigate(`/admin/pv-seances/${meeting.id}`)
      }
    } catch (err) {
      console.error('Error creating meeting:', err)
      showToast('Erreur lors de la création de la séance', 'error')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (formData.is_registerable && isPaid) {
      const hasActiveOption = priceOptionRows.some(r => r.active && r.label.trim())
      if (!hasActiveOption) {
        setPaidError('Un événement payant doit avoir au moins une option de prix active.')
        return
      }
    }
    setPaidError(null)

    try {
      const paymentModes = paymentModeSelection === 'both'
        ? ['invoice', 'cash_card']
        : [paymentModeSelection]

      const { requires_volunteers: _rv, ...restForm } = formData
      const eventData = {
        ...restForm,
        date: new Date(formData.date).toISOString(),
        registration_deadline: formData.registration_deadline
          ? new Date(formData.registration_deadline).toISOString()
          : null,
        payment_modes: (formData.is_registerable && isPaid) ? paymentModes : [],
        cost_price: (formData.is_registerable && isPaid) ? (formData.cost_price || null) : null,
        compte: (formData.is_registerable && isPaid) ? (formData.compte?.trim() || null) : null,
        public_registration_open: publicRegOpen,
        public_registration_slug: publicRegOpen ? publicRegSlug : null,
        late_cancellation_fee: (formData.is_registerable && isPaid) ? lateCancellationFee : 0,
        publish_on_site: formData.publish_on_site
      }

      let eventId = editingEvent?.id

      if (editingEvent) {
        const { error } = await supabase
          .from('events')
          .update(eventData)
          .eq('id', editingEvent.id)

        if (error) {
          console.error('Update error:', error)
          throw error
        }
      } else {
        const { data: inserted, error } = await supabase
          .from('events')
          .insert([eventData])
          .select('id')
          .single()

        if (error) {
          console.error('Insert error:', error)
          throw error
        }
        eventId = inserted.id

        if (notifyMembers) {
          try {
            const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-event-notification`
            const { data: { session: currentSession } } = await supabase.auth.getSession()
            fetch(apiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentSession?.access_token}`,
              },
              body: JSON.stringify({ event_id: eventId }),
            }).catch(() => {})
          } catch {
            // best-effort
          }
        }
      }

      if (eventId) {
        if (editingEvent) {
          const existingPriceIds = priceOptionRows.filter(r => r.id).map(r => r.id!)
          const { data: currentPriceOpts } = await supabase
            .from('event_price_options')
            .select('id')
            .eq('event_id', eventId)
          const priceToDelete = (currentPriceOpts || []).filter(o => !existingPriceIds.includes(o.id))
          for (const o of priceToDelete) {
            const { error } = await supabase.from('event_price_options').delete().eq('id', o.id)
            if (error) throw error
          }
        }

        for (let i = 0; i < priceOptionRows.length; i++) {
          const row = priceOptionRows[i]
          const payload = {
            label: row.label,
            seats: parseInt(row.seats) || 1,
            price: parseFloat(row.price) || 0,
            display_order: i,
            active: row.active
          }
          if (row.id) {
            const { error } = await supabase.from('event_price_options').update(payload).eq('id', row.id)
            if (error) throw error
          } else {
            const { error } = await supabase.from('event_price_options').insert({ ...payload, event_id: eventId, club_id: clubId })
            if (error) throw error
          }
        }
      }

      closeForm()
      if (!editingEvent) {
        showToast(notifyMembers ? 'Événement créé, membres notifiés' : 'Événement créé', 'success')
      }
      fetchEvents()
    } catch (error: any) {
      console.error('Error saving event:', error)
      showToast(`Erreur lors de la sauvegarde de l'événement: ${error.message || 'Erreur inconnue'}`, 'error')
    }
  }

  async function handleDelete(eventId: string) {
    showConfirm({
      title: 'Supprimer l\'événement',
      message: 'Êtes-vous sûr de vouloir supprimer cet événement ?',
      confirmLabel: 'Oui, supprimer',
      cancelLabel: 'Non',
      confirmStyle: 'danger',
      onConfirm: async () => {
        hideConfirm()
        try {
          const { error } = await supabase
            .from('events')
            .delete()
            .eq('id', eventId)

          if (error) throw error

          fetchEvents()
        } catch (error: any) {
          console.error('Error deleting event:', error)
          const msg = error?.message || '';
          showToast(msg.includes('Suppression impossible') ? msg : 'Erreur lors de la suppression de l\'événement', 'error')
        }
      }
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div style={{ color: 'var(--text-muted)' }}>Chargement...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Calendar className="w-5 h-5" />
            Événements
              <PageTitleCount total={events.length} />
          </h1>
          <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>Gestion des événements</p>
        </div>
        {canEdit && (
          <Button
            onClick={openCreateForm}
            leftIcon={<Plus className="w-5 h-5" />}
          >
            Nouvel événement
          </Button>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="sticky top-0 flex items-center justify-between px-6 py-4 rounded-t-xl" style={{ background: 'var(--bg-modal-header)' }}>
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-modal-header)' }}>
                {editingEvent ? 'Modifier l\'événement' : 'Nouvel événement'}
              </h2>
              <button
                onClick={closeForm}
                className="p-2 hover:opacity-80 rounded-lg transition-opacity"
                style={{ color: 'var(--text-modal-header)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Titre *
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Description *
                </label>
                <textarea
                  required
                  rows={4}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Date *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Type *
                  </label>
                  <select
                    required
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  >
                    <option value="">-- Sélectionner --</option>
                    {eventTypeOptions.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Lieu
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Participants attendus
                </label>
                <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>(joueurs, entraîneurs, visiteurs attendus sur site)</p>
                <input
                  type="number"
                  min="1"
                  value={formData.max_attendees || ''}
                  onChange={(e) => setFormData({ ...formData, max_attendees: e.target.value ? parseInt(e.target.value) : undefined })}
                  className="w-full px-4 py-2 rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="needs_volunteers"
                  checked={formData.needs_volunteers}
                  onChange={(e) => setFormData({ ...formData, needs_volunteers: e.target.checked })}
                  className="w-4 h-4 rounded"
                />
                <label htmlFor="needs_volunteers" className="text-sm">
                  Recherche des bénévoles
                </label>
              </div>

              {formData.needs_volunteers && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Nombre maximum de bénévoles
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      readOnly
                      value={editingVolunteerTotal}
                      className="w-32 px-4 py-2 rounded-lg cursor-not-allowed focus:outline-none" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}
                    />
                    {editingEvent && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => { closeForm(); navigate(`/admin/benevoles?event_id=${editingEvent.id}`) }}
                      >
                        <Settings className="w-4 h-4 inline mr-1" />Configurer les postes
                      </Button>
                    )}
                  </div>
                  {editingVolunteerTotal === 0 && (
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Aucun poste défini. Cliquez sur "Configurer les postes" pour en ajouter.</p>
                  )}
                </div>
              )}

              <div style={{ borderTop: '1px solid var(--border-color)', margin: '16px 0', paddingTop: '16px' }}>
                <div className="flex items-center gap-2 mb-4">
                  <input
                    type="checkbox"
                    id="is_registerable"
                    checked={formData.is_registerable}
                    onChange={(e) => setFormData({ ...formData, is_registerable: e.target.checked })}
                    className="w-4 h-4 rounded"
                  />
                  <label htmlFor="is_registerable" className="text-sm font-semibold flex items-center gap-2">
                    <Ticket className="w-4 h-4 text-primary-400" />
                    Ouvert aux inscriptions
                  </label>
                </div>

                {formData.is_registerable && (
                  <div className="space-y-4 pl-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Date limite d'inscription
                        </label>
                        <input
                          type="datetime-local"
                          value={formData.registration_deadline || ''}
                          onChange={(e) => setFormData({ ...formData, registration_deadline: e.target.value || undefined })}
                          className="w-full px-4 py-2 rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Annulation gratuite jusqu'a (jours avant)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={formData.cancellation_deadline_days ?? 7}
                          onChange={(e) => setFormData({ ...formData, cancellation_deadline_days: parseInt(e.target.value) || 0 })}
                          className="w-full px-4 py-2 rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        />
                      </div>
                    </div>

                    {/* Gratuit / Payant segmented control */}
                    <div>
                      <label className="block text-sm font-medium mb-2">Événement payant ?</label>
                      <div className="flex gap-3 mt-1">
                        {[
                          { value: false, label: 'Gratuit' },
                          { value: true, label: 'Payant' },
                        ].map(opt => {
                          const selected = isPaid === opt.value
                          return (
                            <label
                              key={String(opt.value)}
                              className="flex-1 flex items-center justify-center gap-2 rounded-lg cursor-pointer transition-all text-sm"
                              style={{
                                border: selected ? '2px solid var(--accent)' : '1px solid var(--border-color)',
                                background: selected ? 'var(--accent-soft)' : 'var(--bg-card)',
                                color: selected ? 'var(--accent)' : 'var(--text-secondary)',
                                fontWeight: selected ? 600 : 400,
                                padding: selected ? '9px 11px' : '10px 12px',
                              }}
                              onMouseEnter={(e) => { if (!selected) e.currentTarget.style.borderColor = 'var(--text-muted)' }}
                              onMouseLeave={(e) => { if (!selected) e.currentTarget.style.borderColor = 'var(--border-color)' }}
                            >
                              <input
                                type="radio"
                                name="paid_mode_sel"
                                checked={selected}
                                onChange={() => { setIsPaid(opt.value); setPaidError(null) }}
                                className="hidden"
                              />
                              {selected && <Check size={14} strokeWidth={2.5} />}
                              {opt.label}
                            </label>
                          )
                        })}
                      </div>
                    </div>

                    {/* Paid event block */}
                    {isPaid && (
                      <div className="space-y-4" style={{ background: 'var(--bg-hover)', borderRadius: '10px', padding: '16px' }}>
                        <div>
                          <label className="block text-sm font-medium mb-2">Options de prix</label>
                          <div className="space-y-2">
                            {priceOptionRows.map((row, idx) => (
                              <div key={idx} className="flex items-center gap-3" style={{ opacity: row.active ? 1 : 0.6 }}>
                                <input
                                  type="text"
                                  required
                                  placeholder="Ex: Place individuelle"
                                  value={row.label}
                                  onChange={(e) => {
                                    const updated = [...priceOptionRows]
                                    updated[idx] = { ...updated[idx], label: e.target.value }
                                    setPriceOptionRows(updated)
                                  }}
                                  className="flex-1 px-4 py-2 rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                />
                                <div className="flex items-center gap-1">
                                  <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>Places</span>
                                  <input
                                    type="number"
                                    required
                                    min="1"
                                    value={row.seats}
                                    onChange={(e) => {
                                      const updated = [...priceOptionRows]
                                      updated[idx] = { ...updated[idx], seats: e.target.value }
                                      setPriceOptionRows(updated)
                                    }}
                                    className="w-16 px-2 py-2 rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                  />
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>CHF</span>
                                  <input
                                    type="number"
                                    required
                                    step="0.05"
                                    min="0"
                                    placeholder="0.00"
                                    value={row.price}
                                    onChange={(e) => {
                                      const updated = [...priceOptionRows]
                                      updated[idx] = { ...updated[idx], price: e.target.value }
                                      setPriceOptionRows(updated)
                                    }}
                                    className="w-24 px-3 py-2 rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                  />
                                </div>
                                <div className="flex items-center gap-2" title="Option proposée à l'inscription">
                                  <Toggle
                                    checked={row.active}
                                    onChange={(checked) => {
                                      const updated = [...priceOptionRows]
                                      updated[idx] = { ...updated[idx], active: checked }
                                      setPriceOptionRows(updated)
                                    }}
                                    size="sm"
                                  />
                                  {!row.active && <Badge variant="neutral">Désactivée</Badge>}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setPriceOptionRows(priceOptionRows.filter((_, i) => i !== idx))}
                                  className="p-2 rounded-lg transition-colors"
                                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--danger-soft)'}
                                  onMouseLeave={(e) => e.currentTarget.style.background = ''}
                                >
                                  <Trash2 className="w-4 h-4" style={{ color: 'var(--danger)' }} />
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => setPriceOptionRows([...priceOptionRows, { label: '', seats: '1', price: '', active: true }])}
                              className="flex items-center gap-2 px-3 py-2 text-sm border border-dashed rounded-lg transition-colors"
                              style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-color)' }}
                            >
                              <Plus className="w-4 h-4" />
                              Ajouter une option
                            </button>
                          </div>
                          {paidError && (
                            <p className="text-sm mt-2" style={{ color: 'var(--danger)' }}>{paidError}</p>
                          )}
                        </div>

                        <div className="w-48">
                          <label className="block text-sm font-medium mb-2">Frais d'annulation tardive (CHF)</label>
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            value={lateCancellationFee}
                            onChange={(e) => setLateCancellationFee(parseFloat(e.target.value) || 0)}
                            className="w-full px-4 py-2 rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2">Mode de paiement</label>
                          <div className="flex gap-3 mt-1">
                            {[
                              { value: 'invoice', label: 'Facture' },
                              { value: 'cash_card', label: 'Cash / Carte' },
                              { value: 'both', label: 'Les deux' }
                            ].map(opt => {
                              const selected = paymentModeSelection === opt.value
                              return (
                                <label
                                  key={opt.value}
                                  className="flex-1 flex items-center justify-center gap-2 rounded-lg cursor-pointer transition-all text-sm"
                              style={{
                                border: selected ? '2px solid var(--accent)' : '1px solid var(--border-color)',
                                background: selected ? 'var(--accent-soft)' : 'var(--bg-card)',
                                color: selected ? 'var(--accent)' : 'var(--text-secondary)',
                                fontWeight: selected ? 600 : 400,
                                padding: selected ? '9px 11px' : '10px 12px',
                              }}
                              onMouseEnter={(e) => { if (!selected) e.currentTarget.style.borderColor = 'var(--text-muted)' }}
                              onMouseLeave={(e) => { if (!selected) e.currentTarget.style.borderColor = 'var(--border-color)' }}
                            >
                              <input
                                type="radio"
                                name="payment_mode_sel"
                                value={opt.value}
                                checked={selected}
                                onChange={(e) => setPaymentModeSelection(e.target.value)}
                                className="hidden"
                              />
                              {selected && <Check size={14} strokeWidth={2.5} />}
                              {opt.label}
                            </label>
                          )
                        })}
                      </div>
                    </div>

                        <div>
                          <label className="block text-sm font-medium mb-2">N° de compte</label>
                          <input
                            type="text"
                            maxLength={10}
                            value={formData.compte || ''}
                            onChange={(e) => setFormData({ ...formData, compte: e.target.value })}
                            placeholder="ex: 3400"
                            className="w-full px-4 py-2 rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                          />
                          <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                            Convention : un compte par type d&apos;événement
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Inscriptions publiques */}
                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                      <div className="flex items-center gap-3">
                        <Toggle checked={publicRegOpen} onChange={(checked) => {
                          setPublicRegOpen(checked)
                          if (checked && !publicRegSlug && formData.title) {
                            setPublicRegSlug(generateSlug(formData.title))
                          }
                        }} size="sm" />
                        <label className="text-sm font-semibold flex items-center gap-2">
                          <LinkIcon className="w-4 h-4" style={{ color: 'var(--primary-500)' }} />
                          Ouvrir les inscriptions publiques
                        </label>
                      </div>

                      {publicRegOpen && publicRegSlug && (
                        <div className="mt-3 pl-6">
                          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                            Lien d'inscription public
                          </label>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 px-3 py-2 rounded-lg text-sm truncate" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                              {`${window.location.origin}/evenement/${publicRegSlug}`}
                            </div>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}/evenement/${publicRegSlug}`)
                                setSlugCopied(true)
                                setTimeout(() => setSlugCopied(false), 1500)
                              }}
                              leftIcon={slugCopied ? <Check className="w-4 h-4" style={{ color: 'var(--success)' }} /> : <Copy className="w-4 h-4" />}
                            >
                              {slugCopied ? 'Copié' : 'Copier'}
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                showConfirm({
                                  title: 'Régénérer le lien',
                                  message: "L'ancien lien ne fonctionnera plus. Continuer ?",
                                  confirmLabel: 'Régénérer',
                                  cancelLabel: 'Annuler',
                                  confirmStyle: 'warning',
                                  onConfirm: () => {
                                    hideConfirm()
                                    setPublicRegSlug(generateSlug(formData.title || 'event'))
                                  }
                                })
                              }}
                              leftIcon={<RefreshCw className="w-4 h-4" />}
                            >
                              Régénérer
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Publish on site */}
              {websiteEnabled && (
              <div style={{ borderTop: '1px solid var(--border-color)', margin: '16px 0', paddingTop: '16px' }}>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.publish_on_site}
                    onChange={e => setFormData(prev => ({ ...prev, publish_on_site: e.target.checked }))}
                    className="w-4 h-4 mt-0.5"
                  />
                  <div>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      Publier sur le site du club
                    </span>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      L'événement apparaîtra aussi sur le site internet public du club.
                    </p>
                  </div>
                </label>
              </div>
              )}

              {/* Notification toggle — only visible on create */}
              {!editingEvent && (
                <div style={{ borderTop: '1px solid var(--border-color)', margin: '16px 0', paddingTop: '16px' }}>
                  <div className="flex items-center gap-3">
                    <Toggle checked={notifyMembers} onChange={setNotifyMembers} size="sm" />
                    <div>
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        Notifier les membres par email
                      </span>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        Envoie une annonce à tous les membres du club
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex pt-4 justify-end" style={{ gap: '12px' }}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={closeForm}
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                >
                  {editingEvent ? 'Enregistrer' : 'Créer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {events.length === 0 ? (
        <div className="rounded-xl p-12 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <Calendar className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
          <p style={{ color: 'var(--text-muted)' }}>Aucun événement</p>
        </div>
      ) : (
        <div className="std-table-wrap">
          <style>{`
            .events-sticky-head thead th { position: relative; }
            .events-sticky-head thead th::after {
              content: '';
              position: absolute;
              left: 0; right: 0; bottom: -8px;
              height: 8px;
              pointer-events: none;
              background: linear-gradient(to bottom, var(--shadow-sm), transparent);
            }
          `}</style>
          <div
            className="overflow-x-auto"
            style={{ maxHeight: 'calc(100vh - 240px)', overflowY: 'auto', overflowX: 'auto' }}
          >
            <table className="std-table events-sticky-head" style={{ borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium uppercase" style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>Titre</th>
                  <th className="text-left px-6 py-3 text-xs font-medium uppercase" style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>Type</th>
                  <th className="text-left px-6 py-3 text-xs font-medium uppercase" style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>Date</th>
                  <th className="text-left px-6 py-3 text-xs font-medium uppercase" style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>Lieu</th>
                  <th className="text-center px-6 py-3 text-xs font-medium uppercase" style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>Inscriptions</th>
                  <th className="text-center px-6 py-3 text-xs font-medium uppercase" style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>Bénévoles</th>
                  <th className="text-center px-6 py-3 text-xs font-medium uppercase" style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr
                    key={event.id}
                    onClick={() => navigate(`/admin/evenements/${event.id}`)}
                    className="cursor-pointer hover:bg-[var(--bg-hover)]"
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium">{event.title}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={getEventTypeBadgeVariant(event.type)}>
                          {event.type}
                        </Badge>
                        {websiteEnabled && (event as any).publish_on_site && (
                          <Badge variant="blue">Sur le site</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm">{formatEventDateShort(event.date)}</span>
                    </td>
                    <td className="px-6 py-4">
                      {event.location ? (
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="w-4 h-4" />
                          <span>{event.location}</span>
                        </div>
                      ) : (
                        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {(placeCounts[event.id] || 0) > 0 ? (
                        <span className="text-sm font-medium" style={{ color: 'var(--success)' }}>
                          {placeCounts[event.id]} inscrit{placeCounts[event.id] !== 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {(() => {
                        const stats = volunteerStats[event.id]
                        if (!stats || stats.required === 0) {
                          return <span style={{ color: 'var(--text-muted)' }}>-</span>
                        }
                        const { count, required } = stats
                        const color = count >= required ? 'var(--success)' : 'var(--danger)'
                        return (
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-sm font-medium" style={{ color }}>
                              {count} / {required}
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate(`/admin/benevoles?event_id=${event.id}`) }}
                              className="p-1.5 rounded-lg transition-colors"
                              title="Gérer les bénévoles"
                              style={{ color: 'var(--danger)' }}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--danger-soft)'}
                              onMouseLeave={(e) => e.currentTarget.style.background = ''}
                            >
                              <Heart className="w-4 h-4" />
                            </button>
                          </div>
                        )
                      })()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/admin/evenements/${event.id}`) }}
                          className="p-2 rounded-lg transition-colors"
                          title="Voir le détail"
                          style={{ color: 'var(--text-muted)' }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = ''}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {event.type === 'General Assembly' ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleStartMeeting(event) }}
                            className="p-2 rounded-lg transition-colors"
                            title="Démarrer la séance"
                            style={{ color: 'var(--info-text)' }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = ''}
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="w-8 h-8 shrink-0" aria-hidden="true" />
                        )}
                        {canEdit && (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); openEditForm(event) }}
                              className="p-2 rounded-lg transition-colors"
                              title="Modifier"
                              style={{ color: 'var(--text-muted)' }}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                              onMouseLeave={(e) => e.currentTarget.style.background = ''}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(event.id) }}
                              className="p-2 rounded-lg transition-colors"
                              title="Supprimer"
                              style={{ color: 'var(--danger)' }}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--danger-soft)'}
                              onMouseLeave={(e) => e.currentTarget.style.background = ''}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmModal
        {...confirmState}
        onCancel={hideConfirm}
      />
      <Toast toast={toast} />
    </div>
  )
}
