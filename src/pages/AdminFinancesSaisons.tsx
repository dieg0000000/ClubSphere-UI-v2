import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Wallet } from 'lucide-react'
import { StandardModal } from '../components/StandardModal'
import { useToast } from '../hooks/useToast'
import { Toast } from '../components/Toast'
import Button from '../components/ui/Button'

interface Season {
  id: string
  name: string
  code: string
  invoice_prefix: string
  invoice_next_number: number
  start_date: string
  end_date: string
  active: boolean
}

export function AdminFinancesSaisons() {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewSeasonModal, setShowNewSeasonModal] = useState(false)
  const [showFeeConfigModal, setShowFeeConfigModal] = useState(false)
  const [selectedSeason, setSelectedSeason] = useState<Season | null>(null)
  const [newSeason, setNewSeason] = useState({
    start_date: '',
    end_date: '',
    invoice_prefix: ''
  })
  const { toast, showToast } = useToast()

  useEffect(() => { document.title = 'Saisons - ClubSphere' }, [])

  useEffect(() => {
    loadSeasons()
  }, [])

  const loadSeasons = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('seasons')
      .select('*')
      .order('start_date', { ascending: false })

    if (data) {
      setSeasons(data)
    }
    setLoading(false)
  }

  const getSaisonCode = (startDate: string) => {
    const year = new Date(startDate).getFullYear()
    const start = String(year).slice(2)
    const end = String(year + 1).slice(2)
    return {
      code: `${start}${end}`,
      prefix: `FA${start}${end}`,
      name: `${year}-${year + 1}`
    }
  }

  const handleStartDateChange = (date: string) => {
    const { code, prefix, name } = getSaisonCode(date)
    const startYear = new Date(date).getFullYear()
    const endDate = `${startYear + 1}-06-30`

    setNewSeason({
      start_date: date,
      end_date: endDate,
      invoice_prefix: prefix
    })
  }

  const createSeason = async () => {
    if (!newSeason.start_date || !newSeason.end_date) {
      showToast('Veuillez remplir tous les champs', 'warning')
      return
    }

    const { code, name } = getSaisonCode(newSeason.start_date)

    const { error } = await supabase
      .from('seasons')
      .insert({
        name,
        code,
        invoice_prefix: newSeason.invoice_prefix,
        invoice_next_number: 1,
        start_date: newSeason.start_date,
        end_date: newSeason.end_date,
        active: false
      })

    if (error) {
      console.error('Error creating season:', error)
      showToast('Erreur lors de la création de la saison', 'error')
    } else {
      setShowNewSeasonModal(false)
      setNewSeason({ start_date: '', end_date: '', invoice_prefix: '' })
      loadSeasons()
    }
  }

  const activateSeason = async (seasonId: string) => {
    await supabase
      .from('seasons')
      .update({ active: false })
      .neq('id', seasonId)

    await supabase
      .from('seasons')
      .update({ active: true })
      .eq('id', seasonId)

    loadSeasons()
  }

  const openFeeConfig = (season: Season) => {
    setSelectedSeason(season)
    setShowFeeConfigModal(true)
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    background: 'var(--bg-hover)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    fontSize: '14px'
  }

  if (loading) {
    return <div style={{ color: 'var(--text-primary)' }}>Chargement...</div>
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)' }}>
          Saisons
        </h1>
        <Button
          onClick={() => setShowNewSeasonModal(true)}
          leftIcon={<Plus size={20} />}
        >
          Nouvelle saison
        </Button>
      </div>

      <div style={{ display: 'grid', gap: '12px' }}>
        {seasons.map((season) => (
          <div
            key={season.id}
            style={{
              background: 'var(--bg-card)',
              border: `1px solid ${season.active ? 'var(--success)' : 'var(--border-color)'}`,
              borderRadius: '12px',
              padding: '20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <div>
              <div style={{ color: 'var(--text-primary)', fontWeight: '700', fontSize: '18px' }}>
                {season.name}
                {season.active && (
                  <span style={{
                    background: 'var(--success-soft)',
                    color: 'var(--success-text)',
                    border: '1px solid var(--success)',
                    borderRadius: '99px',
                    padding: '2px 10px',
                    fontSize: '12px',
                    fontWeight: '700',
                    marginLeft: '10px'
                  }}>
                    Saison active
                  </span>
                )}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
                {new Date(season.start_date).toLocaleDateString('fr-CH')} — {new Date(season.end_date).toLocaleDateString('fr-CH')}
              </div>
              <div style={{ color: 'var(--accent)', fontSize: '13px', marginTop: '4px' }}>
                Préfixe: {season.invoice_prefix} — Prochain n°: {season.invoice_prefix}-{String(season.invoice_next_number).padStart(4, '0')}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              {!season.active && (
                <button
                  onClick={() => activateSeason(season.id)}
                  style={{
                    background: 'var(--success-soft)',
                    color: 'var(--success-text)',
                    border: '1px solid var(--success)',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '13px'
                  }}
                >
                  Activer
                </button>
              )}
              <button
                onClick={() => openFeeConfig(season)}
                style={{
                  background: 'var(--info-soft)',
                  color: 'var(--info-text)',
                  border: '1px solid var(--accent)',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '13px'
                }}
              >
                <Wallet size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Configurer les cotisations
              </button>
            </div>
          </div>
        ))}
      </div>

      <StandardModal
        isOpen={showNewSeasonModal}
        onClose={() => setShowNewSeasonModal(false)}
        title="Nouvelle saison"
        width="500px"
      >
            <div style={{ display: 'grid', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '13px', marginBottom: '6px' }}>
                  Date de début
                </label>
                <input
                  type="date"
                  value={newSeason.start_date}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '13px', marginBottom: '6px' }}>
                  Date de fin
                </label>
                <input
                  type="date"
                  value={newSeason.end_date}
                  onChange={(e) => setNewSeason({ ...newSeason, end_date: e.target.value })}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '13px', marginBottom: '6px' }}>
                  Préfixe facture
                </label>
                <input
                  type="text"
                  value={newSeason.invoice_prefix}
                  onChange={(e) => setNewSeason({ ...newSeason, invoice_prefix: e.target.value })}
                  placeholder="FA2526"
                  style={inputStyle}
                />
              </div>

              {newSeason.start_date && (
                <div style={{
                  color: 'var(--success-text)',
                  fontSize: '13px',
                  background: 'var(--success-soft)',
                  padding: '10px',
                  borderRadius: '8px'
                }}>
                  Saison: {getSaisonCode(newSeason.start_date).name}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <Button
                variant="secondary"
                onClick={() => setShowNewSeasonModal(false)}
                className="flex-1"
              >
                Annuler
              </Button>
              <Button
                onClick={createSeason}
                className="flex-1"
              >
                Créer
              </Button>
            </div>
      </StandardModal>

      {showFeeConfigModal && selectedSeason && (
        <FeeConfigModal
          season={selectedSeason}
          onClose={() => {
            setShowFeeConfigModal(false)
            setSelectedSeason(null)
          }}
        />
      )}
      <Toast toast={toast} />
    </div>
  )
}

