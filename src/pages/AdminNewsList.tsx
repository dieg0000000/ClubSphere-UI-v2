import { useEffect, useState, useRef } from 'react'
import { toLocalDatetimeValue } from '../utils/formatHelpers'
import { supabase } from '../lib/supabase'
import { safeUUID } from '../lib/ids'
import { News as NewsType } from '../types'
import { Plus, Trash2, CreditCard as Edit2, X, Save, Newspaper, Upload, Globe } from 'lucide-react'
import { resizeNewsImage } from '../lib/imageProcessing'
import ConfirmModal from '../components/ConfirmModal'
import { useModuleAccess } from '../hooks/useModuleAccess'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useAuth } from '../context/AuthContext'
import { useTenant } from '../context/TenantContext'
import { useWebsiteModuleEnabled } from '../hooks/useWebsiteModuleEnabled'
import NewsCategoryBadge from '../components/NewsCategoryBadge'
import { Tabs } from '../components/ui/Tabs'
import { useToast } from '../hooks/useToast'
import { Toast } from '../components/Toast'
import Button from '../components/ui/Button'
import PageTitleCount from '../components/PageTitleCount'

type NewsFormData = Omit<NewsType, 'id' | 'created_at' | 'author_id'> & { publish_on_site: boolean }

const emptyForm = (): NewsFormData => ({
  title: '',
  body: '',
  category: '',
  image_url: '',
  published_at: new Date().toISOString().slice(0, 16),
  publish_on_site: false
})

