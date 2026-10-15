import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTenant } from '../context/TenantContext'
import { ChevronLeft, Loader as Loader2, Monitor as DesktopIcon } from 'lucide-react'

/* ── types ── */

interface SnapshotRecette {
  type: string
  label: string
  nb_factures: number
  facture: number
  encaisse: number
  impaye: number
}

interface SnapshotData {
  season: { id: string; name: string; start_date: string; end_date: string; active: boolean }
  recettes: SnapshotRecette[]
  recettes_total: { facture: number; encaisse: number; impaye: number }
  depenses: { payees: number; engagees: number; a_traiter: number }
  solde_tresorerie: number
}

interface Season {
  id: string
  name: string
  active: boolean
  start_date: string
}

/* ── helpers ── */

function formatCHF(v: number): string {
  return v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'")
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/* ── component ── */

export default function CommitteeMobileFinances() {
  const { clubId } = useTenant()
  const navigate = useNavigate()

  const [seasons, setSeasons] = useState<Season[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('')
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  const loadSnapshot = useCallback(async (seasonId: string | null) => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.rpc('get_club_finance_snapshot', {
      p_season_id: seasonId,
    })
    if (err) {
      setError('Impossible de charger les données.')
      setSnapshot(null)
    } else {
      setSnapshot(data as SnapshotData)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!selectedSeasonId) return
    loadSnapshot(selectedSeasonId)
  }, [selectedSeasonId, loadSnapshot])

  const today = formatDate(new Date().toISOString())
  const seasonName = snapshot?.season?.name || seasons.find(s => s.id === selectedSeasonId)?.name || ''

  return (
    <div style={{ maxWidth: 500, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
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
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            Situation financière
          </h1>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
            {seasonName ? `Saison ${seasonName}` : ''}{seasonName ? ' · ' : ''}arrêtée au {today}
          </p>
        </div>
      </div>

      {/* Season selector */}
      {seasons.length > 1 && (
        <div style={{ marginBottom: '16px' }}>
          <select
            value={selectedSeasonId}
            onChange={e => setSelectedSeasonId(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: '8px',
              border: '1px solid var(--border-color)', background: 'var(--bg-card)',
              color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500,
            }}
          >
            {seasons.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}{s.active ? ' (active)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      ) : error ? (
        <div style={{
          padding: '20px', borderRadius: '12px', background: 'var(--bg-card)',
          border: '1px solid var(--border-color)', textAlign: 'center',
        }}>
          <p style={{ color: 'var(--error, #dc2626)', fontSize: '14px', margin: 0 }}>{error}</p>
        </div>
      ) : snapshot ? (
        <>
          {/* Hero — Solde de trésorerie */}
          <div style={{
            padding: '20px', borderRadius: '14px', border: '1px solid var(--border-color)',
            background: 'var(--bg-card)', marginBottom: '14px', textAlign: 'center',
          }}>
            <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Solde de trésorerie
            </p>
            <p style={{
              fontSize: '32px', fontWeight: 800, margin: '0 0 12px', lineHeight: 1.1,
              color: snapshot.solde_tresorerie < 0 ? 'var(--error, #dc2626)' : 'var(--text-primary)',
            }}>
              CHF {formatCHF(snapshot.solde_tresorerie)}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', marginBottom: '10px' }}>
              <div>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 1px' }}>Encaissé</p>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--success, #059669)', margin: 0 }}>
                  CHF {formatCHF(snapshot.recettes_total.encaisse)}
                </p>
              </div>
              <div>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 1px' }}>− Dépenses payées</p>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                  CHF {formatCHF(snapshot.depenses.payees)}
                </p>
              </div>
            </div>
            {snapshot.depenses.engagees > 0 && (
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, fontStyle: 'italic' }}>
                Engagées (approuvées, à venir) : CHF {formatCHF(snapshot.depenses.engagees)}
              </p>
            )}
          </div>

          {/* Recettes par type */}
          <div style={{
            padding: '16px', borderRadius: '14px', border: '1px solid var(--border-color)',
            background: 'var(--bg-card)', marginBottom: '14px',
          }}>
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>
              Recettes par type
            </h2>

            {snapshot.recettes.map((r, i) => (
              <RecetteRow key={r.type} row={r} isLast={i === snapshot.recettes.length - 1} />
            ))}

            {/* TOTAL row */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              paddingTop: '10px', borderTop: '2px solid var(--border-color)',
              marginTop: '2px',
            }}>
              <div>
                <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  TOTAL
                </p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '1px 0 0' }}>
                  {snapshot.recettes.reduce((s, r) => s + r.nb_factures, 0)} factures
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <FigureLine label="Facturé" value={snapshot.recettes_total.facture} bold />
                <FigureLine label="Encaissé" value={snapshot.recettes_total.encaisse} bold color="var(--success, #059669)" />
                <FigureLine label="Impayé" value={snapshot.recettes_total.impaye} bold amber={snapshot.recettes_total.impaye > 0} />
              </div>
            </div>
          </div>

          {/* Desktop CTA */}
          <div style={{
            padding: '14px 16px', borderRadius: '12px',
            background: 'var(--accent-soft, rgba(0,100,200,0.06))',
            border: '1px solid var(--accent, #2563eb)',
          }}>
            <p style={{ fontWeight: 700, fontSize: '13px', color: 'var(--accent)', margin: '0 0 4px' }}>
              <DesktopIcon size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }} />
              Poste de travail complet sur ordinateur
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              Répartition par catégorie, dépenses par compte, export Excel et impression.
            </p>
          </div>
        </>
      ) : null}
    </div>
  )
}

/* ── sub-components ── */

function RecetteRow({ row, isLast }: { row: SnapshotRecette; isLast: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      paddingBottom: isLast ? '10px' : '10px',
      marginBottom: isLast ? '0' : '10px',
      borderBottom: isLast ? 'none' : '1px solid var(--border-color)',
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          {row.label}
        </p>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '1px 0 0' }}>
          {row.nb_factures} facture{row.nb_factures !== 1 ? 's' : ''}
        </p>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <FigureLine label="Facturé" value={row.facture} />
        <FigureLine label="Encaissé" value={row.encaisse} color="var(--success, #059669)" />
        <FigureLine label="Impayé" value={row.impaye} amber={row.impaye > 0} />
      </div>
    </div>
  )
}

function FigureLine({ label, value, bold, color, amber }: {
  label: string
  value: number
  bold?: boolean
  color?: string
  amber?: boolean
}) {
  let c = color || 'var(--text-primary)'
  if (amber) c = 'var(--warning, #d97706)'
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: '6px', marginBottom: '1px' }}>
      <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: '13px', fontWeight: bold ? 700 : 500, color: c, fontVariantNumeric: 'tabular-nums' }}>
        {formatCHF(value)}
      </span>
    </div>
  )
}
