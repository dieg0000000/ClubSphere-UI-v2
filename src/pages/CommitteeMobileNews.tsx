import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { safeUUID } from '../lib/ids'
import { useTenant } from '../context/TenantContext'
import { useAuth } from '../context/AuthContext'
import { useModuleAccess } from '../hooks/useModuleAccess'
import { useWebsiteModuleEnabled } from '../hooks/useWebsiteModuleEnabled'
import { useToast } from '../hooks/useToast'
import { Toast } from '../components/Toast'
import { resizeNewsImage } from '../lib/imageProcessing'
import { toLocalDatetimeValue } from '../utils/formatHelpers'
import NewsCategoryBadge from '../components/NewsCategoryBadge'
import ConfirmModal from '../components/ConfirmModal'
import {
  ChevronLeft, Loader as Loader2, Plus, Trash2,
  CreditCard as Edit2, X, Save, Upload, Newspaper,
} from 'lucide-react'

interface NewsRow {
  id: string
  title: string
  body: string
  category: string
  image_url: string | null
  published_at: string
  author_id: string
}

type FormData = {
  title: string
  body: string
  category: string
  image_url: string
  published_at: string
  publish_on_site: boolean
}

const emptyForm = (): FormData => ({
  title: '',
  body: '',
  category: '',
  image_url: '',
  published_at: new Date().toISOString().slice(0, 16),
  publish_on_site: false,
})

