import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { CompactThemeToggle } from '../components/ThemeToggle'
import { supabase } from '../lib/supabase'
import { Lock, Shield } from 'lucide-react'
import Button from '../components/ui/Button'
import { Alert } from '../components/ui/Alert'
import PasswordInput from '../components/PasswordInput'
import { passwordLongEnough, mapPasswordAuthError, PasswordLengthHint, PasswordMismatchHint } from '../components/PasswordChecklist'
import { translateAuthError } from '../utils/authErrorMessages'

type PageMode = 'loading' | 'token_hash' | 'legacy_session' | 'invalid'
type Step = 'password' | 'mfa'

export function ResetPassword() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [passwordErrors, setPasswordErrors] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(false)
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const hasTokenHash = !!tokenHash && type === 'recovery'

  const [mode, setMode] = useState<PageMode>(hasTokenHash ? 'token_hash' : 'loading')
  const [step, setStep] = useState<Step>('password')
  const [mfaCode, setMfaCode] = useState('')
  const [mfaError, setMfaError] = useState('')
  const [mfaLoading, setMfaLoading] = useState(false)
  const legacyChecked = useRef(false)
  const recoverySessionReady = useRef(false)
  const mfaVerified = useRef(false)

  useEffect(() => {
    if (hasTokenHash) return

    if (legacyChecked.current) return
    legacyChecked.current = true

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('legacy_session')
        subscription.unsubscribe()
      }
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setMode('legacy_session')
        subscription.unsubscribe()
      } else {
        const timer = setTimeout(() => {
          setMode((prev) => (prev === 'loading' ? 'invalid' : prev))
          subscription.unsubscribe()
        }, 3000)
        return () => clearTimeout(timer)
      }
    })

    return () => { subscription.unsubscribe() }
  }, [hasTokenHash])

  const passwordsMatch = newPassword.length > 0 && confirmPassword.length > 0 && newPassword === confirmPassword
  const canSubmit = passwordLongEnough(newPassword) && passwordsMatch

  async function updatePasswordAndRedirect() {
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword })
    if (updateErr) {
      const passwordLines = mapPasswordAuthError(updateErr.message)
      if (passwordLines) {
        setPasswordErrors(passwordLines)
        setStep('password')
        return
      }
      const code = (updateErr as any).code as string | undefined
      if (code === 'insufficient_aal' || updateErr.message?.includes('insufficient_aal')) {
        throw new Error('Ce compte est protégé par la vérification en deux étapes : le code de votre application est requis pour changer le mot de passe.')
      }
      if (code === 'same_password') {
        throw new Error('Le nouveau mot de passe doit être différent de l’ancien.')
      }
      throw new Error(translateAuthError(updateErr))
    }
    navigate('/login?password_updated=true')
  }

  async function checkMfaRequired(): Promise<boolean> {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    return data?.nextLevel === 'aal2' && data?.currentLevel === 'aal1'
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setPasswordErrors(null)

    if (!canSubmit) return

    setLoading(true)

    try {
      if (mode === 'token_hash' && !recoverySessionReady.current) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash!,
          type: 'recovery',
        })
        if (verifyError) {
          setError('Ce lien a expiré ou a déjà été utilisé. Demandez un nouveau lien depuis « Mot de passe oublié ».')
          setLoading(false)
          return
        }
      }
      recoverySessionReady.current = true

      if (!mfaVerified.current) {
        const needsMfa = await checkMfaRequired()
        if (needsMfa) {
          setStep('mfa')
          setLoading(false)
          return
        }
      }

      await updatePasswordAndRedirect()
    } catch (err) {
      setError(err instanceof Error ? err.message : translateAuthError(''))
    } finally {
      setLoading(false)
    }
  }

  const handleMfaSubmit = async () => {
    if (mfaCode.length !== 6) {
      setMfaError('Le code doit contenir 6 chiffres')
      return
    }
    setMfaError('')
    setMfaLoading(true)

    try {
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totp = factors?.totp?.find(f => f.status === 'verified')
      if (!totp) {
        setMfaError('Aucun facteur d’authentification trouvé.')
        setMfaLoading(false)
        return
      }

      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: totp.id,
      })
      if (challengeError) throw challengeError

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: totp.id,
        challengeId: challengeData.id,
        code: mfaCode,
      })
      if (verifyError) {
        setMfaError('Code incorrect. Réessayez.')
        setMfaCode('')
        setMfaLoading(false)
        return
      }

      mfaVerified.current = true
      await updatePasswordAndRedirect()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Impossible de modifier le mot de passe. Réessayez ou demandez un nouveau lien.'
      setStep('password')
      setError(msg)
      setMfaCode('')
      setMfaError('')
    } finally {
      setMfaLoading(false)
    }
  }

  const handleMfaKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && mfaCode.length === 6) {
      handleMfaSubmit()
    }
  }

  const focusStyle = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = 'var(--accent)'
    e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent)'
  }
  const blurStyle = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = 'var(--border-color)'
    e.currentTarget.style.boxShadow = 'none'
  }

  const showForm = (mode === 'token_hash' || mode === 'legacy_session') && step === 'password'
  const showMfa = (mode === 'token_hash' || mode === 'legacy_session') && step === 'mfa'

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-app)', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 16, right: 16 }}>
        <CompactThemeToggle />
      </div>
      <div className="w-full max-w-2xl">
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '22px',
          boxShadow: 'var(--shadow-lg)',
          padding: '32px',
        }}>
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{theme.name}</h1>
            <p style={{ color: 'var(--text-secondary)' }}>Réinitialisation du mot de passe</p>
          </div>

          {mode === 'loading' && (
            <div className="text-center py-8">
              <div className="animate-spin mx-auto mb-4" style={{ width: 28, height: 28, border: '3px solid var(--border-color)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Vérification du lien...</p>
            </div>
          )}

          {mode === 'invalid' && (
            <div className="text-center py-6">
              <Alert variant="danger">
                Lien invalide. Demandez un nouveau lien depuis{' '}
                <Link to="/login" style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 600 }}>
                  « Mot de passe oublié »
                </Link>.
              </Alert>
            </div>
          )}

          {showForm && (
            <form onSubmit={handlePasswordSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Nouveau mot de passe
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 w-5 h-5" style={{ color: 'var(--text-muted)' }} />
                  <PasswordInput
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setPasswordErrors(null) }}
                    placeholder="Mot de passe"
                    className="w-full pl-10 py-2 focus:outline-none focus:ring-1"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '10px' }}
                    onFocus={focusStyle}
                    onBlur={blurStyle}
                    required
                  />
                </div>
                <PasswordLengthHint password={newPassword} errors={passwordErrors} />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Confirmer le mot de passe
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 w-5 h-5" style={{ color: 'var(--text-muted)' }} />
                  <PasswordInput
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 py-2 focus:outline-none focus:ring-1"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '10px' }}
                    onFocus={focusStyle}
                    onBlur={blurStyle}
                    required
                  />
                </div>
                <PasswordMismatchHint password={newPassword} confirmPassword={confirmPassword} />
              </div>

              {error && (
                <Alert variant="danger">
                  {error}
                  {error.includes('expiré') && (
                    <>
                      {' '}
                      <Link to="/login" style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 600 }}>
                        Retour à la connexion
                      </Link>
                    </>
                  )}
                </Alert>
              )}

              <Button
                variant="primary"
                type="submit"
                disabled={loading || !canSubmit}
                className="w-full"
              >
                {loading ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </form>
          )}

          {showMfa && (
            <div className="space-y-5">
              <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                <div style={{
                  width: '56px', height: '56px', borderRadius: '50%',
                  background: 'var(--info-soft)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px',
                }}>
                  <Shield size={28} style={{ color: 'var(--info)' }} />
                </div>
                <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                  Vérification en deux étapes
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
                  Entrez le code à 6 chiffres de votre application d'authentification
                </p>
              </div>

              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={6}
                value={mfaCode}
                onChange={e => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={handleMfaKeyDown}
                placeholder="000000"
                style={{
                  width: '100%',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '14px',
                  color: 'var(--text-primary)',
                  fontSize: '28px',
                  fontWeight: 600,
                  textAlign: 'center',
                  letterSpacing: '10px',
                }}
              />

              {mfaError && (
                <Alert variant="danger">{mfaError}</Alert>
              )}

              <Button
                variant="primary"
                onClick={handleMfaSubmit}
                loading={mfaLoading}
                disabled={mfaCode.length !== 6}
                className="w-full"
                size="lg"
              >
                Vérifier et enregistrer
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
