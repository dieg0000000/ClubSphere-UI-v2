import { useState } from 'react'
import { Trash2, TriangleAlert as AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import Button from './ui/Button'

export function DeleteAccountSection() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [showModal, setShowModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const handleDelete = async () => {
    if (!user?.id) return
    setDeleting(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Non authentifié')

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-own-account`
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Erreur lors de la suppression')
      }

      await signOut()
      navigate('/login?account_deleted=1')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue')
      setDeleting(false)
    }
  }

  return (
    <>
      <div style={{ border: '1px solid var(--danger)', borderRadius: '12px', padding: '24px', background: 'var(--danger-soft)' }}>
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-5 h-5" style={{ color: 'var(--danger-text)' }} />
          <h3 className="font-semibold text-base" style={{ color: 'var(--danger-text)' }}>Zone de danger</h3>
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>La suppression de votre compte est irréversible.</p>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ color: 'var(--danger-text)', border: '1px solid var(--danger)', background: 'transparent' }}
        >
          <Trash2 className="w-4 h-4" />
          Supprimer mon compte
        </button>
      </div>

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'var(--overlay-bg)' }}>
          <div className="rounded-xl max-w-md w-full p-6 space-y-4" style={{ background: 'var(--bg-modal)', border: '1px solid var(--border-color)' }}>
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 flex-shrink-0" style={{ color: 'var(--danger-text)' }} />
              <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>Supprimer mon compte</h3>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Êtes-vous sûr(e) de vouloir supprimer votre compte ?<br />
              Cette action est irréversible. Vos données personnelles seront supprimées.
            </p>
            {error && (
              <p className="text-sm rounded-lg px-3 py-2" style={{ color: 'var(--danger-text)', background: 'var(--danger-soft)', border: '1px solid var(--danger)' }}>{error}</p>
            )}
            <div className="flex justify-end pt-2" style={{ gap: '12px' }}>
              <Button
                variant="secondary"
                onClick={() => { setShowModal(false); setError('') }}
                disabled={deleting}
              >
                Annuler
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Suppression...' : 'Oui, supprimer mon compte'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
