import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { invokeFunction } from '../lib/invokeFunction'
import { useTenant } from '../context/TenantContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../hooks/useToast'
import {
  ChevronLeft, Headset, X, Paperclip, Camera, Trash2, FileText,
} from 'lucide-react'
import { Badge, type BadgeVariant } from '../components/ui/Badge'

/* ── types ── */

interface SupportTicket {
  id: string
  ticket_number: number
  created_at: string
  title: string
  description: string
  attachments: { path: string; name: string }[] | null
  status: string
  ticket_type?: 'incident' | 'improvement'
  closed_at: string | null
  closure_message: string | null
}

/* ── helpers ── */

function statusLabel(s: string): string {
  if (s === 'closed') return 'Clôturé'
  return 'Ouvert'
}
function statusVariant(s: string): BadgeVariant {
  if (s === 'closed') return 'green'
  return 'orange'
}
function typeLabel(t?: string): string {
  if (t === 'improvement') return 'Amélioration'
  return 'Incident'
}
function typeVariant(t?: string): BadgeVariant {
  if (t === 'improvement') return 'blue'
  return 'red'
}

const MONTHS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
const MONTHS_SHORT = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.']

function formatTicketNumber(n: number): string {
  return `I${String(n).padStart(6, '0')}`
}
function formatDateShort(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`
}
function formatDateFR(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
function formatDateTimeFR(iso: string): string {
  const d = new Date(iso)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} à ${h}:${m}`
}

/* image compression: 2000px max, JPEG 0.8 */
const MAX_DIM = 2000
const JPEG_Q = 0.8

function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { resolve(file); return }
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width <= MAX_DIM && height <= MAX_DIM && file.size <= 5 * 1024 * 1024) { resolve(file); return }
      const ratio = Math.min(MAX_DIM / width, MAX_DIM / height, 1)
      width = Math.round(width * ratio)
      height = Math.round(height * ratio)
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }))
        },
        'image/jpeg',
        JPEG_Q,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')) }
    img.src = url
  })
}

/* ── main ── */

