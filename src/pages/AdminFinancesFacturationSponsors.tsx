import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { ClipboardList } from 'lucide-react'
import SearchInput from '../components/ui/SearchInput'
import { Alert } from '../components/ui/Alert'
import { Badge, BadgeVariant } from '../components/ui/Badge'
import Button from '../components/ui/Button'
import DataTableShell from '../components/DataTableShell'

interface Sponsor {
  id: string
  company_name: string
  contact_first_name: string | null
  contact_last_name: string | null
  email: string | null
  sponsoring_amount: number | null
  sponsoring_type: string | null
}

interface Season {
  id: string
  name: string
  invoice_prefix: string
  invoice_next_number: number
  active: boolean
}

interface SponsorPreview {
  sponsor: Sponsor
  amount: number
  dueDate: string
  description: string
  already_invoiced: boolean
}

interface Props {
  canEdit: boolean
  showToast: (message: string, type: 'success' | 'error') => void
}

const sponsoringTypeBadge: Record<string, BadgeVariant> = {
  'or': 'yellow',
  'argent': 'neutral',
  'bronze': 'orange',
  'platine': 'sky',
  'principal': 'blue',
  'premium': 'violet',
  'financier': 'green',
  'maillots': 'blue',
}

function getTypeBadgeVariant(type: string | null): BadgeVariant {
  if (!type) return 'neutral'
  return sponsoringTypeBadge[type.toLowerCase()] || 'neutral'
}

