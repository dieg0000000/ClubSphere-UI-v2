import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTenant } from '../context/TenantContext'
import { ChevronLeft, Search, X, Loader as Loader2, Monitor as DesktopIcon } from 'lucide-react'
import { Badge, type BadgeVariant } from '../components/ui/Badge'

/* ── types ── */

interface InvoiceRow {
  id: string
  invoice_number: string
  invoice_type: string
  status: string
  issue_date: string
  due_date: string
  paid_date: string | null
  total_amount: number
  paid_amount: number
  balance: number
  is_overdue: boolean
  debtor_name: string
  team_name: string | null
  event_title: string | null
  sent_at: string | null
  sent_to_email: string | null
  reminder1_sent_at: string | null
  reminder2_sent_at: string | null
}

interface SearchResult {
  total: number
  invoices: InvoiceRow[]
}

interface Season {
  id: string
  name: string
  active: boolean
  start_date: string
}

type StatusFilter = 'all' | 'open' | 'overdue' | 'paid'

/* ── helpers ── */

function formatCHF(v: number): string {
  return v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'")
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function typeLabel(t: string, confrerieLabel: string): string {
  switch (t) {
    case 'cotisation': return 'Cotisation'
    case 'confrerie': return confrerieLabel
    case 'event': return 'Événement'
    case 'sponsoring': return 'Sponsoring'
    default: return t
  }
}

function invoiceStatusLabel(inv: InvoiceRow): string {
  if (inv.status === 'paid') return 'Payée'
  if (inv.paid_amount > 0 && inv.balance > 0) return 'Partielle'
  if (inv.is_overdue) return 'En retard'
  return 'Ouverte'
}

function invoiceStatusVariant(inv: InvoiceRow): BadgeVariant {
  if (inv.status === 'paid') return 'green'
  if (inv.paid_amount > 0 && inv.balance > 0) return 'blue'
  if (inv.is_overdue) return 'red'
  return 'neutral'
}

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'open', label: 'Ouvertes' },
  { value: 'overdue', label: 'En retard' },
  { value: 'paid', label: 'Payées' },
]

/* ── component ── */

