import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { invokeFunction } from '../lib/invokeFunction';
import { X, User, ChevronLeft, Send } from 'lucide-react';
import SearchInput from './ui/SearchInput';
import Button from './ui/Button';
import { useTenant } from '../context/TenantContext';

export interface PersonResult {
  id: string;
  full_name: string;
  email: string | null;
  photo_url: string | null;
  source: 'member' | 'coach' | 'committee' | 'supporter' | 'referee';
  source_label: string;
  suggested_role: string;
}

interface GroupedPerson {
  key: string;
  full_name: string;
  email: string | null;
  photo_url: string | null;
  source_labels: { source: PersonResult['source']; label: string }[];
  primary: PersonResult;
}

const SOURCE_PRIORITY: Record<string, number> = { committee: 0, coach: 1, member: 2, supporter: 3, referee: 4 };

function groupByEmail(results: PersonResult[]): GroupedPerson[] {
  const groups = new Map<string, PersonResult[]>();
  const noEmail: PersonResult[] = [];

  for (const r of results) {
    if (!r.email?.trim()) { noEmail.push(r); continue; }
    const key = r.email.trim().toLowerCase();
    const arr = groups.get(key);
    if (arr) arr.push(r); else groups.set(key, [r]);
  }

  const out: GroupedPerson[] = [];

  for (const [key, items] of groups) {
    items.sort((a, b) => (SOURCE_PRIORITY[a.source] ?? 9) - (SOURCE_PRIORITY[b.source] ?? 9));
    const seen = new Set<string>();
    const labels: GroupedPerson['source_labels'] = [];
    for (const it of items) {
      if (!seen.has(it.source)) { seen.add(it.source); labels.push({ source: it.source, label: it.source_label }); }
    }
    const primary = items[0];
    out.push({ key, full_name: primary.full_name, email: primary.email, photo_url: primary.photo_url, source_labels: labels, primary });
  }

  for (const r of noEmail) {
    out.push({ key: `no-email-${r.source}-${r.id}`, full_name: r.full_name, email: null, photo_url: r.photo_url, source_labels: [{ source: r.source, label: r.source_label }], primary: r });
  }

  return out;
}

interface Props {
  onClose: () => void;
  onSuccess: () => void;
  preselected?: PersonResult;
  lockRole?: boolean;
}

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'committee', label: 'Comité' },
  { value: 'coach', label: 'Entraîneur' },
  { value: 'member', label: 'Membre' },
  { value: 'player', label: 'Joueur' },
  { value: 'supporter', label: 'Supporter' },
  { value: 'referee', label: 'Arbitre' },
];

function mapCommitteeRoleToAppRole(role: string | null): string {
  if (!role) return 'committee';
  const r = role.toLowerCase();
  if (r.includes('président') || r.includes('president')) {
    if (r.includes('vice')) return 'vice_president';
    return 'president';
  }
  if (r.includes('admin')) return 'admin';
  return 'committee';
}

