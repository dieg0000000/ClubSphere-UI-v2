import { useCallback, useState, useEffect } from 'react';
import { X, Info, Shield, Save } from 'lucide-react';
import useEscapeKey from '../hooks/useEscapeKey';
import { ZoomablePhoto } from './PhotoViewer';
import { MaskedAVS } from './MaskedAVS';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Tabs } from './ui/Tabs';
import { Badge } from './ui/Badge';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import Button from './ui/Button';
import DataTableShell from './DataTableShell';

const MODULES = [
  { key: 'utilisateurs', label: 'Utilisateurs' },
  { key: 'evenements', label: 'Admin Événements' },
  { key: 'actualites', label: 'Admin Actualités' },
  { key: 'galeries', label: 'Galeries' },
  { key: 'equipes', label: 'Admin Équipes' },
  { key: 'entraineurs', label: 'Admin Entraîneurs' },
  { key: 'qualifications', label: 'Admin Qualifications' },
  { key: 'categories', label: 'Admin Catégories football' },
  { key: 'joueurs', label: 'Admin Joueurs' },
  { key: 'annuaire', label: 'Admin Annuaire Club' },
  { key: 'sponsors', label: 'Admin Sponsors' },
  { key: 'terrains', label: 'Admin Gestion des Terrains' },
  { key: 'matchs', label: 'Admin Matchs' },
  { key: 'pv_seances', label: 'Admin PV Séances' },
  { key: 'js_presences', label: 'J+S Présences' },
  { key: 'notifications', label: 'Config Notifications' },
  { key: 'finances', label: 'Finances' },
  { key: 'parametres', label: 'Paramètres du club' },
  { key: 'theme', label: 'Thème' },
];

interface CommitteeMember {
  id: string;
  member_id: string | null;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  role: string | null;
  avs_number: string | null;
  profile_photo_url: string | null;
  qualification_id: string | null;
  coaching_qualifications?: { name: string } | null;
}

interface Supporter {
  id: string;
  member_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  member_since: string | null;
}

interface Referee {
  id: string;
  member_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  licence_level: string | null;
  active: boolean;
  profile_photo_url: string | null;
}

interface ConfrerieMember {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  member_since: string | null;
  billing_mode: 'email' | 'print' | 'package';
  active: boolean;
  archived_at: string | null;
  notes: string | null;
  profile_id: string | null;
  company: string | null;
  phone_private: string | null;
  phone_pro: string | null;
  fax: string | null;
  birth_date: string | null;
  nationality: string | null;
  asf_licence_number: string | null;
  qualified_at: string | null;
  position: string | null;
  external_ref: string | null;
  salutation: string | null;
  sponsor_id: string | null;
}

interface Props {
  member: CommitteeMember | Supporter | Referee | ConfrerieMember | null;
  type: 'committee' | 'supporter' | 'referee' | 'confrerie';
  onClose: () => void;
}

type ActiveTab = 'info' | 'access';

interface AccessRow {
  can_view: boolean;
  can_edit: boolean;
}

type AccessState = Record<string, AccessRow>;

