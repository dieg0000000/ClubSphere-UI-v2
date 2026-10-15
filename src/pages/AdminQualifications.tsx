import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, CreditCard as Edit2, Trash2, ChevronUp, ChevronDown, X, Pencil, GraduationCap } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';
import { useModuleAccess } from '../hooks/useModuleAccess';
import useEscapeKey from '../hooks/useEscapeKey';
import { Badge } from '../components/ui/Badge';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import Button from '../components/ui/Button';

interface Qualification {
  id: string;
  name: string;
  description: string;
  display_order: number;
  active: boolean;
  validity_years: number | null;
}

export default function AdminQualifications() {
  const { canEdit } = useModuleAccess('qualifications');
  const [viewingQual, setViewingQual] = useState<Qualification | null>(null);
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingQual, setEditingQual] = useState<Qualification | null>(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    active: boolean;
    validity_years: number | '';
  }>({
    name: '',
    description: '',
    active: true,
    validity_years: ''
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

  const handleCloseModal = useCallback(() => setShowModal(false), []);
  const handleCloseDetail = useCallback(() => setViewingQual(null), []);

  useEscapeKey(handleCloseModal);
  useEscapeKey(handleCloseDetail);

  useEffect(() => { document.title = 'Qualifications - ClubSphere' }, [])

  useEffect(() => {
    loadQualifications();
  }, []);

  async function loadQualifications() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('coaching_qualifications')
        .select('*')
        .order('display_order');

      if (error) {
        console.error('Error loading qualifications:', error);
      } else if (data) {
        setQualifications(data);
      }
    } catch (err) {
      console.error('Unexpected error loading qualifications:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const payload = {
      name: formData.name,
      description: formData.description,
      active: formData.active,
      validity_years: formData.validity_years === '' ? null : Number(formData.validity_years)
    };

    if (editingQual) {
      const { error } = await supabase
        .from('coaching_qualifications')
        .update(payload)
        .eq('id', editingQual.id);

      if (error) {
        showToast('Erreur: ' + error.message, 'error');
        return;
      }
    } else {
      const maxOrder = qualifications.length > 0
        ? Math.max(...qualifications.map(q => q.display_order))
        : 0;

      const { error } = await supabase
        .from('coaching_qualifications')
        .insert([{ ...payload, display_order: maxOrder + 1 }]);

      if (error) {
        showToast('Erreur: ' + error.message, 'error');
        return;
      }
    }

    setShowModal(false);
    resetForm();
    loadQualifications();
  }

  async function handleDelete(id: string) {
    const { data: coaches } = await supabase
      .from('coaches')
      .select('id')
      .eq('qualification_id', id)
      .limit(1);

    if (coaches && coaches.length > 0) {
      showToast('Impossible de supprimer: cette qualification est utilisée par des entraîneurs', 'warning');
      return;
    }

    showConfirm({
      title: 'Supprimer la qualification',
      message: 'Êtes-vous sûr de vouloir supprimer cette qualification ?',
      confirmLabel: 'Oui, supprimer',
      cancelLabel: 'Non',
      confirmStyle: 'danger',
      onConfirm: async () => {
        hideConfirm();
        const { error } = await supabase
          .from('coaching_qualifications')
          .delete()
          .eq('id', id);

        if (error) {
          showToast('Erreur: ' + error.message, 'error');
          return;
        }

        loadQualifications();
      }
    });
  }

  async function moveQualification(id: string, direction: 'up' | 'down') {
    const index = qualifications.findIndex(q => q.id === id);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === qualifications.length - 1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    const newQualifications = [...qualifications];
    [newQualifications[index], newQualifications[newIndex]] = [newQualifications[newIndex], newQualifications[index]];

    const updates = newQualifications.map((qual, idx) => ({
      id: qual.id,
      display_order: idx + 1
    }));

    for (const update of updates) {
      await supabase
        .from('coaching_qualifications')
        .update({ display_order: update.display_order })
        .eq('id', update.id);
    }

    loadQualifications();
  }

  async function toggleActive(id: string, active: boolean) {
    await supabase
      .from('coaching_qualifications')
      .update({ active: !active })
      .eq('id', id);

    loadQualifications();
  }

  function openModal(qual?: Qualification) {
    if (qual) {
      setEditingQual(qual);
      setFormData({
        name: qual.name,
        description: qual.description || '',
        active: qual.active,
        validity_years: qual.validity_years ?? ''
      });
    } else {
      resetForm();
    }
    setShowModal(true);
  }

  function resetForm() {
    setEditingQual(null);
    setFormData({
      name: '',
      description: '',
      active: true,
      validity_years: ''
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--accent)]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6" style={{ background: 'var(--bg-page)' }}>
      <div className="w-full mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
              <GraduationCap className="w-5 h-5" />
              Qualifications
            </h1>
            <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>Diplômes et licences</p>
          </div>
          {canEdit && (
            <Button onClick={() => openModal()} leftIcon={<Plus className="w-5 h-5" />}>
              Nouvelle qualification
            </Button>
          )}
        </div>

        <div className="rounded-lg shadow-xl overflow-hidden" style={{ background: 'var(--bg-card)' }}>
          <style>{`
            .qualifications-stickhead thead th {
              position: sticky; top: 0; z-index: 2;
              background: var(--table-header-bg);
              border-bottom: 1px solid var(--border-color);
            }
            .qualifications-stickhead thead th::after {
              content: ''; position: absolute; left: 0; right: 0; bottom: -8px; height: 8px;
              pointer-events: none;
              background: linear-gradient(to bottom, rgba(0,0,0,0.28), rgba(0,0,0,0));
            }
          `}</style>
          <div className="overflow-x-auto" style={{ width: '100%', maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
            <table className="qualifications-stickhead w-full" style={{ minWidth: '600px' }}>
              <thead style={{ background: 'var(--table-header-bg)' }}>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ width: '80px', color: 'var(--text-secondary)' }}>
                    Ordre
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ flex: '1', color: 'var(--text-secondary)' }}>
                    Nom
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ flex: '1', color: 'var(--text-secondary)' }}>
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ width: '110px', color: 'var(--text-secondary)' }}>
                    Validité
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
                {qualifications.map((qual, index) => (
                  <tr key={qual.id} className="hover:bg-[var(--bg-hover)] cursor-pointer" onClick={() => setViewingQual(qual)}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: 'var(--text-primary)' }} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {canEdit ? (
                          <>
                            <button
                              onClick={() => moveQualification(qual.id, 'up')}
                              disabled={index === 0}
                              className="p-1 disabled:opacity-30"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => moveQualification(qual.id, 'down')}
                              disabled={index === qualifications.length - 1}
                              className="p-1 disabled:opacity-30"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <span className="px-2" style={{ color: 'var(--text-muted)' }}>{qual.display_order}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm" style={{ color: 'var(--text-primary)' }}>
                      {qual.name}
                    </td>
                    <td className="px-6 py-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {qual.description || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {qual.validity_years == null
                        ? '—'
                        : `${qual.validity_years} an${qual.validity_years > 1 ? 's' : ''}`}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm" onClick={(e) => e.stopPropagation()}>
                      {canEdit ? (
                        <button
                          onClick={() => toggleActive(qual.id, qual.active)}
                          className={`badge ${qual.active ? 'badge-green' : 'badge-neutral'}`}
                          style={{ cursor: 'pointer' }}
                        >
                          {qual.active ? 'Actif' : 'Inactif'}
                        </button>
                      ) : (
                        <Badge variant={qual.active ? 'green' : 'neutral'}>
                          {qual.active ? 'Actif' : 'Inactif'}
                        </Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium" onClick={(e) => e.stopPropagation()}>
                      {canEdit && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openModal(qual)}
                            style={{ color: 'var(--accent)' }} className="hover:opacity-80"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleDelete(qual.id)}
                            style={{ color: 'var(--danger)' }} className="hover:opacity-80"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="rounded-xl w-full max-h-[90vh] overflow-y-auto" style={{ maxWidth: '580px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div
              className="sticky top-0 flex items-center justify-between px-6 py-4 rounded-t-xl"
              style={{ background: 'var(--bg-modal-header)' }}
            >
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-modal-header)' }}>
                {editingQual ? 'Modifier la qualification' : 'Nouvelle qualification'}
              </h2>
              <button onClick={() => setShowModal(false)} className="hover:opacity-80 transition-opacity" style={{ color: 'var(--text-modal-header)' }}>
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Nom *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg focus:outline-none"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg focus:outline-none resize-y"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Validité (années)
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  step={1}
                  placeholder="Ex: 2"
                  value={formData.validity_years}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFormData({ ...formData, validity_years: v === '' ? '' : Number(v) });
                  }}
                  className="w-full px-3 py-2 rounded-lg focus:outline-none"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Laisser vide si le diplôme n'a pas de date d'expiration. Ex: 2 pour J+S.
                </p>
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

              <div className="flex justify-end gap-3 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
                <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
                  Annuler
                </Button>
                <Button type="submit">
                  {editingQual ? 'Enregistrer' : 'Créer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewingQual && !showModal && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setViewingQual(null)} />
          <div className="fixed right-0 top-0 h-full z-50 overflow-y-auto" style={{ width: '600px', background: 'var(--bg-card)', borderLeft: '1px solid var(--border-color)' }}>
            <div className="sticky top-0 px-6 py-4 flex items-center justify-between" style={{ background: 'var(--bg-modal-header)' }}>
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-modal-header)' }}>{viewingQual.name}</h2>
              <button onClick={() => setViewingQual(null)} className="hover:opacity-80" style={{ color: 'var(--text-modal-header)' }}>
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div>
                <div className="mb-1" style={{ color: 'var(--text-secondary)' }}>Description</div>
                <div style={{ color: 'var(--text-primary)' }}>{viewingQual.description || '-'}</div>
              </div>
              <div>
                <div className="mb-1" style={{ color: 'var(--text-secondary)' }}>Validité</div>
                <div style={{ color: 'var(--text-primary)' }}>
                  {viewingQual.validity_years == null
                    ? '—'
                    : `${viewingQual.validity_years} an${viewingQual.validity_years > 1 ? 's' : ''}`}
                </div>
              </div>
              <div>
                <div className="mb-1" style={{ color: 'var(--text-secondary)' }}>Statut</div>
                <Badge variant={viewingQual.active ? 'green' : 'neutral'}>
                  {viewingQual.active ? 'Actif' : 'Inactif'}
                </Badge>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <Button variant="secondary" onClick={() => setViewingQual(null)}>
                Fermer
              </Button>
              {canEdit && (
                <Button
                  onClick={() => { openModal(viewingQual); setViewingQual(null); }}
                  leftIcon={<Pencil size={16} />}
                >
                  Modifier
                </Button>
              )}
            </div>
          </div>
        </>
      )}

      <ConfirmModal
        {...confirmState}
        onCancel={hideConfirm}
      />
      <Toast toast={toast} />
    </div>
  );
}
