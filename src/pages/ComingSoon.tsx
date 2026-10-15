import { useLocation } from 'react-router-dom'

export function ComingSoon() {
  const location = useLocation()
  const getTitle = () => {
    const path = location.pathname
    const titles: { [key: string]: string } = {
      '/events': 'Événements',
      '/volunteers': 'Gestion des bénévoles',
      '/teams': 'Équipes',
      '/people': 'Annuaire',
      '/documents': 'Documents',
      '/matches': 'Matchs',
      '/messages': 'Messages',
      '/feedback': 'Support & Feedback',
      '/admin': 'Administration',
    }
    return titles[path] || 'Module'
  }

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-center min-h-96 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>{getTitle()}</h1>
          <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>Ce module arrive bientôt...</p>
          <div className="inline-block px-6 py-3 rounded-lg" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)' }}>
            <p className="font-medium" style={{ color: 'var(--accent-text)' }}>En développement</p>
          </div>
        </div>
      </div>
    </div>
  )
}
