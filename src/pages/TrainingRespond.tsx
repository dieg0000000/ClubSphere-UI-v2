import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useNavigate, Navigate } from 'react-router-dom'
import { CircleCheck as CheckCircle, CircleX as XCircle, TriangleAlert as AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { resolveMyMemberIds } from '../lib/trainingAttendance'

export default function TrainingRespond() {
  const { session_id } = useParams<{ session_id: string }>()
  const [searchParams] = useSearchParams()
  const status = searchParams.get('status')
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()

  const willBePresent = status === 'present'

  const [submitting, setSubmitting] = useState(willBePresent)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (authLoading || !user || !session_id) return
    if (status !== 'present' && status !== 'absent') {
      setError('Statut invalide')
      setSubmitting(false)
      return
    }
    // Present is recorded immediately; absent requires a reason first.
    if (status === 'present') {
      void recordResponse(null)
    }
  }, [authLoading, user, session_id, status])

  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => navigate('/mon-equipe'), 3000)
    return () => clearTimeout(timer)
  }, [done, navigate])

  async function recordResponse(reasonText: string | null) {
    setSubmitting(true)
    setError(null)
    try {
      const memberIds = await resolveMyMemberIds(user!.id, user!.email ?? '')

      if (memberIds.length === 0) {
        setError('Aucun joueur lié à votre compte pour cet entraînement')
        setSubmitting(false)
        return
      }

      const { data: rows, error: fetchErr } = await supabase
        .from('training_attendance')
        .select('id, member_id')
        .eq('session_id', session_id!)
        .in('member_id', memberIds)

      if (fetchErr) throw fetchErr
      if (!rows || rows.length === 0) {
        setError('Aucune fiche de présence trouvée pour cet entraînement')
        setSubmitting(false)
        return
      }

      const nowIso = new Date().toISOString()
      const responseStatus = willBePresent ? 'confirmed' : 'absent_justified'
      const updates = rows.map(r =>
        supabase
          .from('training_attendance')
          .update({
            status: responseStatus,
            absence_reason: willBePresent ? null : reasonText,
            responded_at: nowIso,
            responded_by: user!.id,
          })
          .eq('id', r.id)
      )
      const results = await Promise.all(updates)
      const anyError = results.find(r => r.error)
      if (anyError?.error) throw anyError.error

      setDone(true)
    } catch (e) {
      console.error('Response error:', e)
      setError("Erreur lors de l'enregistrement de votre réponse")
    } finally {
      setSubmitting(false)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-app)' }}>
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2" style={{ borderColor: 'var(--accent)' }} />
      </div>
    )
  }

  if (!user) {
    const returnUrl = `/training/${session_id}/respond?status=${status}`
    return <Navigate to={`/login?returnUrl=${encodeURIComponent(returnUrl)}`} replace />
  }

  const reasonValid = reason.trim().length >= 2
  const showReasonForm = status === 'absent' && !done && !submitting && !error

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-app)' }}>
      <div className="max-w-md w-full rounded-xl p-8" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        {submitting ? (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 mx-auto mb-4" style={{ borderColor: 'var(--accent)' }} />
            <p style={{ color: 'var(--text-primary)' }}>Enregistrement de votre réponse…</p>
          </div>
        ) : error ? (
          <div className="text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--danger-soft)' }}>
              <AlertTriangle className="w-9 h-9" style={{ color: 'var(--danger-text)' }} />
            </div>
            <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Réponse non enregistrée</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{error}</p>
          </div>
        ) : showReasonForm ? (
          <div>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--danger-soft)' }}>
              <XCircle className="w-9 h-9" style={{ color: 'var(--danger-text)' }} />
            </div>
            <h2 className="text-xl font-bold mb-2 text-center" style={{ color: 'var(--text-primary)' }}>Raison de l'absence</h2>
            <p className="text-sm mb-4 text-center" style={{ color: 'var(--text-secondary)' }}>
              Merci d'indiquer pourquoi vous serez absent(e).
            </p>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
              maxLength={120}
              placeholder="Ex. : maladie, école, vacances"
              onKeyDown={(e) => { if (e.key === 'Enter' && reasonValid) void recordResponse(reason.trim()) }}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '11px 12px', fontSize: '14px',
                borderRadius: '10px', border: '1px solid var(--border-color)',
                background: 'var(--bg-input, var(--bg-app))', color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
              Motif obligatoire (au moins 2 caractères).
            </p>
            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => navigate('/mon-equipe')}
                className="flex-1 rounded-lg font-semibold"
                style={{ padding: '11px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void recordResponse(reason.trim())}
                disabled={!reasonValid}
                className="flex-1 rounded-lg font-bold"
                style={{
                  padding: '11px',
                  background: reasonValid ? 'var(--danger)' : 'var(--border-color)',
                  color: reasonValid ? 'var(--danger-contrast, #fff)' : 'var(--text-muted)',
                  border: 'none',
                  cursor: reasonValid ? 'pointer' : 'not-allowed',
                }}
              >
                Confirmer mon absence
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: willBePresent ? 'var(--success-soft)' : 'var(--danger-soft)' }}>
              {willBePresent ? (
                <CheckCircle className="w-9 h-9" style={{ color: 'var(--success-text)' }} />
              ) : (
                <XCircle className="w-9 h-9" style={{ color: 'var(--danger-text)' }} />
              )}
            </div>
            <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Réponse enregistrée</h2>
            <p style={{ color: 'var(--text-secondary)' }}>
              Vous serez <span className="font-semibold">{willBePresent ? 'présent(e)' : 'absent(e)'}</span> à l'entraînement.
            </p>
            <p className="text-xs mt-4" style={{ color: 'var(--text-muted)' }}>Redirection en cours...</p>
          </div>
        )}
      </div>
    </div>
  )
}
