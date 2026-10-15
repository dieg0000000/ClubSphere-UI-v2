import { useEffect, useState, useCallback, useMemo, Fragment } from 'react'
import { supabase } from './lib/supabase'
import { invokeFunction } from './lib/invokeFunction'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { formatAsYouType, isValidPhone, normalizePhone } from './utils/phoneHelpers'
import { Tabs } from './components/ui/Tabs'
import { StatusPill } from './components/ui/StatusPill'
import { MfaChallengeScreen } from './components/MfaChallengeScreen'
import { MfaEnrollmentScreen } from './components/MfaEnrollmentScreen'
import PasswordInput from './components/PasswordInput'
import { Monitor, Sun, Moon } from 'lucide-react'
import Button from './components/ui/Button'
import type { Session } from '@supabase/supabase-js'

type ConsoleThemeMode = 'light' | 'dark' | 'system'
const CONSOLE_THEME_KEY = 'clubsphere-console-theme'

function getSystemPref(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolveConsoleTheme(mode: ConsoleThemeMode): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode
  return getSystemPref()
}

function applyConsoleTheme(resolved: 'light' | 'dark') {
  if (resolved === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

// Apply theme synchronously before first paint (only in console mode)
;(() => {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  const hostname = window.location.hostname
  const isConsole = hostname.startsWith('console.') || params.get('console') === '1' || (import.meta.env.VITE_CONSOLE_MODE as string | undefined) === '1'
  if (!isConsole) return
  const stored = localStorage.getItem(CONSOLE_THEME_KEY) as ConsoleThemeMode | null
  const mode: ConsoleThemeMode = (stored && ['light', 'dark', 'system'].includes(stored)) ? stored : 'dark'
  applyConsoleTheme(resolveConsoleTheme(mode))
})()

function useConsoleTheme() {
  const [mode, setModeState] = useState<ConsoleThemeMode>(() => {
    if (typeof window === 'undefined') return 'dark'
    const stored = localStorage.getItem(CONSOLE_THEME_KEY) as ConsoleThemeMode | null
    if (stored && ['light', 'dark', 'system'].includes(stored)) return stored
    return 'dark'
  })

  const setMode = useCallback((m: ConsoleThemeMode) => {
    setModeState(m)
    localStorage.setItem(CONSOLE_THEME_KEY, m)
    applyConsoleTheme(resolveConsoleTheme(m))
  }, [])

  useEffect(() => {
    applyConsoleTheme(resolveConsoleTheme(mode))
  }, [mode])

  useEffect(() => {
    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyConsoleTheme(resolveConsoleTheme('system'))
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode])

  return { mode, setMode }
}

function ConsoleThemeToggle({ mode, setMode }: { mode: ConsoleThemeMode; setMode: (m: ConsoleThemeMode) => void }) {
  const options: { m: ConsoleThemeMode; icon: typeof Monitor; label: string }[] = [
    { m: 'system', icon: Monitor, label: 'Système' },
    { m: 'light', icon: Sun, label: 'Clair' },
    { m: 'dark', icon: Moon, label: 'Sombre' },
  ]
  return (
    <div style={{ display: 'flex', gap: 4, background: 'var(--bg-hover)', borderRadius: 8, padding: 3 }}>
      {options.map(({ m, icon: Icon, label }) => (
        <button key={m} onClick={() => setMode(m)} title={label} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 30, height: 30, borderRadius: 6, border: 'none', cursor: 'pointer',
          background: mode === m ? 'var(--bg-card)' : 'transparent',
          color: mode === m ? 'var(--text-primary)' : 'var(--text-muted)',
          boxShadow: mode === m ? 'var(--shadow-sm)' : 'none',
          transition: 'all 0.15s ease',
        }}>
          <Icon size={15} />
        </button>
      ))}
    </div>
  )
}

type AccessState = 'loading' | 'granted' | 'denied'

interface ClubRow {
  id: string
  name: string
  slug: string
  active: boolean
  created_at: string
  player_count: number
  team_count: number
  monthly_tier_chf: number
  notice_active?: boolean
  billing_notice_active?: boolean
  accounts?: number | null
  active_7d?: number | null
  active_30d?: number | null
  last_activity_at?: string | null
}

interface ClubDetail {
  id: string
  name: string
  slug: string
  asf_club_number: string | null
  active: boolean
  created_at: string
  notes_internal: string | null
  address: string | null
  postal_code: string | null
  city: string | null
  email: string | null
  phone: string | null
  player_count: number
  team_count: number
  monthly_tier_chf: number
  notice_active?: boolean
  notice_message?: string | null
  billing_notice_active?: boolean
  billing_notice_message?: string | null
  admins: { profile_id: string; first_name: string | null; last_name: string | null; email: string | null; has_mfa?: boolean }[]
  usage?: {
    accounts: number
    online_15min: number
    active_today: number
    active_7d: number
    active_30d: number
    never_signed_in: number
    last_activity_at: string | null
    computed_at: string | null
    by_role: Record<string, { accounts: number; active_30d: number }>
  } | null
}

export default function ConsoleApp() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const consoleTheme = useConsoleTheme()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (!authReady) return <CenteredCard><Spinner /></CenteredCard>
  if (!session) return <LoginForm consoleTheme={consoleTheme} />
  return <ConsoleMfaGate session={session} consoleTheme={consoleTheme} />
}

function LoginForm({ consoleTheme }: { consoleTheme: { mode: ConsoleThemeMode; setMode: (m: ConsoleThemeMode) => void } }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) setError(signInError.message)
    setLoading(false)
  }

  return (
    <CenteredCard>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <ConsoleThemeToggle mode={consoleTheme.mode} setMode={consoleTheme.setMode} />
      </div>
      <img src="/logo-v1-400-transparent.png" alt="ClubSphere" style={{ height: 48, width: 'auto', marginBottom: 16 }} />
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)' }}>Console ClubSphere</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>Administration de la plateforme</p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
        <input type="email" placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)} required style={inputStyle} />
        <PasswordInput placeholder="Mot de passe" value={password}
          onChange={(e) => setPassword(e.target.value)} required style={inputStyle} />
        {error && <p style={{ color: 'var(--danger-text)', fontSize: 13, margin: 0 }}>{error}</p>}
        <button type="submit" disabled={loading} style={btnPrimary}>
          {loading ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>
    </CenteredCard>
  )
}

function ConsoleMfaGate({ session, consoleTheme }: { session: Session; consoleTheme: { mode: ConsoleThemeMode; setMode: (m: ConsoleThemeMode) => void } }) {
  const [mfaState, setMfaState] = useState<'loading' | 'enroll' | 'challenge' | 'ok'>('loading')
  const [passed, setPassed] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (!data) {
        setMfaState('ok')
        return
      }
      if (data.nextLevel === 'aal2') {
        if (data.currentLevel === 'aal1') {
          setMfaState('challenge')
        } else {
          setMfaState('ok')
        }
      } else {
        setMfaState('enroll')
      }
    })()
  }, [session.user.id])

  if (passed || mfaState === 'ok') {
    return <ConsoleDashboard session={session} consoleTheme={consoleTheme} />
  }

  if (mfaState === 'loading') {
    return <CenteredCard><Spinner /></CenteredCard>
  }

  if (mfaState === 'challenge') {
    return <MfaChallengeScreen onVerified={() => setPassed(true)} />
  }

  return <MfaEnrollmentScreen onEnrolled={() => setPassed(true)} />
}

