import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toLocalDatetimeValue } from '../utils/formatHelpers'
import { ArrowLeft, Calendar, MapPin, Ticket, Heart, FileText, Settings, Send, Download, Printer, Loader as Loader2, Users, Star, UserPlus, X, MessageSquare } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../hooks/useToast'
import { Tabs } from '../components/ui/Tabs'
import { StatusPill } from '../components/ui/StatusPill'
import { Toast } from '../components/Toast'
import ConfirmModal from '../components/ConfirmModal'

// ── Types ──

interface OrgEvent {
  id: string
  title: string
  description: string | null
  date: string | null
  location: string | null
  max_attendees: number | null
  type: string | null
  public_registration_open: boolean
  public_registration_slug: string | null
}

interface Registration {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  company: string | null
  option_label: string | null
  quantity: number
  total_amount: number
  payment_mode: string | null
  status: string
  created_at: string
}

interface VolunteerPost {
  id: string
  name: string
  description: string | null
  start_time: string | null
  end_time: string | null
  required_count: number
  volunteers: Volunteer[]
}

interface Volunteer {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  status: string
  assigned_post_id: string | null
}

interface EventInvoice {
  id: string
  invoice_number: string
  issue_date: string
  due_date: string
  total_amount: number
  status: string
  qr_reference: string
  base_amount: number
  fratrie_discount_pct: number
  fratrie_discount_amount: number
  reminder_fee: number
  currency: string
  notes: string | null
  invoice_type: string | null
  sent_at: string | null
  registration: {
    first_name: string
    last_name: string
    email: string | null
    phone: string | null
    address: string | null
    postal_code: string | null
    city: string | null
    company: string | null
    option_label: string | null
    quantity: number | null
    event: { title: string; date: string | null } | null
  } | null
  season: { name: string } | null
}

// ── Component ──