export default function MemberDetailSlideOver({ member, type, onClose }: Props) {
  const { user } = useAuth();
  const handleClose = useCallback(() => { onClose(); }, [onClose]);
  useEscapeKey(handleClose);

  const [activeTab, setActiveTab] = useState<ActiveTab>('info');
  const [linkedProfileId, setLinkedProfileId] = useState<string | null>(null);
  const [linkedProfileRole, setLinkedProfileRole] = useState<string | null>(null);
  const [accessState, setAccessState] = useState<AccessState>({});
  const [savingAccess, setSavingAccess] = useState(false);
  const [accessLoaded, setAccessLoaded] = useState(false);
  const [confrerieLabel, setConfrerieLabel] = useState('Confrérie');
  const [sponsorName, setSponsorName] = useState<string | null>(null);
  const { toast, showToast } = useToast();

  const isViewerAdmin = user?.role === 'admin' || user?.role === 'president' || user?.role === 'vice_president';

  useEffect(() => {
    if (!member || type !== 'confrerie') return;
    supabase.from('club_settings').select('confrerie_label').limit(1).maybeSingle().then(({ data }) => {
      if (data?.confrerie_label) setConfrerieLabel(data.confrerie_label);
    });
    const cm = member as ConfrerieMember;
    if (cm.billing_mode === 'package' && cm.sponsor_id) {
      supabase.from('sponsors').select('company_name').eq('id', cm.sponsor_id).maybeSingle().then(({ data }) => {
        setSponsorName(data?.company_name || null);
      });
    } else {
      setSponsorName(null);
    }
  }, [member?.id, type]);

  useEffect(() => {
    if (!member || type !== 'committee') return;
    setActiveTab('info');
    setLinkedProfileId(null);
    setLinkedProfileRole(null);
    setAccessState({});
    setAccessLoaded(false);

    const fetchLinkedProfile = async () => {
      const cm = member as CommitteeMember;
      if (!cm.email) return;

      const { data } = await supabase
        .from('profiles')
        .select('id, role')
        .ilike('email', cm.email)
        .maybeSingle();

      if (data) {
        setLinkedProfileId(data.id);
        setLinkedProfileRole(data.role);
      }
    };

    fetchLinkedProfile();
  }, [member?.id, type]);

  useEffect(() => {
    if (!linkedProfileId || type !== 'committee') return;

    const fetchAccess = async () => {
      const { data } = await supabase
        .from('committee_access')
        .select('module, can_view, can_edit')
        .eq('profile_id', linkedProfileId);

      const state: AccessState = {};
      for (const mod of MODULES) {
        state[mod.key] = { can_view: false, can_edit: false };
      }
      if (data) {
        for (const row of data) {
          state[row.module] = { can_view: row.can_view, can_edit: row.can_edit };
        }
      }
      setAccessState(state);
      setAccessLoaded(true);
    };

    fetchAccess();
  }, [linkedProfileId, type]);

  if (!member) return null;

  const getTitle = () => {
    if (type === 'committee') return 'Membre du comité';
    if (type === 'supporter') return 'Supporter';
    if (type === 'confrerie') return `Membre du ${confrerieLabel}`;
    return 'Arbitre';
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '-';
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  };

  const handleViewChange = (moduleKey: string, checked: boolean) => {
    setAccessState((prev) => {
      const row = { ...prev[moduleKey] };
      row.can_view = checked;
      if (!checked) row.can_edit = false;
      return { ...prev, [moduleKey]: row };
    });
  };

  const handleEditChange = (moduleKey: string, checked: boolean) => {
    setAccessState((prev) => {
      const row = { ...prev[moduleKey] };
      row.can_edit = checked;
      if (checked) row.can_view = true;
      return { ...prev, [moduleKey]: row };
    });
  };

  const handleSaveAccess = async () => {
    if (!linkedProfileId) return;
    setSavingAccess(true);
    try {
      const rows = MODULES.map((mod) => ({
        profile_id: linkedProfileId,
        module: mod.key,
        can_view: accessState[mod.key]?.can_view ?? false,
        can_edit: accessState[mod.key]?.can_edit ?? false,
      }));

      const { error } = await supabase
        .from('committee_access')
        .upsert(rows, { onConflict: 'profile_id,module' });

      if (error) throw error;
    } catch (err) {
      console.error('Error saving access:', err);
      showToast('Erreur lors de la sauvegarde des droits.', 'error');
    } finally {
      setSavingAccess(false);
    }
  };

  const isTargetAdmin =
    linkedProfileRole === 'admin' ||
    linkedProfileRole === 'president' ||
    linkedProfileRole === 'vice_president';

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.5)' }}
        onClick={onClose}
      />
      <div
        className="fixed right-0 top-0 h-full w-full max-w-2xl shadow-xl z-50 overflow-y-auto"
        style={{ background: 'var(--bg-card)', borderLeft: '1px solid var(--border-color)' }}
      >
        <div
          className="sticky top-0 px-6 py-4 flex items-center justify-between"
          style={{ background: 'var(--bg-modal-header)' }}
        >
          <div className="flex items-center gap-4">
            {('profile_photo_url' in member && member.profile_photo_url) && (
              <ZoomablePhoto src={member.profile_photo_url} caption={`${member.first_name} ${member.last_name}`} alt="" className="w-16 h-16 rounded-full object-cover" />
            )}
            {(!('profile_photo_url' in member) || !member.profile_photo_url) && (
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-semibold" style={{ background: 'var(--bg-hover)', color: 'var(--text-modal-header)' }}>
                {member.first_name[0]}{member.last_name[0]}
              </div>
            )}
            <div>
              <h2 className="text-2xl font-bold" style={{ color: 'var(--text-modal-header)' }}>
                {type === 'confrerie' && 'salutation' in member && member.salutation ? `${member.salutation} ` : ''}{member.first_name} {member.last_name}
              </h2>
              <p className="text-sm" style={{ color: 'var(--text-modal-header)', opacity: 0.8 }}>{getTitle()}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="hover:opacity-80 transition-opacity"
            style={{ color: 'var(--text-modal-header)' }}
            aria-label="Fermer"
          >
            <X size={24} />
          </button>
        </div>

        {type === 'committee' && isViewerAdmin && linkedProfileId && (
          <div className="px-4 pt-2">
            <Tabs
              items={[
                { key: 'info', label: 'Informations', icon: <Info size={16} /> },
                { key: 'access', label: 'Accès & Droits', icon: <Shield size={16} /> },
              ]}
              value={activeTab}
              onChange={(id) => setActiveTab(id as typeof activeTab)}
            />
          </div>
        )}

        <div className="p-6">
          {activeTab === 'info' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Informations personnelles</h3>
                <div className="space-y-2 text-sm">
                  {/* --- Committee fields --- */}
                  {type === 'committee' && 'role' in member && member.role && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Rôle</span>
                      <span style={{ color: 'var(--text-primary)' }}>{member.role}</span>
                    </div>
                  )}
                  {type === 'committee' && 'birth_date' in member && member.birth_date && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Date de naissance</span>
                      <span style={{ color: 'var(--text-primary)' }}>{formatDate(member.birth_date)}</span>
                    </div>
                  )}
                  {type === 'committee' && 'avs_number' in member && member.avs_number && (
                    <div className="flex justify-between items-center">
                      <span style={{ color: 'var(--text-secondary)' }}>Numéro AVS</span>
                      <MaskedAVS avs={member.avs_number} memberId={member.id} context="member_detail" />
                    </div>
                  )}
                  {type === 'committee' && 'coaching_qualifications' in member && member.coaching_qualifications && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Qualification</span>
                      <span style={{ color: 'var(--text-primary)' }}>{member.coaching_qualifications.name}</span>
                    </div>
                  )}
                  {/* --- Supporter fields --- */}
                  {type === 'supporter' && 'member_since' in member && member.member_since && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Membre depuis</span>
                      <span style={{ color: 'var(--text-primary)' }}>{formatDate(member.member_since)}</span>
                    </div>
                  )}
                  {/* --- Confrerie fields (ordered per spec) --- */}
                  {type === 'confrerie' && 'salutation' in member && member.salutation && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Civilité</span>
                      <span style={{ color: 'var(--text-primary)' }}>{member.salutation}</span>
                    </div>
                  )}
                  {type === 'confrerie' && 'company' in member && member.company && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Société</span>
                      <span style={{ color: 'var(--text-primary)' }}>{member.company}</span>
                    </div>
                  )}
                  {type === 'confrerie' && 'birth_date' in member && member.birth_date && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Date de naissance</span>
                      <span style={{ color: 'var(--text-primary)' }}>{formatDate(member.birth_date)}</span>
                    </div>
                  )}
                  {type === 'confrerie' && 'nationality' in member && member.nationality && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Nationalité</span>
                      <span style={{ color: 'var(--text-primary)' }}>{member.nationality}</span>
                    </div>
                  )}
                  {type === 'confrerie' && 'member_since' in member && member.member_since && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Membre depuis</span>
                      <span style={{ color: 'var(--text-primary)' }}>{formatDate(member.member_since)}</span>
                    </div>
                  )}
                  {type === 'confrerie' && 'billing_mode' in member && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Mode de facturation</span>
                      <span style={{ color: 'var(--text-primary)' }}>
                        {member.billing_mode === 'package'
                          ? `Package — ${sponsorName || 'arrangement particulier'}`
                          : member.billing_mode === 'email' ? 'E-mail' : 'Courrier'}
                      </span>
                    </div>
                  )}
                  {type === 'confrerie' && 'active' in member && typeof member.active === 'boolean' && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Statut</span>
                      <Badge variant={member.active ? 'green' : 'neutral'}>
                        {member.active ? 'Actif' : 'Archivé'}
                      </Badge>
                    </div>
                  )}
                  {type === 'confrerie' && 'external_ref' in member && member.external_ref && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Réf. externe</span>
                      <span style={{ color: 'var(--text-primary)' }}>{member.external_ref}</span>
                    </div>
                  )}
                  {type === 'confrerie' && 'asf_licence_number' in member && member.asf_licence_number && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>N° passeport ASF</span>
                      <span style={{ color: 'var(--text-primary)' }}>{member.asf_licence_number}</span>
                    </div>
                  )}
                  {type === 'confrerie' && 'qualified_at' in member && member.qualified_at && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Qualifié le</span>
                      <span style={{ color: 'var(--text-primary)' }}>{formatDate(member.qualified_at)}</span>
                    </div>
                  )}
                  {type === 'confrerie' && 'position' in member && member.position && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Poste</span>
                      <span style={{ color: 'var(--text-primary)' }}>{member.position}</span>
                    </div>
                  )}
                  {type === 'confrerie' && 'notes' in member && member.notes && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Notes</span>
                      <span className="text-right max-w-[60%]" style={{ color: 'var(--text-primary)' }}>{member.notes}</span>
                    </div>
                  )}
                  {/* --- Referee fields --- */}
                  {type === 'referee' && 'licence_level' in member && member.licence_level && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Niveau de licence</span>
                      <span style={{ color: 'var(--text-primary)' }}>{member.licence_level}</span>
                    </div>
                  )}
                  {type === 'referee' && 'active' in member && typeof member.active === 'boolean' && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Statut</span>
                      <Badge variant={member.active ? 'green' : 'neutral'}>
                        {member.active ? 'Actif' : 'Inactif'}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Contact</h3>
                <div className="space-y-2 text-sm">
                  {member.email && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Email</span>
                      <a href={`mailto:${member.email}`} style={{ color: 'var(--accent)' }} className="hover:opacity-80">
                        {member.email}
                      </a>
                    </div>
                  )}
                  {member.phone && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Mobile</span>
                      <a href={`tel:${member.phone}`} style={{ color: 'var(--accent)' }} className="hover:opacity-80">
                        {member.phone}
                      </a>
                    </div>
                  )}
                  {type === 'confrerie' && 'phone_private' in member && member.phone_private && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Tél. privé</span>
                      <span style={{ color: 'var(--text-primary)' }}>{member.phone_private}</span>
                    </div>
                  )}
                  {type === 'confrerie' && 'phone_pro' in member && member.phone_pro && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Tél. professionnel</span>
                      <span style={{ color: 'var(--text-primary)' }}>{member.phone_pro}</span>
                    </div>
                  )}
                  {type === 'confrerie' && 'fax' in member && member.fax && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Fax</span>
                      <span style={{ color: 'var(--text-primary)' }}>{member.fax}</span>
                    </div>
                  )}
                  {'address' in member && member.address && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Adresse</span>
                      <span className="text-right" style={{ color: 'var(--text-primary)' }}>
                        {[member.address, 'street_number' in member ? (member as any).street_number : null].filter(Boolean).join(' ')}
                      </span>
                    </div>
                  )}
                  {'postal_code' in member && 'city' in member && (member.postal_code || member.city) && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Localité</span>
                      <span style={{ color: 'var(--text-primary)' }}>
                        {member.postal_code} {member.city}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {'member_id' in member && member.member_id && (
                <div className="p-4 rounded-lg" style={{ background: 'var(--info-soft)', border: '1px solid var(--border-color)' }}>
                  <p className="text-sm" style={{ color: 'var(--info-text)' }}>
                    Cette personne est également un joueur du Club
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'access' && type === 'committee' && (
            <div>
              {isTargetAdmin ? (
                <div className="p-4 rounded-lg mb-4" style={{ background: 'var(--warning-soft)', border: '1px solid var(--border-color)' }}>
                  <p className="text-sm text-[var(--warning-text)]">
                    Cet utilisateur a le rôle <strong>{linkedProfileRole}</strong> — il dispose de tous les accès automatiquement et ceux-ci ne peuvent pas être modifiés.
                  </p>
                </div>
              ) : !linkedProfileId ? (
                <div className="p-4 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Aucun compte utilisateur trouvé pour ce membre. Un compte doit être créé avec l'adresse email <strong style={{ color: 'var(--text-primary)' }}>{(member as CommitteeMember).email || '—'}</strong> avant de pouvoir configurer les accès.
                  </p>
                </div>
              ) : !accessLoaded ? (
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Chargement des droits...</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <DataTableShell bare maxHeight="300px">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <th className="text-left py-3 pr-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Module</th>
                          <th className="text-center py-3 px-4 font-medium w-20" style={{ color: 'var(--text-secondary)' }}>Voir</th>
                          <th className="text-center py-3 px-4 font-medium w-20" style={{ color: 'var(--text-secondary)' }}>Modifier</th>
                        </tr>
                      </thead>
                      <tbody style={{ borderTop: '1px solid var(--border-color)' }}>
                        {MODULES.map((mod) => {
                          const row = accessState[mod.key] ?? { can_view: false, can_edit: false };
                          return (
                            <tr key={mod.key} className="transition-colors" style={{ borderTop: '1px solid var(--border-color)' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                              <td className="py-3 pr-4" style={{ color: 'var(--text-primary)' }}>{mod.label}</td>
                              <td className="py-3 px-4 text-center">
                                <input
                                  type="checkbox"
                                  checked={row.can_view}
                                  onChange={(e) => handleViewChange(mod.key, e.target.checked)}
                                  className="w-4 h-4 rounded cursor-pointer" style={{ accentColor: 'var(--accent)' }}
                                />
                              </td>
                              <td className="py-3 px-4 text-center">
                                <input
                                  type="checkbox"
                                  checked={row.can_edit}
                                  onChange={(e) => handleEditChange(mod.key, e.target.checked)}
                                  className="w-4 h-4 rounded cursor-pointer" style={{ accentColor: 'var(--accent)' }}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    </DataTableShell>
                  </div>

                  <div className="mt-6 flex justify-end">
                    <Button
                      variant="primary"
                      leftIcon={<Save size={16} />}
                      onClick={handleSaveAccess}
                      disabled={savingAccess}
                      loading={savingAccess}
                    >
                      {savingAccess ? 'Enregistrement...' : 'Enregistrer les droits'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <Toast toast={toast} />
    </>
  );
}
