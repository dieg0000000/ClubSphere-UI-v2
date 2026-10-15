import { useState, useEffect, useCallback, useRef } from 'react';
import { X, User, Users, FileText, Check, Clock, DoorOpen, Plane, Moon, Ban, Hand, Shield, Settings, Zap, Circle as CircleHelp, TriangleAlert as AlertTriangle } from 'lucide-react';
import { formatAVS } from '../utils/formatHelpers';
import PhoneInput from './PhoneInput';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { useWebsiteModuleEnabled } from '../hooks/useWebsiteModuleEnabled';
import useEscapeKey from '../hooks/useEscapeKey';
import { Tabs } from './ui/Tabs';
import { Toggle } from './Toggle';
import Button from './ui/Button';
import { StandardModal } from './StandardModal';
import { supabase } from '../lib/supabase';
import findLegalRepAccounts from '../lib/legalRepAccountLookup';
import { useFootballPositions } from '../hooks/useFootballPositions';
import CountrySelect from './CountrySelect';



interface Member {
  id?: string;
  first_name: string;
  last_name: string;
  second_name?: string | null;
  birth_date?: string | null;
  nationality?: string | null;
  football_nationality?: string | null;
  country?: string | null;
  pseudonym?: string | null;
  salutation?: string | null;
  avs_number?: string | null;
  asf_licence_number?: string | null;
  email?: string | null;
  email_pro?: string | null;
  phone?: string | null;
  phone_private?: string | null;
  address?: string | null;
  street_number?: string | null;
  address2?: string | null;
  postal_code?: string | null;
  city?: string | null;
  canton?: string | null;
  team_id?: string | null;
  js_number?: string | null;
  licence_status?: string;
  position?: string | null;
  position_main_id?: string | null;
  position_secondary_id?: string | null;
  qualification_type?: string | null;
  qualified_from?: string | null;
  qualified_until?: string | null;
  departure_note?: string | null;
  departure_date?: string | null;
  departure_club?: string | null;
  legal_rep1_firstname?: string | null;
  legal_rep1_lastname?: string | null;
  legal_rep1_relation?: string | null;
  legal_rep1_phone?: string | null;
  legal_rep1_email?: string | null;
  legal_rep1_address?: string | null;
  legal_rep1_street_number?: string | null;
  legal_rep1_postal_code?: string | null;
  legal_rep1_city?: string | null;
  legal_rep1_canton?: string | null;
  legal_rep2_firstname?: string | null;
  legal_rep2_lastname?: string | null;
  legal_rep2_relation?: string | null;
  legal_rep2_phone?: string | null;
  legal_rep2_email?: string | null;
  legal_rep2_address?: string | null;
  legal_rep2_street_number?: string | null;
  legal_rep2_postal_code?: string | null;
  legal_rep2_city?: string | null;
  legal_rep2_canton?: string | null;
  notes?: string | null;
  gender?: string | null;
  affiliation_date?: string | null;
  club_origine?: string | null;
  classe_de_jeu?: string | null;
  remarques_club?: string | null;
  groupement_id?: string | null;
  status?: string | null;
  origin_club_name?: string | null;
  origin_club_asf_number?: string | null;
  billable?: boolean;
  jersey_number?: number | null;
  receives_convocations?: boolean;
}

interface Team {
  id: string;
  name: string;
  team_categories?: { name: string };
}

interface PlayerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  editingMember: Member | null;
  teams: Team[];
  formData: Partial<Member>;
  setFormData: (data: Partial<Member>) => void;
  saving?: boolean;
}

