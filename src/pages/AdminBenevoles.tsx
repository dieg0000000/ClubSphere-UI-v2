import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useModuleAccess } from '../hooks/useModuleAccess'
import { Tabs } from '../components/ui/Tabs'
import { Plus, Trash2, X, CreditCard as Edit2, Clock, ChevronDown, Download, Wand as Wand2, Send, Heart, UserPlus, Pencil, Users, Bell, Mail, ToggleLeft, ToggleRight } from 'lucide-react'
import SearchInput from '../components/ui/SearchInput'
import type ExcelJS from 'exceljs'
import PhoneInput from '../components/PhoneInput'
import { useToast } from '../hooks/useToast'
import { Toast } from '../components/Toast'
import { useConfirmModal } from '../hooks/useConfirmModal'
import ConfirmModal from '../components/ConfirmModal'
import Button from '../components/ui/Button'
import DataTableShell from '../components/DataTableShell'
import { Badge, type BadgeVariant } from '../components/ui/Badge'
import { Alert } from '../components/ui/Alert'
import PageTitleCount from '../components/PageTitleCount'

interface PostTemplate {
  id: string
  name: string
  description: string | null
  default_start_time: string | null
  default_end_time: string | null
  default_count: number
  created_at: string
}

interface EventPost {
  id: string
  event_id: string
  template_id: string | null
  name: string
  description: string | null
  start_time: string
  end_time: string
  required_count: number
  assigned_count?: number
}

interface VolunteerRow {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  availability_start: string | null
  availability_end: string | null
  preferred_posts: string[] | null
  notes: string | null
  status: string
  assigned_post_id: string | null
  event_volunteer_posts?: { name: string } | null
  _source?: 'event_volunteers' | 'event_registrations'
}

interface ClubEvent {
  id: string
  title: string
  date: string
}

interface PersonResult {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  type: string
}

interface VolunteerContact {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  profile_id: string | null
  receive_volunteer_alerts: boolean
  notes: string | null
  created_at: string
  event_count?: number
}

type Tab = 'postes' | 'benevoles' | 'contacts'
type TopTab = 'postes' | 'historique'

interface HistoryPerson {
  key: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  last_event_name: string
  last_event_date: string
  last_role: string | null
  count: number
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-color)',
  borderRadius: '8px', padding: '9px 12px', color: 'var(--text-primary)', fontSize: '14px', boxSizing: 'border-box'
}
const labelStyle: React.CSSProperties = {
  display: 'block', color: 'var(--text-muted)', fontSize: '11px', fontWeight: '600',
  marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px'
}
const btnGhost: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--border-color)',
  color: 'var(--text-muted)', borderRadius: '8px', padding: '9px 16px',
  cursor: 'pointer', fontSize: '13px', fontWeight: '600',
  display: 'flex', alignItems: 'center', gap: '6px'
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    pending:   { label: 'En attente', variant: 'orange' },
    confirmed: { label: 'Confirmé',   variant: 'green' },
    refused:   { label: 'Refusé',     variant: 'red' },
  }
  const s = map[status] || map.pending
  return <Badge variant={s.variant}>{s.label}</Badge>
}

