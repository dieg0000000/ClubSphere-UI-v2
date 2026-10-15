import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Calendar, MapPin, Users, Ticket, Heart, Bell, Copy, Check, ExternalLink, Download, Search, Mail, Plus, Minus, Trash2, RotateCcw, X, UserPlus, Star, MessageSquare, Info } from 'lucide-react'
import type ExcelJS from 'exceljs'
import { supabase } from '../lib/supabase'
import { invokeFunction } from '../lib/invokeFunction'
import { Tabs } from '../components/ui/Tabs'
import { Badge } from '../components/ui/Badge'
import Button from '../components/ui/Button'
import PhoneInput from '../components/PhoneInput'
import EventRemindersPanel from '../components/EventRemindersPanel'
import { findBestPriceOption } from '../utils/bestPriceOption'
import DataTableShell from '../components/DataTableShell'
import RegistrationSlideOver from '../components/RegistrationSlideOver'
import ConfirmModal from '../components/ConfirmModal'
import { Toast } from '../components/Toast'
import { useToast } from '../hooks/useToast'
import { useTenant } from '../context/TenantContext'
import {
  getEventTypeBadgeVariant,
  formatEventDate,
} from '../utils/eventHelpers'
import type { Event } from '../types'

interface EventDetail extends Event {
  public_registration_open?: boolean
  public_registration_slug?: string | null
}

interface PublicReg {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  company: string | null
  address: string | null
  postal_code: string | null
  city: string | null
  price_option_id: string | null
  option_label: string
  option_seats: number
  quantity: number
  total_amount: number
  payment_mode: string | null
  status: string
  participants: Array<{ first_name?: string; last_name?: string; email?: string }>
  source: string | null
  notes: string | null
  created_at: string
}

interface UnifiedRow {
  id: string
  name: string
  firstName: string
  lastName: string
  company: string
  email: string
  phone: string
  tarif: string
  places: number
  montant: number
  payment: string
  origin: 'member' | 'public' | 'manual'
  status: 'confirmed' | 'cancelled'
  date: string
  notes: string
  raw?: PublicReg
}

interface PriceOption {
  id: string
  label: string
  seats: number
  price: number
  active?: boolean
}

interface EventCommitteeMember {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  role: string | null
  status: 'invited' | 'active'
  is_lead: boolean
  created_at: string
}

