import { Link } from 'react-router-dom'
import { Hop as Home } from 'lucide-react'

export function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>404</h1>
        <p className="text-xl mb-8" style={{ color: 'var(--text-secondary)' }}>Page non trouvée</p>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink, var(--text-inverse))' }}
        >
          <Home size={20} />
          Retour à l'accueil
        </Link>
      </div>
    </div>
  )
}
