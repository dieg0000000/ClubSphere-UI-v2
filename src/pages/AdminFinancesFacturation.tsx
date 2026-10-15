import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useModuleAccess } from '../hooks/useModuleAccess'
import { computeSiblingDiscounts } from '../utils/siblingDiscount'
import SearchInput from '../components/ui/SearchInput'
import { Tabs } from '../components/ui/Tabs'
import { SponsorsFacturation } from './AdminFinancesFacturationSponsors'
import { ConfrerieBillingPanel } from './AdminFinancesConfrerie'
import { Loader as Loader2, Send, FileText, ClipboardList, Clock } from 'lucide-react'
import DataTableShell from '../components/DataTableShell'
import PageTitleCount from '../components/PageTitleCount'

interface Season {
  id: string
  name: string
  invoice_prefix: string
  invoice_next_number: number
  active: boolean
}

interface Category {
  id: string
  name: string
  type: string
}

interface Team {
  id: string
  name: string
  category_id: string
}

interface PreviewPlayer {
  id: string
  first_name: string
  last_name: string
  asf_licence_number: string
  legal_rep1_email: string | null
  legal_rep2_email: string | null
  team_name: string
  category_id: string
  team_id: string
  base_amount: number
  fratrie_discount_pct: number
  fratrie_discount_amount: number
  fratrie_sibling_count: number
  total_amount: number
  already_invoiced: boolean
  invoice_number: string | null
  invoice_status: string | null
}

interface FinanceConfig {
  payment_delay_days: number
  fratrie_discount_2: number
  fratrie_discount_3: number
  fratrie_discount_4: number
  fratrie_max_age: number
}

interface FeeConfig {
  season_id: string
  category_id: string
  category_name: string
  amount: number
}

const selectStyle = {
  width: '100%',
  background: 'var(--bg-input)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  padding: '10px 12px',
  color: 'var(--text-primary)',
  fontSize: '14px',
  cursor: 'pointer',
  appearance: 'auto' as const
}