export default function AdminBenevoles() {
  const { canEdit, loading: accessLoading } = useModuleAccess('benevoles')
  const [searchParams] = useSearchParams()
  const eventSectionRef = useRef<HTMLDivElement>(null)

  const [templates, setTemplates] = useState<PostTemplate[]>([])
  const [events, setEvents] = useState<ClubEvent[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string>('')
  const [eventPosts, setEventPosts] = useState<EventPost[]>([])
  const [volunteers, setVolunteers] = useState<VolunteerRow[]>([])
  const [tab, setTab] = useState<Tab>('postes')
  const [loading, setLoading] = useState(true)

  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<PostTemplate | null>(null)
  const [templateForm, setTemplateForm] = useState({ name: '', description: '', default_start_time: '07:30', default_end_time: '18:00', default_count: 1 })

  const [showPostModal, setShowPostModal] = useState(false)
  const [editingPost, setEditingPost] = useState<EventPost | null>(null)
  const [postForm, setPostForm] = useState({ template_id: '', name: '', description: '', start_time: '07:30', end_time: '18:00', required_count: 1 })

  const [autoResult, setAutoResult] = useState<{ assigned: number; unassigned: number } | null>(null)
  const [sendingConfirm, setSendingConfirm] = useState(false)
  const [confirmResult, setConfirmResult] = useState<string | null>(null)
  const [savingVol, setSavingVol] = useState<string | null>(null)

  const [showAddVolModal, setShowAddVolModal] = useState(false)
  const [editingVolunteerId, setEditingVolunteerId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<PersonResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [addVolForm, setAddVolForm] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    availability_start: '', availability_end: '',
    preferred_posts: [] as string[],
    assigned_post_id: '',
    status: 'pending'
  })
  const [addVolSaving, setAddVolSaving] = useState(false)

  const [volunteerContacts, setVolunteerContacts] = useState<VolunteerContact[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [sendingAlert, setSendingAlert] = useState(false)
  const [alertResult, setAlertResult] = useState<string | null>(null)
  const [sendingInvite, setSendingInvite] = useState<string | null>(null)

  const [topTab, setTopTab] = useState<TopTab>('postes')
  const [historyData, setHistoryData] = useState<HistoryPerson[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [historySort, setHistorySort] = useState<{ col: 'last_name' | 'count' | 'last_event_date'; dir: 'asc' | 'desc' }>({ col: 'last_name', dir: 'asc' })

  const { toast, showToast } = useToast();
  const { confirmState, showConfirm, hideConfirm } = useConfirmModal();

  const loadTemplates = useCallback(async () => {
    const { data } = await supabase.from('volunteer_post_templates').select('*').order('name')
    setTemplates(data || [])
  }, [])

  const loadEvents = useCallback(async () => {
    const { data } = await supabase
      .from('events')
      .select('id, title, date')
      .eq('needs_volunteers', true)
      .order('date', { ascending: false })
    setEvents(data || [])
  }, [])

  const loadEventData = useCallback(async (eventId: string) => {
    if (!eventId) { setEventPosts([]); setVolunteers([]); return }

    const [postsRes, volsRes, regRes] = await Promise.all([
      supabase.from('event_volunteer_posts').select('*').eq('event_id', eventId).order('start_time'),
      supabase.from('event_volunteers').select('*, event_volunteer_posts(name)').eq('event_id', eventId).order('registered_at'),
      supabase.from('event_registrations').select('*, profiles(first_name, last_name, email, phone)').eq('event_id', eventId).eq('is_volunteer', true).order('created_at')
    ])

    const posts = postsRes.data || []
    const evVols: VolunteerRow[] = (volsRes.data || []).map((v: VolunteerRow) => ({ ...v, _source: 'event_volunteers' as const }))

    const regVols: VolunteerRow[] = (regRes.data || []).map((r: { id: string; volunteer_role: string | null; profiles: { first_name: string; last_name: string; email: string; phone: string | null } | null }) => ({
      id: r.id,
      first_name: r.profiles?.first_name || '',
      last_name: r.profiles?.last_name || '',
      email: r.profiles?.email || '',
      phone: r.profiles?.phone || null,
      availability_start: null,
      availability_end: null,
      preferred_posts: r.volunteer_role ? [r.volunteer_role] : null,
      notes: null,
      status: 'confirmed',
      assigned_post_id: null,
      event_volunteer_posts: null,
      _source: 'event_registrations' as const
    }))

    const evVolIds = new Set(evVols.map(v => v.id))
    const merged = [...evVols, ...regVols.filter(r => !evVolIds.has(r.id))]

    const postsWithCount = posts.map(p => ({
      ...p,
      assigned_count: merged.filter(v => v.assigned_post_id === p.id && v.status === 'confirmed').length
    }))

    setEventPosts(postsWithCount)
    setVolunteers(merged)
  }, [])

  const loadVolunteerContacts = useCallback(async () => {
    setContactsLoading(true)
    const { data } = await supabase
      .from('volunteer_contacts')
      .select('*')
      .order('last_name')
    if (!data) { setVolunteerContacts([]); setContactsLoading(false); return }

    const contactsWithCount = await Promise.all(data.map(async (c) => {
      if (!c.email) return { ...c, event_count: 0 }
      const { count } = await supabase
        .from('event_volunteers')
        .select('id', { count: 'exact', head: true })
        .ilike('email', c.email)
      return { ...c, event_count: count || 0 }
    }))
    setVolunteerContacts(contactsWithCount)
    setContactsLoading(false)
  }, [])

  useEffect(() => { document.title = 'Bénévoles - ClubSphere' }, [])

  useEffect(() => {
    const urlEventId = searchParams.get('event_id')
    Promise.all([loadTemplates(), loadEvents(), loadVolunteerContacts()]).then(() => {
      setLoading(false)
      if (urlEventId) {
        setSelectedEventId(urlEventId)
        setTimeout(() => {
          eventSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 100)
      }
    })
  }, [])

  useEffect(() => {
    loadEventData(selectedEventId)
  }, [selectedEventId])

  useEffect(() => {
    if (topTab === 'historique' && historyData.length === 0 && !historyLoading) {
      loadHistory()
    }
  }, [topTab])

  const loadHistory = async () => {
    setHistoryLoading(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const { data, error } = await supabase
        .from('event_volunteers')
        .select('first_name, last_name, email, phone, assigned_post_id, event_id, events!inner(title, date), event_volunteer_posts(name)')
        .eq('status', 'confirmed')
        .lt('events.date', today)

      if (error) { showToast('Erreur chargement historique', 'error'); return }

      const map = new Map<string, HistoryPerson>()
      for (const row of (data || []) as any[]) {
        const eventName = row.events?.title || '—'
        const rawDate = row.events?.date || ''
        const eventDate = rawDate.includes('T') ? rawDate.split('T')[0] : rawDate
        const roleName = row.event_volunteer_posts?.name || null
        const email = (row.email || '').toLowerCase().trim()
        const key = email || `${(row.first_name || '').toLowerCase()} ${(row.last_name || '').toLowerCase()}`
        const existing = map.get(key)
        if (!existing) {
          map.set(key, {
            key,
            first_name: row.first_name || '',
            last_name: row.last_name || '',
            email: row.email || '',
            phone: row.phone || null,
            last_event_name: eventName,
            last_event_date: eventDate,
            last_role: roleName,
            count: 1,
          })
        } else {
          existing.count++
          if (eventDate > existing.last_event_date) {
            existing.last_event_name = eventName
            existing.last_event_date = eventDate
            existing.last_role = roleName
          }
        }
      }
      const enriched = await enrichHistoryPhones(Array.from(map.values()))
      setHistoryData(enriched)
    } finally {
      setHistoryLoading(false)
    }
  }

  const enrichHistoryPhones = async (people: HistoryPerson[]): Promise<HistoryPerson[]> => {
    const emails = people.filter(p => p.email && !p.phone).map(p => p.email.toLowerCase())
    if (emails.length === 0) return people
    const { data: members } = await supabase
      .from('members')
      .select('email, phone, phone_private')
      .in('email', emails)
    if (!members || members.length === 0) return people
    const phoneMap = new Map<string, string>()
    for (const m of members) {
      const e = (m.email || '').toLowerCase()
      if (e && !phoneMap.has(e)) {
        const ph = m.phone || m.phone_private || ''
        if (ph) phoneMap.set(e, ph)
      }
    }
    return people.map(p => {
      if (p.phone) return p
      const found = phoneMap.get(p.email.toLowerCase())
      return found ? { ...p, phone: found } : p
    })
  }

  const openTemplateModal = (t?: PostTemplate) => {
    if (t) {
      setEditingTemplate(t)
      setTemplateForm({ name: t.name, description: t.description || '', default_start_time: t.default_start_time || '07:30', default_end_time: t.default_end_time || '18:00', default_count: t.default_count })
    } else {
      setEditingTemplate(null)
      setTemplateForm({ name: '', description: '', default_start_time: '07:30', default_end_time: '18:00', default_count: 1 })
    }
    setShowTemplateModal(true)
  }

  const saveTemplate = async () => {
    if (!templateForm.name.trim()) return
    if (editingTemplate) {
      const { error } = await supabase.from('volunteer_post_templates').update(templateForm).eq('id', editingTemplate.id)
      if (error) { showToast('Erreur: ' + error.message, 'error'); return }
    } else {
      const { error } = await supabase.from('volunteer_post_templates').insert(templateForm)
      if (error) { showToast('Erreur: ' + error.message, 'error'); return }
    }
    setShowTemplateModal(false)
    loadTemplates()
  }

  const deleteTemplate = async (id: string) => {
    const { error } = await supabase.from('volunteer_post_templates').delete().eq('id', id)
    if (error) { showToast('Erreur: ' + error.message, 'error'); return }
    loadTemplates()
  }

  const openPostModal = (p?: EventPost) => {
    if (p) {
      setEditingPost(p)
      setPostForm({ template_id: p.template_id || '', name: p.name, description: p.description || '', start_time: p.start_time, end_time: p.end_time, required_count: p.required_count })
    } else {
      setEditingPost(null)
      setPostForm({ template_id: '', name: '', description: '', start_time: '07:30', end_time: '18:00', required_count: 1 })
    }
    setShowPostModal(true)
  }

  const applyTemplate = (templateId: string) => {
    const t = templates.find(t => t.id === templateId)
    if (!t) return
    setPostForm(f => ({
      ...f,
      template_id: templateId,
      name: t.name,
      description: t.description || '',
      start_time: t.default_start_time || '07:30',
      end_time: t.default_end_time || '18:00',
      required_count: t.default_count
    }))
  }

  const savePost = async () => {
    if (!postForm.name.trim() || !selectedEventId) return
    const payload = {
      event_id: selectedEventId,
      template_id: postForm.template_id || null,
      name: postForm.name,
      description: postForm.description || null,
      start_time: postForm.start_time,
      end_time: postForm.end_time,
      required_count: postForm.required_count
    }
    if (editingPost) {
      const { error } = await supabase.from('event_volunteer_posts').update(payload).eq('id', editingPost.id)
      if (error) { showToast('Erreur: ' + error.message, 'error'); return }
    } else {
      const { error } = await supabase.from('event_volunteer_posts').insert(payload)
      if (error) { showToast('Erreur: ' + error.message, 'error'); return }
    }
    setShowPostModal(false)
    loadEventData(selectedEventId)
  }

  const deletePost = async (id: string) => {
    const { error } = await supabase.from('event_volunteer_posts').delete().eq('id', id)
    if (error) { showToast('Erreur: ' + error.message, 'error'); return }
    loadEventData(selectedEventId)
  }

  const updateVolunteer = async (volId: string, changes: Partial<VolunteerRow>, currentEventId: string) => {
    const vol = volunteers.find(v => v.id === volId)
    if (!vol) return
    setSavingVol(volId)
    if (vol._source === 'event_registrations') {
      const payload: Record<string, unknown> = {
        event_id: currentEventId,
        first_name: vol.first_name,
        last_name: vol.last_name,
        email: vol.email,
        phone: vol.phone,
        availability_start: vol.availability_start,
        availability_end: vol.availability_end,
        preferred_posts: vol.preferred_posts,
        notes: vol.notes,
        status: vol.status,
        assigned_post_id: vol.assigned_post_id,
        ...changes
      }
      const { data: existing } = await supabase
        .from('event_volunteers')
        .select('id')
        .eq('event_id', currentEventId)
        .ilike('email', vol.email)
        .maybeSingle()
      if (existing) {
        const { error } = await supabase.from('event_volunteers').update(payload).eq('id', existing.id)
        if (error) { showToast('Erreur: ' + error.message, 'error'); setSavingVol(null); return }
      } else {
        const { error } = await supabase.from('event_volunteers').insert(payload)
        if (error) { showToast('Erreur: ' + error.message, 'error'); setSavingVol(null); return }
      }
    } else {
      const { error } = await supabase.from('event_volunteers').update(changes).eq('id', volId)
      if (error) { showToast('Erreur: ' + error.message, 'error'); setSavingVol(null); return }
    }
    await loadEventData(currentEventId)
    setSavingVol(null)
  }

  const handlePostAssignment = (volId: string, postId: string) => {
    updateVolunteer(volId, { assigned_post_id: postId || null }, selectedEventId)
  }

  const deleteVolunteer = async (id: string) => {
    const vol = volunteers.find(v => v.id === id)
    if (vol?._source === 'event_registrations') {
      const { error } = await supabase.from('event_registrations').delete().eq('id', id)
      if (error) { showToast('Erreur: ' + error.message, 'error'); return }
    } else {
      const { error } = await supabase.from('event_volunteers').delete().eq('id', id)
      if (error) { showToast('Erreur: ' + error.message, 'error'); return }
    }
    loadEventData(selectedEventId)
  }

  const autoAssign = async () => {
    let assigned = 0
    let unassigned = 0

    const updatedPosts = [...eventPosts]

    for (const vol of volunteers) {
      const aStart = vol.availability_start
      const aEnd = vol.availability_end
      if (!aStart || !aEnd) { unassigned++; continue }

      const preferred = vol.preferred_posts || []

      const eligible = updatedPosts.filter(p => {
        if (p.start_time < aStart || p.end_time > aEnd) return false
        const assignedCount = volunteers.filter(v => v.assigned_post_id === p.id).length
        return assignedCount < p.required_count
      })

      if (eligible.length === 0) { unassigned++; continue }

      const preferredMatch = eligible.find(p => preferred.includes(p.name))
      const chosen = preferredMatch || eligible[0]

      const { error } = await supabase.from('event_volunteers').update({ assigned_post_id: chosen.id, status: 'confirmed' }).eq('id', vol.id)
      if (error) { unassigned++; continue }
      assigned++
    }

    setAutoResult({ assigned, unassigned })
    loadEventData(selectedEventId)
  }

  const sendConfirmations = async () => {
    setSendingConfirm(true)
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${supabaseUrl}/functions/v1/volunteer-confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ event_id: selectedEventId })
      })
      const data = await res.json()
      setConfirmResult(`${data.sent || 0} email(s) envoyé(s)${data.simulated ? ' (simulé — clé Resend manquante)' : ''}`)
    } catch {
      setConfirmResult('Erreur lors de l\'envoi')
    } finally {
      setSendingConfirm(false)
    }
  }

  const exportPresence = async () => {
    try {
    const ExcelJS = (await import('exceljs')).default
    const selectedEvent = events.find(e => e.id === selectedEventId)
    const eventTitle = selectedEvent?.title || 'benevoles'

    const PALETTE = ['1565C0', '2E7D32', 'E65100', '6A1B9A', 'AD1457', 'C62828', '00695C', '558B2F', '0277BD', 'F57F17']
    const EMPTY_COLOR = 'FFEEEEEE'
    const NAME_BG = 'FFFAFAFA'
    const TITLE_BG = 'FF1A2744'
    const SEP_COLOR = 'FFECEFF1'
    const HDR1_BG = 'FF2C3E50'
    const HDR2_BG = 'FF34495E'

    const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })

    const postColorMap: Record<string, string> = {}
    let colorIdx = 0
    eventPosts.forEach(p => {
      postColorMap[p.id] = 'FF' + PALETTE[colorIdx % PALETTE.length]
      colorIdx++
    })
    volunteers.forEach(v => {
      if (v.assigned_post_id && !postColorMap[v.assigned_post_id]) {
        postColorMap[v.assigned_post_id] = 'FF' + PALETTE[colorIdx % PALETTE.length]
        colorIdx++
      }
    })

    const timeToMins = (t: string) => {
      const parts = t.substring(0, 5).split(':')
      return parseInt(parts[0]) * 60 + parseInt(parts[1])
    }

    let rangeStart = 7 * 60
    let rangeEnd = 20 * 60
    volunteers.forEach(v => {
      if (v.availability_start) rangeStart = Math.min(rangeStart, timeToMins(v.availability_start))
      if (v.availability_end) rangeEnd = Math.max(rangeEnd, timeToMins(v.availability_end))
    })
    rangeStart = Math.min(rangeStart, 7 * 60)
    rangeEnd = Math.max(rangeEnd, 20 * 60)

    const slots: number[] = []
    for (let m = rangeStart; m < rangeEnd; m += 30) slots.push(m)
    const numSlots = slots.length
    const totalCols = 2 + numSlots

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Planning')

    ws.columns = [
      { width: 22 },
      { width: 22 },
      ...slots.map(() => ({ width: 3.2 }))
    ]

    const applyCell = (
      row: ExcelJS.Row,
      col: number,
      value: string,
      bgArgb: string,
      fgArgb: string,
      bold: boolean,
      hAlign: ExcelJS.Alignment['horizontal'],
      fontSize: number
    ) => {
      const c = row.getCell(col)
      c.value = value
      c.fill = fill(bgArgb)
      c.font = { bold, color: { argb: fgArgb }, size: fontSize }
      c.alignment = { horizontal: hAlign, vertical: 'middle' }
    }

    const titleRow = ws.addRow([])
    titleRow.height = 22
    applyCell(titleRow, 1, `Planning bénévoles — ${eventTitle}`, TITLE_BG, 'FFFFFFFF', true, 'left', 13)
    for (let c = 2; c <= totalCols; c++) {
      applyCell(titleRow, c, '', TITLE_BG, 'FFFFFFFF', false, 'left', 11)
    }
    ws.mergeCells(1, 1, 1, totalCols)

    const hourRow = ws.addRow([])
    hourRow.height = 14
    applyCell(hourRow, 1, 'Poste', HDR1_BG, 'FFFFFFFF', true, 'left', 10)
    applyCell(hourRow, 2, 'Bénévole', HDR1_BG, 'FFFFFFFF', true, 'left', 10)
    for (let i = 0; i < numSlots; i++) {
      const m = slots[i]
      const h = Math.floor(m / 60)
      const min = m % 60
      applyCell(hourRow, 3 + i, min === 0 ? String(h).padStart(2, '0') : '', HDR1_BG, 'FFFFFFFF', true, 'center', 9)
    }

    const minRow = ws.addRow([])
    minRow.height = 14
    applyCell(minRow, 1, '', HDR2_BG, 'FFFFFFFF', false, 'left', 9)
    applyCell(minRow, 2, '', HDR2_BG, 'FFFFFFFF', false, 'left', 9)
    for (let i = 0; i < numSlots; i++) {
      const m = slots[i]
      const min = m % 60
      applyCell(minRow, 3 + i, min === 0 ? ':00' : ':30', HDR2_BG, 'FFFFFFFF', false, 'center', 9)
    }

    ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 3, topLeftCell: 'C4' }]

    const sortedVols = [...volunteers].sort((a, b) => {
      const postA = eventPosts.find(p => p.id === a.assigned_post_id)?.name || ''
      const postB = eventPosts.find(p => p.id === b.assigned_post_id)?.name || ''
      if (postA !== postB) return postA.localeCompare(postB)
      return a.last_name.localeCompare(b.last_name)
    })

    if (sortedVols.length === 0) {
      const emptyRow = ws.addRow([])
      emptyRow.height = 18
      applyCell(emptyRow, 1, 'Aucun bénévole inscrit', 'FFFFFFFF', 'FF888888', false, 'left', 10)
      for (let c = 2; c <= totalCols; c++) {
        applyCell(emptyRow, c, '', 'FFFFFFFF', 'FF000000', false, 'left', 10)
      }
    }

    let lastPostId: string | undefined = undefined

    sortedVols.forEach(v => {
      const postId = v.assigned_post_id || ''
      const postName = eventPosts.find(p => p.id === postId)?.name || ''
      const postArgb = postColorMap[postId] || 'FF888888'

      if (lastPostId !== undefined && postId !== lastPostId) {
        const sepRow = ws.addRow([])
        sepRow.height = 4
        for (let c = 1; c <= totalCols; c++) {
          applyCell(sepRow, c, '', SEP_COLOR, SEP_COLOR, false, 'left', 8)
        }
      }

      const isFirst = postId !== lastPostId
      lastPostId = postId

      const dataRow = ws.addRow([])
      dataRow.height = 18

      applyCell(dataRow, 1, isFirst ? postName.toUpperCase() : '', postArgb, 'FFFFFFFF', true, 'left', 10)
      applyCell(dataRow, 2, `${v.first_name} ${v.last_name}`, NAME_BG, 'FF222222', false, 'left', 10)

      const hasAvail = !!(v.availability_start && v.availability_end)
      const avStart = hasAvail ? timeToMins(v.availability_start!) : -1
      const avEnd = hasAvail ? timeToMins(v.availability_end!) : -1

      for (let i = 0; i < numSlots; i++) {
        const slotMin = slots[i]
        const bg = (!hasAvail || (slotMin >= avStart && slotMin < avEnd)) ? postArgb : EMPTY_COLOR
        const c = dataRow.getCell(3 + i)
        c.value = ''
        c.fill = fill(bg)
        c.alignment = { horizontal: 'center', vertical: 'middle' }
        if (bg === EMPTY_COLOR) {
          c.font = { color: { argb: EMPTY_COLOR } }
        }
      }
    })

    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${eventTitle.replace(/[^a-z0-9]/gi, '_')}_planning_benevoles.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    } catch (e) { console.error('Export failed', e); showToast("L'export n'a pas pu être généré. Rechargez la page et réessayez.", 'error'); }
  }

  const sendVolunteerAlert = async () => {
    if (!selectedEventId) return
    setSendingAlert(true)
    setAlertResult(null)
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${supabaseUrl}/functions/v1/send-volunteer-alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ event_id: selectedEventId })
      })
      const data = await res.json()
      setAlertResult(`${data.sent || 0} email(s) envoyé(s) aux contacts bénévoles${data.simulated ? ' (simulé)' : ''}`)
    } catch {
      setAlertResult('Erreur lors de l\'envoi')
    } finally {
      setSendingAlert(false)
    }
  }

  const sendInvite = async (contact: VolunteerContact) => {
    if (!contact.email) { showToast('Ce contact n\'a pas d\'email.', 'warning'); return }
    setSendingInvite(contact.id)
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const { data: { session } } = await supabase.auth.getSession()
      await fetch(`${supabaseUrl}/functions/v1/invite-volunteer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ contact_id: contact.id })
      })
    } finally {
      setSendingInvite(null)
    }
  }

  const toggleContactAlerts = async (contact: VolunteerContact) => {
    await supabase
      .from('volunteer_contacts')
      .update({ receive_volunteer_alerts: !contact.receive_volunteer_alerts })
      .eq('id', contact.id)
    setVolunteerContacts(prev =>
      prev.map(c => c.id === contact.id ? { ...c, receive_volunteer_alerts: !c.receive_volunteer_alerts } : c)
    )
  }

  const deleteContact = (id: string) => {
    showConfirm({
      title: 'Supprimer le contact',
      message: 'Supprimer ce contact ?',
      confirmStyle: 'danger',
      confirmLabel: 'Supprimer',
      onConfirm: async () => {
        hideConfirm();
        await supabase.from('volunteer_contacts').delete().eq('id', id)
        setVolunteerContacts(prev => prev.filter(c => c.id !== id))
      }
    });
    return;
  }

  const openAddVolModal = () => {
    setEditingVolunteerId(null)
    setSearchQuery('')
    setSearchResults([])
    setAddVolForm({
      first_name: '', last_name: '', email: '', phone: '',
      availability_start: '', availability_end: '',
      preferred_posts: [],
      assigned_post_id: '',
      status: 'pending'
    })
    setShowAddVolModal(true)
  }

  const openEditVolModal = (vol: VolunteerRow) => {
    setEditingVolunteerId(vol.id)
    setSearchQuery('')
    setSearchResults([])
    setAddVolForm({
      first_name: vol.first_name,
      last_name: vol.last_name,
      email: vol.email || '',
      phone: vol.phone || '',
      availability_start: vol.availability_start || '',
      availability_end: vol.availability_end || '',
      preferred_posts: vol.preferred_posts || [],
      assigned_post_id: vol.assigned_post_id || '',
      status: vol.status
    })
    setShowAddVolModal(true)
  }

  const searchPersons = async (q: string) => {
    setSearchQuery(q)
    if (q.trim().length < 2) { setSearchResults([]); return }
    setSearchLoading(true)
    const term = `%${q.trim()}%`

    const [membersRes, coachesRes, committeeRes, supportersRes, refereesRes] = await Promise.all([
      supabase.from('members').select('id, first_name, last_name, email, phone').or(`first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term}`).limit(5),
      supabase.from('coaches').select('id, first_name, last_name, email, phone').or(`first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term}`).limit(5),
      supabase.from('committee_members').select('id, first_name, last_name, email, phone').or(`first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term}`).limit(5),
      supabase.from('supporters').select('id, first_name, last_name, email, phone').or(`first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term}`).limit(5),
      supabase.from('referees').select('id, first_name, last_name, email, phone').or(`first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term}`).limit(5),
    ])

    const results: PersonResult[] = [
      ...(membersRes.data || []).map(r => ({ ...r, type: 'Joueur' })),
      ...(coachesRes.data || []).map(r => ({ ...r, type: 'Coach' })),
      ...(committeeRes.data || []).map(r => ({ ...r, type: 'Comité' })),
      ...(supportersRes.data || []).map(r => ({ ...r, type: 'Supporter' })),
      ...(refereesRes.data || []).map(r => ({ ...r, type: 'Arbitre' })),
    ]
    setSearchResults(results)
    setSearchLoading(false)
  }

  const selectPerson = (p: PersonResult) => {
    setAddVolForm(f => ({
      ...f,
      first_name: p.first_name,
      last_name: p.last_name,
      email: p.email || '',
      phone: p.phone || ''
    }))
    setSearchResults([])
    setSearchQuery(`${p.first_name} ${p.last_name}`)
  }

  const saveManualVolunteer = async () => {
    if (!addVolForm.first_name.trim() || !addVolForm.last_name.trim() || !selectedEventId) return
    setAddVolSaving(true)

    if (addVolForm.email.trim()) {
      const { data: existing } = await supabase
        .from('event_volunteers')
        .select('id, availability_start, availability_end')
        .eq('event_id', selectedEventId)
        .ilike('email', addVolForm.email.trim())

      if (existing && existing.length > 0) {
        if (!addVolForm.availability_start || !addVolForm.availability_end) {
          showToast('Cette personne est déjà inscrite. Si vous souhaitez l\'inscrire une seconde fois, veuillez spécifier des horaires différents.', 'warning')
          setAddVolSaving(false)
          return
        }

        const hasOverlap = existing.some(ev => {
          if (!ev.availability_start || !ev.availability_end) return true
          return !(addVolForm.availability_end <= ev.availability_start ||
                   addVolForm.availability_start >= ev.availability_end)
        })

        if (hasOverlap) {
          showToast('Les horaires se chevauchent avec une inscription existante pour cette personne.', 'warning')
          setAddVolSaving(false)
          return
        }
      }
    }

    const hasPost = !!addVolForm.assigned_post_id
    const insertData = {
      event_id: selectedEventId,
      user_id: null as string | null,
      first_name: addVolForm.first_name.trim(),
      last_name: addVolForm.last_name.trim(),
      email: addVolForm.email.trim() || '',
      phone: addVolForm.phone.trim() || null,
      availability_start: addVolForm.availability_start || null,
      availability_end: addVolForm.availability_end || null,
      preferred_posts: addVolForm.preferred_posts.length > 0 ? addVolForm.preferred_posts : null,
      assigned_post_id: addVolForm.assigned_post_id || null,
      status: hasPost ? 'confirmed' : addVolForm.status,
      notes: null
    }
    console.log('Inserting volunteer:', insertData)
    const { data: inserted, error: insertError } = await supabase
      .from('event_volunteers')
      .insert(insertData)
      .select()
    console.log('Insert result:', inserted, 'Error:', insertError)
    setAddVolSaving(false)
    if (insertError) {
      showToast('Erreur lors de l\'ajout: ' + insertError.message, 'error')
      return
    }

    const email = addVolForm.email.trim() || null
    const firstName = addVolForm.first_name.trim()
    const lastName = addVolForm.last_name.trim()

    let existingContact = null
    if (email) {
      const { data } = await supabase
        .from('volunteer_contacts')
        .select('id')
        .ilike('email', email)
        .maybeSingle()
      existingContact = data
    }
    if (!existingContact) {
      const { data: nameMatch } = await supabase
        .from('volunteer_contacts')
        .select('id')
        .eq('first_name', firstName)
        .eq('last_name', lastName)
        .maybeSingle()
      existingContact = nameMatch
    }
    if (!existingContact) {
      await supabase.from('volunteer_contacts').insert({
        first_name: firstName,
        last_name: lastName,
        email,
        phone: addVolForm.phone.trim() || null,
        receive_volunteer_alerts: true
      })
      loadVolunteerContacts()
    }

    setShowAddVolModal(false)
    loadEventData(selectedEventId)
  }

  const handleEditVolunteer = async () => {
    if (!editingVolunteerId) return
    setAddVolSaving(true)
    const { error } = await supabase
      .from('event_volunteers')
      .update({
        first_name: addVolForm.first_name.trim(),
        last_name: addVolForm.last_name.trim(),
        email: addVolForm.email.trim() || null,
        phone: addVolForm.phone.trim() || null,
        availability_start: addVolForm.availability_start || null,
        availability_end: addVolForm.availability_end || null,
        preferred_posts: addVolForm.preferred_posts.length > 0 ? addVolForm.preferred_posts : null,
        status: addVolForm.assigned_post_id ? 'confirmed' : addVolForm.status,
        assigned_post_id: addVolForm.assigned_post_id || null
      })
      .eq('id', editingVolunteerId)

    if (error) {
      showToast('Erreur: ' + error.message, 'error')
    } else {
      setShowAddVolModal(false)
      loadEventData(selectedEventId)
    }
    setAddVolSaving(false)
  }

  const section = (title: string) => (
    <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', marginBottom: '20px' }}>
      <h2 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '17px', fontWeight: '700' }}>{title}</h2>
    </div>
  )

  const card = (style?: React.CSSProperties) => ({
    background: 'var(--bg-card)', border: '1px solid var(--border-color)',
    borderRadius: '12px', padding: '20px', ...style
  })

  if (accessLoading || loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary-500" />
      </div>
    )
  }

  if (!canEdit) {
    return (
      <div style={card()}>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>Accès non autorisé.</p>
      </div>
    )
  }

  const selectedEvent = events.find(e => e.id === selectedEventId)
  const formatDateCH = (d: string) => {
    if (!d) return '—'
    const iso = d.includes('T') ? d.split('T')[0] : d
    const [y, m, day] = iso.split('-')
    return `${day}.${m}.${y}`
  }

  const toggleHistorySort = (col: 'last_name' | 'count' | 'last_event_date') => {
    setHistorySort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: col === 'count' ? 'desc' : 'asc' })
  }

  const filteredHistory = (() => {
    const q = historySearch.toLowerCase().trim()
    let list = historyData
    if (q) {
      list = list.filter(p =>
        p.first_name.toLowerCase().includes(q) ||
        p.last_name.toLowerCase().includes(q) ||
        (p.email && p.email.toLowerCase().includes(q))
      )
    }
    list = [...list].sort((a, b) => {
      const { col, dir } = historySort
      let cmp = 0
      if (col === 'last_name') {
        const aEmpty = !a.last_name
        const bEmpty = !b.last_name
        if (aEmpty && !bEmpty) return 1
        if (!aEmpty && bEmpty) return -1
        cmp = a.last_name.localeCompare(b.last_name, 'fr')
      } else if (col === 'count') {
        cmp = a.count - b.count
      } else {
        cmp = a.last_event_date.localeCompare(b.last_event_date)
      }
      return dir === 'asc' ? cmp : -cmp
    })
    return list
  })()

  const totalParticipations = filteredHistory.reduce((s, p) => s + p.count, 0)
  const isHistoryFiltered = historySearch.trim().length > 0

  const exportHistory = async () => {
    try {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Historique bénévoles')
    ws.addRow(['Prénom', 'Nom', 'Dernier événement', 'Dernier rôle', 'Dernière date', 'Participations', 'Email', 'Téléphone'])
    ws.getRow(1).font = { bold: true }
    for (const p of filteredHistory) {
      ws.addRow([p.first_name, p.last_name, p.last_event_name, p.last_role || '—', formatDateCH(p.last_event_date), p.count, p.email || '—', p.phone || '—'])
    }
    ws.columns.forEach(col => { col.width = 18 })
    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'historique_benevoles.xlsx'
    a.click()
    URL.revokeObjectURL(url)
    } catch (e) { console.error('Export failed', e); showToast("L'export n'a pas pu être généré. Rechargez la page et réessayez.", 'error'); }
  }

  const confirmedVols = volunteers.filter(v => v.status === 'confirmed').length
  const totalRequired = eventPosts.reduce((s, p) => s + p.required_count, 0)

  return (
    <div style={{ width: '100%' }}>
      <div className="mb-8">
        <h1 className="text-2xl font-bold flex items-center gap-3 mb-2" style={{ color: 'var(--text-primary)' }}>
          <Heart size={28} style={{ color: 'var(--accent)', fill: 'var(--accent)' }} />
          Bénévoles
          <PageTitleCount total={templates.length} />
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Bibliothèque des postes, gestion par événement et contacts bénévoles</p>
      </div>

      <Tabs
        items={[
          { key: 'postes', label: 'Postes' },
          { key: 'historique', label: 'Historique' },
        ]}
        value={topTab}
        onChange={(k) => setTopTab(k as TopTab)}
        className="mb-6"
      />

      {topTab === 'postes' && (<>
      {/* BIBLIOTHÈQUE DES POSTES */}
      <div style={card({ marginBottom: '24px' })}>
        {section('Bibliothèque des postes')}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
          <Button onClick={() => openTemplateModal()} leftIcon={<Plus size={15} />}>
            Nouveau poste
          </Button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <DataTableShell bare maxHeight="400px">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--table-header-bg)' }}>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                {['Nom', 'Description', 'Horaires', 'Nb requis', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {templates.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--border-color)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>{t.name}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: '13px', maxWidth: '260px' }}>{t.description || '—'}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: '13px', whiteSpace: 'nowrap' }}>
                    {t.default_start_time?.substring(0, 5) || '—'} – {t.default_end_time?.substring(0, 5) || '—'}
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontSize: '13px', fontWeight: '500' }}>{t.default_count}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button onClick={() => openTemplateModal(t)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                        title="Modifier"><Edit2 size={15} /></button>
                      <button onClick={() => deleteTemplate(t.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px' }}
                        title="Supprimer"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </DataTableShell>
          {templates.length === 0 && (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0', fontSize: '14px' }}>Aucun poste dans la bibliothèque</p>
          )}
        </div>
      </div>

      {/* GESTION PAR ÉVÉNEMENT */}
      <div ref={eventSectionRef} style={card()}>
        {section('Gestion par événement')}

        <div style={{ marginBottom: '20px' }}>
          <label style={labelStyle}>Sélectionner un événement</label>
          <div style={{ position: 'relative', maxWidth: '480px' }}>
            <select
              value={selectedEventId}
              onChange={e => setSelectedEventId(e.target.value)}
              style={{ ...inputStyle, appearance: 'none', paddingRight: '36px', cursor: 'pointer' }}
            >
              <option value="">— Choisir un événement —</option>
              {events.map(e => (
                <option key={e.id} value={e.id}>
                  {e.title} — {new Date(e.date).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })}
                </option>
              ))}
            </select>
            <ChevronDown size={16} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          </div>
        </div>

        {selectedEvent && (
          <>
            <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
              {[
                { label: 'Postes définis', value: eventPosts.length },
                { label: 'Places requises', value: totalRequired },
                { label: 'Bénévoles inscrits', value: volunteers.length },
                { label: 'Bénévoles confirmés', value: confirmedVols }
              ].map(stat => (
                <div key={stat.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px', minWidth: '130px' }}>
                  <div style={{ color: 'var(--accent)', fontSize: '22px', fontWeight: '800' }}>{stat.value}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{stat.label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '8px' }}>
              <Tabs
                value={tab}
                onChange={(id) => setTab(id as Tab)}
                items={[
                  { key: 'postes', label: 'Postes', count: eventPosts.length },
                  { key: 'benevoles', label: 'Bénévoles inscrits', count: volunteers.length },
                ]}
              />
              <button
                style={{ ...btnGhost, marginBottom: '8px', borderColor: 'var(--warning)', color: 'var(--warning-text)' }}
                onClick={sendVolunteerAlert}
                disabled={sendingAlert}
                title="Alerter tous les contacts bénévoles de cet événement"
              >
                <Bell size={15} /> {sendingAlert ? 'Envoi...' : 'Alerter les bénévoles'}
              </button>
            </div>

            {tab === 'postes' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
                  <Button onClick={() => openPostModal()} leftIcon={<Plus size={15} />}>
                    Ajouter un poste
                  </Button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {eventPosts.map(p => {
                    const assigned = volunteers.filter(v => v.assigned_post_id === p.id && v.status === 'confirmed').length
                    const full = assigned >= p.required_count
                    return (
                      <div key={p.id} style={{
                        background: 'var(--bg-main)', border: `1px solid ${full ? 'var(--success)' : 'var(--danger)'}`,
                        borderRadius: '10px', padding: '14px 16px',
                        display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap'
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '700' }}>{p.name}</div>
                          {p.description && <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>{p.description}</div>}
                          <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Clock size={12} /> {p.start_time.substring(0, 5)} – {p.end_time.substring(0, 5)}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                          <span style={{
                            fontSize: '15px', fontWeight: '800',
                            color: full ? 'var(--success-text)' : 'var(--danger-text)',
                            background: full ? 'var(--success-soft)' : 'var(--danger-soft)',
                            border: `1px solid ${full ? 'var(--success)' : 'var(--danger)'}`,
                            borderRadius: '8px', padding: '4px 12px'
                          }}>
                            {assigned}/{p.required_count}
                          </span>
                          <button onClick={() => openPostModal(p)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }} title="Modifier">
                            <Edit2 size={15} />
                          </button>
                          <button onClick={() => deletePost(p.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px' }} title="Supprimer">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  {eventPosts.length === 0 && (
                    <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0', fontSize: '14px' }}>Aucun poste défini pour cet événement</p>
                  )}
                </div>
              </div>
            )}

            {tab === 'benevoles' && (
              <div>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
                  <Button onClick={openAddVolModal} leftIcon={<UserPlus size={15} />}>
                    Ajouter un bénévole
                  </Button>
                  <Button variant="secondary" onClick={autoAssign} title="Affectation automatique" leftIcon={<Wand2 size={15} />}>
                    Générer le planning automatique
                  </Button>
                  <Button variant="secondary" onClick={sendConfirmations} disabled={sendingConfirm} leftIcon={<Send size={15} />}>
                    {sendingConfirm ? 'Envoi...' : 'Valider et envoyer les confirmations'}
                  </Button>
                  <Button variant="secondary" onClick={exportPresence} leftIcon={<Download size={15} />}>
                    Exporter la feuille de présence
                  </Button>
                </div>

                {autoResult && (
                  <div style={{ marginBottom: '14px' }}>
                    <Alert variant="success" onClose={() => setAutoResult(null)}>
                      Planning généré : {autoResult.assigned} bénévole(s) affecté(s), {autoResult.unassigned} non affecté(s)
                    </Alert>
                  </div>
                )}
                {confirmResult && (
                  <div style={{ marginBottom: '14px' }}>
                    <Alert variant="success" onClose={() => setConfirmResult(null)}>
                      {confirmResult}
                    </Alert>
                  </div>
                )}

                {volunteers.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0', fontSize: '14px' }}>Aucun bénévole inscrit pour cet événement</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <DataTableShell bare maxHeight="400px">
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
                      <thead style={{ background: 'var(--table-header-bg)' }}>
                        <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                          {['Prénom', 'Nom', 'Email', 'Téléphone', 'Disponibilités', 'Souhaits', 'Statut', 'Poste assigné', 'Actions'].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-muted)', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {volunteers.map(volunteer => (
                          <tr key={volunteer.id} style={{ borderBottom: '1px solid var(--border-color)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <td style={{ padding: '10px 10px', color: 'var(--text-primary)', fontSize: '13px', fontWeight: '600' }}>{volunteer.first_name}</td>
                            <td style={{ padding: '10px 10px', color: 'var(--text-primary)', fontSize: '13px' }}>{volunteer.last_name}</td>
                            <td style={{ padding: '10px 10px', color: 'var(--text-muted)', fontSize: '12px' }}>{volunteer.email}</td>
                            <td style={{ padding: '10px 10px', color: 'var(--text-muted)', fontSize: '12px' }}>{volunteer.phone || '—'}</td>
                            <td style={{ padding: '10px 10px', color: 'var(--text-muted)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                              {volunteer.availability_start?.substring(0, 5) || '—'}–{volunteer.availability_end?.substring(0, 5) || '—'}
                            </td>
                            <td style={{ padding: '10px 10px', color: 'var(--text-muted)', fontSize: '12px', maxWidth: '160px' }}>
                              {volunteer.preferred_posts?.join(', ') || '—'}
                            </td>
                            <td style={{ padding: '10px 10px' }}>
                              <select
                                key={volunteer.id + '-status'}
                                value={volunteer.status}
                                disabled={savingVol === volunteer.id}
                                onChange={e => updateVolunteer(volunteer.id, { status: e.target.value }, selectedEventId)}
                                style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 8px', color: 'var(--text-primary)', fontSize: '12px', cursor: 'pointer' }}
                              >
                                <option value="pending">En attente</option>
                                <option value="confirmed">Confirmé</option>
                                <option value="refused">Refusé</option>
                              </select>
                            </td>
                            <td style={{ padding: '10px 10px' }}>
                              <select
                                key={volunteer.id + '-post'}
                                value={volunteer.assigned_post_id || ''}
                                disabled={savingVol === volunteer.id}
                                onChange={e => handlePostAssignment(volunteer.id, e.target.value)}
                                style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 8px', color: 'var(--text-primary)', fontSize: '12px', cursor: 'pointer', maxWidth: '160px' }}
                              >
                                <option value="">— Non assigné —</option>
                                {eventPosts.map(p => {
                                  const cnt = volunteers.filter(vv => vv.assigned_post_id === p.id && vv.status === 'confirmed' && vv.id !== volunteer.id).length
                                  const remaining = p.required_count - cnt
                                  return (
                                    <option key={p.id} value={p.id}>
                                      {p.name} ({remaining} place{remaining !== 1 ? 's' : ''})
                                    </option>
                                  )
                                })}
                              </select>
                            </td>
                            <td style={{ padding: '10px 10px' }}>
                              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                {volunteer._source === 'event_volunteers' && (
                                  <button onClick={() => openEditVolModal(volunteer)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }} title="Modifier">
                                    <Pencil size={14} />
                                  </button>
                                )}
                                <button onClick={() => deleteVolunteer(volunteer.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px' }} title="Supprimer">
                                  <Trash2 size={14} />
                                </button>
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
          </>
        )}

        {alertResult && (
          <div style={{ marginTop: '14px' }}>
            <Alert variant="warning" onClose={() => setAlertResult(null)}>
              {alertResult}
            </Alert>
          </div>
        )}

        {!selectedEventId && (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '32px 0', fontSize: '14px' }}>
            Sélectionnez un événement pour gérer les bénévoles
          </p>
        )}
      </div>

      {/* CONTACTS BÉNÉVOLES */}
      <div style={card({ marginTop: '24px' })}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
          <h2 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '17px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={18} style={{ color: 'var(--accent)' }} />
            Contacts Bénévoles
            <span style={{ background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: '6px', padding: '2px 8px', fontSize: '12px', fontWeight: '700' }}>
              {volunteerContacts.length}
            </span>
          </h2>
        </div>

        {contactsLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500" />
          </div>
        ) : volunteerContacts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Users size={40} style={{ color: 'var(--text-muted)', margin: '0 auto 12px', display: 'block' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>Aucun contact bénévole</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>Les contacts sont créés automatiquement lorsque vous ajoutez des bénévoles à un événement.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <DataTableShell bare maxHeight="400px">
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
              <thead style={{ background: 'var(--table-header-bg)' }}>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  {['Nom', 'Email', 'Téléphone', 'Événements', 'Alertes', 'Compte', 'Actions'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-muted)', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {volunteerContacts.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border-color)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '10px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-soft)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontSize: '13px', fontWeight: '700', flexShrink: 0 }}>
                          {c.first_name[0]}{c.last_name[0]}
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: '600' }}>{c.first_name} {c.last_name}</div>
                          {c.profile_id && (
                            <span style={{ background: 'var(--success-soft)', color: 'var(--success-text)', border: '1px solid var(--success)', borderRadius: '4px', padding: '1px 6px', fontSize: '10px', fontWeight: '700' }}>Compte actif</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '10px 10px', color: 'var(--text-muted)', fontSize: '12px' }}>{c.email || '—'}</td>
                    <td style={{ padding: '10px 10px', color: 'var(--text-muted)', fontSize: '12px' }}>{c.phone || '—'}</td>
                    <td style={{ padding: '10px 10px', color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center' }}>
                      <span style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', borderRadius: '6px', padding: '2px 8px', fontWeight: '700', fontSize: '12px' }}>
                        {c.event_count ?? 0}
                      </span>
                    </td>
                    <td style={{ padding: '10px 10px' }}>
                      <button
                        onClick={() => toggleContactAlerts(c)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0' }}
                        title={c.receive_volunteer_alerts ? 'Désactiver les alertes' : 'Activer les alertes'}
                      >
                        {c.receive_volunteer_alerts
                          ? <ToggleRight size={22} style={{ color: 'var(--success)' }} />
                          : <ToggleLeft size={22} style={{ color: 'var(--text-muted)' }} />
                        }
                        <span style={{ color: c.receive_volunteer_alerts ? 'var(--success)' : 'var(--text-muted)', fontSize: '11px', fontWeight: '600' }}>
                          {c.receive_volunteer_alerts ? 'Oui' : 'Non'}
                        </span>
                      </button>
                    </td>
                    <td style={{ padding: '10px 10px' }}>
                      {c.profile_id ? (
                        <span style={{ color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic' }}>Membre</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 10px' }}>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        {c.email && !c.profile_id && (
                          <button
                            onClick={() => sendInvite(c)}
                            disabled={sendingInvite === c.id}
                            style={{ background: 'var(--info-soft)', border: '1px solid var(--info)', color: 'var(--info-text)', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px', opacity: sendingInvite === c.id ? 0.6 : 1 }}
                            title="Inviter sur ClubSphere"
                          >
                            <Mail size={12} /> {sendingInvite === c.id ? '...' : 'Inviter'}
                          </button>
                        )}
                        <button onClick={() => deleteContact(c.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px' }} title="Supprimer">
                          <Trash2 size={14} />
                        </button>
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

      </>)}

      {topTab === 'historique' && (
        <div>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
              Bénévoles
              <span className="text-base font-normal text-[var(--text-muted)]">({historyData.length})</span>
              {isHistoryFiltered && (
                <span className="text-base font-normal text-[var(--text-muted)]">
                  — {filteredHistory.length} résultat{filteredHistory.length !== 1 ? 's' : ''} filtré{filteredHistory.length !== 1 ? 's' : ''}
                </span>
              )}
            </h2>
            <span className="text-sm text-[var(--text-muted)]">
              · {totalParticipations} participation{totalParticipations !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="mb-4 flex flex-wrap gap-3 items-center">
            <div className="flex-1 min-w-[200px]">
              <SearchInput
                value={historySearch}
                onChange={setHistorySearch}
                placeholder="Rechercher par nom ou email…"
              />
            </div>
            <button
              onClick={exportHistory}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', fontSize: 13, fontWeight: 500,
                background: 'var(--accent)', color: 'var(--text-inverse)', border: 'none',
                borderRadius: 8, cursor: 'pointer',
              }}
            >
              <Download size={14} /> Exporter Excel
            </button>
          </div>

          {historyLoading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: 32 }}>Chargement…</p>
          ) : filteredHistory.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: 32 }}>Aucune participation enregistrée pour le moment.</p>
          ) : (
            <div className="std-table-wrap">
              <style>{`
                .hist-sticky-head thead th::after {
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
                style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}
              >
                <table className="std-table hist-sticky-head" style={{ minWidth: '900px' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                    <tr>
                      <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)', cursor: 'default' }}>Prénom</th>
                      <th onClick={() => toggleHistorySort('last_name')} style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}>
                        Nom {historySort.col === 'last_name' ? (historySort.dir === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)', cursor: 'default' }}>Dernier événement</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)', cursor: 'default' }}>Dernier rôle</th>
                      <th onClick={() => toggleHistorySort('last_event_date')} style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}>
                        Dernière date {historySort.col === 'last_event_date' ? (historySort.dir === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th onClick={() => toggleHistorySort('count')} style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', textAlign: 'center' }}>
                        Participations {historySort.col === 'count' ? (historySort.dir === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)', cursor: 'default' }}>Email</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)', cursor: 'default' }}>Téléphone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map((p) => (
                      <tr key={p.key}>
                        <td>{p.first_name || '—'}</td>
                        <td style={{ fontWeight: 500 }}>{p.last_name || '—'}</td>
                        <td>{p.last_event_name}</td>
                        <td>{p.last_role || '—'}</td>
                        <td>{formatDateCH(p.last_event_date)}</td>
                        <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{p.count}</td>
                        <td>{p.email || '—'}</td>
                        <td>{p.phone || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TEMPLATE MODAL */}
      {showTemplateModal && (
        <div onClick={() => setShowTemplateModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', width: '100%', maxWidth: '480px', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ padding: '20px 24px', background: 'var(--bg-modal-header)', borderRadius: '16px 16px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ color: 'var(--text-modal-header)', margin: 0, fontSize: '17px', fontWeight: '700' }}>
                {editingTemplate ? 'Modifier le poste' : 'Nouveau poste'}
              </h3>
              <button onClick={() => setShowTemplateModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-modal-header)', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Nom *</label>
                <input style={inputStyle} value={templateForm.name} onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Accueil des équipes" />
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <textarea style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' } as React.CSSProperties} rows={2} value={templateForm.description} onChange={e => setTemplateForm(f => ({ ...f, description: e.target.value }))} placeholder="Détails du poste..." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Heure début</label>
                  <input type="time" style={inputStyle} value={templateForm.default_start_time} onChange={e => setTemplateForm(f => ({ ...f, default_start_time: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Heure fin</label>
                  <input type="time" style={inputStyle} value={templateForm.default_end_time} onChange={e => setTemplateForm(f => ({ ...f, default_end_time: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Nb requis</label>
                  <input type="number" min={1} style={inputStyle} value={templateForm.default_count} onChange={e => setTemplateForm(f => ({ ...f, default_count: parseInt(e.target.value) || 1 }))} />
                </div>
              </div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setShowTemplateModal(false)}>Annuler</Button>
              <Button onClick={saveTemplate}>Enregistrer</Button>
            </div>
          </div>
        </div>
      )}

      {/* POST MODAL */}
      {showPostModal && (
        <div onClick={() => setShowPostModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', width: '100%', maxWidth: '480px', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ padding: '20px 24px', background: 'var(--bg-modal-header)', borderRadius: '16px 16px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ color: 'var(--text-modal-header)', margin: 0, fontSize: '17px', fontWeight: '700' }}>
                {editingPost ? 'Modifier le poste' : 'Ajouter un poste'}
              </h3>
              <button onClick={() => setShowPostModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-modal-header)', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {!editingPost && (
                <div>
                  <label style={labelStyle}>Pré-remplir depuis la bibliothèque</label>
                  <div style={{ position: 'relative' }}>
                    <select
                      value={postForm.template_id}
                      onChange={e => applyTemplate(e.target.value)}
                      style={{ ...inputStyle, appearance: 'none', paddingRight: '32px', cursor: 'pointer' }}
                    >
                      <option value="">— Choisir un modèle —</option>
                      {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  </div>
                </div>
              )}
              <div>
                <label style={labelStyle}>Nom *</label>
                <input style={inputStyle} value={postForm.name} onChange={e => setPostForm(f => ({ ...f, name: e.target.value }))} placeholder="Nom du poste" />
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <textarea style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' } as React.CSSProperties} rows={2} value={postForm.description} onChange={e => setPostForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Heure début</label>
                  <input type="time" style={inputStyle} value={postForm.start_time} onChange={e => setPostForm(f => ({ ...f, start_time: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Heure fin</label>
                  <input type="time" style={inputStyle} value={postForm.end_time} onChange={e => setPostForm(f => ({ ...f, end_time: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Nb requis</label>
                  <input type="number" min={1} style={inputStyle} value={postForm.required_count} onChange={e => setPostForm(f => ({ ...f, required_count: parseInt(e.target.value) || 1 }))} />
                </div>
              </div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setShowPostModal(false)}>Annuler</Button>
              <Button onClick={savePost}>Enregistrer</Button>
            </div>
          </div>
        </div>
      )}

      {/* ADD VOLUNTEER MODAL */}
      {showAddVolModal && (
        <div onClick={() => setShowAddVolModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', width: '100%', maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ padding: '20px 24px', background: 'var(--bg-modal-header)', borderRadius: '16px 16px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 1 }}>
              <h3 style={{ color: 'var(--text-modal-header)', margin: 0, fontSize: '17px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {editingVolunteerId
                  ? <><Pencil size={18} style={{ color: 'var(--accent)' }} /> Modifier le bénévole</>
                  : <><UserPlus size={18} style={{ color: 'var(--accent)' }} /> Ajouter un bénévole</>
                }
              </h3>
              <button onClick={() => setShowAddVolModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-modal-header)', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Search — only shown when adding */}
              {!editingVolunteerId && (
                <div>
                  <label style={labelStyle}>Rechercher une personne existante</label>
                  <SearchInput
                    value={searchQuery}
                    onChange={searchPersons}
                    inputSize="sm"
                    placeholder="Prénom, nom ou email..."
                  />
                  {searchLoading && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '6px 0 0' }}>Recherche...</p>
                  )}
                  {searchResults.length > 0 && (
                    <div style={{ marginTop: '6px', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                      {searchResults.map(p => (
                        <div
                          key={p.id + p.type}
                          onClick={() => selectPerson(p)}
                          style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <div>
                            <span style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>{p.first_name} {p.last_name}</span>
                            {p.email && <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginLeft: '8px' }}>{p.email}</span>}
                          </div>
                          <span style={{ background: 'var(--info-soft)', color: 'var(--info-text)', fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px' }}>{p.type}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Identity */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Prénom *</label>
                  <input style={inputStyle} value={addVolForm.first_name} onChange={e => setAddVolForm(f => ({ ...f, first_name: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Nom *</label>
                  <input style={inputStyle} value={addVolForm.last_name} onChange={e => setAddVolForm(f => ({ ...f, last_name: e.target.value }))} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input type="email" style={inputStyle} value={addVolForm.email} onChange={e => setAddVolForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Téléphone</label>
                  <PhoneInput value={addVolForm.phone} onChange={v => setAddVolForm(f => ({ ...f, phone: v }))} />
                </div>
              </div>

              {/* Availability */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Disponibilité début</label>
                  <input type="time" style={inputStyle} value={addVolForm.availability_start} onChange={e => setAddVolForm(f => ({ ...f, availability_start: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Disponibilité fin</label>
                  <input type="time" style={inputStyle} value={addVolForm.availability_end} onChange={e => setAddVolForm(f => ({ ...f, availability_end: e.target.value }))} />
                </div>
              </div>

              {/* Preferred posts checkboxes */}
              {eventPosts.length > 0 && (
                <div>
                  <label style={labelStyle}>Souhaits de postes</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                    {eventPosts.map(p => {
                      const checked = addVolForm.preferred_posts.includes(p.name)
                      return (
                        <label
                          key={p.id}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', background: checked ? 'var(--accent-soft)' : 'var(--bg-hover)', border: `1px solid ${checked ? 'var(--accent)' : 'var(--border-color)'}`, borderRadius: '6px', padding: '5px 10px', fontSize: '12px', color: checked ? 'var(--accent)' : 'var(--text-muted)', transition: 'all 0.15s' }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setAddVolForm(f => ({
                                ...f,
                                preferred_posts: checked
                                  ? f.preferred_posts.filter(x => x !== p.name)
                                  : [...f.preferred_posts, p.name]
                              }))
                            }}
                            style={{ display: 'none' }}
                          />
                          {p.name}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Assigned post */}
              <div>
                <label style={labelStyle}>Poste assigné</label>
                <select
                  value={addVolForm.assigned_post_id}
                  onChange={e => setAddVolForm(f => ({ ...f, assigned_post_id: e.target.value }))}
                  style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
                >
                  <option value="">— Non assigné —</option>
                  {eventPosts.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.start_time.substring(0, 5)}-{p.end_time.substring(0, 5)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div>
                <label style={labelStyle}>Statut</label>
                <select
                  value={addVolForm.assigned_post_id ? 'confirmed' : addVolForm.status}
                  disabled={!!addVolForm.assigned_post_id}
                  onChange={e => setAddVolForm(f => ({ ...f, status: e.target.value }))}
                  style={{ ...inputStyle, appearance: 'none', cursor: 'pointer', opacity: addVolForm.assigned_post_id ? 0.6 : 1 }}
                >
                  <option value="pending">En attente</option>
                  <option value="confirmed">Confirmé</option>
                </select>
                {addVolForm.assigned_post_id && (
                  <p style={{ color: 'var(--text-muted)', fontSize: '11px', margin: '4px 0 0' }}>Statut automatiquement "Confirmé" quand un poste est assigné</p>
                )}
              </div>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setShowAddVolModal(false)}>Annuler</Button>
              <Button
                disabled={addVolSaving || !addVolForm.first_name.trim() || !addVolForm.last_name.trim()}
                onClick={editingVolunteerId ? handleEditVolunteer : saveManualVolunteer}
              >
                {addVolSaving ? 'Enregistrement...' : editingVolunteerId ? 'Enregistrer' : 'Ajouter'}
              </Button>
            </div>
          </div>
        </div>
      )}
      <Toast toast={toast} />
      <ConfirmModal {...confirmState} onCancel={hideConfirm} />
    </div>
  )
}
