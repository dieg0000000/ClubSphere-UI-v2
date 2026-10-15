import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { invokeFunction } from '../lib/invokeFunction'
import { pushSupported } from '../lib/pushSubscription'
import { Mail, Lock, ArrowLeft, Eye, EyeOff, User } from 'lucide-react'
import { translateAuthError, isRateLimitError } from '../utils/authErrorMessages'
import PasswordInput from '../components/PasswordInput'
import { passwordLongEnough, mapPasswordAuthError, PasswordLengthHint, PasswordMismatchHint } from '../components/PasswordChecklist'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useTenant } from '../context/TenantContext'
import { useTheme } from '../context/ThemeContext'
import { CompactThemeToggle } from '../components/ThemeToggle'
import Button from '../components/ui/Button'
import { Alert } from '../components/ui/Alert'
import { TermsCheckbox } from '../components/TermsCheckbox'
import { recordSignupAcceptance, signupTermsMetadata } from '../lib/terms'

type RegistrationStep = 'login' | 'forgot-password' | 'role-select' | 'account' | 'supporter-form' | 'email-confirmation' | 'existing-account'
type UserRole = 'parent' | 'member' | 'supporter'

export function Login() {
  const [searchParams] = useSearchParams()
  const [step, setStep] = useState<RegistrationStep>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null)
  const [regFirstName, setRegFirstName] = useState('')
  const [regLastName, setRegLastName] = useState('')
  const [forgotEmail, setForgotEmail] = useState('')
  const [error, setError] = useState('')
  const [passwordErrors, setPasswordErrors] = useState<string[] | null>(null)
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0)

  useEffect(() => {
    if (rateLimitCountdown <= 0) return
    const t = setTimeout(() => setRateLimitCountdown(rateLimitCountdown - 1), 1000)
    return () => clearTimeout(t)
  }, [rateLimitCountdown])

  const startRateLimitCooldown = () => setRateLimitCountdown(30)
  const isDisabled = loading || rateLimitCountdown > 0
  // Supporter form fields
  const [supFirstName, setSupFirstName] = useState('')
  const [supLastName, setSupLastName] = useState('')
  const [supEmail, setSupEmail] = useState('')
  const [supPassword, setSupPassword] = useState('')
  const [supConfirmPassword, setSupConfirmPassword] = useState('')
  const [termsChecked, setTermsChecked] = useState(false)
  const [confirmationEmail, setConfirmationEmail] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const [resendSuccess, setResendSuccess] = useState(false)
  const [loginEmailNotConfirmed, setLoginEmailNotConfirmed] = useState(false)
  const [coachInviteEmail, setCoachInviteEmail] = useState<string | null>(null)
  const { updateProfile } = useAuth()
  const navigate = useNavigate()
  const { clubId, clubName, clubSlug } = useTenant()
  const { theme } = useTheme()

  useEscapeKey(() => {
    if (step !== 'login' && step !== 'email-confirmation' && step !== 'existing-account') {
      setStep('login')
      setError('')
      setInfo('')
    }
  })

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  const handleResendConfirmation = async (targetEmail: string) => {
    setResendSuccess(false)
    const { error: resendErr } = await supabase.auth.resend({ type: 'signup', email: targetEmail })
    if (!resendErr) {
      setResendSuccess(true)
      setResendCooldown(60)
    }
  }

  const handleLoginResend = async () => {
    setResendSuccess(false)
    const { error: resendErr } = await supabase.auth.resend({ type: 'signup', email })
    if (!resendErr) {
      setResendSuccess(true)
      setResendCooldown(60)
    }
  }


  useEffect(() => {
    if (searchParams.get('registered') === 'true') {
      setInfo('Compte créé ! Connectez-vous avec votre email et mot de passe.')
      const emailParam = searchParams.get('email')
      if (emailParam) {
        setEmail(emailParam)
      }
    }
    if (searchParams.get('password_updated') === 'true') {
      setInfo('Mot de passe mis à jour avec succès. Connectez-vous.')
    }
    if (searchParams.get('message') === 'email_changed') {
      setInfo('Votre email a été modifié. Veuillez vous reconnecter avec votre nouvel email.')
    }
    if (searchParams.get('account_deleted') === '1') {
      setInfo('Votre compte a été supprimé.')
    }
    if (searchParams.get('error') === 'no_club_access') {
      setError("Vous n'avez pas accès à ce club.")
    }
    if (searchParams.get('session_expired') === '1') {
      setInfo('Votre session a expiré, merci de vous reconnecter.')
    }
  }, [searchParams])

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)

    try {
      const { error } = await invokeFunction('send-password-reset', {
        body: { email: forgotEmail, club_id: clubId }
      })
      if (error) throw error
      setInfo('Un email de réinitialisation a été envoyé à ' + forgotEmail)
    } catch {
      setError('Erreur lors de l\'envoi de l\'email')
    } finally {
      setLoading(false)
    }
  }

  const checkCoachAccess = async (userId: string) => {
    const { data: coachData } = await supabase
      .from('coaches')
      .select('can_login, first_name, last_name, status')
      .eq('user_id', userId)
      .maybeSingle()

    console.log('Coach access check:', coachData)

    if (coachData && coachData.can_login === false) {
      await supabase.auth.signOut()
      return false
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoginEmailNotConfirmed(false)
    setLoading(true)

    try {
      const { data: { session }, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (authError) {
        if (authError.message.toLowerCase().includes('email not confirmed')) {
          setLoginEmailNotConfirmed(true)
          setResendCooldown(0)
          setResendSuccess(false)
          return
        }
        if (isRateLimitError(authError)) startRateLimitCooldown()
        setError(translateAuthError(authError as any))
        return
      }
      if (!session?.user) {
        setError('Erreur de connexion. Veuillez réessayer.')
        return
      }

      const userId = session.user.id
      const userEmail = session.user.email || email

      const allowed = await checkCoachAccess(userId)
      if (!allowed) {
        setError('Votre accès a été désactivé. Contactez le club.')
        return
      }

      try {
        const { error: syncError } = await supabase.rpc('sync_user_profile', {
          p_user_id: userId,
          p_email: userEmail
        })
        console.log('Step 1 sync done', syncError ? 'ERROR:' + syncError.message : 'OK')

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role, full_name, onboarding_completed')
          .eq('id', userId)
          .maybeSingle()
        console.log('Step 2 profile:', profile, profileError ? 'ERROR:' + profileError.message : 'OK')

        if (profileError) throw profileError

        const currentRole = profile?.role
        console.log('Step 3 role:', currentRole)

        const knownRoles = ['admin', 'president', 'vice_president', 'committee', 'coach', 'assistant_coach', 'member', 'parent', 'supporter', 'responsable_technique', 'responsable_competitions']

        if (!profile) {
          const { data: committeeMember } = await supabase
            .from('committee_members')
            .select('role, first_name, last_name')
            .ilike('email', userEmail)
            .maybeSingle()

          const metadataRole = session.user.user_metadata?.role as string | undefined
          const resolvedRole = committeeMember?.role || (metadataRole && knownRoles.includes(metadataRole) ? metadataRole : 'member')
          const resolvedName = committeeMember
            ? `${committeeMember.first_name || ''} ${committeeMember.last_name || ''}`.trim()
            : (session.user.user_metadata?.full_name as string || '')

          const { error: upsertErr } = await supabase.from('profiles').upsert({
            id: userId,
            email: userEmail,
            role: resolvedRole,
            full_name: resolvedName || userEmail,
            ...(metadataRole === 'supporter' && session.user.user_metadata?.first_name ? {
              first_name: session.user.user_metadata.first_name,
              last_name: session.user.user_metadata.last_name || '',
            } : {}),
          })
          if (upsertErr) console.error('Profile upsert error:', upsertErr)
        } else if (!currentRole || currentRole === 'unknown' || currentRole === '' || !knownRoles.includes(currentRole)) {
          const { data: committeeMember } = await supabase
            .from('committee_members')
            .select('role, first_name, last_name')
            .ilike('email', userEmail)
            .maybeSingle()

          if (committeeMember) {
            const { error: roleErr } = await supabase
              .from('profiles')
              .update({
                role: committeeMember.role || 'committee',
                full_name: `${committeeMember.first_name || ''} ${committeeMember.last_name || ''}`.trim() || profile?.full_name
              })
              .eq('id', userId)
            if (roleErr) console.error('Profile role update error:', roleErr)
          }
          // Do not default to 'member' — leave role unset and let onboarding handle it
        }

        // For supporters created via email confirmation, finalize club registration
        const finalRole = (await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()).data?.role
        if (finalRole === 'supporter' && clubId) {
          await invokeFunction('register-supporter', { body: { clubId } }).catch(() => {})
        }

        await updateProfile()
        console.log('Step 4 updateProfile done')

        if (pushSupported() && Notification.permission === 'default') {
          Notification.requestPermission().catch(() => {})
        }

        console.log('Step 5 navigating to /dashboard')
        const redirectTo = searchParams.get('redirect') || '/dashboard'
        navigate(redirectTo)
      } catch (postLoginErr: unknown) {
        const err = postLoginErr as Record<string, unknown>
        console.error('EXACT POST-LOGIN ERROR:', JSON.stringify(err, null, 2))
        console.error('Error message:', err?.message)
        console.error('Error code:', err?.code)
        console.error('Error details:', err?.details)
        const errorMsg = (err?.message as string) || (err?.error_description as string) || JSON.stringify(err)
        setError('Erreur: ' + errorMsg)
        await supabase.auth.signOut()
      }
    } catch (err: any) {
      const translated = translateAuthError(err)
      setError(translated)
      if (isRateLimitError(err)) startRateLimitCooldown()
    } finally {
      setLoading(false)
    }
  }

  const hasPendingCoachInvite = async (targetEmail: string): Promise<boolean> => {
    const normalized = targetEmail.trim().toLowerCase()
    if (!normalized || !clubSlug) return false
    try {
      const { data, error } = await supabase.rpc('has_pending_coach_invite', { p_email: normalized, p_club_slug: clubSlug })
      if (error) {
        console.warn('has_pending_coach_invite failed', error)
        return false
      }
      return data === true
    } catch (err) {
      console.warn('has_pending_coach_invite failed', err)
      return false
    }
  }

  const checkCoachInvite = async (targetEmail: string): Promise<boolean> => {
    const found = await hasPendingCoachInvite(targetEmail)
    const normalized = targetEmail.trim().toLowerCase()
    setCoachInviteEmail(prev => (found ? normalized : prev === normalized ? null : prev))
    return found
  }

  const activeSignupEmail = selectedRole === 'supporter' ? supEmail : email
  const coachInviteBlocked = coachInviteEmail !== null && coachInviteEmail === activeSignupEmail.trim().toLowerCase()

  const handleAccountStepContinue = async () => {
    if (!regFirstName.trim() || !regLastName.trim()) {
      setError('Veuillez remplir votre prénom et votre nom')
      return
    }

    if (!email || !password || !confirmPassword) {
      setError('Veuillez remplir tous les champs')
      return
    }

    if (!passwordLongEnough(password) || password !== confirmPassword) return
    if (!termsChecked) return

    if (!selectedRole) {
      setError('Veuillez sélectionner votre rôle')
      return
    }

    setError('')
    if (await checkCoachInvite(email)) return
    proceedCreateAccount()
  }

  const proceedCreateAccount = async () => {
    setLoading(true)
    setError('')
    setPasswordErrors(null)

    try {
      const fullName = `${regFirstName.trim()} ${regLastName.trim()}`

      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
          data: {
            role: selectedRole,
            first_name: regFirstName.trim(),
            last_name: regLastName.trim(),
            full_name: fullName,
            club_slug: clubSlug,
            ...signupTermsMetadata()
          }
        }
      })

      if (signUpError) throw signUpError
      if (!authData.user) throw new Error('User creation failed')

      if (authData.user.identities?.length === 0) {
        setConfirmationEmail(email)
        setStep('existing-account')
        setLoading(false)
        return
      }

      // Email confirmation enabled: no session returned
      if (!authData.session) {
        setConfirmationEmail(email)
        setResendCooldown(60)
        setResendSuccess(false)
        setStep('email-confirmation')
        setLoading(false)
        return
      }

      const normalizedAuthEmail = (authData.user.email || email).trim().toLowerCase()
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: authData.user.id,
          email: normalizedAuthEmail,
          full_name: fullName,
          first_name: regFirstName.trim(),
          last_name: regLastName.trim(),
          role: selectedRole,
          onboarding_completed: false
        })
      if (profileError) throw profileError

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) throw signInError

      await recordSignupAcceptance('signup')
      await updateProfile()
      navigate('/dashboard')
    } catch (err: any) {
      console.error('Error creating account:', err)
      const passwordLines = mapPasswordAuthError(err?.message)
      if (passwordLines) {
        setPasswordErrors(passwordLines)
        return
      }
      const translated = translateAuthError(err)
      setError(translated)
      if (isRateLimitError(err)) startRateLimitCooldown()
    } finally {
      setLoading(false)
    }
  }

  const handleSupporterSignup = async () => {
    if (!supFirstName.trim() || !supLastName.trim() || !supEmail.trim()) {
      setError('Veuillez remplir tous les champs obligatoires')
      return
    }
    if (!passwordLongEnough(supPassword) || supPassword !== supConfirmPassword) return
    if (!termsChecked) return
    if (!clubId) {
      setError('Club non identifié, veuillez recharger la page.')
      return
    }
    if (await checkCoachInvite(supEmail)) return
    setLoading(true)
    setError('')
    setPasswordErrors(null)
    try {
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: supEmail.trim(),
        password: supPassword,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
          data: {
            role: 'supporter',
            first_name: supFirstName.trim(),
            last_name: supLastName.trim(),
            full_name: `${supFirstName.trim()} ${supLastName.trim()}`,
            club_slug: clubSlug,
            ...signupTermsMetadata(),
          }
        }
      })
      if (signUpError) throw signUpError
      if (!authData.user) throw new Error('User creation failed')

      if (authData.user.identities?.length === 0) {
        setConfirmationEmail(supEmail.trim())
        setStep('existing-account')
        setLoading(false)
        return
      }

      // Email confirmation enabled: no session returned
      if (!authData.session) {
        setConfirmationEmail(supEmail.trim())
        setResendCooldown(60)
        setResendSuccess(false)
        setStep('email-confirmation')
        setLoading(false)
        return
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: supEmail.trim(),
        password: supPassword,
      })
      if (signInError) throw signInError

      const { error: profileError } = await supabase.from('profiles').insert({
        id: authData.user.id,
        email: supEmail.trim(),
        first_name: supFirstName.trim(),
        last_name: supLastName.trim(),
        full_name: `${supFirstName.trim()} ${supLastName.trim()}`,
        role: 'supporter',
        onboarding_completed: true,
      })
      if (profileError) {
        console.error('Profile insert error:', profileError)
        throw new Error('Erreur lors de la création du profil')
      }

      const { error: regError } = await invokeFunction('register-supporter', {
        body: { clubId },
      })
      if (regError) {
        setError(regError)
        setLoading(false)
        return
      }

      await recordSignupAcceptance('signup')
      await updateProfile()
      navigate('/events')
    } catch (err: any) {
      const passwordLines = mapPasswordAuthError(err?.message)
      if (passwordLines) {
        setPasswordErrors(passwordLines)
        return
      }
      const translated = translateAuthError(err)
      setError(translated)
      if (isRateLimitError(err)) startRateLimitCooldown()
    } finally {
      setLoading(false)
    }
  }

  const resetRegistration = () => {
    setStep('login')
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setSelectedRole(null)
    setRegFirstName('')
    setRegLastName('')
    setSupFirstName('')
    setSupLastName('')
    setSupEmail('')
    setSupPassword('')
    setSupConfirmPassword('')
    setError('')
    setInfo('')
  }


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

          {step === 'login' && (
            <>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3.5 w-5 h-5" style={{ color: 'var(--text-muted)' }} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="votre@email.com"
                      className="w-full rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:ring-1" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '10px' }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = 'var(--accent)'
                        e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent)'
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-color)'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Mot de passe
                  </label>
                  <PasswordInput
                    leftIcon={<Lock className="absolute left-3 top-3.5 w-5 h-5" style={{ color: 'var(--text-muted)' }} />}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg pl-10 py-2 focus:outline-none focus:ring-1" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '10px' }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent)'
                      e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-color)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                    required
                  />
                </div>

                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => { setStep('forgot-password'); setForgotEmail(email); setError(''); setInfo(''); setLoginEmailNotConfirmed(false) }}
                    className="text-sm hover:underline bg-transparent border-none cursor-pointer"
                    style={{ color: 'var(--accent)' }}
                  >
                    Mot de passe oublié ?
                  </button>
                </div>

                {error && !loginEmailNotConfirmed && (
                  <Alert variant="danger">{error}</Alert>
                )}

                {loginEmailNotConfirmed && (
                  <div style={{ background: 'var(--warning-soft)', border: '1px solid var(--warning)', borderRadius: '10px', padding: '14px 16px' }}>
                    <p style={{ color: 'var(--warning-text)', fontSize: '13px', fontWeight: '600', margin: 0 }}>
                      Votre adresse email n'a pas encore été confirmée. Consultez votre boîte de réception.
                    </p>
                    <p style={{ color: 'var(--warning-text)', fontSize: '12px', margin: '6px 0 0', opacity: 0.8 }}>
                      Pensez à vérifier votre dossier de courrier indésirable (spam).
                    </p>
                    <button
                      type="button"
                      disabled={resendCooldown > 0}
                      onClick={handleLoginResend}
                      style={{
                        marginTop: '10px', background: 'transparent', border: '1px solid var(--warning)',
                        borderRadius: '8px', padding: '6px 14px', fontSize: '12px', fontWeight: '600',
                        color: 'var(--warning-text)', cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
                        opacity: resendCooldown > 0 ? 0.6 : 1,
                      }}
                    >
                      {resendCooldown > 0 ? `Renvoyer (${resendCooldown}s)` : 'Renvoyer l\'email de confirmation'}
                    </button>
                    {resendSuccess && (
                      <p style={{ color: 'var(--success-text)', fontSize: '12px', marginTop: '6px', fontWeight: '600' }}>E-mail renvoyé !</p>
                    )}
                  </div>
                )}

                {info && (
                  <Alert variant="success">{info}</Alert>
                )}

                <Button
                  variant="primary"
                  type="submit"
                  disabled={isDisabled}
                  className="w-full"
                >
                  {rateLimitCountdown > 0 ? `Réessayer dans ${rateLimitCountdown} s` : loading ? 'Connexion...' : 'Se connecter'}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Pas encore de compte ?{' '}</span>
                <button
                  onClick={() => { setError(''); setInfo(''); setStep('role-select') }}
                  className="text-sm hover:underline font-medium"
                  style={{ color: 'var(--accent)' }}
                >
                  Créer un compte
                </button>
              </div>

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                marginTop: '28px',
                paddingTop: '20px',
                borderTop: '1px solid var(--border-color)'
              }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', letterSpacing: '0.02em' }}>
                  Propulsé par
                </span>
                <img src="https://zkprbqayjqfeixrjhadc.supabase.co/storage/v1/object/public/club-assets/branding/clubsphere-wordmark.png" alt="ClubSphère" style={{ height: '30px', width: 'auto', display: 'block' }} />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>v{__APP_VERSION__}</span>
              </div>
            </>
          )}

          {step === 'role-select' && (
            <>
              <Button
                variant="secondary"
                onClick={resetRegistration}
                leftIcon={<ArrowLeft className="w-4 h-4" />}
                className="mb-6"
              >
                Retour à la connexion
              </Button>

              <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Bienvenue !</h2>
              <p className="mb-6 text-sm" style={{ color: 'var(--text-secondary)' }}>Quel est votre lien avec le club ?</p>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => { setSelectedRole('member'); setStep('account') }}
                  className="w-full text-left p-5 rounded-xl border-2 transition-all group"
                  style={{ background: 'var(--bg-hover)', borderColor: 'var(--border-color)', cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'var(--bg-card)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.background = 'var(--bg-hover)' }}
                >
                  <div className="flex items-start gap-4">
                    <User className="w-8 h-8" style={{ color: 'var(--text-primary)' }} />
                    <div>
                      <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>Joueur actif</p>
                      <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Joueur adulte du club (≥ 18 ans)</p>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => { setSelectedRole('parent'); setStep('account') }}
                  className="w-full text-left p-5 rounded-xl border-2 transition-all group"
                  style={{ background: 'var(--bg-hover)', borderColor: 'var(--border-color)', cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'var(--bg-card)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.background = 'var(--bg-hover)' }}
                >
                  <div className="flex items-start gap-4">
                    <User className="w-8 h-8" style={{ color: 'var(--text-primary)' }} />
                    <div>
                      <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>Parent / Joueur mineur</p>
                      <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Pour les enfants et leurs représentants légaux</p>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => { setSelectedRole('supporter'); setStep('supporter-form') }}
                  className="w-full text-left p-5 rounded-xl border-2 transition-all group"
                  style={{ background: 'var(--bg-hover)', borderColor: 'var(--border-color)', cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'var(--bg-card)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.background = 'var(--bg-hover)' }}
                >
                  <div className="flex items-start gap-4">
                    <Eye className="w-8 h-8" style={{ color: 'var(--text-primary)' }} />
                    <div>
                      <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>Membre / Supporter</p>
                      <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Je suis fan du club, je veux suivre les actualités et événements</p>
                    </div>
                  </div>
                </button>
              </div>
            </>
          )}

          {step === 'supporter-form' && (
            <>
              <Button
                variant="secondary"
                onClick={() => { setStep('role-select'); setError('') }}
                leftIcon={<ArrowLeft className="w-4 h-4" />}
                className="mb-6"
              >
                Retour
              </Button>

              <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Créer un compte supporter</h2>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Prénom *</label>
                    <input
                      type="text"
                      value={supFirstName}
                      onChange={(e) => setSupFirstName(e.target.value)}
                      placeholder="Jean"
                      className="w-full rounded-lg px-4 py-2 focus:outline-none focus:ring-1" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '10px' }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent)' }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.boxShadow = 'none' }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Nom *</label>
                    <input
                      type="text"
                      value={supLastName}
                      onChange={(e) => setSupLastName(e.target.value)}
                      placeholder="Dupont"
                      className="w-full rounded-lg px-4 py-2 focus:outline-none focus:ring-1" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '10px' }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent)' }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.boxShadow = 'none' }}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Email *</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3.5 w-5 h-5" style={{ color: 'var(--text-muted)' }} />
                    <input
                      type="email"
                      value={supEmail}
                      onChange={(e) => setSupEmail(e.target.value)}
                      placeholder="votre@email.com"
                      className="w-full rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:ring-1" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '10px' }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent)' }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.boxShadow = 'none'; void checkCoachInvite(e.target.value) }}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Mot de passe *</label>
                  <PasswordInput
                    leftIcon={<Lock className="absolute left-3 top-3.5 w-5 h-5" style={{ color: 'var(--text-muted)' }} />}
                    value={supPassword}
                    onChange={(e) => { setSupPassword(e.target.value); setPasswordErrors(null) }}
                    placeholder="••••••••"
                    className="w-full rounded-lg pl-10 py-2 focus:outline-none focus:ring-1" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '10px' }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent)' }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.boxShadow = 'none' }}
                  />
                  <PasswordLengthHint password={supPassword} errors={passwordErrors} />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Confirmer le mot de passe *</label>
                  <PasswordInput
                    leftIcon={<Lock className="absolute left-3 top-3.5 w-5 h-5" style={{ color: 'var(--text-muted)' }} />}
                    value={supConfirmPassword}
                    onChange={(e) => setSupConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg pl-10 py-2 focus:outline-none focus:ring-1" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '10px' }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent)' }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.boxShadow = 'none' }}
                  />
                  <PasswordMismatchHint password={supPassword} confirmPassword={supConfirmPassword} />
                </div>

                <TermsCheckbox checked={termsChecked} onChange={setTermsChecked} disabled={loading} />

                {error && (
                  <Alert variant="danger">{error}</Alert>
                )}

                {coachInviteBlocked ? (
                  <Alert variant="info">
                    Une invitation entraîneur existe pour cette adresse. Utilisez le lien reçu par e-mail pour créer votre accès entraîneur. Vous ne retrouvez pas l'e-mail ? Demandez au club de vous renvoyer l'invitation.
                  </Alert>
                ) : (
                  <Button
                    variant="primary"
                    onClick={handleSupporterSignup}
                    disabled={isDisabled || !termsChecked || !passwordLongEnough(supPassword) || supPassword !== supConfirmPassword}
                    className="w-full"
                  >
                    {rateLimitCountdown > 0 ? `Réessayer dans ${rateLimitCountdown} s` : loading ? 'Création du compte...' : 'Créer mon compte'}
                  </Button>
                )}
              </div>
            </>
          )}

          {step === 'email-confirmation' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '50%',
                background: 'var(--success-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px'
              }}>
                <Mail size={28} style={{ color: 'var(--success-text)' }} />
              </div>
              <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', fontWeight: '700', marginBottom: '12px' }}>
                Vérifiez votre boîte e-mail
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.5', marginBottom: '8px' }}>
                Nous avons envoyé un e-mail de confirmation à <strong style={{ color: 'var(--text-primary)' }}>{confirmationEmail}</strong>.
              </p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.5', marginBottom: '20px' }}>
                Ouvrez cet e-mail et cliquez sur « Confirmer mon adresse » pour terminer votre inscription.
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic', marginBottom: '20px' }}>
                Pensez à vérifier votre dossier de courrier indésirable (spam).
              </p>
              <button
                type="button"
                disabled={resendCooldown > 0}
                onClick={() => handleResendConfirmation(confirmationEmail)}
                style={{
                  background: 'var(--bg-hover)', border: '1px solid var(--border-color)',
                  borderRadius: '10px', padding: '10px 20px', fontSize: '13px', fontWeight: '600',
                  color: 'var(--text-primary)', cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
                  opacity: resendCooldown > 0 ? 0.6 : 1, width: '100%',
                }}
              >
                {resendCooldown > 0 ? `Renvoyer l'e-mail (${resendCooldown}s)` : 'Renvoyer l\'e-mail'}
              </button>
              {resendSuccess && (
                <p style={{ color: 'var(--success-text)', fontSize: '13px', marginTop: '10px', fontWeight: '600' }}>E-mail renvoyé !</p>
              )}
              <button
                type="button"
                onClick={() => { setStep('login'); setError(''); setInfo(''); setLoginEmailNotConfirmed(false) }}
                style={{
                  marginTop: '16px', background: 'transparent', border: 'none',
                  color: 'var(--accent)', fontSize: '13px', cursor: 'pointer', fontWeight: '500'
                }}
              >
                ← Retour à la connexion
              </button>
            </div>
          )}

          {step === 'existing-account' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '50%',
                background: 'var(--warning-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px'
              }}>
                <Mail size={28} style={{ color: 'var(--warning-text)' }} />
              </div>
              <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', fontWeight: 700, marginBottom: '12px' }}>
                Un compte existe déjà avec cet e-mail
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.5, marginBottom: '24px' }}>
                L'adresse <strong style={{ color: 'var(--text-primary)' }}>{confirmationEmail}</strong> est déjà associée à un compte existant.
              </p>
              <div className="space-y-3">
                <Button
                  variant="primary"
                  onClick={() => { setStep('login'); setEmail(confirmationEmail); setError(''); setInfo('') }}
                  className="w-full"
                >
                  Se connecter
                </Button>
                <button
                  type="button"
                  onClick={() => { setStep('forgot-password'); setForgotEmail(confirmationEmail); setError(''); setInfo('') }}
                  style={{
                    background: 'transparent', border: 'none',
                    color: 'var(--accent)', fontSize: '13px', cursor: 'pointer', fontWeight: 500
                  }}
                >
                  Mot de passe oublié ?
                </button>
              </div>
            </div>
          )}

          {step === 'forgot-password' && (
            <div>
              <Button
                variant="secondary"
                onClick={() => { setStep('login'); setError(''); setInfo('') }}
                leftIcon={<ArrowLeft className="w-4 h-4" />}
                className="mb-6"
              >
                Retour à la connexion
              </Button>

              <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Mot de passe oublié</h2>
              <p className="mb-6 text-sm" style={{ color: 'var(--text-secondary)' }}>Entrez votre email pour recevoir un lien de réinitialisation.</p>

              <form onSubmit={handleForgotPassword} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3.5 w-5 h-5" style={{ color: 'var(--text-muted)' }} />
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="votre@email.com"
                      className="w-full rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:ring-1" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '10px' }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = 'var(--accent)'
                        e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent)'
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-color)'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                      required
                    />
                  </div>
                </div>

                {error && (
                  <Alert variant="danger">{error}</Alert>
                )}

                {info && (
                  <Alert variant="success">{info}</Alert>
                )}

                <Button
                  variant="primary"
                  type="submit"
                  disabled={loading || !forgotEmail}
                  className="w-full"
                >
                  {loading ? 'Envoi...' : 'Envoyer le lien de réinitialisation'}
                </Button>
              </form>
            </div>
          )}

          {step === 'account' && (
            <>
              <Button
                variant="secondary"
                onClick={() => { setStep('role-select'); setError('') }}
                leftIcon={<ArrowLeft className="w-4 h-4" />}
                className="mb-6"
              >
                Retour
              </Button>

              <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Créer un compte</h2>

              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Prénom *</label>
                    <input
                      type="text"
                      value={regFirstName}
                      onChange={(e) => setRegFirstName(e.target.value)}
                      placeholder="Jean"
                      className="w-full rounded-lg px-4 py-2 focus:outline-none focus:ring-1" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '10px' }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent)' }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.boxShadow = 'none' }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Nom *</label>
                    <input
                      type="text"
                      value={regLastName}
                      onChange={(e) => setRegLastName(e.target.value)}
                      placeholder="Dupont"
                      className="w-full rounded-lg px-4 py-2 focus:outline-none focus:ring-1" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '10px' }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent)' }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.boxShadow = 'none' }}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3.5 w-5 h-5" style={{ color: 'var(--text-muted)' }} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={(e) => { void checkCoachInvite(e.target.value) }}
                      placeholder="votre@email.com"
                      className="w-full rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:ring-2" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '10px' }}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Mot de passe
                  </label>
                  <PasswordInput
                    leftIcon={<Lock className="absolute left-3 top-3.5 w-5 h-5" style={{ color: 'var(--text-muted)' }} />}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setPasswordErrors(null) }}
                    placeholder="••••••••"
                    className="w-full rounded-lg pl-10 py-2 focus:outline-none focus:ring-2" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '10px' }}
                  />
                  <PasswordLengthHint password={password} errors={passwordErrors} />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Confirmer le mot de passe
                  </label>
                  <PasswordInput
                    leftIcon={<Lock className="absolute left-3 top-3.5 w-5 h-5" style={{ color: 'var(--text-muted)' }} />}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg pl-10 py-2 focus:outline-none focus:ring-2" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '10px' }}
                  />
                  <PasswordMismatchHint password={password} confirmPassword={confirmPassword} />
                </div>

                <TermsCheckbox checked={termsChecked} onChange={setTermsChecked} disabled={loading} />

                {error && (
                  <Alert variant="danger">{error}</Alert>
                )}

                {coachInviteBlocked ? (
                  <Alert variant="info">
                    Une invitation entraîneur existe pour cette adresse. Utilisez le lien reçu par e-mail pour créer votre accès entraîneur. Vous ne retrouvez pas l'e-mail ? Demandez au club de vous renvoyer l'invitation.
                  </Alert>
                ) : (
                  <Button
                    variant="primary"
                    onClick={handleAccountStepContinue}
                    disabled={isDisabled || !termsChecked || !regFirstName.trim() || !regLastName.trim() || !email || !passwordLongEnough(password) || password !== confirmPassword}
                    className="w-full"
                  >
                    {rateLimitCountdown > 0 ? `Réessayer dans ${rateLimitCountdown} s` : loading ? 'Création du compte...' : 'Créer mon compte'}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
