import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { CompactThemeToggle } from '../components/ThemeToggle'
import { supabase } from '../lib/supabase'
import { Mail, CheckCircle } from 'lucide-react'
import Button from '../components/ui/Button'
import { Alert } from '../components/ui/Alert'
import { useTenant } from '../context/TenantContext'

type OtpType = 'signup' | 'magiclink' | 'invite' | 'email_change'

const TITLES: Record<OtpType, string> = {
  signup: 'Confirmez votre adresse e-mail',
  magiclink: 'Connexion',
  invite: 'Activation de votre accès',
  email_change: 'Confirmation de votre nouvelle adresse e-mail',
}

function isOtpType(v: string | null): v is OtpType {
  return v === 'signup' || v === 'magiclink' || v === 'invite' || v === 'email_change'
}

export function AuthConfirm() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const { clubName } = useTenant()

  const tokenHash = searchParams.get('token_hash')
  const typeParam = searchParams.get('type')
  const otpType = isOtpType(typeParam) ? typeParam : null

  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [resendEmail, setResendEmail] = useState('')
  const [showResendInput, setShowResendInput] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [resendSuccess, setResendSuccess] = useState(false)

  const legacyHandled = useRef(false)

  // Handle legacy flow: session in URL hash (old Supabase e-mails)
  useEffect(() => {
    if (legacyHandled.current) return
    if (tokenHash) return
    legacyHandled.current = true

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        subscription.unsubscribe()
        navigate('/dashboard')
      }
    })

    return () => { subscription.unsubscribe() }
  }, [tokenHash, navigate])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  const handleConfirm = async () => {
    if (!tokenHash || !otpType) return
    setError('')
    setConfirming(true)

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: otpType === 'invite' ? 'invite' : otpType === 'email_change' ? 'email_change' : otpType === 'magiclink' ? 'magiclink' : 'signup',
      })

      if (verifyError) {
        setError('Ce lien a expiré ou a déjà été utilisé.')
        setConfirming(false)
        return
      }

      if (otpType === 'email_change') {
        navigate('/login?message=email_changed')
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        navigate('/login?registered=true')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', session.user.id)
        .maybeSingle()

      if (!profile || profile.onboarding_completed === false) {
        navigate('/onboarding')
      } else {
        navigate('/dashboard')
      }
    } catch {
      setError('Ce lien a expiré ou a déjà été utilisé.')
    } finally {
      setConfirming(false)
    }
  }

  const handleResend = async () => {
    const targetEmail = resendEmail.trim()
    if (!targetEmail) {
      setShowResendInput(true)
      return
    }
    setResendSuccess(false)
    const { error: resendErr } = await supabase.auth.resend({ type: 'signup', email: targetEmail })
    if (!resendErr) {
      setResendSuccess(true)
      setResendCooldown(60)
    }
  }

  const missing = !tokenHash || !otpType
  const title = otpType ? TITLES[otpType] : ''

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
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: '40px',
            gap: '12px'
          }}>
            {theme.logoUrl ? (
              <img
                src={theme.logoUrl}
                alt={clubName || 'Club'}
                style={{ height: '72px', objectFit: 'contain', display: 'block' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            ) : null}
            <h1 style={{
              fontSize: '22px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              margin: 0,
              textAlign: 'center',
              lineHeight: 1.2
            }}>
              {clubName || 'ClubSphere'}
            </h1>
          </div>

          {missing ? (
            <div className="text-center py-6">
              <Alert variant="danger">
                Lien invalide.{' '}
                <Link to="/login" style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 600 }}>
                  Retour à la connexion
                </Link>
              </Alert>
            </div>
          ) : !error ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '50%',
                background: 'var(--info-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px'
              }}>
                {otpType === 'email_change' ? (
                  <Mail size={28} style={{ color: 'var(--info)' }} />
                ) : (
                  <CheckCircle size={28} style={{ color: 'var(--info)' }} />
                )}
              </div>
              <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', fontWeight: 700, marginBottom: '24px' }}>
                {title}
              </h2>
              <Button
                variant="primary"
                onClick={handleConfirm}
                disabled={confirming}
                className="w-full"
                size="lg"
              >
                {confirming ? 'Vérification...' : 'Confirmer'}
              </Button>
            </div>
          ) : (
            <div style={{ textAlign: 'center' }} className="space-y-4">
              <Alert variant="danger">
                {error}{' '}
                <Link to="/login" style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 600 }}>
                  Retour à la connexion
                </Link>
              </Alert>

              {otpType === 'signup' && (
                <div className="space-y-3" style={{ marginTop: '16px' }}>
                  {showResendInput && (
                    <div>
                      <input
                        type="email"
                        value={resendEmail}
                        onChange={(e) => setResendEmail(e.target.value)}
                        placeholder="votre@email.com"
                        className="w-full rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1"
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '10px' }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent)' }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.boxShadow = 'none' }}
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={resendCooldown > 0 || (showResendInput && !resendEmail.trim())}
                    onClick={handleResend}
                    style={{
                      background: 'var(--bg-hover)', border: '1px solid var(--border-color)',
                      borderRadius: '10px', padding: '10px 20px', fontSize: '13px', fontWeight: 600,
                      color: 'var(--text-primary)', cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
                      opacity: resendCooldown > 0 ? 0.6 : 1, width: '100%',
                    }}
                  >
                    {resendCooldown > 0 ? `Renvoyer (${resendCooldown}s)` : "Renvoyer l'e-mail de confirmation"}
                  </button>
                  {resendSuccess && (
                    <p style={{ color: 'var(--success-text)', fontSize: '13px', fontWeight: 600 }}>E-mail renvoyé !</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
