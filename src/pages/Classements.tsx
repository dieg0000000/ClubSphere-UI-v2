import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ExternalLink } from 'lucide-react'
import { reportLoadError } from '../utils/reportLoadError'
import { LoadError } from '../components/LoadError'
import { Tabs } from '../components/ui/Tabs'
import { MatchResultsList } from '../components/MatchResultsList'

const TAB_ITEMS = [
  { key: 'resultats', label: 'Résultats' },
  { key: 'classements', label: 'Classements ACVF' },
]

interface TeamLink {
  id: string
  name: string
  widget_url: string
}

export function Classements() {
  const [teams, setTeams] = useState<TeamLink[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [tab, setTab] = useState('resultats')

  const load = async () => {
    try {
      setLoadFailed(false)
      setLoading(true)
      const { data } = await supabase
        .from('teams')
        .select('id, name, level_rank, widget_url, show_widget')
        .eq('show_widget', true)
        .not('widget_url', 'is', null)
        .order('level_rank', { ascending: true })
        .order('name', { ascending: true })
      setTeams(
        (data || [])
          .filter((r: any) => r.widget_url)
          .map((r: any) => ({ id: r.id, name: r.name, widget_url: r.widget_url }))
      )
    } catch (error) {
      reportLoadError('Classements', error)
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="w-full mx-auto" style={{ maxWidth: '100%' }}>
      <div className="mb-8">
        <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>Classements &amp; Résultats</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Résultats et classements de nos équipes</p>
      </div>

      <Tabs items={TAB_ITEMS} value={tab} onChange={setTab} className="mb-6" />

      {tab === 'resultats' ? (
        <MatchResultsList />
      ) : loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2" style={{ borderColor: 'var(--accent)' }} />
        </div>
      ) : loadFailed ? (
        <LoadError onRetry={load} />
      ) : teams.length === 0 ? (
        <div className="text-center py-12">
          <p style={{ color: 'var(--text-secondary)' }}>Aucune équipe n'a encore de lien vers le match center.</p>
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {teams.map((team) => (
            <div
              key={team.id}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              <span style={{ fontWeight: '700', fontSize: '16px', color: 'var(--text-primary)' }}>
                {team.name}
              </span>
              <a
                href={team.widget_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  background: 'var(--accent)',
                  color: 'var(--text-inverse)',
                  fontSize: '14px',
                  fontWeight: '600',
                  textDecoration: 'none',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
              >
                Voir le classement et les résultats
                <ExternalLink size={15} />
              </a>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                S'ouvre sur football.ch
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
