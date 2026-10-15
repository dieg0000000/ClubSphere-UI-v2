import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { News as NewsType } from '../types'
import { Plus, Trash2, CreditCard as Edit2, X, Calendar } from 'lucide-react'
import SearchInput from '../components/ui/SearchInput'
import { Link } from 'react-router-dom'
import useEscapeKey from '../hooks/useEscapeKey'
import ConfirmModal from '../components/ConfirmModal'
import { Tabs } from '../components/ui/Tabs'
import NewsCategoryBadge from '../components/NewsCategoryBadge'
import { reportLoadError } from '../utils/reportLoadError'
import { LoadError } from '../components/LoadError'

export function News() {
  const { user, effectiveRole } = useAuth()
  const [news, setNews] = useState<NewsType[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [selectedArticle, setSelectedArticle] = useState<NewsType | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  const [categories, setCategories] = useState<string[]>([])
  const isSupporter = effectiveRole === 'supporter'

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    confirmLabel: string;
    cancelLabel: string;
    confirmStyle: 'danger' | 'warning' | 'primary';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Confirmer',
    cancelLabel: 'Annuler',
    confirmStyle: 'danger',
    onConfirm: () => {}
  })

  const showConfirm = (config: Partial<typeof confirmState>) => {
    setConfirmState(prev => ({ ...prev, ...config, isOpen: true }))
  }

  const hideConfirm = () => {
    setConfirmState(prev => ({ ...prev, isOpen: false }))
  }

  useEscapeKey(() => {
    if (lightboxUrl) { setLightboxUrl(null); return }
    setSelectedArticle(null)
  })

  useEffect(() => {
    loadNews()
  }, [selectedCategory])

  useEffect(() => {
    supabase
      .from('news_categories')
      .select('name')
      .eq('active', true)
      .order('display_order')
      .then(({ data }) => setCategories(data?.map(r => r.name) || []))
  }, [])

  const loadNews = async () => {
    try {
      setLoadFailed(false)
      setLoading(true)
      let query = supabase
        .from('news')
        .select('*')
        .order('published_at', { ascending: false })

      if (selectedCategory) {
        query = query.eq('category', selectedCategory)
      }

      const { data, error } = await query

      if (error) throw error
      setNews(data || [])
    } catch (error) {
      reportLoadError('News', error)
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    showConfirm({
      title: 'Supprimer l\'article',
      message: 'Êtes-vous sûr de vouloir supprimer cet article ?',
      confirmLabel: 'Oui, supprimer',
      cancelLabel: 'Non',
      confirmStyle: 'danger',
      onConfirm: async () => {
        hideConfirm()
        try {
          const { error } = await supabase
            .from('news')
            .delete()
            .eq('id', id)

          if (error) throw error
          setNews(news.filter(n => n.id !== id))
        } catch (error) {
          console.error('Error deleting news:', error)
        }
      }
    })
  }

  const filteredNews = isSupporter
    ? news
    : news.filter(article =>
        article.title.toLowerCase().includes(searchTerm.toLowerCase())
      )

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('fr-CH', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }



  const isAdmin = effectiveRole === 'admin'

  return (
    <div className="w-full mx-auto" style={{ overflowX: 'hidden', maxWidth: '100%' }}>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>Actualités</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Explorez les dernières nouvelles du club</p>
        </div>
        {isAdmin && (
          <Link
            to="/news/new"
            className="flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <Plus size={20} />
            Nouvel article
          </Link>
        )}
      </div>

      {!isSupporter && (
        <div className="mb-6 space-y-4">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Rechercher un article..."
          />

          <Tabs
            value={selectedCategory}
            onChange={setSelectedCategory}
            items={[
              { key: '', label: 'Tous' },
              ...categories.map(cat => ({ key: cat, label: cat })),
            ]}
          />
        </div>
      )}

      {loadFailed ? (
        <LoadError onRetry={loadNews} />
      ) : loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary-500"></div>
        </div>
      ) : filteredNews.length > 0 ? (
        <div style={{ padding: '16px 0' }}>
          {filteredNews.map((article) => (
            <div
              key={article.id}
              onClick={() => setSelectedArticle(article)}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '16px 20px',
                marginBottom: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                flexWrap: 'wrap',
                maxWidth: '100%',
                boxSizing: 'border-box'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--primary)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-color)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginBottom: '6px',
                  flexWrap: 'wrap'
                }}>
                  <NewsCategoryBadge category={article.category} />
                  <span style={{ color: 'var(--text-secondary)', fontSize: '13px', flexShrink: 0 }}>
                    {formatDate(article.published_at)}
                  </span>
                </div>
                <h3 style={{
                  color: 'var(--text-primary)',
                  margin: '0 0 4px',
                  fontSize: '16px',
                  fontWeight: '700',
                  wordBreak: 'break-word'
                }}>
                  {article.title}
                </h3>
                <p style={{
                  color: 'var(--text-secondary)',
                  margin: 0,
                  fontSize: '14px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '100%'
                }}>
                  {article.body?.substring(0, 120)}...
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
                {isAdmin && (
                  <>
                    <Link
                      to={`/news/${article.id}`}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-secondary)',
                        borderRadius: '8px',
                        padding: '6px 12px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Edit2 size={14} />
                      Modifier
                    </Link>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(article.id)
                      }}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--danger)',
                        color: 'var(--danger)',
                        borderRadius: '8px',
                        padding: '6px 12px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Trash2 size={14} />
                      Supprimer
                    </button>
                  </>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedArticle(article)
                  }}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-secondary)',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  Lire la suite →
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>Aucun article trouvé</p>
          {isAdmin && (
            <Link
              to="/news/new"
              className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              <Plus size={18} />
              Créer le premier article
            </Link>
          )}
        </div>
      )}

      {selectedArticle && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 1000,
            display: 'flex',
            justifyContent: 'flex-end'
          }}
          onClick={() => setSelectedArticle(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '640px',
              maxWidth: '100vw',
              height: '100%',
              background: 'var(--bg-sidebar)',
              borderLeft: '1px solid var(--border-color)',
              overflowY: 'auto',
              padding: '32px',
              boxShadow: '-4px 0 24px rgba(0,0,0,0.5)'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '24px'
              }}
            >
              <NewsCategoryBadge category={selectedArticle.category} />
              <button
                onClick={() => setSelectedArticle(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: '24px',
                  cursor: 'pointer',
                  lineHeight: 1
                }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedArticle.image_url && (
              <div
                onClick={() => setLightboxUrl(selectedArticle.image_url!)}
                style={{
                  width: '100%',
                  borderRadius: '12px',
                  marginBottom: '24px',
                  background: 'var(--bg-secondary, #f3f4f6)',
                  cursor: 'pointer',
                  overflow: 'hidden'
                }}
              >
                <img
                  src={selectedArticle.image_url}
                  alt={selectedArticle.title}
                  style={{
                    width: '100%',
                    maxHeight: '70vh',
                    objectFit: 'contain',
                    display: 'block'
                  }}
                />
              </div>
            )}

            <h1
              style={{
                color: 'var(--text-primary)',
                fontSize: '24px',
                fontWeight: '800',
                marginBottom: '8px',
                lineHeight: 1.3
              }}
            >
              {selectedArticle.title}
            </h1>

            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: '14px',
                marginBottom: '24px'
              }}
            >
              <Calendar className="w-4 h-4 inline mr-1" />{new Date(selectedArticle.published_at).toLocaleDateString('fr-CH', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
            </p>

            <div
              style={{
                borderTop: '1px solid var(--border-color)',
                marginBottom: '24px'
              }}
            />

            <div
              style={{
                color: 'var(--text-primary)',
                fontSize: '15px',
                lineHeight: '1.7',
                whiteSpace: 'pre-wrap'
              }}
            >
              {selectedArticle.body}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        {...confirmState}
        onCancel={hideConfirm}
      />

      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            cursor: 'pointer'
          }}
        >
          <img
            src={lightboxUrl}
            alt=""
            style={{
              maxWidth: '100%',
              maxHeight: 'calc(100vh - 100px)',
              objectFit: 'contain',
              borderRadius: '8px'
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            style={{
              marginTop: '16px',
              padding: '8px 24px',
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            Fermer
          </button>
        </div>
      )}
    </div>
  )
}
