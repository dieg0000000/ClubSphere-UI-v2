import { useState, useEffect, useCallback, useMemo } from 'react'
import { reportLoadError } from '../utils/reportLoadError'
import { supabase } from '../lib/supabase'
import { safeUUID } from '../lib/ids'
import { useAuth } from '../context/AuthContext'
import { useTenant } from '../context/TenantContext'
import { useToast } from '../hooks/useToast'
import { Toast } from '../components/Toast'
import { HandCoins, Plus, ArrowLeft, Trash2, Camera, FileText, X } from 'lucide-react'
import Button from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import ConfirmModal from '../components/ConfirmModal'
import { getExpenseStatus, getExpenseRowTint } from '../utils/expenseStatus'

/* ── types ── */

interface ExpenseRow {
  id: string
  expense_number: number
  expense_date: string
  description: string
  amount: number
  status: string
  receipt_path: string | null
  team_id: string | null
  event_id: string | null
  rejected_reason: string | null
  teams: { name: string } | null
  events: { title: string } | null
}

interface TeamOption { id: string; name: string }
interface EventOption { id: string; title: string; date: string }



function padNum(n: number) { return String(n).padStart(5, '0') }

const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 2000
const JPEG_QUALITY = 0.8

function fileExt(name: string) {
  const parts = name.split('.')
  return parts.length > 1 ? parts.pop()!.toLowerCase() : 'bin'
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width <= MAX_IMAGE_DIMENSION && height <= MAX_IMAGE_DIMENSION && file.size <= MAX_FILE_SIZE) {
        resolve(file)
        return
      }
      const ratio = Math.min(MAX_IMAGE_DIMENSION / width, MAX_IMAGE_DIMENSION / height, 1)
      width = Math.round(width * ratio)
      height = Math.round(height * ratio)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('Canvas non disponible')); return }
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('Compression échouée')); return }
          const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
          resolve(compressed)
        },
        'image/jpeg',
        JPEG_QUALITY,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')) }
    img.src = url
  })
}

/* ── main ── */

