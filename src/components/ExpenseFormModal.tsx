import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { safeUUID } from '../lib/ids'
import { useTenant } from '../context/TenantContext'
import { ConfirmModal } from './ConfirmModal'
import Button from './ui/Button'
import { Upload, X, FileText, ExternalLink, TriangleAlert as AlertTriangle, Trash2, User, Info } from 'lucide-react'
import useEscapeKey from '../hooks/useEscapeKey'

interface ExpenseGroup {
  id: string
  name: string
  account_number: string | null
  active: boolean
}

interface Supplier {
  id: string
  name: string
  note: string | null
  active: boolean
}

interface TeamOption {
  id: string
  name: string
}

interface EventOption {
  id: string
  title: string
  date: string
}

interface CoachOption {
  id: string
  first_name: string
  last_name: string
}

interface ExpenseRow {
  id: string
  expense_number: number
  expense_date: string
  group_id: string | null
  supplier_id: string | null
  description: string
  amount: number
  status: string
  receipt_path: string | null
  team_id: string | null
  event_id: string | null
  reimbursed_to_coach_id: string | null
  created_by: string | null
  rejected_reason: string | null
}

type AttachType = 'none' | 'team' | 'event'

interface Props {
  isOpen: boolean
  expense: ExpenseRow | null
  groups: ExpenseGroup[]
  suppliers: Supplier[]
  teams: TeamOption[]
  events: EventOption[]
  coaches: CoachOption[]
  createdByName: string | null
  createdAt: string | null
  coachName: string | null
  onClose: () => void
  onSaved: () => void
  onStatusChanged: () => void
  onDeleted: () => void
  onSuppliersChanged: () => void
  showToast: (msg: string, type: 'success' | 'error') => void
}

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg']
const ALLOWED_EXT = ['pdf', 'png', 'jpg', 'jpeg']

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function ExpenseFormModal({
  isOpen, expense, groups, suppliers, teams, events, coaches, createdByName, createdAt, coachName,
  onClose, onSaved, onStatusChanged, onDeleted, onSuppliersChanged, showToast,
}: Props) {
  const { clubId } = useTenant()
  useEscapeKey(() => { if (isOpen) onClose() })

  const [date, setDate] = useState(todayISO())
  const [groupId, setGroupId] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [existingReceipt, setExistingReceipt] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [openingReceipt, setOpeningReceipt] = useState(false)

  const [supplierQuery, setSupplierQuery] = useState('')
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [creatingSupplier, setCreatingSupplier] = useState(false)
  const supplierRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const compteRef = useRef<HTMLSelectElement>(null)

  /* rattachement + coach */
  const [attachType, setAttachType] = useState<AttachType>('none')
  const [teamId, setTeamId] = useState('')
  const [eventId, setEventId] = useState('')
  const [coachId, setCoachId] = useState('')

  /* workflow state */
  const [transitioning, setTransitioning] = useState(false)
  const [rejectMode, setRejectMode] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingExpense, setDeletingExpense] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    if (expense) {
      setDate(expense.expense_date)
      setGroupId(expense.group_id || '')
      setSupplierId(expense.supplier_id || '')
      setDescription(expense.description)
      setAmount(String(expense.amount))
      setFile(null)
      setExistingReceipt(expense.receipt_path)
      const s = suppliers.find(s => s.id === expense.supplier_id)
      setSupplierQuery(s ? s.name : '')
      if (expense.team_id) { setAttachType('team'); setTeamId(expense.team_id); setEventId('') }
      else if (expense.event_id) { setAttachType('event'); setEventId(expense.event_id); setTeamId('') }
      else { setAttachType('none'); setTeamId(''); setEventId('') }
      setCoachId(expense.reimbursed_to_coach_id || '')
    } else {
      setDate(todayISO())
      setGroupId('')
      setSupplierId('')
      setDescription('')
      setAmount('')
      setFile(null)
      setExistingReceipt(null)
      setSupplierQuery('')
      setAttachType('none')
      setTeamId('')
      setEventId('')
      setCoachId('')
    }
    setErrors({})
    setSaving(false)
    setTransitioning(false)
    setRejectMode(false)
    setRejectReason('')
    setDeleteConfirmOpen(false)
    setDeletingExpense(false)
  }, [isOpen, expense])

  const selectedGroup = useMemo(
    () => groups.find(g => g.id === groupId) ?? null,
    [groups, groupId]
  )

  const filteredSuppliers = useMemo(() => {
    const q = supplierQuery.toLowerCase().trim()
    if (!q) return suppliers.filter(s => s.active)
    return suppliers.filter(s => s.active && s.name.toLowerCase().includes(q))
  }, [suppliers, supplierQuery])

  const showCreateOption = supplierQuery.trim().length > 0 &&
    !suppliers.some(s => s.name.toLowerCase() === supplierQuery.trim().toLowerCase())

  function handleFileSelect(f: File | null) {
    if (!f) return
    if (!ALLOWED_TYPES.includes(f.type)) {
      setErrors(e => ({ ...e, file: 'Format accepté : PDF, PNG ou JPG.' }))
      return
    }
    if (f.size > MAX_FILE_SIZE) {
      setErrors(e => ({ ...e, file: 'Le fichier ne doit pas dépasser 10 Mo.' }))
      return
    }
    setFile(f)
    setErrors(e => { const { file: _, ...rest } = e; return rest })
  }

  function handleDrop(ev: React.DragEvent) {
    ev.preventDefault()
    setDragOver(false)
    const f = ev.dataTransfer.files?.[0]
    if (f) handleFileSelect(f)
  }

  async function openExistingReceipt() {
    if (!existingReceipt || openingReceipt) return
    setOpeningReceipt(true)
    const { data, error } = await supabase.storage
      .from('expense-receipts')
      .createSignedUrl(existingReceipt, 300)
    setOpeningReceipt(false)
    if (error || !data?.signedUrl) {
      setErrors(e => ({ ...e, file: 'Impossible d\'ouvrir le justificatif.' }))
      return
    }
    window.open(data.signedUrl, '_blank')
  }

  async function createSupplierInline() {
    const name = supplierQuery.trim()
    if (!name || !clubId) return
    setCreatingSupplier(true)
    const { data, error } = await supabase
      .from('suppliers')
      .insert({ name, active: true })
      .select('id')
      .single()
    setCreatingSupplier(false)
    if (error) {
      setErrors(e => ({ ...e, supplier: error.message }))
      return
    }
    setSupplierId(data.id)
    setSupplierOpen(false)
    onSuppliersChanged()
  }

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!isLocked) {
      if (!date) errs.date = 'Date obligatoire.'
      const num = parseFloat(amount)
      if (!amount || isNaN(num) || num <= 0) errs.amount = 'Montant obligatoire (> 0).'
      if (!file && !existingReceipt) errs.file = 'Justificatif obligatoire.'
    }
    if (!description.trim()) errs.description = 'Description obligatoire.'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSave() {
    if (!validate() || !clubId) return
    setSaving(true)
    setErrors({})

    let receiptPath = existingReceipt
    let oldReceiptPath: string | null = null

    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf'
      const safeName = `${clubId}/${safeUUID()}.${ALLOWED_EXT.includes(ext) ? ext : 'pdf'}`
      const { error: uploadErr } = await supabase.storage
        .from('expense-receipts')
        .upload(safeName, file, { contentType: file.type, upsert: false })
      if (uploadErr) {
        setSaving(false)
        setErrors({ file: `Erreur d'envoi : ${uploadErr.message}` })
        return
      }
      oldReceiptPath = expense ? existingReceipt : null
      receiptPath = safeName
    }

    const payload: Record<string, unknown> = {
      group_id: groupId || null,
      supplier_id: supplierId || null,
      description: description.trim(),
      team_id: attachType === 'team' && teamId ? teamId : null,
      event_id: attachType === 'event' && eventId ? eventId : null,
      reimbursed_to_coach_id: coachId || null,
    }
    if (!isLocked) {
      payload.expense_date = date
      payload.amount = parseFloat(amount)
      payload.receipt_path = receiptPath
    }

    let dbError
    if (expense) {
      ;({ error: dbError } = await supabase
        .from('expenses')
        .update(payload)
        .eq('id', expense.id))
    } else {
      payload.status = 'recorded'
      ;({ error: dbError } = await supabase
        .from('expenses')
        .insert(payload))
    }

    if (dbError) {
      if (file && receiptPath && receiptPath !== existingReceipt) {
        await supabase.storage.from('expense-receipts').remove([receiptPath])
      }
      setSaving(false)
      setErrors({ save: dbError.message })
      return
    }

    if (file && oldReceiptPath) {
      await supabase.storage.from('expense-receipts').remove([oldReceiptPath])
    }

    setSaving(false)
    onSaved()
  }

  /* ───── workflow transitions ───── */

  async function handleApprove() {
    if (!expense) return
    if (!groupId) {
      setErrors(e => ({ ...e, approve: 'Sélectionnez un compte avant d\'approuver.' }))
      compteRef.current?.focus()
      return
    }
    setTransitioning(true)
    setErrors({})
    const payload: Record<string, unknown> = {
      status: 'approved',
      group_id: groupId || null,
      rejected_reason: null,
    }
    const { error } = await supabase.from('expenses').update(payload).eq('id', expense.id)
    setTransitioning(false)
    if (error) { setErrors({ approve: error.message }); return }
    showToast('Dépense approuvée.', 'success')
    onStatusChanged()
  }

  async function handleReject() {
    if (!expense) return
    if (!rejectReason.trim()) {
      setErrors(e => ({ ...e, reject: 'Le motif du refus est obligatoire.' }))
      return
    }
    setTransitioning(true)
    setErrors({})
    const { error } = await supabase
      .from('expenses')
      .update({ status: 'rejected', rejected_reason: rejectReason.trim() })
      .eq('id', expense.id)
    setTransitioning(false)
    if (error) { setErrors({ reject: error.message }); return }
    showToast('Dépense refusée.', 'success')
    onStatusChanged()
  }

  async function handleReimburse() {
    if (!expense) return
    setTransitioning(true)
    setErrors({})
    const { error } = await supabase
      .from('expenses')
      .update({ status: 'reimbursed' })
      .eq('id', expense.id)
    setTransitioning(false)
    if (error) { setErrors({ approve: error.message }); return }
    showToast('Dépense marquée remboursée.', 'success')
    onStatusChanged()
  }

  async function handleDeleteExpense() {
    if (!expense) return
    setDeletingExpense(true)
    setErrors({})
    if (expense.receipt_path) {
      const { error: rmErr } = await supabase.storage
        .from('expense-receipts')
        .remove([expense.receipt_path])
      if (rmErr) {
        setDeletingExpense(false)
        setErrors({ delete: `Erreur suppression justificatif : ${rmErr.message}` })
        return
      }
    }
    const { error } = await supabase.from('expenses').delete().eq('id', expense.id)
    setDeletingExpense(false)
    if (error) {
      setErrors({ delete: error.message })
      return
    }
    showToast('Dépense supprimée.', 'success')
    setDeleteConfirmOpen(false)
    onDeleted()
  }

  useEffect(() => {
    function onClickOutside(ev: MouseEvent) {
      if (supplierRef.current && !supplierRef.current.contains(ev.target as Node)) {
        setSupplierOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  if (!isOpen) return null

  const status = expense?.status ?? null
  const isEdit = !!expense
  const isLocked = status === 'reimbursed' || status === 'recorded'

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    border: '1px solid var(--border-color)', background: 'var(--bg-hover)',
    color: 'var(--text-primary)', fontSize: '14px',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '13px',
    color: 'var(--text-muted)', marginBottom: '6px',
  }
  const errStyle: React.CSSProperties = {
    color: 'var(--danger)', fontSize: '12px', marginTop: '4px',
  }

  const title = expense
    ? `Dépense N° ${String(expense.expense_number).padStart(5, '0')}`
    : 'Nouvelle dépense'

  return (
    <>
      {/* backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* drawer */}
      <div
        className="fixed inset-y-0 right-0 w-full sm:w-[480px] shadow-xl z-50 flex flex-col animate-slide-in"
        style={{ background: 'var(--bg-card)' }}
      >
        {/* header */}
        <div
          className="sticky top-0 px-6 py-4 flex items-center justify-between"
          style={{ background: 'var(--bg-modal-header)', flexShrink: 0 }}
        >
          <h2 className="text-xl font-semibold" style={{ color: 'var(--text-modal-header)' }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:opacity-80 transition-opacity"
            style={{ color: 'var(--text-modal-header)' }}
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
        </div>

        {/* scrollable body */}
        <div className="flex-1 overflow-y-auto p-6">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* rejected_reason alert */}
            {isEdit && status === 'rejected' && expense.rejected_reason && (
              <div style={{
                display: 'flex', gap: '10px', padding: '12px 14px',
                borderRadius: '8px', background: 'var(--danger-soft)',
                border: '1px solid var(--danger)',
              }}>
                <AlertTriangle size={18} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '1px' }} />
                <div>
                  <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--danger)' }}>Motif du refus</p>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5 }}>{expense.rejected_reason}</p>
                </div>
              </div>
            )}

            {/* context info lines */}
            {isEdit && (createdByName || coachName) && (
              <div style={{
                display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px 14px',
                borderRadius: '8px', background: 'var(--bg-hover)',
                border: '1px solid var(--border-color)',
              }}>
                {createdByName && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    <User size={14} style={{ flexShrink: 0 }} />
                    <span>Soumis par <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{createdByName}</strong>{createdAt ? `, le ${new Date(createdAt).toLocaleDateString('fr-CH')}` : ''}</span>
                  </div>
                )}
                {coachName && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    <Info size={14} style={{ flexShrink: 0 }} />
                    <span>À rembourser à <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{coachName}</strong></span>
                  </div>
                )}
              </div>
            )}

            {/* N° */}
            <div>
              <label style={labelStyle}>N° de dépense</label>
              <input
                style={{ ...inputStyle, background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
                value={expense ? String(expense.expense_number).padStart(5, '0') : 'Attribué automatiquement'}
                disabled
              />
            </div>

            {/* Date */}
            <div>
              <label style={labelStyle}>Date *</label>
              <input
                type="date"
                style={{ ...inputStyle, ...(isLocked ? { background: 'var(--bg-hover)', color: 'var(--text-muted)' } : {}) }}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={isLocked}
              />
              {errors.date && <p style={errStyle}>{errors.date}</p>}
            </div>

            {/* Compte */}
            <div>
              <label style={labelStyle}>Compte</label>
              <select
                ref={compteRef}
                style={{
                  ...inputStyle,
                  borderColor: errors.approve ? 'var(--danger)' : undefined,
                }}
                value={groupId}
                onChange={(e) => {
                  setGroupId(e.target.value)
                  setErrors(prev => { const { approve: _, ...rest } = prev; return rest })
                }}
              >
                <option value="">— Aucun —</option>
                {[...groups].filter(g => g.active || g.id === groupId).sort((a, b) => (a.account_number || '').localeCompare(b.account_number || '')).map(g => (
                  <option key={g.id} value={g.id}>{g.name}{g.account_number ? ` — ${g.account_number}` : ''}</option>
                ))}
              </select>
              {selectedGroup?.account_number && (
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Compte : {selectedGroup.account_number}
                </p>
              )}
              {errors.approve && <p style={errStyle}>{errors.approve}</p>}
            </div>

            {/* Fournisseur (autocomplete) */}
            <div ref={supplierRef} style={{ position: 'relative' }}>
              <label style={labelStyle}>Fournisseur</label>
              <input
                style={inputStyle}
                value={supplierQuery}
                onChange={(e) => {
                  setSupplierQuery(e.target.value)
                  setSupplierId('')
                  setSupplierOpen(true)
                }}
                onFocus={() => setSupplierOpen(true)}
                placeholder="Rechercher ou créer…"
              />
              {supplierOpen && (filteredSuppliers.length > 0 || showCreateOption) && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                  background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                  borderRadius: '8px', marginTop: '4px', maxHeight: '200px', overflowY: 'auto',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                }}>
                  {filteredSuppliers.map(s => (
                    <div
                      key={s.id}
                      onClick={() => {
                        setSupplierId(s.id)
                        setSupplierQuery(s.name)
                        setSupplierOpen(false)
                      }}
                      style={{
                        padding: '8px 12px', cursor: 'pointer', fontSize: '14px',
                        color: 'var(--text-primary)',
                        background: s.id === supplierId ? 'var(--bg-hover)' : 'transparent',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = s.id === supplierId ? 'var(--bg-hover)' : 'transparent' }}
                    >
                      {s.name}
                    </div>
                  ))}
                  {showCreateOption && (
                    <div
                      onClick={createSupplierInline}
                      style={{
                        padding: '8px 12px', cursor: 'pointer', fontSize: '14px',
                        color: 'var(--accent)', fontWeight: 500,
                        borderTop: filteredSuppliers.length > 0 ? '1px solid var(--border-color)' : 'none',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      {creatingSupplier ? 'Création…' : `Créer « ${supplierQuery.trim()} »`}
                    </div>
                  )}
                </div>
              )}
              {errors.supplier && <p style={errStyle}>{errors.supplier}</p>}
            </div>

            {/* Rattachement */}
            <div>
              <label style={labelStyle}>Rattachement</label>
              <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                {(['none', 'team', 'event'] as AttachType[]).map(t => {
                  const labels: Record<AttachType, string> = { none: 'Aucun', team: 'Équipe', event: 'Événement' }
                  const active = attachType === t
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setAttachType(t)
                        if (t !== 'team') setTeamId('')
                        if (t !== 'event') setEventId('')
                      }}
                      style={{
                        flex: 1, padding: '8px 4px', fontSize: '13px', fontWeight: 500,
                        border: 'none', cursor: 'pointer',
                        background: active ? 'var(--accent)' : 'var(--bg-hover)',
                        color: active ? '#fff' : 'var(--text-secondary)',
                        transition: 'background 0.15s, color 0.15s',
                      }}
                    >
                      {labels[t]}
                    </button>
                  )
                })}
              </div>
              {attachType === 'team' && (
                <select
                  style={{ ...inputStyle, marginTop: '8px' }}
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                >
                  <option value="">— Choisir une équipe —</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
              {attachType === 'event' && (
                <select
                  style={{ ...inputStyle, marginTop: '8px' }}
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                >
                  <option value="">— Choisir un événement —</option>
                  {events.map(ev => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title} ({new Date(ev.date).toLocaleDateString('fr-CH')})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* À rembourser à */}
            <div>
              <label style={labelStyle}>À rembourser à</label>
              <select
                style={inputStyle}
                value={coachId}
                onChange={(e) => setCoachId(e.target.value)}
              >
                <option value="">— Aucun —</option>
                {coaches.map(c => (
                  <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                ))}
              </select>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Pour les notes de frais avancées par un entraîneur.
              </p>
            </div>

            {/* Description */}
            <div>
              <label style={labelStyle}>Description *</label>
              <input
                style={inputStyle}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Achat de ballons"
              />
              {errors.description && <p style={errStyle}>{errors.description}</p>}
            </div>

            {/* Montant */}
            <div>
              <label style={labelStyle}>Montant (CHF) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                style={{ ...inputStyle, ...(isLocked ? { background: 'var(--bg-hover)', color: 'var(--text-muted)' } : {}) }}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                disabled={isLocked}
              />
              {errors.amount && <p style={errStyle}>{errors.amount}</p>}
              {isLocked && (
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Montant, date et justificatif verrouillés : dépense {status === 'reimbursed' ? 'remboursée' : 'comptabilisée'}
                </p>
              )}
            </div>

            {/* Justificatif */}
            <div>
              <label style={labelStyle}>Justificatif *</label>
              {isLocked ? (
                existingReceipt ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                    borderRadius: '8px', border: '1px solid var(--border-color)',
                    background: 'var(--bg-hover)',
                  }}>
                    <FileText size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <button
                      type="button"
                      onClick={openExistingReceipt}
                      disabled={openingReceipt}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                        fontSize: '13px', color: 'var(--accent)', flex: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        textAlign: 'left', textDecoration: 'underline', textUnderlineOffset: '2px',
                      }}
                      title="Ouvrir le justificatif"
                    >
                      {openingReceipt ? 'Ouverture…' : 'Justificatif existant'}
                    </button>
                    <button
                      type="button"
                      onClick={openExistingReceipt}
                      disabled={openingReceipt}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                        color: 'var(--accent)', display: 'flex', borderRadius: '6px', flexShrink: 0,
                      }}
                      title="Ouvrir"
                    >
                      <ExternalLink size={15} />
                    </button>
                  </div>
                ) : (
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Aucun justificatif</p>
                )
              ) : (
                <>
                  {(file || existingReceipt) ? (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                      borderRadius: '8px', border: '1px solid var(--border-color)',
                      background: 'var(--bg-hover)',
                    }}>
                      <FileText size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      {!file && existingReceipt ? (
                        <button
                          type="button"
                          onClick={openExistingReceipt}
                          disabled={openingReceipt}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                            fontSize: '13px', color: 'var(--accent)', flex: 1,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            textAlign: 'left', textDecoration: 'underline', textUnderlineOffset: '2px',
                          }}
                          title="Ouvrir le justificatif"
                        >
                          {openingReceipt ? 'Ouverture…' : 'Justificatif existant'}
                        </button>
                      ) : (
                        <span style={{ fontSize: '13px', color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {file!.name}
                        </span>
                      )}
                      {!file && existingReceipt && (
                        <button
                          type="button"
                          onClick={openExistingReceipt}
                          disabled={openingReceipt}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                            color: 'var(--accent)', display: 'flex', borderRadius: '6px', flexShrink: 0,
                          }}
                          title="Ouvrir"
                        >
                          <ExternalLink size={15} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { setFile(null); if (!file) setExistingReceipt(null) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)', display: 'flex', flexShrink: 0 }}
                        title="Retirer"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        padding: '24px', borderRadius: '8px', textAlign: 'center', cursor: 'pointer',
                        border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border-color)'}`,
                        background: dragOver ? 'var(--bg-hover)' : 'transparent',
                        transition: 'border-color 0.15s, background 0.15s',
                      }}
                    >
                      <Upload size={24} style={{ color: 'var(--text-muted)', margin: '0 auto 8px' }} />
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                        Glissez un fichier ici ou cliquez pour choisir
                      </p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                        PDF, PNG ou JPG — max 10 Mo
                      </p>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    style={{ display: 'none' }}
                    onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
                  />
                </>
              )}
              {errors.file && <p style={errStyle}>{errors.file}</p>}
            </div>

            {/* rejection textarea (inline step) */}
            {rejectMode && (
              <div style={{
                padding: '14px', borderRadius: '8px',
                border: '1px solid var(--danger)', background: 'var(--danger-soft)',
              }}>
                <label style={{ ...labelStyle, color: 'var(--danger)', fontWeight: 600 }}>Motif du refus *</label>
                <textarea
                  style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
                  value={rejectReason}
                  onChange={(e) => {
                    setRejectReason(e.target.value)
                    setErrors(prev => { const { reject: _, ...rest } = prev; return rest })
                  }}
                  placeholder="Expliquez le motif du refus…"
                  autoFocus
                />
                {errors.reject && <p style={errStyle}>{errors.reject}</p>}
                <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                  <Button variant="secondary" onClick={() => { setRejectMode(false); setRejectReason('') }} className="flex-1">
                    Annuler
                  </Button>
                  <Button variant="destructive" onClick={handleReject} disabled={transitioning} className="flex-1">
                    {transitioning ? 'Refus…' : 'Confirmer le refus'}
                  </Button>
                </div>
              </div>
            )}

            {errors.save && (
              <p style={{ color: 'var(--danger)', fontSize: '13px', margin: 0 }}>{errors.save}</p>
            )}
            {errors.delete && (
              <p style={{ color: 'var(--danger)', fontSize: '13px', margin: 0 }}>{errors.delete}</p>
            )}
          </div>
        </div>

        {/* footer */}
        <div
          className="px-6 py-4 flex flex-col gap-3"
          style={{ borderTop: '1px solid var(--border-color)', flexShrink: 0 }}
        >
          {/* workflow actions */}
          {isEdit && (status === 'submitted' || status === 'rejected') && !rejectMode && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <Button onClick={handleApprove} disabled={transitioning || saving} className="flex-1">
                {transitioning ? 'Approbation…' : 'Approuver'}
              </Button>
              {status === 'submitted' && (
                <Button variant="destructive" onClick={() => setRejectMode(true)} disabled={transitioning || saving} className="flex-1">
                  Refuser
                </Button>
              )}
            </div>
          )}

          {isEdit && status === 'approved' && (
            <Button onClick={handleReimburse} disabled={transitioning || saving} style={{ width: '100%' }}>
              {transitioning ? 'Mise à jour…' : 'Marquer remboursée'}
            </Button>
          )}

          {/* save + close row */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <Button variant="secondary" onClick={onClose} className="flex-1">Annuler</Button>
            <Button onClick={handleSave} disabled={saving || transitioning} className="flex-1">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>

          {/* delete */}
          {isEdit && !isLocked && (
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={deletingExpense || transitioning || saving}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--danger)', fontSize: '13px', fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: '6px',
                justifyContent: 'center', padding: '6px 0',
                opacity: (deletingExpense || transitioning || saving) ? 0.5 : 1,
              }}
            >
              <Trash2 size={14} /> Supprimer cette dépense
            </button>
          )}
        </div>
      </div>

      {/* delete confirmation */}
      {deleteConfirmOpen && (
        <ConfirmModal
          isOpen
          title="Supprimer cette dépense ?"
          message="Cette action est définitive, le justificatif sera supprimé."
          confirmLabel="Supprimer"
          confirmStyle="danger"
          loading={deletingExpense}
          loadingLabel="Suppression…"
          onConfirm={handleDeleteExpense}
          onCancel={() => setDeleteConfirmOpen(false)}
        />
      )}
    </>
  )
}
