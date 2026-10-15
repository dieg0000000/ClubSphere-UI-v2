import { useState, useEffect, useCallback } from 'react';
import { X, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Button from './ui/Button';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';

type TeamConvType = 'team_full' | 'staff_only' | 'parent_coach' | 'club_announcement';
type GroupConvType = 'committee' | 'confrerie' | 'supporters' | 'event_volunteers' | 'custom';
type ConvType = TeamConvType | GroupConvType;

interface NewConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: {
    type: string;
    team_id: string | null;
    name: string | null;
    participant_ids: string[];
  }) => Promise<void>;
  onCreateGroup?: (data: {
    type: GroupConvType;
    name: string | null;
    event_id: string | null;
    participants: string[] | null;
    announce: boolean;
  }) => Promise<void>;
}

const GROUP_TYPES: GroupConvType[] = ['committee', 'confrerie', 'supporters', 'event_volunteers', 'custom'];

function roleLabel(r: string): string {
  switch (r) {
    case 'admin': case 'president': case 'vice_president': case 'responsable_technique': case 'committee': return 'Comité';
    case 'coach': case 'assistant_coach': return 'Entraîneur';
    case 'player': return 'Joueur';
    case 'parent': return 'Parent';
    case 'supporter': case 'member': return 'Supporter';
    default: return r;
  }
}

const inputStyle = {
  background: 'var(--bg-input)',
  borderWidth: '1px',
  borderStyle: 'solid' as const,
  borderColor: 'var(--border-color)',
  color: 'var(--text-primary)',
};