export function AdminFinancesFacturation() {
  const { canView, canEdit, loading: moduleLoading } = useModuleAccess('finances')
  const [activeSeason, setActiveSeason] = useState<Season | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [existingFees, setExistingFees] = useState<FeeConfig[]>([])
  const [financeConfig, setFinanceConfig] = useState<FinanceConfig | null>(null)

  const [selectedType, setSelectedType] = useState('')
  const [selectedTeam, setSelectedTeam] = useState('')
  const [allTeams, setAllTeams] = useState<Team[]>([])
  const [preview, setPreview] = useState<PreviewPlayer[]>([])
  const [excludedNonBillable, setExcludedNonBillable] = useState<{id: string, first_name: string, last_name: string, team_name: string}[]>([])
  const [exemptMembers, setExemptMembers] = useState<{id: string, first_name: string, last_name: string, reason: string}[]>([])
  const [invoicedExpanded, setInvoicedExpanded] = useState(false)
  const [nonBillableExpanded, setNonBillableExpanded] = useState(false)
  const [exemptExpanded, setExemptExpanded] = useState(false)
  const [previewSearch, setPreviewSearch] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [sendProgress, setSendProgress] = useState<{ sent: number; total: number } | null>(null)

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [mainTab, setMainTab] = useState<'cotisations' | 'sponsors' | 'evenements' | 'confrerie'>('cotisations')

  useEffect(() => { document.title = 'Facturation - ClubSphere' }, [])

  useEffect(() => {
    loadData()
  }, [])


  const loadData = async () => {
    const { data: season } = await supabase
      .from('seasons')
      .select('*')
      .eq('active', true)
      .maybeSingle()

    if (!season) {
      showToast('Aucune saison active trouvée', 'error')
      return
    }

    setActiveSeason(season)

    const { data: activeTeams } = await supabase
      .from('teams')
      .select('id, name, level_rank, category_id')
      .eq('active', true)
      .order('level_rank')
      .order('name')

    setAllTeams(activeTeams || [])

    const activeCategoryIds = [
      ...new Set(activeTeams?.map((t: Team) => t.category_id)
        .filter(Boolean))
    ]

    const { data: cats } = await supabase
      .from('team_categories')
      .select('id, name, type')
      .in('id', activeCategoryIds)
      .order('type')
      .order('name')

    setCategories(cats || [])

    const { data: existingF } = await supabase
      .from('fee_configs')
      .select('*')
      .eq('season_id', season.id)

    setExistingFees(existingF || [])

    const { data: config } = await supabase
      .from('finance_config')
      .select('*')
      .maybeSingle()

    setFinanceConfig(config)
  }

  const fetchPreview = async (type: string, teamId: string) => {
    if (!activeSeason || !financeConfig) return

    let query = supabase
      .from('members')
      .select(`
        id, first_name, last_name, birth_date, billable,
        address, legal_rep1_email, legal_rep2_email, asf_licence_number,
        team_id,
        team:teams!team_id(
          id, name, category_id,
          category:team_categories(id, name, type)
        )
      `)
      .eq('licence_status', 'actif')
      .is('groupement_id', null)
      .or('status.is.null,status.neq.groupement')

    if (teamId) {
      query = query.eq('team_id', teamId)
    } else if (type) {
      const typeCategoryIds = categories
        .filter(c => c.type === type)
        .map(c => c.id)

      const teamIds = allTeams
        .filter(t => typeCategoryIds.includes(t.category_id))
        .map(t => t.id)

      if (teamIds.length > 0) {
        query = query.in('team_id', teamIds)
      }
    }

    const { data: membersRaw } = await query
    const members = membersRaw?.map(m => ({
      ...m,
      team: Array.isArray(m.team) ? m.team[0] : m.team
    })) || []

    const memberIds = members.map(m => m.id)
    const { data: exemptionRows } = memberIds.length > 0
      ? await supabase
          .from('v_member_fee_exemption')
          .select('member_id, exemption, fee_exempt_reason')
          .in('member_id', memberIds)
          .not('exemption', 'is', null)
      : { data: [] }

    const exemptSet = new Set((exemptionRows || []).map(r => r.member_id))
    const exemptList = (exemptionRows || []).map(r => {
      const m = members.find(mm => mm.id === r.member_id)
      const reasonLabel = r.exemption === 'comite' ? 'Membre du comité'
        : r.exemption === 'entraineur' ? 'Entraîneur'
        : r.fee_exempt_reason || 'Exonéré'
      return {
        id: r.member_id,
        first_name: m?.first_name || '',
        last_name: m?.last_name || '',
        reason: reasonLabel
      }
    })
    setExemptMembers(exemptList)
    setExemptExpanded(false)

    const nonExemptMembers = members.filter(m => !exemptSet.has(m.id))

    const { data: existingInvoices } = await supabase
      .from('invoices')
      .select('member_id, invoice_number, status')
      .eq('season_id', activeSeason.id)
      .neq('status', 'cancelled')

    const invoicedMemberIds = new Set(
      existingInvoices?.map(i => i.member_id) || []
    )
    const invoiceByMember = new Map(
      (existingInvoices || []).map(i => [i.member_id, { number: i.invoice_number, status: i.status }])
    )

    const getFeeForMember = (member: any) => {
      const catId = member.team?.category_id
      const feeConfig = existingFees?.find(f => f.category_id === catId)
      return feeConfig?.amount || 0
    }

    const batchMemberIds = new Set(nonExemptMembers.map(m => m.id))
    const discountMap = await computeSiblingDiscounts(
      activeSeason.id,
      batchMemberIds,
      financeConfig,
      existingFees || []
    )

    const nonBillableMembers = nonExemptMembers.filter(m => m.billable === false);
    const billableMembers = nonExemptMembers.filter(m => m.billable !== false);
    setExcludedNonBillable(nonBillableMembers.map(m => ({
      id: m.id, first_name: m.first_name, last_name: m.last_name,
      team_name: m.team?.name || ''
    })));
    setInvoicedExpanded(false);
    setNonBillableExpanded(false);

    const previewData: PreviewPlayer[] = billableMembers.map(member => {
      const baseAmount = getFeeForMember(member)
      const disc = discountMap[member.id] || { pct: 0, amount: 0, siblingCount: 1 }
      const discountAmount = Math.min(disc.amount, baseAmount)
      const totalAmount = baseAmount - discountAmount

      return {
        id: member.id,
        first_name: member.first_name,
        last_name: member.last_name,
        asf_licence_number: member.asf_licence_number || '',
        legal_rep1_email: member.legal_rep1_email || null,
        legal_rep2_email: member.legal_rep2_email || null,
        team_name: member.team?.name || '',
        category_id: member.team?.category_id || '',
        team_id: member.team_id,
        base_amount: baseAmount,
        fratrie_discount_pct: disc.pct,
        fratrie_discount_amount: discountAmount,
        fratrie_sibling_count: disc.siblingCount,
        total_amount: totalAmount,
        already_invoiced: invoicedMemberIds.has(member.id),
        invoice_number: invoiceByMember.get(member.id)?.number || null,
        invoice_status: invoiceByMember.get(member.id)?.status || null
      }
    })

    setPreview(previewData)
    setPreviewSearch('')
  }

  const generateRFReference = (invoiceNumber: number): string => {
    // Build base reference (max 21 chars):
    const ref = String(invoiceNumber).padStart(21, '0')

    // ISO 11649: append 'RF00' + ref, convert letters to numbers
    // R=27, F=15
    const checkString = ref + '271500'

    // Calculate mod 97:
    let remainder = 0
    for (const char of checkString) {
      remainder = (remainder * 10 + parseInt(char)) % 97
    }

    const checkDigits = String(98 - remainder).padStart(2, '0')

    // Format: RF + checkDigits + reference
    const rfRef = 'RF' + checkDigits + ref

    return rfRef // return unformatted for QR data
  }

  const generateInvoices = async () => {
    if (!activeSeason || !financeConfig) return

    setIsGenerating(true)

    const toGenerate = preview.filter(p => !p.already_invoiced)

    const { data: financeConfigData, error: fcError } = await supabase
      .from('finance_config')
      .select('auto_send_invoices, invoice_number_prefix')
      .maybeSingle()

    if (fcError) {
      console.error('[auto-send] finance_config query failed:', fcError.message)
    }

    const autoSend = financeConfigData?.auto_send_invoices === true
    const customPrefix = financeConfigData?.invoice_number_prefix || null
    console.log('[auto-send] autoSend:', autoSend, '| financeConfigData:', financeConfigData)

    let successCount = 0
    let errorCount = 0
    const createdInvoiceIds: string[] = []

    for (const player of toGenerate) {
      const { data: season } = await supabase
        .from('seasons')
        .select('invoice_next_number, invoice_prefix')
        .eq('id', activeSeason.id)
        .maybeSingle()

      if (!season) {
        errorCount++
        continue
      }

      const prefix = customPrefix || season.invoice_prefix
      const invoiceNumber = `${prefix}-${String(season.invoice_next_number).padStart(4, '0')}`
      const qrReference = generateRFReference(season.invoice_next_number)

      const issueDate = new Date()
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + (financeConfig.payment_delay_days || 30))

      const { data: insertedInvoice, error } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invoiceNumber,
          season_id: activeSeason.id,
          member_id: player.id,
          team_id: player.team_id,
          category_id: player.category_id,
          base_amount: player.base_amount,
          fratrie_discount_pct: player.fratrie_discount_pct,
          fratrie_discount_amount: player.fratrie_discount_amount,
          fratrie_sibling_count: player.fratrie_sibling_count,
          total_amount: player.total_amount,
          qr_reference: qrReference,
          status: 'draft',
          issue_date: issueDate.toISOString().split('T')[0],
          due_date: dueDate.toISOString().split('T')[0]
        })
        .select()
        .single()

      if (!error && insertedInvoice) {
        await supabase
          .from('seasons')
          .update({ invoice_next_number: season.invoice_next_number + 1 })
          .eq('id', activeSeason.id)

        if (autoSend) {
          createdInvoiceIds.push(insertedInvoice.id)
        }

        successCount++
      } else {
        errorCount++
      }
    }

    if (autoSend && createdInvoiceIds.length > 0) {
      console.log('[auto-send] Entering send loop with', createdInvoiceIds.length, 'invoice(s)')
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) throw new Error('Session expirée')

        const { data: club } = await supabase.from('club_settings').select('*').maybeSingle()
        const { data: finance } = await supabase.from('finance_config').select('*').maybeSingle()

        const uniqueIds = [...new Set(createdInvoiceIds)]
        console.log('[auto-send] Fetching invoices for IDs:', uniqueIds)

        const { data: invoicesToSend, error: invError } = await supabase
          .from('invoices')
          .select(`
            *,
            member:members(
              first_name, last_name, salutation, email, birth_date,
              address, street_number, postal_code, city,
              asf_licence_number, legal_rep1_email, legal_rep2_email
            ),
            team:teams(name),
            category:team_categories(name, type),
            season:seasons(id, name)
          `)
          .in('id', uniqueIds)

        if (invError) {
          console.error('[auto-send] Invoice fetch error:', invError.message)
          throw new Error('Impossible de charger les factures créées')
        }

        if (!invoicesToSend || invoicesToSend.length === 0) {
          throw new Error('Impossible de charger les factures créées')
        }

        console.log('[auto-send] invoicesToSend count:', invoicesToSend.length)

        const { generateInvoicePDF } = await import('../utils/generateInvoicePDF')
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invoice`
        const total = invoicesToSend.length
        let sent = 0
        const errors: string[] = []

        setSendProgress({ sent: 0, total })

        for (let i = 0; i < total; i++) {
          const invoice = invoicesToSend[i] as any
          console.log(`[auto-send] Processing invoice ${i + 1}/${total}: ${invoice.invoice_number}`)
          try {
            console.log('[auto-send] Generating PDF...')
            const pdfBase64 = await generateInvoicePDF({
              invoice_number: invoice.invoice_number,
              issue_date: invoice.issue_date,
              due_date: invoice.due_date,
              qr_reference: invoice.qr_reference,
              notes: invoice.notes,
              member_first_name: invoice.member?.first_name || '',
              member_last_name: invoice.member?.last_name || '',
              member_salutation: invoice.member?.salutation,
              member_address: invoice.member?.address || '',
              member_street_number: invoice.member?.street_number,
              member_postal_code: invoice.member?.postal_code || '',
              member_city: invoice.member?.city || '',
              member_asf_licence: invoice.member?.asf_licence_number,
              member_birth_date: invoice.member?.birth_date,
              base_amount: invoice.base_amount,
              fratrie_discount_pct: invoice.fratrie_discount_pct || 0,
              fratrie_discount_amount: invoice.fratrie_discount_amount || 0,
              reminder_fee: invoice.reminder_fee || 0,
              total_amount: invoice.total_amount,
              currency: invoice.currency || 'CHF',
              category_name: invoice.category?.name || '',
              season_name: invoice.season?.name || '',
              club_name: club?.club_name || '',
              club_address: club?.club_address || '',
              club_street_number: club?.club_street_number,
              club_postal_code: club?.club_postal_code || '',
              club_city: club?.club_city || '',
              club_email: finance?.email_sender?.trim() || club?.club_email || '',
              club_phone: club?.club_phone,
              club_website: club?.club_website,
              logo_url: club?.logo_url,
              qr_iban: finance?.qr_iban || '',
              bank_name: finance?.bank_name || '',
              bank_street: finance?.bank_street,
              bank_street_number: finance?.bank_street_number,
              bank_postal_code: finance?.bank_postal_code,
              bank_city: finance?.bank_city,
              contact_name: finance?.contact_name,
              contact_phone: finance?.contact_phone,
              payment_delay_days: finance?.payment_delay_days || 30,
            }, true) as string

            if (!pdfBase64) {
              throw new Error('PDF generation returned empty result')
            }
            console.log(`[auto-send] PDF generated (${Math.round((pdfBase64.length * 3) / 4 / 1024)} KB). Calling send-invoice edge function...`)

            const response = await fetch(apiUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                invoice_id: invoice.id,
                pdf_base64: pdfBase64,
                filename: `Facture_${invoice.invoice_number}.pdf`
              })
            })

            console.log('[auto-send] Edge function response status:', response.status)

            if (!response.ok) {
              const result = await response.json().catch(() => ({}))
              throw new Error(result.error || `Erreur ${response.status}`)
            }

            sent++
            console.log(`[auto-send] Invoice ${invoice.invoice_number} sent successfully`)
          } catch (err: any) {
            console.error(`[auto-send] Error for invoice ${invoice.invoice_number}:`, err.message || err)
            errors.push(`${invoice.invoice_number}: ${err.message}`)
          }

          setSendProgress({ sent, total })

          if (i < total - 1) {
            await new Promise(resolve => setTimeout(resolve, 400))
          }
        }

        if (errors.length > 0) {
          console.error('[auto-send] Erreurs envoi groupé:', errors)
          if (sent > 0) {
            showToast(`${sent} facture${sent > 1 ? 's' : ''} envoyée${sent > 1 ? 's' : ''}, ${errors.length} en erreur`, 'error')
          } else {
            showToast(`Échec de l'envoi (${errors.length} erreur${errors.length > 1 ? 's' : ''})`, 'error')
          }
        } else {
          showToast(`${sent} facture${sent > 1 ? 's' : ''} envoyée${sent > 1 ? 's' : ''}`, 'success')
        }
      } catch (err: any) {
        console.error('[auto-send] Outer catch:', err.message || err)
        showToast(err.message || "Erreur lors de l'envoi groupé", 'error')
      } finally {
        setSendProgress(null)
      }
    } else if (!autoSend) {
      if (errorCount === 0) {
        showToast(`${successCount} facture${successCount > 1 ? 's' : ''} générée${successCount > 1 ? 's' : ''} en brouillon.`, 'success')
      } else {
        showToast(`${errorCount} erreur(s) sur ${toGenerate.length}`, 'error')
      }
    } else {
      if (errorCount === 0) {
        showToast(`Aucune facture créée à envoyer`, 'error')
      } else {
        showToast(`${errorCount} erreur(s) lors de la génération`, 'error')
      }
    }

    setIsGenerating(false)
    fetchPreview(selectedType, selectedTeam)
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  if (moduleLoading) {
    return <div style={{ color: 'var(--text-primary)', padding: '32px' }}>Chargement...</div>
  }

  if (!canView) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: '32px', textAlign: 'center' }}>
        Accès non autorisé
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 32px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '24px' }}>
        <FileText size={20} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '8px', color: 'var(--accent)' }} />Facturation {mainTab === 'cotisations' && <PageTitleCount total={preview.length} filtered={previewSearch ? preview.filter(p => (p.first_name + ' ' + p.last_name).toLowerCase().includes(previewSearch.toLowerCase())).length : preview.length} isFiltered={!!previewSearch} />}
      </h1>

      <Tabs
        items={[
          { key: 'cotisations', label: 'Cotisations' },
          { key: 'sponsors', label: 'Sponsors' },
          { key: 'evenements', label: 'Événements' },
          { key: 'confrerie', label: 'Cercle donateurs' },
        ]}
        value={mainTab}
        onChange={(key) => setMainTab(key as 'cotisations' | 'sponsors' | 'evenements' | 'confrerie')}
        className="mb-6 overflow-x-auto"
      />

      {mainTab === 'sponsors' && (
        <SponsorsFacturation canEdit={canEdit} showToast={showToast} />
      )}

      {mainTab === 'evenements' && (
        <EventsFacturationPanel showToast={showToast} />
      )}

      {mainTab === 'confrerie' && (
        <ConfrerieBillingPanel canEdit={canEdit} showToast={showToast} />
      )}

      {mainTab === 'cotisations' && (
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
            Génération des factures
          </h2>
        </div>
        <div style={{ padding: '24px' }}>

        <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1', minWidth: '180px' }}>
            <label style={{
              color: 'var(--text-muted)', fontSize: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              1. Type de joueurs
            </label>
            <select
              value={selectedType}
              onChange={e => {
                setSelectedType(e.target.value)
                setSelectedTeam('')
                fetchPreview(e.target.value, '')
              }}
              style={{
                ...selectStyle,
                marginTop: '8px'
              }}>
              <option value="" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                — Tous —
              </option>
              {categories.some(c => c.type === 'junior') && (
                <option value="junior" style={{ background: 'var(--bg-card)', color: 'var(--accent-text)' }}>
                  Juniors
                </option>
              )}
              {categories.some(c => c.type === 'active') && (
                <option value="active" style={{ background: 'var(--bg-card)', color: 'var(--success-text)' }}>
                  Actifs
                </option>
              )}
            </select>
          </div>

          <div style={{ flex: '2', minWidth: '220px' }}>
            <label style={{
              color: 'var(--text-muted)', fontSize: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              2. Équipe (optionnel)
            </label>
            <select
              value={selectedTeam}
              onChange={e => {
                setSelectedTeam(e.target.value)
                fetchPreview(selectedType, e.target.value)
              }}
              style={{
                ...selectStyle,
                marginTop: '8px'
              }}>
              <option value="" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                — Toutes les équipes —
              </option>
              {(() => {
                const typeCategoryIds = selectedType
                  ? categories.filter(c => c.type === selectedType).map(c => c.id)
                  : categories.map(c => c.id)

                const filteredTeams = allTeams.filter(t => typeCategoryIds.includes(t.category_id))

                if (!selectedType) {
                  const juniorCatIds = categories.filter(c => c.type === 'junior').map(c => c.id)
                  const activeCatIds = categories.filter(c => c.type === 'active').map(c => c.id)
                  const juniorTeams = filteredTeams.filter(t => juniorCatIds.includes(t.category_id))
                  const activeTeams = filteredTeams.filter(t => activeCatIds.includes(t.category_id))

                  return (
                    <>
                      {juniorTeams.length > 0 && (
                        <>
                          <option disabled style={{ background: 'var(--bg-card)', color: 'var(--accent-text)', fontWeight: '700' }}>── Juniors ──</option>
                          {juniorTeams.map(t => (
                            <option key={t.id} value={t.id} style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>{t.name}</option>
                          ))}
                        </>
                      )}
                      {activeTeams.length > 0 && (
                        <>
                          <option disabled style={{ background: 'var(--bg-card)', color: 'var(--success-text)', fontWeight: '700' }}>── Actifs ──</option>
                          {activeTeams.map(t => (
                            <option key={t.id} value={t.id} style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>{t.name}</option>
                          ))}
                        </>
                      )}
                    </>
                  )
                }

                return filteredTeams.map(t => (
                  <option key={t.id} value={t.id} style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>{t.name}</option>
                ))
              })()}
            </select>
          </div>
        </div>

        {preview.length > 0 && (
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
              <ClipboardList size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Aperçu — {preview.length} joueur{preview.length > 1 ? 's' : ''} à facturer
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
                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                  Joueurs
                </div>
                <div style={{ color: 'var(--text-primary)', fontWeight: '700', fontSize: '20px' }}>
                  {preview.length}
                </div>
              </div>
              <div style={{
                background: 'var(--bg-hover)',
                borderRadius: '8px', padding: '12px',
                textAlign: 'center'
              }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                  Avec rabais fratrie
                </div>
                <div style={{ color: 'var(--warning-text)', fontWeight: '700', fontSize: '20px' }}>
                  {preview.filter(p => p.fratrie_discount_pct > 0).length}
                </div>
              </div>
              <div style={{
                background: 'var(--bg-hover)',
                borderRadius: '8px', padding: '12px',
                textAlign: 'center'
              }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                  Total à facturer
                </div>
                <div style={{ color: 'var(--success)', fontWeight: '700', fontSize: '20px' }}>
                  CHF {preview.reduce((sum, p) => sum + p.total_amount, 0).toFixed(2)}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <SearchInput
                value={previewSearch}
                onChange={setPreviewSearch}
                placeholder="Rechercher par nom ou licence ASF..."
              />
            </div>

            <DataTableShell scrollable={false}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)', width: '35%' }}>Joueur</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)', width: '25%' }}>Équipe</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)', width: '15%' }}>Base</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)', width: '10%' }}>Rabais</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)', width: '15%' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.filter(player => {
                    if (!previewSearch.trim()) return true
                    const s = previewSearch.toLowerCase()
                    return (
                      player.first_name.toLowerCase().includes(s) ||
                      player.last_name.toLowerCase().includes(s) ||
                      `${player.last_name} ${player.first_name}`.toLowerCase().includes(s) ||
                      `${player.first_name} ${player.last_name}`.toLowerCase().includes(s) ||
                      Boolean(player.legal_rep1_email && player.legal_rep1_email.toLowerCase().includes(s)) ||
                      Boolean(player.legal_rep2_email && player.legal_rep2_email.toLowerCase().includes(s)) ||
                      Boolean(player.asf_licence_number && player.asf_licence_number.toLowerCase().includes(s))
                    )
                  }).map(player => (
                    <tr
                      key={player.id}
                      style={{
                        borderTop: '1px solid var(--border-color)',
                        background: player.already_invoiced ? 'var(--warning-soft)' : 'transparent',
                        opacity: player.already_invoiced ? 0.7 : 1,
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={e => { if (!player.already_invoiced) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={e => { if (!player.already_invoiced) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={{ padding: '9px 12px', color: 'var(--text-primary)' }}>
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                          {player.last_name} {player.first_name}
                        </span>
                        {player.already_invoiced && (
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
                      <td style={{ padding: '9px 12px', color: 'var(--text-muted)', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {player.team_name}
                      </td>
                      <td style={{ padding: '9px 12px', color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {player.base_amount.toFixed(2)}
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {player.fratrie_discount_pct > 0 ? (
                          <span style={{ color: 'var(--warning-text)' }}>-{player.fratrie_discount_pct}%</span>
                        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ padding: '9px 12px', color: 'var(--text-primary)', fontWeight: '700', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        CHF {player.total_amount.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableShell>

            {preview.some(p => p.already_invoiced) && (() => {
              const invoiced = preview.filter(p => p.already_invoiced);
              return (
                <div style={{ marginTop: '12px' }}>
                  <div
                    onClick={() => setInvoicedExpanded(!invoicedExpanded)}
                    style={{
                      background: 'var(--warning-soft)',
                      border: '1px solid var(--warning)',
                      borderRadius: invoicedExpanded ? '8px 8px 0 0' : '8px',
                      padding: '10px 14px',
                      color: 'var(--warning-text)',
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span>{invoiced.length} joueur{invoiced.length > 1 ? 's ont' : ' a'} déjà une facture pour cette saison — ils seront ignorés</span>
                    <span style={{ fontSize: '11px' }}>{invoicedExpanded ? '▲ Masquer' : '▼ Détails'}</span>
                  </div>
                  {invoicedExpanded && (
                    <div style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                      borderTop: 'none',
                      borderRadius: '0 0 8px 8px',
                      padding: '8px 14px',
                      fontSize: '12px'
                    }}>
                      {invoiced.map(p => (
                        <div key={p.id} style={{
                          padding: '4px 0',
                          borderBottom: '1px solid var(--border-color)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          color: 'var(--text-secondary)'
                        }}>
                          <span>{p.first_name} {p.last_name.toUpperCase()}</span>
                          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            {p.invoice_number || '—'}{p.invoice_status ? ` (${p.invoice_status})` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {excludedNonBillable.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <div
                  onClick={() => setNonBillableExpanded(!nonBillableExpanded)}
                  style={{
                    background: 'var(--info-soft)',
                    border: '1px solid var(--info)',
                    borderRadius: nonBillableExpanded ? '8px 8px 0 0' : '8px',
                    padding: '10px 14px',
                    color: 'var(--info-text)',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <span>{excludedNonBillable.length} membre{excludedNonBillable.length > 1 ? 's' : ''} exclu{excludedNonBillable.length > 1 ? 's' : ''} (marqué{excludedNonBillable.length > 1 ? 's' : ''} non facturable{excludedNonBillable.length > 1 ? 's' : ''})</span>
                  <span style={{ fontSize: '11px' }}>{nonBillableExpanded ? '▲ Masquer' : '▼ Détails'}</span>
                </div>
                {nonBillableExpanded && (
                  <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderTop: 'none',
                    borderRadius: '0 0 8px 8px',
                    padding: '8px 14px',
                    fontSize: '12px'
                  }}>
                    {excludedNonBillable.map(m => (
                      <div key={m.id} style={{
                        padding: '4px 0',
                        borderBottom: '1px solid var(--border-color)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        color: 'var(--text-secondary)'
                      }}>
                        <span>{m.first_name} {m.last_name.toUpperCase()}</span>
                        <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{m.team_name || '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {exemptMembers.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <div
                  onClick={() => setExemptExpanded(!exemptExpanded)}
                  style={{
                    background: 'var(--accent-soft)',
                    border: '1px solid var(--accent)',
                    borderRadius: exemptExpanded ? '8px 8px 0 0' : '8px',
                    padding: '10px 14px',
                    color: 'var(--accent-text)',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <span>{exemptMembers.length} joueur{exemptMembers.length > 1 ? 's' : ''} exonéré{exemptMembers.length > 1 ? 's' : ''}</span>
                  <span style={{ fontSize: '11px' }}>{exemptExpanded ? '▲ Masquer' : '▼ Détails'}</span>
                </div>
                {exemptExpanded && (
                  <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderTop: 'none',
                    borderRadius: '0 0 8px 8px',
                    padding: '8px 14px',
                    fontSize: '12px'
                  }}>
                    {exemptMembers.map(em => (
                      <div key={em.id} style={{
                        padding: '4px 0',
                        borderBottom: '1px solid var(--border-color)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        color: 'var(--text-secondary)'
                      }}>
                        <span>{em.first_name} {em.last_name.toUpperCase()}</span>
                        <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{em.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {preview.filter(p => !p.already_invoiced).length > 0 && canEdit && (
          <button
            onClick={generateInvoices}
            disabled={isGenerating}
            style={{
              background: 'var(--accent-soft)',
              color: 'var(--accent-text)',
              border: '1px solid var(--accent)',
              borderRadius: '10px',
              padding: '14px 24px',
              cursor: isGenerating ? 'wait' : 'pointer',
              fontWeight: '700', fontSize: '15px',
              width: '100%',
              position: 'relative',
              overflow: 'hidden'
            }}>
            {isGenerating
              ? (sendProgress
                ? <><Clock size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Envoi {sendProgress.sent}/{sendProgress.total}…</>
                : <><Clock size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Génération en cours...</>)
              : <><FileText size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Générer {preview.filter(p => !p.already_invoiced).length} facture{preview.filter(p => !p.already_invoiced).length > 1 ? 's' : ''}</>}
          </button>
        )}
        </div>
      </div>

      )}

      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '24px', right: '24px',
          background: toast.type === 'success' ? 'var(--success)' : 'var(--danger)',
          color: 'var(--text-inverse)',
          borderRadius: '10px',
          padding: '14px 20px',
          fontWeight: '700',
          fontSize: '14px',
          zIndex: 9999,
          boxShadow: 'var(--shadow-lg)'
        }}>
          {toast.message}
        </div>
      )}
    </div>
  )
}

interface EventInvoice {
  id: string;
  invoice_number: string;
  status: string;
  total_amount: number;
  due_date: string;
  registration: {
    first_name: string;
    last_name: string;
    company?: string | null;
    event: { title: string; date: string } | null;
  } | null;
}

function EventsFacturationPanel({ showToast }: { showToast: (msg: string, type: 'success' | 'error') => void }) {
  const [invoices, setInvoices] = useState<EventInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('draft');
  const [sendingId, setSendingId] = useState<string | null>(null);

  const loadInvoices = async () => {
    setLoading(true);
    const query = supabase
      .from('invoices')
      .select(`
        id, invoice_number, status, total_amount, due_date,
        registration:event_public_registrations(
          first_name, last_name, company,
          event:events(title, date)
        )
      `)
      .eq('invoice_type', 'evenement')
      .order('invoice_number', { ascending: false });

    if (statusFilter !== 'all') {
      query.eq('status', statusFilter);
    }

    const { data } = await query;
    setInvoices((data as EventInvoice[] | null) || []);
    setLoading(false);
  };

  useEffect(() => { loadInvoices(); }, [statusFilter]);

  const sendInvoice = async (invoice: EventInvoice) => {
    setSendingId(invoice.id);
    try {
      const { data: club } = await supabase.from('club_settings').select('*').maybeSingle();
      const { data: finance } = await supabase.from('finance_config').select('*').maybeSingle();

      const { generateInvoicePDF } = await import('../utils/generateInvoicePDF');
      const { data: fullInv } = await supabase
        .from('invoices')
        .select(`
          *,
          registration:event_public_registrations(
            first_name, last_name, email, phone, address, postal_code, city,
            company, option_label, quantity,
            event:events(title, date)
          ),
          season:seasons(name),
          category:team_categories(name)
        `)
        .eq('id', invoice.id)
        .maybeSingle();

      if (!fullInv) throw new Error('Facture introuvable');

      const reg = fullInv.registration;
      const pdfBase64 = await generateInvoicePDF({
        invoice_number: fullInv.invoice_number,
        issue_date: fullInv.issue_date,
        due_date: fullInv.due_date,
        qr_reference: fullInv.qr_reference,
        notes: fullInv.notes,
        member_first_name: '',
        member_last_name: '',
        member_address: '',
        member_postal_code: '',
        member_city: '',
        base_amount: fullInv.base_amount,
        fratrie_discount_pct: fullInv.fratrie_discount_pct || 0,
        fratrie_discount_amount: fullInv.fratrie_discount_amount || 0,
        reminder_fee: fullInv.reminder_fee || 0,
        total_amount: fullInv.total_amount,
        currency: fullInv.currency || 'CHF',
        category_name: fullInv.category?.name || '',
        season_name: fullInv.season?.name || '',
        club_name: club?.club_name || '',
        club_address: club?.club_address || '',
        club_street_number: club?.club_street_number,
        club_postal_code: club?.club_postal_code || '',
        club_city: club?.club_city || '',
        club_email: finance?.email_sender?.trim() || club?.club_email || '',
        club_phone: club?.club_phone,
        club_website: club?.club_website,
        logo_url: club?.logo_url,
        qr_iban: finance?.qr_iban || '',
        bank_name: finance?.bank_name || '',
        bank_street: finance?.bank_street,
        bank_street_number: finance?.bank_street_number,
        bank_postal_code: finance?.bank_postal_code,
        bank_city: finance?.bank_city,
        contact_name: finance?.contact_name,
        contact_phone: finance?.contact_phone,
        payment_delay_days: finance?.payment_delay_days || 30,
        is_event: true,
        event_title: reg?.event?.title,
        event_date: reg?.event?.date,
        event_option_label: reg?.option_label,
        event_quantity: reg?.quantity,
        event_company: reg?.company,
        event_debtor_first_name: reg?.first_name,
        event_debtor_last_name: reg?.last_name,
        event_debtor_address: reg?.address,
        event_debtor_postal_code: reg?.postal_code,
        event_debtor_city: reg?.city,
      }, true) as string;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Session expirée');

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invoice`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invoice_id: invoice.id,
          pdf_base64: pdfBase64,
          filename: `Facture_${invoice.invoice_number}.pdf`,
        }),
      });

      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || `Erreur ${resp.status}`);

      if (result.simulated) {
        showToast(`Email simulé pour ${invoice.invoice_number}`, 'success');
      } else {
        showToast(`Facture ${invoice.invoice_number} envoyée`, 'success');
      }
      loadInvoices();
    } catch (err: any) {
      showToast(err.message || "Erreur lors de l'envoi", 'error');
    } finally {
      setSendingId(null);
    }
  };

  const statusLabel = (s: string) => {
    switch (s) {
      case 'draft': return 'Brouillon';
      case 'sent': return 'Envoyée';
      case 'paid': return 'Payée';
      case 'cancelled': return 'Annulée';
      default: return s;
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'draft': return { bg: 'var(--orange-soft)', color: 'var(--orange-text)' };
      case 'sent': return { bg: 'var(--info-soft)', color: 'var(--info-text)' };
      case 'paid': return { bg: 'var(--success-soft)', color: 'var(--success-text)' };
      case 'cancelled': return { bg: 'var(--danger-soft)', color: 'var(--danger-text)' };
      default: return { bg: 'var(--bg-hover)', color: 'var(--text-secondary)' };
    }
  };

  const formatDate = (d: string) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const getName = (inv: EventInvoice) => {
    const r = inv.registration;
    if (!r) return '—';
    if (r.company) return r.company;
    const n = `${r.first_name || ''} ${r.last_name || ''}`.trim();
    return n || '—';
  };

  return (
    <div style={{
      background: 'var(--card-bg)',
      borderRadius: '12px',
      boxShadow: 'var(--shadow-sm)',
      border: '1px solid var(--border-color)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border-color)',
      }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          Factures événements
        </h2>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontSize: '13px',
          }}
        >
          <option value="draft">Brouillon</option>
          <option value="sent">Envoyée</option>
          <option value="paid">Payée</option>
          <option value="all">Tous</option>
        </select>
      </div>

      <DataTableShell bare scrollable={false}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
          <thead>
            <tr>
              {['Numéro', 'Inscrit', 'Événement', 'Montant', 'Échéance', 'Statut', ''].map(h => (
                <th
                  key={h}
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider"
                  style={{ color: 'var(--text-secondary)', ...(h === 'Montant' ? { textAlign: 'right' } : {}) }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} />
              </td></tr>
            ) : invoices.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                Aucune facture événement trouvée
              </td></tr>
            ) : (
              invoices.map(inv => {
                const sc = statusColor(inv.status);
                return (
                  <tr key={inv.id} style={{ borderTop: '1px solid var(--border-color)', transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td className="px-6 py-3 text-sm" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                      {inv.invoice_number}
                    </td>
                    <td className="px-6 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>
                      {getName(inv)}
                    </td>
                    <td className="px-6 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {inv.registration?.event?.title || '—'}
                    </td>
                    <td className="px-6 py-3 text-sm text-right" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                      {inv.total_amount?.toFixed(2)} CHF
                    </td>
                    <td className="px-6 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {formatDate(inv.due_date)}
                    </td>
                    <td className="px-6 py-3">
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 10px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 600,
                        background: sc.bg,
                        color: sc.color,
                      }}>
                        {statusLabel(inv.status)}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {(inv.status === 'draft' || inv.status === 'sent') && (
                        <button
                          onClick={() => sendInvoice(inv)}
                          disabled={sendingId === inv.id}
                          title="Envoyer par email"
                          style={{
                            width: '30px',
                            height: '30px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'var(--success-soft)',
                            border: '1px solid var(--success)',
                            borderRadius: '6px',
                            cursor: sendingId === inv.id ? 'wait' : 'pointer',
                            opacity: sendingId === inv.id ? 0.5 : 1,
                          }}
                        >
                          {sendingId === inv.id
                            ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: 'var(--success)' }} />
                            : <Send size={14} color="var(--success)" />}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </DataTableShell>
    </div>
  );
}
