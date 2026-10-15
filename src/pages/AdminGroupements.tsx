import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, Pencil, X, Save } from 'lucide-react';
import { useConfirmModal } from '../hooks/useConfirmModal';
import ConfirmModal from '../components/ConfirmModal';
import Button from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';

type CategoryType = 'hommes_actifs' | 'juniors' | 'juniors_filles' | 'seniors' | 'femmes_actives' | 'autre';

const CATEGORY_LABELS: Record<CategoryType, string> = {
  hommes_actifs: 'Hommes actifs',
  juniors: 'Juniors',
  juniors_filles: 'Juniors filles',
  seniors: 'Seniors',
  femmes_actives: 'Femmes actives',
  autre: 'Autre',
};

const MAX_TOTAL_CLUBS: Record<CategoryType, number> = {
  hommes_actifs: 2,
  juniors: 6,
  juniors_filles: 6,
  seniors: 6,
  femmes_actives: 6,
  autre: 6,
};

interface Season { id: string; name: string; active: boolean }

interface PartnerClub {
  id?: string;
  club_asf_number: string;
  club_name: string;
}

interface Groupement {
  id: string;
  name: string | null;
  category_type: CategoryType;
  season_id: string | null;
  managing_club_asf_number: string | null;
  is_responsible_club: boolean;
  notes: string | null;
  seasons?: { name: string } | null;
  groupement_clubs?: (PartnerClub & { is_managing?: boolean })[];
}

interface ClubSettings {
  club_name: string | null;
  club_asf_number: string | null;
}

function composeDisplayName(
  g: Groupement,
  ourClubName: string | null,
  partners: PartnerClub[]
): string {
  const our = ourClubName ?? 'Notre club';
  const partnerNames = partners.map(p => p.club_name).filter(Boolean);
  const auto = `Groupement ${[our, ...partnerNames].join(' + ')}`;
  if (g.name && g.name.trim()) {
    const detail = [our, ...partnerNames].join(', ');
    return `${g.name.trim()} (${detail})`;
  }
  return auto;
}