function ConsoleDashboard({ session, consoleTheme }: { session: Session; consoleTheme: { mode: ConsoleThemeMode; setMode: (m: ConsoleThemeMode) => void } }) {
  const [access, setAccess] = useState<AccessState>('loading')
  const [clubs, setClubs] = useState<ClubRow[]>([])
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [dataLoading, setDataLoading] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'accueil' | 'facturation' | 'suivi' | 'stats' | 'activite' | 'support'>('accueil')
  const [detailClub, setDetailClub] = useState<ClubDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const handleRowClick = async (clubId: string) => {
    setDetailClub(null)
    setDetailError(null)
    setDetailLoading(true)
    const { data, error } = await invokeFunction('console-club-detail', {
      method: 'POST',
      body: { club_id: clubId },
    })
    if (error) {
      setDetailError(error || 'Erreur lors du chargement du club')
    } else if (data?.club) {
      setDetailClub(data.club)
    } else {
      setDetailError('Format de réponse inattendu')
    }
    setDetailLoading(false)
  }

  const closeDetail = () => {
    setDetailClub(null)
    setDetailError(null)
    setDetailLoading(false)
  }

  const loadClubs = useCallback(async () => {
    setDataLoading(true)
    setFetchError(null)
    const { data, error } = await invokeFunction('console-clubs-overview', { method: 'POST' })
    if (error) {
      setFetchError(error || 'Erreur lors du chargement des clubs')
    } else if (data?.clubs) {
      setClubs(data.clubs)
    } else {
      setFetchError('Format de réponse inattendu')
    }
    setDataLoading(false)
  }, [])

  useEffect(() => {
    supabase.rpc('is_platform_admin').then(({ data, error }) => {
      if (error || data !== true) {
        setAccess('denied')
      } else {
        setAccess('granted')
        loadClubs()
      }
    })
  }, [session.user.id, loadClubs])

  const handleLogout = async () => { await supabase.auth.signOut() }

  const handleClubCreated = (clubName: string) => {
    setShowCreateModal(false)
    setSuccessMsg(`Club "${clubName}" créé avec succès.`)
    loadClubs()
    setTimeout(() => setSuccessMsg(null), 5000)
  }

  if (access === 'loading') return <PageShell><Spinner /></PageShell>

  if (access === 'denied') {
    return (
      <CenteredCard>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>&#x1F6AB;</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>Accès refusé</h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24 }}>
            Réservé aux administrateurs de la plateforme.
          </p>
          <button onClick={handleLogout} style={btnSecondary}>Se déconnecter</button>
        </div>
      </CenteredCard>
    )
  }

  const totalClubs = clubs.length
  const totalPlayers = clubs.reduce((s, c) => s + (c.player_count || 0), 0)
  const totalTeams = clubs.reduce((s, c) => s + (c.team_count || 0), 0)
  const totalAccounts = clubs.reduce((s, c) => s + (c.accounts || 0), 0)
  const totalActive30 = clubs.reduce((s, c) => s + (c.active_30d || 0), 0)

  return (
    <PageShell>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 32, flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <img src="/logo-v1-400-transparent.png" alt="ClubSphere" style={{ height: 40, width: 'auto' }} />
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '4px 0 0' }}>{session.user.email}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <ConsoleThemeToggle mode={consoleTheme.mode} setMode={consoleTheme.setMode} />
          <button type="button" onClick={() => setShowCreateModal(true)} style={btnPrimary}>
            + Créer un club
          </button>
          <button type="button" onClick={handleLogout} style={btnSecondary}>Se déconnecter</button>
        </div>
      </div>

      {/* Success banner */}
      {successMsg && (
        <div style={{
          background: 'var(--success-soft)', border: '1px solid var(--success)', borderRadius: 8,
          padding: '12px 16px', color: 'var(--success)', fontSize: 14, marginBottom: 16,
        }}>
          {successMsg}
        </div>
      )}

      {/* Tab bar */}
      <div style={{ marginBottom: 24 }}>
        <Tabs
          items={[
            { key: 'accueil', label: 'Accueil' },
            { key: 'facturation', label: 'Facturation' },
            { key: 'suivi', label: 'Suivi Clubs' },
            { key: 'stats', label: 'Suivi Statistiques' },
            { key: 'activite', label: 'Activité' },
            { key: 'support', label: 'Support' },
          ]}
          value={activeTab}
          onChange={(key) => setActiveTab(key as typeof activeTab)}
        />
      </div>

      {/* Tab content */}
      {activeTab === 'accueil' ? (
        <>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16, marginBottom: 32,
          }}>
            <SummaryCard label="Clubs" value={String(totalClubs)} />
            <SummaryCard label="Joueurs" value={totalPlayers.toLocaleString('fr-CH')} />
            <SummaryCard label="Équipes" value={totalTeams.toLocaleString('fr-CH')} />
            <SummaryCard label="Comptes" value={totalAccounts.toLocaleString('fr-CH')} />
            <SummaryCard label="Actifs 30 j" value={totalActive30.toLocaleString('fr-CH')} />
          </div>

          {dataLoading ? (
            <Spinner />
          ) : fetchError ? (
            <div style={{
              background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 8,
              padding: 16, color: 'var(--danger-text)', fontSize: 14,
            }}>
              {fetchError}
            </div>
          ) : (
            <ClubsTable clubs={clubs} onRowClick={handleRowClick} />
          )}
        </>
      ) : activeTab === 'facturation' ? (
        dataLoading ? (
          <Spinner />
        ) : fetchError ? (
          <div style={{
            background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 8,
            padding: 16, color: 'var(--danger-text)', fontSize: 14,
          }}>
            {fetchError}
          </div>
        ) : (
          <BillingTable clubs={clubs} />
        )
      ) : activeTab === 'suivi' ? (
        <ClubSnapshotTab clubs={clubs} />
      ) : activeTab === 'stats' ? (
        <StatsTab clubs={clubs} />
      ) : activeTab === 'activite' ? (
        <ActivityTab clubs={clubs} />
      ) : (
        <SupportTab />
      )}

      {showCreateModal && (
        <CreateClubModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleClubCreated}
        />
      )}

      {(detailLoading || detailClub || detailError) && (
        <ClubDetailModal
          club={detailClub}
          loading={detailLoading}
          error={detailError}
          onClose={closeDetail}
          onRefresh={() => detailClub && handleRowClick(detailClub.id)}
        />
      )}
    </PageShell>
  )
}

/* ------------------------------------------------------------------ */
/*  Create Club Modal                                                  */
/* ------------------------------------------------------------------ */

interface CreateClubForm {
  name: string
  slug: string
  address: string
  postal_code: string
  city: string
  asf_number: string
  president_first_name: string
  president_last_name: string
  president_phone: string
  admin_email: string
  admin_first_name: string
  admin_last_name: string
  admin_phone: string
}

const emptyForm: CreateClubForm = {
  name: '', slug: '', address: '', postal_code: '', city: '', asf_number: '',
  president_first_name: '', president_last_name: '', president_phone: '',
  admin_email: '', admin_first_name: '', admin_last_name: '', admin_phone: '',
}