export function AdminNewsList() {
  const { canEdit } = useModuleAccess('actualites')
  const { user } = useAuth()
  const { clubId } = useTenant()
  const { enabled: websiteEnabled } = useWebsiteModuleEnabled()
  const [news, setNews] = useState<NewsType[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<string>('')

  const [showPanel, setShowPanel] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<NewsFormData>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [imageError, setImageError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast, showToast } = useToast()

  const [categories, setCategories] = useState<string[]>([])

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

  useEffect(() => {
    document.title = 'Admin Actualités - ClubSphere'
    loadNews()
  }, [selectedCategory])

  useEffect(() => {
    loadCategories()
  }, [clubId])

  async function loadCategories() {
    const { data } = await supabase
      .from('news_categories')
      .select('name')
      .eq('active', true)
      .order('display_order')
    setCategories(data?.map(r => r.name) || [])
  }

  const loadNews = async () => {
    try {
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
      console.error('Error loading news:', error)
    } finally {
      setLoading(false)
    }
  }

  const isNewsBucketUrl = (url: string) => url.includes('/storage/v1/object/public/news-images/')

  const deleteFromBucket = async (url: string) => {
    if (!isNewsBucketUrl(url)) return
    const parts = url.split('/storage/v1/object/public/news-images/')
    if (parts[1]) {
      await supabase.storage.from('news-images').remove([parts[1]])
    }
  }

  const handleImageUpload = async (file: File) => {
    setImageError('')
    const accepted = ['image/jpeg', 'image/png', 'image/webp']
    if (!accepted.includes(file.type)) {
      setImageError('Format non pris en charge. Utilisez une image JPEG, PNG ou WebP.')
      return
    }
    setUploading(true)
    try {
      const blob = await resizeNewsImage(file)
      if (blob.size > 5 * 1024 * 1024) {
        setImageError('Image trop lourde (5 Mo maximum).')
        return
      }
      const prevUrl = formData.image_url
      const path = `${clubId}/${safeUUID()}.jpg`
      const { error } = await supabase.storage.from('news-images').upload(path, blob, { contentType: 'image/jpeg' })
      if (error) { setImageError('Le téléversement a échoué. Réessayez.'); return }
      const { data: pubData } = supabase.storage.from('news-images').getPublicUrl(path)
      setFormData(prev => ({ ...prev, image_url: pubData.publicUrl }))
      if (prevUrl) await deleteFromBucket(prevUrl)
    } catch {
      setImageError('Le téléversement a échoué. Réessayez.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemoveImage = async () => {
    const prevUrl = formData.image_url
    setFormData(prev => ({ ...prev, image_url: '' }))
    if (prevUrl) await deleteFromBucket(prevUrl)
  }

  const openCreate = () => {
    setEditingId(null)
    setFormData(emptyForm())
    setImageError('')
    setShowPanel(true)
  }

  const openEdit = async (article: NewsType) => {
    setEditingId(article.id)
    setFormData({
      title: article.title,
      body: article.body,
      category: article.category,
      image_url: article.image_url || '',
      published_at: toLocalDatetimeValue(article.published_at),
      publish_on_site: (article as any).publish_on_site ?? false
    })
    setImageError('')
    setShowPanel(true)
  }

  const closePanel = () => {
    setShowPanel(false)
    setEditingId(null)
    setFormData(emptyForm())
    setImageError('')
  }

  useEscapeKey(closePanel)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const articleData = {
        title: formData.title,
        body: formData.body,
        category: formData.category,
        image_url: formData.image_url || null,
        published_at: new Date(formData.published_at).toISOString(),
        author_id: user!.id,
        publish_on_site: formData.publish_on_site
      }

      if (editingId) {
        const { error } = await supabase.from('news').update(articleData).eq('id', editingId)
        if (error) { showToast('Erreur: ' + error.message, 'error'); return }
      } else {
        const { error } = await supabase.from('news').insert([articleData])
        if (error) { showToast('Erreur: ' + error.message, 'error'); return }
      }

      closePanel()
      loadNews()
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error)
      showToast('Erreur lors de la sauvegarde de l\'article', 'error')
    } finally {
      setSaving(false)
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
          const article = news.find(n => n.id === id)
          if (article?.image_url) await deleteFromBucket(article.image_url)
          const { error } = await supabase.from('news').delete().eq('id', id)
          if (error) throw error
          setNews(news.filter(n => n.id !== id))
        } catch (error) {
          console.error('Error deleting news:', error)
        }
      }
    })
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('fr-CH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const isPublished = (date: string) => {
    return new Date(date) <= new Date()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div style={{ color: 'var(--text-secondary)' }}>Chargement...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
            <Newspaper className="w-5 h-5" />
            Actualités
              <PageTitleCount total={news.length} />
          </h1>
          <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>Gestion des articles</p>
        </div>
        {canEdit && (
          <Button onClick={openCreate} leftIcon={<Plus className="w-5 h-5" />}>
            Nouvel article
          </Button>
        )}
      </div>

      <Tabs
        value={selectedCategory}
        onChange={setSelectedCategory}
        items={[
          { key: '', label: 'Tous' },
          ...categories.map(cat => ({ key: cat, label: cat })),
        ]}
      />

      {news.length === 0 ? (
        <div className="rounded-xl p-12 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <p style={{ color: 'var(--text-secondary)' }}>Aucun article</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <style>{`
            .news-stickhead thead th {
              position: sticky; top: 0; z-index: 2;
              background: var(--table-header-bg);
              border-bottom: 1px solid var(--border-color);
            }
            .news-stickhead thead th::after {
              content: ''; position: absolute; left: 0; right: 0; bottom: -8px; height: 8px;
              pointer-events: none;
              background: linear-gradient(to bottom, rgba(0,0,0,0.28), rgba(0,0,0,0));
            }
          `}</style>
          <div className="overflow-x-auto" style={{ width: '100%', maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
            <table className="news-stickhead" style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
              <thead>
                <tr style={{ background: 'var(--table-header-bg)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', fontWeight: '600' }}>Titre</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', fontWeight: '600', width: '150px' }}>Catégorie</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', fontWeight: '600', width: '180px' }}>Date</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', fontWeight: '600', width: '80px' }}>Publié</th>
                  {websiteEnabled && <th style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', fontWeight: '600', width: '100px' }}>Site</th>}
                  <th style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', fontWeight: '600', width: '120px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {news.map((article) => (
                  <tr
                    key={article.id}
                    style={{ borderBottom: '1px solid var(--border-color)', background: 'transparent', transition: 'background 0.15s ease' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ color: 'var(--text-primary)', fontWeight: '500', fontSize: '14px' }}>
                        {article.title}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <NewsCategoryBadge category={article.category} />
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {formatDate(article.published_at)}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      {isPublished(article.published_at) ? (
                        <span style={{ color: 'var(--success)', fontSize: '18px' }}>✓</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>
                    {websiteEnabled && (
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      {(article as any).publish_on_site && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600, color: 'var(--info-text)', background: 'var(--info-bg, rgba(59,130,246,0.1))', padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap' }}>
                          <Globe size={11} /> Sur le site
                        </span>
                      )}
                    </td>
                    )}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        {canEdit && (
                          <>
                            <button
                              onClick={() => openEdit(article)}
                              style={{ padding: '8px', borderRadius: '8px', transition: 'background 0.15s ease', display: 'flex', alignItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer' }}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                              title="Modifier"
                            >
                              <Edit2 style={{ width: '16px', height: '16px', color: 'var(--text-secondary)' }} />
                            </button>
                            <button
                              onClick={() => handleDelete(article.id)}
                              style={{ padding: '8px', borderRadius: '8px', transition: 'background 0.15s ease', display: 'flex', alignItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer' }}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                              title="Supprimer"
                            >
                              <Trash2 style={{ width: '16px', height: '16px', color: 'var(--danger)' }} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showPanel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div
              className="sticky top-0 flex items-center justify-between px-6 py-4 rounded-t-xl"
              style={{ background: 'var(--bg-modal-header)' }}
            >
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-modal-header)' }}>
                {editingId ? 'Modifier l\'article' : 'Nouvel article'}
              </h2>
              <button onClick={closePanel} className="hover:opacity-80 transition-opacity" style={{ color: 'var(--text-modal-header)' }}>
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Titre *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg focus:outline-none"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Contenu *</label>
                <textarea
                  required
                  rows={10}
                  value={formData.body}
                  onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg focus:outline-none resize-y"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Type d'actualité *</label>
                  <select
                    required
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg focus:outline-none"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  >
                    <option value="">-- Sélectionner --</option>
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Date de publication *</label>
                  <input
                    type="datetime-local"
                    required
                    value={formData.published_at}
                    onChange={(e) => setFormData({ ...formData, published_at: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg focus:outline-none"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>

              {/* Publier sur le site */}
              {websiteEnabled && (
              <div style={{ marginTop: '8px' }}>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.publish_on_site}
                    onChange={e => setFormData({ ...formData, publish_on_site: e.target.checked })}
                    className="w-4 h-4 mt-0.5"
                  />
                  <div>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      Publier sur le site du club
                    </span>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      L'actualité apparaîtra aussi sur le site internet public du club. Laissez décoché pour une information réservée aux membres.
                    </p>
                  </div>
                </label>
              </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Image</label>
                {formData.image_url ? (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <img
                      src={formData.image_url}
                      alt="Aperçu"
                      style={{ width: '120px', height: '80px', objectFit: 'cover', objectPosition: 'top', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', cursor: 'pointer' }}
                      >
                        Remplacer
                      </button>
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={handleRemoveImage}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--danger)', cursor: 'pointer' }}
                      >
                        Retirer
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                      style={{ background: 'var(--bg-hover)', border: '1px dashed var(--border-color)', color: 'var(--text-secondary)', cursor: 'pointer', width: 'fit-content' }}
                    >
                      {uploading ? (
                        <><span className="animate-spin" style={{ display: 'inline-block', width: '16px', height: '16px', border: '2px solid var(--border-color)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} /> Téléversement...</>
                      ) : (
                        <><Upload size={16} /> Téléverser une image</>
                      )}
                    </button>
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Ou coller le lien d'une image</label>
                      <input
                        type="url"
                        value={formData.image_url}
                        onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                        placeholder="https://exemple.com/image.jpg"
                        className="w-full px-4 py-2 rounded-lg focus:outline-none text-sm"
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }}
                />
                {imageError && <p className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>{imageError}</p>}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
                <Button type="button" variant="secondary" onClick={closePanel}>
                  Annuler
                </Button>
                <Button type="submit" disabled={saving || uploading} leftIcon={<Save className="w-4 h-4" />}>
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        {...confirmState}
        onCancel={hideConfirm}
      />
      <Toast toast={toast} />
    </div>
  )
}
