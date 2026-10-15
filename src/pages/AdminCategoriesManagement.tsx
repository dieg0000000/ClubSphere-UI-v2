import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, CreditCard as Edit2, Trash2, ChevronUp, ChevronDown, X, Tag } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';
import { Tabs } from '../components/ui/Tabs';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';

interface Category {
  id: string;
  type: 'junior' | 'active';
  name: string;
  display_order: number;
  active: boolean;
  age_from: number | null;
  age_to: number | null;
  max_players: number | null;
}

export default function AdminCategoriesManagement() {
  const [activeTab, setActiveTab] = useState<'junior' | 'active'>('junior');
  const [categories, setCategories] = useState<Category[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);
  const currentYear = new Date().getFullYear();
  const [formData, setFormData] = useState({
    name: '',
    active: true,
    birthYearFrom: '' as string,
    birthYearTo: '' as string,
    max_players: '' as string,
  });
  const { toast, showToast } = useToast();

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
  });

  const showConfirm = (config: Partial<typeof confirmState>) => {
    setConfirmState(prev => ({ ...prev, ...config, isOpen: true }));
  };

  const hideConfirm = () => {
    setConfirmState(prev => ({ ...prev, isOpen: false }));
  };

  useEffect(() => {
    document.title = "Catégories d'équipes - ClubSphere";
    loadCategories();
  }, [activeTab]);

  async function loadCategories() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('team_categories')
        .select('*')
        .eq('type', activeTab)
        .order('display_order');

      if (error) {
        console.error('Error loading categories:', error);
      } else if (data) {
        setCategories(data);
      }
    } catch (err) {
      console.error('Unexpected error loading categories:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const birthFrom = formData.birthYearFrom ? parseInt(formData.birthYearFrom) : null;
    const birthTo = formData.birthYearTo ? parseInt(formData.birthYearTo) : null;
    const max = formData.max_players ? parseInt(formData.max_players) : null;

    if (birthFrom !== null && birthTo !== null && birthFrom > birthTo) {
      showToast('L\'année "de" doit être inférieure ou égale à l\'année "à"', 'error');
      return;
    }
    if (max !== null && max < 0) {
      showToast('Max joueurs ne peut pas être négatif', 'error');
      return;
    }

    const ageFrom = birthTo !== null ? currentYear - birthTo : null;
    const ageTo = birthFrom !== null ? currentYear - birthFrom : null;

    if (ageFrom !== null && (ageFrom < 3 || ageFrom > 90)) {
      showToast('L\'âge résultant doit être entre 3 et 90', 'error');
      return;
    }
    if (ageTo !== null && (ageTo < 3 || ageTo > 90)) {
      showToast('L\'âge résultant doit être entre 3 et 90', 'error');
      return;
    }

    const payload = {
      name: formData.name,
      active: formData.active,
      age_from: ageFrom,
      age_to: ageTo,
      max_players: max === 0 ? null : max,
    };

    if (editingCategory) {
      const { error } = await supabase
        .from('team_categories')
        .update(payload)
        .eq('id', editingCategory.id);

      if (error) {
        showToast('Erreur: ' + error.message, 'error');
        return;
      }
    } else {
      const maxOrder = categories.length > 0
        ? Math.max(...categories.map(c => c.display_order))
        : 0;

      const { error } = await supabase
        .from('team_categories')
        .insert([{
          ...payload,
          type: activeTab,
          display_order: maxOrder + 1
        }]);

      if (error) {
        showToast('Erreur: ' + error.message, 'error');
        return;
      }
    }

    setShowModal(false);
    resetForm();
    loadCategories();
  }

  async function handleDelete(id: string) {
    const { data: teams } = await supabase
      .from('teams')
      .select('id')
      .eq('category_id', id)
      .limit(1);

    if (teams && teams.length > 0) {
      showToast('Impossible de supprimer: cette catégorie est utilisée par des équipes', 'warning');
      return;
    }

    showConfirm({
      title: 'Supprimer la catégorie',
      message: 'Êtes-vous sûr de vouloir supprimer cette catégorie ?',
      confirmLabel: 'Oui, supprimer',
      cancelLabel: 'Non',
      confirmStyle: 'danger',
      onConfirm: async () => {
        hideConfirm();
        const { error } = await supabase
          .from('team_categories')
          .delete()
          .eq('id', id);

        if (error) {
          showToast('Erreur: ' + error.message, 'error');
          return;
        }

        loadCategories();
      }
    });
  }

  async function moveCategory(id: string, direction: 'up' | 'down') {
    const index = categories.findIndex(c => c.id === id);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === categories.length - 1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    const newCategories = [...categories];
    [newCategories[index], newCategories[newIndex]] = [newCategories[newIndex], newCategories[index]];

    const updates = newCategories.map((cat, idx) => ({
      id: cat.id,
      display_order: idx + 1
    }));

    for (const update of updates) {
      await supabase
        .from('team_categories')
        .update({ display_order: update.display_order })
        .eq('id', update.id);
    }

    loadCategories();
  }

  async function toggleActive(id: string, active: boolean) {
    await supabase
      .from('team_categories')
      .update({ active: !active })
      .eq('id', id);

    loadCategories();
  }

  function openModal(category?: Category) {
    if (category) {
      setEditingCategory(category);
      setFormData({
        name: category.name,
        active: category.active,
        birthYearFrom: category.age_to != null ? String(currentYear - category.age_to) : '',
        birthYearTo: category.age_from != null ? String(currentYear - category.age_from) : '',
        max_players: category.max_players != null && category.max_players > 0 ? String(category.max_players) : '',
      });
    } else {
      resetForm();
    }
    setShowModal(true);
  }

  function resetForm() {
    setEditingCategory(null);
    setFormData({
      name: '',
      active: true,
      birthYearFrom: '',
      birthYearTo: '',
      max_players: '',
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--accent)' }}></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6" style={{ background: 'var(--bg-page)' }}>
      <div className="w-full mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
              <Tag className="w-5 h-5" />
              Catégories
            </h1>
            <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>Catégories football</p>
          </div>
          <button
            onClick={() => openModal()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
            style={{ background: 'var(--accent)', color: 'var(--text-inverse)' }}
          >
            <Plus className="w-5 h-5" />
            Nouvelle catégorie
          </button>
        </div>

        <Tabs
          items={[
            { key: 'junior', label: 'Juniors' },
            { key: 'active', label: 'Actives' },
          ]}
          value={activeTab}
          onChange={(k) => setActiveTab(k as 'junior' | 'active')}
          className="mb-6"
        />

        <div className="rounded-lg shadow-xl overflow-hidden" style={{ background: 'var(--bg-card)' }}>
          <style>{`
            .categories-stickhead thead th {
              position: sticky; top: 0; z-index: 2;
              background: var(--table-header-bg);
              border-bottom: 1px solid var(--border-color);
            }
            .categories-stickhead thead th::after {
              content: ''; position: absolute; left: 0; right: 0; bottom: -8px; height: 8px;
              pointer-events: none;
              background: linear-gradient(to bottom, rgba(0,0,0,0.28), rgba(0,0,0,0));
            }
          `}</style>
          <div className="overflow-x-auto" style={{ width: '100%', maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
            <table className="categories-stickhead w-full" style={{ minWidth: '600px' }}>
              <thead style={{ background: 'var(--table-header-bg)' }}>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ width: '80px', color: 'var(--text-secondary)' }}>
                    Ordre
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ flex: '1', color: 'var(--text-secondary)' }}>
                    Nom
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ width: '100px', color: 'var(--text-secondary)' }}>
                    Statut
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ width: '120px', color: 'var(--text-secondary)' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                {categories.map((category, index) => (
                  <tr key={category.id} className="hover:bg-[var(--bg-hover)]">
                    <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: 'var(--text-primary)' }}>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => moveCategory(category.id, 'up')}
                          disabled={index === 0}
                          className="p-1 disabled:opacity-30"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => moveCategory(category.id, 'down')}
                          disabled={index === categories.length - 1}
                          className="p-1 disabled:opacity-30"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm" style={{ color: 'var(--text-primary)' }}>
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
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => toggleActive(category.id, category.active)}
                        className="px-2 py-1 text-xs font-medium rounded border"
                        style={category.active
                          ? { background: 'var(--success-soft)', color: 'var(--success-text)', borderColor: 'var(--success)' }
                          : { background: 'var(--bg-hover)', color: 'var(--text-muted)', borderColor: 'var(--border-color)' }
                        }
                      >
                        {category.active ? 'Actif' : 'Inactif'}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openModal(category)}
                          style={{ color: 'var(--accent)' }}
                          className="hover:opacity-80"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(category.id)}
                          style={{ color: 'var(--danger)' }}
                          className="hover:opacity-80"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="rounded-lg shadow-xl max-w-md w-full" style={{ background: 'var(--bg-card)' }}>
            <div className="flex items-center justify-between px-6 py-4 rounded-t-lg" style={{ background: 'var(--bg-modal-header)' }}>
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-modal-header)' }}>
                {editingCategory ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
              </h2>
              <button onClick={() => setShowModal(false)} className="hover:opacity-80" style={{ color: 'var(--text-modal-header)' }}>
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Nom *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--accent)' } as React.CSSProperties}
                />
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Active</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Années de naissance
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>de</span>
                  <input
                    type="number"
                    min={1930}
                    max={currentYear}
                    value={formData.birthYearFrom}
                    onChange={(e) => setFormData({ ...formData, birthYearFrom: e.target.value })}
                    placeholder="ex. 2016"
                    className="w-24 px-3 py-2 rounded-lg focus:outline-none focus:ring-2"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--accent)' } as React.CSSProperties}
                  />
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>à</span>
                  <input
                    type="number"
                    min={1930}
                    max={currentYear}
                    value={formData.birthYearTo}
                    onChange={(e) => setFormData({ ...formData, birthYearTo: e.target.value })}
                    placeholder="ex. 2017"
                    className="w-24 px-3 py-2 rounded-lg focus:outline-none focus:ring-2"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--accent)' } as React.CSSProperties}
                  />
                </div>
                <p className="mt-1 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Basé sur l'âge — glisse automatiquement chaque 1er janvier.</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Max joueurs
                </label>
                <input
                  type="number"
                  min={0}
                  value={formData.max_players}
                  onChange={(e) => setFormData({ ...formData, max_players: e.target.value })}
                  placeholder="Illimité"
                  className="w-32 px-3 py-2 rounded-lg focus:outline-none focus:ring-2"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--accent)' } as React.CSSProperties}
                />
                <p className="mt-1 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>0 ou vide = illimité</p>
              </div>

              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Utilisé pour la liste d'attente des inscriptions : si les équipes de la catégorie atteignent le maximum, les nouvelles demandes passent automatiquement en liste d'attente.
              </p>

              <div className="flex justify-end gap-3 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 transition-colors" style={{ color: 'var(--text-secondary)' }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg transition-colors"
                  style={{ background: 'var(--accent)', color: 'var(--text-inverse)' }}
                >
                  {editingCategory ? 'Enregistrer' : 'Créer'}
                </button>
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
  );
}