function CreateClubModal({ onClose, onCreated }: { onClose: () => void; onCreated: (name: string) => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const [form, setForm] = useState<CreateClubForm>(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [phoneErrors, setPhoneErrors] = useState<{ president?: string; admin?: string }>({})
  const [submitting, setSubmitting] = useState(false)

  const set = (key: keyof CreateClubForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const setPhone = (key: 'president_phone' | 'admin_phone') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatAsYouType(e.target.value, 'CH')
    setForm((f) => ({ ...f, [key]: formatted }))
    const errKey = key === 'president_phone' ? 'president' : 'admin'
    setPhoneErrors((prev) => ({ ...prev, [errKey]: undefined }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setPhoneErrors({})

    if (!form.name.trim() || !form.slug.trim()) {
      setError('Le nom et le slug sont obligatoires.')
      return
    }

    const pErrors: { president?: string; admin?: string } = {}
    if (form.president_phone.trim() && !isValidPhone(form.president_phone, 'CH')) {
      pErrors.president = 'Numéro de téléphone invalide'
    }
    if (form.admin_phone.trim() && !isValidPhone(form.admin_phone, 'CH')) {
      pErrors.admin = 'Numéro de téléphone invalide'
    }
    if (pErrors.president || pErrors.admin) {
      setPhoneErrors(pErrors)
      return
    }

    setSubmitting(true)
    const { data, error: fnError } = await invokeFunction('console-create-club', {
      method: 'POST',
      body: {
        name: form.name.trim(),
        slug: form.slug.trim(),
        asf_number: form.asf_number.trim() || undefined,
        address: form.address.trim() || undefined,
        postal_code: form.postal_code.trim() || undefined,
        city: form.city.trim() || undefined,
        president_first_name: form.president_first_name.trim() || undefined,
        president_last_name: form.president_last_name.trim() || undefined,
        president_phone: normalizePhone(form.president_phone, 'CH') || undefined,
        admin_email: form.admin_email.trim() || undefined,
        admin_first_name: form.admin_first_name.trim() || undefined,
        admin_last_name: form.admin_last_name.trim() || undefined,
        admin_phone: normalizePhone(form.admin_phone, 'CH') || undefined,
      },
    })

    if (fnError) {
      setError(fnError || 'Erreur lors de la création du club')
      setSubmitting(false)
      return
    }

    if (data?.error) {
      setError(data.error)
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    onCreated(form.name.trim())
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Créer un club</h2>
          <button type="button" onClick={onClose} style={closeBtnStyle} aria-label="Fermer">&times;</button>
        </div>

        <form onSubmit={handleSubmit} style={modalBodyStyle}>
          <div style={{ maxHeight: 'calc(80vh - 140px)', overflowY: 'auto', paddingRight: 4 }}>
            {/* Club info */}
            <FormField label="Nom du club *" value={form.name} onChange={set('name')} placeholder="FC Lausanne" />
            <FormField label="Slug / sous-domaine *" value={form.slug} onChange={set('slug')} placeholder="fclausanne"
              helper="Minuscules, chiffres et tirets, ex: fclausanne" />
            <FormField label="Adresse (rue + n°)" value={form.address} onChange={set('address')} placeholder="Rue du Stade 12" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
              <FormField label="Code postal" value={form.postal_code} onChange={set('postal_code')} placeholder="1000" />
              <FormField label="Ville" value={form.city} onChange={set('city')} placeholder="Lausanne" />
            </div>
            <FormField label="Numéro ASF du club" value={form.asf_number} onChange={set('asf_number')} placeholder="12345" />

            {/* President section */}
            <SectionHeader label="Président" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Prénom" value={form.president_first_name} onChange={set('president_first_name')} placeholder="Jean" />
              <FormField label="Nom" value={form.president_last_name} onChange={set('president_last_name')} placeholder="Dupont" />
            </div>
            <FormField label="Téléphone" value={form.president_phone} onChange={setPhone('president_phone')} placeholder="+41 79 123 45 67" type="tel" />
            {phoneErrors.president && <p style={{ fontSize: 12, color: 'var(--danger-text)', margin: '-8px 0 12px' }}>{phoneErrors.president}</p>}

            {/* Admin section */}
            <SectionHeader label="Premier administrateur" />
            <FormField label="Email de l'admin" value={form.admin_email} onChange={set('admin_email')} placeholder="admin@club.ch" type="email" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Prénom" value={form.admin_first_name} onChange={set('admin_first_name')} placeholder="Marie" />
              <FormField label="Nom" value={form.admin_last_name} onChange={set('admin_last_name')} placeholder="Martin" />
            </div>
            <FormField label="Téléphone" value={form.admin_phone} onChange={setPhone('admin_phone')} placeholder="+41 79 987 65 43" type="tel" />
            {phoneErrors.admin && <p style={{ fontSize: 12, color: 'var(--danger-text)', margin: '-8px 0 12px' }}>{phoneErrors.admin}</p>}
          </div>

          {error && (
            <div style={{
              background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 6,
              padding: '10px 12px', color: 'var(--danger-text)', fontSize: 13, marginTop: 16,
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <button type="button" onClick={onClose} style={btnSecondary} disabled={submitting}>Annuler</button>
            <button type="submit" style={{ ...btnPrimary, opacity: submitting ? 0.7 : 1 }} disabled={submitting}>
              {submitting ? 'Création...' : 'Créer le club'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
      letterSpacing: '0.04em', marginTop: 20, marginBottom: 8,
      borderTop: '1px solid var(--border-color)', paddingTop: 16,
    }}>
      {label}
    </div>
  )
}

function FormField({ label, value, onChange, placeholder, helper, type = 'text' }: {
  label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string; helper?: string; type?: string
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
        {label}
      </label>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder}
        style={inputStyle} />
      {helper && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>{helper}</p>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Dashboard sub-components                                           */
/* ------------------------------------------------------------------ */

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 10, padding: '20px 24px',
      border: '1px solid var(--border-color)',
    }}>
      <div style={{ fontSize: 13, color: 'var(--accent)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}

function ClubsTable({ clubs, onRowClick }: { clubs: ClubRow[]; onRowClick: (id: string) => void }) {
  if (clubs.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32, fontSize: 14 }}>
        Aucun club enregistré.
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-table-header)' }}>
              {['Club', 'Joueurs', 'Équipes', 'Comptes', 'Actifs 30 j', 'Statut', 'Créé le'].map((h) => (
                <th key={h} style={{
                  textAlign: 'left', padding: '12px 16px', fontSize: 12, fontWeight: 600,
                  color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em',
                  whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clubs.map((club) => (
              <tr
                key={club.id}
                onClick={() => onRowClick(club.id)}
                style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-card-hover)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '' }}
              >
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{club.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{club.slug}</div>
                </td>
                <td style={cellStyle}>{club.player_count ?? 0}</td>
                <td style={cellStyle}>{club.team_count ?? 0}</td>
                <td style={cellStyle}>{club.accounts != null ? club.accounts.toLocaleString('fr-CH') : '—'}</td>
                <td style={cellStyle}>
                  {club.active_30d != null ? (
                    <>
                      {club.active_30d.toLocaleString('fr-CH')}
                      <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 6 }}>
                        · 7 j : {club.active_7d != null ? club.active_7d.toLocaleString('fr-CH') : '—'}
                      </span>
                    </>
                  ) : '—'}
                </td>
                <td style={cellStyle}>
                  <StatusBadge active={club.active} />
                  {(club.notice_active || club.billing_notice_active) && (
                    <StatusPill variant="orange">Bannière active</StatusPill>
                  )}
                </td>
                <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
                  {formatDate(club.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  const bg = active ? 'var(--success-soft)' : 'var(--bg-hover)'
  const color = active ? 'var(--success)' : 'var(--text-muted)'
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 9999,
      fontSize: 12, fontWeight: 600, background: bg, color,
    }}>
      {active ? 'Actif' : 'Inactif'}
    </span>
  )
}

function BillingTable({ clubs }: { clubs: ClubRow[] }) {
  const fmtCHF = (n: number) => `CHF ${n.toLocaleString('fr-CH')}`
  const totalMonthly = clubs.reduce((s, c) => s + (c.monthly_tier_chf || 0), 0)
  const totalAnnual = totalMonthly * 12

  if (clubs.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32, fontSize: 14 }}>
        Aucun club enregistré.
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-table-header)' }}>
              {['Club', 'Palier mensuel', 'Revenu annuel'].map((h) => (
                <th key={h} style={{
                  textAlign: 'left', padding: '12px 16px', fontSize: 12, fontWeight: 600,
                  color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em',
                  whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clubs.map((club) => (
              <tr key={club.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{club.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{club.slug}</div>
                </td>
                <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
                  {fmtCHF(club.monthly_tier_chf ?? 0)}
                </td>
                <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
                  {fmtCHF((club.monthly_tier_chf ?? 0) * 12)}
                </td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid var(--border-strong)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-primary)' }}>Total</td>
              <td style={{ ...cellStyle, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                {fmtCHF(totalMonthly)}
              </td>
              <td style={{ ...cellStyle, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                {fmtCHF(totalAnnual)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Club Snapshot Tab                                                   */
/* ------------------------------------------------------------------ */

interface SnapshotDate { snapshot_date: string; snapshot_type: string }

interface SnapshotTeam { team_name: string; category_name: string; player_count: number }

interface SnapshotDetail {
  club_name: string
  snapshot_date: string
  snapshot_type: string
  teams: SnapshotTeam[]
  no_team_count: number
  total_count: number
  monthly_tier_chf: number
}

function ClubSnapshotTab({ clubs }: { clubs: ClubRow[] }) {
  const [dates, setDates] = useState<SnapshotDate[]>([])
  const [datesLoading, setDatesLoading] = useState(true)
  const [datesError, setDatesError] = useState<string | null>(null)

  const [selectedClubId, setSelectedClubId] = useState('')
  const [selectedDateIdx, setSelectedDateIdx] = useState<number>(0)

  const [detail, setDetail] = useState<SnapshotDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setDatesLoading(true)
    setDatesError(null)
    invokeFunction('console-snapshots', {
      method: 'POST', body: { action: 'dates' },
    }).then(({ data, error }) => {
      if (error) {
        setDatesError(error || 'Erreur lors du chargement des dates')
      } else if (data?.dates) {
        setDates(data.dates)
      } else {
        setDatesError('Format de réponse inattendu')
      }
      setDatesLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!selectedClubId || dates.length === 0) {
      setDetail(null)
      return
    }
    const chosen = dates[selectedDateIdx]
    if (!chosen) return

    setDetailLoading(true)
    setDetailError(null)
    setDetail(null)
    setCopied(false)

    invokeFunction('console-snapshots', {
      method: 'POST',
      body: {
        action: 'detail',
        club_id: selectedClubId,
        snapshot_date: chosen.snapshot_date,
        snapshot_type: chosen.snapshot_type,
      },
    }).then(({ data, error }) => {
      if (error) {
        setDetailError(error || 'Erreur lors du chargement du snapshot')
      } else if (data) {
        setDetail(data as SnapshotDetail)
      } else {
        setDetailError('Format de réponse inattendu')
      }
      setDetailLoading(false)
    })
  }, [selectedClubId, selectedDateIdx, dates])

  const fmtDateCH = (iso: string) => {
    const [y, m, d] = iso.split('-')
    return `${d}.${m}.${y}`
  }

  const typeLabel = (t: string) => t === 'billing' ? 'Facturation' : 'Hebdomadaire'
  const typeBadgeLabel = (t: string) => t === 'billing' ? 'Facturation' : 'Hebdomadaire'

  const buildPlainText = (d: SnapshotDetail): string => {
    const lines: string[] = []
    lines.push(`${d.club_name} — Extrait du ${fmtDateCH(d.snapshot_date)} (${typeLabel(d.snapshot_type)})`)
    lines.push('')
    const sorted = [...d.teams].sort((a, b) => a.category_name.localeCompare(b.category_name) || a.team_name.localeCompare(b.team_name))
    for (const t of sorted) {
      lines.push(`  ${t.category_name} / ${t.team_name} : ${t.player_count} joueur${t.player_count !== 1 ? 's' : ''}`)
    }
    lines.push(`  Sans équipe : ${d.no_team_count}`)
    lines.push('')
    lines.push(`  TOTAL : ${d.total_count} joueur${d.total_count !== 1 ? 's' : ''}`)
    lines.push(`  Palier : CHF ${d.monthly_tier_chf}/mois`)
    return lines.join('\n')
  }

  const handleCopy = async () => {
    if (!detail) return
    await navigator.clipboard.writeText(buildPlainText(detail))
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const selectStyle: React.CSSProperties = {
    padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)',
    fontSize: 14, background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none',
    minWidth: 200,
  }

  if (datesLoading) return <Spinner />

  if (datesError) {
    return (
      <div style={{
        background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 8,
        padding: 16, color: 'var(--danger-text)', fontSize: 14,
      }}>
        {datesError}
      </div>
    )
  }

  const sortedTeams = detail ? [...detail.teams].sort((a, b) =>
    a.category_name.localeCompare(b.category_name) || a.team_name.localeCompare(b.team_name)
  ) : []

  const sumTeams = detail ? detail.teams.reduce((s, t) => s + t.player_count, 0) + detail.no_team_count : 0
  const consistent = detail ? sumTeams === detail.total_count : true

  return (
    <div>
      {/* Dropdowns */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Club
          </label>
          <select
            value={selectedClubId}
            onChange={(e) => setSelectedClubId(e.target.value)}
            style={selectStyle}
          >
            <option value="">— Choisir un club —</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Date du snapshot
          </label>
          <select
            value={selectedDateIdx}
            onChange={(e) => setSelectedDateIdx(Number(e.target.value))}
            style={selectStyle}
          >
            {dates.length === 0 && <option value={0}>Aucune date disponible</option>}
            {dates.map((d, i) => (
              <option key={`${d.snapshot_date}-${d.snapshot_type}`} value={i}>
                {fmtDateCH(d.snapshot_date)} ({d.snapshot_type === 'billing' ? 'facturation' : 'hebdo'})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Detail */}
      {!selectedClubId ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32, fontSize: 14 }}>
          Sélectionnez un club pour afficher l'extrait.
        </div>
      ) : detailLoading ? (
        <Spinner />
      ) : detailError ? (
        <div style={{
          background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 8,
          padding: 16, color: 'var(--danger-text)', fontSize: 14,
        }}>
          {detailError}
        </div>
      ) : detail ? (
        <div style={{ background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          {/* Extract header */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                {detail.club_name}
              </h3>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {fmtDateCH(detail.snapshot_date)}
              </span>
              <span style={{
                display: 'inline-block', padding: '2px 10px', borderRadius: 9999,
                fontSize: 12, fontWeight: 600,
                background: detail.snapshot_type === 'billing' ? 'var(--info-soft)' : 'var(--bg-hover)',
                color: detail.snapshot_type === 'billing' ? 'var(--info)' : 'var(--text-muted)',
              }}>
                {typeBadgeLabel(detail.snapshot_type)}
              </span>
            </div>
            <button type="button" onClick={handleCopy} style={{
              ...btnSecondary, fontSize: 13, padding: '6px 14px',
              color: copied ? 'var(--success)' : 'var(--text-secondary)',
              borderColor: copied ? 'var(--success)' : 'var(--border-color)',
            }}>
              {copied ? 'Copié !' : 'Copier l’extrait'}
            </button>
          </div>

          {/* Teams table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-table-header)' }}>
                  {['Catégorie', 'Équipe', 'Joueurs'].map((h) => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '10px 16px', fontSize: 12, fontWeight: 600,
                      color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em',
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedTeams.map((t, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={cellStyle}>{t.category_name}</td>
                    <td style={cellStyle}>{t.team_name}</td>
                    <td style={cellStyle}>{t.player_count}</td>
                  </tr>
                ))}
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ ...cellStyle, fontStyle: 'italic', color: 'var(--text-muted)' }} colSpan={2}>
                    Sans équipe
                  </td>
                  <td style={cellStyle}>{detail.no_team_count}</td>
                </tr>
                <tr style={{ borderTop: '2px solid var(--border-strong)' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-primary)' }} colSpan={2}>
                    Total
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {detail.total_count}
                    <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--text-muted)', marginLeft: 12 }}>
                      → palier CHF {detail.monthly_tier_chf}/mois
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Consistency note */}
          {!consistent && (
            <div style={{
              padding: '10px 24px', fontSize: 12, color: 'var(--warning)',
              borderTop: '1px solid var(--border-color)',
            }}>
              Incohérence : somme des équipes ({sumTeams}) ≠ total ({detail.total_count})
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Stats Tab                                                          */
/* ------------------------------------------------------------------ */

const STATS_COLORS = ['var(--accent)','var(--success)','var(--warning)','var(--danger)','#A78BFA','#22D3EE','#FB923C','#F472B6','#A3E635','#E879F9']

const chartCardStyle: React.CSSProperties = {
  background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border-color)',
  padding: 24, marginBottom: 24,
}

const chartTitleStyle: React.CSSProperties = {
  fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16,
}

const fmtDateTick = (iso: string) => {
  if (!iso) return ''
  const [, m, d] = iso.split('-')
  return `${d}.${m}`
}

const darkTooltipStyle: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8,
  color: 'var(--text-primary)', fontSize: 13,
}

function StatsTab({ clubs }: { clubs: ClubRow[] }) {
  const [platformData, setPlatformData] = useState<{ date: string; total: number }[]>([])
  const [platformLoading, setPlatformLoading] = useState(true)
  const [platformError, setPlatformError] = useState<string | null>(null)

  const [clubsData, setClubsData] = useState<{ clubs: { id: string; name: string }[]; series: Record<string, unknown>[] }>({ clubs: [], series: [] })
  const [clubsLoading, setClubsLoading] = useState(true)
  const [clubsError, setClubsError] = useState<string | null>(null)

  const [teamsClubId, setTeamsClubId] = useState('')
  const [teamsData, setTeamsData] = useState<{ teams: { id: string; name: string }[]; series: Record<string, unknown>[] }>({ teams: [], series: [] })
  const [teamsLoading, setTeamsLoading] = useState(false)
  const [teamsError, setTeamsError] = useState<string | null>(null)

  useEffect(() => {
    setPlatformLoading(true)
    setPlatformError(null)
    invokeFunction('console-snapshots-history', {
      method: 'POST', body: { view: 'platform' },
    }).then(({ data, error }) => {
      if (error) setPlatformError(error || 'Erreur')
      else if (data?.series) setPlatformData(data.series)
      else setPlatformError('Format de réponse inattendu')
      setPlatformLoading(false)
    })
  }, [])

  useEffect(() => {
    setClubsLoading(true)
    setClubsError(null)
    invokeFunction('console-snapshots-history', {
      method: 'POST', body: { view: 'clubs' },
    }).then(({ data, error }) => {
      if (error) setClubsError(error || 'Erreur')
      else if (data?.series) setClubsData({ clubs: data.clubs || [], series: data.series })
      else setClubsError('Format de réponse inattendu')
      setClubsLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!teamsClubId) { setTeamsData({ teams: [], series: [] }); return }
    setTeamsLoading(true)
    setTeamsError(null)
    invokeFunction('console-snapshots-history', {
      method: 'POST', body: { view: 'teams', club_id: teamsClubId },
    }).then(({ data, error }) => {
      if (error) setTeamsError(error || 'Erreur')
      else if (data?.series) setTeamsData({ teams: data.teams || [], series: data.series })
      else setTeamsError('Format de réponse inattendu')
      setTeamsLoading(false)
    })
  }, [teamsClubId])

  const fewDataPoints = useMemo(() =>
    platformData.length <= 1 || clubsData.series.length <= 1,
  [platformData, clubsData.series])

  const selectStyle: React.CSSProperties = {
    padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)',
    fontSize: 14, background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none',
    minWidth: 200,
  }

  return (
    <div>
      {/* 1. Platform total */}
      <div style={chartCardStyle}>
        <div style={chartTitleStyle}>Évolution totale (plateforme)</div>
        {platformLoading ? <Spinner /> : platformError ? (
          <ErrorBlock message={platformError} />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={platformData}>
              <CartesianGrid stroke="var(--border-color)" />
              <XAxis dataKey="date" tickFormatter={fmtDateTick} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} stroke="var(--border-color)" />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} stroke="var(--border-color)" allowDecimals={false} />
              <Tooltip contentStyle={darkTooltipStyle} labelFormatter={(l) => fmtDateTick(String(l))} />
              <Line type="monotone" dataKey="total" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} name="Total joueurs" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 2. Per club */}
      <div style={chartCardStyle}>
        <div style={chartTitleStyle}>Évolution par club</div>
        {clubsLoading ? <Spinner /> : clubsError ? (
          <ErrorBlock message={clubsError} />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={clubsData.series}>
              <CartesianGrid stroke="var(--border-color)" />
              <XAxis dataKey="date" tickFormatter={fmtDateTick} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} stroke="var(--border-color)" />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} stroke="var(--border-color)" allowDecimals={false} />
              <Tooltip contentStyle={darkTooltipStyle} labelFormatter={(l) => fmtDateTick(String(l))} />
              <Legend wrapperStyle={{ color: 'var(--text-secondary)', fontSize: 13 }} />
              {clubsData.clubs.map((c, i) => (
                <Line key={c.id} type="monotone" dataKey={c.id} stroke={STATS_COLORS[i % STATS_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} name={c.name} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 3. Per team */}
      <div style={chartCardStyle}>
        <div style={chartTitleStyle}>Évolution par équipe</div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Club
          </label>
          <select value={teamsClubId} onChange={(e) => setTeamsClubId(e.target.value)} style={selectStyle}>
            <option value="">— Choisir un club —</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        {!teamsClubId ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24, fontSize: 14 }}>
            Sélectionnez un club pour afficher les courbes par équipe.
          </div>
        ) : teamsLoading ? <Spinner /> : teamsError ? (
          <ErrorBlock message={teamsError} />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={teamsData.series}>
              <CartesianGrid stroke="var(--border-color)" />
              <XAxis dataKey="date" tickFormatter={fmtDateTick} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} stroke="var(--border-color)" />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} stroke="var(--border-color)" allowDecimals={false} />
              <Tooltip contentStyle={darkTooltipStyle} labelFormatter={(l) => fmtDateTick(String(l))} />
              <Legend wrapperStyle={{ color: 'var(--text-secondary)', fontSize: 13 }} />
              {teamsData.teams.map((t, i) => (
                <Line key={t.id} type="monotone" dataKey={t.id} stroke={STATS_COLORS[i % STATS_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} name={t.name} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {fewDataPoints && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, marginTop: -8, marginBottom: 16 }}>
          Les courbes se rempliront au fil des snapshots hebdomadaires.
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Activity Tab                                                        */
/* ------------------------------------------------------------------ */

const KNOWN_TABLES = [
  'members', 'teams', 'coaches', 'sponsors', 'events', 'invoices', 'payments',
  'profiles', 'club_settings', 'terrain_slots', 'terrains', 'terrain_halves',
  'training_sessions', 'training_attendance', 'matches', 'match_attendance',
  'documents', 'document_acknowledgements', 'news', 'conversations', 'messages',
  'volunteer_posts', 'volunteer_assignments', 'sponsor_contracts', 'fee_configs',
  'event_public_registrations',
]

const TABLE_LABELS: Record<string, string> = {
  sponsors: 'Sponsor', sponsor_contracts: 'Contrat sponsor', members: 'Joueur',
  coaches: 'Entraîneur', coaching_qualifications: 'Qualification', matches: 'Match',
  events: 'Événement', event_price_options: "Tarif d'événement", meetings: 'Séance',
  news: 'Actualité', news_categories: "Catégorie d'actualité", documents: 'Document',
  invoices: 'Facture', payments: 'Paiement', teams: 'Équipe',
  team_categories: 'Catégorie', terrains: 'Terrain', venues: 'Lieu', seasons: 'Saison',
  event_types: "Type d'événement", meeting_types: 'Type de séance',
  volunteer_post_templates: 'Poste bénévole', club_settings: 'Paramètres du club',
  club_notification_config: 'Notifications', finance_config: 'Configuration financière',
  profile_roles: "Rôle d'accès",
}
const tTable = (t: string) => TABLE_LABELS[t] || t

const FIELD_LABELS: Record<string, string> = {
  display_logo: 'Affichage du logo', status: 'Statut', team_id: 'Équipe',
  amount: 'Montant', email: 'E-mail', phone: 'Téléphone', first_name: 'Prénom',
  last_name: 'Nom', departure_date: 'Date de départ', profile_id: 'Compte lié',
  licence_status: 'Statut licence', birth_date: 'Date de naissance',
  avs_number: 'Numéro AVS', js_number: 'Numéro J+S', asf_licence_number: 'Licence ASF',
  gender: 'Genre', nationality: 'Nationalité', address: 'Adresse', city: 'Ville',
  zip: 'NPA', country: 'Pays', notes: 'Notes', title: 'Titre', description: 'Description',
  date: 'Date', start_time: 'Heure de début', end_time: 'Heure de fin',
  location: 'Lieu', name: 'Nom', active: 'Actif', category_id: 'Catégorie',
  invoice_number: 'N° facture', due_date: 'Échéance', paid: 'Payé',
  contract_start: 'Début contrat', contract_end: 'Fin contrat',
  role: 'Rôle', onboarding_completed: 'Onboarding terminé',
  billable: 'Facturable', fee_exempt: 'Exonéré', fee_exempt_reason: "Motif d'exonération",
  licence_chez: 'Licence chez',
}
const tField = (f: string) => FIELD_LABELS[f] || f

function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return 'vide'
  if (v === true) return 'oui'
  if (v === false) return 'non'
  return String(v)
}

interface ActivityEntry {
  id: string
  created_at: string
  club_id: string | null
  club_name: string | null
  actor_email: string | null
  table_name: string
  action: 'INSERT' | 'UPDATE' | 'DELETE' | 'AVS_REVEAL' | 'AVS_EXPORT'
  record_id: string | null
  record_label: string | null
  changes: Record<string, unknown> | null
}

function ActivityTab({ clubs }: { clubs: ClubRow[] }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [filterClub, setFilterClub] = useState('')
  const [filterTable, setFilterTable] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterEmail, setFilterEmail] = useState('')
  const [filterLabel, setFilterLabel] = useState('')

  const fetchEntries = useCallback(async (before?: string, append = false) => {
    if (!append) setLoading(true)
    else setLoadingMore(true)
    setError(null)

    const body: Record<string, unknown> = { limit: 50 }
    if (filterClub) body.club_id = filterClub
    if (filterTable) body.table_name = filterTable
    if (filterAction) body.action = filterAction
    if (filterEmail.trim()) body.actor_email = filterEmail.trim()
    if (filterLabel.trim()) body.record_label = filterLabel.trim()
    if (before) body.before = before

    const { data, error: fnErr } = await invokeFunction('console-activity-log', {
      method: 'POST',
      body,
    })

    if (fnErr) {
      setError(fnErr || 'Erreur lors du chargement')
    } else if (data?.entries) {
      if (append) {
        setEntries(prev => [...prev, ...data.entries])
      } else {
        setEntries(data.entries)
      }
      setNextBefore(data.next_before || null)
    } else {
      setError('Format de réponse inattendu')
    }

    setLoading(false)
    setLoadingMore(false)
  }, [filterClub, filterTable, filterAction, filterEmail, filterLabel])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  const handleLoadMore = () => {
    if (nextBefore) fetchEntries(nextBefore, true)
  }

  const fmtDateTime = (iso: string) => {
    try {
      const d = new Date(iso)
      const day = String(d.getDate()).padStart(2, '0')
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const hours = String(d.getHours()).padStart(2, '0')
      const mins = String(d.getMinutes()).padStart(2, '0')
      return `${day}.${month} ${hours}:${mins}`
    } catch { return iso }
  }

  const actionConfig: Record<string, { label: string; variant: 'green' | 'blue' | 'red' | 'neutral' | 'sky' }> = {
    INSERT: { label: 'Création', variant: 'green' },
    UPDATE: { label: 'Modification', variant: 'blue' },
    DELETE: { label: 'Suppression', variant: 'red' },
    AVS_REVEAL: { label: 'Consultation AVS', variant: 'neutral' },
    AVS_EXPORT: { label: 'Export AVS', variant: 'sky' },
  }

  const renderChanges = (entry: ActivityEntry) => {
    if (!entry.changes) return <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aucun détail</span>

    if (entry.action === 'AVS_REVEAL' || entry.action === 'AVS_EXPORT') {
      const ctx = (entry.changes as Record<string, unknown>).context || (entry.changes as Record<string, unknown>).p_context || ''
      return (
        <div style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
          <span style={{ color: 'var(--text-muted)' }}>Écran</span>{' : '}
          <span style={{ color: 'var(--text-primary)' }}>{String(ctx) || '—'}</span>
        </div>
      )
    }

    if (entry.action === 'UPDATE') {
      const lines: { field: string; old: string; new: string }[] = []
      const changes = entry.changes as Record<string, unknown>
      for (const [key, val] of Object.entries(changes)) {
        if (val && typeof val === 'object' && 'old' in (val as any) && 'new' in (val as any)) {
          lines.push({ field: tField(key), old: fmtValue((val as any).old), new: fmtValue((val as any).new) })
        } else {
          lines.push({ field: tField(key), old: '', new: fmtValue(val) })
        }
      }
      if (lines.length === 0) return <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aucun changement</span>
      return (
        <div style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
          {lines.map((l, i) => (
            <div key={i}>
              <span style={{ color: 'var(--text-muted)' }}>{l.field}</span>
              {' : '}
              {l.old && <span style={{ color: 'var(--danger-text)', textDecoration: 'line-through' }}>{l.old}</span>}
              {l.old && ' → '}
              <span style={{ color: 'var(--success-text)' }}>{l.new}</span>
            </div>
          ))}
        </div>
      )
    }

    const changes = entry.changes as Record<string, unknown>
    const filtered = Object.entries(changes).filter(([, v]) => v != null && v !== '')
    if (filtered.length === 0) return <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aucun détail</span>
    return (
      <div style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
        {filtered.slice(0, 20).map(([key, val]) => (
          <div key={key}>
            <span style={{ color: 'var(--text-muted)' }}>{tField(key)}</span>{' : '}
            <span style={{ color: 'var(--text-primary)' }}>{fmtValue(val)}</span>
          </div>
        ))}
        {filtered.length > 20 && <div style={{ color: 'var(--text-muted)' }}>... +{filtered.length - 20} champs</div>}
      </div>
    )
  }

  const selectStyle: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)',
    fontSize: 13, background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none',
    minWidth: 160,
  }

  return (
    <div>
      {/* Filters bar */}
      <div style={{
        display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end',
      }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Club
          </label>
          <select value={filterClub} onChange={(e) => setFilterClub(e.target.value)} style={selectStyle}>
            <option value="">Tous</option>
            {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Module
          </label>
          <select value={filterTable} onChange={(e) => setFilterTable(e.target.value)} style={selectStyle}>
            <option value="">Tous</option>
            {KNOWN_TABLES.map(t => <option key={t} value={t}>{tTable(t)}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Action
          </label>
          <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)} style={selectStyle}>
            <option value="">Toutes</option>
            <option value="INSERT">Création</option>
            <option value="UPDATE">Modification</option>
            <option value="DELETE">Suppression</option>
            <option value="AVS_REVEAL">Consultation AVS</option>
            <option value="AVS_EXPORT">Export AVS</option>
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Acteur (email)
          </label>
          <input
            type="text"
            value={filterEmail}
            onChange={(e) => setFilterEmail(e.target.value)}
            placeholder="admin@club.ch"
            style={{ ...selectStyle, minWidth: 200 }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Enregistrement
          </label>
          <input
            type="text"
            value={filterLabel}
            onChange={(e) => setFilterLabel(e.target.value)}
            placeholder="Nom, titre..."
            style={{ ...selectStyle, minWidth: 180 }}
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorBlock message={error} />
      ) : entries.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40, fontSize: 14 }}>
          Aucune entrée trouvée.
        </div>
      ) : (
        <>
          <div style={{ background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-table-header)' }}>
                    {['Date/heure', 'Club', 'Acteur', 'Module', 'Enregistrement', 'Action', ''].map((h) => (
                      <th key={h} style={{
                        textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600,
                        color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em',
                        whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const ac = actionConfig[entry.action] || actionConfig.UPDATE
                    const isExpanded = expandedId === entry.id
                    return (
                      <Fragment key={entry.id}>
                        <tr
                          style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}
                          onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-card-hover)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = '' }}
                        >
                          <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: 13 }}>
                            {fmtDateTime(entry.created_at)}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-primary)', fontSize: 13 }}>
                            {entry.club_name || '—'}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: 13 }}>
                            {entry.actor_email || '(système)'}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: 13 }}>
                            {tTable(entry.table_name)}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>
                            {entry.record_label || '—'}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <StatusPill variant={ac.variant}>{ac.label}</StatusPill>
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'right' }}>
                            {isExpanded ? '▲' : '▼'}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td colSpan={7} style={{ padding: '12px 14px 16px', background: 'var(--bg-input)' }}>
                              {renderChanges(entry)}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {nextBefore && (
            <div style={{ textAlign: 'center', marginTop: 20 }}>
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                style={{
                  ...btnSecondary,
                  opacity: loadingMore ? 0.6 : 1,
                  cursor: loadingMore ? 'not-allowed' : 'pointer',
                }}
              >
                {loadingMore ? 'Chargement...' : 'Charger plus'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Support Tab                                                         */
/* ------------------------------------------------------------------ */

interface SupportTicket {
  id: string
  ticket_number: number
  created_at: string
  club_id: string | null
  club_name: string | null
  requester_name: string | null
  requester_email: string | null
  title: string
  description: string
  ticket_type?: 'incident' | 'improvement'
  attachments: { url: string; name: string }[]
  status: 'open' | 'closed'
  closed_at: string | null
  closed_by: string | null
  closure_message: string | null
}

function SupportTab() {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'open' | 'closed' | 'all'>('open')
  const [typeFilter, setTypeFilter] = useState<'all' | 'incident' | 'improvement'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [closeTarget, setCloseTarget] = useState<SupportTicket | null>(null)
  const [closeMessage, setCloseMessage] = useState('')
  const [closeLoading, setCloseLoading] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const fetchTickets = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: fnErr } = await invokeFunction('console-support-tickets', {
      method: 'POST',
      body: { action: 'list', status: filter },
    })
    if (fnErr) {
      setError(fnErr || 'Erreur lors du chargement')
    } else if (data?.tickets) {
      setTickets(data.tickets)
    } else {
      setError('Format de réponse inattendu')
    }
    setLoading(false)
  }, [filter])

  useEffect(() => { fetchTickets() }, [fetchTickets])

  const handleClose = async () => {
    if (!closeTarget) return
    setCloseLoading(true)
    setCloseError(null)
    const { data, error: fnErr } = await invokeFunction('console-support-tickets', {
      method: 'POST',
      body: { action: 'close', ticket_id: closeTarget.id, closure_message: closeMessage.trim() },
    })
    setCloseLoading(false)
    if (fnErr || data?.error) {
      setCloseError(data?.error || fnErr || 'Erreur lors de la clôture')
      return
    }
    setSuccessMsg(`Ticket n° ${data?.ticket_number || closeTarget.ticket_number} clôturé — email envoyé.`)
    setCloseTarget(null)
    setCloseMessage('')
    fetchTickets()
    setTimeout(() => setSuccessMsg(null), 5000)
  }

  const fmtDT = (iso: string) => {
    try {
      const d = new Date(iso)
      return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
    } catch { return iso }
  }

  const displayedTickets = useMemo(() => {
    if (typeFilter === 'all') return tickets
    return tickets.filter(t => (t.ticket_type || 'incident') === typeFilter)
  }, [tickets, typeFilter])

  const filterBtn = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border-color)',
    background: active ? 'var(--bg-hover)' : 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" onClick={() => setFilter('open')} style={filterBtn(filter === 'open')}>Ouverts</button>
        <button type="button" onClick={() => setFilter('closed')} style={filterBtn(filter === 'closed')}>Clôturés</button>
        <button type="button" onClick={() => setFilter('all')} style={filterBtn(filter === 'all')}>Tous</button>
        <span style={{ width: 1, height: 20, background: 'var(--border-color)', margin: '0 4px' }} />
        <button type="button" onClick={() => setTypeFilter('all')} style={filterBtn(typeFilter === 'all')}>Tous types</button>
        <button type="button" onClick={() => setTypeFilter('incident')} style={filterBtn(typeFilter === 'incident')}>Incidents</button>
        <button type="button" onClick={() => setTypeFilter('improvement')} style={filterBtn(typeFilter === 'improvement')}>Améliorations</button>
      </div>

      {successMsg && (
        <div style={{ background: 'var(--success-soft)', border: '1px solid var(--success)', borderRadius: 8, padding: '12px 16px', color: 'var(--success)', fontSize: 14, marginBottom: 16 }}>
          {successMsg}
        </div>
      )}

      {loading ? <Spinner /> : error ? <ErrorBlock message={error} /> : displayedTickets.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40, fontSize: 14 }}>
          Aucun ticket {filter === 'open' ? 'ouvert' : filter === 'closed' ? 'clôturé' : ''}.
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-table-header)' }}>
                  {['N°', 'Date/heure', 'Club', 'Demandeur', 'Titre', 'Type', 'Statut'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedTickets.map(ticket => {
                  const isExp = expandedId === ticket.id
                  return (
                    <Fragment key={ticket.id}>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}
                        onClick={() => setExpandedId(isExp ? null : ticket.id)}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-card-hover)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = '' }}>
                        <td style={{ padding: '10px 14px', color: 'var(--text-primary)', fontWeight: 600, fontSize: 13 }}>{ticket.ticket_number}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: 13 }}>{fmtDT(ticket.created_at)}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-primary)', fontSize: 13 }}>{ticket.club_name || '—'}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13 }}>
                          <div style={{ color: 'var(--text-primary)' }}>{ticket.requester_name || '—'}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{ticket.requester_email || ''}</div>
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-primary)', fontSize: 13, maxWidth: 250 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.title}</div>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {ticket.ticket_type === 'improvement'
                            ? <StatusPill variant="blue">Amélioration</StatusPill>
                            : <StatusPill variant="red">Incident</StatusPill>
                          }
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <StatusPill variant={ticket.status === 'open' ? 'orange' : 'green'}>
                            {ticket.status === 'open' ? 'Ouvert' : 'Clôturé'}
                          </StatusPill>
                        </td>
                      </tr>
                      {isExp && (
                        <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td colSpan={7} style={{ padding: '16px 20px', background: 'var(--bg-input)' }}>
                            <div style={{ marginBottom: 12 }}>
                              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description</div>
                              <div style={{ fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{ticket.description}</div>
                            </div>
                            {ticket.attachments && ticket.attachments.length > 0 && (
                              <div style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pièces jointes</div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                  {ticket.attachments.map((att, i) => (
                                    <a key={i} href={att.url} target="_blank" rel="noopener noreferrer"
                                      style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--info-soft)', border: '1px solid var(--info)', color: 'var(--info)', fontSize: 13, textDecoration: 'none' }}>
                                      {att.name}
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                            {ticket.status === 'closed' && (
                              <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--success-soft)', border: '1px solid var(--success)' }}>
                                <div style={{ fontSize: 12, color: 'var(--success)', marginBottom: 4, fontWeight: 600 }}>
                                  Clôturé le {ticket.closed_at ? fmtDT(ticket.closed_at) : '—'} par {ticket.closed_by || '—'}
                                </div>
                                {ticket.closure_message && <div style={{ fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{ticket.closure_message}</div>}
                              </div>
                            )}
                            {ticket.status === 'open' && (
                              <div style={{ marginTop: 12 }}>
                                <button type="button" onClick={e => { e.stopPropagation(); setCloseTarget(ticket); setCloseMessage(''); setCloseError(null) }}
                                  style={{ padding: '7px 14px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: '1px solid var(--success)', background: 'var(--success-soft)', color: 'var(--success)', cursor: 'pointer' }}>
                                  Clôturer ce ticket
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {closeTarget && (
        <div style={overlayStyle} onClick={() => setCloseTarget(null)}>
          <div style={{ ...modalStyle, maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Clôturer le ticket n° {closeTarget.ticket_number}</h2>
              <button type="button" onClick={() => setCloseTarget(null)} style={closeBtnStyle} aria-label="Fermer">&times;</button>
            </div>
            <div style={modalBodyStyle}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
                Le message ci-dessous sera inclus dans l'email envoyé au demandeur ({closeTarget.requester_email || 'email inconnu'}).
              </p>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Message au demandeur</label>
              <textarea value={closeMessage} onChange={e => setCloseMessage(e.target.value)} rows={5}
                placeholder="Bonjour, votre demande a été traitée..."
                style={{ ...inputStyle, resize: 'vertical' as const, minHeight: 100 }} />
              {closeError && (
                <div style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 6, padding: '10px 12px', color: 'var(--danger-text)', fontSize: 13, marginTop: 12 }}>
                  {closeError}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button type="button" onClick={() => setCloseTarget(null)} style={btnSecondary}>Annuler</button>
                <button type="button" onClick={handleClose} disabled={closeLoading}
                  style={{ ...btnPrimary, background: 'var(--success)', opacity: closeLoading ? 0.6 : 1, cursor: closeLoading ? 'not-allowed' : 'pointer' }}>
                  {closeLoading ? 'Clôture...' : 'Confirmer la clôture'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div style={{
      background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 8,
      padding: 16, color: 'var(--danger-text)', fontSize: 14,
    }}>
      {message}
    </div>
  )
}

function ClubDetailModal({ club, loading, error, onClose, onRefresh }: {
  club: ClubDetail | null; loading: boolean; error: string | null; onClose: () => void; onRefresh: () => void
}) {
  const [detailTab, setDetailTab] = useState<'info' | 'admins'>('info')
  const [resetState, setResetState] = useState<Record<string, { loading?: boolean; success?: string; error?: string }>>({})
  const [removeTarget, setRemoveTarget] = useState<{ profile_id: string; first_name: string | null; last_name: string | null; email: string | null } | null>(null)
  const [removeConfirmEmail, setRemoveConfirmEmail] = useState('')
  const [removeLoading, setRemoveLoading] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [removeSuccess, setRemoveSuccess] = useState<string | null>(null)
  const [mfaResetTarget, setMfaResetTarget] = useState<{ profile_id: string; first_name: string | null; last_name: string | null; email: string | null } | null>(null)
  const [mfaResetLoading, setMfaResetLoading] = useState(false)
  const [mfaResetState, setMfaResetState] = useState<Record<string, { success?: string; error?: string }>>({})
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [invEmail, setInvEmail] = useState('')
  const [invFirst, setInvFirst] = useState('')
  const [invLast, setInvLast] = useState('')
  const [invSending, setInvSending] = useState(false)
  const [invSuccess, setInvSuccess] = useState<string | null>(null)
  const [invError, setInvError] = useState<string | null>(null)

  const [showNoticeModal, setShowNoticeModal] = useState(false)
  const [noticeMsg, setNoticeMsg] = useState('')
  const [noticeSending, setNoticeSending] = useState(false)
  const [noticeError, setNoticeError] = useState<string | null>(null)

  const isNoticeActive = !!(club?.notice_active || club?.billing_notice_active)
  const noticeMessageText = club?.notice_message || club?.billing_notice_message || null

  const handleNoticeSet = async () => {
    if (!club) return
    setNoticeSending(true)
    setNoticeError(null)
    const { data, error: fnErr } = await invokeFunction('console-club-notice', {
      body: { action: 'set', club_id: club.id, message: noticeMsg.trim() || null },
    })
    setNoticeSending(false)
    console.log('[console-club-notice set]', { data, fnErr })
    if (fnErr) {
      setNoticeError(fnErr || 'Erreur réseau lors de l\'appel.')
      return
    }
    if (data?.error) {
      setNoticeError(data.error)
      return
    }
    if (!data?.ok) {
      setNoticeError('Réponse inattendue du serveur.')
      return
    }
    setShowNoticeModal(false)
    setNoticeMsg('')
    onRefresh()
  }

  const handleNoticeClear = async () => {
    if (!club) return
    setNoticeSending(true)
    setNoticeError(null)
    const { data, error: fnErr } = await invokeFunction('console-club-notice', {
      body: { action: 'clear', club_id: club.id },
    })
    setNoticeSending(false)
    console.log('[console-club-notice clear]', { data, fnErr })
    if (fnErr) {
      setNoticeError(fnErr || 'Erreur réseau lors de l\'appel.')
      return
    }
    if (data?.error) {
      setNoticeError(data.error)
      return
    }
    if (!data?.ok) {
      setNoticeError('Réponse inattendue du serveur.')
      return
    }
    setShowNoticeModal(false)
    setNoticeMsg('')
    onRefresh()
  }

  const resetInviteForm = () => {
    setShowInviteForm(false)
    setInvEmail('')
    setInvFirst('')
    setInvLast('')
    setInvError(null)
  }

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = invEmail.trim().toLowerCase()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setInvError('Veuillez saisir une adresse email valide.')
      return
    }
    setInvSending(true)
    setInvError(null)
    setInvSuccess(null)
    const { data, error: fnErr } = await invokeFunction('console-invite-admin', {
      method: 'POST',
      body: { club_id: club!.id, email: trimmed, first_name: invFirst.trim(), last_name: invLast.trim() },
    })
    setInvSending(false)
    if (fnErr || !data?.success) {
      setInvError(data?.error || fnErr || 'Erreur lors de l\'envoi de l\'invitation.')
      return
    }
    setInvSuccess(`Invitation envoyée à ${trimmed}.`)
    resetInviteForm()
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  useEffect(() => {
    if (!club) {
      resetInviteForm()
      setInvSuccess(null)
    }
    setDetailTab('info')
    setResetState({})
    setRemoveTarget(null)
    setRemoveConfirmEmail('')
    setRemoveError(null)
    setRemoveSuccess(null)
    setMfaResetTarget(null)
    setMfaResetState({})
  }, [club])

  const val = (v: string | null | undefined) => v || '—'

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        {loading ? (
          <Spinner />
        ) : error ? (
          <div>
            <div style={{ ...modalHeaderStyle, justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} style={closeBtnStyle} aria-label="Fermer">&times;</button>
            </div>
            <div style={modalBodyStyle}>
              <div style={{
                background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 6,
                padding: '10px 12px', color: 'var(--danger-text)', fontSize: 13,
              }}>
                {error}
              </div>
            </div>
          </div>
        ) : club ? (
          <>
            {/* Header */}
            <div style={{ ...modalHeaderStyle, alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>{club.name}</h2>
                  <StatusBadge active={club.active} />
                  {isNoticeActive && (
                    <StatusPill variant="orange">Bannière active</StatusPill>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{club.slug}</div>
              </div>
              <button type="button" onClick={onClose} style={closeBtnStyle} aria-label="Fermer">&times;</button>
            </div>

            {/* Tab bar */}
            <div style={{ paddingLeft: 16, paddingRight: 16 }}>
              <Tabs
                items={[
                  { key: 'info', label: 'Informations' },
                  { key: 'admins', label: 'Administrateurs' },
                ]}
                value={detailTab}
                onChange={(key) => setDetailTab(key as 'info' | 'admins')}
              />
            </div>

            <div style={{ ...modalBodyStyle, maxHeight: 'calc(80vh - 170px)', minHeight: 420, overflowY: 'auto', paddingBottom: 40 }}>
              {detailTab === 'info' ? (
                <>
                  {/* Coordonnées */}
                  <SectionHeader label="Coordonnées" />
                  <DetailGrid>
                    <DetailField label="Adresse" value={val(club.address)} />
                    <DetailField label="Code postal" value={val(club.postal_code)} />
                    <DetailField label="Ville" value={val(club.city)} />
                    <DetailField label="Email" value={val(club.email)} />
                    <DetailField label="Téléphone" value={val(club.phone)} />
                    <DetailField label="Numéro ASF" value={val(club.asf_club_number)} />
                  </DetailGrid>

                  {/* Notes internes */}
                  <SectionHeader label="Notes internes" />
                  {club.notes_internal ? (
                    <div style={{
                      fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap',
                      background: 'var(--bg-input)', borderRadius: 8, padding: '12px 16px',
                      border: '1px solid var(--border-color)', lineHeight: 1.6,
                    }}>
                      {club.notes_internal}
                    </div>
                  ) : (
                    <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>{'—'}</div>
                  )}

                  {/* Statistiques */}
                  <SectionHeader label="Statistiques" />
                  <DetailGrid>
                    <DetailField label="Joueurs" value={String(club.player_count ?? 0)} />
                    <DetailField label="Équipes" value={String(club.team_count ?? 0)} />
                    <DetailField label="Palier mensuel" value={`CHF ${(club.monthly_tier_chf ?? 0).toLocaleString('fr-CH')}/mois`} />
                    <DetailField label="Créé le" value={formatDate(club.created_at)} />
                  </DetailGrid>

                  {/* Utilisation */}
                  <SectionHeader label="Utilisation" />
                  {club.usage ? (
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
                        {([
                          ['Comptes', club.usage.accounts],
                          ['En ligne (15 min)', club.usage.online_15min],
                          ["Actifs aujourd'hui", club.usage.active_today],
                          ['Actifs 7 jours', club.usage.active_7d],
                          ['Actifs 30 jours', club.usage.active_30d],
                        ] as [string, number][]).map(([label, val]) => (
                          <div key={label} style={{
                            background: 'var(--bg-input)', borderRadius: 8, padding: '12px 14px',
                            border: '1px solid var(--border-color)',
                          }}>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{label}</div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{val.toLocaleString('fr-CH')}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                        Jamais connectés : <strong style={{ color: 'var(--text-primary)' }}>{club.usage.never_signed_in.toLocaleString('fr-CH')}</strong>
                        {' · Dernière activité : '}
                        <strong style={{ color: 'var(--text-primary)' }}>
                          {club.usage.last_activity_at ? fmtDateTimeFull(club.usage.last_activity_at) : '—'}
                        </strong>
                      </div>

                      {Object.keys(club.usage.by_role).length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Par rôle</div>
                          <div style={{ background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-table-header)' }}>
                                  {['Rôle', 'Comptes', 'Actifs 30 j'].map(h => (
                                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {(['admin', 'committee', 'coach', 'member', 'parent', 'supporter'] as const)
                                  .filter(r => club.usage!.by_role[r])
                                  .map(r => {
                                    const roleLabels: Record<string, string> = { admin: 'Administrateurs', committee: 'Comité', coach: 'Entraîneurs', member: 'Joueurs', parent: 'Parents', supporter: 'Supporters' }
                                    const d = club.usage!.by_role[r]
                                    return (
                                      <tr key={r} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <td style={{ padding: '8px 12px', color: 'var(--text-primary)' }}>{roleLabels[r]}</td>
                                        <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{d.accounts.toLocaleString('fr-CH')}</td>
                                        <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{d.active_30d.toLocaleString('fr-CH')}</td>
                                      </tr>
                                    )
                                  })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                        Activité mesurée sur les sessions de connexion (jeton rafraîchi). Un membre qui a l'app ouverte sans interagir peut ne pas apparaître dans « En ligne ».
                      </p>
                    </div>
                  ) : (
                    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24 }}>
                      Données indisponibles
                    </div>
                  )}

                  {/* Rappel de paiement */}
                  <SectionHeader label="Rappel de paiement" />
                  <div style={{ marginBottom: 24 }}>
                    {isNoticeActive ? (
                      <div style={{ background: 'var(--warning-soft)', border: '1px solid var(--warning)', borderRadius: 8, padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <StatusPill variant="orange">Bannière active</StatusPill>
                        </div>
                        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--warning-text)' }}>
                          Message : <em>{noticeMessageText || '(par défaut) Votre cotisation est en attente de paiement.'}</em>
                        </p>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Button variant="secondary" size="sm" onClick={() => { setShowNoticeModal(true); setNoticeMsg(noticeMessageText || ''); setNoticeError(null) }}>
                            Modifier le message
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => { setShowNoticeModal(true); setNoticeError(null) }}>
                            Désactiver la bannière
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button variant="warning" size="sm" onClick={() => { setShowNoticeModal(true); setNoticeMsg(''); setNoticeError(null) }}>
                        Activer la bannière
                      </Button>
                    )}
                  </div>

                  {/* Notice modal */}
                  {showNoticeModal && (
                    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, background: 'rgba(0,0,0,0.5)' }}>
                      <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 420, boxShadow: 'var(--shadow-lg)' }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
                          {isNoticeActive ? 'Modifier / Désactiver le rappel' : 'Activer le rappel de paiement'}
                        </div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                          Message affiché au club (optionnel)
                        </label>
                        <textarea
                          value={noticeMsg}
                          onChange={(e) => setNoticeMsg(e.target.value)}
                          placeholder="Laissez vide pour le message par défaut : « Votre cotisation est en attente de paiement. »"
                          rows={3}
                          style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }}
                        />
                        {noticeError && (
                          <div style={{
                            background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 6,
                            padding: '10px 12px', color: 'var(--danger-text)', fontSize: 13, marginTop: 10,
                          }}>
                            {noticeError}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                          {isNoticeActive && (
                            <Button variant="destructive" size="sm" onClick={handleNoticeClear} disabled={noticeSending}>
                              Désactiver
                            </Button>
                          )}
                          <Button variant="secondary" size="sm" onClick={() => setShowNoticeModal(false)}>Annuler</Button>
                          <Button variant="warning" size="sm" onClick={handleNoticeSet} loading={noticeSending}>
                            {isNoticeActive ? 'Mettre à jour' : 'Activer la bannière'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Invite admin */}
                  {invSuccess && (
                    <div style={{
                      background: 'var(--success-soft)', border: '1px solid var(--success)', borderRadius: 6,
                      padding: '10px 12px', color: 'var(--success-text)', fontSize: 13, marginTop: 12,
                    }}>
                      {invSuccess}
                    </div>
                  )}

                  {!showInviteForm ? (
                    <div style={{ marginTop: 16 }}>
                      <button type="button" onClick={() => { setShowInviteForm(true); setInvSuccess(null) }} style={{
                        padding: '10px 16px', borderRadius: 8, border: 'none',
                        background: 'var(--accent)', color: 'var(--text-inverse)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                      }}>
                        Inviter l'admin
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleInviteSubmit} style={{
                      marginTop: 16, background: 'var(--bg-input)', borderRadius: 10,
                      border: '1px solid var(--border-color)', padding: 16,
                    }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
                        Inviter un administrateur
                      </div>

                      <div style={{ marginBottom: 10 }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                          Email de l'admin *
                        </label>
                        <input type="email" value={invEmail} onChange={(e) => setInvEmail(e.target.value)}
                          required placeholder="admin@example.com" style={inputStyle} />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                            Prénom
                          </label>
                          <input type="text" value={invFirst} onChange={(e) => setInvFirst(e.target.value)}
                            placeholder="Prénom" style={inputStyle} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                            Nom
                          </label>
                          <input type="text" value={invLast} onChange={(e) => setInvLast(e.target.value)}
                            placeholder="Nom" style={inputStyle} />
                        </div>
                      </div>

                      {invError && (
                        <div style={{
                          background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 6,
                          padding: '10px 12px', color: 'var(--danger-text)', fontSize: 13, marginBottom: 10,
                        }}>
                          {invError}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button type="button" onClick={resetInviteForm} style={btnSecondary}>
                          Annuler
                        </button>
                        <button type="submit" disabled={invSending} style={{
                          ...btnPrimary, background: 'var(--accent)',
                          opacity: invSending ? 0.6 : 1, cursor: invSending ? 'not-allowed' : 'pointer',
                        }}>
                          {invSending ? 'Envoi...' : 'Envoyer l\'invitation'}
                        </button>
                      </div>
                    </form>
                  )}
                </>
              ) : (
                <>
                  {/* Administrateurs tab */}
                  {removeSuccess && (
                    <div style={{ background: 'var(--success-soft)', border: '1px solid var(--success)', borderRadius: 6, padding: '10px 12px', color: 'var(--success-text)', fontSize: 13, marginBottom: 12 }}>
                      {removeSuccess}
                    </div>
                  )}
                  {club.admins && club.admins.length > 0 ? (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nom</th>
                          <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</th>
                          <th style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {club.admins.map((a) => {
                          const fullName = [a.first_name, a.last_name].filter(Boolean).join(' ') || '—'
                          const rs = resetState[a.profile_id]
                          const handleReset = async () => {
                            setResetState((prev) => ({ ...prev, [a.profile_id]: { loading: true } }))
                            const { data, error: fnErr } = await invokeFunction('console-reset-admin-password', {
                              method: 'POST',
                              body: { club_id: club.id, email: a.email },
                            })
                            if (fnErr || !data?.success) {
                              setResetState((prev) => ({ ...prev, [a.profile_id]: { error: data?.error || fnErr || 'Erreur lors de l\'envoi.' } }))
                            } else {
                              setResetState((prev) => ({ ...prev, [a.profile_id]: { success: `Email de réinitialisation envoyé à ${a.email}.` } }))
                            }
                          }
                          return (
                            <tr key={a.profile_id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '10px 12px', color: 'var(--text-primary)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  {fullName}
                                  <StatusPill variant={a.has_mfa ? 'green' : 'neutral'}>
                                    {a.has_mfa ? 'MFA active' : 'MFA inactive'}
                                  </StatusPill>
                                </div>
                              </td>
                              <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>
                                {a.email || '—'}
                                {rs?.success && <div style={{ color: 'var(--success-text)', fontSize: 12, marginTop: 2 }}>{rs.success}</div>}
                                {rs?.error && <div style={{ color: 'var(--danger-text)', fontSize: 12, marginTop: 2 }}>{rs.error}</div>}
                                {mfaResetState[a.profile_id]?.success && <div style={{ color: 'var(--success-text)', fontSize: 12, marginTop: 2 }}>{mfaResetState[a.profile_id].success}</div>}
                                {mfaResetState[a.profile_id]?.error && <div style={{ color: 'var(--danger-text)', fontSize: 12, marginTop: 2 }}>{mfaResetState[a.profile_id].error}</div>}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                  <button
                                    type="button"
                                    disabled={!a.email || rs?.loading}
                                    onClick={handleReset}
                                    style={{
                                      padding: '5px 10px', fontSize: 12, fontWeight: 600, borderRadius: 6,
                                      border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: !a.email ? 'var(--text-muted)' : 'var(--text-secondary)',
                                      cursor: !a.email || rs?.loading ? 'not-allowed' : 'pointer',
                                      opacity: rs?.loading ? 0.6 : 1, whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {rs?.loading ? 'Envoi...' : 'Réinitialiser le mot de passe'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!a.has_mfa}
                                    onClick={() => { setMfaResetTarget(a); setMfaResetLoading(false) }}
                                    title={!a.has_mfa ? 'Aucun facteur MFA à réinitialiser' : undefined}
                                    style={{
                                      padding: '5px 10px', fontSize: 12, fontWeight: 600, borderRadius: 6,
                                      border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: !a.has_mfa ? 'var(--text-muted)' : 'var(--text-secondary)',
                                      cursor: !a.has_mfa ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
                                      opacity: !a.has_mfa ? 0.6 : 1,
                                    }}
                                  >
                                    Réinitialiser la MFA
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setRemoveTarget(a); setRemoveConfirmEmail(''); setRemoveError(null); setRemoveSuccess(null) }}
                                    style={{
                                      padding: '5px 10px', fontSize: 12, fontWeight: 600, borderRadius: 6,
                                      border: '1px solid var(--danger)', background: 'var(--danger-soft)', color: 'var(--danger-text)',
                                      cursor: 'pointer', whiteSpace: 'nowrap',
                                    }}
                                  >
                                    Retirer le rôle admin
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '24px 0', textAlign: 'center' }}>
                      Aucun administrateur pour ce club.
                    </div>
                  )}

                  {/* Remove admin confirmation panel */}
                  {removeTarget && (() => {
                    const targetName = [removeTarget.first_name, removeTarget.last_name].filter(Boolean).join(' ') || '—'
                    const targetEmail = removeTarget.email || ''
                    const emailMatches = targetEmail.length > 0 && removeConfirmEmail.trim().toLowerCase() === targetEmail.toLowerCase()
                    const handleConfirmRemove = async () => {
                      setRemoveLoading(true)
                      setRemoveError(null)
                      const { data, error: fnErr } = await invokeFunction('console-remove-admin-role', {
                        method: 'POST',
                        body: { club_id: club.id, profile_id: removeTarget.profile_id },
                      })
                      setRemoveLoading(false)
                      if (fnErr || !data?.success) {
                        setRemoveError(data?.error || fnErr || 'Erreur lors du retrait du rôle.')
                        return
                      }
                      setRemoveTarget(null)
                      setRemoveSuccess('Rôle administrateur retiré.')
                      onRefresh()
                    }
                    return (
                      <div style={{
                        marginTop: 16, padding: 16, borderRadius: 8,
                        background: 'var(--bg-card)', border: '1px solid var(--danger)',
                      }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--danger-text)', marginBottom: 8 }}>
                          Retirer le rôle administrateur
                        </div>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 12px' }}>
                          Vous êtes sur le point de retirer le rôle administrateur de <strong style={{ color: 'var(--text-primary)' }}>{targetName}</strong> ({targetEmail || 'pas d\'email'}) pour ce club.
                          Cette personne conservera son compte mais n'aura plus accès à l'administration de ce club.
                        </p>
                        <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
                          Saisissez l'email de l'administrateur pour confirmer
                        </label>
                        <input
                          type="text"
                          value={removeConfirmEmail}
                          onChange={(e) => setRemoveConfirmEmail(e.target.value)}
                          placeholder={targetEmail}
                          style={{
                            width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 6,
                            background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                            outline: 'none', boxSizing: 'border-box',
                          }}
                          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--border-strong)' }}
                          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)' }}
                        />
                        {removeError && (
                          <div style={{ color: 'var(--danger-text)', fontSize: 12, marginTop: 8 }}>{removeError}</div>
                        )}
                        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={() => { setRemoveTarget(null); setRemoveError(null) }}
                            disabled={removeLoading}
                            style={{
                              padding: '7px 14px', fontSize: 13, fontWeight: 600, borderRadius: 6,
                              border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-secondary)', cursor: 'pointer',
                            }}
                          >
                            Annuler
                          </button>
                          <button
                            type="button"
                            disabled={!emailMatches || removeLoading}
                            onClick={handleConfirmRemove}
                            style={{
                              padding: '7px 14px', fontSize: 13, fontWeight: 600, borderRadius: 6,
                              border: '1px solid var(--danger)', color: 'var(--text-inverse)',
                              background: 'var(--danger)',
                              cursor: !emailMatches || removeLoading ? 'not-allowed' : 'pointer',
                              opacity: removeLoading ? 0.6 : 1,
                            }}
                          >
                            {removeLoading ? 'Suppression...' : 'Confirmer le retrait'}
                          </button>
                        </div>
                      </div>
                    )
                  })()}

                  {/* MFA reset confirmation panel */}
                  {mfaResetTarget && (() => {
                    const targetName = [mfaResetTarget.first_name, mfaResetTarget.last_name].filter(Boolean).join(' ') || '—'
                    const targetEmail = mfaResetTarget.email || 'pas d\'email'
                    const handleConfirmMfaReset = async () => {
                      setMfaResetLoading(true)
                      const { data, error: fnErr } = await invokeFunction('console-reset-mfa', {
                        method: 'POST',
                        body: { profile_id: mfaResetTarget.profile_id },
                      })
                      setMfaResetLoading(false)
                      if (fnErr || !data?.success) {
                        setMfaResetState((prev) => ({ ...prev, [mfaResetTarget.profile_id]: { error: data?.error || fnErr || 'Erreur lors de la réinitialisation MFA.' } }))
                      } else {
                        setMfaResetState((prev) => ({ ...prev, [mfaResetTarget.profile_id]: { success: `MFA réinitialisée pour ${targetEmail}.` } }))
                        onRefresh()
                      }
                      setMfaResetTarget(null)
                    }
                    return (
                      <div style={{
                        marginTop: 16, padding: 16, borderRadius: 8,
                        background: 'var(--bg-card)', border: '1px solid var(--warning)',
                      }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--warning)', marginBottom: 8 }}>
                          Réinitialiser la MFA
                        </div>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 12px' }}>
                          Vous êtes sur le point de supprimer tous les facteurs MFA de <strong style={{ color: 'var(--text-primary)' }}>{targetName}</strong> ({targetEmail}).
                          L'utilisateur devra reconfigurer son authentification à deux facteurs lors de sa prochaine connexion.
                        </p>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={() => setMfaResetTarget(null)}
                            disabled={mfaResetLoading}
                            style={{
                              padding: '7px 14px', fontSize: 13, fontWeight: 600, borderRadius: 6,
                              border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-secondary)', cursor: 'pointer',
                            }}
                          >
                            Annuler
                          </button>
                          <button
                            type="button"
                            disabled={mfaResetLoading}
                            onClick={handleConfirmMfaReset}
                            style={{
                              padding: '7px 14px', fontSize: 13, fontWeight: 600, borderRadius: 6,
                              border: '1px solid var(--warning)', color: 'var(--text-inverse)',
                              background: 'var(--warning)',
                              cursor: mfaResetLoading ? 'not-allowed' : 'pointer',
                              opacity: mfaResetLoading ? 0.6 : 1,
                            }}
                          >
                            {mfaResetLoading ? 'Réinitialisation...' : 'Confirmer la réinitialisation'}
                          </button>
                        </div>
                      </div>
                    )
                  })()}
                </>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

function DetailGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 4 }}>
      {children}
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    return `${day}.${month}.${d.getFullYear()}`
  } catch {
    return iso
  }
}

function fmtDateTimeFull(iso: string): string {
  try {
    const d = new Date(iso)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const hours = String(d.getHours()).padStart(2, '0')
    const mins = String(d.getMinutes()).padStart(2, '0')
    return `${day}.${month}.${d.getFullYear()} ${hours}:${mins}`
  } catch {
    return iso
  }
}

/* ------------------------------------------------------------------ */
/*  Layout shells                                                      */
/* ------------------------------------------------------------------ */

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '40px 24px' }}>
        {children}
      </div>
    </div>
  )
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--bg-app)', padding: 16,
    }}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 12, padding: 32,
        width: '100%', maxWidth: 400, boxShadow: 'var(--shadow)',
        border: '1px solid var(--border-color)',
      }}>
        {children}
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
      <div style={{
        width: 32, height: 32, border: '3px solid var(--border-color)',
        borderTopColor: 'var(--accent)', borderRadius: '50%',
        animation: 'console-spin 0.6s linear infinite',
      }} />
      <style>{`@keyframes console-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Shared styles                                                      */
/* ------------------------------------------------------------------ */

const cellStyle: React.CSSProperties = { padding: '12px 16px', color: 'var(--text-secondary)' }

const inputStyle: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)',
  fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box',
  background: 'var(--bg-input)', color: 'var(--text-primary)',
}

const btnPrimary: React.CSSProperties = {
  padding: '10px 16px', borderRadius: 8, border: 'none',
  background: 'var(--accent)', color: 'var(--text-inverse)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
}

const btnSecondary: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-color)',
  background: 'transparent', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer',
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 50, padding: 16,
}

const modalStyle: React.CSSProperties = {
  background: 'var(--bg-card)', borderRadius: 12, padding: 0,
  width: '100%', maxWidth: 520, boxShadow: 'var(--shadow-lg)',
  border: '1px solid var(--border-color)', overflow: 'hidden',
}

const modalHeaderStyle: React.CSSProperties = {
  background: 'var(--bg-table-header)', padding: '20px 28px',
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
}

const modalBodyStyle: React.CSSProperties = {
  padding: '24px 28px',
}

const closeBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', fontSize: 22, color: 'var(--text-muted)',
  cursor: 'pointer', padding: '0 4px', lineHeight: 1,
}