export function SponsorsFacturation({ canEdit, showToast }: Props) {
  const [sponsors, setSponsors] = useState<Sponsor[]>([])
  const [activeSeason, setActiveSeason] = useState<Season | null>(null)
  const [paymentDelayDays, setPaymentDelayDays] = useState(30)
  const [invoiceNumberPrefix, setInvoiceNumberPrefix] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [invoicedSponsorIds, setInvoicedSponsorIds] = useState<Set<string>>(new Set())
  const [previewOverrides, setPreviewOverrides] = useState<Record<string, { amount?: number; dueDate?: string; description?: string }>>({})
  const [isGenerating, setIsGenerating] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)

    const { data: season } = await supabase
      .from('seasons')
      .select('*')
      .eq('active', true)
      .maybeSingle()

    if (!season) {
      setLoading(false)
      return
    }
    setActiveSeason(season)

    const { data: config } = await supabase
      .from('finance_config')
      .select('payment_delay_days, invoice_number_prefix')
      .maybeSingle()

    if (config) {
      setPaymentDelayDays(config.payment_delay_days || 30)
      setInvoiceNumberPrefix(config.invoice_number_prefix || null)
    }

    const { data: sponsorsData } = await supabase
      .from('sponsors')
      .select('id, company_name, contact_first_name, contact_last_name, email, sponsoring_amount, sponsoring_type')
      .eq('active', true)
      .in('sponsoring_type', ['Financier', 'Maillots'])
      .order('company_name')

    setSponsors(sponsorsData || [])

    const { data: existingInvoices } = await supabase
      .from('invoices')
      .select('sponsor_id')
      .eq('season_id', season.id)
      .eq('invoice_type', 'sponsoring')
      .neq('status', 'cancelled')

    setInvoicedSponsorIds(new Set(
      existingInvoices?.map(i => i.sponsor_id).filter(Boolean) || []
    ))

    setLoading(false)
  }

  const toggleSponsor = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filteredSponsors = useMemo(() => {
    const collator = new Intl.Collator('fr', { sensitivity: 'base' })
    return sponsors
      .filter(s => {
        if (!search.trim()) return true
        const q = search.toLowerCase()
        return (
          s.company_name.toLowerCase().includes(q) ||
          (s.contact_first_name && s.contact_first_name.toLowerCase().includes(q)) ||
          (s.contact_last_name && s.contact_last_name.toLowerCase().includes(q)) ||
          (s.email && s.email.toLowerCase().includes(q))
        )
      })
      .sort((a, b) => collator.compare(a.company_name, b.company_name))
  }, [sponsors, search])

  const toggleAll = () => {
    if (selectedIds.size === filteredSponsors.length && filteredSponsors.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredSponsors.map(s => s.id)))
    }
  }

  const defaultDueDate = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + paymentDelayDays)
    return d.toISOString().split('T')[0]
  }, [paymentDelayDays])

  const previews: SponsorPreview[] = useMemo(() => {
    return sponsors
      .filter(s => selectedIds.has(s.id))
      .map(s => {
        const overrides = previewOverrides[s.id] || {}
        return {
          sponsor: s,
          amount: overrides.amount !== undefined ? overrides.amount : (s.sponsoring_amount || 0),
          dueDate: overrides.dueDate || defaultDueDate,
          description: overrides.description !== undefined ? overrides.description : `Sponsoring ${activeSeason?.name || ''}`,
          already_invoiced: invoicedSponsorIds.has(s.id)
        }
      })
  }, [sponsors, selectedIds, previewOverrides, defaultDueDate, activeSeason, invoicedSponsorIds])

  const toGenerateCount = previews.filter(p => !p.already_invoiced && p.amount > 0).length

  const updatePreviewAmount = (sponsorId: string, value: number) => {
    setPreviewOverrides(prev => ({
      ...prev,
      [sponsorId]: { ...prev[sponsorId], amount: value }
    }))
  }

  const updatePreviewDueDate = (sponsorId: string, value: string) => {
    setPreviewOverrides(prev => ({
      ...prev,
      [sponsorId]: { ...prev[sponsorId], dueDate: value }
    }))
  }

  const updatePreviewDescription = (sponsorId: string, value: string) => {
    setPreviewOverrides(prev => ({
      ...prev,
      [sponsorId]: { ...prev[sponsorId], description: value }
    }))
  }

  const generateRFReference = (invoiceNumber: number): string => {
    const ref = String(invoiceNumber).padStart(21, '0')
    const checkString = ref + '271500'
    let remainder = 0
    for (const char of checkString) {
      remainder = (remainder * 10 + parseInt(char)) % 97
    }
    const checkDigits = String(98 - remainder).padStart(2, '0')
    return 'RF' + checkDigits + ref
  }

  const generateInvoices = async () => {
    if (!activeSeason) return

    const toGenerate = previews.filter(p => !p.already_invoiced && p.amount > 0)
    if (toGenerate.length === 0) {
      showToast('Aucun sponsor à facturer', 'error')
      return
    }

    setIsGenerating(true)
    let successCount = 0
    let errorCount = 0

    for (const item of toGenerate) {
      const { data: season } = await supabase
        .from('seasons')
        .select('invoice_next_number, invoice_prefix')
        .eq('id', activeSeason.id)
        .maybeSingle()

      if (!season) {
        errorCount++
        continue
      }

      const prefix = invoiceNumberPrefix || season.invoice_prefix
      const invoiceNumber = `${prefix}-${String(season.invoice_next_number).padStart(4, '0')}`
      const qrReference = generateRFReference(season.invoice_next_number)
      const issueDate = new Date().toISOString().split('T')[0]

      const { error } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invoiceNumber,
          invoice_type: 'sponsoring',
          season_id: activeSeason.id,
          sponsor_id: item.sponsor.id,
          member_id: null,
          category_id: null,
          base_amount: item.amount,
          total_amount: item.amount,
          qr_reference: qrReference,
          status: 'draft',
          issue_date: issueDate,
          due_date: item.dueDate,
          notes: item.description
        })

      if (!error) {
        await supabase
          .from('seasons')
          .update({ invoice_next_number: season.invoice_next_number + 1 })
          .eq('id', activeSeason.id)
        successCount++
      } else {
        errorCount++
      }
    }

    setIsGenerating(false)

    if (errorCount === 0) {
      showToast(`${successCount} facture${successCount > 1 ? 's' : ''} sponsor générée${successCount > 1 ? 's' : ''} en brouillon.`, 'success')
    } else {
      showToast(`${errorCount} erreur(s) sur ${toGenerate.length}`, 'error')
    }

    setSelectedIds(new Set())
    setPreviewOverrides({})
    loadData()
  }

  if (loading) {
    return <div style={{ color: 'var(--text-muted)', padding: '24px' }}>Chargement...</div>
  }

  if (!activeSeason) {
    return (
      <Alert variant="warning">
        Aucune saison active trouvée. Veuillez créer ou activer une saison.
      </Alert>
    )
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    padding: '8px 10px',
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontWeight: 500,
  }

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: '12px',
      overflow: 'hidden'
    }}>
      <div style={{
        background: 'var(--bg-table-header)',
        padding: '16px 24px',
      }}>
        <h2 style={{ color: 'var(--text-table-header)', fontSize: '18px', fontWeight: '700', margin: 0 }}>
          Facturation sponsors
        </h2>
      </div>
      <div style={{ padding: '24px' }}>

        {/* Selection list */}
        <div style={{ marginBottom: '20px' }}>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Rechercher par nom, contact ou email..."
          />
        </div>

        {filteredSponsors.length === 0 ? (
          <Alert variant="warning">
            Aucun sponsor facturable trouvé.
          </Alert>
        ) : (
          <DataTableShell scrollable={false}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th className="px-6 py-3 text-center" style={{ width: '40px' }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filteredSponsors.length && filteredSponsors.length > 0}
                      onChange={toggleAll}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)', width: '30%' }}>Entreprise</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)', width: '22%' }}>Contact</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)', width: '16%' }}>Montant</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)', width: '14%' }}>Type</th>
                </tr>
              </thead>
              <tbody>
                {filteredSponsors.map(s => (
                  <tr
                    key={s.id}
                    onClick={() => toggleSponsor(s.id)}
                    style={{
                      borderTop: '1px solid var(--border-color)',
                      cursor: 'pointer',
                      background: selectedIds.has(s.id) ? 'var(--accent-soft)' : 'transparent',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={e => { if (!selectedIds.has(s.id)) e.currentTarget.style.background = 'var(--bg-hover)' }}
                    onMouseLeave={e => { if (!selectedIds.has(s.id)) e.currentTarget.style.background = 'transparent' }}
                  >
                    <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(s.id)}
                        onChange={() => toggleSponsor(s.id)}
                        onClick={e => e.stopPropagation()}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ padding: '9px 12px', color: 'var(--text-primary)', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.company_name}
                    </td>
                    <td style={{ padding: '9px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {[s.contact_first_name, s.contact_last_name].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td style={{ padding: '9px 12px', color: 'var(--text-primary)', fontWeight: '700', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {s.sponsoring_amount != null
                        ? `CHF ${s.sponsoring_amount.toFixed(2)}`
                        : <span style={{ color: 'var(--text-muted)', fontWeight: '400', fontStyle: 'italic', fontSize: '12px' }}>à saisir</span>}
                    </td>
                    <td style={{ padding: '9px 12px' }}>
                      {s.sponsoring_type
                        ? <Badge variant={getTypeBadgeVariant(s.sponsoring_type)}>{s.sponsoring_type}</Badge>
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableShell>
        )}

        {/* Preview panel — appears automatically when ≥1 sponsor is selected */}
        {previews.length > 0 && (
          <div style={{
            background: 'var(--bg-hover)',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            padding: '16px',
            marginBottom: '20px'
          }}>
            <div style={{
              color: 'var(--text-primary)', fontWeight: '700',
              marginBottom: '12px', fontSize: '14px'
            }}>
              <ClipboardList size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Aperçu — {previews.length} sponsor{previews.length > 1 ? 's' : ''} à facturer
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px', marginBottom: '16px'
            }}>
              <div style={{
                background: 'var(--bg-hover)',
                borderRadius: '8px', padding: '12px',
                textAlign: 'center'
              }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Sponsors</div>
                <div style={{ color: 'var(--text-primary)', fontWeight: '700', fontSize: '20px' }}>
                  {previews.filter(p => !p.already_invoiced).length}
                </div>
              </div>
              <div style={{
                background: 'var(--bg-hover)',
                borderRadius: '8px', padding: '12px',
                textAlign: 'center'
              }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Montant à saisir</div>
                <div style={{ color: 'var(--warning-text)', fontWeight: '700', fontSize: '20px' }}>
                  {previews.filter(p => !p.already_invoiced && p.amount === 0).length}
                </div>
              </div>
              <div style={{
                background: 'var(--bg-hover)',
                borderRadius: '8px', padding: '12px',
                textAlign: 'center'
              }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Total à facturer</div>
                <div style={{ color: 'var(--success-text)', fontWeight: '700', fontSize: '20px' }}>
                  CHF {previews.filter(p => !p.already_invoiced).reduce((sum, p) => sum + p.amount, 0).toFixed(2)}
                </div>
              </div>
            </div>

            <DataTableShell scrollable={false}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)', width: '25%' }}>Sponsor</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)', width: '18%' }}>Montant</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)', width: '22%' }}>Échéance</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)', width: '35%' }}>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {previews.map(p => (
                    <tr
                      key={p.sponsor.id}
                      style={{
                        borderTop: '1px solid var(--border-color)',
                        background: p.already_invoiced ? 'var(--warning-soft)' : 'transparent',
                        opacity: p.already_invoiced ? 0.7 : 1,
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={e => { if (!p.already_invoiced) e.currentTarget.style.background = 'var(--bg-hover)' }}
                      onMouseLeave={e => { if (!p.already_invoiced) e.currentTarget.style.background = 'transparent' }}
                    >
                      <td style={{ padding: '9px 12px', color: 'var(--text-primary)' }}>
                        <span style={{ fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                          {p.sponsor.company_name}
                        </span>
                        {p.already_invoiced && (
                          <span style={{
                            display: 'inline-block',
                            marginTop: '2px',
                            background: 'var(--warning-soft)',
                            color: 'var(--warning-text)',
                            border: '1px solid var(--warning)',
                            borderRadius: '4px',
                            padding: '1px 6px',
                            fontSize: '10px',
                            fontWeight: '700',
                            letterSpacing: '0.03em'
                          }}>
                            Facture existante
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={p.amount}
                          disabled={p.already_invoiced}
                          onChange={e => updatePreviewAmount(p.sponsor.id, parseFloat(e.target.value) || 0)}
                          style={{ ...inputStyle, textAlign: 'right' }}
                        />
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        <input
                          type="date"
                          value={p.dueDate}
                          disabled={p.already_invoiced}
                          onChange={e => updatePreviewDueDate(p.sponsor.id, e.target.value)}
                          style={inputStyle}
                        />
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        <input
                          type="text"
                          value={p.description}
                          disabled={p.already_invoiced}
                          onChange={e => updatePreviewDescription(p.sponsor.id, e.target.value)}
                          style={inputStyle}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableShell>

            {previews.some(p => p.already_invoiced) && (
              <div style={{ marginTop: '12px' }}>
                <Alert variant="warning">
                  {previews.filter(p => p.already_invoiced).length} sponsor
                  {previews.filter(p => p.already_invoiced).length > 1 ? 's ont' : ' a'} déjà une facture
                  pour cette saison — ils seront ignorés.
                </Alert>
              </div>
            )}
          </div>
        )}

        {/* Single action button — standard primary */}
        {toGenerateCount > 0 && canEdit && (
          <Button
            variant="primary"
            size="lg"
            onClick={generateInvoices}
            loading={isGenerating}
            disabled={isGenerating}
            style={{ width: '100%' }}
          >
            {isGenerating
              ? 'Génération en cours...'
              : `Générer ${toGenerateCount} facture${toGenerateCount > 1 ? 's' : ''}`}
          </Button>
        )}

      </div>
    </div>
  )
}
