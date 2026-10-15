import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTenant } from '../context/TenantContext'
import { useToast } from '../hooks/useToast'
import {
  ChevronLeft, Receipt, X, Image as ImageIcon, ZoomIn,
} from 'lucide-react'
import { Badge } from '../components/ui/Badge'

/* ── types ── */

interface ExpenseRow {
  id: string
  expense_number: string
  expense_date: string
  description: string
  amount: number
  status: string
  receipt_path: string | null
  group_id: string | null
  creator_name: string | null
  created_at: string
  teams: { name: string }[] | null
  events: { title: string }[] | null
}

interface ExpenseGroup {
  id: string
  name: string
  account_number: string | null
}

/* ── main ── */

export default function CommitteeMobileExpenses() {
  const { clubId } = useTenant()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [rows, setRows] = useState<ExpenseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<ExpenseRow | null>(null)
  const [groups, setGroups] = useState<ExpenseGroup[]>([])

  const load = useCallback(async () => {
    if (!clubId) return
    setLoading(true)

    const [expRes, grpRes] = await Promise.all([
      supabase
        .from('expenses')
        .select('id, expense_number, expense_date, description, amount, status, receipt_path, group_id, creator_name, created_at, teams(name), events(title)')
        .eq('club_id', clubId)
        .eq('status', 'submitted')
        .order('created_at', { ascending: false }),
      supabase
        .from('expense_groups')
        .select('id, name, account_number')
        .eq('club_id', clubId)
        .eq('active', true)
        .order('account_number', { ascending: true, nullsFirst: false }),
    ])

    setRows((expRes.data || []) as ExpenseRow[])
    setGroups((grpRes.data || []) as ExpenseGroup[])
    setLoading(false)
  }, [clubId])

  useEffect(() => { load() }, [load])

  const handleAction = useCallback(() => {
    setSelected(null)
    load()
  }, [load])

  /* ── render ── */

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <div className="animate-spin" style={{ width: 24, height: 24, border: '2.5px solid var(--border-color)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 500, margin: '0 auto' }}>
      <button
        type="button"
        onClick={() => navigate('/dashboard')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: 'var(--accent)', fontSize: '14px', fontWeight: 600, cursor: 'pointer', padding: '0', marginBottom: '12px' }}
      >
        <ChevronLeft size={16} /> Accueil
      </button>

      <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
        Notes de frais
      </h1>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
        {rows.length} note{rows.length !== 1 ? 's' : ''} de frais
      </p>

      {rows.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '48px 24px', textAlign: 'center' }}>
          <Receipt size={40} style={{ margin: '0 auto 12px', color: 'var(--text-muted)', display: 'block' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>Aucune note de frais à traiter</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
          {rows.map(r => {
            const rattachement = r.teams?.[0]?.name || r.events?.[0]?.title || ''
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelected(r)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 14px', background: 'var(--bg-card)',
                  border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
                }}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--accent-soft)', color: 'var(--accent-text)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '15px', fontWeight: 700,
                }}>
                  <Receipt size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    N° {r.expense_number} &middot; {r.description}
                  </p>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 4px' }}>
                    CHF {r.amount.toFixed(2)} &middot; {r.creator_name || '—'}
                    {rattachement ? ` · ${rattachement}` : ''}
                  </p>
                  <Badge variant="orange">En attente</Badge>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {selected && (
        <DetailSheet
          expense={selected}
          groups={groups}
          showToast={showToast}
          onDone={handleAction}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

/* ── detail sheet ── */

function DetailSheet({ expense, groups, showToast, onDone, onClose }: {
  expense: ExpenseRow
  groups: ExpenseGroup[]
  showToast: (msg: string, type: 'success' | 'error') => void
  onDone: () => void
  onClose: () => void
}) {
  const [groupId, setGroupId] = useState(expense.group_id || '')
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [fullscreenReceipt, setFullscreenReceipt] = useState(false)

  const rattachement = expense.teams?.[0]?.name || expense.events?.[0]?.title || ''

  useEffect(() => {
    if (!expense.receipt_path) return
    setReceiptLoading(true)
    supabase.storage
      .from('expense-receipts')
      .createSignedUrl(expense.receipt_path, 300)
      .then(({ data }) => { if (data?.signedUrl) setReceiptUrl(data.signedUrl) })
      .finally(() => setReceiptLoading(false))
  }, [expense.receipt_path])

  async function handleApprove() {
    if (!groupId) return
    setSaving(true)
    setErrorMsg('')
    const { error } = await supabase
      .from('expenses')
      .update({ status: 'approved', group_id: groupId })
      .eq('id', expense.id)
    setSaving(false)
    if (error) { setErrorMsg(error.message); return }
    showToast('Note approuvée', 'success')
    onDone()
  }

  async function handleReject() {
    if (!rejectReason.trim()) return
    setSaving(true)
    setErrorMsg('')
    const { error } = await supabase
      .from('expenses')
      .update({ status: 'rejected', rejected_reason: rejectReason.trim() })
      .eq('id', expense.id)
    setSaving(false)
    if (error) { setErrorMsg(error.message); return }
    showToast('Note refusée', 'success')
    onDone()
  }

  return (
    <>
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
            type="button"
            onClick={onClose}
            style={{
              position: 'absolute', top: '16px', right: '16px',
              background: 'var(--bg-hover)', border: 'none', borderRadius: '50%',
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text-secondary)',
            }}
          >
            <X size={16} />
          </button>

          {/* Title */}
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px', paddingRight: '40px' }}>
            N° {expense.expense_number}
          </h2>
          <div style={{ marginBottom: '16px' }}>
            <Badge variant="orange">En attente</Badge>
          </div>

          {/* Receipt photo */}
          {expense.receipt_path && (
            <div style={{ marginBottom: '16px' }}>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>Justificatif</p>
              {receiptLoading ? (
                <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-hover)', borderRadius: '8px' }}>
                  <div className="animate-spin" style={{ width: 20, height: 20, border: '2px solid var(--border-color)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} />
                </div>
              ) : receiptUrl ? (
                <button
                  type="button"
                  onClick={() => setFullscreenReceipt(true)}
                  style={{
                    position: 'relative', width: '100%', border: '1px solid var(--border-color)',
                    borderRadius: '8px', overflow: 'hidden', cursor: 'pointer', background: 'var(--bg-hover)',
                    padding: 0, display: 'block',
                  }}
                >
                  <img
                    src={receiptUrl}
                    alt="Justificatif"
                    style={{ width: '100%', maxHeight: '200px', objectFit: 'contain', display: 'block' }}
                  />
                  <span style={{
                    position: 'absolute', bottom: '8px', right: '8px',
                    background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: '6px',
                    padding: '4px 8px', fontSize: '11px', fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: '4px',
                  }}>
                    <ZoomIn size={12} /> Agrandir
                  </span>
                </button>
              ) : (
                <div style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-hover)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '13px', gap: '6px' }}>
                  <ImageIcon size={16} /> Impossible de charger
                </div>
              )}
            </div>
          )}

          {/* Info rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
            <InfoRow label="Description" value={expense.description} />
            <InfoRow label="Montant" value={`CHF ${expense.amount.toFixed(2)}`} />
            <InfoRow label="Date" value={formatDateFR(expense.expense_date)} />
            <InfoRow label="Soumis par" value={expense.creator_name || '—'} />
            {rattachement && <InfoRow label="Rattachement" value={rattachement} />}
          </div>

          {/* Account select */}
          <div style={{ marginBottom: '16px' }}>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
              Compte *
            </p>
            <select
              value={groupId}
              onChange={e => setGroupId(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: '8px',
                border: '1px solid var(--border-color)', fontSize: '14px', fontWeight: 500,
                background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer',
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 10px center',
                paddingRight: '32px',
              }}
            >
              <option value="">-- Sélectionner un compte --</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>
                  {g.account_number ? `${g.account_number} — ${g.name}` : g.name}
                </option>
              ))}
            </select>
          </div>

          {/* Error */}
          {errorMsg && (
            <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--danger-soft)', color: 'var(--danger-text)', fontSize: '13px', fontWeight: 500, marginBottom: '12px' }}>
              {errorMsg}
            </div>
          )}

          {/* Reject reason */}
          {rejecting && (
            <div style={{ marginBottom: '12px' }}>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                Motif du refus *
              </p>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Indiquez la raison du refus..."
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: '8px',
                  border: '1px solid var(--border-color)', fontSize: '14px',
                  background: 'var(--bg-card)', color: 'var(--text-primary)',
                  resize: 'vertical', fontFamily: 'inherit',
                }}
              />
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {!rejecting ? (
              <>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={saving || !groupId}
                  style={{
                    flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
                    background: !groupId || saving ? 'var(--bg-hover)' : 'var(--accent)',
                    color: !groupId || saving ? 'var(--text-muted)' : '#fff',
                    fontSize: '14px', fontWeight: 600, cursor: !groupId || saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? 'Enregistrement...' : 'Approuver'}
                </button>
                <button
                  type="button"
                  onClick={() => setRejecting(true)}
                  disabled={saving}
                  style={{
                    flex: 1, padding: '12px', borderRadius: '10px',
                    border: '1px solid var(--danger)',
                    background: 'var(--bg-card)', color: 'var(--danger)',
                    fontSize: '14px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  Refuser
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={saving || !rejectReason.trim()}
                  style={{
                    flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
                    background: !rejectReason.trim() || saving ? 'var(--bg-hover)' : 'var(--danger)',
                    color: !rejectReason.trim() || saving ? 'var(--text-muted)' : '#fff',
                    fontSize: '14px', fontWeight: 600, cursor: !rejectReason.trim() || saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? 'Enregistrement...' : 'Confirmer le refus'}
                </button>
                <button
                  type="button"
                  onClick={() => { setRejecting(false); setRejectReason('') }}
                  disabled={saving}
                  style={{
                    padding: '12px 16px', borderRadius: '10px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-card)', color: 'var(--text-secondary)',
                    fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Annuler
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Fullscreen receipt overlay */}
      {fullscreenReceipt && receiptUrl && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setFullscreenReceipt(false)}
        >
          <button
            type="button"
            onClick={() => setFullscreenReceipt(false)}
            style={{
              position: 'absolute', top: '16px', right: '16px',
              background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%',
              width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#fff', zIndex: 71,
            }}
          >
            <X size={20} />
          </button>
          <img
            src={receiptUrl}
            alt="Justificatif"
            style={{ maxWidth: '95vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '4px' }}
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}

/* ── helpers ── */

const MONTHS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
const DAYS_SHORT = ['dim.','lun.','mar.','mer.','jeu.','ven.','sam.']

function formatDateFR(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  return `${DAYS_SHORT[date.getDay()]} ${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
      <div style={{ width: '110px', flexShrink: 0, fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, paddingTop: '1px' }}>{label}</div>
      <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}