export default function OrganisationEventDetail() {
  const { eventId } = useParams<{ eventId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { toast, showToast } = useToast()

  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [event, setEvent] = useState<OrgEvent | null>(null)
  const [activeTab, setActiveTab] = useState('inscriptions')

  // Inscriptions
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [regLoading, setRegLoading] = useState(true)

  // Bénévoles
  const [posts, setPosts] = useState<VolunteerPost[]>([])
  const [volunteers, setVolunteers] = useState<Volunteer[]>([])
  const [volLoading, setVolLoading] = useState(true)
  const [editingPost, setEditingPost] = useState<VolunteerPost | null>(null)
  const [showPostModal, setShowPostModal] = useState(false)
  const [postForm, setPostForm] = useState({ name: '', description: '', start_time: '', end_time: '', required_count: 1 })
  const [confirmVolunteer, setConfirmVolunteer] = useState<Volunteer | null>(null)

  // Factures
  const [invoices, setInvoices] = useState<EventInvoice[]>([])
  const [invLoading, setInvLoading] = useState(true)
  const [sendingInvoice, setSendingInvoice] = useState<string | null>(null)
  const [downloadingInvoice, setDownloadingInvoice] = useState<string | null>(null)
  const [batchPrinting, setBatchPrinting] = useState(false)

  // Événement edit
  const [eventForm, setEventForm] = useState<Partial<OrgEvent>>({})
  const [saving, setSaving] = useState(false)

  // Committee tab (visible to all members, editable by lead only)
  const [leadMember, setLeadMember] = useState<{ first_name: string | null; last_name: string | null; profile_id: string | null } | null>(null)
  const [isCurrentUserLead, setIsCurrentUserLead] = useState(false)

  interface CommitteeMember {
    id: string
    email: string
    first_name: string | null
    last_name: string | null
    phone: string | null
    role: string | null
    status: string
    is_lead: boolean
    created_at: string
  }
  const [committeeMembers, setCommitteeMembers] = useState<CommitteeMember[]>([])
  const [ecLoading, setEcLoading] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteForm, setInviteForm] = useState({ email: '', first_name: '', last_name: '', phone: '', role: '' })
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [editingRoleValue, setEditingRoleValue] = useState('')
  const [inviteMode, setInviteMode] = useState<'club' | 'external'>('club')
  const [clubSearch, setClubSearch] = useState('')
  const [clubResults, setClubResults] = useState<{ profile_id: string; first_name: string; last_name: string; email: string; has_account?: boolean }[]>([])
  const [clubSearching, setClubSearching] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState<{ profile_id: string; first_name: string; last_name: string; email: string; has_account?: boolean } | null>(null)
  const [inviting, setInviting] = useState(false)
  const [ecRemoveConfirm, setEcRemoveConfirm] = useState<CommitteeMember | null>(null)
  const [ecConversationId, setEcConversationId] = useState<string | null>(null)
  const [ecCreatingConvo, setEcCreatingConvo] = useState(false)

  // ── Access check ──
  useEffect(() => {
    if (!user?.id || !eventId) return
    const check = async () => {
      const today = new Date().toISOString().slice(0, 10)
      const { data } = await supabase
        .from('event_committee_members')
        .select('id, events!inner(date)')
        .eq('profile_id', user.id)
        .eq('event_id', eventId)
        .eq('status', 'active')
        .limit(1)
      const ok = !!(data && data.some((row: any) => {
        const d = row.events?.date?.slice(0, 10)
        if (!d) return true
        const expiry = new Date(d)
        expiry.setDate(expiry.getDate() + 30)
        return expiry.toISOString().slice(0, 10) >= today
      }))
      setAuthorized(ok)
    }
    check()
  }, [user?.id, eventId])

  // ── Load event ──
  const loadEvent = useCallback(async () => {
    if (!eventId) return
    const { data } = await supabase
      .from('events')
      .select('id, title, description, date, location, max_attendees, type, public_registration_open, public_registration_slug')
      .eq('id', eventId)
      .maybeSingle()
    if (data) {
      setEvent(data)
      setEventForm(data)
    }
  }, [eventId])

  useEffect(() => {
    if (authorized) loadEvent()
  }, [authorized, loadEvent])

  // ── Committee lead info ──
  const loadCommitteeLead = useCallback(async () => {
    if (!eventId) return
    const { data } = await supabase
      .from('event_committee_members')
      .select('first_name, last_name, profile_id')
      .eq('event_id', eventId)
      .eq('is_lead', true)
      .eq('status', 'active')
      .maybeSingle()
    setLeadMember(data || null)
    setIsCurrentUserLead(!!(data && user?.id && data.profile_id === user.id))
  }, [eventId, user?.id])

  const fetchCommitteeMembers = useCallback(async () => {
    if (!eventId) return
    setEcLoading(true)
    const { data } = await supabase
      .from('event_committee_members')
      .select('id, email, first_name, last_name, phone, role, status, is_lead, created_at')
      .eq('event_id', eventId)
      .neq('status', 'removed')
      .order('created_at')
    setCommitteeMembers(data || [])
    setEcLoading(false)
  }, [eventId])

  const fetchEcConversation = useCallback(async () => {
    if (!eventId) return
    const { data } = await supabase
      .from('conversations')
      .select('id')
      .eq('event_id', eventId)
      .eq('type', 'event_committee')
      .maybeSingle()
    setEcConversationId(data?.id ?? null)
  }, [eventId])

  const createEcConversation = async () => {
    if (!eventId) return
    setEcCreatingConvo(true)
    const { data, error } = await supabase.rpc('create_event_committee_conversation', { p_event_id: eventId })
    if (error) {
      showToast(error.message || 'Erreur lors de la création de la discussion', 'error')
    } else {
      setEcConversationId(data)
      showToast('Discussion du comité créée', 'success')
    }
    setEcCreatingConvo(false)
  }

  useEffect(() => {
    if (authorized) {
      loadCommitteeLead()
      fetchCommitteeMembers()
      fetchEcConversation()
    }
  }, [authorized, loadCommitteeLead, fetchCommitteeMembers, fetchEcConversation])

  // Debounced club-person search
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (clubSearch.trim().length < 2 || selectedPerson) {
      setClubResults([])
      return
    }
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      setClubSearching(true)
      const { data } = await supabase.rpc('search_club_people_for_committee', { p_event_id: eventId, p_query: clubSearch.trim() })
      setClubResults(data || [])
      setClubSearching(false)
    }, 300)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [clubSearch, eventId, selectedPerson])

  const inviteCommitteeMember = async () => {
    if (!(inviteForm.email || '').trim() || !eventId) return
    setInviting(true)
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-event-committee`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          event_id: eventId,
          email: (inviteForm.email || '').trim(),
          first_name: (inviteForm.first_name || '').trim(),
          last_name: (inviteForm.last_name || '').trim(),
          ...((inviteForm.phone || '').trim() ? { phone: (inviteForm.phone || '').trim() } : {}),
          ...((inviteForm.role || '').trim() ? { role: (inviteForm.role || '').trim() } : {}),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      showToast('Invitation envoyée avec succès', 'success')
      setShowInviteModal(false)
      setInviteForm({ email: '', first_name: '', last_name: '', phone: '', role: '' })
      setSelectedPerson(null)
      setClubSearch('')
      setClubResults([])
      setInviteMode('club')
      fetchCommitteeMembers()
    } catch (err: any) {
      showToast(err.message || "Erreur lors de l'invitation", 'error')
    } finally {
      setInviting(false)
    }
  }

  const removeCommitteeMember = async (memberId: string) => {
    await supabase
      .from('event_committee_members')
      .update({ status: 'removed' })
      .eq('id', memberId)
    fetchCommitteeMembers()
    loadCommitteeLead()
    showToast('Membre retiré du comité', 'success')
  }

  // ── Inscriptions ──
  const loadRegistrations = useCallback(async () => {
    if (!eventId) return
    setRegLoading(true)
    const { data } = await supabase
      .from('event_public_registrations')
      .select('id, first_name, last_name, email, phone, company, option_label, quantity, total_amount, payment_mode, status, created_at')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
    setRegistrations(data || [])
    setRegLoading(false)
  }, [eventId])

  // ── Bénévoles ──
  const loadVolunteers = useCallback(async () => {
    if (!eventId) return
    setVolLoading(true)
    const { data: postsData } = await supabase
      .from('event_volunteer_posts')
      .select('id, name, description, start_time, end_time, required_count')
      .eq('event_id', eventId)
      .order('start_time')
    const { data: volsData } = await supabase
      .from('event_volunteers')
      .select('id, first_name, last_name, email, phone, status, assigned_post_id')
      .eq('event_id', eventId)
      .order('last_name')
    const vols = volsData || []
    setPosts((postsData || []).map(p => ({ ...p, volunteers: vols.filter(v => v.assigned_post_id === p.id) })))
    setVolunteers(vols)
    setVolLoading(false)
  }, [eventId])

  // ── Factures ──
  const loadInvoices = useCallback(async () => {
    if (!eventId) return
    setInvLoading(true)
    // First get registration IDs for this event
    const { data: regs } = await supabase
      .from('event_public_registrations')
      .select('id')
      .eq('event_id', eventId)
    const regIds = (regs || []).map(r => r.id)
    if (regIds.length === 0) {
      setInvoices([])
      setInvLoading(false)
      return
    }
    const { data } = await supabase
      .from('invoices')
      .select(`
        id, invoice_number, issue_date, due_date, total_amount, status, qr_reference,
        base_amount, fratrie_discount_pct, fratrie_discount_amount, reminder_fee, currency,
        notes, invoice_type, sent_at,
        registration:event_public_registrations!event_registration_id(
          first_name, last_name, email, phone, address, postal_code, city,
          company, option_label, quantity,
          event:events(title, date)
        ),
        season:seasons(name)
      `)
      .eq('invoice_type', 'evenement')
      .in('event_registration_id', regIds)
    const normalized = (data || []).map((inv: any) => ({
      ...inv,
      season: Array.isArray(inv.season) ? inv.season[0] || null : inv.season,
      registration: Array.isArray(inv.registration) ? inv.registration[0] || null : inv.registration,
    }))
    setInvoices(normalized)
    setInvLoading(false)
  }, [eventId])

  // Load data when tab changes
  useEffect(() => {
    if (!authorized) return
    if (activeTab === 'inscriptions') loadRegistrations()
    if (activeTab === 'benevoles') loadVolunteers()
    if (activeTab === 'factures') loadInvoices()
  }, [activeTab, authorized, loadRegistrations, loadVolunteers, loadInvoices])

  // ── Volunteer post CRUD ──
  const openPostModal = (post?: VolunteerPost) => {
    if (post) {
      setEditingPost(post)
      setPostForm({
        name: post.name,
        description: post.description || '',
        start_time: post.start_time || '',
        end_time: post.end_time || '',
        required_count: post.required_count,
      })
    } else {
      setEditingPost(null)
      setPostForm({ name: '', description: '', start_time: '', end_time: '', required_count: 1 })
    }
    setShowPostModal(true)
  }

  const savePost = async () => {
    if (!postForm.name.trim() || !eventId) return
    const payload = {
      event_id: eventId,
      name: postForm.name.trim(),
      description: postForm.description.trim() || null,
      start_time: postForm.start_time || null,
      end_time: postForm.end_time || null,
      required_count: postForm.required_count,
    }
    if (editingPost) {
      await supabase.from('event_volunteer_posts').update(payload).eq('id', editingPost.id)
    } else {
      await supabase.from('event_volunteer_posts').insert([payload])
    }
    setShowPostModal(false)
    loadVolunteers()
  }

  const deletePost = async (postId: string) => {
    await supabase.from('event_volunteer_posts').delete().eq('id', postId)
    loadVolunteers()
  }

  const updateVolunteerStatus = async (volId: string, status: string) => {
    await supabase.from('event_volunteers').update({ status }).eq('id', volId)
    setConfirmVolunteer(null)
    loadVolunteers()
    showToast(status === 'confirmed' ? 'Bénévole confirmé' : 'Statut mis à jour', 'success')
  }

  const assignVolunteer = async (volId: string, postId: string | null) => {
    await supabase.from('event_volunteers').update({ assigned_post_id: postId }).eq('id', volId)
    loadVolunteers()
  }

  // ── Invoice PDF download ──
  const downloadInvoice = async (invoiceId: string) => {
    setDownloadingInvoice(invoiceId)
    try {
      const { downloadInvoiceById } = await import('../utils/invoiceDownload')
      await downloadInvoiceById(invoiceId)
    } catch (err: any) {
      showToast(err?.message || 'Erreur lors du téléchargement', 'error')
    } finally {
      setDownloadingInvoice(null)
    }
  }

  // ── Invoice send ──
  const sendInvoice = async (invoice: EventInvoice) => {
    setSendingInvoice(invoice.id)
    try {
      const { data: club } = await supabase.from('club_settings').select('*').maybeSingle()
      const { data: finance } = await supabase.from('finance_config').select('*').maybeSingle()
      const { generateInvoicePDF } = await import('../utils/generateInvoicePDF')

      const reg = invoice.registration
      const pdfBase64 = await generateInvoicePDF(buildEventInvoicePDFParams(invoice, club, finance), true) as string

      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invoice`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invoice_id: invoice.id,
          pdf_base64: pdfBase64,
          filename: `Facture_${invoice.invoice_number}.pdf`,
        }),
      })

      if (!resp.ok) throw new Error('Erreur serveur')
      showToast('Facture envoyée par email', 'success')
      loadInvoices()
    } catch (err: any) {
      showToast(err?.message || 'Erreur lors de l\'envoi', 'error')
    } finally {
      setSendingInvoice(null)
    }
  }

  // ── Batch print ──
  const batchPrint = async () => {
    if (invoices.length === 0) return
    setBatchPrinting(true)
    try {
      const { PDFDocument } = await import('pdf-lib')
      const { generateInvoicePDF } = await import('../utils/generateInvoicePDF')
      const { data: club } = await supabase.from('club_settings').select('*').maybeSingle()
      const { data: finance } = await supabase.from('finance_config').select('*').maybeSingle()

      const mergedPdf = await PDFDocument.create()

      for (const invoice of invoices) {
        const base64 = await generateInvoicePDF(buildEventInvoicePDFParams(invoice, club, finance), true) as string

        const pdfBytes = Uint8Array.from(atob(base64), (c: string) => c.charCodeAt(0))
        const srcDoc = await PDFDocument.load(pdfBytes)
        const pages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices())
        for (const page of pages) mergedPdf.addPage(page)
      }

      const mergedBytes = await mergedPdf.save()
      const blob = new Blob([new Uint8Array(mergedBytes)], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Factures_${event?.title || 'evenement'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      showToast(err?.message || 'Erreur lors de l\'impression', 'error')
    } finally {
      setBatchPrinting(false)
    }
  }

  // ── Event save ──
  const saveEvent = async () => {
    if (!eventId || !eventForm.title?.trim()) return
    setSaving(true)
    const { error } = await supabase
      .from('events')
      .update({
        title: eventForm.title?.trim(),
        description: eventForm.description?.trim() || null,
        date: eventForm.date ? new Date(eventForm.date).toISOString() : null,
        location: eventForm.location?.trim() || null,
        max_attendees: eventForm.max_attendees || null,
      })
      .eq('id', eventId)
    setSaving(false)
    if (error) {
      showToast('Erreur lors de la sauvegarde', 'error')
    } else {
      showToast('Événement mis à jour', 'success')
      loadEvent()
    }
  }

  // ── Helpers ──
  const formatDate = (iso: string | null) => {
    if (!iso) return '-'
    return new Date(iso).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const formatCHF = (n: number) => `CHF ${n.toFixed(2)}`

  const statusLabel = (s: string) => {
    switch (s) {
      case 'draft': return 'Brouillon'
      case 'sent': return 'Envoyée'
      case 'paid': return 'Payée'
      case 'cancelled': return 'Annulée'
      default: return s
    }
  }
  const statusVariant = (s: string): 'green' | 'blue' | 'orange' | 'red' => {
    switch (s) {
      case 'paid': return 'green'
      case 'sent': return 'blue'
      case 'draft': return 'orange'
      case 'cancelled': return 'red'
      default: return 'blue'
    }
  }

  // ── Guard ──
  if (authorized === null) {
    return <div style={{ padding: '48px', textAlign: 'center' }}><p style={{ color: 'var(--text-muted)' }}>Chargement...</p></div>
  }
  if (!authorized) {
    return (
      <div style={{ maxWidth: '600px', margin: '80px auto', textAlign: 'center', padding: '48px 24px', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
          Vous ne faites pas (ou plus) partie du comité d'organisation de cet événement.
        </p>
        <button
          onClick={() => navigate('/organisation')}
          style={{ marginTop: '16px', padding: '8px 20px', borderRadius: '8px', background: 'var(--accent)', color: 'var(--text-inverse)', border: 'none', cursor: 'pointer', fontSize: '14px' }}
        >
          Retour
        </button>
      </div>
    )
  }

  // ── Render ──
  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <Toast toast={toast} />

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <button
          onClick={() => navigate('/organisation')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '12px', padding: 0 }}
        >
          <ArrowLeft size={16} /> Retour
        </button>
        <h1 style={{ color: 'var(--text-primary)', fontSize: '28px', fontWeight: 700, margin: '0 0 6px' }}>
          {event?.title || 'Événement'}
        </h1>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          {event?.date && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '13px' }}>
              <Calendar size={14} /> {formatDate(event.date)}
            </span>
          )}
          {event?.location && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '13px' }}>
              <MapPin size={14} /> {event.location}
            </span>
          )}
          {leadMember && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '13px' }}>
              <Star size={14} style={{ color: 'var(--warning-text)' }} /> Responsable : {leadMember.first_name} {leadMember.last_name}
            </span>
          )}
        </div>
      </div>

      {/* Tabs — outside the card, like Facturation */}
      <Tabs
        items={[
          { key: 'inscriptions', label: 'Inscriptions', icon: <Ticket size={15} />, count: registrations.length },
          { key: 'benevoles', label: 'Bénévoles', icon: <Heart size={15} /> },
          { key: 'factures', label: 'Factures', icon: <FileText size={15} />, count: invoices.length },
          { key: 'evenement', label: 'Événement', icon: <Settings size={15} /> },
          { key: 'comite', label: 'Comité', icon: <Users size={15} />, count: committeeMembers.filter(m => m.status === 'active').length },
        ]}
        value={activeTab}
        onChange={setActiveTab}
        className="mb-6"
      />

      {/* ─── Inscriptions ─── */}
      {activeTab === 'inscriptions' && (
        regLoading ? (
          <div className="std-table-wrap" style={{ padding: '48px 0', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Chargement...</p>
          </div>
        ) : registrations.length === 0 ? (
          <div className="std-table-wrap" style={{ padding: '48px 0', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Aucune inscription pour le moment.</p>
          </div>
        ) : (
          <div className="std-table-wrap">
            <div className="overflow-x-auto">
              <table className="std-table" style={{ minWidth: '700px' }}>
                <thead>
                  <tr>
                    {['Nom / Entreprise', 'Option', 'Qté', 'Statut', 'Paiement', 'Date'].map(h => (
                      <th key={h} style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {registrations.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 500 }}>
                        {r.company || `${r.first_name} ${r.last_name}`}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{r.option_label || '-'}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{r.quantity}</td>
                      <td>
                        <StatusPill variant={r.status === 'confirmed' ? 'green' : r.status === 'cancelled' ? 'red' : 'orange'}>
                          {r.status === 'confirmed' ? 'Confirmé' : r.status === 'cancelled' ? 'Annulé' : r.status}
                        </StatusPill>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{r.payment_mode || '-'}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{formatDate(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* ─── Bénévoles ─── */}
      {activeTab === 'benevoles' && (
        volLoading ? (
          <div className="std-table-wrap" style={{ padding: '48px 0', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Chargement...</p>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
                {volunteers.length} bénévole{volunteers.length !== 1 ? 's' : ''} inscrit{volunteers.length !== 1 ? 's' : ''} / {posts.reduce((s, p) => s + p.required_count, 0)} requis
              </p>
              <button onClick={() => openPostModal()} style={btnPrimary}>
                + Ajouter un poste
              </button>
            </div>

            {posts.length === 0 ? (
              <div className="std-table-wrap" style={{ padding: '48px 0', textAlign: 'center' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Aucun poste configuré.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {posts.map(post => (
                  <div key={post.id} className="std-table-wrap">
                    <div style={{ padding: '14px 20px', background: 'var(--table-header-bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', borderBottom: '1px solid var(--border-color)' }}>
                      <div>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px' }}>{post.name}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '13px', marginLeft: '8px' }}>
                          ({post.volunteers.length}/{post.required_count})
                        </span>
                        {post.start_time && (
                          <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginLeft: '12px' }}>
                            {post.start_time.slice(0, 5)}{post.end_time ? ` – ${post.end_time.slice(0, 5)}` : ''}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => openPostModal(post)} style={btnSmall}>Modifier</button>
                        <button onClick={() => deletePost(post.id)} style={{ ...btnSmall, color: 'var(--danger)' }}>Supprimer</button>
                      </div>
                    </div>
                    {post.volunteers.length > 0 && (
                      <div style={{ padding: '0 20px 12px' }}>
                        {post.volunteers.map(v => (
                          <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                            <div>
                              <span style={{ color: 'var(--text-primary)', fontSize: '14px' }}>{v.first_name} {v.last_name}</span>
                              <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginLeft: '8px' }}>{v.email}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <StatusPill variant={v.status === 'confirmed' ? 'green' : 'orange'}>
                                {v.status === 'confirmed' ? 'Confirmé' : v.status === 'pending' ? 'En attente' : v.status}
                              </StatusPill>
                              {v.status !== 'confirmed' && (
                                <button onClick={() => setConfirmVolunteer(v)} style={btnSmall}>Confirmer</button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {/* Unassigned volunteers */}
                {volunteers.filter(v => !v.assigned_post_id).length > 0 && (
                  <div className="std-table-wrap">
                    <div style={{ padding: '14px 20px', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px' }}>Non assignés</span>
                    </div>
                    <div style={{ padding: '0 20px 12px' }}>
                      {volunteers.filter(v => !v.assigned_post_id).map(v => (
                        <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '8px' }}>
                          <div>
                            <span style={{ color: 'var(--text-primary)', fontSize: '14px' }}>{v.first_name} {v.last_name}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginLeft: '8px' }}>{v.email}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <select
                              value=""
                              onChange={(e) => { if (e.target.value) assignVolunteer(v.id, e.target.value) }}
                              style={{ fontSize: '13px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                            >
                              <option value="">Assigner à...</option>
                              {posts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            {v.status !== 'confirmed' && (
                              <button onClick={() => setConfirmVolunteer(v)} style={btnSmall}>Confirmer</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      )}

      {/* ─── Factures ─── */}
      {activeTab === 'factures' && (
        invLoading ? (
          <div className="std-table-wrap" style={{ padding: '48px 0', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Chargement...</p>
          </div>
        ) : (
          <div>
            {invoices.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                <button onClick={batchPrint} disabled={batchPrinting} style={{ ...btnPrimary, opacity: batchPrinting ? 0.5 : 1 }}>
                  {batchPrinting ? <><Loader2 size={14} className="animate-spin" /> Impression...</> : <><Printer size={14} /> Tout imprimer</>}
                </button>
              </div>
            )}
            {invoices.length === 0 ? (
              <div className="std-table-wrap" style={{ padding: '48px 0', textAlign: 'center' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Aucune facture pour cet événement.</p>
              </div>
            ) : (
              <div className="std-table-wrap">
                <div className="overflow-x-auto">
                  <table className="std-table" style={{ minWidth: '700px' }}>
                    <thead>
                      <tr>
                        {['Numéro', 'Inscrit', 'Montant', 'Échéance', 'Statut', ''].map(h => (
                          <th key={h} style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map(inv => (
                        <tr key={inv.id}>
                          <td style={{ fontWeight: 500 }}>{inv.invoice_number}</td>
                          <td>
                            {inv.registration?.company || `${inv.registration?.first_name || ''} ${inv.registration?.last_name || ''}`.trim() || '-'}
                          </td>
                          <td>{formatCHF(inv.total_amount)}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{formatDate(inv.due_date)}</td>
                          <td>
                            <StatusPill variant={statusVariant(inv.status)}>{statusLabel(inv.status)}</StatusPill>
                          </td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button
                              onClick={() => downloadInvoice(inv.id)}
                              disabled={downloadingInvoice === inv.id}
                              title="Télécharger PDF"
                              style={{ ...btnIcon, marginRight: '6px' }}
                            >
                              {downloadingInvoice === inv.id ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                            </button>
                            <button
                              onClick={() => sendInvoice(inv)}
                              disabled={sendingInvoice === inv.id}
                              title="Envoyer par email"
                              style={btnIcon}
                            >
                              {sendingInvoice === inv.id ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* ─── Événement ─── */}
      {activeTab === 'evenement' && (
        <div className="std-table-wrap" style={{ padding: '28px 32px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={labelStyle}>Titre *</label>
              <input
                type="text"
                value={eventForm.title || ''}
                onChange={(e) => setEventForm(f => ({ ...f, title: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Description</label>
              <textarea
                value={eventForm.description || ''}
                onChange={(e) => {
                  setEventForm(f => ({ ...f, description: e.target.value }))
                  const el = e.target
                  el.style.height = 'auto'
                  el.style.height = Math.max(280, el.scrollHeight) + 'px'
                }}
                style={{ ...inputStyle, minHeight: '280px', resize: 'vertical', lineHeight: '1.6' }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Date</label>
                <input
                  type="datetime-local"
                  value={eventForm.date ? toLocalDatetimeValue(eventForm.date) : ''}
                  onChange={(e) => setEventForm(f => ({ ...f, date: e.target.value }))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Lieu</label>
                <input
                  type="text"
                  value={eventForm.location || ''}
                  onChange={(e) => setEventForm(f => ({ ...f, location: e.target.value }))}
                  style={inputStyle}
                />
              </div>
            </div>
            <div style={{ maxWidth: '200px' }}>
              <label style={labelStyle}>Capacité max.</label>
              <input
                type="number"
                value={eventForm.max_attendees || ''}
                onChange={(e) => setEventForm(f => ({ ...f, max_attendees: e.target.value ? parseInt(e.target.value) : null }))}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px' }}>
              <button
                onClick={saveEvent}
                disabled={saving || !eventForm.title?.trim()}
                style={{
                  ...btnPrimary,
                  padding: '10px 24px',
                  fontSize: '14px',
                  fontWeight: 600,
                  opacity: saving || !eventForm.title?.trim() ? 0.5 : 1,
                  cursor: saving || !eventForm.title?.trim() ? 'default' : 'pointer',
                }}
              >
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Comité (lead-only) ─── */}
      {activeTab === 'comite' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
              {committeeMembers.filter(m => m.status === 'active').length} membre{committeeMembers.filter(m => m.status === 'active').length !== 1 ? 's' : ''} actif{committeeMembers.filter(m => m.status === 'active').length !== 1 ? 's' : ''}
            </p>
            {isCurrentUserLead && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={ecConversationId ? () => navigate(`/messages?conversation=${ecConversationId}`) : createEcConversation}
                  disabled={ecCreatingConvo}
                  style={{
                    ...btnPrimary,
                    opacity: ecCreatingConvo ? 0.6 : 1,
                    cursor: ecCreatingConvo ? 'default' : 'pointer',
                  }}
                >
                  <MessageSquare size={14} /> {ecConversationId ? 'Ouvrir la discussion du comité' : 'Créer la discussion du comité'}
                </button>
                <button onClick={() => { setShowInviteModal(true); setInviteForm({ email: '', first_name: '', last_name: '', phone: '', role: '' }); setSelectedPerson(null); setClubSearch(''); setClubResults([]); setInviteMode('club') }} style={btnPrimary}>
                  <UserPlus size={14} /> Ajouter un membre
                </button>
              </div>
            )}
          </div>

          {ecLoading ? (
            <div className="std-table-wrap" style={{ padding: '48px 0', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Chargement...</p>
            </div>
          ) : committeeMembers.length === 0 ? (
            <div className="std-table-wrap" style={{ padding: '48px 0', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Aucun membre dans le comité.</p>
            </div>
          ) : (
            <div className="std-table-wrap">
              <div className="overflow-x-auto">
                <table className="std-table" style={{ minWidth: '600px' }}>
                  <thead>
                    <tr>
                      {['Nom', 'Email', 'Téléphone', 'Rôle', 'Statut', 'Ajouté le', ''].map(h => (
                        <th key={h} style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {committeeMembers.map(member => (
                      <tr key={member.id}>
                        <td style={{ fontWeight: 500 }}>
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
                        <td style={{ color: 'var(--text-secondary)' }}>{member.email}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{member.phone || '—'}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>
                          {isCurrentUserLead && editingRoleId === member.id ? (
                            <input
                              autoFocus
                              value={editingRoleValue}
                              onChange={(e) => setEditingRoleValue(e.target.value)}
                              onBlur={async () => { await supabase.from('event_committee_members').update({ role: editingRoleValue.trim() || null }).eq('id', member.id); setEditingRoleId(null); fetchCommitteeMembers() }}
                              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingRoleId(null) }}
                              style={{ ...inputStyle, padding: '4px 8px', fontSize: '13px', width: '120px' }}
                            />
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              {member.role || '—'}
                              {isCurrentUserLead && (
                                <button onClick={() => { setEditingRoleId(member.id); setEditingRoleValue(member.role || '') }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-muted)' }}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                                </button>
                              )}
                            </span>
                          )}
                        </td>
                        <td>
                          <StatusPill variant={member.status === 'active' ? 'green' : member.status === 'invited' ? 'orange' : 'red'}>
                            {member.status === 'active' ? 'Actif' : member.status === 'invited' ? 'Invité' : member.status}
                          </StatusPill>
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                          {new Date(member.created_at).toLocaleDateString('fr-CH')}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {isCurrentUserLead && !member.is_lead && (
                            <button
                              onClick={() => setEcRemoveConfirm(member)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '13px', fontWeight: 500 }}
                            >
                              Retirer
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Invite committee member modal */}
      {showInviteModal && (
        <div style={overlay} onClick={() => setShowInviteModal(false)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: 600, margin: '0 0 16px' }}>
              Ajouter un membre au comité
            </h3>

            {/* Mode toggle */}
            <div style={{ marginBottom: '14px' }}>
              <button
                onClick={() => { setInviteMode(inviteMode === 'club' ? 'external' : 'club'); setSelectedPerson(null); setClubSearch(''); setClubResults([]); setInviteForm(f => ({ ...f, email: '', first_name: '', last_name: '', phone: '', role: '' })) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--accent)', fontWeight: 500, padding: 0 }}
              >
                {inviteMode === 'club' ? 'Inviter une personne externe (sans compte)' : '← Personne du club'}
              </button>
            </div>

            {inviteMode === 'club' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {selectedPerson ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--bg-hover)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '14px' }}>{selectedPerson.first_name} {selectedPerson.last_name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{selectedPerson.email}</div>
                    </div>
                    <button onClick={() => { setSelectedPerson(null); setInviteForm(f => ({ ...f, email: '', first_name: '', last_name: '' })); setClubSearch('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                      <X size={16} color="var(--text-muted)" />
                    </button>
                  </div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <label style={labelStyle}>Rechercher par nom ou email…</label>
                    <input
                      value={clubSearch}
                      onChange={(e) => setClubSearch(e.target.value)}
                      style={inputStyle}
                      placeholder="Minimum 2 caractères..."
                      autoFocus
                    />
                    {clubSearching && <div style={{ position: 'absolute', right: '12px', top: '32px', color: 'var(--text-muted)', fontSize: '12px' }}>…</div>}
                    {clubResults.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', marginTop: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: '200px', overflowY: 'auto' }}>
                        {clubResults.map(p => (
                          <button
                            key={p.profile_id}
                            onClick={() => { setSelectedPerson(p); setInviteForm(f => ({ ...f, email: p.email, first_name: p.first_name || '', last_name: p.last_name || '' })); setClubResults([]) }}
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
                  <label style={labelStyle}>Rôle</label>
                  <input value={inviteForm.role} onChange={(e) => setInviteForm(f => ({ ...f, role: e.target.value }))} style={inputStyle} placeholder="Ex. Caisse, Cuisine, Tombola…" />
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Email *</label>
                  <input type="email" value={inviteForm.email} onChange={(e) => setInviteForm(f => ({ ...f, email: e.target.value }))} style={inputStyle} placeholder="email@exemple.com" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Prénom</label>
                    <input value={inviteForm.first_name} onChange={(e) => setInviteForm(f => ({ ...f, first_name: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Nom</label>
                    <input value={inviteForm.last_name} onChange={(e) => setInviteForm(f => ({ ...f, last_name: e.target.value }))} style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Téléphone</label>
                  <input type="tel" value={inviteForm.phone} onChange={(e) => setInviteForm(f => ({ ...f, phone: e.target.value }))} style={inputStyle} placeholder="+41 79 123 45 67" />
                </div>
                <div>
                  <label style={labelStyle}>Rôle</label>
                  <input value={inviteForm.role} onChange={(e) => setInviteForm(f => ({ ...f, role: e.target.value }))} style={inputStyle} placeholder="Ex. Caisse, Cuisine, Tombola…" />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => setShowInviteModal(false)} style={btnSecondary}>Annuler</button>
              <button
                onClick={inviteCommitteeMember}
                disabled={!(inviteForm.email || '').trim() || inviting}
                style={{ ...btnPrimary, opacity: !(inviteForm.email || '').trim() || inviting ? 0.5 : 1 }}
              >
                {inviting ? 'Envoi...' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove committee member confirm */}
      <ConfirmModal
        isOpen={!!ecRemoveConfirm}
        title="Retirer ce membre ?"
        message={<>Retirer <strong>{ecRemoveConfirm?.first_name} {ecRemoveConfirm?.last_name || ecRemoveConfirm?.email}</strong> du comité d'organisation ?</>}
        confirmLabel="Retirer"
        cancelLabel="Annuler"
        onConfirm={() => { if (ecRemoveConfirm) { removeCommitteeMember(ecRemoveConfirm.id); setEcRemoveConfirm(null) } }}
        onCancel={() => setEcRemoveConfirm(null)}
      />

      {/* Volunteer post modal */}
      {showPostModal && (
        <div style={overlay} onClick={() => setShowPostModal(false)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: 600, margin: '0 0 16px' }}>
              {editingPost ? 'Modifier le poste' : 'Nouveau poste'}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Nom du poste *</label>
                <input value={postForm.name} onChange={(e) => setPostForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <input value={postForm.description} onChange={(e) => setPostForm(f => ({ ...f, description: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>Début</label>
                  <input type="time" value={postForm.start_time} onChange={(e) => setPostForm(f => ({ ...f, start_time: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Fin</label>
                  <input type="time" value={postForm.end_time} onChange={(e) => setPostForm(f => ({ ...f, end_time: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Requis</label>
                  <input type="number" min={1} value={postForm.required_count} onChange={(e) => setPostForm(f => ({ ...f, required_count: parseInt(e.target.value) || 1 }))} style={inputStyle} />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => setShowPostModal(false)} style={btnSecondary}>Annuler</button>
              <button onClick={savePost} disabled={!postForm.name.trim()} style={{ ...btnPrimary, opacity: !postForm.name.trim() ? 0.5 : 1 }}>
                {editingPost ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm volunteer modal */}
      <ConfirmModal
        isOpen={!!confirmVolunteer}
        title="Confirmer ce bénévole ?"
        message={<>Confirmer <strong>{confirmVolunteer?.first_name} {confirmVolunteer?.last_name}</strong> ?</>}
        confirmLabel="Confirmer"
        cancelLabel="Annuler"
        onConfirm={() => confirmVolunteer && updateVolunteerStatus(confirmVolunteer.id, 'confirmed')}
        onCancel={() => setConfirmVolunteer(null)}
      />
    </div>
  )
}

// ── Helpers ──

function buildEventInvoicePDFParams(invoice: EventInvoice, club: any, finance: any) {
  const reg = invoice.registration
  return {
    invoice_number: invoice.invoice_number,
    issue_date: invoice.issue_date,
    due_date: invoice.due_date,
    qr_reference: invoice.qr_reference,
    notes: invoice.notes || undefined,
    member_first_name: '', member_last_name: '',
    member_address: '', member_postal_code: '', member_city: '',
    base_amount: invoice.base_amount,
    fratrie_discount_pct: invoice.fratrie_discount_pct || 0,
    fratrie_discount_amount: invoice.fratrie_discount_amount || 0,
    reminder_fee: invoice.reminder_fee || 0,
    total_amount: invoice.total_amount,
    currency: invoice.currency || 'CHF',
    category_name: '', season_name: invoice.season?.name || '',
    club_name: club?.club_name || '',
    club_address: club?.club_address || '',
    club_street_number: club?.club_street_number || undefined,
    club_postal_code: club?.club_postal_code || '',
    club_city: club?.club_city || '',
    club_email: finance?.email_sender?.trim() || club?.club_email || '',
    club_phone: club?.club_phone || undefined,
    club_website: club?.club_website || undefined,
    logo_url: club?.logo_url || undefined,
    qr_iban: finance?.qr_iban || '',
    bank_name: finance?.bank_name || '',
    bank_street: finance?.bank_street || undefined,
    bank_street_number: finance?.bank_street_number || undefined,
    bank_postal_code: finance?.bank_postal_code || undefined,
    bank_city: finance?.bank_city || undefined,
    contact_name: finance?.contact_name || undefined,
    contact_phone: finance?.contact_phone || undefined,
    payment_delay_days: finance?.payment_delay_days || 30,
    is_event: true,
    event_title: reg?.event?.title || undefined,
    event_date: reg?.event?.date || undefined,
    event_option_label: reg?.option_label || undefined,
    event_quantity: reg?.quantity ?? undefined,
    event_company: reg?.company || undefined,
    event_debtor_first_name: reg?.first_name || undefined,
    event_debtor_last_name: reg?.last_name || undefined,
    event_debtor_address: reg?.address || undefined,
    event_debtor_postal_code: reg?.postal_code || undefined,
    event_debtor_city: reg?.city || undefined,
  }
}

// ── Shared styles ──

const btnPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '6px',
  padding: '8px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: 500,
  background: 'var(--accent)', color: 'var(--text-inverse)', border: 'none', cursor: 'pointer',
}

const btnSecondary: React.CSSProperties = {
  padding: '8px 16px', borderRadius: '8px', fontSize: '14px',
  background: 'var(--bg-hover)', border: '1px solid var(--border-color)', cursor: 'pointer',
  color: 'var(--text-primary)',
}

const btnSmall: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--accent)', fontSize: '13px', fontWeight: 500, padding: '4px 8px',
}

const btnIcon: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: '6px',
  color: 'var(--text-secondary)', borderRadius: '6px',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '14px',
  background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 1000,
  background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
}

const modal: React.CSSProperties = {
  background: 'var(--card-bg)', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '480px',
  border: '1px solid var(--border-color)', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
}
