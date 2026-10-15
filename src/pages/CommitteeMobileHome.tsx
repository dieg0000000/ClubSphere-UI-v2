import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useTenant } from '../context/TenantContext'
import { RoleBadges } from '../components/RoleBadges'
import { FileText, UserCheck, Receipt, MapPin, Loader as Loader2 } from 'lucide-react'
import { RainModeToggle } from '../components/RainModeToggle'
import { Toast } from '../components/Toast'
import { useToast } from '../hooks/useToast'

interface CounterCard {
  key: string
  label: string
  icon: typeof FileText
  count: number | null
  path: string
}

function formatCHF(v: number): string {
  return v.toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function CommitteeMobileHome() {
  const { user } = useAuth()
  const { clubId } = useTenant()
  const navigate = useNavigate()
  const { toast: rainToast, showToast: showRainToast } = useToast()

  const [firstName, setFirstName] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  const [inscriptions, setInscriptions] = useState<number | null>(null)
  const [activations, setActivations] = useState<number | null>(null)
  const [expenses, setExpenses] = useState<number | null>(null)
  const [addressAlerts, setAddressAlerts] = useState<number | null>(null)

  const [finLoading, setFinLoading] = useState(true)
  const [finError, setFinError] = useState(false)
  const [netFacture, setNetFacture] = useState(0)
  const [encaisse, setEncaisse] = useState(0)
  const [debiteurs, setDebiteurs] = useState(0)
  const [debiteursRetard, setDebiteursRetard] = useState(0)

  useEffect(() => {
    if (!user?.id) return
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.full_name) setFirstName(data.full_name.split(' ')[0])
      })
  }, [user?.id])

  useEffect(() => {
    if (!clubId) return
    supabase
      .from('club_settings')
      .select('logo_url')
      .eq('club_id', clubId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.logo_url) setLogoUrl(data.logo_url)
      })
  }, [clubId])

  // "À traiter" counters
  useEffect(() => {
    if (!user?.id || !clubId) return

    Promise.all([
      supabase
        .from('inscription_requests')
        .select('id', { count: 'exact', head: true })
        .in('status', ['pending', 'in_progress']),
      supabase
        .from('activation_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('expenses')
        .select('id', { count: 'exact', head: true })
        .eq('club_id', clubId)
        .eq('status', 'submitted'),
      supabase
        .from('address_change_alerts')
        .select('id', { count: 'exact', head: true })
        .is('acknowledged_at', null),
    ]).then(([insRes, actRes, expRes, addrRes]) => {
      setInscriptions(insRes.count ?? 0)
      setActivations(actRes.count ?? 0)
      setExpenses(expRes.count ?? 0)
      setAddressAlerts(addrRes.count ?? 0)
    })
  }, [user?.id, clubId])

  // Finance summary — reuse exact same RPC as the desktop situation page
  useEffect(() => {
    if (!clubId) return
    let cancelled = false

    ;(async () => {
      const { data: seasons } = await supabase
        .from('seasons')
        .select('id, active')
        .order('start_date', { ascending: false })
        .limit(10)
      if (cancelled) return
      const active = seasons?.find(s => s.active) || seasons?.[0]
      if (!active) { setFinLoading(false); return }

      const { data, error } = await supabase.rpc('get_season_financial_report', { p_season_id: active.id })
      if (cancelled) return
      if (error || !data) {
        setFinError(true)
        setFinLoading(false)
        return
      }
      const r = data as any
      const cotis = r.cotisations || {}
      const spon = r.sponsoring || {}
      setNetFacture((cotis.net_facture || 0) + (spon.net_facture || 0))
      setEncaisse((cotis.encaisse || 0) + (spon.encaisse || 0))
      setDebiteurs((cotis.debiteurs || 0) + (spon.debiteurs || 0))
      setDebiteursRetard((cotis.debiteurs_retard || 0) + (spon.debiteurs_retard || 0))
      setFinLoading(false)
    })()

    return () => { cancelled = true }
  }, [clubId])

  const cards: CounterCard[] = [
    { key: 'inscriptions', label: 'Inscriptions en ligne', icon: FileText, count: inscriptions, path: '/comite/inscriptions' },
    { key: 'activations', label: 'Activations', icon: UserCheck, count: activations, path: '/comite/activations' },
    { key: 'expenses', label: 'Notes de frais', icon: Receipt, count: expenses, path: '/comite/depenses' },
    { key: 'addresses', label: 'Adresses à reporter', icon: MapPin, count: addressAlerts, path: '/dashboard' },
  ]

  return (
    <div style={{ maxWidth: 500, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        {logoUrl && (
          <img
            src={logoUrl}
            alt="Logo"
            style={{ width: 44, height: 44, borderRadius: '10px', objectFit: 'contain', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
          />
        )}
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            Bonjour{firstName ? ` ${firstName}` : ''} !
          </h1>
          <RoleBadges />
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <RainModeToggle onToast={showRainToast} />
      </div>

      {/* À traiter */}
      <section style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
          À traiter
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {cards.map(c => {
            const isZero = c.count === 0
            const isLoading = c.count === null
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => navigate(c.path)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                  padding: '14px', borderRadius: '12px', border: '1px solid var(--border-color)',
                  background: 'var(--bg-card)', cursor: 'pointer',
                  opacity: isZero ? 0.5 : 1,
                  transition: 'box-shadow 0.15s',
                }}
              >
                <c.icon size={20} style={{ color: isZero ? 'var(--text-muted)' : 'var(--accent)', marginBottom: '8px' }} />
                {isLoading ? (
                  <Loader2 size={18} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
                ) : (
                  <span style={{
                    fontSize: '26px', fontWeight: 800, lineHeight: 1,
                    color: isZero ? 'var(--text-muted)' : 'var(--text-primary)',
                    marginBottom: '4px',
                  }}>
                    {c.count}
                  </span>
                )}
                <span style={{ fontSize: '12px', color: isZero ? 'var(--text-muted)' : 'var(--text-secondary)', lineHeight: 1.3, textAlign: 'left' }}>
                  {c.label}
                </span>
                {isZero && (
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'left', marginTop: '2px' }}>
                    Rien à traiter
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </section>

      {/* Finances */}
      <section>
        <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
          Finances
        </h2>
        <div style={{
          padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)',
          background: 'var(--bg-card)',
        }}>
          {finLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
              <Loader2 size={22} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          ) : finError ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>
              Impossible de charger les données financières.
            </p>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' }}>
                <FinFigure label="Facturé" value={netFacture} />
                <FinFigure label="Encaissé" value={encaisse} accent />
                <FinFigure label="Ouvert" value={debiteurs} />
                <FinFigure label="En retard" value={debiteursRetard} warning />
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '12px', marginBottom: 0, textAlign: 'center' }}>
                Détails et actions sur ordinateur
              </p>
            </>
          )}
        </div>
      </section>
      <Toast toast={rainToast} />
    </div>
  )
}

function FinFigure({ label, value, accent, warning }: { label: string; value: number; accent?: boolean; warning?: boolean }) {
  let color = 'var(--text-primary)'
  if (accent) color = 'var(--success, #059669)'
  if (warning && value > 0) color = 'var(--warning, #d97706)'
  return (
    <div>
      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '0 0 2px', fontWeight: 500 }}>{label}</p>
      <p style={{ fontSize: '18px', fontWeight: 700, color, margin: 0 }}>
        CHF {formatCHF(value)}
      </p>
    </div>
  )
}
