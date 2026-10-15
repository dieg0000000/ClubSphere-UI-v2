import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { Badge } from './ui/Badge';

interface HistoryRow {
  id: string;
  member_id: string;
  kind: 'arrivee' | 'depart' | 'fonction';
  function_role: string | null;
  team_id: string | null;
  team_label: string | null;
  external_club: string | null;
  external_club_asf: string | null;
  date_debut: string;
  date_fin: string | null;
  note: string | null;
  source: 'auto' | 'manual' | 'import';
}

interface Team {
  id: string;
  name: string;
}

const ROLE_LABELS: Record<string, string> = {
  joueur: 'Joueur',
  principal: 'Entraîneur principal',
  assistant: 'Assistant',
  aide_moniteur: 'Aide-moniteur',
  preparateur_physique: 'Préparateur physique',
  entraineur_gardiens: 'Entraîneur des gardiens',
  responsable_equipe: 'Responsable d\'équipe',
  autre: 'Autre',
};

const KIND_OPTIONS = [
  { value: 'arrivee', label: 'Arrivée' },
  { value: 'depart', label: 'Départ' },
  { value: 'fonction', label: 'Fonction' },
] as const;

const ROLE_OPTIONS = [
  { value: 'joueur', label: 'Joueur' },
  { value: 'principal', label: 'Entraîneur principal' },
  { value: 'assistant', label: 'Assistant' },
  { value: 'aide_moniteur', label: 'Aide-moniteur' },
  { value: 'preparateur_physique', label: 'Préparateur physique' },
  { value: 'entraineur_gardiens', label: 'Entraîneur des gardiens' },
  { value: 'responsable_equipe', label: 'Responsable d\'équipe' },
  { value: 'autre', label: 'Autre' },
];

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('fr-CH');
}

interface MemberHistoryTabProps {
  memberId: string;
  readOnly?: boolean;
}

