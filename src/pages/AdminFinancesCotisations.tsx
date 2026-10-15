import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useModuleAccess } from '../hooks/useModuleAccess'
import { Wallet, Calendar, Save, Copy } from 'lucide-react'
import Button from '../components/ui/Button'
import DataTableShell from '../components/DataTableShell'
import PageTitleCount from '../components/PageTitleCount'

interface Season {
  id: string
  name: string
  start_date: string
  invoice_prefix: string
  invoice_next_number: number
  active: boolean
}

interface Category {
  id: string
  name: string
  type: string
}

interface FeeConfig {
  season_id: string
  category_id: string
  category_name: string
  amount: number
  compte?: string
}

export function AdminFinancesCotisations({ embedded, embeddedCanEdit }: { embedded?: boolean; embeddedCanEdit?: boolean } = {}) {
  const { canView, canEdit: moduleCanEdit, loading: moduleLoading } = useModuleAccess('finances')
  const canEdit = embedded ? (embeddedCanEdit ?? false) : moduleCanEdit
  const [activeSeason, setActiveSeason] = useState<Season | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [fees, setFees] = useState<Record<string, string>>({})
  const [comptes, setComptes] = useState<Record<string, string>>({})

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [feeConfigsLoaded, setFeeConfigsLoaded] = useState(false)
  const [hasFeeConfigs, setHasFeeConfigs] = useState(true)
  const [copying, setCopying] = useState(false)
  const [copyMsg, setCopyMsg] = useState<string | null>(null)
  const [confirmCopy, setConfirmCopy] = useState<{ count: number; seasonName: string } | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setFeeConfigsLoaded(false)
    const { data: season, error: seasonErr } = await supabase
      .from('seasons')
      .select('*')
      .eq('active', true)
      .maybeSingle()

    if (seasonErr) {
      showToast('Erreur chargement saison : ' + seasonErr.message, 'error')
      return
    }
    if (!season) {
      showToast('Aucune saison active trouvée', 'error')
      return
    }

    setActiveSeason(season)

    const { data: activeTeams } = await supabase
      .from('teams')
      .select('category_id')
      .eq('active', true)

    const activeCategoryIds = [
      ...new Set(activeTeams?.map(t => t.category_id)
        .filter(Boolean))
    ]

    const { data: cats } = await supabase
      .from('team_categories')
      .select('id, name, type')
      .in('id', activeCategoryIds)
      .order('type')
      .order('name')

    setCategories(cats || [])

    const { data: existingF, error: feeErr } = await supabase
      .from('fee_configs')
      .select('*')
      .eq('season_id', season.id)

    if (feeErr) {
      showToast('Erreur chargement tarifs : ' + feeErr.message, 'error')
      return
    }

    const feesMap: Record<string, string> = {}
    const comptesMap: Record<string, string> = {}
    existingF?.forEach(f => {
      feesMap[f.category_id] = f.amount.toString()
      if (f.compte) comptesMap[f.category_id] = f.compte
    })
    setFees(feesMap)
    setComptes(comptesMap)
    setHasFeeConfigs((existingF?.length ?? 0) > 0)
    setFeeConfigsLoaded(true)
  }

  const saveFees = async () => {
    if (!activeSeason) return

    const allCategoryIds = new Set([
      ...Object.keys(fees).filter(id => parseFloat(fees[id]) > 0),
      ...Object.keys(comptes).filter(id => comptes[id]?.trim())
    ])

    const records = Array.from(allCategoryIds).map(categoryId => ({
      season_id: activeSeason.id,
      category_id: categoryId,
      category_name: categories.find(c => c.id === categoryId)?.name || '',
      amount: parseFloat(fees[categoryId] || '0') || 0,
      compte: comptes[categoryId]?.trim() || null
    }))

    const { error } = await supabase
      .from('fee_configs')
      .upsert(records, {
        onConflict: 'season_id,category_id'
      })

    if (error) {
      showToast('Erreur lors de l\'enregistrement', 'error')
    } else {
      showToast('Montants enregistrés !', 'success')
      loadData()
    }
  }

  const handleCopyFromPrevious = useCallback(async () => {
    if (!activeSeason) return
    setCopyMsg(null)
    setCopying(true)

    const { data: prevSeason, error: psErr } = await supabase
      .from('seasons')
      .select('id, name, start_date')
      .lt('start_date', activeSeason.start_date)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (psErr) {
      setCopyMsg('Erreur : ' + psErr.message)
      setCopying(false)
      return
    }
    if (!prevSeason) {
      setCopyMsg('Aucune saison précédente trouvée.')
      setCopying(false)
      return
    }

    const { data: prevFees, error: pfErr } = await supabase
      .from('fee_configs')
      .select('category_id, category_name, amount, currency, description, compte')
      .eq('season_id', prevSeason.id)

    if (pfErr) {
      setCopyMsg('Erreur : ' + pfErr.message)
      setCopying(false)
      return
    }
    if (!prevFees || prevFees.length === 0) {
      setCopyMsg('Aucun tarif à reprendre.')
      setCopying(false)
      return
    }

    setConfirmCopy({ count: prevFees.length, seasonName: prevSeason.name })
    setCopying(false)
  }, [activeSeason])

  const executeCopy = useCallback(async () => {
    if (!activeSeason || !confirmCopy) return
    setCopying(true)
    setConfirmCopy(null)

    const { data: prevSeason } = await supabase
      .from('seasons')
      .select('id')
      .lt('start_date', activeSeason.start_date)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!prevSeason) {
      setCopyMsg('Saison précédente introuvable.')
      setCopying(false)
      return
    }

    const { data: prevFees, error: pfErr } = await supabase
      .from('fee_configs')
      .select('category_id, category_name, amount, currency, description, compte')
      .eq('season_id', prevSeason.id)

    if (pfErr || !prevFees || prevFees.length === 0) {
      setCopyMsg(pfErr ? 'Erreur : ' + pfErr.message : 'Aucun tarif à reprendre.')
      setCopying(false)
      return
    }

    const rows = prevFees.map(f => ({
      season_id: activeSeason.id,
      category_id: f.category_id,
      category_name: f.category_name,
      amount: f.amount,
      currency: f.currency || 'CHF',
      description: f.description || null,
      compte: f.compte || null,
    }))

    const { error: insErr } = await supabase.from('fee_configs').insert(rows)
    if (insErr) {
      setCopyMsg('Erreur lors de la copie : ' + insErr.message)
      setCopying(false)
      return
    }

    setCopying(false)
    setCopyMsg(null)
    showToast(`Tarifs repris de la saison ${confirmCopy.seasonName}.`, 'success')
    loadData()
  }, [activeSeason, confirmCopy])

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  if (!embedded && moduleLoading) {
    return <div style={{ color: 'var(--text-primary)', padding: '32px' }}>Chargement...</div>
  }

  if (!embedded && !canView) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: '32px', textAlign: 'center' }}>
        Accès non autorisé
      </div>
    )
  }

  return (
    <div style={embedded ? {} : { maxWidth: '800px', margin: '0 auto' }}>
      {!embedded && (
        <h1 style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '24px' }}>
          <Wallet size={20} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '8px', color: 'var(--accent)' }} />Cotisations <PageTitleCount total={Object.keys(fees).length} />
        </h1>
      )}

      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        padding: '24px'
      }}>
        <h2 style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: '700', marginBottom: '20px' }}>
          Configuration des montants par catégorie
        </h2>

        {activeSeason && (
          <div style={{
            background: 'var(--success-soft)',
            border: '1px solid var(--success)',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <Calendar size={20} aria-hidden="true" style={{ color: 'var(--accent)' }} />
            <div>
              <div style={{ color: 'var(--success-text)', fontWeight: '700' }}>
                Saison active: {activeSeason.name}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                Préfixe factures: {activeSeason.invoice_prefix}
              </div>
            </div>
          </div>
        )}

        {feeConfigsLoaded && !hasFeeConfigs && canEdit && (
          <div style={{
            background: 'var(--bg-secondary, #f9fafb)',
            border: '1px dashed var(--border-color)',
            borderRadius: '10px',
            padding: '32px 24px',
            textAlign: 'center',
            marginBottom: '24px'
          }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '15px', marginBottom: '16px' }}>
              Aucun tarif défini pour cette saison.
            </p>
            {confirmCopy ? (
              <div>
                <p style={{ color: 'var(--text-primary)', fontSize: '14px', marginBottom: '12px' }}>
                  {confirmCopy.count} catégorie{confirmCopy.count > 1 ? 's' : ''}, tarifs et n° de compte inclus
                </p>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                  <Button onClick={executeCopy} disabled={copying}>
                    {copying ? 'Copie...' : 'Confirmer'}
                  </Button>
                  <button
                    onClick={() => setConfirmCopy(null)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-card)',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <Button onClick={handleCopyFromPrevious} disabled={copying}>
                <Copy size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '6px' }} />
                {copying ? 'Recherche...' : 'Reprendre les tarifs de la saison précédente'}
              </Button>
            )}
            {copyMsg && (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '12px' }}>
                {copyMsg}
              </p>
            )}
          </div>
        )}

        {['junior', 'active'].map(type => {
          const filtered = categories.filter(c => c.type === type)
          if (filtered.length === 0) return null
          return (
            <div key={type} style={{ marginBottom: '24px' }}>
              <div style={{
                color: type === 'junior' ? 'var(--accent)' : 'var(--success-text)',
                fontWeight: '700',
                fontSize: '14px', marginBottom: '8px',
                textTransform: 'uppercase', letterSpacing: '0.05em'
              }}>
                {type === 'junior' ? 'Juniors' : 'Équipes actives'}
              </div>
              <DataTableShell bare scrollable={false}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 0', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>
                      Catégorie
                    </th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600', width: '150px' }}>
                      Compte
                    </th>
                    <th style={{ textAlign: 'right', padding: '8px 0', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600', width: '160px' }}>
                      Montant
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(cat => (
                    <tr
                      key={cat.id}
                      style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={{ padding: '10px 0', color: 'var(--text-primary)', fontSize: '14px' }}>
                        {cat.name}
                      </td>
                      <td style={{ padding: '10px 12px', width: '150px' }}>
                        <input
                          type="text"
                          value={comptes[cat.id] || ''}
                          onChange={e => setComptes({ ...comptes, [cat.id]: e.target.value })}
                          placeholder="—"
                          disabled={!canEdit}
                          style={{
                            width: '100%',
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            padding: '8px 12px',
                            color: 'var(--text-primary)',
                            fontSize: '13px',
                            outline: 'none'
                          }}
                        />
                      </td>
                      <td style={{ padding: '10px 0', width: '160px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            value={fees[cat.id] || ''}
                            onChange={e => setFees({ ...fees, [cat.id]: e.target.value })}
                            placeholder="0.00"
                            disabled={!canEdit}
                            style={{
                              width: '100px',
                              background: 'var(--bg-input)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '8px',
                              padding: '8px 12px',
                              color: 'var(--text-primary)',
                              fontSize: '14px',
                              textAlign: 'right',
                              outline: 'none'
                            }}
                          />
                          <span style={{ color: 'var(--text-muted)', fontSize: '14px', minWidth: '30px' }}>CHF</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </DataTableShell>
            </div>
          )
        })}

        {canEdit && (
          <Button onClick={saveFees} className="w-full">
            <Save size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Enregistrer les montants
          </Button>
        )}
      </div>

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
