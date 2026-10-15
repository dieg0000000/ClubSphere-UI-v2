import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { translateAuthError, isRateLimitError } from '../utils/authErrorMessages'
import { Lock, ChevronDown, ChevronUp } from 'lucide-react'
import Button from './ui/Button'
import { Alert } from './ui/Alert'
import PasswordInput from './PasswordInput'
import { passwordLongEnough, mapPasswordAuthError, PasswordLengthHint, PasswordMismatchHint } from './PasswordChecklist'

export function ChangePasswordSection() {
  const [open, setOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [passwordErrors, setPasswordErrors] = useState<string[] | null>(null)
  const [success, setSuccess] = useState(false)
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0)

  useEffect(() => {
    if (rateLimitCountdown <= 0) return
    const t = setTimeout(() => setRateLimitCountdown(rateLimitCountdown - 1), 1000)
    return () => clearTimeout(t)
  }, [rateLimitCountdown])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)
    setPasswordErrors(null)

    if (!passwordLongEnough(newPassword) || newPassword !== confirmPassword) return

    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setSuccess(true)
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setSuccess(false), 4000)
    } catch (err: any) {
      const passwordLines = mapPasswordAuthError(err?.message)
      if (passwordLines) {
        setPasswordErrors(passwordLines)
        return
      }
      const translated = translateAuthError(err)
      setError(translated)
      if (isRateLimitError(err)) setRateLimitCountdown(30)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
      <button
        type="button"
        onClick={() => { setOpen(!open); setError(''); setSuccess(false) }}
        className="w-full flex items-center justify-between px-6 py-4 text-left transition-colors"
        style={{ background: 'transparent' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      >
        <div className="flex items-center gap-3">
          <Lock className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Changer mon mot de passe</span>
        </div>
        {open ? (
          <ChevronUp className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
        ) : (
          <ChevronDown className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
        )}
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4 pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              Nouveau mot de passe
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              <PasswordInput
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setPasswordErrors(null) }}
                placeholder="Mot de passe"
                className="w-full rounded-lg pl-10 py-2 focus:outline-none focus:ring-1"
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                }}
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
            <PasswordLengthHint password={newPassword} errors={passwordErrors} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              Confirmer le mot de passe
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg pl-10 py-2 focus:outline-none focus:ring-1"
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                }}
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
            <PasswordMismatchHint password={newPassword} confirmPassword={confirmPassword} />
          </div>

          {error && (
            <Alert variant="danger">{error}</Alert>
          )}

          {success && (
            <Alert variant="success">Mot de passe mis à jour avec succès</Alert>
          )}

          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={loading}
            disabled={loading || rateLimitCountdown > 0 || !passwordLongEnough(newPassword) || newPassword !== confirmPassword}
          >
            {rateLimitCountdown > 0 ? `Réessayer dans ${rateLimitCountdown} s` : loading ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </form>
      )}
    </div>
  )
}