export default function MemberHistoryTab({ memberId, readOnly = false }: MemberHistoryTabProps) {
  const { clubId } = useTenant();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<Team[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<HistoryRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [formKind, setFormKind] = useState<'arrivee' | 'depart' | 'fonction'>('arrivee');
  const [formRole, setFormRole] = useState('joueur');
  const [formTeamId, setFormTeamId] = useState<string | null>(null);
  const [formClub, setFormClub] = useState('');
  const [formDateDebut, setFormDateDebut] = useState('');
  const [formDateFin, setFormDateFin] = useState('');
  const [formNote, setFormNote] = useState('');

  const fetchHistory = async () => {
    const { data } = await supabase
      .from('member_history')
      .select('*')
      .eq('member_id', memberId)
      .order('date_debut', { ascending: false });
    if (data) setRows(data as HistoryRow[]);
    setLoading(false);
  };

  const fetchTeams = async () => {
    if (!clubId) return;
    const { data } = await supabase
      .from('teams')
      .select('id, name, level_rank')
      .eq('club_id', clubId)
      .eq('active', true)
      .order('level_rank')
      .order('name');
    if (data) setTeams(data);
  };

  useEffect(() => {
    fetchHistory();
    if (!readOnly) fetchTeams();
  }, [memberId]);

  const openAdd = () => {
    setEditing(null);
    setFormKind('arrivee');
    setFormRole('joueur');
    setFormTeamId(null);
    setFormClub('');
    setFormDateDebut('');
    setFormDateFin('');
    setFormNote('');
    setShowForm(true);
  };

  const openEdit = (row: HistoryRow) => {
    setEditing(row);
    setFormKind(row.kind);
    setFormRole(row.function_role || 'joueur');
    setFormTeamId(row.team_id);
    setFormClub(row.external_club || '');
    setFormDateDebut(row.date_debut);
    setFormDateFin(row.date_fin || '');
    setFormNote(row.note || '');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formDateDebut) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      member_id: memberId,
      kind: formKind,
      function_role: formKind === 'fonction' ? formRole : null,
      team_id: formKind === 'fonction' ? formTeamId : null,
      external_club: (formKind === 'arrivee' || formKind === 'depart') ? (formClub || null) : null,
      date_debut: formDateDebut,
      date_fin: formKind === 'fonction' ? (formDateFin || null) : null,
      note: formNote || null,
    };
    if (editing) {
      await supabase.from('member_history').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('member_history').insert([payload]);
    }
    setSaving(false);
    setShowForm(false);
    fetchHistory();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    await supabase.from('member_history').delete().eq('id', deleteId);
    setDeleting(false);
    setDeleteId(null);
    fetchHistory();
  };

  const getKindBadge = (kind: string) => {
    switch (kind) {
      case 'arrivee': return <Badge variant="green">Arrivée</Badge>;
      case 'depart': return <Badge variant="neutral">Départ</Badge>;
      case 'fonction': return <Badge variant="sky">Fonction</Badge>;
      default: return <Badge variant="neutral">{kind}</Badge>;
    }
  };

  const getRowText = (row: HistoryRow) => {
    switch (row.kind) {
      case 'arrivee':
        return 'Arrivée au club' + (row.external_club ? ` depuis ${row.external_club}` : '');
      case 'depart':
        return 'Départ du club' + (row.external_club ? ` vers ${row.external_club}` : '');
      case 'fonction': {
        const label = ROLE_LABELS[row.function_role || ''] || row.function_role || 'Fonction';
        return label + (row.team_label ? ` — ${row.team_label}` : '');
      }
      default:
        return '';
    }
  };

  const getPeriod = (row: HistoryRow) => {
    if (row.kind === 'arrivee' || row.kind === 'depart') {
      return `le ${formatDate(row.date_debut)}`;
    }
    if (row.date_fin) {
      return `du ${formatDate(row.date_debut)} au ${formatDate(row.date_fin)}`;
    }
    return `depuis le ${formatDate(row.date_debut)}`;
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    fontSize: '14px',
  };

  if (loading) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
        Chargement…
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--bg-app)', borderRadius: '0 0 12px 12px', padding: '24px', margin: '-24px', marginTop: '0' }}>
      {!readOnly && (
        <div style={{ marginBottom: '16px' }}>
          <button
            onClick={openAdd}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              background: 'var(--accent)', color: 'white', fontWeight: 600, fontSize: '13px',
            }}
          >
            <Plus size={15} /> Ajouter une ligne
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px',
          padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px',
        }}>
          Aucun historique pour ce joueur.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {rows.map(row => (
            <div
              key={row.id}
              style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px',
                padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: '10px',
              }}
            >
              <div style={{ flexShrink: 0, paddingTop: '2px' }}>
                {getKindBadge(row.kind)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {getRowText(row)}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {getPeriod(row)}
                </div>
                {row.note && (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '2px' }}>
                    {row.note}
                  </div>
                )}
                {row.source !== 'manual' && (
                  <span style={{
                    display: 'inline-block', marginTop: '4px',
                    fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)',
                    background: 'var(--bg-hover)', padding: '1px 6px', borderRadius: '4px',
                  }}>
                    {row.source}
                  </span>
                )}
              </div>
              {!readOnly && (
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  <button
                    onClick={() => openEdit(row)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)' }}
                    title="Modifier"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => setDeleteId(row.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--danger)' }}
                    title="Supprimer"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit dialog */}
      {showForm && (
        <>
          <div
            onClick={() => setShowForm(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000 }}
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px',
            padding: '24px', width: '90%', maxWidth: '460px', zIndex: 1001,
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                {editing ? 'Modifier la ligne' : 'Ajouter une ligne'}
              </h3>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Type</label>
                <select value={formKind} onChange={e => setFormKind(e.target.value as 'arrivee' | 'depart' | 'fonction')} style={inputStyle}>
                  {KIND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {formKind === 'fonction' && (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Rôle</label>
                    <select value={formRole} onChange={e => setFormRole(e.target.value)} style={inputStyle}>
                      {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Équipe</label>
                    <select value={formTeamId || ''} onChange={e => setFormTeamId(e.target.value || null)} style={inputStyle}>
                      <option value="">— Aucune —</option>
                      {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                </>
              )}

              {(formKind === 'arrivee' || formKind === 'depart') && (
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    {formKind === 'arrivee' ? 'Club d\'origine' : 'Club de destination'}
                  </label>
                  <input type="text" value={formClub} onChange={e => setFormClub(e.target.value)} style={inputStyle} placeholder="Nom du club" />
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: formKind === 'fonction' ? '1fr 1fr' : '1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>{formKind === 'fonction' ? 'Du *' : 'Date *'}</label>
                  <input type="date" value={formDateDebut} onChange={e => setFormDateDebut(e.target.value)} style={inputStyle} required />
                </div>
                {formKind === 'fonction' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Au</label>
                    <input type="date" value={formDateFin} onChange={e => setFormDateFin(e.target.value)} style={inputStyle} />
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Note</label>
                <textarea value={formNote} onChange={e => setFormNote(e.target.value)} style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button
                onClick={() => setShowForm(false)}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formDateDebut}
                style={{
                  padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                  background: 'var(--accent)', color: 'white', fontSize: '13px', fontWeight: 600,
                  opacity: saving || !formDateDebut ? 0.5 : 1,
                }}
              >
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <>
          <div
            onClick={() => setDeleteId(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000 }}
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px',
            padding: '24px', width: '90%', maxWidth: '380px', zIndex: 1001,
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>
              Supprimer cette ligne ?
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
              Supprimer cette ligne de l'historique ?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setDeleteId(null)}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: deleting ? 'not-allowed' : 'pointer',
                  background: 'var(--danger)', color: 'white', fontSize: '13px', fontWeight: 600,
                  opacity: deleting ? 0.5 : 1,
                }}
              >
                {deleting ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
