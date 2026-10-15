import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { TeamCategory } from '../types'
import { Pencil, Trash2, Plus, ChevronUp, ChevronDown, X, Check } from 'lucide-react'
import { useModuleAccess } from '../hooks/useModuleAccess'
import { Tabs } from '../components/ui/Tabs'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useToast } from '../hooks/useToast'
import { Toast } from '../components/Toast'
import Button from '../components/ui/Button'

export function AdminCategories() {
  const { canEdit } = useModuleAccess('categories')
  const [activeTab, setActiveTab] = useState<'junior' | 'active'>('junior')
  const [categories, setCategories] = useState<TeamCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingBirthFrom, setEditingBirthFrom] = useState('')
  const [editingBirthTo, setEditingBirthTo] = useState('')
  const [editingMaxPlayers, setEditingMaxPlayers] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [viewingCategory, setViewingCategory] = useState<TeamCategory | null>(null)
  const { toast, showToast } = useToast()

  useEffect(() => { document.title = 'Catégories - ClubSphere' }, [])

  useEffect(() => {
    loadCategories()
  }, [activeTab])

  const loadCategories = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('team_categories')
        .select('*')
        .eq('type', activeTab)
        .order('display_order', { ascending: true })

      if (error) throw error
      setCategories(data || [])
    } catch (error) {
      console.error('Error loading categories:', error)
    } finally {
      setLoading(false)
    }
  }

  const currentYear = new Date().getFullYear()

  const handleStartEdit = (category: TeamCategory) => {
    setEditingId(category.id)
    setEditingName(category.name)
    setEditingBirthFrom(category.age_to != null ? String(currentYear - category.age_to) : '')
    setEditingBirthTo(category.age_from != null ? String(currentYear - category.age_from) : '')
    setEditingMaxPlayers(category.max_players != null && category.max_players > 0 ? String(category.max_players) : '')
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditingName('')
    setEditingBirthFrom('')
    setEditingBirthTo('')
    setEditingMaxPlayers('')
  }

  useEscapeKey(() => {
    setViewingCategory(null)
    setEditingId(null)
    setEditingName('')
    setIsAdding(false)
  })

  const handleSaveEdit = async (id: string) => {
    if (!editingName.trim()) return
    const birthFrom = editingBirthFrom ? parseInt(editingBirthFrom) : null
    const birthTo = editingBirthTo ? parseInt(editingBirthTo) : null
    const max = editingMaxPlayers ? parseInt(editingMaxPlayers) : null

    if (birthFrom !== null && birthTo !== null && birthFrom > birthTo) {
      showToast('L\'année "de" doit être ≤ à l\'année "à"', 'error')
      return
    }
    if (max !== null && max < 0) {
      showToast('Max joueurs ne peut pas être négatif', 'error')
      return
    }

    const ageFrom = birthTo !== null ? currentYear - birthTo : null
    const ageTo = birthFrom !== null ? currentYear - birthFrom : null

    if (ageFrom !== null && (ageFrom < 3 || ageFrom > 90)) {
      showToast('L\'âge résultant doit être entre 3 et 90', 'error')
      return
    }
    if (ageTo !== null && (ageTo < 3 || ageTo > 90)) {
      showToast('L\'âge résultant doit être entre 3 et 90', 'error')
      return
    }

    setActionLoading(id)
    try {
      const { error } = await supabase
        .from('team_categories')
        .update({
          name: editingName,
          age_from: ageFrom,
          age_to: ageTo,
          max_players: max === 0 ? null : max,
        })
        .eq('id', id)

      if (error) throw error
      await loadCategories()
      handleCancelEdit()
    } catch (error) {
      console.error('Error updating category:', error)
      showToast('Erreur lors de la mise à jour', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return
    console.log('Adding category...', { name: newCategoryName, type: activeTab })
    setActionLoading('add')
    try {
      const maxOrder = categories.reduce((max, cat) => Math.max(max, cat.display_order), 0)
      const { error } = await supabase
        .from('team_categories')
        .insert({
          type: activeTab,
          name: newCategoryName,
          display_order: maxOrder + 1,
          active: true
        })

      console.log('Add result:', error)
      if (error) throw error
      await loadCategories()
      setIsAdding(false)
      setNewCategoryName('')
    } catch (error) {
      console.error('Error adding category:', error)
      showToast('Erreur lors de l\'ajout', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (id: string) => {
    setActionLoading(id)
    try {
      const { data: teamsUsingCategory } = await supabase
        .from('teams')
        .select('id')
        .eq('category_id', id)
        .limit(1)

      if (teamsUsingCategory && teamsUsingCategory.length > 0) {
        showToast('Impossible de supprimer : des équipes utilisent cette catégorie', 'warning')
        setActionLoading(null)
        setShowDeleteConfirm(null)
        return
      }

      const { error } = await supabase
        .from('team_categories')
        .delete()
        .eq('id', id)

      if (error) throw error
      await loadCategories()
      setShowDeleteConfirm(null)
    } catch (error) {
      console.error('Error deleting category:', error)
      showToast('Erreur lors de la suppression', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleMoveUp = async (category: TeamCategory, index: number) => {
    if (index === 0) return
    setActionLoading(category.id)
    try {
      const prevCategory = categories[index - 1]
      await supabase
        .from('team_categories')
        .update({ display_order: prevCategory.display_order })
        .eq('id', category.id)

      await supabase
        .from('team_categories')
        .update({ display_order: category.display_order })
        .eq('id', prevCategory.id)

      await loadCategories()
    } catch (error) {
      console.error('Error moving category:', error)
    } finally {
      setActionLoading(null)
    }
  }

  const handleMoveDown = async (category: TeamCategory, index: number) => {
    if (index === categories.length - 1) return
    setActionLoading(category.id)
    try {
      const nextCategory = categories[index + 1]
      await supabase
        .from('team_categories')
        .update({ display_order: nextCategory.display_order })
        .eq('id', category.id)

      await supabase
        .from('team_categories')
        .update({ display_order: category.display_order })
        .eq('id', nextCategory.id)

      await loadCategories()
    } catch (error) {
      console.error('Error moving category:', error)
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[var(--accent)]"></div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-8 w-full mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Admin Catégories football</h1>
      </div>

      <Tabs
        items={[
          { key: 'junior', label: 'Juniors' },
          { key: 'active', label: 'Équipes actives' },
        ]}
        value={activeTab}
        onChange={(id) => setActiveTab(id as 'junior' | 'active')}
        className="mb-6"
      />

      <div className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-lg)' }}>
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Catégories {activeTab === 'junior' ? 'Juniors' : 'Équipes actives'}
            </h2>
            {canEdit && !isAdding && (
              <Button
                variant="primary"
                onClick={() => setIsAdding(true)}
              >
                <Plus size={20} />
                Ajouter une catégorie
              </Button>
            )}
          </div>

          {canEdit && isAdding && (
            <div className="rounded-lg p-4 mb-4 flex items-center gap-3" style={{ background: 'var(--bg-card)' }}>
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Nom de la catégorie"
                className="flex-1 rounded-lg px-4 py-2 focus:outline-none focus:border-[var(--accent)]" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                autoFocus
              />
              <button
                onClick={handleAddCategory}
                disabled={!newCategoryName.trim() || actionLoading === 'add'}
                className="p-2 disabled:opacity-50 rounded"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--text-inverse)' }}
              >
                <Check size={20} />
              </button>
              <button
                onClick={() => {
                  setIsAdding(false)
                  setNewCategoryName('')
                }}
                className="p-2 rounded" style={{ border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              >
                <X size={20} />
              </button>
            </div>
          )}
        </div>

        <div>
          {categories.map((category, index) => (
            <div
              key={category.id}
              className={`px-6 py-4 flex items-center gap-3 ${editingId !== category.id ? 'cursor-pointer' : ''}`}
              style={{
                borderTop: index === 0 ? '1px solid var(--border-color)' : undefined,
                borderBottom: '1px solid var(--border-color)',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              onClick={() => { if (editingId !== category.id && !isAdding) setViewingCategory(category) }}
            >
              {canEdit && (
                <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleMoveUp(category, index)}
                    disabled={index === 0 || actionLoading === category.id}
                    className="p-1 disabled:opacity-30" style={{ color: 'var(--text-secondary)' }}
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    onClick={() => handleMoveDown(category, index)}
                    disabled={index === categories.length - 1 || actionLoading === category.id}
                    className="p-1 disabled:opacity-30" style={{ color: 'var(--text-secondary)' }}
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
              )}

              <span className="text-sm font-mono w-8" style={{ color: 'var(--text-secondary)' }}>
                {category.display_order}
              </span>

              {editingId === category.id ? (
                <div className="flex-1 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="flex-1 min-w-[120px] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    autoFocus
                    placeholder="Nom"
                  />
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>de</span>
                      <input
                        type="number"
                        min={1930}
                        max={currentYear}
                        value={editingBirthFrom}
                        onChange={(e) => setEditingBirthFrom(e.target.value)}
                        placeholder="ex. 2016"
                        className="w-[80px] rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      />
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>à</span>
                      <input
                        type="number"
                        min={1930}
                        max={currentYear}
                        value={editingBirthTo}
                        onChange={(e) => setEditingBirthTo(e.target.value)}
                        placeholder="ex. 2017"
                        className="w-[80px] rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Basé sur l'âge — glisse automatiquement chaque 1er janvier.</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                      <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Max</span>
                      <input
                        type="number"
                        min={0}
                        value={editingMaxPlayers}
                        onChange={(e) => setEditingMaxPlayers(e.target.value)}
                        placeholder="∞"
                        className="w-[70px] rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>0 ou vide = illimité</span>
                  </div>
                  <button
                    onClick={() => handleSaveEdit(category.id)}
                    disabled={!editingName.trim() || actionLoading === category.id}
                    className="p-2 disabled:opacity-50 rounded"
                    style={{ backgroundColor: 'var(--accent)', color: 'var(--text-inverse)' }}
                  >
                    <Check size={20} />
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="p-2 rounded" style={{ border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  >
                    <X size={20} />
                  </button>
                </div>
              ) : (
                <>
                  <span className="flex-1" style={{ color: 'var(--text-primary)' }}>
                    {category.name}
                    {(category.age_from != null || category.age_to != null || (category.max_players != null && category.max_players > 0)) && (
                      <span className="ml-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {category.age_from != null && category.age_to != null
                          ? `${currentYear - category.age_to}-${currentYear - category.age_from}`
                          : category.age_to != null
                          ? `dès ${currentYear - category.age_to}`
                          : category.age_from != null
                          ? `jusqu'à ${currentYear - category.age_from}`
                          : ''}
                        {(category.age_from != null || category.age_to != null) && category.max_players != null && category.max_players > 0 ? ' · ' : ''}
                        {category.max_players != null && category.max_players > 0 ? `max ${category.max_players}` : ''}
                      </span>
                    )}
                  </span>
                  {canEdit && (
                    <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
                      <button
                        onClick={() => handleStartEdit(category)}
                        className="p-2" style={{ color: 'var(--text-secondary)' }}
                      >
                        <Pencil size={18} />
                      </button>
                      {showDeleteConfirm === category.id ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDelete(category.id)}
                            disabled={actionLoading === category.id}
                            className="text-xs px-3 py-1 rounded transition-colors disabled:opacity-50"
                            style={{ backgroundColor: 'var(--danger)', color: 'var(--text-inverse)' }}
                          >
                            Confirmer
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(null)}
                            className="text-xs px-3 py-1 rounded transition-colors" style={{ border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                          >
                            Annuler
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowDeleteConfirm(category.id)}
                          className="p-2 text-[var(--danger-text)] hover:text-[var(--danger)]"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}

          {categories.length === 0 && !isAdding && (
            <div className="text-center py-8">
              <p style={{ color: 'var(--text-secondary)' }}>Aucune catégorie trouvée</p>
            </div>
          )}
        </div>
        <p className="mt-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Si une catégorie atteint son « Max joueurs », les nouvelles inscriptions passent automatiquement en liste d'attente.
        </p>
      </div>
      {viewingCategory && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setViewingCategory(null)} />
          <div className="fixed right-0 top-0 h-full z-50 overflow-y-auto" style={{ width: '600px', background: 'var(--bg-card)', borderLeft: '1px solid var(--border-color)' }}>
            <div className="sticky top-0 px-6 py-4 flex items-center justify-between" style={{ background: 'var(--bg-modal-header)' }}>
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-modal-header)' }}>{viewingCategory.name}</h2>
              <button onClick={() => setViewingCategory(null)} className="hover:opacity-80" style={{ color: 'var(--text-modal-header)' }}>
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div>
                <div style={{ color: 'var(--text-secondary)' }} className="mb-1">Type</div>
                <div style={{ color: 'var(--text-primary)' }}>{viewingCategory.type === 'junior' ? 'Juniors' : 'Équipes actives'}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)' }} className="mb-1">Ordre d'affichage</div>
                <div style={{ color: 'var(--text-primary)' }}>{viewingCategory.display_order}</div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <button
                onClick={() => setViewingCategory(null)}
                className="px-4 py-2 rounded-lg transition-colors"
                style={{ border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)' }}
              >
                Fermer
              </button>
              {canEdit && (
                <Button
                  variant="primary"
                  onClick={() => { handleStartEdit(viewingCategory); setViewingCategory(null) }}
                >
                  <Pencil size={16} />
                  Modifier
                </Button>
              )}
            </div>
          </div>
        </>
      )}
      <Toast toast={toast} />
    </div>
  )
}