export default function CommitteeMobileNews() {
  const { clubId } = useTenant()
  const { user } = useAuth()
  const { canEdit } = useModuleAccess('actualites')
  const { enabled: websiteEnabled } = useWebsiteModuleEnabled()
  const navigate = useNavigate()
  const { toast, showToast } = useToast()

  const [news, setNews] = useState<NewsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [imageError, setImageError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean
    title: string
    message: React.ReactNode
    confirmLabel: string
    cancelLabel: string
    confirmStyle: 'danger' | 'warning' | 'primary'
    onConfirm: () => void
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Confirmer',
    cancelLabel: 'Annuler',
    confirmStyle: 'danger',
    onConfirm: () => {},
  })

  const showConfirm = (config: Partial<typeof confirmState>) => {
    setConfirmState(prev => ({ ...prev, ...config, isOpen: true }))
  }
  const hideConfirm = () => setConfirmState(prev => ({ ...prev, isOpen: false }))

  useEffect(() => {
    supabase
      .from('news_categories')
      .select('name')
      .eq('active', true)
      .order('display_order')
      .then(({ data }) => setCategories(data?.map(r => r.name) || []))
  }, [clubId])

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('news')
      .select('*')
      .order('published_at', { ascending: false })
    if (selectedCategory) q = q.eq('category', selectedCategory)
    const { data } = await q
    setNews((data as NewsRow[]) || [])
    setLoading(false)
  }, [selectedCategory])

  useEffect(() => { load() }, [load])

  const isNewsBucketUrl = (url: string) => url.includes('/storage/v1/object/public/news-images/')

  const deleteFromBucket = async (url: string) => {
    if (!isNewsBucketUrl(url)) return
    const parts = url.split('/storage/v1/object/public/news-images/')
    if (parts[1]) await supabase.storage.from('news-images').remove([parts[1]])
  }

  const handleImageUpload = async (file: File) => {
    setImageError('')
    const accepted = ['image/jpeg', 'image/png', 'image/webp']
    if (!accepted.includes(file.type)) {
      setImageError('Format non pris en charge. Utilisez JPEG, PNG ou WebP.')
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
      const { error } = await supabase.storage
        .from('news-images')
        .upload(path, blob, { contentType: 'image/jpeg' })
      if (error) { setImageError('Le téléversement a échoué.'); return }
      const { data: pubData } = supabase.storage.from('news-images').getPublicUrl(path)
      setFormData(prev => ({ ...prev, image_url: pubData.publicUrl }))
      if (prevUrl) await deleteFromBucket(prevUrl)
    } catch {
      setImageError('Le téléversement a échoué.')
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
    setShowForm(true)
  }

  const openEdit = (article: NewsRow) => {
    setEditingId(article.id)
    setFormData({
      title: article.title,
      body: article.body,
      category: article.category,
      image_url: article.image_url || '',
      published_at: toLocalDatetimeValue(article.published_at),
      publish_on_site: (article as any).publish_on_site ?? false,
    })
    setImageError('')
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
    setFormData(emptyForm())
    setImageError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        title: formData.title,
        body: formData.body,
        category: formData.category,
        image_url: formData.image_url || null,
        published_at: new Date(formData.published_at).toISOString(),
        author_id: user!.id,
        publish_on_site: formData.publish_on_site,
      }
      if (editingId) {
        const { error } = await supabase.from('news').update(payload).eq('id', editingId)
        if (error) { showToast('Erreur: ' + error.message, 'error'); return }
      } else {
        const { error } = await supabase.from('news').insert([payload])
        if (error) { showToast('Erreur: ' + error.message, 'error'); return }
      }
      closeForm()
      load()
    } catch {
      showToast("Erreur lors de la sauvegarde", 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (id: string) => {
    showConfirm({
      title: "Supprimer l'article",
      message: 'Êtes-vous sûr de vouloir supprimer cet article ?',
      confirmLabel: 'Oui, supprimer',
      cancelLabel: 'Non',
      confirmStyle: 'danger',
      onConfirm: async () => {
        hideConfirm()
        const article = news.find(n => n.id === id)
        if (article?.image_url) await deleteFromBucket(article.image_url)
        const { error } = await supabase.from('news').delete().eq('id', id)
        if (error) { showToast('Erreur lors de la suppression', 'error'); return }
        setNews(prev => prev.filter(n => n.id !== id))
      },
    })
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-CH', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

  const isPublished = (date: string) => new Date(date) <= new Date()

  /* ── Form overlay (full-screen on mobile) ── */
  if (showForm) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'var(--bg-page, #f5f5f5)', overflowY: 'auto',
      }}>
        <div style={{ maxWidth: 500, margin: '0 auto', padding: '16px', paddingBottom: '100px' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
            <button
              type="button"
              onClick={closeForm}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 36, height: 36, borderRadius: '10px', border: '1px solid var(--border-color)',
                background: 'var(--bg-card)', cursor: 'pointer', flexShrink: 0,
              }}
            >
              <X size={20} style={{ color: 'var(--text-primary)' }} />
            </button>
            <h1 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, flex: 1 }}>
              {editingId ? "Modifier l'article" : 'Nouvel article'}
            </h1>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Title */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Titre *
              </label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={e => setFormData(p => ({ ...p, title: e.target.value }))}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: '10px', fontSize: '15px',
                  background: 'var(--bg-input)', border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Body */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Contenu *
              </label>
              <textarea
                required
                rows={6}
                value={formData.body}
                onChange={e => setFormData(p => ({ ...p, body: e.target.value }))}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: '10px', fontSize: '15px',
                  background: 'var(--bg-input)', border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)', resize: 'vertical', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Category */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Type d'actualité *
              </label>
              <select
                required
                value={formData.category}
                onChange={e => setFormData(p => ({ ...p, category: e.target.value }))}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: '10px', fontSize: '15px',
                  background: 'var(--bg-input)', border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)', boxSizing: 'border-box',
                  WebkitAppearance: 'none', appearance: 'none',
                }}
              >
                <option value="">-- Sélectionner --</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Publish date */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Date de publication *
              </label>
              <input
                type="datetime-local"
                required
                value={formData.published_at}
                onChange={e => setFormData(p => ({ ...p, published_at: e.target.value }))}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: '10px', fontSize: '15px',
                  background: 'var(--bg-input)', border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Publier sur le site */}
            {websiteEnabled && (
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.publish_on_site}
                  onChange={e => setFormData(p => ({ ...p, publish_on_site: e.target.checked }))}
                  style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0 }}
                />
                <div>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Publier sur le site du club
                  </span>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0', lineHeight: 1.4 }}>
                    L'actualité apparaîtra aussi sur le site internet public du club. Laissez décoché pour une information réservée aux membres.
                  </p>
                </div>
              </label>
            </div>
            )}

            {/* Image */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Image
              </label>
              {formData.image_url ? (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <img
                    src={formData.image_url}
                    alt="Aperçu"
                    style={{ width: 90, height: 60, objectFit: 'cover', objectPosition: 'top', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                        background: 'var(--bg-hover)', border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)', cursor: 'pointer',
                      }}
                    >
                      Remplacer
                    </button>
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={handleRemoveImage}
                      style={{
                        padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                        background: 'transparent', border: '1px solid var(--border-color)',
                        color: 'var(--danger)', cursor: 'pointer',
                      }}
                    >
                      Retirer
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '12px 16px', borderRadius: '10px', fontSize: '14px', fontWeight: 500,
                    background: 'var(--bg-hover)', border: '1px dashed var(--border-color)',
                    color: 'var(--text-secondary)', cursor: 'pointer', width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  {uploading ? (
                    <Loader2 size={18} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
                  ) : (
                    <Upload size={18} />
                  )}
                  {uploading ? 'Téléversement...' : 'Photo ou image'}
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f) }}
              />
              {imageError && (
                <p style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '6px' }}>{imageError}</p>
              )}
            </div>

            {/* Submit — fixed at bottom, above tab bar */}
            <div style={{
              position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 51,
              padding: '12px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px) + 64px)',
              background: 'var(--bg-page, #f5f5f5)',
              borderTop: '1px solid var(--border-color)',
            }}>
              <div style={{ maxWidth: 500, margin: '0 auto', display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={closeForm}
                  style={{
                    flex: 1, padding: '12px', borderRadius: '12px', fontSize: '15px', fontWeight: 700,
                    background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                    color: 'var(--text-secondary)', cursor: 'pointer',
                  }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving || uploading}
                  style={{
                    flex: 2, padding: '12px', borderRadius: '12px', fontSize: '15px', fontWeight: 700,
                    background: saving || uploading ? 'var(--text-muted)' : 'var(--accent, #2563eb)',
                    border: 'none', color: '#fff', cursor: saving || uploading ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  }}
                >
                  <Save size={18} />
                  {saving ? 'Enregistrement...' : (editingId ? 'Enregistrer' : 'Publier')}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    )
  }

  /* ── List view ── */
  return (
    <div style={{ maxWidth: 500, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 36, height: 36, borderRadius: '10px', border: '1px solid var(--border-color)',
            background: 'var(--bg-card)', cursor: 'pointer', flexShrink: 0,
          }}
        >
          <ChevronLeft size={20} style={{ color: 'var(--text-primary)' }} />
        </button>
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, flex: 1 }}>
          <Newspaper size={18} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '8px' }} />
          Actualités
        </h1>
        {canEdit && (
          <button
            type="button"
            onClick={openCreate}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, borderRadius: '10px',
              background: 'var(--accent, #2563eb)', border: 'none',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            <Plus size={20} style={{ color: '#fff' }} />
          </button>
        )}
      </div>

      {/* Category filter pills */}
      {categories.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', overflowX: 'auto', paddingBottom: '2px' }}>
          {[{ key: '', label: 'Tous' }, ...categories.map(c => ({ key: c, label: c }))].map(tab => {
            const active = selectedCategory === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setSelectedCategory(tab.key)}
                style={{
                  padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                  border: active ? '1.5px solid var(--accent, #2563eb)' : '1px solid var(--border-color)',
                  background: active ? 'var(--accent-soft, rgba(37,99,235,0.08))' : 'var(--bg-card)',
                  color: active ? 'var(--accent, #2563eb)' : 'var(--text-secondary)',
                  cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <Loader2 size={26} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      ) : news.length === 0 ? (
        <div style={{
          padding: '32px 16px', borderRadius: '12px', background: 'var(--bg-card)',
          border: '1px solid var(--border-color)', textAlign: 'center',
        }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>Aucun article</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {news.map(article => (
            <div
              key={article.id}
              style={{
                padding: '14px', borderRadius: '12px',
                border: '1px solid var(--border-color)', background: 'var(--bg-card)',
              }}
            >
              <div style={{ display: 'flex', gap: '10px' }}>
                {article.image_url && (
                  <img
                    src={article.image_url}
                    alt=""
                    style={{
                      width: 56, height: 56, borderRadius: '8px', objectFit: 'cover',
                      objectPosition: 'top', flexShrink: 0,
                    }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)',
                    margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {article.title}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                    <NewsCategoryBadge category={article.category} />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {formatDate(article.published_at)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                    {isPublished(article.published_at) ? (
                      <span style={{ fontSize: '11px', color: 'var(--success)', fontWeight: 600 }}>Publié</span>
                    ) : (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Programmé</span>
                    )}
                    {websiteEnabled && (article as any).publish_on_site && (
                      <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--info-text)', background: 'var(--info-bg, rgba(59,130,246,0.1))', padding: '1px 7px', borderRadius: '8px', whiteSpace: 'nowrap' }}>Sur le site</span>
                    )}
                  </div>
                </div>
              </div>

              {canEdit && (
                <div style={{
                  display: 'flex', gap: '8px', marginTop: '10px',
                  borderTop: '1px solid var(--border-color)', paddingTop: '10px',
                }}>
                  <button
                    type="button"
                    onClick={() => openEdit(article)}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      padding: '8px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                      background: 'var(--bg-hover)', border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)', cursor: 'pointer',
                    }}
                  >
                    <Edit2 size={14} /> Modifier
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(article.id)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '8px 12px', borderRadius: '8px',
                      background: 'transparent', border: '1px solid var(--border-color)',
                      color: 'var(--danger)', cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmModal {...confirmState} onCancel={hideConfirm} />
      <Toast toast={toast} />
    </div>
  )
}
