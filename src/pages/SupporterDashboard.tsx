import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Newspaper, ChevronRight } from 'lucide-react'
import { SponsorsCarousel } from '../components/SponsorsCarousel'
import { PushNotificationPrompt } from '../components/PushNotificationPrompt'
import { RoleBadges } from '../components/RoleBadges'
import { useDashboardBundle } from '../hooks/useDashboardBundle'
import RecentMessagesBlock from '../components/home/RecentMessagesBlock'
import ClubEventsBlock from '../components/home/ClubEventsBlock'
import LatestAlbumBlock from '../components/home/LatestAlbumBlock'

const ACCENT = 'var(--accent)'

interface NewsItem {
  id: string
  title: string
  published_at: string
  body: string | null
  category: string
}

export function SupporterDashboard() {
  const { user } = useAuth()
  const { bundle } = useDashboardBundle()
  const [news, setNews] = useState<NewsItem[]>([])
  const [firstName, setFirstName] = useState<string>('')

  useEffect(() => {
    loadNews()
    loadFirstName()
  }, [user?.id])

  const loadFirstName = async () => {
    if (!user?.id) return
    const { data } = await supabase
      .from('profiles')
      .select('first_name, full_name')
      .eq('id', user.id)
      .maybeSingle()
    if (data?.first_name) {
      setFirstName(data.first_name)
    } else if (data?.full_name) {
      setFirstName(data.full_name.split(' ')[0])
    }
  }

  const loadNews = async () => {
    const { data } = await supabase
      .from('news')
      .select('id, title, published_at, body, category')
      .order('published_at', { ascending: false })
      .limit(3)
    setNews(data || [])
  }

  const messages = useMemo(() => (bundle?.recent_messages || []).map(m => ({
    id: m.id,
    body: (m.body || '').substring(0, 60),
    created_at: m.created_at,
    senderName: m.sender_name || 'Inconnu',
  })), [bundle])

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: '14px',
    padding: '20px',
  }

  const sectionTitle = (icon: React.ReactNode, label: string, to?: string) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {icon}
        <span style={{ color: 'var(--text-primary)', fontWeight: '700', fontSize: '15px' }}>{label}</span>
      </div>
      {to && (
        <Link to={to} style={{ color: 'var(--accent)', fontSize: '12px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '2px' }}>
          Voir tout <ChevronRight size={14} />
        </Link>
      )}
    </div>
  )

  return (
    <div className="page-container">
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '4px' }}>
          Bienvenue, {firstName || 'Supporter'} !
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Suivez l'actualité du club</p>
        <RoleBadges />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <PushNotificationPrompt />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '20px',
      }}
        className="supporter-grid"
      >
        <SponsorsCarousel />

        <RecentMessagesBlock messages={messages} />

        <LatestAlbumBlock />

        <ClubEventsBlock events={bundle?.events || []} />

        <div style={cardStyle}>
          {sectionTitle(<Newspaper size={16} style={{ color: ACCENT }} />, 'Actualités récentes', '/news')}
          {news.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {news.map(n => (
                <Link key={n.id} to="/news" style={{ textDecoration: 'none' }}>
                  <div
                    style={{
                      padding: '12px 14px',
                      background: 'var(--bg-hover)',
                      borderRadius: '10px',
                      border: '1px solid var(--border-color)',
                      transition: 'border-color 0.2s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-color)')}
                  >
                    <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>
                      {n.title}
                    </div>
                    {n.body && (
                      <p style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: '0 0 4px', lineHeight: '1.5' }}>
                        {n.body.replace(/<[^>]*>/g, '').substring(0, 100)}{n.body.length > 100 ? '…' : ''}
                      </p>
                    )}
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                      {new Date(n.published_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>Aucune actualité</p>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .supporter-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