export default function CoachExpenses() {
  const { user } = useAuth()
  const { clubId } = useTenant()
  const { toast, showToast } = useToast()

  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'form' | 'detail'>('list')
  const [editingExpense, setEditingExpense] = useState<ExpenseRow | null>(null)

  /* reference data */
  const [teams, setTeams] = useState<TeamOption[]>([])
  const [events, setEvents] = useState<EventOption[]>([])
  const [coachTeams, setCoachTeams] = useState<TeamOption[]>([])
  const [defaultCoachTeamId, setDefaultCoachTeamId] = useState<string | null>(null)

  /* form state */
  const [file, setFile] = useState<File | null>(null)
  const [fileSize, setFileSize] = useState<number | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [compressing, setCompressing] = useState(false)
  const [existingReceipt, setExistingReceipt] = useState<string | null>(null)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [attachType, setAttachType] = useState<'none' | 'team' | 'event'>('none')
  const [teamId, setTeamId] = useState('')
  const [eventId, setEventId] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  /* delete */
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  /* ── loaders ── */

  const loadExpenses = useCallback(async () => {
    if (!clubId || !user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('expenses')
      .select('id, expense_number, expense_date, description, amount, status, receipt_path, team_id, event_id, rejected_reason, teams(name), events(title)')
      .eq('club_id', clubId)
      .eq('created_by', user.id)
      .order('expense_date', { ascending: false })
      .order('expense_number', { ascending: false })
    if (error) { showToast(`Erreur : ${error.message}`, 'error'); reportLoadError('CoachExpenses', error) }
    else setExpenses((data as unknown as ExpenseRow[]) || [])
    setLoading(false)
  }, [clubId, user])

  const loadRefs = useCallback(async () => {
    if (!clubId || !user) return
    const [teamsRes, eventsRes, coachRes] = await Promise.all([
      supabase.from('teams').select('id, name, level_rank').eq('club_id', clubId).eq('active', true).order('level_rank').order('name'),
      supabase.from('events').select('id, title, date').eq('club_id', clubId).order('date', { ascending: false }).limit(200),
      supabase.from('coaches').select('id').eq('club_id', clubId).eq('user_id', user.id).is('self_deleted_at', null).limit(1).maybeSingle(),
    ])
    setTeams((teamsRes.data as TeamOption[]) || [])
    setEvents((eventsRes.data as EventOption[]) || [])

    if (coachRes.data) {
      const coachId = coachRes.data.id
      const { data: staffRows } = await supabase
        .from('team_staff')
        .select('role, teams!inner(id, name, level_rank)')
        .eq('coach_id', coachId)
        .order('sort_order')
      const allTeams = (teamsRes.data as TeamOption[]) || []
      const staffTeamIds = new Set((staffRows || []).map((r: any) => r.teams?.id).filter(Boolean))
      const myTeams = allTeams.filter(t => staffTeamIds.has(t.id))
      setCoachTeams(myTeams)
      if (myTeams.length > 0) {
        const principalRow = (staffRows || []).find((r: any) => r.role === 'principal') as any
        const pick = principalRow ? principalRow.teams?.id : myTeams[0].id
        setDefaultCoachTeamId(pick)
      }
    }
  }, [clubId, user])

  useEffect(() => { loadExpenses() }, [loadExpenses])
  useEffect(() => { loadRefs() }, [loadRefs])

  /* ── form helpers ── */

  function resetForm() {
    setFile(null)
    setFileSize(null)
    setFilePreview(null)
    setCompressing(false)
    setExistingReceipt(null)
    setDate(new Date().toISOString().slice(0, 10))
    setAmount('')
    setDescription('')
    setFormError(null)
    if (defaultCoachTeamId) {
      setAttachType('team')
      setTeamId(defaultCoachTeamId)
    } else {
      setAttachType('none')
      setTeamId('')
    }
    setEventId('')
  }

  function openNew() {
    setEditingExpense(null)
    resetForm()
    setView('form')
  }

  function openEdit(exp: ExpenseRow) {
    if (exp.status !== 'submitted') {
      setEditingExpense(exp)
      setView('detail')
      return
    }
    setEditingExpense(exp)
    setDate(exp.expense_date)
    setAmount(String(exp.amount))
    setDescription(exp.description)
    setExistingReceipt(exp.receipt_path)
    setFile(null)
    setFileSize(null)
    setFilePreview(null)
    setFormError(null)
    if (exp.team_id) { setAttachType('team'); setTeamId(exp.team_id); setEventId('') }
    else if (exp.event_id) { setAttachType('event'); setEventId(exp.event_id); setTeamId('') }
    else { setAttachType('none'); setTeamId(''); setEventId('') }
    setView('form')
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowed.includes(f.type)) {
      setFormError('Format accepté : JPG, PNG, WebP ou PDF.')
      return
    }
    if (f.type === 'application/pdf') {
      if (f.size > MAX_FILE_SIZE) {
        setFormError('Le PDF ne doit pas dépasser 10 Mo.')
        return
      }
      setFile(f)
      setFileSize(f.size)
      setFilePreview(null)
      setFormError(null)
      return
    }
    setCompressing(true)
    setFormError(null)
    try {
      const compressed = await compressImage(f)
      if (compressed.size > MAX_FILE_SIZE) {
        setFormError('L\'image est trop volumineuse même après compression.')
        setCompressing(false)
        return
      }
      setFile(compressed)
      setFileSize(compressed.size)
      const url = URL.createObjectURL(compressed)
      setFilePreview(url)
      setCompressing(false)
    } catch (err) {
      setFormError(`Erreur de traitement : ${err instanceof Error ? err.message : 'inconnue'}`)
      setCompressing(false)
    }
  }

  /* ── submit ── */

  async function handleSubmit() {
    setFormError(null)
    if (!file && !existingReceipt) { setFormError('Le justificatif est obligatoire.'); return }
    if (!date) { setFormError('La date est obligatoire.'); return }
    const parsedAmount = parseFloat(amount.replace(',', '.'))
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) { setFormError('Le montant doit être supérieur à 0.'); return }
    if (!description.trim()) { setFormError('La description est obligatoire.'); return }
    if (!clubId) return

    setSaving(true)
    let receiptPath = existingReceipt

    if (file) {
      const ext = fileExt(file.name)
      const path = `${clubId}/${safeUUID()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('expense-receipts')
        .upload(path, file, { contentType: file.type })
      if (upErr) {
        setSaving(false)
        setFormError(`Erreur upload : ${upErr.message}`)
        return
      }
      receiptPath = path
    }

    const payload: Record<string, unknown> = {
      expense_date: date,
      description: description.trim(),
      amount: parsedAmount,
      receipt_path: receiptPath,
      team_id: attachType === 'team' && teamId ? teamId : null,
      event_id: attachType === 'event' && eventId ? eventId : null,
    }

    if (editingExpense) {
      const { error } = await supabase
        .from('expenses')
        .update(payload)
        .eq('id', editingExpense.id)
      if (error) {
        if (file && receiptPath && receiptPath !== existingReceipt) {
          await supabase.storage.from('expense-receipts').remove([receiptPath])
        }
        setSaving(false)
        setFormError(`Erreur : ${error.message}`)
        return
      }
      if (file && existingReceipt && existingReceipt !== receiptPath) {
        await supabase.storage.from('expense-receipts').remove([existingReceipt])
      }
    } else {
      const { error } = await supabase
        .from('expenses')
        .insert(payload)
      if (error) {
        if (receiptPath) {
          await supabase.storage.from('expense-receipts').remove([receiptPath])
        }
        setSaving(false)
        setFormError(`Erreur : ${error.message}`)
        return
      }
    }

    setSaving(false)
    showToast(
      editingExpense ? 'Note de frais mise à jour.' : 'Note de frais envoyée au trésorier.',
      'success'
    )
    setView('list')
    loadExpenses()
  }

  /* ── delete ── */

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    if (deleteTarget.receipt_path) {
      await supabase.storage.from('expense-receipts').remove([deleteTarget.receipt_path])
    }
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', deleteTarget.id)
    setDeleting(false)
    if (error) {
      showToast(`Erreur : ${error.message}`, 'error')
      setDeleteTarget(null)
      return
    }
    showToast('Note de frais supprimée.', 'success')
    setDeleteTarget(null)
    setView('list')
    loadExpenses()
  }

  /* ── receipt URL ── */

  async function openReceipt(path: string) {
    const { data, error } = await supabase.storage
      .from('expense-receipts')
      .createSignedUrl(path, 300)
    if (error || !data?.signedUrl) {
      showToast('Impossible d\'ouvrir le justificatif.', 'error')
      return
    }
    window.open(data.signedUrl, '_blank')
  }

  /* ── sorted events for picker ── */
  const recentEvents = useMemo(() => events.slice(0, 50), [events])

  /* ═══════════ LIST VIEW ═══════════ */

  if (view === 'list') {
    return (
      <div className="p-4 pb-28 w-full max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <HandCoins className="w-5 h-5" style={{ color: 'var(--accent)' }} />
            Notes de frais
          </h1>
          <Button onClick={openNew} leftIcon={<Plus size={18} />} size="sm">
            Nouvelle
          </Button>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '32px 0' }}>Chargement...</p>
        ) : expenses.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '48px 0' }}>Aucune note de frais.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {expenses.map(exp => {
              const st = getExpenseStatus(exp.status)
              return (
                <button
                  key={exp.id}
                  type="button"
                  onClick={() => openEdit(exp)}
                  className="text-left w-full"
                  style={{
                    background: getExpenseRowTint(exp.status) !== 'transparent' ? getExpenseRowTint(exp.status) : 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    transition: 'box-shadow 0.15s',
                  }}
                  onTouchStart={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)' }}
                  onTouchEnd={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {exp.description}
                      </p>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                        {new Date(exp.expense_date).toLocaleDateString('fr-CH')}
                        {exp.teams?.name ? ` · ${exp.teams.name}` : exp.events?.title ? ` · ${exp.events.title}` : ''}
                      </p>
                      {exp.status === 'rejected' && exp.rejected_reason && (
                        <p className="text-xs mt-1.5" style={{ color: 'var(--danger)' }}>
                          Motif : {exp.rejected_reason}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                        {exp.amount.toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
        <Toast toast={toast} />
      </div>
    )
  }

  /* ═══════════ DETAIL VIEW (read-only) ═══════════ */

  if (view === 'detail' && editingExpense) {
    const st = getExpenseStatus(editingExpense.status)
    return (
      <div className="p-4 pb-28 w-full max-w-lg mx-auto">
        <button
          type="button"
          onClick={() => setView('list')}
          className="flex items-center gap-1 mb-4 text-sm"
          style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <ArrowLeft size={16} /> Retour
        </button>

        <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
          N° {padNum(editingExpense.expense_number)}
        </h2>

        <div className="flex flex-col gap-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px' }}>
          <Row label="Date" value={new Date(editingExpense.expense_date).toLocaleDateString('fr-CH')} />
          <Row label="Description" value={editingExpense.description} />
          <Row label="Montant" value={`CHF ${editingExpense.amount.toLocaleString('fr-CH', { minimumFractionDigits: 2 })}`} />
          <Row label="Rattachement" value={editingExpense.teams?.name || editingExpense.events?.title || '—'} />
          <div>
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Statut</span>
            <div className="mt-1">
              <Badge variant={st.variant}>{st.label}</Badge>
            </div>
          </div>
          {editingExpense.status === 'rejected' && editingExpense.rejected_reason && (
            <div>
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Motif du refus</span>
              <p className="text-sm mt-1" style={{ color: 'var(--danger)' }}>{editingExpense.rejected_reason}</p>
            </div>
          )}
          {editingExpense.receipt_path && (
            <button
              type="button"
              onClick={() => openReceipt(editingExpense.receipt_path!)}
              className="text-sm font-medium flex items-center gap-1"
              style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <FileText size={14} /> Voir le justificatif
            </button>
          )}
        </div>
        <Toast toast={toast} />
      </div>
    )
  }

  /* ═══════════ FORM VIEW ═══════════ */

  const segBtnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '8px 4px',
    fontSize: '13px',
    fontWeight: active ? 600 : 400,
    textAlign: 'center',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#fff' : 'var(--text-secondary)',
    transition: 'all 0.15s',
  })

  return (
    <div className="p-4 pb-28 w-full max-w-lg mx-auto">
      <button
        type="button"
        onClick={() => setView('list')}
        className="flex items-center gap-1 mb-4 text-sm"
        style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <ArrowLeft size={16} /> Retour
      </button>

      <h2 className="text-lg font-bold mb-5" style={{ color: 'var(--text-primary)' }}>
        {editingExpense ? `Modifier N° ${padNum(editingExpense.expense_number)}` : 'Nouvelle note de frais'}
      </h2>

      <div className="flex flex-col gap-5">

        {/* Justificatif */}
        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
            Justificatif <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          {compressing ? (
            <div style={{ textAlign: 'center', padding: '24px 16px', borderRadius: '10px', border: '2px dashed var(--border-color)', background: 'var(--bg-hover)' }}>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Compression en cours...</p>
            </div>
          ) : (file || existingReceipt) ? (
            <div className="flex items-center gap-3" style={{
              background: 'var(--bg-hover)', borderRadius: '10px', padding: '10px 12px',
              border: '1px solid var(--border-color)',
            }}>
              {filePreview ? (
                <img src={filePreview} alt="Aperçu" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px' }} />
              ) : (
                <div style={{ width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-card)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <FileText size={20} style={{ color: 'var(--text-muted)' }} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <span className="text-sm truncate block" style={{ color: 'var(--text-primary)' }}>
                  {file ? file.name : 'Justificatif existant'}
                </span>
                {fileSize != null && (
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatFileSize(fileSize)}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setFile(null); setFileSize(null); setFilePreview(null); setExistingReceipt(null) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>
          ) : (
            <label style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: '8px', padding: '24px 16px', borderRadius: '10px', cursor: 'pointer',
              border: '2px dashed var(--border-color)', background: 'var(--bg-hover)',
              transition: 'border-color 0.15s',
            }}>
              <Camera size={28} style={{ color: 'var(--accent)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
                Prendre en photo ou choisir un fichier
              </span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                JPG, PNG, PDF — max 10 Mo
              </span>
              <input
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </label>
          )}
        </div>

        {/* Date */}
        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
            Date <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full"
            style={{
              padding: '10px 12px', borderRadius: '8px', fontSize: '14px',
              border: '1px solid var(--border-color)', background: 'var(--bg-input, var(--bg-card))',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Montant */}
        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
            Montant (CHF) <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full"
            style={{
              padding: '10px 12px', borderRadius: '8px', fontSize: '14px',
              border: '1px solid var(--border-color)', background: 'var(--bg-input, var(--bg-card))',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
            Description <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Ex : Repas équipe après match"
            rows={2}
            className="w-full"
            style={{
              padding: '10px 12px', borderRadius: '8px', fontSize: '14px', resize: 'vertical',
              border: '1px solid var(--border-color)', background: 'var(--bg-input, var(--bg-card))',
              color: 'var(--text-primary)', fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Rattachement */}
        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
            Rattachement
          </label>
          <div className="flex gap-1 p-1" style={{ background: 'var(--bg-hover)', borderRadius: '10px' }}>
            <button type="button" style={segBtnStyle(attachType === 'none')} onClick={() => { setAttachType('none'); setTeamId(''); setEventId('') }}>Aucun</button>
            <button type="button" style={segBtnStyle(attachType === 'team')} onClick={() => { setAttachType('team'); setEventId('') }}>Équipe</button>
            <button type="button" style={segBtnStyle(attachType === 'event')} onClick={() => { setAttachType('event'); setTeamId('') }}>Événement</button>
          </div>
          {attachType === 'team' && (
            <select
              value={teamId}
              onChange={e => setTeamId(e.target.value)}
              className="w-full mt-2"
              style={{
                padding: '10px 12px', borderRadius: '8px', fontSize: '14px',
                border: '1px solid var(--border-color)', background: 'var(--bg-input, var(--bg-card))',
                color: 'var(--text-primary)',
              }}
            >
              <option value="">Choisir une équipe…</option>
              {(coachTeams.length > 0 ? coachTeams : teams).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          {attachType === 'event' && (
            <select
              value={eventId}
              onChange={e => setEventId(e.target.value)}
              className="w-full mt-2"
              style={{
                padding: '10px 12px', borderRadius: '8px', fontSize: '14px',
                border: '1px solid var(--border-color)', background: 'var(--bg-input, var(--bg-card))',
                color: 'var(--text-primary)',
              }}
            >
              <option value="">Choisir un événement…</option>
              {recentEvents.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {new Date(ev.date).toLocaleDateString('fr-CH')} — {ev.title}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Error */}
        {formError && (
          <p className="text-sm" style={{ color: 'var(--danger)', margin: 0 }}>{formError}</p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {editingExpense && (
            <Button
              variant="secondary"
              onClick={() => setDeleteTarget(editingExpense)}
              className="shrink-0"
              leftIcon={<Trash2 size={16} />}
            >
              Supprimer
            </Button>
          )}
          <Button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1"
          >
            {saving ? 'Envoi…' : editingExpense ? 'Enregistrer' : 'Envoyer'}
          </Button>
        </div>
      </div>

      {deleteTarget && (
        <ConfirmModal
          isOpen
          title="Supprimer cette note de frais ?"
          message="Cette action est irréversible."
          confirmLabel="Supprimer"
          confirmStyle="danger"
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      <Toast toast={toast} />
    </div>
  )
}

/* ── small helper ── */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <p className="text-sm mt-0.5" style={{ color: 'var(--text-primary)', margin: 0 }}>{value}</p>
    </div>
  )
}