export default function CommitteeMobileSupport() {
  const { clubId } = useTenant()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [rows, setRows] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<SupportTicket | null>(null)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    if (!clubId) return
    setLoading(true)
    const { data } = await supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false })
    setRows((data || []) as SupportTicket[])
    setLoading(false)
  }, [clubId])

  useEffect(() => { load() }, [load])

  const handleCreated = useCallback((ticketNumber: number) => {
    showToast(`Demande ${ticketNumber} envoyée`, 'success')
    setShowForm(false)
    load()
  }, [load, showToast])

  /* ── render ── */

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <div className="animate-spin" style={{ width: 24, height: 24, border: '2.5px solid var(--border-color)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 500, margin: '0 auto', paddingBottom: '80px' }}>
      <button
        type="button"
        onClick={() => navigate('/dashboard')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: 'var(--accent)', fontSize: '14px', fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: '12px' }}
      >
        <ChevronLeft size={16} /> Accueil
      </button>

      <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
        Support
      </h1>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
        {rows.length} demande{rows.length !== 1 ? 's' : ''} de support
      </p>

      {rows.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '48px 24px', textAlign: 'center' }}>
          <Headset size={40} style={{ margin: '0 auto 12px', color: 'var(--text-muted)', display: 'block' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>Aucune demande de support</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
          {rows.map(r => {
            const borderColor = r.ticket_type === 'improvement' ? 'var(--info, #3b82f6)' : 'var(--danger, #ef4444)'
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelected(r)}
                style={{
                  display: 'block',
                  padding: '12px 14px', background: 'var(--bg-card)',
                  border: 'none', borderLeft: `3px solid ${borderColor}`,
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {formatTicketNumber(r.ticket_number)}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {formatDateShort(r.created_at)}
                  </span>
                </div>
                <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.title}
                </p>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <Badge variant={typeVariant(r.ticket_type)}>{typeLabel(r.ticket_type)}</Badge>
                  <Badge variant={statusVariant(r.status)}>{statusLabel(r.status)}</Badge>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Sticky new-ticket button */}
      <div style={{ position: 'fixed', bottom: '72px', left: 0, right: 0, padding: '0 16px', zIndex: 40, display: 'flex', justifyContent: 'center' }}>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          style={{
            width: '100%', maxWidth: 500, padding: '14px', borderRadius: '12px', border: 'none',
            background: 'var(--accent)', color: '#fff',
            fontSize: '15px', fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.12)',
          }}
        >
          Nouvelle demande
        </button>
      </div>

      {selected && (
        <DetailSheet ticket={selected} onClose={() => setSelected(null)} />
      )}

      {showForm && (
        <NewTicketSheet
          onClose={() => setShowForm(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}

/* ═══════ DETAIL SHEET ═══════ */

function DetailSheet({ ticket, onClose }: { ticket: SupportTicket; onClose: () => void }) {
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!ticket.attachments?.length) return
    const load = async () => {
      const urls: Record<string, string> = {}
      for (const att of ticket.attachments!) {
        const { data } = await supabase.storage
          .from('support-attachments')
          .createSignedUrl(att.path, 300)
        if (data?.signedUrl) urls[att.path] = data.signedUrl
      }
      setAttachmentUrls(urls)
    }
    load()
  }, [ticket.attachments])

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column' }}
      onClick={onClose}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
      <div
        style={{
          position: 'relative', marginTop: 'auto', background: 'var(--bg-card)',
          borderRadius: '16px 16px 0 0', padding: '20px', maxHeight: '85vh', overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-color)', margin: '0 auto 16px' }} />
        <button
          type="button" onClick={onClose}
          style={{
            position: 'absolute', top: '16px', right: '16px',
            background: 'var(--bg-hover)', border: 'none', borderRadius: '50%',
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--text-secondary)',
          }}
        >
          <X size={16} />
        </button>

        <p style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)', fontWeight: 600, margin: '0 0 4px', paddingRight: '40px' }}>
          {formatTicketNumber(ticket.ticket_number)}
        </p>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px', paddingRight: '40px' }}>
          {ticket.title}
        </h2>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <Badge variant={typeVariant(ticket.ticket_type)}>{typeLabel(ticket.ticket_type)}</Badge>
          <Badge variant={statusVariant(ticket.status)}>{statusLabel(ticket.status)}</Badge>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
          <InfoRow label="Date" value={formatDateTimeFR(ticket.created_at)} />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>Description</p>
          <div style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap', background: 'var(--bg-hover)', borderRadius: '8px', padding: '12px' }}>
            {ticket.description}
          </div>
        </div>

        {/* Attachments */}
        {ticket.attachments && ticket.attachments.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
              Pièces jointes ({ticket.attachments.length})
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {ticket.attachments.map((att, i) => {
                const url = attachmentUrls[att.path]
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!url}
                    onClick={() => url && window.open(url, '_blank')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '10px 12px', borderRadius: '8px',
                      border: '1px solid var(--border-color)', background: 'var(--bg-hover)',
                      cursor: url ? 'pointer' : 'default', width: '100%', textAlign: 'left',
                      opacity: url ? 1 : 0.5,
                    }}
                  >
                    <FileText size={16} style={{ flexShrink: 0, color: 'var(--accent)' }} />
                    <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {att.name}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Closure message */}
        {ticket.status === 'closed' && ticket.closure_message && (
          <div style={{
            background: 'var(--success-soft)', border: '1px solid var(--success)',
            borderRadius: '10px', padding: '14px', marginBottom: '16px',
          }}>
            <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--success-text)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Réponse de ClubSphere
            </p>
            <p style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>
              {ticket.closure_message}
            </p>
            {ticket.closed_at && (
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', margin: '8px 0 0' }}>
                {formatDateTimeFR(ticket.closed_at)}
              </p>
            )}
          </div>
        )}

        <button
          type="button" onClick={onClose}
          style={{
            width: '100%', padding: '12px', borderRadius: '10px',
            border: '1px solid var(--border-color)', background: 'var(--bg-card)',
            color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
          }}
        >
          Fermer
        </button>
      </div>
    </div>
  )
}

/* ═══════ NEW TICKET SHEET ═══════ */

function NewTicketSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (n: number) => void }) {
  const { clubId } = useTenant()
  const { user } = useAuth()
  const [ticketType, setTicketType] = useState<'incident' | 'improvement'>('incident')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  function addFiles(fl: FileList | null) {
    if (!fl) return
    const arr = Array.from(fl)
    setFiles(prev => {
      const remaining = 3 - prev.length
      return remaining > 0 ? [...prev, ...arr.slice(0, remaining)] : prev
    })
  }

  function removeFile(idx: number) {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit() {
    if (!title.trim() || !description.trim()) return
    if (!user || !clubId) return
    setSaving(true)
    setErrorMsg('')

    try {
      const attachments: { path: string; name: string }[] = []

      for (const f of files) {
        const compressed = await compressImage(f)
        const path = `${user.id}/${Date.now()}-${compressed.name}`
        const { error: upErr } = await supabase.storage
          .from('support-attachments')
          .upload(path, compressed)
        if (upErr) throw new Error(`Upload échoué: ${upErr.message}`)
        attachments.push({ path, name: f.name })
      }

      const { data, error } = await invokeFunction('submit-support-ticket', {
        body: { title: title.trim(), description: description.trim(), ticket_type: ticketType, attachments, club_id: clubId },
      })

      if (error) throw new Error(error)
      if (data?.error) throw new Error(data.error)

      const ticketNumber = data?.ticket_number || '?'
      onCreated(ticketNumber)
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur inattendue')
    } finally {
      setSaving(false)
    }
  }

  const canSubmit = title.trim() && description.trim() && !saving

  const segBtn = (type: 'incident' | 'improvement', label: string) => {
    const active = ticketType === type
    return (
      <button
        type="button"
        onClick={() => setTicketType(type)}
        style={{
          flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
          background: active ? 'var(--accent)' : 'var(--bg-hover)',
          color: active ? '#fff' : 'var(--text-secondary)',
          fontSize: '13px', fontWeight: 600, cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column' }}
      onClick={onClose}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
      <div
        style={{
          position: 'relative', marginTop: 'auto', background: 'var(--bg-card)',
          borderRadius: '16px 16px 0 0', padding: '20px', maxHeight: '90vh', overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-color)', margin: '0 auto 16px' }} />
        <button
          type="button" onClick={onClose}
          style={{
            position: 'absolute', top: '16px', right: '16px',
            background: 'var(--bg-hover)', border: 'none', borderRadius: '50%',
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--text-secondary)',
          }}
        >
          <X size={16} />
        </button>

        <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px', paddingRight: '40px' }}>
          Nouvelle demande
        </h2>

        {/* Type segmented */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', background: 'var(--bg-hover)', borderRadius: '10px', padding: '4px' }}>
          {segBtn('incident', 'Problème')}
          {segBtn('improvement', 'Amélioration')}
        </div>

        {/* Title */}
        <div style={{ marginBottom: '14px' }}>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
            Titre *
          </p>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Résumé court du problème"
            style={{
              width: '100%', padding: '10px 12px', borderRadius: '8px',
              border: '1px solid var(--border-color)', fontSize: '14px',
              background: 'var(--bg-card)', color: 'var(--text-primary)', fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Description */}
        <div style={{ marginBottom: '14px' }}>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
            Description *
          </p>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={5}
            placeholder="Décrivez le problème en détail..."
            style={{
              width: '100%', padding: '10px 12px', borderRadius: '8px',
              border: '1px solid var(--border-color)', fontSize: '14px',
              background: 'var(--bg-card)', color: 'var(--text-primary)',
              resize: 'vertical', fontFamily: 'inherit',
            }}
          />
        </div>

        {/* File picker */}
        <div style={{ marginBottom: '16px' }}>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
            Photos (max 3)
          </p>

          {files.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
              {files.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-hover)' }}>
                  <Paperclip size={14} style={{ flexShrink: 0, color: 'var(--accent)' }} />
                  <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <button type="button" onClick={() => removeFile(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--danger)', display: 'flex' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {files.length < 3 && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <label style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                padding: '10px', borderRadius: '8px', border: '1px dashed var(--border-color)',
                background: 'var(--bg-hover)', cursor: 'pointer', fontSize: '13px', fontWeight: 500,
                color: 'var(--text-secondary)',
              }}>
                <Camera size={16} />
                Ajouter une photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  style={{ display: 'none' }}
                  onChange={e => addFiles(e.target.files)}
                />
              </label>
              <label style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '10px 14px', borderRadius: '8px', border: '1px dashed var(--border-color)',
                background: 'var(--bg-hover)', cursor: 'pointer', fontSize: '13px', fontWeight: 500,
                color: 'var(--text-secondary)',
              }}>
                <Paperclip size={16} />
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={e => addFiles(e.target.files)}
                />
              </label>
            </div>
          )}
        </div>

        {/* Error */}
        {errorMsg && (
          <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--danger-soft)', color: 'var(--danger-text)', fontSize: '13px', fontWeight: 500, marginBottom: '12px' }}>
            {errorMsg}
          </div>
        )}

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            width: '100%', padding: '14px', borderRadius: '10px', border: 'none',
            background: canSubmit ? 'var(--accent)' : 'var(--bg-hover)',
            color: canSubmit ? '#fff' : 'var(--text-muted)',
            fontSize: '15px', fontWeight: 700, cursor: canSubmit ? 'pointer' : 'not-allowed',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Envoi en cours...' : 'Envoyer la demande'}
        </button>
      </div>
    </div>
  )
}

/* ── shared helpers ── */

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
      <div style={{ width: '70px', flexShrink: 0, fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, paddingTop: '1px' }}>{label}</div>
      <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}