export function PlayerFormModal({
  isOpen,
  onClose,
  onSubmit,
  editingMember,
  teams,
  formData,
  setFormData,
  saving = false,
}: PlayerFormModalProps) {
  const { user } = useAuth();
  const { clubId } = useTenant();
  const { enabled: websiteEnabled } = useWebsiteModuleEnabled()
  const { grouped: positionGroups } = useFootballPositions();
  const [activeTab, setActiveTab] = useState<'player' | 'legal' | 'notes'>('player');
  const [showRep1, setShowRep1] = useState(false);
  const [showRep2, setShowRep2] = useState(false);
  const [rep1SameAddress, setRep1SameAddress] = useState(true);
  const [rep2SameAddress, setRep2SameAddress] = useState(true);
  const [pendingMatch, setPendingMatch] = useState<{ name: string; field: 'rep1' | 'rep2' } | null>(null);
  const [checkingAccount, setCheckingAccount] = useState(false);
  const rep1EmailRef = useRef<HTMLInputElement>(null);
  const rep2EmailRef = useRef<HTMLInputElement>(null);
  interface GroupementClubOption {
    id: string;
    groupement_id: string;
    club_name: string;
    club_asf_number: string;
    groupement_name: string;
  }
  const [groupementClubs, setGroupementClubs] = useState<GroupementClubOption[]>([]);
  const [groupementToggle, setGroupementToggle] = useState(false);
  const [selectedClubRow, setSelectedClubRow] = useState<string>('');
  const [secondaryTeamIds, setSecondaryTeamIds] = useState<string[]>([]);
  const [addingSecondaryTeam, setAddingSecondaryTeam] = useState(false);


  const hasMultipleGroupements = new Set(groupementClubs.map(gc => gc.groupement_id)).size > 1;

  useEffect(() => {
    if (!clubId) return;
    supabase
      .from('groupement_clubs')
      .select('id, groupement_id, club_name, club_asf_number, groupements!inner(id, name, club_id)')
      .eq('groupements.club_id', clubId)
      .order('club_name')
      .then(({ data }) => {
        const rows: GroupementClubOption[] = (data || []).map((r: any) => ({
          id: r.id,
          groupement_id: r.groupement_id,
          club_name: r.club_name,
          club_asf_number: r.club_asf_number,
          groupement_name: r.groupements?.name || '',
        }));
        setGroupementClubs(rows);
      });
  }, [clubId]);

  useEffect(() => {
    if (!editingMember?.id || !clubId) { setSecondaryTeamIds([]); return; }
    supabase
      .from('team_members')
      .select('team_id')
      .eq('member_id', editingMember.id)
      .eq('club_id', clubId)
      .then(({ data }) => {
        const primaryTid = formData.team_id || editingMember.team_id;
        setSecondaryTeamIds(
          (data || []).map(r => r.team_id).filter(tid => tid !== primaryTid)
        );
      });
  }, [editingMember?.id, clubId, formData.team_id]);

  useEffect(() => {
    const isOn = formData.status === 'groupement' || !!formData.groupement_id;
    setGroupementToggle(isOn);
    if (isOn && groupementClubs.length > 0) {
      const match = groupementClubs.find(gc => gc.club_asf_number === formData.origin_club_asf_number)
        || groupementClubs.find(gc => gc.club_name === formData.origin_club_name);
      setSelectedClubRow(match?.id || '');
    } else {
      setSelectedClubRow('');
    }
  }, [formData.groupement_id, formData.status, formData.origin_club_asf_number, formData.origin_club_name, groupementClubs]);


  useEffect(() => {
    if (formData.legal_rep1_firstname || formData.legal_rep1_lastname) {
      setShowRep1(true);
    }
    if (formData.legal_rep2_firstname || formData.legal_rep2_lastname) {
      setShowRep2(true);
    }
  }, [formData]);

  useEffect(() => {
    if (formData.birth_date) {
      const age = calculateAge(formData.birth_date);
      if (age !== null && age < 18) {
        setActiveTab('legal');
      }
    }
  }, [formData.birth_date]);

  const calculateAge = (birthDate: string | null | undefined): number | null => {
    if (!birthDate) return null;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const findAccountMatch = async (): Promise<{ name: string; field: 'rep1' | 'rep2' } | null> => {
    const candidates: Array<{ field: 'rep1' | 'rep2'; email: string }> = [];
    const e1 = (formData.legal_rep1_email || '').trim();
    const e2 = (formData.legal_rep2_email || '').trim();
    if (e1) candidates.push({ field: 'rep1', email: e1 });
    if (e2) candidates.push({ field: 'rep2', email: e2 });
    if (candidates.length === 0) return null;

    const matches = await findLegalRepAccounts(candidates.map((c) => c.email));
    for (const c of candidates) {
      const name = matches.get(c.email.toLowerCase());
      if (name) return { name, field: c.field };
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || checkingAccount) return;
    setCheckingAccount(true);
    let match: { name: string; field: 'rep1' | 'rep2' } | null = null;
    try {
      match = await findAccountMatch();
    } finally {
      setCheckingAccount(false);
    }
    if (match) {
      setPendingMatch(match);
      return;
    }
    await onSubmit(e);
  };

  const confirmMatchAndSave = async () => {
    setPendingMatch(null);
    await onSubmit({ preventDefault: () => {} } as unknown as React.FormEvent);
  };

  const cancelMatch = () => {
    const field = pendingMatch?.field;
    setPendingMatch(null);
    setActiveTab('legal');
    if (field === 'rep1') setShowRep1(true);
    if (field === 'rep2') setShowRep2(true);
    setTimeout(() => {
      if (field === 'rep1') rep1EmailRef.current?.focus();
      else if (field === 'rep2') rep2EmailRef.current?.focus();
    }, 0);
  };

  const age = calculateAge(formData.birth_date);
  const showLegalRepWarning = age !== null && age < 18;

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEscapeKey(handleClose);

  if (!isOpen) return null;

  return (
    <>
    <div className="fixed inset-0 flex items-center justify-center p-4 z-50 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color)' }}>
        <div className="sticky top-0 flex items-center justify-between z-20 px-6 py-4 rounded-t-xl" style={{ background: 'var(--bg-modal-header)' }}>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-modal-header)' }}>
            {editingMember ? 'Modifier le joueur' : 'Nouveau joueur'}
          </h2>
          <button onClick={onClose} aria-label="Fermer" style={{ color: 'var(--text-modal-header)' }} className="hover:opacity-80">
            <X size={24} />
          </button>
        </div>

        <div className="border-b sticky top-[56px] z-10" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-modal)' }}>
          <div className="p-4">
            <Tabs
              items={[
                { key: 'player', label: 'Joueur', icon: <User className="w-4 h-4" /> },
                { key: 'legal', label: 'Représentants légaux', icon: showLegalRepWarning ? <span className="relative"><Users className="w-4 h-4" /><span className="absolute -top-1 -right-3 w-3 h-3 bg-[var(--warning)] rounded-full animate-pulse" /></span> : <Users className="w-4 h-4" /> },
                { key: 'notes', label: 'Notes', icon: <FileText className="w-4 h-4" /> },
              ]}
              value={activeTab}
              onChange={(id) => setActiveTab(id as typeof activeTab)}
            />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {activeTab === 'player' && (
            <div className="space-y-6">
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
                <h3 className="text-lg font-semibold mb-4 border-b pb-2" style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>Identité</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Prénom *</label>
                    <input
                      type="text"
                      required
                      value={formData.first_name || ''}
                      onChange={(e) => setFormData({...formData, first_name: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Nom *</label>
                    <input
                      type="text"
                      required
                      value={formData.last_name || ''}
                      onChange={(e) => setFormData({...formData, last_name: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Deuxième nom</label>
                    <input
                      type="text"
                      value={formData.second_name || ''}
                      onChange={(e) => setFormData({...formData, second_name: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Date de naissance</label>
                    <input
                      type="date"
                      value={formData.birth_date || ''}
                      onChange={(e) => setFormData({...formData, birth_date: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-2">Genre</label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="gender"
                          value="M"
                          checked={formData.gender === 'M'}
                          onChange={(e) => setFormData({...formData, gender: e.target.value})}
                          className="cursor-pointer"
                        />
                        <span style={{ color: 'var(--text-primary)' }}>Masculin</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="gender"
                          value="F"
                          checked={formData.gender === 'F'}
                          onChange={(e) => setFormData({...formData, gender: e.target.value})}
                          className="cursor-pointer"
                        />
                        <span style={{ color: 'var(--text-primary)' }}>Féminin</span>
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Nationalité</label>
                    <CountrySelect
                      value={formData.nationality || ''}
                      onChange={(v) => setFormData({...formData, nationality: v || null})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Nationalité football</label>
                    <CountrySelect
                      value={formData.football_nationality || ''}
                      onChange={(v) => setFormData({...formData, football_nationality: v || null})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Pseudonyme</label>
                    <input
                      type="text"
                      value={formData.pseudonym || ''}
                      onChange={(e) => setFormData({...formData, pseudonym: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      placeholder="Optionnel"
                    />
                  </div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
                <h3 className="text-lg font-semibold mb-4 border-b pb-2" style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>Documents (Admin uniquement)</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Numéro AVS</label>
                    <input
                      type="text"
                      value={formData.avs_number || ''}
                      onChange={(e) => setFormData({...formData, avs_number: formatAVS(e.target.value)})}
                      className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      placeholder="756.XXXX.XXXX.XX"
                      maxLength={16}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Numéro J+S</label>
                    <input
                      type="text"
                      value={formData.js_number || ''}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/[^\d]/g, '');
                        const limited = digits.slice(0, 9);
                        setFormData({...formData, js_number: limited});
                      }}
                      className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      placeholder="Ex: 123456789 (max 9 chiffres)"
                      maxLength={9}
                    />
                  </div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
                <h3 className="text-lg font-semibold mb-4 border-b pb-2" style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>Coordonnées</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Email privé</label>
                    <input
                      type="email"
                      value={formData.email || ''}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Email entreprise</label>
                    <input
                      type="email"
                      value={formData.email_pro || ''}
                      onChange={(e) => setFormData({...formData, email_pro: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      placeholder="Optionnel"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Mobile</label>
                    <PhoneInput
                      value={formData.phone || ''}
                      onChange={(v) => setFormData({ ...formData, phone: v })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Téléphone privé (fixe)</label>
                    <PhoneInput
                      value={formData.phone_private || ''}
                      onChange={(v) => setFormData({ ...formData, phone_private: v })}
                    />
                  </div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
                <h3 className="text-lg font-semibold mb-4 border-b pb-2" style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>Adresse</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <div style={{ flex: 3 }}>
                        <label className="block text-sm font-medium mb-2">Rue</label>
                        <input
                          type="text"
                          value={formData.address || ''}
                          onChange={(e) => setFormData({...formData, address: e.target.value})}
                          placeholder="Route de la Fontaine"
                          className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label className="block text-sm font-medium mb-2">N°</label>
                        <input
                          type="text"
                          value={formData.street_number || ''}
                          onChange={(e) => setFormData({...formData, street_number: e.target.value})}
                          placeholder="77"
                          className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-2">Adresse supplémentaire</label>
                    <input
                      type="text"
                      value={formData.address2 || ''}
                      onChange={(e) => setFormData({...formData, address2: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      placeholder="Optionnel"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Code postal</label>
                    <input
                      type="text"
                      value={formData.postal_code || ''}
                      onChange={(e) => setFormData({...formData, postal_code: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Ville</label>
                    <input
                      type="text"
                      value={formData.city || ''}
                      onChange={(e) => setFormData({...formData, city: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Canton</label>
                    <input
                      type="text"
                      value={formData.canton || ''}
                      onChange={(e) => setFormData({...formData, canton: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Pays de résidence</label>
                    <CountrySelect
                      value={formData.country || 'CH'}
                      onChange={(v) => setFormData({...formData, country: v || 'CH'})}
                    />
                  </div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
                <h3 className="text-lg font-semibold mb-4 border-b pb-2" style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>Club</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Équipe</label>
                    <select
                      value={formData.team_id || ''}
                      onChange={(e) => setFormData({...formData, team_id: e.target.value || null})}
                      className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    >
                      <option value="">Aucune</option>
                      {teams.map(team => (
                        <option key={team.id} value={team.id}>
                          {team.name} {team.team_categories?.name ? `(${team.team_categories.name})` : ''}
                        </option>
                      ))}
                    </select>
                    {secondaryTeamIds.length > 0 && (
                      <div className="mt-2">
                        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Équipes secondaires :</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {secondaryTeamIds.map(tid => {
                            const t = teams.find(t => t.id === tid);
                            return t ? (
                              <span key={tid} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs" style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
                                {t.name}
                                {editingMember && (
                                  <button type="button" className="ml-0.5 hover:opacity-70" onClick={async () => {
                                    await supabase.from('team_members').delete().eq('team_id', tid).eq('member_id', editingMember.id);
                                    setSecondaryTeamIds(prev => prev.filter(id => id !== tid));
                                  }}><X size={12} /></button>
                                )}
                              </span>
                            ) : null;
                          })}
                        </div>
                      </div>
                    )}
                    {editingMember && (
                      <div className="mt-2">
                        {addingSecondaryTeam ? (
                          <select
                            autoFocus
                            value=""
                            onChange={async (e) => {
                              const tid = e.target.value;
                              if (!tid || !clubId) return;
                              await supabase.from('team_members').insert({ team_id: tid, member_id: editingMember.id, club_id: clubId });
                              setSecondaryTeamIds(prev => [...prev, tid]);
                              setAddingSecondaryTeam(false);
                            }}
                            onBlur={() => setAddingSecondaryTeam(false)}
                            className="w-full px-2 py-1 rounded-lg text-sm focus:ring-2 focus:ring-[var(--accent)]" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                          >
                            <option value="">Choisir une équipe…</option>
                            {teams.filter(t => t.id !== formData.team_id && !secondaryTeamIds.includes(t.id)).map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        ) : (
                          <button type="button" onClick={() => setAddingSecondaryTeam(true)} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>
                            + Ajouter une équipe secondaire
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Numéro de licence ASF</label>
                    <input
                      type="text"
                      value={formData.asf_licence_number || ''}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/[^\d]/g, '');
                        const limited = digits.slice(0, 7);
                        setFormData({...formData, asf_licence_number: limited});
                      }}
                      className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      placeholder="Ex: 123456 (max 7 chiffres)"
                      maxLength={7}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Statut licence</label>
                    <select
                      value={formData.licence_status || 'actif'}
                      onChange={(e) => setFormData({...formData, licence_status: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    >
                      <option value="actif">Actif</option>
                      <option value="en_attente">En attente</option>
                      <option value="declare_partant">Déclaré partant</option>
                      <option value="parti">Parti</option>
                      <option value="inactif">Inactif</option>
                      <option value="suspendu">Suspendu</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Date d'affiliation</label>
                    <input
                      type="date"
                      value={formData.affiliation_date || ''}
                      onChange={(e) => setFormData({...formData, affiliation_date: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Club d'origine</label>
                    <input
                      type="text"
                      value={formData.club_origine || ''}
                      onChange={(e) => setFormData({...formData, club_origine: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      placeholder="Ex: FC Exemple"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Classe de jeu</label>
                    <input
                      type="text"
                      value={formData.classe_de_jeu || ''}
                      onChange={(e) => setFormData({...formData, classe_de_jeu: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      placeholder="Ex: 2ème ligue, 3ème ligue..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Position (catégorie)</label>
                    <select
                      value={formData.position || ''}
                      onChange={(e) => setFormData({...formData, position: e.target.value || null})}
                      className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    >
                      <option value="">Non spécifié</option>
                      <option value="Gardien">Gardien</option>
                      <option value="Défenseur">Défenseur</option>
                      <option value="Milieu">Milieu</option>
                      <option value="Attaquant">Attaquant</option>
                      <option value="Autre">Autre</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Poste principal</label>
                    <select
                      value={formData.position_main_id || ''}
                      onChange={(e) => setFormData({...formData, position_main_id: e.target.value || null})}
                      className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    >
                      <option value="">Non spécifié</option>
                      {positionGroups.map(group => (
                        <optgroup key={group.category} label={group.category}>
                          {group.positions.map(pos => (
                            <option key={pos.id} value={pos.id}>{pos.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Poste secondaire</label>
                    <select
                      value={formData.position_secondary_id || ''}
                      onChange={(e) => setFormData({...formData, position_secondary_id: e.target.value || null})}
                      className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    >
                      <option value="">Non spécifié</option>
                      {positionGroups.map(group => (
                        <optgroup key={group.category} label={group.category}>
                          {group.positions.map(pos => (
                            <option key={pos.id} value={pos.id}>{pos.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Numéro de maillot</label>
                    <input
                      type="number"
                      min={0}
                      max={99}
                      value={formData.jersey_number != null ? formData.jersey_number : ''}
                      onChange={(e) => setFormData({...formData, jersey_number: e.target.value === '' ? null : Math.min(99, Math.max(0, parseInt(e.target.value, 10) || 0))})}
                      className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      placeholder="0–99"
                    />
                  </div>
                  <div className="col-span-2 flex flex-col gap-2 pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
                    <div className="flex items-center gap-3">
                      <Toggle checked={formData.receives_convocations !== false} onChange={(v) => setFormData({...formData, receives_convocations: v})} />
                      <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Reçoit les convocations</label>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--text-muted)', lineHeight: '1.45' }}>Désactivé : le joueur n'est pas proposé dans les compositions et ne reçoit ni convocations de match ni rappels d'entraînement (membre passif, joueur qui ne joue plus).</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Type de qualification</label>
                    <input
                      type="text"
                      value={formData.qualification_type || ''}
                      onChange={(e) => setFormData({...formData, qualification_type: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      placeholder="Ex: Transfert, Requalification"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Qualifié dès le</label>
                    <input
                      type="date"
                      value={formData.qualified_from || ''}
                      onChange={(e) => setFormData({...formData, qualified_from: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Qualifié à</label>
                    <input
                      type="date"
                      value={formData.qualified_until || ''}
                      onChange={(e) => setFormData({...formData, qualified_until: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  {groupementClubs.length > 0 && (
                    <div className="col-span-2 flex flex-col gap-3 pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
                      <div className="flex items-center gap-3">
                        <Toggle checked={groupementToggle} onChange={(v) => {
                          setGroupementToggle(v);
                          if (v) {
                            setFormData({ ...formData, status: 'groupement' });
                          } else {
                            setSelectedClubRow('');
                            setFormData({
                              ...formData,
                              groupement_id: null,
                              origin_club_name: null,
                              origin_club_asf_number: null,
                              status: formData.status === 'groupement' ? 'actif' : formData.status,
                            });
                          }
                        }} size="sm" />
                        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Joueur d'un groupement</span>
                      </div>
                      {groupementToggle && (
                        <div>
                          <label className="block text-sm font-medium mb-2">Club du joueur *</label>
                          <select
                            value={selectedClubRow}
                            onChange={(e) => {
                              const row = groupementClubs.find(gc => gc.id === e.target.value);
                              setSelectedClubRow(e.target.value);
                              if (row) {
                                setFormData({
                                  ...formData,
                                  groupement_id: row.groupement_id,
                                  origin_club_name: row.club_name,
                                  origin_club_asf_number: row.club_asf_number,
                                  status: 'groupement',
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  groupement_id: null,
                                  origin_club_name: null,
                                  origin_club_asf_number: null,
                                });
                              }
                            }}
                            className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                            required
                          >
                            <option value="">-- Choisir le club d'origine --</option>
                            {groupementClubs.map(gc => (
                              <option key={gc.id} value={gc.id}>
                                {gc.club_name}{hasMultipleGroupements ? ` (${gc.groupement_name})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'legal' && (
            <div className="space-y-6" style={{ background: 'var(--bg-app)', borderRadius: '8px' }}>
              {showLegalRepWarning && (
                <div className="bg-[var(--warning-soft)] border border-[var(--warning)] rounded-lg p-4">
                  <p className="text-sm text-[var(--warning-text)]">
                    <AlertTriangle className="w-4 h-4 inline mr-1" />Le joueur a moins de 18 ans. Il est recommandé d'ajouter les représentants légaux.
                  </p>
                </div>
              )}

              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
                <div className="flex items-center gap-3 mb-4">
                  <input
                    type="checkbox"
                    id="showRep1"
                    checked={showRep1}
                    onChange={(e) => setShowRep1(e.target.checked)}
                    className="w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="showRep1" className="text-lg font-semibold cursor-pointer">
                    Ajouter le représentant légal 1
                  </label>
                </div>

                {showRep1 && (
                  <div className="space-y-4 pl-4 border-l-2 border-[var(--border-color)]">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Prénom</label>
                        <input
                          type="text"
                          value={formData.legal_rep1_firstname || ''}
                          onChange={(e) => setFormData({...formData, legal_rep1_firstname: e.target.value})}
                          className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Nom</label>
                        <input
                          type="text"
                          value={formData.legal_rep1_lastname || ''}
                          onChange={(e) => setFormData({...formData, legal_rep1_lastname: e.target.value})}
                          className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Relation</label>
                        <select
                          value={formData.legal_rep1_relation || ''}
                          onChange={(e) => setFormData({...formData, legal_rep1_relation: e.target.value})}
                          className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        >
                          <option value="">Sélectionner</option>
                          <option value="Père">Père</option>
                          <option value="Mère">Mère</option>
                          <option value="Tuteur">Tuteur</option>
                          <option value="Autre">Autre</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Email</label>
                        <input
                          type="email"
                          value={formData.legal_rep1_email || ''}
                          ref={rep1EmailRef}
                          onChange={(e) => setFormData({...formData, legal_rep1_email: e.target.value})}
                          className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium mb-2">Mobile</label>
                        <PhoneInput
                          value={formData.legal_rep1_phone || ''}
                          onChange={(v) => setFormData({ ...formData, legal_rep1_phone: v })}
                        />
                      </div>
                    </div>

                    <div className="pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
                      <div className="flex items-center gap-3 mb-4">
                        <input
                          type="checkbox"
                          id="rep1SameAddress"
                          checked={rep1SameAddress}
                          onChange={(e) => {
                            setRep1SameAddress(e.target.checked);
                            if (e.target.checked) {
                              setFormData({
                                ...formData,
                                legal_rep1_address: formData.address,
                                legal_rep1_postal_code: formData.postal_code,
                                legal_rep1_city: formData.city,
                                legal_rep1_canton: formData.canton
                              });
                            }
                          }}
                          className="w-4 h-4 cursor-pointer"
                        />
                        <label htmlFor="rep1SameAddress" className="text-sm font-medium cursor-pointer">
                          Même adresse que le joueur
                        </label>
                      </div>

                      {!rep1SameAddress && (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="col-span-2">
                            <div style={{ display: 'flex', gap: '12px' }}>
                              <div style={{ flex: 3 }}>
                                <label className="block text-sm font-medium mb-2">Rue</label>
                                <input
                                  type="text"
                                  value={formData.legal_rep1_address || ''}
                                  onChange={(e) => setFormData({...formData, legal_rep1_address: e.target.value})}
                                  placeholder="Route de la Fontaine"
                                  className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                />
                              </div>
                              <div style={{ flex: 1 }}>
                                <label className="block text-sm font-medium mb-2">N°</label>
                                <input
                                  type="text"
                                  value={formData.legal_rep1_street_number || ''}
                                  onChange={(e) => setFormData({...formData, legal_rep1_street_number: e.target.value})}
                                  placeholder="77"
                                  className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                />
                              </div>
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-2">Code postal</label>
                            <input
                              type="text"
                              value={formData.legal_rep1_postal_code || ''}
                              onChange={(e) => setFormData({...formData, legal_rep1_postal_code: e.target.value})}
                              className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-2">Ville</label>
                            <input
                              type="text"
                              value={formData.legal_rep1_city || ''}
                              onChange={(e) => setFormData({...formData, legal_rep1_city: e.target.value})}
                              className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-sm font-medium mb-2">Canton</label>
                            <input
                              type="text"
                              value={formData.legal_rep1_canton || ''}
                              onChange={(e) => setFormData({...formData, legal_rep1_canton: e.target.value})}
                              className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
                <div className="flex items-center gap-3 mb-4">
                  <input
                    type="checkbox"
                    id="showRep2"
                    checked={showRep2}
                    onChange={(e) => setShowRep2(e.target.checked)}
                    className="w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="showRep2" className="text-lg font-semibold cursor-pointer">
                    Ajouter un deuxième représentant légal
                  </label>
                </div>

                {showRep2 && (
                  <div className="space-y-4 pl-4 border-l-2 border-[var(--border-color)]">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Prénom</label>
                        <input
                          type="text"
                          value={formData.legal_rep2_firstname || ''}
                          onChange={(e) => setFormData({...formData, legal_rep2_firstname: e.target.value})}
                          className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Nom</label>
                        <input
                          type="text"
                          value={formData.legal_rep2_lastname || ''}
                          onChange={(e) => setFormData({...formData, legal_rep2_lastname: e.target.value})}
                          className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Relation</label>
                        <select
                          value={formData.legal_rep2_relation || ''}
                          onChange={(e) => setFormData({...formData, legal_rep2_relation: e.target.value})}
                          className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        >
                          <option value="">Sélectionner</option>
                          <option value="Père">Père</option>
                          <option value="Mère">Mère</option>
                          <option value="Tuteur">Tuteur</option>
                          <option value="Autre">Autre</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Email</label>
                        <input
                          type="email"
                          value={formData.legal_rep2_email || ''}
                          ref={rep2EmailRef}
                          onChange={(e) => setFormData({...formData, legal_rep2_email: e.target.value})}
                          className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium mb-2">Mobile</label>
                        <PhoneInput
                          value={formData.legal_rep2_phone || ''}
                          onChange={(v) => setFormData({ ...formData, legal_rep2_phone: v })}
                        />
                      </div>
                    </div>

                    <div className="pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
                      <div className="flex items-center gap-3 mb-4">
                        <input
                          type="checkbox"
                          id="rep2SameAddress"
                          checked={rep2SameAddress}
                          onChange={(e) => {
                            setRep2SameAddress(e.target.checked);
                            if (e.target.checked) {
                              setFormData({
                                ...formData,
                                legal_rep2_address: formData.address,
                                legal_rep2_postal_code: formData.postal_code,
                                legal_rep2_city: formData.city,
                                legal_rep2_canton: formData.canton
                              });
                            }
                          }}
                          className="w-4 h-4 cursor-pointer"
                        />
                        <label htmlFor="rep2SameAddress" className="text-sm font-medium cursor-pointer">
                          Même adresse que le joueur
                        </label>
                      </div>

                      {!rep2SameAddress && (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="col-span-2">
                            <div style={{ display: 'flex', gap: '12px' }}>
                              <div style={{ flex: 3 }}>
                                <label className="block text-sm font-medium mb-2">Rue</label>
                                <input
                                  type="text"
                                  value={formData.legal_rep2_address || ''}
                                  onChange={(e) => setFormData({...formData, legal_rep2_address: e.target.value})}
                                  placeholder="Route de la Fontaine"
                                  className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                />
                              </div>
                              <div style={{ flex: 1 }}>
                                <label className="block text-sm font-medium mb-2">N°</label>
                                <input
                                  type="text"
                                  value={formData.legal_rep2_street_number || ''}
                                  onChange={(e) => setFormData({...formData, legal_rep2_street_number: e.target.value})}
                                  placeholder="77"
                                  className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                />
                              </div>
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-2">Code postal</label>
                            <input
                              type="text"
                              value={formData.legal_rep2_postal_code || ''}
                              onChange={(e) => setFormData({...formData, legal_rep2_postal_code: e.target.value})}
                              className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-2">Ville</label>
                            <input
                              type="text"
                              value={formData.legal_rep2_city || ''}
                              onChange={(e) => setFormData({...formData, legal_rep2_city: e.target.value})}
                              className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-sm font-medium mb-2">Canton</label>
                            <input
                              type="text"
                              value={formData.legal_rep2_canton || ''}
                              onChange={(e) => setFormData({...formData, legal_rep2_canton: e.target.value})}
                              className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>


            </div>
          )}

          {activeTab === 'notes' && (
            <div className="space-y-6" style={{ background: 'var(--bg-app)', borderRadius: '8px' }}>
              <div className="flex items-center justify-between" style={{ padding: '12px 16px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
                <div>
                  <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>À facturer</label>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Si désactivé, ce membre est exclu de l'émission en masse des factures.</p>
                </div>
                <Toggle
                  checked={formData.billable !== false}
                  onChange={(checked) => setFormData({ ...formData, billable: checked })}
                />
              </div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
                <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>Autorisations</h4>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Autorisation photo (site, réseaux sociaux)</label>
                    <div className="flex flex-col gap-2 mt-1">
                      {([
                        { value: true, label: 'Oui' },
                        { value: false, label: 'Non' },
                        { value: null, label: 'Pas de réponse' },
                      ] as { value: boolean | null; label: string }[]).map((opt) => (
                        <label key={String(opt.value)} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="photo_consent"
                            checked={(formData as any).photo_consent === opt.value}
                            onChange={() => {
                              const today = new Date().toISOString().slice(0, 10);
                              setFormData({ ...formData, photo_consent: opt.value, photo_consent_date: opt.value !== null ? today : (formData as any).photo_consent_date } as any);
                            }}
                            style={{ accentColor: 'var(--accent)' }}
                          />
                          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Concerne uniquement le site internet du club, les réseaux sociaux et les publications. Sans réponse, le club considère que c'est non.</p>
                  </div>
                </div>
              </div>
              {websiteEnabled && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
                <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>Site internet</h4>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(formData as any).hide_from_site === true}
                    onChange={(e) => setFormData({ ...formData, hide_from_site: e.target.checked } as any)}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Ne pas apparaître sur le site du club</span>
                </label>
                <p className="text-xs mt-1 ml-5" style={{ color: 'var(--text-muted)' }}>Le nom de ce joueur ne sera jamais publié sur le site internet du club.</p>
              </div>
              )}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
                <label className="block text-sm font-medium mb-2">Notes internes</label>
                <textarea
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  rows={8}
                  className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  placeholder="Ajoutez des notes internes visibles uniquement par l'équipe administrative..."
                />
              </div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
                <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>Départ</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Date de départ</label>
                    <input
                      type="date"
                      value={formData.departure_date || ''}
                      onChange={(e) => setFormData({...formData, departure_date: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Club de destination</label>
                    <input
                      type="text"
                      value={formData.departure_club || ''}
                      onChange={(e) => setFormData({...formData, departure_club: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      placeholder="Nom du club"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-2">Note de départ</label>
                    <textarea
                      value={formData.departure_note || ''}
                      onChange={(e) => setFormData({...formData, departure_note: e.target.value})}
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      placeholder="Raison du départ..."
                    />
                  </div>
                </div>
              </div>
              {user?.role === 'admin' && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
                  <label className="block text-sm font-medium mb-2">
                    Remarques ClubCorner
                    <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>(Importé depuis ClubCorner)</span>
                  </label>
                  <textarea
                    value={formData.remarques_club || ''}
                    onChange={(e) => setFormData({...formData, remarques_club: e.target.value})}
                    rows={6}
                    className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    placeholder="Remarques importées depuis ClubCorner..."
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end pt-4 border-t sticky bottom-0" style={{ gap: '12px', borderColor: 'var(--border-color)', background: 'var(--bg-app)', paddingBottom: '16px' }}>
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" loading={saving || checkingAccount} disabled={saving || checkingAccount}>
              {editingMember ? 'Enregistrer' : 'Créer'}
            </Button>
          </div>
        </form>
      </div>
    </div>

    <StandardModal
      isOpen={!!pendingMatch}
      onClose={cancelMatch}
      title="Compte existant détecté"
      width="440px"
    >
      <p style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--text-primary)', margin: 0 }}>
        Un compte existe pour cet email : <strong>{pendingMatch?.name}</strong>. Il sera
        automatiquement lié comme parent de <strong>{(formData.first_name || '').trim() || "l'enfant"}</strong>.
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
        <Button type="button" variant="secondary" onClick={cancelMatch}>
          Annuler
        </Button>
        <Button type="button" variant="primary" onClick={confirmMatchAndSave}>
          OK
        </Button>
      </div>
    </StandardModal>


    </>
  );
}