export default function CommitteeMobileFacturation() {
  const { clubId } = useTenant()
  const navigate = useNavigate()

  const [seasons, setSeasons] = useState<Season[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [result, setResult] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [confrerieLabel, setConfrerieLabel] = useState('Club des 500')

  useEffect(() => {
    if (!clubId) return
    supabase.from('club_settings').select('confrerie_label').eq('club_id', clubId).maybeSingle()
      .then(({ data }) => { if (data?.confrerie_label) setConfrerieLabel(data.confrerie_label) })
  }, [clubId])
  const [selected, setSelected] = useState<InvoiceRow | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* load seasons */
  useEffect(() => {
    if (!clubId) return
    supabase
      .from('seasons')
      .select('id, name, active, start_date')
      .eq('club_id', clubId)
      .order('start_date', { ascending: false })
      .then(({ data }) => {
        if (!data || data.length === 0) return
        setSeasons(data)
        const active = data.find(s => s.active) || data[0]
        setSelectedSeasonId(active.id)
      })
  }, [clubId])

  /* search */
  const doSearch = useCallback(async (q: string, seasonId: string, status: StatusFilter) => {
    if (!seasonId) return
    setLoading(true)
    const { data, error } = await supabase.rpc('search_club_invoices', {
      p_query: q || '',
      p_season_id: seasonId,
      p_status: status,
      p_limit: 50,
    })
    if (!error && data) {
      setResult(data as SearchResult)
    } else {
      setResult({ total: 0, invoices: [] })
    }
    setLoading(false)
  }, [])

  /* debounced trigger */
  useEffect(() => {
    if (!selectedSeasonId) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      doSearch(query, selectedSeasonId, statusFilter)
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, selectedSeasonId, statusFilter, doSearch])

  return (
    <div style={{ maxWidth: 500, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 36, height: 36, borderRadius: '10px', border: '1px solid var(--border-color)',
            background: 'var(--bg-card)', cursor: 'pointer', flexShrink: 0,
          }}
        >
          <ChevronLeft size={20} style={{ color: 'var(--text-primary)' }} />
        </button>
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, flex: 1 }}>
          Facturation
        </h1>
      </div>

      {/* Search + season */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: '8px',
          padding: '0 12px', height: '38px', borderRadius: '10px',
          border: '1px solid var(--border-color)', background: 'var(--bg-card)',
        }}>
          <Search size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Nom, société ou n° de facture"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: '13px', color: 'var(--text-primary)',
              minWidth: 0,
            }}
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
              <X size={16} style={{ color: 'var(--text-muted)' }} />
            </button>
          )}
        </div>
        {seasons.length > 1 && (
          <select
            value={selectedSeasonId}
            onChange={e => setSelectedSeasonId(e.target.value)}
            style={{
              padding: '0 10px', height: '38px', borderRadius: '10px',
              border: '1px solid var(--border-color)', background: 'var(--bg-card)',
              color: 'var(--text-primary)', fontSize: '12px', fontWeight: 600,
              maxWidth: '130px',
            }}
          >
            {seasons.map(s => (
              <option key={s.id} value={s.id}>{s.name}{s.active ? ' *' : ''}</option>
            ))}
          </select>
        )}
      </div>

      {/* Status chips */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', overflowX: 'auto' }}>
        {STATUS_CHIPS.map(c => {
          const active = statusFilter === c.value
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => setStatusFilter(c.value)}
              style={{
                padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                border: active ? '1.5px solid var(--accent, #2563eb)' : '1px solid var(--border-color)',
                background: active ? 'var(--accent-soft, rgba(37,99,235,0.08))' : 'var(--bg-card)',
                color: active ? 'var(--accent, #2563eb)' : 'var(--text-secondary)',
                cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              {c.label}
            </button>
          )
        })}
      </div>

      {/* Results */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <Loader2 size={26} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      ) : !result || result.invoices.length === 0 ? (
        <div style={{
          padding: '32px 16px', borderRadius: '12px', background: 'var(--bg-card)',
          border: '1px solid var(--border-color)', textAlign: 'center',
        }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>Aucune facture</p>
        </div>
      ) : (
        <>
          <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
            {result.total} facture{result.total !== 1 ? 's' : ''}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {result.invoices.map(inv => (
              <button
                key={inv.id}
                type="button"
                onClick={() => setSelected(inv)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '12px 14px', borderRadius: '12px',
                  border: '1px solid var(--border-color)', background: 'var(--bg-card)',
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {inv.debtor_name}
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {inv.invoice_number} · {typeLabel(inv.invoice_type, confrerieLabel)}
                    {inv.team_name ? ` · ${inv.team_name}` : ''}
                    {inv.event_title ? ` · ${inv.event_title}` : ''}
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px', whiteSpace: 'nowrap' }}>
                    CHF {formatCHF(inv.status === 'paid' ? inv.total_amount : inv.balance)}
                  </p>
                  <Badge variant={invoiceStatusVariant(inv)}>{invoiceStatusLabel(inv)}</Badge>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Detail sheet */}
      {selected && <InvoiceDetailSheet inv={selected} onClose={() => setSelected(null)} confrerieLabel={confrerieLabel} />}
    </div>
  )
}

/* ── detail sheet ── */

function InvoiceDetailSheet({ inv, onClose, confrerieLabel }: { inv: InvoiceRow; onClose: () => void; confrerieLabel: string }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 500, margin: '0 auto',
          background: 'var(--bg-card)', borderRadius: '16px 16px 0 0',
          maxHeight: '85vh', overflowY: 'auto',
          padding: '20px 20px 32px',
        }}
      >
        {/* handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-color)', margin: '0 auto 16px' }} />

        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              {inv.debtor_name}
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
              {inv.invoice_number} · {typeLabel(inv.invoice_type, confrerieLabel)}
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
            <X size={22} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        {/* status */}
        <div style={{ marginBottom: '16px' }}>
          <Badge variant={invoiceStatusVariant(inv)}>{invoiceStatusLabel(inv)}</Badge>
        </div>

        {/* amounts */}
        <DetailSection title="Montants">
          <DetailRow label="Total" value={`CHF ${formatCHF(inv.total_amount)}`} />
          <DetailRow label="Encaissé" value={`CHF ${formatCHF(inv.paid_amount)}`} color="var(--success, #059669)" />
          <DetailRow label="Solde" value={`CHF ${formatCHF(inv.balance)}`} bold color={inv.balance > 0 ? 'var(--warning, #d97706)' : undefined} />
        </DetailSection>

        {/* dates */}
        <DetailSection title="Dates">
          <DetailRow label="Émise le" value={formatDate(inv.issue_date)} />
          <DetailRow label="Échéance" value={formatDate(inv.due_date)} />
          {inv.paid_date && <DetailRow label="Payée le" value={formatDate(inv.paid_date)} />}
        </DetailSection>

        {/* sending */}
        {inv.sent_at && (
          <DetailSection title="Envoi">
            <DetailRow label="Envoyée le" value={formatDate(inv.sent_at)} />
            {inv.sent_to_email && <DetailRow label="À" value={inv.sent_to_email} />}
            {inv.reminder1_sent_at && <DetailRow label="Rappel 1 le" value={formatDate(inv.reminder1_sent_at)} />}
            {inv.reminder2_sent_at && <DetailRow label="Rappel 2 le" value={formatDate(inv.reminder2_sent_at)} />}
          </DetailSection>
        )}

        {/* context */}
        {(inv.team_name || inv.event_title) && (
          <DetailSection title="Contexte">
            {inv.team_name && <DetailRow label="Équipe" value={inv.team_name} />}
            {inv.event_title && <DetailRow label="Événement" value={inv.event_title} />}
          </DetailSection>
        )}

        {/* desktop CTA */}
        <div style={{
          marginTop: '20px', padding: '14px 16px', borderRadius: '12px',
          background: 'var(--accent-soft, rgba(0,100,200,0.06))',
          border: '1px solid var(--accent, #2563eb)',
        }}>
          <p style={{ fontWeight: 700, fontSize: '13px', color: 'var(--accent)', margin: '0 0 4px' }}>
            <DesktopIcon size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }} />
            Poste de travail complet sur ordinateur
          </p>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Émission, rappels et encaissements manuels se font depuis un ordinateur.
          </p>
        </div>
      </div>
    </div>
  )
}

/* ── detail sub-components ── */

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 6px' }}>
        {title}
      </p>
      <div style={{
        padding: '10px 14px', borderRadius: '10px',
        background: 'var(--bg-page, var(--bg-card))',
        border: '1px solid var(--border-color)',
      }}>
        {children}
      </div>
    </div>
  )
}

function DetailRow({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '3px 0' }}>
      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontSize: '13px', fontWeight: bold ? 700 : 500, color: color || 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  )
}