export function NewConversationModal({ isOpen, onClose, onCreate, onCreateGroup }: NewConversationModalProps) {
  const [type, setType] = useState<ConvType>('team_full');
  const [teamId, setTeamId] = useState<string>('');
  const [name, setName] = useState('');
  const [teams, setTeams] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [selectedParent, setSelectedParent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const { toast, showToast } = useToast();
  const { user, hasRole } = useAuth();
  const { clubId } = useTenant();

  const isAdmin = hasRole('admin') || hasRole('president') || hasRole('vice_president') || hasRole('responsable_technique') || hasRole('committee');
  const canSendClubAnnouncement = isAdmin;

  // Group-specific state
  const [confrerieLabel, setConfrerieLabel] = useState('Club des 500');
  const [groupName, setGroupName] = useState('');
  const [announce, setAnnounce] = useState(false);
  const [eventId, setEventId] = useState('');
  const [events, setEvents] = useState<{ id: string; title: string; date: string; is_upcoming: boolean; volunteer_accounts: number }[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [customName, setCustomName] = useState('');
  const [participantSearch, setParticipantSearch] = useState('');
  const [participantResults, setParticipantResults] = useState<{ id: string; label: string; roles: string[] }[]>([]);
  const [selectedParticipants, setSelectedParticipants] = useState<{ id: string; label: string }[]>([]);
  const [searchingParticipants, setSearchingParticipants] = useState(false);

  const isGroupType = GROUP_TYPES.includes(type as GroupConvType);

  useEffect(() => {
    if (isOpen) {
      loadTeams();
      if (isAdmin) {
        supabase.from('club_settings').select('confrerie_label').limit(1).maybeSingle().then(({ data }) => {
          if (data?.confrerie_label) setConfrerieLabel(data.confrerie_label);
        });
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (type === 'parent_coach' && teamId) {
      loadTeamMembers(teamId);
    }
  }, [type, teamId]);

  useEffect(() => {
    if (type === 'event_volunteers' && isOpen) {
      loadEvents();
    }
  }, [type, isOpen]);

  useEffect(() => {
    if (!isGroupType) return;
    const defaults: Record<string, string> = {
      committee: 'Comité',
      confrerie: confrerieLabel,
      supporters: 'Supporters',
      event_volunteers: '',
      custom: '',
    };
    setGroupName(defaults[type] || '');
    setAnnounce(false);
    setEventId('');
    setCustomName('');
    setSelectedParticipants([]);
    setParticipantSearch('');
    setParticipantResults([]);
  }, [type, confrerieLabel]);

  const loadTeams = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', authUser.id).single();
    if (!profile) return;
    const isAdminRole = ['admin', 'president', 'vice_president', 'responsable_technique', 'committee'].includes(profile.role);
    const isCoach = ['coach', 'assistant_coach'].includes(profile.role);

    let data: any[] | null = null;
    if (isCoach && !isAdminRole) {
      const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', authUser.id).single();
      if (!coach) { setTeams([]); return; }
      const { data: staffRows } = await supabase.from('team_staff').select('teams!inner(id, name)').eq('coach_id', coach.id).order('sort_order').order('teams(name)');
      data = (staffRows || []).map((r: any) => r.teams).filter(Boolean);
    } else {
      const res = await supabase.from('teams').select('id, name, level_rank').eq('active', true).order('level_rank').order('name');
      data = res.data;
    }
    if (data) {
      setTeams(data);
      if (data.length > 0) setTeamId(data[0].id);
    }
  };

  const loadTeamMembers = async (tid: string) => {
    const { data } = await supabase.from('members').select('id, first_name, last_name, legal_rep1_firstname, legal_rep1_lastname').eq('team_id', tid).order('last_name');
    if (data) setMembers(data);
  };

  const loadEvents = async () => {
    setEventsLoading(true);
    const { data, error } = await supabase.rpc('list_club_events_for_groups');
    if (error) {
      showToast(error.message, 'error');
      setEventsLoading(false);
      return;
    }
    if (data) {
      setEvents((data as any[]).map((e) => ({
        id: e.id,
        title: e.title,
        date: e.date,
        is_upcoming: e.is_upcoming,
        volunteer_accounts: e.volunteer_accounts ?? 0,
      })));
    }
    setEventsLoading(false);
  };

  const searchParticipants = useCallback(async (query: string) => {
    setParticipantSearch(query);
    if (query.length < 2) { setParticipantResults([]); return; }
    setSearchingParticipants(true);
    const { data, error } = await supabase.rpc('search_club_accounts', {
      p_query: query,
      p_limit: 50,
    });
    if (error) {
      showToast(error.message, 'error');
      setSearchingParticipants(false);
      return;
    }
    if (data) {
      const selectedIds = new Set(selectedParticipants.map(p => p.id));
      setParticipantResults(
        (data as any[])
          .filter((p) => p.id !== user?.id && !selectedIds.has(p.id))
          .map((p) => ({ id: p.id, label: p.full_name || p.email || p.id, roles: p.roles || [] }))
      );
    }
    setSearchingParticipants(false);
  }, [selectedParticipants, user?.id]);

  const addParticipant = (p: { id: string; label: string }) => {
    setSelectedParticipants(prev => [...prev, p]);
    setParticipantSearch('');
    setParticipantResults([]);
  };

  const removeParticipant = (id: string) => {
    setSelectedParticipants(prev => prev.filter(p => p.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isGroupType && onCreateGroup) {
        const gType = type as GroupConvType;
        const finalName = groupName.trim() || null;
        const eId = gType === 'event_volunteers' ? eventId || null : null;
        const parts = gType === 'custom' ? selectedParticipants.map(p => p.id) : null;
        await onCreateGroup({ type: gType, name: finalName, event_id: eId, participants: parts, announce });
      } else {
        await onCreate({
          type,
          team_id: type === 'club_announcement' ? null : teamId || null,
          name: type === 'parent_coach' ? name : null,
          participant_ids: type === 'parent_coach' && selectedParent ? [selectedParent] : [],
        });
      }
      onClose();
      resetForm();
    } catch (error: any) {
      console.error('Error creating conversation:', error);
      showToast(error?.message || 'Erreur lors de la création de la conversation', 'error');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setType('team_full');
    setTeamId('');
    setName('');
    setSelectedParent('');
    setGroupName('');
    setAnnounce(false);
    setEventId('');
    setCustomName('');
    setSelectedParticipants([]);
    setParticipantSearch('');
    setParticipantResults([]);
  };

  const isGroupValid = (): boolean => {
    if (type === 'event_volunteers' && !eventId) return false;
    if (type === 'custom' && selectedParticipants.length === 0) return false;
    if (type === 'custom' && !groupName.trim()) return false;
    return true;
  };

  if (!isOpen) return null;

  const groupSubtitles: Record<string, string> = {
    committee: 'Tous les membres du comité',
    confrerie: 'Les membres du cercle qui ont un compte',
    supporters: 'Tous les comptes Membre / Supporter',
    event_volunteers: 'Les bénévoles inscrits à un événement',
    custom: 'Vous choisissez les participants',
  };

  const groupLabels: Record<string, string> = {
    committee: 'Comité',
    confrerie: confrerieLabel,
    supporters: 'Supporters',
    event_volunteers: 'Bénévoles d’un événement',
    custom: 'Groupe personnalisé',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div
        className="w-full max-w-md rounded-xl shadow-xl overflow-hidden"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ background: 'var(--bg-modal-header)' }}>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-modal-header)' }}>
            Nouvelle conversation
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:opacity-80 transition-opacity" style={{ color: 'var(--text-modal-header)' }} aria-label="Fermer">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              Type de conversation
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ConvType)}
              className="w-full px-4 py-2 rounded-lg"
              style={inputStyle}
            >
              <optgroup label="Équipes">
                <option value="team_full">Équipe complète (entraîneurs + joueurs + parents)</option>
                <option value="staff_only">Staff uniquement</option>
                <option value="parent_coach">Parent-Entraîneur</option>
              </optgroup>
              {canSendClubAnnouncement && (
                <option value="club_announcement">Annonce club</option>
              )}
              {isAdmin && (
                <optgroup label="Groupes">
                  {GROUP_TYPES.map(gt => (
                    <option key={gt} value={gt}>{groupLabels[gt]}</option>
                  ))}
                </optgroup>
              )}
            </select>
            {isGroupType && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                {groupSubtitles[type]}
              </p>
            )}
          </div>

          {/* Team-based fields */}
          {!isGroupType && type !== 'club_announcement' && (
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Équipe</label>
              <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="w-full px-4 py-2 rounded-lg" style={inputStyle} required>
                <option value="">Sélectionner une équipe</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>
          )}

          {type === 'parent_coach' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Nom de la conversation</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: U15 - Lucas" className="w-full px-4 py-2 rounded-lg" style={inputStyle} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Sélectionner le parent</label>
                <select value={selectedParent} onChange={(e) => setSelectedParent(e.target.value)} className="w-full px-4 py-2 rounded-lg" style={inputStyle} required>
                  <option value="">Sélectionner un parent</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.first_name} {member.last_name} - Parent: {member.legal_rep1_firstname} {member.legal_rep1_lastname}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Group-specific fields */}
          {isGroupType && (
            <>
              {type === 'event_volunteers' && (
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Événement</label>
                  {eventsLoading ? (
                    <p className="text-sm py-2" style={{ color: 'var(--text-muted)' }}>Chargement des événements…</p>
                  ) : (
                    <select value={eventId} onChange={(e) => {
                      setEventId(e.target.value);
                      const ev = events.find(ev => ev.id === e.target.value);
                      if (ev && !groupName) setGroupName(`Bénévoles — ${ev.title}`);
                    }} className="w-full px-4 py-2 rounded-lg" style={inputStyle} required>
                      <option value="">Sélectionner un événement</option>
                      {(() => {
                        const opts: React.ReactNode[] = [];
                        let pastSeparatorAdded = false;
                        for (const ev of events) {
                          if (!ev.is_upcoming && !pastSeparatorAdded) {
                            pastSeparatorAdded = true;
                            opts.push(<option key="__past_sep" disabled>— Passés —</option>);
                          }
                          const dateStr = new Date(ev.date).toLocaleDateString('fr-CH');
                          const volSuffix = ev.volunteer_accounts > 0 ? ` · ${ev.volunteer_accounts} bénévole${ev.volunteer_accounts > 1 ? 's' : ''}` : '';
                          opts.push(
                            <option key={ev.id} value={ev.id}>
                              {ev.title} — {dateStr}{volSuffix}
                            </option>
                          );
                        }
                        return opts;
                      })()}
                    </select>
                  )}
                </div>
              )}

              {type === 'custom' && (
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Participants</label>
                  {selectedParticipants.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {selectedParticipants.map(p => (
                        <span
                          key={p.id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ background: 'var(--primary-opacity-20)', color: 'var(--primary)' }}
                        >
                          {p.label}
                          <button type="button" onClick={() => removeParticipant(p.id)} className="hover:opacity-70">
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="relative">
                    <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      value={participantSearch}
                      onChange={(e) => searchParticipants(e.target.value)}
                      placeholder="Rechercher par nom..."
                      className="w-full pl-8 pr-4 py-2 rounded-lg"
                      style={inputStyle}
                    />
                  </div>
                  {participantResults.length > 0 && (
                    <div className="rounded-lg mt-1 max-h-36 overflow-y-auto" style={{ border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
                      {participantResults.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => addParticipant(p)}
                          className="w-full text-left px-3 py-2 text-sm hover:opacity-80"
                          style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)' }}
                        >
                          <span>{p.label}</span>
                          {p.roles.length > 0 && (
                            <span className="ml-2">
                              {p.roles.map(r => (
                                <span
                                  key={r}
                                  className="inline-block ml-1 px-1.5 py-0 rounded text-[10px] font-medium"
                                  style={{ background: 'var(--bg-sidebar)', color: 'var(--text-muted)' }}
                                >
                                  {roleLabel(r)}
                                </span>
                              ))}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                  Nom du groupe {type !== 'custom' && <span className="font-normal text-xs" style={{ color: 'var(--text-muted)' }}>(optionnel)</span>}
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value.slice(0, 120))}
                  placeholder={type === 'custom' ? 'Nom du groupe (obligatoire)' : 'Nom par défaut si vide'}
                  className="w-full px-4 py-2 rounded-lg"
                  style={inputStyle}
                  required={type === 'custom'}
                  maxLength={120}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Mode</label>
                <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
                  <button
                    type="button"
                    onClick={() => setAnnounce(false)}
                    className="flex-1 px-3 py-2 text-xs font-medium transition-colors"
                    style={{
                      background: !announce ? 'var(--primary)' : 'var(--bg-input)',
                      color: !announce ? 'var(--accent-ink, var(--text-inverse))' : 'var(--text-secondary)',
                    }}
                  >
                    Discussion — tout le monde peut écrire
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnnounce(true)}
                    className="flex-1 px-3 py-2 text-xs font-medium transition-colors"
                    style={{
                      background: announce ? 'var(--primary)' : 'var(--bg-input)',
                      color: announce ? 'var(--accent-ink, var(--text-inverse))' : 'var(--text-secondary)',
                    }}
                  >
                    Annonce — seul le créateur écrit
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end pt-4" style={{ gap: '12px' }}>
            <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
            <Button type="submit" variant="primary" disabled={loading || (isGroupType && !isGroupValid())}>
              {loading ? 'Création...' : 'Créer'}
            </Button>
          </div>
        </form>
      </div>
      <Toast toast={toast} />
    </div>
  );
}
