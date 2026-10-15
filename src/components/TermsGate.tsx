import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { acceptTerms, applySignupMetadataAcceptance, clearTermsCache, getTermsStatus, type TermsStatus } from '../lib/terms'
import Button from './ui/Button'
import { Alert } from './ui/Alert'
import { TermsLink } from './TermsCheckbox'

const SUMMARY = [
  'Votre compte est personnel : vous ne prêtez ni ne partagez vos identifiants, et vous choisissez un mot de passe robuste.',
  "Vous utilisez la plateforme dans le cadre du rôle que votre club vous a attribué, sans chercher à obtenir d'autres accès.",
  'Les données des familles, des joueurs et des mineurs que vous voyez servent au club et à rien d\'autre : vous ne les diffusez pas.',
  "Pas d'usage détourné : ni intrusion, ni extraction de données, ni contenu illicite.",
  "La plateforme vous envoie les notifications liées à la vie du club ; vous gardez une adresse e-mail valable.",
  'Droit suisse ; en cas de litige, les tribunaux de Lausanne sont compétents.',
]

const SAVE_ERROR = "Impossible d'enregistrer votre acceptation. Vérifiez votre connexion et réessayez."

function GateLoading() {
  return (
    <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--bg-app)' }}>
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2" style={{ borderColor: 'var(--accent)' }}></div>
    </div>
  )
}

export function TermsGate({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth()
  const userId = user?.id ?? null
  const [status, setStatus] = useState<TermsStatus | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [checked, setChecked] = useState(false)
  const [saving, setSaving] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setLoadFailed(false)
    getTermsStatus(userId)
      .then((s) => applySignupMetadataAcceptance(userId, s))
      .then((s) => { if (!cancelled) setStatus(s) })
      .catch(() => { if (!cancelled) setLoadFailed(true) })
    return () => { cancelled = true }
  }, [userId, reloadKey])

  const handleRefuse = async () => {
    setSigningOut(true)
    try {
      localStorage.removeItem('adminMenuOpen')
      clearTermsCache()
      await signOut()
    } catch {
      setSigningOut(false)
    }
  }

  const handleAccept = async () => {
    if (!userId || !status || !checked) return
    setSaving(true)
    setError(null)
    try {
      setStatus(await acceptTerms(userId, status, 'login'))
    } catch {
      setError(SAVE_ERROR)
      setSaving(false)
    }
  }

  if (!userId) return <>{children}</>
  if (status?.accepted) return <>{children}</>
  if (!status && !loadFailed) return <GateLoading />

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-app)' }}>
      <div className="page-container mx-auto max-w-xl py-8 space-y-4">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Conditions d'utilisation
        </h1>

        {!status ? (
          <>
            <Alert variant="danger">{SAVE_ERROR}</Alert>
            <div className="flex flex-col gap-2">
              <Button variant="primary" onClick={() => setReloadKey((k) => k + 1)}>Réessayer</Button>
              <Button variant="secondary" loading={signingOut} onClick={handleRefuse}>
                Refuser et me déconnecter
              </Button>
            </div>
          </>
        ) : (
          <>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Pour utiliser ClubSphère, merci de prendre connaissance des conditions d'utilisation et de les accepter.
            </p>

            <div className="rounded-xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                L'essentiel en six points
              </h2>
              <ol className="space-y-2 list-decimal pl-5">
                {SUMMARY.map((line) => (
                  <li key={line} className="text-sm" style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {line}
                  </li>
                ))}
              </ol>
            </div>

            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Ce résumé facilite la lecture ; seul le texte complet fait foi.
            </p>
            <TermsLink version={status.version} url={status.url} />

            <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={saving}
                  onChange={(e) => setChecked(e.target.checked)}
                  className="w-4 h-4 rounded mt-0.5 shrink-0"
                  style={{ accentColor: 'var(--accent)' }}
                />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {`J'ai lu et j'accepte les conditions d'utilisation (version ${status.version}).`}
                </span>
              </label>
            </div>

            {error && <Alert variant="danger">{error}</Alert>}

            <div className="flex flex-col gap-2">
              <Button variant="primary" disabled={!checked || signingOut} loading={saving} onClick={handleAccept}>
                Accepter et continuer
              </Button>
              <Button variant="secondary" disabled={saving} loading={signingOut} onClick={handleRefuse}>
                Refuser et me déconnecter
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