export default function AdminGroupements() {
  const [groupements, setGroupements] = useState<Groupement[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [clubSettings, setClubSettings] = useState<ClubSettings>({ club_name: null, club_asf_number: null });
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Groupement | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const { confirmState, showConfirm, hideConfirm } = useConfirmModal();

  const [form, setForm] = useState<{
    name: string;
    category_type: CategoryType;
    season_id: string;
    is_responsible_club: boolean;
    responsible_asf_number: string;
    notes: string;
    partners: PartnerClub[];
  }>({
    name: '',
    category_type: 'juniors',
    season_id: '',
    is_responsible_club: true,
    responsible_asf_number: '',
    notes: '',
    partners: [{ club_asf_number: '', club_name: '' }],
  });

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    document.title = 'Groupements - ClubSphere';
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [gRes, sRes, csRes] = await Promise.all([
      supabase
        .from('groupements')
        .select('*, seasons(name), groupement_clubs(*)')
        .order('created_at', { ascending: false }),
      supabase.from('seasons').select('id, name, active').order('name', { ascending: false }),
      supabase.from('club_settings').select('club_name, club_asf_number').maybeSingle(),
    ]);
    if (!gRes.error) setGroupements((gRes.data as Groupement[]) ?? []);
    if (!sRes.error) setSeasons((sRes.data as Season[]) ?? []);
    if (!csRes.error && csRes.data) setClubSettings(csRes.data as ClubSettings);
    setLoading(false);
  };

  const ourClubName = clubSettings.club_name ?? 'Notre club';
  const ourAsfNumber = clubSettings.club_asf_number ?? '';

  const openCreate = () => {
    const activeSeason = seasons.find(s => s.active);
    setEditing(null);
    setForm({
      name: '',
      category_type: 'juniors',
      season_id: activeSeason?.id ?? '',
      is_responsible_club: true,
      responsible_asf_number: '',
      notes: '',
      partners: [{ club_asf_number: '', club_name: '' }],
    });
    setModalOpen(true);
  };

  const openEdit = (g: Groupement) => {
    setEditing(g);
    const partners = (g.groupement_clubs ?? [])
      .filter(c => !ourAsfNumber || c.club_asf_number !== ourAsfNumber)
      .map(c => ({ id: c.id, club_asf_number: c.club_asf_number, club_name: c.club_name }));
    setForm({
      name: g.name ?? '',
      category_type: g.category_type,
      season_id: g.season_id ?? '',
      is_responsible_club: g.is_responsible_club ?? true,
      responsible_asf_number: g.is_responsible_club ? '' : (g.managing_club_asf_number ?? ''),
      notes: g.notes ?? '',
      partners: partners.length > 0 ? partners : [{ club_asf_number: '', club_name: '' }],
    });
    setModalOpen(true);
  };

  const maxTotal = MAX_TOTAL_CLUBS[form.category_type];
  const maxPartners = maxTotal - 1;

  const addPartner = () => {
    if (form.partners.length >= maxPartners) return;
    setForm(prev => ({
      ...prev,
      partners: [...prev.partners, { club_asf_number: '', club_name: '' }],
    }));
  };

  const removePartner = (idx: number) => {
    setForm(prev => ({
      ...prev,
      partners: prev.partners.filter((_, i) => i !== idx),
    }));
  };

  const updatePartner = (idx: number, field: keyof PartnerClub, value: string) => {
    setForm(prev => ({
      ...prev,
      partners: prev.partners.map((p, i) => (i === idx ? { ...p, [field]: value } : p)),
    }));
  };

  const errors = useMemo(() => {
    const e: string[] = [];
    if (!ourAsfNumber) e.push("Le numéro ASF de votre club n'est pas configuré (Paramètres).");
    const validPartners = form.partners.filter(p => p.club_asf_number.trim() && p.club_name.trim());
    if (validPartners.length < 1) e.push('Au moins 1 club partenaire est requis.');
    if (validPartners.length > maxPartners)
      e.push(`Maximum ${maxPartners} club(s) partenaire(s) pour la catégorie ${CATEGORY_LABELS[form.category_type]}.`);
    const nums = [ourAsfNumber, ...validPartners.map(p => p.club_asf_number.trim())].filter(Boolean);
    if (new Set(nums).size !== nums.length)
      e.push('Les numéros ASF doivent être uniques (votre club ne peut pas être dans la liste des partenaires).');
    if (!form.is_responsible_club) {
      if (!form.responsible_asf_number)
        e.push('Sélectionnez le club partenaire responsable administratif.');
      else if (!validPartners.some(p => p.club_asf_number.trim() === form.responsible_asf_number))
        e.push('Le club responsable doit faire partie des partenaires.');
    }
    return e;
  }, [form, maxPartners, ourAsfNumber]);

  const handleSave = async () => {
    if (errors.length > 0) {
      showToast(errors[0], 'error');
      return;
    }
    const validPartners = form.partners.filter(p => p.club_asf_number.trim() && p.club_name.trim());

    const managing_club_asf_number = form.is_responsible_club
      ? ourAsfNumber
      : form.responsible_asf_number;

    const payload = {
      name: form.name.trim() || null,
      category_type: form.category_type,
      season_id: form.season_id || null,
      managing_club_asf_number: managing_club_asf_number || null,
      is_responsible_club: form.is_responsible_club,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    let groupementId = editing?.id;
    if (editing) {
      const { error } = await supabase.from('groupements').update(payload).eq('id', editing.id);
      if (error) { showToast('Erreur: ' + error.message, 'error'); return; }
      await supabase.from('groupement_clubs').delete().eq('groupement_id', editing.id);
    } else {
      const { data, error } = await supabase.from('groupements').insert(payload).select('id').maybeSingle();
      if (error || !data) { showToast('Erreur: ' + (error?.message ?? 'inconnue'), 'error'); return; }
      groupementId = data.id;
    }

    if (groupementId) {
      const rows = validPartners.map(p => ({
        groupement_id: groupementId!,
        club_asf_number: p.club_asf_number.trim(),
        club_name: p.club_name.trim(),
        is_managing: !form.is_responsible_club && p.club_asf_number.trim() === form.responsible_asf_number,
      }));
      if (rows.length > 0) {
        const { error: clubsErr } = await supabase.from('groupement_clubs').insert(rows);
        if (clubsErr) { showToast('Erreur clubs: ' + clubsErr.message, 'error'); return; }
      }
    }

    setModalOpen(false);
    showToast(editing ? 'Groupement modifié' : 'Groupement créé');
    fetchAll();
  };

  const handleDelete = (g: Groupement) => {
    showConfirm({
      title: 'Supprimer le groupement',
      message: `Supprimer ce groupement ? Les joueurs rattachés ne seront plus liés à ce groupement.`,
      confirmStyle: 'danger',
      confirmLabel: 'Supprimer',
      onConfirm: async () => {
        hideConfirm();
        const { error } = await supabase.from('groupements').delete().eq('id', g.id);
        if (error) { showToast('Erreur: ' + error.message, 'error'); return; }
        showToast('Groupement supprimé');
        fetchAll();
      }
    });
  };

  const validPartnersForResp = form.partners.filter(p => p.club_asf_number.trim() && p.club_name.trim());

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>
      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 1000,
          background: toast.type === 'success' ? 'var(--success)' : 'var(--danger)',
          color: 'var(--text-inverse)', padding: '12px 20px', borderRadius: 8, fontWeight: 500,
        }}>{toast.message}</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 className="text-2xl font-bold" style={{ marginBottom: 8, color: 'var(--text-primary)' }}>Groupements ASF</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            Gérez les groupements inter-clubs conformément aux règles ASF/SFV.
          </p>
        </div>
        <Button onClick={openCreate} leftIcon={<Plus className="w-4 h-4" />}>
          Nouveau groupement
        </Button>
      </div>

      <Alert variant="info" title="Règles ASF" className="mb-6">
        Hommes actifs : 2 clubs au total (1 partenaire). Juniors, juniors filles, seniors, femmes actives : jusqu'à 6 clubs au total (5 partenaires). Votre club est inclus automatiquement.
      </Alert>

      {!ourAsfNumber && (
        <Alert variant="warning" className="mb-6">
          Numéro ASF de votre club non configuré. Veuillez le renseigner dans les paramètres du club.
        </Alert>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Chargement...</div>
      ) : groupements.length === 0 ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: 12, padding: 48, textAlign: 'center', color: 'var(--text-muted)',
        }}>
          Aucun groupement pour l'instant.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {groupements.map(g => {
            const partners = (g.groupement_clubs ?? [])
              .filter(c => !ourAsfNumber || c.club_asf_number !== ourAsfNumber);
            const displayName = composeDisplayName(g, ourClubName, partners);
            const responsible = g.is_responsible_club
              ? ourClubName
              : partners.find(p => p.club_asf_number === g.managing_club_asf_number)?.club_name
                ?? (g.managing_club_asf_number ?? '—');
            return (
              <div key={g.id} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                borderRadius: 12, padding: 20,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                      <h3 style={{ color: 'var(--text-primary)', fontSize: 17, fontWeight: 600 }}>{displayName}</h3>
                      <span style={{
                        background: 'var(--success-soft)', color: 'var(--success-text)',
                        padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                      }}>{CATEGORY_LABELS[g.category_type]}</span>
                      {g.seasons?.name && (
                        <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Saison {g.seasons.name}</span>
                      )}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 8 }}>
                      <strong>Club responsable :</strong> {responsible}
                    </div>
                    {partners.length > 0 && (
                      <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
                        <strong>Partenaires :</strong>{' '}
                        {partners.map((c, i) => (
                          <span key={c.id ?? i}>
                            {i > 0 && ' · '}
                            {c.club_name} ({c.club_asf_number})
                          </span>
                        ))}
                      </div>
                    )}
                    {g.notes && <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 8 }}>{g.notes}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => openEdit(g)} style={iconBtn('var(--accent)')}>
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(g)} style={iconBtn('var(--danger)')}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmModal {...confirmState} onCancel={hideConfirm} />

      {modalOpen && (
        <div style={overlayStyle} onClick={() => setModalOpen(false)}>
          <div style={modalStyle} onClick={e => e.stopPropagation()}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 24px', background: 'var(--bg-modal-header)', flexShrink: 0,
            }}>
              <h2 style={{ color: 'var(--text-modal-header)', fontSize: 16, fontWeight: 700, margin: 0 }}>
                {editing ? 'Modifier le groupement' : 'Nouveau groupement'}
              </h2>
              <button onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-modal-header)', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex' }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div style={{ padding: 24, overflowY: 'auto', display: 'grid', gap: 14 }}>
              <div style={{
                background: 'var(--success-soft)', border: '1px solid var(--success)',
                borderRadius: 8, padding: 10, color: 'var(--text-secondary)', fontSize: 12,
              }}>
                Votre club <strong style={{ color: 'var(--success-text)' }}>{ourClubName}</strong>
                {ourAsfNumber && <> (ASF {ourAsfNumber})</>} est inclus automatiquement dans ce groupement.
              </div>

              <Field label="Nom personnalisé (optionnel)">
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  style={inputStyle} placeholder="Laissez vide pour un nom automatique" />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Catégorie *">
                  <select value={form.category_type}
                    onChange={e => setForm({ ...form, category_type: e.target.value as CategoryType })}
                    style={inputStyle}>
                    {(Object.keys(CATEGORY_LABELS) as CategoryType[]).map(k => (
                      <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Saison">
                  <select value={form.season_id} onChange={e => setForm({ ...form, season_id: e.target.value })}
                    style={inputStyle}>
                    <option value="">—</option>
                    {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 500 }}>
                    Clubs partenaires ({form.partners.length} / {maxPartners})
                  </label>
                  <button onClick={addPartner} disabled={form.partners.length >= maxPartners}
                    style={{
                      background: 'var(--success-soft)', color: 'var(--success-text)',
                      border: '1px solid var(--success)', borderRadius: 6,
                      padding: '4px 10px', fontSize: 12, fontWeight: 600,
                      cursor: form.partners.length >= maxPartners ? 'not-allowed' : 'pointer',
                      opacity: form.partners.length >= maxPartners ? 0.5 : 1,
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                    <Plus className="w-3 h-3" /> Ajouter un partenaire
                  </button>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: 11, marginBottom: 8 }}>
                  Ajoutez les clubs partenaires de ce groupement (votre club est inclus automatiquement).
                </p>
                <div style={{ display: 'grid', gap: 8 }}>
                  {form.partners.map((p, idx) => (
                    <div key={idx} style={{
                      display: 'grid', gridTemplateColumns: '140px 1fr auto', gap: 8, alignItems: 'center',
                      background: 'var(--bg-hover)', border: '1px solid var(--border-color)',
                      borderRadius: 8, padding: 8,
                    }}>
                      <input value={p.club_asf_number}
                        onChange={e => updatePartner(idx, 'club_asf_number', e.target.value.replace(/\D/g, '').slice(0, 10))}
                        style={inputStyle} placeholder="N° ASF" />
                      <input value={p.club_name}
                        onChange={e => updatePartner(idx, 'club_name', e.target.value)}
                        style={inputStyle} placeholder="Nom du club partenaire" />
                      <button onClick={() => removePartner(idx)}
                        disabled={form.partners.length <= 1}
                        style={iconBtn('var(--danger)', form.partners.length <= 1)}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{
                background: 'var(--bg-hover)', border: '1px solid var(--border-color)',
                borderRadius: 8, padding: 12,
              }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.is_responsible_club}
                    onChange={e => setForm({ ...form, is_responsible_club: e.target.checked, responsible_asf_number: '' })} />
                  Notre club est responsable administratif
                </label>
                {!form.is_responsible_club && (
                  <div style={{ marginTop: 10 }}>
                    <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: 12, marginBottom: 4 }}>
                      Club partenaire responsable *
                    </label>
                    <select value={form.responsible_asf_number}
                      onChange={e => setForm({ ...form, responsible_asf_number: e.target.value })}
                      style={inputStyle}>
                      <option value="">— Sélectionner —</option>
                      {validPartnersForResp.map(p => (
                        <option key={p.club_asf_number} value={p.club_asf_number}>
                          {p.club_name} ({p.club_asf_number})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <Field label="Notes">
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} />
              </Field>

              {errors.length > 0 && (
                <Alert variant="danger">
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {errors.map((err, i) => <li key={i}>{err}</li>)}
                  </ul>
                </Alert>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>Annuler</Button>
                <Button size="sm" onClick={handleSave} disabled={errors.length > 0} leftIcon={<Save className="w-4 h-4" />}>
                  Enregistrer
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-input)',
  border: '1px solid var(--border-color)',
  borderRadius: 8,
  padding: '8px 12px',
  color: 'var(--text-primary)',
  fontSize: 13,
};

const iconBtn = (color: string, disabled = false): React.CSSProperties => ({
  background: 'transparent',
  border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
  color,
  borderRadius: 6,
  padding: 6,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.4 : 1,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
});

const overlayStyle: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.6)',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20,
};

const modalStyle: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border-color)',
  borderRadius: 12, maxWidth: 720, width: '100%',
  maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
};