export default function AdminEventDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { clubId } = useTenant()
  const { toast, showToast } = useToast()
  const [event, setEvent] = useState<EventDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('inscriptions')
  const [volunteerCount, setVolunteerCount] = useState(0)
  const [volunteerRequired, setVolunteerRequired] = useState(0)
  const [slugCopied, setSlugCopied] = useState(false)

  // Event committee state
  const [eventCommittee, setEventCommittee] = useState<EventCommitteeMember[]>([])
  const [ecLoading, setEcLoading] = useState(false)
  const [ecShowAddModal, setEcShowAddModal] = useState(false)
  const [ecAddForm, setEcAddForm] = useState({ email: '', first_name: '', last_name: '', phone: '', role: '' })
  const [ecAdding, setEcAdding] = useState(false)
  const [ecRemoveConfirm, setEcRemoveConfirm] = useState<EventCommitteeMember | null>(null)
  const [ecRemoving, setEcRemoving] = useState(false)
  const [ecInviteMode, setEcInviteMode] = useState<'club' | 'external'>('club')
  const [ecClubSearch, setEcClubSearch] = useState('')
  const [ecClubResults, setEcClubResults] = useState<{ profile_id: string; first_name: string; last_name: string; email: string; has_account?: boolean }[]>([])
  const [ecClubSearching, setEcClubSearching] = useState(false)
  const [ecSelectedPerson, setEcSelectedPerson] = useState<{ profile_id: string; first_name: string; last_name: string; email: string; has_account?: boolean } | null>(null)
  const [ecEditingRoleId, setEcEditingRoleId] = useState<string | null>(null)
  const [ecEditingRoleValue, setEcEditingRoleValue] = useState('')
  const [ecConversationId, setEcConversationId] = useState<string | null>(null)
  const [ecCreatingConvo, setEcCreatingConvo] = useState(false)

  const [publicRegs, setPublicRegs] = useState<PublicReg[]>([])
  const [priceOptions, setPriceOptions] = useState<PriceOption[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  const [slideOverReg, setSlideOverReg] = useState<PublicReg | null>(null)
  const [slideOverTab, setSlideOverTab] = useState<'details' | 'participants'>('details')

  // Manual registration modal
  const [showManualModal, setShowManualModal] = useState(false)
  const [manualForm, setManualForm] = useState({
    first_name: '', last_name: '', company: '', address: '', npa: '', city: '',
    phone: '', email: '', notes: '',
  })
  const [manualOptionId, setManualOptionId] = useState<string>('')
  const [manualQuantity, setManualQuantity] = useState(1)
  const [manualBestPriceNotice, setManualBestPriceNotice] = useState<string | null>(null)
  const suppressManualBestPriceRef = useRef(false)
  const [manualPaymentMode, setManualPaymentMode] = useState<string>('')
  const [manualParticipants, setManualParticipants] = useState<Array<{ first_name: string; last_name: string; email: string }>>([])
  const [manualErrors, setManualErrors] = useState<Record<string, boolean>>({})
  const [savingManual, setSavingManual] = useState(false)
  const [manualSendEmail, setManualSendEmail] = useState(false)
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null)

  useEffect(() => { document.title = 'Événements - ClubSphere' }, [])

  useEffect(() => {
    if (id) fetchAll()
  }, [id])

  async function fetchAll() {
    try {
      setLoading(true)

      const { data: evData } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .single()
      setEvent(evData)

      const { data: pubRegs, error: pubErr } = await supabase
        .from('event_public_registrations')
        .select('*')
        .eq('event_id', id!)
        .order('created_at', { ascending: false })
      if (pubErr) console.error('public regs error:', pubErr)
      setPublicRegs((pubRegs || []) as PublicReg[])

      const { data: priceOpts } = await supabase
        .from('event_price_options')
        .select('id, label, seats, price')
        .eq('event_id', id!)
        .eq('active', true)
        .order('display_order')
      setPriceOptions((priceOpts || []) as PriceOption[])

      const { count: volCount } = await supabase
        .from('event_volunteers')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', id!)
      setVolunteerCount(volCount || 0)

      const { data: posts } = await supabase
        .from('event_volunteer_posts')
        .select('required_count')
        .eq('event_id', id!)
      setVolunteerRequired(posts?.reduce((sum, p) => sum + (p.required_count || 0), 0) || 0)

      // Fetch event committee members
      await fetchEventCommittee()
      await fetchEcConversation()
    } catch (err) {
      console.error('Error fetching event:', err)
    } finally {
      setLoading(false)
    }
  }

  const unifiedRows = useMemo<UnifiedRow[]>(() => {
    const rows: UnifiedRow[] = []

    for (const r of publicRegs) {
      const origin: 'public' | 'manual' | 'member' = r.source === 'manual' ? 'manual' : r.source === 'member' ? 'member' : 'public'
      rows.push({
        id: r.id,
        name: `${r.first_name} ${r.last_name}`,
        firstName: r.first_name,
        lastName: r.last_name,
        company: r.company || '',
        email: r.email,
        phone: r.phone || '',
        tarif: r.option_label,
        places: r.option_seats * r.quantity,
        montant: Number(r.total_amount) || 0,
        payment: r.payment_mode || '',
        origin,
        status: r.status as 'confirmed' | 'cancelled',
        date: r.created_at,
        notes: r.notes || '',
        raw: r,
      })
    }

    rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return rows
  }, [publicRegs])

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return unifiedRows
    const q = searchQuery.toLowerCase()
    return unifiedRows.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.phone.includes(q) ||
      r.tarif.toLowerCase().includes(q)
    )
  }, [unifiedRows, searchQuery])

  const totalPlaces = useMemo(() => {
    return unifiedRows
      .filter(r => r.status === 'confirmed')
      .reduce((sum, r) => sum + r.places, 0)
  }, [unifiedRows])

  const totalCHF = useMemo(() => {
    return unifiedRows
      .filter(r => r.status === 'confirmed')
      .reduce((sum, r) => sum + r.montant, 0)
  }, [unifiedRows])

  function openSlideOver(reg: PublicReg, tab: 'details' | 'participants' = 'details') {
    setSlideOverReg(reg)
    setSlideOverTab(tab)
  }

  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ type: 'cancel' | 'reactivate'; row: UnifiedRow } | null>(null)

  async function executeCancelRow(row: UnifiedRow) {
    setCancellingId(row.id)
    try {
      const { error } = await supabase.from('event_public_registrations').update({ status: 'cancelled' }).eq('id', row.id)
      if (error) throw error
      fetchAll()
    } catch (err) {
      console.error('Error cancelling registration:', err)
    } finally {
      setCancellingId(null)
    }
  }

  async function executeReactivateRow(row: UnifiedRow) {
    setCancellingId(row.id)
    try {
      const { error } = await supabase.from('event_public_registrations').update({ status: 'confirmed' }).eq('id', row.id)
      if (error) throw error
      fetchAll()
    } catch (err) {
      console.error('Error reactivating registration:', err)
    } finally {
      setCancellingId(null)
    }
  }

  function handleConfirmAction() {
    if (!confirmAction) return
    if (confirmAction.type === 'cancel') {
      executeCancelRow(confirmAction.row)
    } else {
      executeReactivateRow(confirmAction.row)
    }
    setConfirmAction(null)
  }

  async function handleSendConfirmationEmail(registrationId: string) {
    setSendingEmailId(registrationId)
    try {
      const { error } = await invokeFunction('send-event-registration-confirmation', { body: { registration_id: registrationId } })
      if (error) throw new Error(error)
      showToast('Email de confirmation envoye', 'success')
    } catch {
      showToast("L'email n'a pas pu etre envoye", 'warning')
    } finally {
      setSendingEmailId(null)
    }
  }

  function openManualModal() {
    setManualForm({ first_name: '', last_name: '', company: '', address: '', npa: '', city: '', phone: '', email: '', notes: '' })
    setManualOptionId(priceOptions.length > 0 ? priceOptions[0].id : '')
    setManualQuantity(1)
    setManualPaymentMode('')
    setManualParticipants([])
    setManualErrors({})
    setManualSendEmail(false)
    setShowManualModal(true)
  }

  const selectedManualOption = useMemo(
    () => priceOptions.find(o => o.id === manualOptionId) ?? null,
    [priceOptions, manualOptionId]
  )

  const manualTotalSeats = selectedManualOption
    ? selectedManualOption.seats * manualQuantity
    : 0

  const manualTotalAmount = selectedManualOption
    ? selectedManualOption.price * manualQuantity
    : 0

  useEffect(() => {
    if (suppressManualBestPriceRef.current) {
      suppressManualBestPriceRef.current = false;
      return;
    }
    if (!priceOptions.length || !manualOptionId || manualQuantity <= 0) {
      setManualBestPriceNotice(null);
      return;
    }
    const result = findBestPriceOption(priceOptions, manualOptionId, manualQuantity);
    if (result && result.switched) {
      suppressManualBestPriceRef.current = true;
      setManualOptionId(result.optionId);
      setManualQuantity(result.quantity);
      setManualBestPriceNotice(
        `Tarif le plus avantageux appliqué automatiquement : ${result.label} × ${result.quantity} — ${result.total.toFixed(2)} CHF au lieu de ${result.originalTotal.toFixed(2)} CHF.`
      );
    } else {
      setManualBestPriceNotice(null);
    }
  }, [manualOptionId, manualQuantity, priceOptions]);

  useEffect(() => {
    if (!showManualModal) return
    const count = manualTotalSeats
    setManualParticipants(prev => {
      const rows = [...prev]
      while (rows.length < count) rows.push({ first_name: '', last_name: '', email: '' })
      if (rows.length > 0 && !rows[0].first_name && !rows[0].last_name) {
        rows[0] = { first_name: manualForm.first_name, last_name: manualForm.last_name, email: manualForm.email }
      }
      return rows.slice(0, count)
    })
  }, [manualTotalSeats, showManualModal])

  // ---- Event Committee CRUD ----
  const fetchEventCommittee = async () => {
    if (!id) return
    setEcLoading(true)
    const { data } = await supabase
      .from('event_committee_members')
      .select('id, email, first_name, last_name, phone, role, status, is_lead, created_at')
      .eq('event_id', id)
      .neq('status', 'removed')
      .order('created_at')
    setEventCommittee(data || [])
    setEcLoading(false)
  }

  const fetchEcConversation = async () => {
    if (!id) return
    const { data } = await supabase
      .from('conversations')
      .select('id')
      .eq('event_id', id)
      .eq('type', 'event_committee')
      .maybeSingle()
    setEcConversationId(data?.id ?? null)
  }

  const createEcConversation = async () => {
    if (!id) return
    setEcCreatingConvo(true)
    const { data, error } = await supabase.rpc('create_event_committee_conversation', { p_event_id: id })
    if (error) {
      showToast(error.message || 'Erreur lors de la création de la discussion', 'error')
    } else {
      setEcConversationId(data)
      showToast('Discussion du comité créée', 'success')
    }
    setEcCreatingConvo(false)
  }

  const inviteEventCommitteeMember = async () => {
    if (!(ecAddForm.email || '').trim() || !id) return
    setEcAdding(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-event-committee`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          event_id: id,
          email: (ecAddForm.email || '').trim().toLowerCase(),
          first_name: (ecAddForm.first_name || '').trim() || undefined,
          last_name: (ecAddForm.last_name || '').trim() || undefined,
          ...((ecAddForm.phone || '').trim() ? { phone: (ecAddForm.phone || '').trim() } : {}),
          ...((ecAddForm.role || '').trim() ? { role: (ecAddForm.role || '').trim() } : {}),
        }),
      })
      const result = await res.json()
      if (!res.ok || !result.success) {
        showToast(result.error || 'Erreur lors de l\'invitation', 'error')
      } else {
        if (result.already_has_account) {
          showToast('Ajouté au comité — la personne a été informée par email.', 'success')
        } else {
          showToast('Invitation envoyée — la personne recevra un email pour créer son compte.', 'success')
        }
        setEcShowAddModal(false)
        setEcAddForm({ email: '', first_name: '', last_name: '', phone: '', role: '' })
        setEcSelectedPerson(null)
        setEcClubSearch('')
        setEcClubResults([])
        setEcInviteMode('club')
        await fetchEventCommittee()
      }
    } catch (err) {
      showToast('Erreur réseau lors de l\'invitation', 'error')
    } finally {
      setEcAdding(false)
    }
  }

  const removeEventCommitteeMember = async () => {
    if (!ecRemoveConfirm) return
    setEcRemoving(true)
    const { error } = await supabase
      .from('event_committee_members')
      .update({ status: 'removed' })
      .eq('id', ecRemoveConfirm.id)
    setEcRemoving(false)
    if (error) {
      showToast('Erreur lors du retrait', 'error')
    } else {
      setEcRemoveConfirm(null)
      await fetchEventCommittee()
    }
  }
  // ---- End Event Committee ----

  // Debounced club-person search for committee
  const ecSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (ecClubSearch.trim().length < 2 || ecSelectedPerson) {
      setEcClubResults([])
      return
    }
    if (ecSearchTimer.current) clearTimeout(ecSearchTimer.current)
    ecSearchTimer.current = setTimeout(async () => {
      setEcClubSearching(true)
      const { data } = await supabase.rpc('search_club_people_for_committee', { p_event_id: id, p_query: ecClubSearch.trim() })
      setEcClubResults(data || [])
      setEcClubSearching(false)
    }, 300)
    return () => { if (ecSearchTimer.current) clearTimeout(ecSearchTimer.current) }
  }, [ecClubSearch, id, ecSelectedPerson])

  async function saveManualRegistration() {
    const errors: Record<string, boolean> = {}
    if (!manualForm.first_name.trim()) errors.first_name = true
    if (!manualForm.last_name.trim()) errors.last_name = true
    if (!selectedManualOption) errors.option = true
    if (manualForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manualForm.email)) errors.email = true
    setManualErrors(errors)
    if (Object.keys(errors).length > 0) return

    if (!clubId) return
    setSavingManual(true)
    try {
      const nonEmptyParticipants = manualParticipants.filter(p => p.first_name.trim() || p.last_name.trim())
      const payload = {
        club_id: clubId,
        event_id: id,
        first_name: manualForm.first_name.trim(),
        last_name: manualForm.last_name.trim(),
        email: manualForm.email.trim().toLowerCase() || null,
        phone: manualForm.phone || null,
        company: manualForm.company.trim() || null,
        address: manualForm.address.trim() || null,
        postal_code: manualForm.npa.trim() || null,
        city: manualForm.city.trim() || null,
        price_option_id: selectedManualOption!.id,
        option_label: selectedManualOption!.label,
        option_seats: selectedManualOption!.seats,
        quantity: manualQuantity,
        total_amount: manualTotalAmount,
        payment_mode: manualPaymentMode || null,
        participants: nonEmptyParticipants,
        notes: manualForm.notes.trim() || null,
        status: 'confirmed',
        source: 'manual',
      }
      const { data: inserted, error } = await supabase.from('event_public_registrations').insert(payload).select('id').single()
      if (error) throw error
      setShowManualModal(false)
      fetchAll()

      if (manualSendEmail && inserted) {
        try {
          await invokeFunction('send-event-registration-confirmation', { body: { registration_id: inserted.id } })
          showToast('Inscription enregistree, email envoye', 'success')
        } catch {
          showToast("Inscription enregistree, mais l'email n'a pas pu etre envoye", 'warning')
        }
      } else {
        showToast('Inscription enregistree', 'success')
      }
    } catch (err) {
      console.error('Error saving manual registration:', err)
    } finally {
      setSavingManual(false)
    }
  }

  async function handleExportExcel() {
    try {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Inscriptions')
    const headerRow = ws.addRow([
      'Nom', 'Prénom', 'Entreprise', 'Email', 'Téléphone', 'Tarif',
      'Places', 'Montant CHF', 'Paiement', 'Origine', 'Statut', 'Date', 'Notes',
    ])
    headerRow.font = { bold: true }

    for (const r of unifiedRows) {
      const originLabel = r.origin === 'member' ? 'Membre' : r.origin === 'manual' ? 'Manuel' : 'Public'
      ws.addRow([
        r.lastName,
        r.firstName,
        r.company,
        r.email,
        r.phone,
        r.tarif,
        r.places,
        r.montant.toFixed(2),
        r.payment,
        originLabel,
        r.status === 'confirmed' ? 'Confirme' : 'Annule',
        new Date(r.date).toLocaleDateString('fr-CH'),
        r.notes,
      ])

      if (r.raw && r.places > 1) {
        const totalSubRows = r.places - 1
        const participants = Array.isArray(r.raw.participants) ? r.raw.participants : []
        const filtered = participants.filter(p => {
          if (!p.first_name && !p.last_name) return false
          const sameNameAsReservant =
            (p.first_name || '').toLowerCase() === r.firstName.toLowerCase() &&
            (p.last_name || '').toLowerCase() === r.lastName.toLowerCase()
          const sameEmailAsReservant = r.email && p.email && p.email.toLowerCase() === r.email.toLowerCase()
          return !sameNameAsReservant && !sameEmailAsReservant
        })
        for (let i = 0; i < totalSubRows; i++) {
          const p = filtered[i]
          if (p) {
            ws.addRow([
              `   ↳ ${p.last_name || ''}`,
              p.first_name || '',
              '',
              p.email || '',
              '', '', '', '', '', '', '', '', '',
            ])
          } else {
            ws.addRow([
              '   ↳ (a completer)',
              '', '', '', '', '', '', '', '', '', '', '', '',
            ])
          }
        }
      }
    }

    ws.columns.forEach(col => {
      let maxLen = 10
      col.eachCell?.({ includeEmpty: false }, cell => {
        const len = String(cell.value ?? '').length
        if (len > maxLen) maxLen = len
      })
      col.width = Math.min(maxLen + 4, 40)
    })

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const slug = (event?.title || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    const dateStr = new Date().toISOString().slice(0, 10)
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `inscriptions_${slug}_${dateStr}.xlsx`
    link.click()
    } catch (e) { console.error('Export failed', e); showToast("L'export n'a pas pu être généré. Rechargez la page et réessayez.", 'error'); }
  }

  if (loading) {
    return <div className="p-8" style={{ color: 'var(--text-primary)' }}>Chargement...</div>
  }

  if (!event) {
    return <div className="p-8" style={{ color: 'var(--text-primary)' }}>Événement introuvable</div>
  }

  const publicUrl = event.public_registration_slug
    ? `${window.location.origin}/evenement/${event.public_registration_slug}`
    : null

  const attendancePercent = event.max_attendees
    ? Math.min(100, Math.round((totalPlaces / event.max_attendees) * 100))
    : null

  return (
    <div className="space-y-6">
      <Button
        variant="secondary"
        onClick={() => navigate('/admin/events')}
        leftIcon={<ArrowLeft size={18} />}
      >
        Retour
      </Button>

      {/* Header card */}
      <div className="rounded-xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {event.title}
              </h1>
              <Badge variant={getEventTypeBadgeVariant(event.type)}>
                {event.type}
              </Badge>
            </div>

            <div className="flex items-center gap-5 flex-wrap text-sm" style={{ color: 'var(--text-secondary)' }}>
              <span className="flex items-center gap-1.5">
                <Calendar size={15} className="opacity-70" />
                {formatEventDate(event.date)}
              </span>
              {event.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin size={15} className="opacity-70" />
                  {event.location}
                </span>
              )}
              {priceOptions.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <Ticket size={15} className="opacity-70" />
                  <span className="flex flex-col">
                    {priceOptions.map(o => (
                      <span key={o.id}>{o.label} — {o.price} CHF</span>
                    ))}
                    {event.compte && <span style={{ color: 'var(--text-muted)' }}>Compte {event.compte}</span>}
                  </span>
                </span>
              )}
            </div>

            {/* Attendance gauge */}
            {event.max_attendees && (
              <div className="mt-4 max-w-xs">
                <div className="flex items-center justify-between text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                  <span className="flex items-center gap-1">
                    <Users size={13} />
                    {totalPlaces} / {event.max_attendees} places
                  </span>
                  <span>{attendancePercent}%</span>
                </div>
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ background: 'var(--bg-hover)' }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${attendancePercent}%`,
                      background: (attendancePercent || 0) >= 90 ? 'var(--danger)' : 'var(--accent)',
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 items-end shrink-0">
            <Button
              onClick={() => navigate('/admin/events')}
              leftIcon={<Ticket size={16} />}
              variant="secondary"
            >
              Modifier
            </Button>
            {publicUrl && (
              <div className="flex items-center gap-2">
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs flex items-center gap-1 hover:underline"
                  style={{ color: 'var(--accent)' }}
                >
                  <ExternalLink size={13} />
                  Lien public
                </a>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(publicUrl)
                    setSlugCopied(true)
                    setTimeout(() => setSlugCopied(false), 1500)
                  }}
                  className="p-1 rounded hover:opacity-80"
                  title="Copier le lien"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {slugCopied ? <Check size={14} style={{ color: 'var(--success)' }} /> : <Copy size={14} />}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <div className="px-5 pt-4">
          <Tabs
            items={[
              { key: 'inscriptions', label: 'Inscriptions', icon: <Ticket size={15} />, count: totalPlaces },
              { key: 'benevoles', label: 'Benevoles', icon: <Heart size={15} />, count: volunteerCount },
              { key: 'rappels', label: 'Rappels', icon: <Bell size={15} /> },
              { key: 'comite_org', label: "Comité d'org.", icon: <Users size={15} /> },
            ]}
            value={activeTab}
            onChange={setActiveTab}
          />
        </div>

        <div className="p-5">
          {activeTab === 'inscriptions' && (
            <div className="space-y-4">
              {/* Header totals + search + export */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {totalPlaces} place{totalPlaces !== 1 ? 's' : ''}
                  </span>
                  {totalCHF > 0 && (
                    <span className="text-sm font-semibold" style={{ color: 'var(--success)' }}>
                      CHF {totalCHF.toFixed(2)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50" style={{ color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      placeholder="Rechercher..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 pr-3 py-1.5 text-xs rounded-lg"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', width: '180px' }}
                    />
                  </div>
                  <Button variant="primary" size="sm" onClick={openManualModal} leftIcon={<Plus size={14} />}>
                    Ajouter une inscription
                  </Button>
                  <Button variant="secondary" size="sm" onClick={handleExportExcel} leftIcon={<Download size={14} />}>
                    Exporter Excel
                  </Button>
                </div>
              </div>

              {/* Table */}
              {filteredRows.length === 0 ? (
                <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
                  Aucune inscription
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <DataTableShell bare maxHeight="400px">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <th className="text-left px-4 py-2.5 text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Nom</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Email</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Tel</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Tarif</th>
                        <th className="text-center px-4 py-2.5 text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Places</th>
                        <th className="text-right px-4 py-2.5 text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Montant</th>
                        <th className="text-center px-4 py-2.5 text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Origine</th>
                        <th className="text-center px-4 py-2.5 text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Statut</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Date</th>
                        <th className="px-4 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map(row => (
                        <tr
                          key={row.id}
                          className="hover:bg-[var(--bg-hover)]"
                          style={{
                            borderBottom: '1px solid var(--border-color)',
                            opacity: row.status === 'cancelled' ? 0.6 : 1,
                            cursor: row.raw ? 'pointer' : undefined,
                          }}
                          onClick={() => { if (row.raw) openSlideOver(row.raw) }}
                        >
                          <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text-primary)' }}>{row.name}</td>
                          <td className="px-4 py-2.5" style={{ color: 'var(--text-secondary)' }}>{row.email}</td>
                          <td className="px-4 py-2.5" style={{ color: 'var(--text-secondary)' }}>{row.phone || '-'}</td>
                          <td className="px-4 py-2.5" style={{ color: 'var(--text-secondary)' }}>{row.tarif}</td>
                          <td className="px-4 py-2.5 text-center" style={{ color: 'var(--text-secondary)' }}>{row.places}</td>
                          <td className="px-4 py-2.5 text-right" style={{ color: 'var(--text-secondary)' }}>
                            {row.montant > 0 ? `CHF ${row.montant.toFixed(2)}` : (
                              <Badge variant="green">Gratuit</Badge>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <Badge variant={row.origin === 'member' ? 'blue' : row.origin === 'manual' ? 'orange' : 'violet'}>
                              {row.origin === 'member' ? 'Membre' : row.origin === 'manual' ? 'Manuel' : 'Public'}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <Badge variant={row.status === 'confirmed' ? 'green' : 'red'}>
                              {row.status === 'confirmed' ? 'Confirme' : 'Annule'}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>
                            {new Date(row.date).toLocaleDateString('fr-CH')}
                          </td>
                          <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-0">
                              {/* Slot 1: Mail */}
                              <span className="w-8 h-8 flex items-center justify-center">
                                {row.status === 'confirmed' && row.email && (
                                  <button
                                    onClick={() => handleSendConfirmationEmail(row.id)}
                                    disabled={sendingEmailId === row.id}
                                    className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
                                    title="Renvoyer la confirmation"
                                    style={{ color: 'var(--text-muted)' }}
                                  >
                                    <Mail size={16} className={sendingEmailId === row.id ? 'animate-pulse' : ''} />
                                  </button>
                                )}
                              </span>
                              {/* Slot 2: Participants */}
                              <span className="w-8 h-8 flex items-center justify-center">
                                {(row.origin === 'public' || row.origin === 'manual') && row.raw && (
                                  <button
                                    onClick={() => openSlideOver(row.raw!, 'participants')}
                                    className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-hover)]"
                                    title="Participants"
                                    style={{ color: 'var(--text-muted)' }}
                                  >
                                    <Users size={16} />
                                  </button>
                                )}
                              </span>
                              {/* Slot 3: Cancel / Restore */}
                              <span className="w-8 h-8 flex items-center justify-center">
                                {row.status === 'confirmed' ? (
                                  <button
                                    onClick={() => setConfirmAction({ type: 'cancel', row })}
                                    disabled={cancellingId === row.id}
                                    className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
                                    title="Annuler l'inscription"
                                    style={{ color: 'var(--danger)' }}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setConfirmAction({ type: 'reactivate', row })}
                                    disabled={cancellingId === row.id}
                                    className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
                                    title="Reactiver l'inscription"
                                    style={{ color: 'var(--success)' }}
                                  >
                                    <RotateCcw size={16} />
                                  </button>
                                )}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </DataTableShell>
                </div>
              )}
            </div>
          )}

          {activeTab === 'benevoles' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {volunteerRequired > 0 ? (
                    <span>
                      <strong style={{ color: volunteerCount >= volunteerRequired ? 'var(--success)' : 'var(--danger)' }}>
                        {volunteerCount}
                      </strong>
                      {' '}/ {volunteerRequired} benevoles inscrits
                    </span>
                  ) : (
                    <span>Aucun poste benevole configure</span>
                  )}
                </div>
                <Button
                  variant="secondary"
                  onClick={() => navigate(`/admin/benevoles?event_id=${id}`)}
                  leftIcon={<Heart size={16} />}
                >
                  Gerer les postes
                </Button>
              </div>

              {volunteerRequired === 0 && (
                <div className="rounded-lg p-8 text-center" style={{ background: 'var(--bg-hover)' }}>
                  <Heart size={32} className="mx-auto mb-3 opacity-40" style={{ color: 'var(--text-muted)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Configurez les postes benevoles pour cet evenement.
                  </p>
                  <Button
                    variant="primary"
                    className="mt-4"
                    onClick={() => navigate(`/admin/benevoles?event_id=${id}`)}
                  >
                    Configurer les postes
                  </Button>
                </div>
              )}

              {volunteerRequired > 0 && (
                <div className="mt-4">
                  <div className="flex items-center gap-2 mb-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span>{volunteerCount} / {volunteerRequired}</span>
                  </div>
                  <div
                    className="h-2.5 rounded-full overflow-hidden"
                    style={{ background: 'var(--bg-hover)' }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(100, Math.round((volunteerCount / volunteerRequired) * 100))}%`,
                        background: volunteerCount >= volunteerRequired ? 'var(--success)' : 'var(--warning)',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'rappels' && (
            <EventRemindersPanel eventId={id!} onUpdated={fetchAll} />
          )}

          {activeTab === 'comite_org' && (
            <div style={{ padding: '24px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h3 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: 600, margin: '0 0 6px' }}>Comité d'organisation</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.5, margin: 0 }}>
                    Les membres du comité d'organisation peuvent gérer les inscriptions, les bénévoles et les factures de cet événement. Leurs accès expirent 30 jours après l'événement.
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={ecConversationId ? () => navigate(`/messages?conversation=${ecConversationId}`) : createEcConversation}
                  disabled={ecCreatingConvo}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: 500,
                    background: 'var(--accent)', color: 'var(--text-inverse)', border: 'none', cursor: ecCreatingConvo ? 'default' : 'pointer',
                    whiteSpace: 'nowrap', opacity: ecCreatingConvo ? 0.6 : 1,
                  }}
                >
                  <MessageSquare size={15} /> {ecConversationId ? 'Ouvrir la discussion du comité' : 'Créer la discussion du comité'}
                </button>
                <button
                  onClick={() => { setEcAddForm({ email: '', first_name: '', last_name: '', phone: '', role: '' }); setEcSelectedPerson(null); setEcClubSearch(''); setEcClubResults([]); setEcInviteMode('club'); setEcShowAddModal(true); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: 500,
                    background: 'var(--accent)', color: 'var(--text-inverse)', border: 'none', cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <UserPlus size={15} /> Ajouter un membre
                </button>
              </div>
              </div>

              {ecLoading ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Chargement...</p>
              ) : eventCommittee.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Aucun membre dans le comité d'organisation.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <DataTableShell bare maxHeight="400px">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '12px', textTransform: 'uppercase' }}>Nom</th>
                        <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '12px', textTransform: 'uppercase' }}>Email</th>
                        <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '12px', textTransform: 'uppercase' }}>Téléphone</th>
                        <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '12px', textTransform: 'uppercase' }}>Rôle</th>
                        <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '12px', textTransform: 'uppercase' }}>Statut</th>
                        <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '12px', textTransform: 'uppercase' }}>Ajouté le</th>
                        <th style={{ padding: '10px 12px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {eventCommittee.map(member => (
                        <tr key={member.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '12px', color: 'var(--text-primary)' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                              {(member.first_name || member.last_name)
                                ? `${member.first_name || ''} ${member.last_name || ''}`.trim()
                                : member.email}
                              {member.is_lead && (
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                                  padding: '2px 8px', borderRadius: '9999px', fontSize: '11px', fontWeight: 600,
                                  background: 'var(--warning-soft)', color: 'var(--warning-text)',
                                }}>
                                  <Star size={12} /> Responsable
                                </span>
                              )}
                            </span>
                          </td>
                          <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{member.email}</td>
                          <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{member.phone || '—'}</td>
                          <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                            {ecEditingRoleId === member.id ? (
                              <input
                                autoFocus
                                value={ecEditingRoleValue}
                                onChange={(e) => setEcEditingRoleValue(e.target.value)}
                                onBlur={async () => { await supabase.from('event_committee_members').update({ role: ecEditingRoleValue.trim() || null }).eq('id', member.id); setEcEditingRoleId(null); fetchEventCommittee() }}
                                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEcEditingRoleId(null) }}
                                style={{ padding: '4px 8px', fontSize: '13px', width: '120px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                              />
                            ) : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                {member.role || '—'}
                                <button onClick={() => { setEcEditingRoleId(member.id); setEcEditingRoleValue(member.role || '') }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-muted)' }}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                                </button>
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '12px' }}>
                            <span style={{
                              display: 'inline-block', padding: '2px 10px', borderRadius: '9999px',
                              fontSize: '12px', fontWeight: 600,
                              background: member.status === 'active' ? 'var(--success-soft)' : 'var(--warning-soft)',
                              color: member.status === 'active' ? 'var(--success-text)' : 'var(--warning-text)',
                            }}>
                              {member.status === 'active' ? 'Actif' : 'Invité'}
                            </span>
                          </td>
                          <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
                            {new Date(member.created_at).toLocaleDateString('fr-CH')}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {member.status === 'active' && !member.is_lead && (
                              <button
                                onClick={async () => {
                                  await supabase.rpc('set_event_committee_lead', { p_member_id: member.id })
                                  fetchEventCommittee()
                                }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, marginRight: '12px' }}
                              >
                                Désigner responsable
                              </button>
                            )}
                            <button
                              onClick={() => setEcRemoveConfirm(member)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '13px', fontWeight: 500 }}
                            >
                              Retirer
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </DataTableShell>
                </div>
              )}
            </div>
          )}

          {/* Add committee member modal */}
          {ecShowAddModal && (
            <div style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
            }} onClick={() => setEcShowAddModal(false)}>
              <div style={{
                background: 'var(--bg-card)', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '420px',
                border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-lg)',
              }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: 600, margin: 0 }}>
                    Ajouter un membre au comité
                  </h3>
                  <button onClick={() => setEcShowAddModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                    <X size={18} color="var(--text-muted)" />
                  </button>
                </div>

                {/* Mode toggle */}
                <div style={{ marginBottom: '14px' }}>
                  <button
                    onClick={() => { setEcInviteMode(ecInviteMode === 'club' ? 'external' : 'club'); setEcSelectedPerson(null); setEcClubSearch(''); setEcClubResults([]); setEcAddForm(f => ({ ...f, email: '', first_name: '', last_name: '', phone: '', role: '' })) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--accent)', fontWeight: 500, padding: 0 }}
                  >
                    {ecInviteMode === 'club' ? 'Inviter une personne externe (sans compte)' : '← Personne du club'}
                  </button>
                </div>

                {ecInviteMode === 'club' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {ecSelectedPerson ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--bg-hover)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '14px' }}>{ecSelectedPerson.first_name} {ecSelectedPerson.last_name}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{ecSelectedPerson.email}</div>
                        </div>
                        <button onClick={() => { setEcSelectedPerson(null); setEcAddForm(f => ({ ...f, email: '', first_name: '', last_name: '' })); setEcClubSearch('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                          <X size={16} color="var(--text-muted)" />
                        </button>
                      </div>
                    ) : (
                      <div style={{ position: 'relative' }}>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>Rechercher par nom ou email…</label>
                        <input
                          value={ecClubSearch}
                          onChange={(e) => setEcClubSearch(e.target.value)}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '14px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                          placeholder="Minimum 2 caractères..."
                          autoFocus
                        />
                        {ecClubSearching && <div style={{ position: 'absolute', right: '12px', top: '32px', color: 'var(--text-muted)', fontSize: '12px' }}>…</div>}
                        {ecClubResults.length > 0 && (
                          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', marginTop: '4px', boxShadow: 'var(--shadow)', maxHeight: '200px', overflowY: 'auto' }}>
                            {ecClubResults.map(p => (
                              <button
                                key={p.profile_id}
                                onClick={() => { setEcSelectedPerson(p); setEcAddForm(f => ({ ...f, email: p.email, first_name: p.first_name || '', last_name: p.last_name || '' })); setEcClubResults([]) }}
                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)' }}
                              >
                                <span style={{ fontWeight: 500 }}>{p.first_name} {p.last_name}</span>
                                <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>{p.email}</span>
                                {p.has_account === false && <span style={{ color: 'var(--text-muted)', marginLeft: '8px', fontSize: '11px', fontStyle: 'italic' }}>sans compte — recevra une invitation</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>Rôle</label>
                      <input
                        type="text"
                        value={ecAddForm.role}
                        onChange={(e) => setEcAddForm(f => ({ ...f, role: e.target.value }))}
                        placeholder="Ex. Caisse, Cuisine, Tombola…"
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '14px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
                        Email <span style={{ color: 'var(--danger)' }}>*</span>
                      </label>
                      <input
                        type="email"
                        value={ecAddForm.email}
                        onChange={(e) => setEcAddForm(f => ({ ...f, email: e.target.value }))}
                        placeholder="nom@example.ch"
                        autoFocus
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '14px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
                          Prénom
                        </label>
                        <input
                          type="text"
                          value={ecAddForm.first_name}
                          onChange={(e) => setEcAddForm(f => ({ ...f, first_name: e.target.value }))}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '14px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
                          Nom
                        </label>
                        <input
                          type="text"
                          value={ecAddForm.last_name}
                          onChange={(e) => setEcAddForm(f => ({ ...f, last_name: e.target.value }))}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '14px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
                        Téléphone
                      </label>
                      <input
                        type="tel"
                        value={ecAddForm.phone}
                        onChange={(e) => setEcAddForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder="+41 79 123 45 67"
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '14px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
                        Rôle
                      </label>
                      <input
                        type="text"
                        value={ecAddForm.role}
                        onChange={(e) => setEcAddForm(f => ({ ...f, role: e.target.value }))}
                        placeholder="Ex. Caisse, Cuisine, Tombola…"
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '14px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
                  <button
                    onClick={() => setEcShowAddModal(false)}
                    style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '14px', background: 'var(--bg-hover)', border: '1px solid var(--border-color)', cursor: 'pointer', color: 'var(--text-primary)' }}
                  >
                    Annuler
                  </button>
                  <button
                    onClick={inviteEventCommitteeMember}
                    disabled={!ecAddForm.email.trim() || ecAdding}
                    style={{
                      padding: '8px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: 500,
                      background: !ecAddForm.email.trim() || ecAdding ? 'var(--border-color)' : 'var(--accent)',
                      color: 'var(--text-inverse)', border: 'none', cursor: !ecAddForm.email.trim() || ecAdding ? 'default' : 'pointer',
                    }}
                  >
                    {ecAdding ? 'Envoi...' : 'Ajouter'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Remove committee member confirm */}
          <ConfirmModal
            isOpen={!!ecRemoveConfirm}
            title="Retirer ce membre ?"
            message={<>Retirer <strong>{ecRemoveConfirm ? `${ecRemoveConfirm.first_name || ''} ${ecRemoveConfirm.last_name || ecRemoveConfirm.email}`.trim() : ''}</strong> du comité d'organisation de cet événement ?</>}
            confirmLabel="Retirer"
            cancelLabel="Annuler"
            confirmStyle="danger"
            loading={ecRemoving}
            onConfirm={removeEventCommitteeMember}
            onCancel={() => setEcRemoveConfirm(null)}
          />
        </div>
      </div>

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={!!confirmAction}
        title={confirmAction?.type === 'cancel' ? "Annuler l'inscription" : "Reactiver l'inscription"}
        message={
          confirmAction?.type === 'cancel'
            ? `Annuler l'inscription de ${confirmAction.row.name} ? Elle restera visible avec le statut Annule.`
            : `Reactiver l'inscription de ${confirmAction?.row.name} ?`
        }
        confirmLabel={confirmAction?.type === 'cancel' ? "Annuler l'inscription" : 'Reactiver'}
        cancelLabel="Retour"
        confirmStyle={confirmAction?.type === 'cancel' ? 'danger' : 'primary'}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Registration Slide-Over */}
      {slideOverReg && (
        <RegistrationSlideOver
          registration={slideOverReg}
          priceOptions={priceOptions}
          paymentModes={event?.payment_modes || []}
          initialTab={slideOverTab}
          onClose={() => setSlideOverReg(null)}
          onSaved={fetchAll}
        />
      )}

      {/* Manual Registration Modal */}
      {showManualModal && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 z-50"
          style={{ background: 'rgba(0,0,0,0.5)' }}
        >
          <div
            className="rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
          >
            <div className="px-6 py-4 rounded-t-xl" style={{ background: 'var(--bg-modal-header)' }}>
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-modal-header)' }}>
                Ajouter une inscription manuelle
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-modal-header)', opacity: 0.7 }}>
                Inscription par telephone ou en personne
              </p>
            </div>

            <div className="p-6 space-y-6">
              {/* Coordonnees */}
              <div>
                <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Coordonnees</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <input
                      type="text"
                      placeholder="Prénom *"
                      value={manualForm.first_name}
                      onChange={(e) => { setManualForm(f => ({ ...f, first_name: e.target.value })); setManualErrors(e2 => ({ ...e2, first_name: false })) }}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{ background: 'var(--bg-input)', border: manualErrors.first_name ? '1px solid var(--danger)' : '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                    {manualErrors.first_name && <span className="text-xs" style={{ color: 'var(--danger)' }}>Champ requis</span>}
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Nom *"
                      value={manualForm.last_name}
                      onChange={(e) => { setManualForm(f => ({ ...f, last_name: e.target.value })); setManualErrors(e2 => ({ ...e2, last_name: false })) }}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{ background: 'var(--bg-input)', border: manualErrors.last_name ? '1px solid var(--danger)' : '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                    {manualErrors.last_name && <span className="text-xs" style={{ color: 'var(--danger)' }}>Champ requis</span>}
                  </div>
                  <input
                    type="text"
                    placeholder="Entreprise"
                    value={manualForm.company}
                    onChange={(e) => setManualForm(f => ({ ...f, company: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  />
                  <input
                    type="text"
                    placeholder="Adresse"
                    value={manualForm.address}
                    onChange={(e) => setManualForm(f => ({ ...f, address: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  />
                  <input
                    type="text"
                    placeholder="NPA"
                    value={manualForm.npa}
                    onChange={(e) => setManualForm(f => ({ ...f, npa: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  />
                  <input
                    type="text"
                    placeholder="Ville"
                    value={manualForm.city}
                    onChange={(e) => setManualForm(f => ({ ...f, city: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  />
                  <PhoneInput
                    value={manualForm.phone}
                    onChange={(val) => setManualForm(f => ({ ...f, phone: val }))}
                    placeholder="Téléphone"
                  />
                  <div>
                    <input
                      type="email"
                      placeholder="E-mail (optionnel)"
                      value={manualForm.email}
                      onChange={(e) => { setManualForm(f => ({ ...f, email: e.target.value })); setManualErrors(e2 => ({ ...e2, email: false })) }}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{ background: 'var(--bg-input)', border: manualErrors.email ? '1px solid var(--danger)' : '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                    {manualErrors.email && <span className="text-xs" style={{ color: 'var(--danger)' }}>Format invalide</span>}
                  </div>
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={manualSendEmail}
                      onChange={(e) => setManualSendEmail(e.target.checked)}
                      disabled={!manualForm.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manualForm.email)}
                      className="rounded"
                    />
                    <span className="text-xs" style={{ color: (!manualForm.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manualForm.email)) ? 'var(--text-muted)' : 'var(--text-secondary)' }}>
                      Envoyer la confirmation par email
                    </span>
                  </label>
                </div>
              </div>

              {/* Reservation */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Reservation</h4>
                {priceOptions.length === 0 ? (
                  <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>Aucune option de prix configuree pour cet evenement.</p>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <select
                        value={manualOptionId}
                        onChange={(e) => { setManualOptionId(e.target.value); if (!suppressManualBestPriceRef.current) setManualQuantity(1); setManualErrors(e2 => ({ ...e2, option: false })) }}
                        className="w-full px-3 py-2 rounded-lg text-sm"
                        style={{ background: 'var(--bg-input)', border: manualErrors.option ? '1px solid var(--danger)' : '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      >
                        <option value="">-- Choisir une option --</option>
                        {priceOptions.map(opt => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label} — CHF {opt.price.toFixed(2)}{opt.seats > 1 ? ` (forfait ${opt.seats} places)` : ' / personne'}
                          </option>
                        ))}
                      </select>
                      {manualErrors.option && <span className="text-xs" style={{ color: 'var(--danger)' }}>Champ requis</span>}
                    </div>

                    {selectedManualOption && (selectedManualOption.seats === 1 || manualQuantity > 1) && (
                      <div className="flex items-center gap-3">
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Quantite:</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setManualQuantity(Math.max(1, manualQuantity - 1))}
                            className="w-8 h-8 flex items-center justify-center rounded-lg"
                            style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                          >
                            <Minus size={14} />
                          </button>
                          <span className="w-8 text-center text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            {manualQuantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => setManualQuantity(Math.min(30, manualQuantity + 1))}
                            className="w-8 h-8 flex items-center justify-center rounded-lg"
                            style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                    )}

                    {selectedManualOption && (
                      <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <span>{manualTotalSeats} place{manualTotalSeats > 1 ? 's' : ''}</span>
                        <span className="font-semibold" style={{ color: 'var(--success)' }}>
                          CHF {manualTotalAmount.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {manualBestPriceNotice && (
                <div className="flex items-start gap-2 rounded-lg p-3" style={{ background: 'var(--info-soft)', border: '1px solid var(--info)' }}>
                  <Info size={16} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--info-text)' }} />
                  <p className="text-sm" style={{ color: 'var(--info-text)' }}>{manualBestPriceNotice}</p>
                </div>
              )}

              {/* Participants */}
              {manualTotalSeats > 0 && (
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                  <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                    Participants ({manualTotalSeats})
                  </h4>
                  <div className="space-y-2">
                    {manualParticipants.map((p, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-xs font-medium w-6 shrink-0 text-center" style={{ color: 'var(--text-muted)' }}>
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          placeholder="Prénom"
                          value={p.first_name}
                          onChange={(e) => {
                            const upd = [...manualParticipants]
                            upd[idx] = { ...upd[idx], first_name: e.target.value }
                            setManualParticipants(upd)
                          }}
                          className="flex-1 px-3 py-2 rounded-lg text-sm"
                          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        />
                        <input
                          type="text"
                          placeholder="Nom"
                          value={p.last_name}
                          onChange={(e) => {
                            const upd = [...manualParticipants]
                            upd[idx] = { ...upd[idx], last_name: e.target.value }
                            setManualParticipants(upd)
                          }}
                          className="flex-1 px-3 py-2 rounded-lg text-sm"
                          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        />
                        <input
                          type="email"
                          placeholder="Email (opt.)"
                          value={p.email}
                          onChange={(e) => {
                            const upd = [...manualParticipants]
                            upd[idx] = { ...upd[idx], email: e.target.value }
                            setManualParticipants(upd)
                          }}
                          className="flex-1 px-3 py-2 rounded-lg text-sm"
                          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payment mode */}
              {event && event.payment_modes && event.payment_modes.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                  <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Mode de paiement</h4>
                  <div className="flex gap-3 flex-wrap">
                    {event.payment_modes.map(mode => (
                      <label
                        key={mode}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors"
                        style={{
                          background: manualPaymentMode === mode ? 'var(--accent-soft)' : 'var(--bg-input)',
                          border: manualPaymentMode === mode ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <input
                          type="radio"
                          name="manual_payment_mode"
                          value={mode}
                          checked={manualPaymentMode === mode}
                          onChange={(e) => setManualPaymentMode(e.target.value)}
                          className="hidden"
                        />
                        {mode === 'invoice' ? 'Facture' : mode === 'cash_card' ? 'Sur place' : mode}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Notes</h4>
                <textarea
                  rows={3}
                  placeholder="Ex: A appele le 09.07, paiera sur place"
                  value={manualForm.notes}
                  onChange={(e) => setManualForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
                <Button variant="secondary" onClick={() => setShowManualModal(false)}>
                  Annuler
                </Button>
                <Button loading={savingManual} onClick={saveManualRegistration}>
                  Enregistrer
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </div>
  )
}