function FeeConfigModal({ season, onClose }: { season: Season; onClose: () => void }) {
  const [categories, setCategories] = useState<any[]>([])
  const [fees, setFees] = useState<{ [key: string]: string }>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { toast, showToast } = useToast()

  useEffect(() => {
    loadCategories()
  }, [])

  const loadCategories = async () => {
    setLoading(true)

    const { data: cats } = await supabase
      .from('team_categories')
      .select('id, name, type')
      .order('type', { ascending: false })
      .order('name')

    const { data: existingFees } = await supabase
      .from('fee_configs')
      .select('*')
      .eq('season_id', season.id)

    if (cats) {
      setCategories(cats)
    }

    if (existingFees) {
      const feesMap: { [key: string]: string } = {}
      existingFees.forEach((fee: any) => {
        feesMap[fee.category_id] = fee.amount.toString()
      })
      setFees(feesMap)
    }

    setLoading(false)
  }

  const saveFees = async () => {
    setSaving(true)
    try {
      const records = Object.entries(fees)
        .filter(([_, amount]) => amount && parseFloat(amount) > 0)
        .map(([categoryId, amount]) => ({
          season_id: season.id,
          category_id: categoryId,
          category_name: categories.find((c) => c.id === categoryId)?.name,
          amount: parseFloat(amount)
        }))

      await supabase
        .from('fee_configs')
        .delete()
        .eq('season_id', season.id)

      if (records.length > 0) {
        await supabase
          .from('fee_configs')
          .insert(records)
      }

      showToast('Cotisations enregistrées avec succès', 'success')
      onClose()
    } catch (error) {
      console.error('Error saving fees:', error)
      showToast('Erreur lors de l\'enregistrement', 'error')
    }
    setSaving(false)
  }

  const inputStyle = {
    width: '100px',
    padding: '8px 12px',
    background: 'var(--bg-hover)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    fontSize: '14px',
    textAlign: 'right' as const
  }

  const juniorCategories = categories.filter((c) => c.type === 'juniors')
  const activeCategories = categories.filter((c) => c.type === 'actifs')

  return (
    <>
    <StandardModal
      isOpen={true}
      onClose={onClose}
      title="Configurer les cotisations"
      subtitle={`Saison ${season.name}`}
      width="700px"
      maxHeight="80vh"
    >
        {loading ? (
          <div style={{ color: 'var(--text-primary)' }}>Chargement...</div>
        ) : (
          <>
            <h4 style={{ color: 'var(--accent)', marginBottom: '12px', fontSize: '16px', fontWeight: '600' }}>
              Juniors
            </h4>
            <div style={{ marginBottom: '24px' }}>
              {juniorCategories.map((cat) => (
                <div
                  key={cat.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 0',
                    borderBottom: '1px solid var(--border-color)'
                  }}
                >
                  <span style={{ color: 'var(--text-primary)' }}>{cat.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="number"
                      step="0.05"
                      value={fees[cat.id] || ''}
                      onChange={(e) => setFees({ ...fees, [cat.id]: e.target.value })}
                      placeholder="0.00"
                      style={inputStyle}
                    />
                    <span style={{ color: 'var(--text-muted)' }}>CHF</span>
                  </div>
                </div>
              ))}
            </div>

            <h4 style={{ color: 'var(--success)', marginBottom: '12px', fontSize: '16px', fontWeight: '600' }}>
              Actifs
            </h4>
            <div>
              {activeCategories.map((cat) => (
                <div
                  key={cat.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 0',
                    borderBottom: '1px solid var(--border-color)'
                  }}
                >
                  <span style={{ color: 'var(--text-primary)' }}>{cat.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="number"
                      step="0.05"
                      value={fees[cat.id] || ''}
                      onChange={(e) => setFees({ ...fees, [cat.id]: e.target.value })}
                      placeholder="0.00"
                      style={inputStyle}
                    />
                    <span style={{ color: 'var(--text-muted)' }}>CHF</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button onClick={saveFees} disabled={saving} className="flex-1">
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </div>
    </StandardModal>
    <Toast toast={toast} />
    </>
  )
}