export default function CreateUserModal({ onClose, onSuccess, preselected, lockRole }: Props) {
  const [step, setStep] = useState<1 | 2>(preselected ? 2 : 1);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GroupedPerson[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PersonResult | null>(preselected ?? null);
  const [selectedLabels, setSelectedLabels] = useState<GroupedPerson['source_labels']>(
    preselected ? [{ source: preselected.source, label: preselected.source_label }] : []
  );

  const [email, setEmail] = useState(preselected?.email || '');
  const [role, setRole] = useState(preselected?.suggested_role || '');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const { clubId } = useTenant();

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => doSearch(query.trim()), 300);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [query]);

  const doSearch = async (q: string) => {
    setSearching(true);
    const term = `%${q}%`;
    const [membersRes, coachesRes, committeeRes, supportersRes, refereesRes] = await Promise.all([
      supabase
        .from('members')
        .select('id, first_name, last_name, email, photo_url')
        .or(`first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},legal_rep1_email.ilike.${term},legal_rep2_email.ilike.${term}`)
        .limit(10),
      supabase
        .from('coaches')
        .select('id, first_name, last_name, email, avatar_url')
        .or(`first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term}`)
        .limit(10),
      supabase
        .from('committee_members')
        .select('id, first_name, last_name, email, profile_photo_url, role')
        .or(`first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term}`)
        .limit(10),
      supabase
        .from('supporters')
        .select('id, first_name, last_name, email')
        .or(`first_name.ilike.${term},last_name.ilike.${term}`)
        .limit(10),
      supabase
        .from('referees')
        .select('id, first_name, last_name, email')
        .or(`first_name.ilike.${term},last_name.ilike.${term}`)
        .limit(10),
    ]);

    if (membersRes.error) console.error('CreateUserModal: members query failed', membersRes.error);
    if (coachesRes.error) console.error('CreateUserModal: coaches query failed', coachesRes.error);
    if (committeeRes.error) console.error('CreateUserModal: committee_members query failed', committeeRes.error);
    if (supportersRes.error) console.error('CreateUserModal: supporters query failed', supportersRes.error);
    if (refereesRes.error) console.error('CreateUserModal: referees query failed', refereesRes.error);

    const combined: PersonResult[] = [];

    for (const m of membersRes.data || []) {
      combined.push({
        id: m.id,
        full_name: `${m.first_name} ${m.last_name}`.trim(),
        email: m.email,
        photo_url: m.photo_url,
        source: 'member',
        source_label: 'Joueur',
        suggested_role: 'member',
      });
    }

    for (const c of coachesRes.data || []) {
      combined.push({
        id: c.id,
        full_name: `${c.first_name} ${c.last_name}`.trim(),
        email: c.email,
        photo_url: c.avatar_url,
        source: 'coach',
        source_label: 'Entraîneur',
        suggested_role: 'coach',
      });
    }

    for (const cm of committeeRes.data || []) {
      combined.push({
        id: cm.id,
        full_name: `${cm.first_name} ${cm.last_name}`.trim(),
        email: cm.email,
        photo_url: cm.profile_photo_url,
        source: 'committee',
        source_label: 'Comité',
        suggested_role: mapCommitteeRoleToAppRole(cm.role),
      });
    }

    for (const s of supportersRes.data || []) {
      combined.push({
        id: s.id,
        full_name: `${s.first_name} ${s.last_name}`.trim(),
        email: s.email,
        photo_url: null,
        source: 'supporter',
        source_label: 'Supporter',
        suggested_role: 'supporter',
      });
    }

    for (const r of refereesRes.data || []) {
      combined.push({
        id: r.id,
        full_name: `${r.first_name} ${r.last_name}`.trim(),
        email: r.email,
        photo_url: null,
        source: 'referee',
        source_label: 'Arbitre',
        suggested_role: 'referee',
      });
    }

    setResults(groupByEmail(combined));
    setSearching(false);
  };

  const handleSelect = (group: GroupedPerson) => {
    setSelected(group.primary);
    setSelectedLabels(group.source_labels);
    setEmail(group.email || '');
    setRole(group.primary.suggested_role);
    setFormError(null);
    setStep(2);
  };

  const handleBack = () => {
    setStep(1);
    setSelected(null);
    setFormError(null);
    setSuccessMsg(null);
  };

  const handleSendInvite = async () => {
    if (!selected) return;
    setFormError(null);

    if (!email.trim()) { setFormError("L'email est requis."); return; }

    const nameParts = selected.full_name.trim().split(/\s+/);
    const first_name = nameParts[0] || '';
    const last_name = nameParts.slice(1).join(' ') || '';

    setCreating(true);
    try {
      const { data, error } = await invokeFunction('send-user-invite', {
        body: {
          club_id: clubId,
          email: email.trim(),
          role,
          first_name,
          last_name,
          source_type: selected.source,
          source_id: selected.id,
        },
      });

      if (error || data?.error) {
        setFormError(data?.error || error || "Erreur lors de l'envoi de l'invitation.");
        return;
      }

      setSuccessMsg(`Invitation envoyée à ${email.trim()}`);
      onSuccess();
    } catch (err: any) {
      setFormError(err.message || 'Erreur inattendue.');
    } finally {
      setCreating(false);
    }
  };

  const sourceColors: Record<string, string> = {
    member: 'bg-[var(--info-soft)] text-[var(--info-text)]',
    coach: 'bg-[var(--success-soft)] text-[var(--success-text)]',
    committee: 'bg-[var(--warning-soft)] text-[var(--warning-text)]',
    supporter: 'bg-[var(--sky-soft)] text-[var(--sky-text)]',
    referee: 'bg-[var(--danger-soft)] text-[var(--danger-text)]',
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-xl w-full max-w-lg shadow-2xl" style={{ background: 'var(--bg-modal)', border: '1px solid var(--border-color)' }}>
        <div className="flex items-center justify-between px-6 py-4 rounded-t-xl" style={{ backgroundColor: 'var(--bg-modal-header)' }}>
          <div className="flex items-center gap-3">
            {step === 2 && !successMsg && !preselected && (
              <button onClick={handleBack} className="hover:opacity-80 transition-opacity" style={{ color: 'var(--text-modal-header)' }}>
                <ChevronLeft size={20} />
              </button>
            )}
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-modal-header)' }}>Créer un accès</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-modal-header)', opacity: 0.8 }}>
                {step === 1 ? 'Étape 1 — Trouver la personne' : "Étape 2 — Envoyer l'invitation"}
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={creating} className="hover:opacity-80 transition-opacity disabled:opacity-50" style={{ color: 'var(--text-modal-header)' }}>
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {successMsg ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'var(--success-soft)' }}>
                <Send className="w-7 h-7" style={{ color: 'var(--success-text)' }} />
              </div>
              <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{successMsg}</p>
              <button
                onClick={onClose}
                className="mt-2 px-6 py-2 rounded-lg transition-colors text-sm" style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
              >
                Fermer
              </button>
            </div>
          ) : step === 1 ? (
            <div className="space-y-4">
              <SearchInput
                autoFocus
                value={query}
                onChange={setQuery}
                inputSize="sm"
                placeholder="Rechercher une personne..."
              />

              <div className="min-h-[220px] max-h-[320px] overflow-y-auto space-y-1">
                {searching && (
                  <p className="text-center text-sm py-8" style={{ color: 'var(--text-secondary)' }}>Recherche...</p>
                )}
                {!searching && query && results.length === 0 && (
                  <p className="text-center text-sm py-8" style={{ color: 'var(--text-secondary)' }}>Aucun résultat trouvé.</p>
                )}
                {!searching && !query && (
                  <p className="text-center text-sm py-8" style={{ color: 'var(--text-secondary)' }}>Saisissez un nom ou email pour rechercher.</p>
                )}
                {results.map((group) => (
                  <button
                    key={group.key}
                    onClick={() => handleSelect(group)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left"
                    style={{ background: 'transparent' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {group.photo_url ? (
                      <img src={group.photo_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-hover)' }}>
                        <User size={16} style={{ color: 'var(--text-muted)' }} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{group.full_name}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{group.email || '— pas d\'email'}</p>
                    </div>
                    <div className="flex flex-wrap gap-1 flex-shrink-0">
                      {group.source_labels.map((sl) => (
                        <span key={sl.source} className={`text-xs px-2 py-0.5 rounded-full ${sourceColors[sl.source]}`}>
                          {sl.label}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {selected && (
                <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-color)' }}>
                  {selected.photo_url ? (
                    <img src={selected.photo_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-card-hover)' }}>
                      <User size={16} style={{ color: 'var(--text-muted)' }} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{selected.full_name}</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedLabels.map((sl) => (
                        <span key={sl.source} className={`text-xs px-2 py-0.5 rounded-full ${sourceColors[sl.source]}`}>
                          {sl.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={creating}
                  className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-50 placeholder:text-[var(--text-muted)]"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
                <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                  La personne recevra un e-mail aux couleurs du club avec un lien pour choisir son mot de passe (valable 7 jours).
                </p>
              </div>

              {!lockRole && (
                <div>
                  <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Rôle</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    disabled={creating}
                    className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-50"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {formError && (
                <p className="text-sm rounded-lg px-3 py-2" style={{ color: 'var(--danger-text)', background: 'var(--danger-soft)', border: '1px solid var(--border-color)' }}>{formError}</p>
              )}

              <div className="flex justify-end pt-2" style={{ gap: '12px' }}>
                <Button variant="secondary" onClick={preselected ? onClose : handleBack} disabled={creating}>
                  {preselected ? 'Annuler' : 'Retour'}
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSendInvite}
                  disabled={creating || !email}
                >
                  {creating ? 'Envoi...' : "Envoyer l'invitation"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
