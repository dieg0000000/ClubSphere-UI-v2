import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, CreditCard as Edit2, Trash2, Upload, X, Users, KeyRound, Download, Camera, User, Mail, Smartphone, Phone, MapPin, Trophy, Handshake, Hand, Shield, Zap, Circle as CircleHelp, Ban, Archive, Moon, DoorOpen, FileText, Clipboard, RefreshCw, SkipForward, TrendingUp, TrendingDown, TriangleAlert as AlertTriangle, Check, CircleCheck as CheckCircle, Circle as XCircle, Pencil, Hop as Home, Lightbulb, Clock, ArrowDown, UserMinus } from 'lucide-react';
import SearchInput from '../components/ui/SearchInput';
import Button from '../components/ui/Button';
import CreateUserModal from '../components/CreateUserModal';
import { useAuth } from '../context/AuthContext';
import { useModuleAccess } from '../hooks/useModuleAccess';
import { useFinanceModuleEnabled } from '../hooks/useFinanceModuleEnabled';
import { useWebsiteModuleEnabled } from '../hooks/useWebsiteModuleEnabled';
import { updateUserEmail } from '../lib/updateEmail';
import { SortableHeader } from '../components/SortableHeader';
import { DepartureReminderBanner } from '../components/DepartureReminderBanner';
import { PlayerFormModal } from '../components/PlayerFormModal';
import GroupementBadge from '../components/GroupementBadge';
import { Badge } from '../components/ui/Badge';
import { Tabs } from '../components/ui/Tabs';
import { formatAVS, validateAVS } from '../utils/formatHelpers';
import { checkAVSUnique, checkJSUnique, fetchFullDuplicateInfo } from '../utils/validationHelpers';
import { computeSiblingDiscounts } from '../utils/siblingDiscount';
import { StandardModal } from '../components/StandardModal';
import { Alert } from '../components/ui/Alert';
import { Toggle } from '../components/Toggle';
import DuplicatePersonModal from '../components/DuplicatePersonModal';
import PageTitleCount from '../components/PageTitleCount';
import { MaskedAVS } from '../components/MaskedAVS';
import useEscapeKey from '../hooks/useEscapeKey';
import PlayerProfileTab from '../components/PlayerProfileTab';
import MemberHistoryTab from '../components/MemberHistoryTab';
import ConfirmModal from '../components/ConfirmModal';
import {
  isFemale,
  getCurrentSeasonAge,
  getFutureSeasonAge,
  getCategory,
  ALL_CATEGORIES,
} from '../utils/simulationHelpers';
import { GroupementImportModal } from '../components/GroupementImportModal';
import { importMembers, ParsedRow } from '../utils/memberImport';
import { availabilityLabel, availabilityBadgeVariant, availabilitySummary } from '../utils/availabilityHelpers';
import { useMemberPhotos, useRefreshablePhoto, invalidateMemberPhoto } from '../hooks/useMemberPhotos';
import { getMemberPhotoUrl } from '../utils/memberPhotoUrl';
import { processPassportPhoto } from '../lib/imageProcessing';
import { ZoomablePhoto } from '../components/PhotoViewer';

interface Member {
  id: string;
  first_name: string;
  last_name: string;
  second_name: string | null;
  birth_date: string | null;
  nationality: string | null;
  football_nationality: string | null;
  country: string | null;
  pseudonym: string | null;
  salutation: string | null;
  avs_number: string | null;
  asf_licence_number: string | null;
  email: string | null;
  email_pro: string | null;
  phone: string | null;
  phone_private: string | null;
  address: string | null;
  street_number: string | null;
  address2: string | null;
  postal_code: string | null;
  city: string | null;
  canton: string | null;
  team_id: string | null;
  club_id?: string | null;
  js_number: string | null;
  licence_status: string;
  departure_note: string | null;
  departure_date: string | null;
  departure_club: string | null;
  legal_rep1_firstname: string | null;
  legal_rep1_lastname: string | null;
  legal_rep1_relation: string | null;
  legal_rep1_phone: string | null;
  legal_rep1_email: string | null;
  legal_rep1_address: string | null;
  legal_rep1_street_number: string | null;
  legal_rep1_postal_code: string | null;
  legal_rep1_city: string | null;
  legal_rep1_canton: string | null;
  legal_rep2_firstname: string | null;
  legal_rep2_lastname: string | null;
  legal_rep2_relation: string | null;
  legal_rep2_phone: string | null;
  legal_rep2_email: string | null;
  legal_rep2_address: string | null;
  legal_rep2_street_number: string | null;
  legal_rep2_postal_code: string | null;
  legal_rep2_city: string | null;
  legal_rep2_canton: string | null;
  notes: string | null;
  gender: string | null;
  affiliation_date: string | null;
  club_origine: string | null;
  classe_de_jeu: string | null;
  position: string | null;
  position_main_id: string | null;
  position_secondary_id: string | null;
  qualification_type: string | null;
  qualified_from: string | null;
  qualified_until: string | null;
  remarques_club: string | null;
  status: string | null;
  groupement_id: string | null;
  origin_club_asf_number: string | null;
  origin_club_name: string | null;
  photo_path: string | null;
  photo_url: string | null;
  billable: boolean;
  fee_exempt: boolean;
  fee_exempt_reason: string | null;
  availability: string | null;
  availability_until: string | null;
  availability_note: string | null;
  availability_updated_at: string | null;
  jersey_number: number | null;
  receives_convocations: boolean;
  teams?: { name: string } | null;
  groupements?: { id: string; name: string } | null;
}

interface Team {
  id: string;
  name: string;
  type?: 'junior' | 'active';
  team_categories?: { name: string };
}

function SecondaryTeamsReadOnly({ memberId, primaryTeamId }: { memberId: string; primaryTeamId: string | null }) {
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    supabase
      .from('team_members')
      .select('team_id, teams:team_id(id, name)')
      .eq('member_id', memberId)
      .then(({ data }) => {
        if (cancelled) return;
        const rows = (data || [])
          .map((r: any) => r.teams)
          .filter((t: any) => t && t.id !== primaryTeamId);
        setTeams(rows);
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [memberId, primaryTeamId]);
  if (!loaded) return <p className="text-[var(--text-primary)]">…</p>;
  if (teams.length === 0) return <p className="text-[var(--text-primary)]">–</p>;
  return (
    <div>
      {teams.map(t => <p key={t.id} className="text-[var(--text-primary)]">{t.name}</p>)}
    </div>
  );
}

export default function AdminAnuaireJoueurs() {
  const { user, effectiveRole } = useAuth();
  const isAdminOrCommittee = effectiveRole === 'admin' || effectiveRole === 'committee';
  const { canEdit, loading: accessLoading } = useModuleAccess('joueurs');
  const { enabled: financeEnabled } = useFinanceModuleEnabled();
  const { enabled: websiteEnabled } = useWebsiteModuleEnabled()

  useEffect(() => {
    if (!financeEnabled) {
      setDetailTab(prev => (prev === 'facturation' ? 'profil' : prev));
    }
  }, [financeEnabled]);
  const [members, setMembers] = useState<Member[]>([]);
  const [countryNames, setCountryNames] = useState<Record<string, string>>({});
  const [totalCount, setTotalCount] = useState(0);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showGroupementImport, setShowGroupementImport] = useState(false);
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [detailTab, setDetailTab] = useState<'profil' | 'legal' | 'club' | 'notes' | 'facturation' | 'evaluation' | 'historique'>('profil');
  const detailPanelRef = useRef<HTMLDivElement>(null);
  const [detailScrolled, setDetailScrolled] = useState(false);
  const [availForm, setAvailForm] = useState({ availability: 'disponible', until: '', note: '' });
  const [availSaving, setAvailSaving] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [createAccessFor, setCreateAccessFor] = useState<Member | null>(null);
  const [importPreview, setImportPreview] = useState<Partial<Member & { _affiliation?: string; _ligue?: string }>[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [memberInvoices, setMemberInvoices] = useState<any[]>([]);
  const [importResult, setImportResult] = useState<{
    imported: number;
    updated: number;
    skipped: number;
    teamsCreated: Array<{ name: string; category: string | null; type: string }>;
    teamsWithoutCategory: string[];
    playersWithoutTeam: number;
    skippedReasons?: Array<{ name: string; reason: string; matchField?: string }>;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTeam, setFilterTeam] = useState('');
  const [filterStatus, setFilterStatus] = useState('active');
  const [simulateDecember, setSimulateDecember] = useState(false);
  const [filterGender, setFilterGender] = useState('');
  const [showWithoutTeam, setShowWithoutTeam] = useState(false);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [sortField, setSortField] = useState<string>('last_name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [siblingMap, setSiblingMap] = useState<Record<string, string[]>>({});
  const [parentChildrenMap, setParentChildrenMap] = useState<Record<string, string[]>>({});
  const [importProgress, setImportProgress] = useState({
    active: false,
    current: 0,
    total: 0,
    phase: '',
    teamsCreated: 0,
    playersImported: 0,
    playersUpdated: 0,
    playersSkipped: 0,
    currentPlayer: '',
    errors: [] as string[]
  });
  const [duplicateInfo, setDuplicateInfo] = useState<{ type: 'avs' | 'js' | 'asf'; person: any; crossTable?: boolean } | null>(null);
  const [linking, setLinking] = useState(false);
  const skipCrossTableRef = useRef(false);
  const pendingLinkRef = useRef<{ table: string; id: string; email?: string | null } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showSimulationModal, setShowSimulationModal] = useState(false);
  const [showAddToTeamModal, setShowAddToTeamModal] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [activeFormTab, setActiveFormTab] = useState<'player' | 'legal' | 'notes'>('player');
  const [showRep1, setShowRep1] = useState(false);
  const [showRep2, setShowRep2] = useState(false);

  const [activeSeason, setActiveSeason] = useState<any>(null);
  const [financeConfig, setFinanceConfig] = useState<any>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceModalData, setInvoiceModalData] = useState<{
    member: Member;
    baseAmount: number;
    amount: number;
    isSecondTour: boolean;
    reason: string;
    fratrie_discount_pct: number;
    fratrie_discount_amount: number;
    fratrie_sibling_count: number;
  } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [invoiceMap, setInvoiceMap] = useState<Record<string, { id: string; invoice_number: string; status: string }>>({});
  const [downloadingInvoice, setDownloadingInvoice] = useState<string | null>(null);
  const [rep1SameAddress, setRep1SameAddress] = useState(true);
  const [rep2SameAddress, setRep2SameAddress] = useState(true);
  const [showSiblingsModal, setShowSiblingsModal] = useState(false);
  const [siblings, setSiblings] = useState<any[]>([]);

  // Parent accounts for detail drawer
  interface ParentAccount {
    parentMemberId: string;
    profileId: string;
    fullName: string;
    email: string;
    linkedAt: string;
    source: 'auto' | 'activation' | 'committee' | null;
    approvedAt: string | null;
  }
  const [parentAccounts, setParentAccounts] = useState<ParentAccount[]>([]);
  const [parentAccountsLoading, setParentAccountsLoading] = useState(false);
  const [parentAccountsError, setParentAccountsError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ParentAccount | null>(null);
  const [removing, setRemoving] = useState(false);

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

  const [formData, setFormData] = useState<Partial<Member>>({
    first_name: '',
    last_name: '',
    licence_status: 'actif',
    gender: 'M',
    billable: true
  });

  const getGenreLabel = (genre: string | null | undefined) => {
    if (!genre) return '—';
    const g = genre.toUpperCase().trim();
    if (g === 'F') return 'Féminin';
    if (g === 'M') return 'Masculin';
    return genre;
  };

  useEffect(() => {
    document.title = 'Admin Joueurs - ClubSphere'
    fetchMembers();
    fetchTeams();
    fetchTotalCount();
    fetchSeasonAndConfig();
    fetchSiblingMap();
    supabase.from('countries').select('code, name_fr').eq('active', true).then(({ data }) => {
      if (data) setCountryNames(Object.fromEntries(data.map(c => [c.code, c.name_fr])));
    });
  }, []);

  useEffect(() => {
    if (selectedMember?.id) {
      fetchMemberInvoices(selectedMember.id);
    }
  }, [selectedMember]);

  const handleCloseDetailPanel = useCallback(() => {
    setShowDetailPanel(false);
    setSelectedMember(null);
    setDetailTab('profil');
  }, []);

  const handleClosePlayerModal = useCallback(() => {
    setShowModal(false);
  }, []);

  const handleCloseImportModal = useCallback(() => {
    setShowImportModal(false);
  }, []);

  const handleCloseDuplicateModal = useCallback(() => {
    setDuplicateInfo(null);
    pendingLinkRef.current = null;
    skipCrossTableRef.current = false;
  }, []);

  const handleCloseSimulationModal = useCallback(() => {
    setShowSimulationModal(false);
  }, []);

  const handleCloseAddToTeamModal = useCallback(() => {
    setShowAddToTeamModal(false);
  }, []);

  useEscapeKey(handleCloseDetailPanel);
  useEscapeKey(handleClosePlayerModal);
  useEscapeKey(handleCloseImportModal);
  useEscapeKey(handleCloseDuplicateModal);
  useEscapeKey(handleCloseSimulationModal);
  useEscapeKey(handleCloseAddToTeamModal);

  const fetchTotalCount = async () => {
    const { count, error } = await supabase
      .from('members')
      .select('*', { count: 'exact', head: true });

    if (!error && count !== null) {
      setTotalCount(count);
    }
  };

  const fetchSeasonAndConfig = async () => {
    const { data: season } = await supabase
      .from('seasons')
      .select('*')
      .eq('active', true)
      .maybeSingle();

    setActiveSeason(season);

    const { data: config } = await supabase
      .from('finance_config')
      .select('*')
      .maybeSingle();

    setFinanceConfig(config);
  };

  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadParentAccounts = useCallback(async (member: Member | null) => {
    if (!member?.id) { setParentAccounts([]); setParentAccountsError(null); return; }
    setParentAccountsLoading(true);
    setParentAccountsError(null);
    const { data: links, error } = await supabase
      .from('parent_members')
      .select('id, parent_user_id, created_at, source, profiles:parent_user_id(id, full_name, first_name, last_name, email, phone)')
      .eq('member_id', member.id);
    if (error) {
      console.error('[ParentAccounts] Failed to load parent accounts for member', member.id, error);
      setParentAccountsError(error.message);
      setParentAccounts([]);
      setParentAccountsLoading(false);
      return;
    }
    if (!links || links.length === 0) {
      setParentAccounts([]);
      setParentAccountsLoading(false);
      return;
    }

    const rows: ParentAccount[] = links.map(l => {
      const prof = Array.isArray(l.profiles) ? l.profiles[0] : l.profiles;
      const nameParts = [prof?.first_name, prof?.last_name].filter(Boolean).join(' ').trim();
      const displayName = nameParts || prof?.full_name || prof?.email || 'Inconnu';
      return {
        parentMemberId: l.id,
        profileId: l.parent_user_id,
        fullName: displayName,
        email: prof?.email || '',
        linkedAt: l.created_at,
        source: (l as any).source ?? null,
        approvedAt: null,
      };
    });
    setParentAccounts(rows);
    setParentAccountsLoading(false);
  }, []);

  const handleRemoveParentAccess = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    const { error } = await supabase
      .from('parent_members')
      .delete()
      .eq('id', removeTarget.parentMemberId);
    setRemoving(false);
    if (error) {
      showToast(error.message || 'Erreur lors du retrait de l\'accès.', 'error');
    } else {
      showToast('Accès retiré avec succès.', 'success');
      await loadParentAccounts(selectedMember);
    }
    setRemoveTarget(null);
  };

  const fetchSiblingMap = async () => {
    const [{ data: allRows }, { data: pmLinks }] = await Promise.all([
      supabase
        .from('members')
        .select('id, legal_rep1_email, legal_rep2_email')
        .neq('status', 'archive'),
      supabase
        .from('parent_members')
        .select('parent_user_id, member_id'),
    ]);
    if (!allRows) return;

    const ufParent: Record<string, string> = {};
    const ufFind = (x: string): string => {
      while (ufParent[x] !== x) { ufParent[x] = ufParent[ufParent[x]]; x = ufParent[x]; }
      return x;
    };
    const ufUnion = (a: string, b: string) => { ufParent[ufFind(a)] = ufFind(b); };

    const emailToIds: Record<string, string[]> = {};
    for (const m of allRows) {
      ufParent[m.id] = m.id;
      const emails = [
        m.legal_rep1_email?.trim().toLowerCase(),
        m.legal_rep2_email?.trim().toLowerCase(),
      ].filter(Boolean) as string[];
      for (const email of emails) {
        if (!emailToIds[email]) emailToIds[email] = [];
        emailToIds[email].push(m.id);
      }
    }
    for (const ids of Object.values(emailToIds)) {
      for (let i = 1; i < ids.length; i++) ufUnion(ids[0], ids[i]);
    }

    const idSet = new Set(allRows.map(m => m.id));
    const parentToKids: Record<string, string[]> = {};
    for (const link of (pmLinks || [])) {
      if (!parentToKids[link.parent_user_id]) parentToKids[link.parent_user_id] = [];
      parentToKids[link.parent_user_id].push(link.member_id);
    }
    for (const kids of Object.values(parentToKids)) {
      const relevant = kids.filter(id => idSet.has(id) && ufParent[id]);
      for (let i = 1; i < relevant.length; i++) ufUnion(relevant[0], relevant[i]);
    }

    const map: Record<string, string[]> = {};
    for (const m of allRows) {
      const root = ufFind(m.id);
      if (!map[root]) map[root] = [];
      map[root].push(m.id);
    }
    setSiblingMap(map);
  };

  const fetchMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('members')
        .select('*, teams(name), groupements(id, name)')
        .order('last_name');

      if (error) {
        console.error('Error fetching members:', error);
      } else if (data) {
        setMembers(data);

        // Build parent-children map: adult members who are parents of other members
        const pcMap: Record<string, string[]> = {};
        const emailToChildren: Record<string, string[]> = {};
        data.forEach(m => {
          const childName = `${m.first_name || ''} ${m.last_name || ''}`.trim();
          if (m.legal_rep1_email) {
            const key = m.legal_rep1_email.toLowerCase();
            if (!emailToChildren[key]) emailToChildren[key] = [];
            emailToChildren[key].push(childName);
          }
          if (m.legal_rep2_email) {
            const key = m.legal_rep2_email.toLowerCase();
            if (!emailToChildren[key]) emailToChildren[key] = [];
            emailToChildren[key].push(childName);
          }
        });
        // Match adult members (18+) whose email is a legal rep of another member
        const now = new Date();
        data.forEach(m => {
          if (!m.email) return;
          const age = m.birth_date ? (now.getFullYear() - new Date(m.birth_date).getFullYear()) : 99;
          if (age < 18) return;
          const children = emailToChildren[m.email.toLowerCase()];
          if (children && children.length > 0) pcMap[m.id] = children;
        });
        // Also check parent_members table for profile_id links
        const profileIds = data.filter(m => m.profile_id).map(m => m.profile_id);
        if (profileIds.length > 0) {
          const { data: pmLinks } = await supabase
            .from('parent_members')
            .select('parent_user_id, members:member_id(id, first_name, last_name)')
            .in('parent_user_id', profileIds);
          for (const link of (pmLinks as any[]) || []) {
            const parentMember = data.find(m => m.profile_id === link.parent_user_id);
            if (!parentMember) continue;
            const child = link.members;
            if (!child) continue;
            const childName = `${child.first_name || ''} ${child.last_name || ''}`.trim();
            if (!pcMap[parentMember.id]) pcMap[parentMember.id] = [];
            if (!pcMap[parentMember.id].includes(childName)) pcMap[parentMember.id].push(childName);
          }
        }
        setParentChildrenMap(pcMap);

        if (activeSeason) {
          const { data: seasonInvoices } = await supabase
            .from('invoices')
            .select('id, member_id, invoice_number, status')
            .eq('season_id', activeSeason.id)
            .neq('status', 'cancelled');

          const newInvoiceMap: Record<string, { id: string; invoice_number: string; status: string }> = {};
          seasonInvoices?.forEach(inv => {
            newInvoiceMap[inv.member_id] = {
              id: inv.id,
              invoice_number: inv.invoice_number,
              status: inv.status
            };
          });
          setInvoiceMap(newInvoiceMap);
        }
      }
    } catch (err) {
      console.error('Unexpected error fetching members:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMemberInvoices = async (memberId: string) => {
    const { data } = await supabase
      .from('invoices')
      .select(`
        id, invoice_number, issue_date, due_date,
        paid_date, total_amount, base_amount,
        paid_amount, balance,
        fratrie_discount_pct, fratrie_discount_amount,
        reminder_fee, status, notes, cancelled_reason,
        season:seasons(name),
        category:team_categories(name)
      `)
      .eq('member_id', memberId)
      .order('issue_date', { ascending: false });

    setMemberInvoices(data || []);
  };

  const hasSiblings = (member: Member): boolean => {
    for (const group of Object.values(siblingMap)) {
      if (group.includes(member.id) && group.length > 1) return true;
    }
    return false;
  };

  const fetchTeams = async () => {
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('id, name, level_rank, type, team_categories(name)')
        .order('level_rank')
        .order('name');

      if (error) {
        console.error('Error fetching teams:', error);
      } else if (data) {
        setTeams(data as any);
      }
    } catch (err) {
      console.error('Unexpected error fetching teams:', err);
    }
  };

  const addToTeam = async (teamId: string) => {
    const memberIds = Array.from(selectedIds);

    try {
      const teamMemberRows = memberIds.map(memberId => ({
        team_id: teamId,
        member_id: memberId
      }));

      const { error: junctionError } = await supabase
        .from('team_members')
        .upsert(teamMemberRows, {
          onConflict: 'team_id,member_id',
          ignoreDuplicates: false
        });

      if (junctionError) throw junctionError;

      const { error: updateError } = await supabase
        .from('members')
        .update({ team_id: teamId })
        .in('id', memberIds);

      if (updateError) throw updateError;

      setSelectedIds(new Set());
      fetchMembers();

      const teamName = (teams as any).find((t: any) => t.id === teamId)?.name;
      showToast(`${memberIds.length} joueur(s) ajouté(s) à ${teamName}`, 'success');
      setShowAddToTeamModal(false);
      setSelectedTeamId('');
    } catch (error) {
      console.error('Error adding to team:', error);
      showToast('Erreur lors de l\'ajout à l\'équipe', 'error');
    }
  };

  const archiveSelected = async () => {
    const memberIds = Array.from(selectedIds);
    const today = new Date().toISOString().split('T')[0];
    const { error } = await supabase
      .from('members')
      .update({ status: 'archive' })
      .in('id', memberIds);
    if (!error) {
      const { error: dateErr } = await supabase
        .from('members')
        .update({ departure_date: today })
        .in('id', memberIds)
        .is('departure_date', null);
      if (dateErr) console.error('departure_date update error:', dateErr);
      setSelectedIds(new Set());
      fetchMembers();
      showToast(`${memberIds.length} joueur(s) archive(s)`, 'success');
    } else {
      showToast('Erreur lors de l\'archivage', 'error');
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const calculateAge = (birthDate: string | null): number | null => {
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

  const withoutTeamCount = members.filter(m => !m.team_id && m.status !== 'archive').length;
  const unavailableCount = members.filter(m => m.status !== 'archive' && m.availability && m.availability !== 'disponible').length;

  const filteredMembers = members.filter(member => {
    // Enhanced search: handle full name (first + last) in both orders
    const searchTerm = searchQuery.trim().toLowerCase();
    const parts = searchTerm.split(' ').filter(Boolean);

    let matchesSearch = false;

    if (searchTerm === '') {
      matchesSearch = true;
    } else if (parts.length === 1) {
      matchesSearch =
        member.first_name.toLowerCase().includes(searchTerm) ||
        member.last_name.toLowerCase().includes(searchTerm) ||
        Boolean(member.email && member.email.toLowerCase().includes(searchTerm)) ||
        Boolean(member.legal_rep1_email && member.legal_rep1_email.toLowerCase().includes(searchTerm)) ||
        Boolean(member.legal_rep2_email && member.legal_rep2_email.toLowerCase().includes(searchTerm)) ||
        Boolean(member.avs_number && member.avs_number.toLowerCase().includes(searchTerm)) ||
        Boolean(member.js_number && member.js_number.includes(searchTerm)) ||
        Boolean(member.asf_licence_number && member.asf_licence_number.toLowerCase().includes(searchTerm));
    } else {
      const fullName1 = `${member.first_name} ${member.last_name}`.toLowerCase();
      const fullName2 = `${member.last_name} ${member.first_name}`.toLowerCase();
      matchesSearch =
        fullName1.includes(searchTerm) ||
        fullName2.includes(searchTerm) ||
        Boolean(member.email && member.email.toLowerCase().includes(searchTerm)) ||
        Boolean(member.legal_rep1_email && member.legal_rep1_email.toLowerCase().includes(searchTerm)) ||
        Boolean(member.legal_rep2_email && member.legal_rep2_email.toLowerCase().includes(searchTerm)) ||
        Boolean(member.avs_number && member.avs_number.toLowerCase().includes(searchTerm)) ||
        Boolean(member.js_number && member.js_number.includes(searchTerm)) ||
        Boolean(member.asf_licence_number && member.asf_licence_number.toLowerCase().includes(searchTerm));
    }

    const matchesTeam = !filterTeam || member.team_id === filterTeam;

    let matchesStatus = true;
    const isArchived = member.status === 'archive';
    if (filterStatus === 'archive') {
      matchesStatus = isArchived;
    } else if (filterStatus === 'active') {
      matchesStatus = !isArchived && ['actif', 'en_attente', 'a_declarer_partant', 'declare_partant'].includes(member.licence_status);
    } else if (filterStatus === 'groupement') {
      matchesStatus = member.status === 'groupement' || !!member.groupement_id;
    } else if (filterStatus === 'all') {
      matchesStatus = !isArchived;
    } else if (filterStatus) {
      matchesStatus = !isArchived && member.licence_status === filterStatus;
    }

    const matchesGender = !filterGender || member.gender === filterGender;

    const matchesNoTeam = !showWithoutTeam || (!member.team_id && member.status !== 'archive');

    const matchesUnavailable = !showUnavailable || (member.status !== 'archive' && !!member.availability && member.availability !== 'disponible');

    return matchesSearch && matchesTeam && matchesStatus && matchesGender && matchesNoTeam && matchesUnavailable;
  });

  const sortedMembers = [...filteredMembers].sort((a, b) => {
    if (filterStatus === 'archive') {
      const da = a.departure_date || '';
      const db = b.departure_date || '';
      if (da !== db) return da > db ? -1 : 1;
      const lc = a.last_name.localeCompare(b.last_name, 'fr', { sensitivity: 'base' });
      return lc !== 0 ? lc : a.first_name.localeCompare(b.first_name, 'fr', { sensitivity: 'base' });
    }

    let aVal: any = a[sortField as keyof Member];
    let bVal: any = b[sortField as keyof Member];

    if (sortField === 'team') {
      aVal = a.teams?.name || '';
      bVal = b.teams?.name || '';
    }

    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;

    if (typeof aVal === 'string') {
      const cmp = aVal.localeCompare(bVal, 'fr', { sensitivity: 'base' });
      if (cmp !== 0) return sortDir === 'asc' ? cmp : -cmp;
      const cmp2 = (a.first_name || '').localeCompare(b.first_name || '', 'fr', { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp2 : -cmp2;
    }

    return sortDir === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
  });

  const visiblePhotoPaths = sortedMembers.map((m) => m.photo_path);
  const photoUrls = useMemberPhotos(visiblePhotoPaths);

  const replacePhotoRef = useRef<HTMLInputElement>(null);
  const [replacingPhoto, setReplacingPhoto] = useState(false);

  const handleReplacePhoto = async (file: File) => {
    if (!selectedMember) return;
    setReplacingPhoto(true);
    try {
      const blob = await processPassportPhoto(file);

      // Chemin existant, sinon construction conventionnelle {club_id}/{member_id}.jpg
      let path = selectedMember.photo_path;
      if (!path) {
        let clubId: string | null | undefined = (selectedMember as { club_id?: string | null }).club_id;
        if (!clubId) {
          const { data: row } = await supabase
            .from('members')
            .select('club_id')
            .eq('id', selectedMember.id)
            .single();
          clubId = row?.club_id;
        }
        if (!clubId) throw new Error('club_id introuvable pour ce membre');
        path = `${clubId}/${selectedMember.id}.jpg`;
      }

      const { error: uploadError } = await supabase.storage
        .from('member-photos')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;

      // Premier ajout : enregistrer le chemin sur le membre
      const { data: pubData } = supabase.storage.from('member-photos').getPublicUrl(path);
      const publicUrl = `${pubData.publicUrl}?v=${Date.now()}`;
      const { error: dbError } = await supabase
        .from('members')
        .update({ photo_path: path, photo_url: publicUrl })
        .eq('id', selectedMember.id);
      if (dbError) throw dbError;

      // Invalider le cache → tous les composants abonnés (fiche, avatars liste) rechargent
      invalidateMemberPhoto(path);
      setSelectedMember({ ...selectedMember, photo_path: path });
      setMembers((prev) =>
        prev.map((m) => (m.id === selectedMember.id ? { ...m, photo_path: path } : m))
      );
    } catch (err) {
      console.error('Error replacing photo:', err);
    } finally {
      setReplacingPhoto(false);
    }
  };

  const handleDownloadPhoto = async () => {
    if (!selectedMember?.photo_path && !selectedMember?.photo_url) return;
    const url = getMemberPhotoUrl(selectedMember.photo_path, photoUrls, selectedMember.photo_url);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedMember.first_name}_${selectedMember.last_name}.jpg`;
    a.target = '_blank';
    a.click();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allVisible = filteredMembers.map(m => m.id);
    const allSelected = allVisible.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        allVisible.forEach(id => next.delete(id));
      } else {
        allVisible.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const getSimulationData = () => {
    const juniorMembers = members.filter((m) => {
      if (m.licence_status !== 'actif' || !m.birth_date) return false;
      const age = getCurrentSeasonAge(m.birth_date);
      return age >= 6 && age <= 21;
    });

    const currentCounts: Record<string, number> = {};
    const futureCounts: Record<string, number> = {};

    juniorMembers.forEach((member) => {
      if (!member.birth_date) return;

      const currentAge = getCurrentSeasonAge(member.birth_date);
      const futureAge = getFutureSeasonAge(member.birth_date);
      const female = isFemale(member);

      const currentCategory = getCategory(currentAge, female);
      const futureCategory = getCategory(futureAge, female);

      if (currentCategory !== 'Actifs' && currentCategory !== 'Trop jeune') {
        currentCounts[currentCategory] = (currentCounts[currentCategory] || 0) + 1;
      }

      if (futureCategory !== 'Actifs' && futureCategory !== 'Trop jeune') {
        futureCounts[futureCategory] = (futureCounts[futureCategory] || 0) + 1;
      }
    });

    const totalCurrent = Object.values(currentCounts).reduce((a, b) => a + b, 0);
    const totalFuture = Object.values(futureCounts).reduce((a, b) => a + b, 0);

    return {
      juniorMembers,
      currentCounts,
      futureCounts,
      totalCurrent,
      totalFuture,
    };
  };

  const exportSimulation = async () => {
    try {
    const XLSX = await import('xlsx');
    const { juniorMembers, currentCounts, futureCounts, totalCurrent, totalFuture } =
      getSimulationData();

    const wb = XLSX.utils.book_new();

    const summaryData = ALL_CATEGORIES.map((cat) => ({
      Catégorie: cat,
      'Saison actuelle': currentCounts[cat] || 0,
      'Future saison': futureCounts[cat] || 0,
      Variation: (futureCounts[cat] || 0) - (currentCounts[cat] || 0),
    }));

    summaryData.push({
      Catégorie: 'TOTAL',
      'Saison actuelle': totalCurrent,
      'Future saison': totalFuture,
      Variation: totalFuture - totalCurrent,
    });

    const ws1 = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws1, 'Résumé saisons');

    const detailData = juniorMembers
      .map((m) => {
        if (!m.birth_date) return null;
        const currentAge = getCurrentSeasonAge(m.birth_date);
        const futureAge = getFutureSeasonAge(m.birth_date);
        const female = isFemale(m);
        return {
          Prénom: m.first_name,
          Nom: m.last_name,
          'Date de naissance': new Date(m.birth_date).toLocaleDateString('fr-CH'),
          Genre: m.gender === 'F' ? 'Féminin' : 'Masculin',
          'Équipe actuelle': m.teams?.name || '',
          'Catégorie actuelle': getCategory(currentAge, female),
          'Âge saison actuelle': currentAge,
          'Catégorie future': getCategory(futureAge, female),
          'Âge future saison': futureAge,
        };
      })
      .filter((row) => row !== null);

    const ws2 = XLSX.utils.json_to_sheet(detailData);
    XLSX.utils.book_append_sheet(wb, ws2, 'Détail joueurs');

    [ws1, ws2].forEach((ws) => {
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      ws['!cols'] = Array.from({ length: range.e.c + 1 }, () => ({ wch: 20 }));
    });

    const currentYear = new Date().getFullYear();
    XLSX.writeFile(wb, `simulation_saison_${currentYear}.xlsx`);
    } catch (e) { console.error('Export failed', e); showToast("L'export n'a pas pu être généré. Rechargez la page et réessayez.", 'error'); }
  };

  const exportSelected = async (format: 'xlsx' | 'csv') => {
    try {
    const { data: members } = await supabase
      .from('members')
      .select(`
        first_name, last_name, birth_date, nationality,
        email, phone, address, street_number, postal_code, city, canton,
        js_number, asf_licence_number, licence_status,
        legal_rep1_firstname, legal_rep1_lastname,
        legal_rep1_email, legal_rep1_phone,
        legal_rep2_firstname, legal_rep2_lastname,
        legal_rep2_email, legal_rep2_phone,
        teams(name),
        notes
      `)
      .in('id', Array.from(selectedIds));

    if (!members || members.length === 0) return;

    const rows = members.map(m => ({
      'Prénom': m.first_name,
      'Nom': m.last_name,
      'Date de naissance': m.birth_date
        ? new Date(m.birth_date).toLocaleDateString('fr-CH')
        : '',
      'Nationalité': m.nationality || '',
      'Email': m.email || '',
      'Mobile': m.phone || '',
      'Adresse': [m.address, m.street_number].filter(Boolean).join(' ') || '',
      'Code postal': m.postal_code || '',
      'Ville': m.city || '',
      'Canton': m.canton || '',
      'Équipe': (m.teams as any)?.name || '',
      'Numéro J+S': m.js_number || '',
      'Licence ASF': m.asf_licence_number || '',
      'Statut': m.licence_status || '',
      'Rep. légal 1 - Prénom': m.legal_rep1_firstname || '',
      'Rep. légal 1 - Nom': m.legal_rep1_lastname || '',
      'Rep. légal 1 - Email': m.legal_rep1_email || '',
      'Rep. légal 1 - Mobile': m.legal_rep1_phone || '',
      'Rep. légal 2 - Prénom': m.legal_rep2_firstname || '',
      'Rep. légal 2 - Nom': m.legal_rep2_lastname || '',
      'Rep. légal 2 - Email': m.legal_rep2_email || '',
      'Rep. légal 2 - Mobile': m.legal_rep2_phone || '',
      'Notes': m.notes || '',
    }));

    if (format === 'csv') {
      const headers = Object.keys(rows[0]).join(';');
      const csvRows = rows.map(r =>
        Object.values(r).map(v =>
          `"${String(v).replace(/"/g, '""')}"`
        ).join(';')
      );
      const csv = [headers, ...csvRows].join('\n');
      const blob = new Blob(['﻿' + csv],
        { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `joueurs_export_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }

    if (format === 'xlsx') {
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Joueurs');

      const colWidths = Object.keys(rows[0]).map(key => ({
        wch: Math.max(key.length,
          ...rows.map(r => String(r[key as keyof typeof r]).length))
      }));
      ws['!cols'] = colWidths;

      XLSX.writeFile(wb, `joueurs_export_${Date.now()}.xlsx`);
    }
    } catch (e) { console.error('Export failed', e); showToast("L'export n'a pas pu être généré. Rechargez la page et réessayez.", 'error'); }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { label: string; variant: 'green' | 'yellow' | 'orange' | 'neutral' | 'red' }> = {
      'actif':              { label: 'Actif',              variant: 'green' },
      'en_attente':         { label: 'En attente',         variant: 'yellow' },
      'a_declarer_partant': { label: 'À déclarer partant', variant: 'orange' },
      'declare_partant':    { label: 'Déclaré partant',    variant: 'yellow' },
      'parti':              { label: 'Archive',            variant: 'neutral' },
      'inactif':            { label: 'Inactif',            variant: 'neutral' },
      'suspendu':           { label: 'Suspendu',           variant: 'red' },
    };
    return badges[status] || badges['inactif'];
  };

  const INVOICE_STATUS_CONFIG: Record<string, { label: string; variant: 'neutral' | 'blue' | 'red' | 'orange' | 'green' }> = {
    draft:          { label: 'Brouillon',           variant: 'neutral' },
    sent:           { label: 'Envoyée',             variant: 'blue' },
    overdue:        { label: 'En retard',           variant: 'red' },
    reminder1_sent: { label: 'R1 envoyé',           variant: 'orange' },
    reminder2_sent: { label: 'R2 envoyé',           variant: 'red' },
    partial:        { label: 'Partiellement payée', variant: 'orange' },
    paid:           { label: 'Payée',               variant: 'green' },
    cancelled:      { label: 'Annulée',             variant: 'neutral' },
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const config = INVOICE_STATUS_CONFIG[status];
    if (!config) return <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{status}</span>;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const downloadInvoice = async (invoiceId: string) => {
    try {
      const { data: invoice } = await supabase
        .from('invoices')
        .select(`
          *,
          member:members(*),
          season:seasons(*),
          category:team_categories(*),
          team:teams(*)
        `)
        .eq('id', invoiceId)
        .single();

      if (invoice) {
        const { data: club } = await supabase
          .from('club_settings')
          .select('*')
          .single();

        const { data: finance } = await supabase
          .from('finance_config')
          .select('*')
          .single();

        const { generateInvoicePDF } = await import('../utils/generateInvoicePDF');
        await generateInvoicePDF({
          invoice_number: invoice.invoice_number,
          issue_date: invoice.issue_date,
          due_date: invoice.due_date,
          qr_reference: invoice.qr_reference,
          notes: invoice.notes,

          member_first_name: invoice.member.first_name,
          member_last_name: invoice.member.last_name,
          member_salutation: invoice.member.salutation,
          member_address: invoice.member.address || '',
          member_street_number: invoice.member.street_number,
          member_postal_code: invoice.member.postal_code || '',
          member_city: invoice.member.city || '',
          member_asf_licence: invoice.member.asf_licence_number,
          member_birth_date: invoice.member.birth_date,

          base_amount: invoice.base_amount,
          fratrie_discount_pct: invoice.fratrie_discount_pct || 0,
          fratrie_discount_amount: invoice.fratrie_discount_amount || 0,
          reminder_fee: invoice.reminder_fee || 0,
          total_amount: invoice.total_amount,
          currency: invoice.currency || 'CHF',

          category_name: invoice.category?.name || '',
          season_name: invoice.season?.name || '',

          club_name: club?.club_name || '',
          club_address: club?.club_address || '',
          club_street_number: club?.club_street_number,
          club_postal_code: club?.club_postal_code || '',
          club_city: club?.club_city || '',
          club_email: finance?.email_sender?.trim() || club?.club_email || '',
          club_phone: club?.club_phone,
          club_website: club?.club_website,
          logo_url: club?.logo_url,

          qr_iban: finance?.qr_iban || '',
          bank_name: finance?.bank_name || '',
          bank_street: finance?.bank_street,
          bank_street_number: finance?.bank_street_number,
          bank_postal_code: finance?.bank_postal_code,
          bank_city: finance?.bank_city,
          contact_name: finance?.contact_name,
          contact_phone: finance?.contact_phone,
          payment_delay_days: finance?.payment_delay_days || 30,
        });
      }
    } catch (error) {
      console.error('Error downloading invoice:', error);
    }
  };

  const handleRowClick = (member: Member) => {
    setSelectedMember(member);
    setShowDetailPanel(true);
    loadParentAccounts(member);
    setAvailForm({
      availability: member.availability || 'disponible',
      until: member.availability_until || '',
      note: member.availability_note || '',
    });
  };

  const handleOpenModal = (member: Member | null = null) => {
    if (member) {
      setEditingMember(member);
      setFormData(member);
    } else {
      setEditingMember(null);
      setFormData({ first_name: '', last_name: '', licence_status: 'actif', gender: 'M' });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {

    if (formData.avs_number && formData.avs_number.trim()) {
      if (!validateAVS(formData.avs_number)) {
        showToast('Format AVS invalide. Format attendu: 756.XXXX.XXXX.XX', 'warning');
        return;
      }

      let avsDataQuery = supabase
        .from('members')
        .select('id, first_name, last_name, email, phone, birth_date, teams(name)')
        .eq('avs_number', formData.avs_number.trim());
      if (editingMember?.id) {
        avsDataQuery = avsDataQuery.neq('id', editingMember.id);
      }
      const { data: avsData } = await avsDataQuery.maybeSingle();

      if (avsData) {
        setDuplicateInfo({ type: 'avs', person: { ...avsData, table: 'Joueur', team_name: (avsData as any).teams?.name || null } });
        return;
      }

      if (!skipCrossTableRef.current) {
        const { data: avsCoach } = await supabase
          .from('coaches')
          .select('id, first_name, last_name, email, phone, birth_date, member_id')
          .eq('avs_number', formData.avs_number.trim())
          .maybeSingle();
        if (avsCoach && avsCoach.member_id !== editingMember?.id) {
          pendingLinkRef.current = { table: 'coaches', id: avsCoach.id, email: avsCoach.email };
          setDuplicateInfo({ type: 'avs', person: { ...avsCoach, table: 'Entraîneur' }, crossTable: true });
          return;
        }
        const { data: avsCommittee } = await supabase
          .from('committee_members')
          .select('id, first_name, last_name, email, phone, birth_date, role, member_id')
          .eq('avs_number', formData.avs_number.trim())
          .maybeSingle();
        if (avsCommittee && avsCommittee.member_id !== editingMember?.id) {
          pendingLinkRef.current = { table: 'committee_members', id: avsCommittee.id, email: avsCommittee.email };
          setDuplicateInfo({ type: 'avs', person: { ...avsCommittee, table: 'Comité' }, crossTable: true });
          return;
        }
      }
    }

    if (formData.js_number && formData.js_number.trim()) {
      if (formData.js_number.length > 9) {
        showToast('Le numéro J+S ne peut pas dépasser 9 chiffres', 'warning');
        return;
      }

      let jsDataQuery = supabase
        .from('members')
        .select('id, first_name, last_name, email, phone, birth_date, teams(name)')
        .eq('js_number', formData.js_number.trim());
      if (editingMember?.id) {
        jsDataQuery = jsDataQuery.neq('id', editingMember.id);
      }
      const { data: jsData } = await jsDataQuery.maybeSingle();

      if (jsData) {
        setDuplicateInfo({ type: 'js', person: { ...jsData, table: 'Joueur', team_name: (jsData as any).teams?.name || null } });
        return;
      }

      if (!skipCrossTableRef.current) {
        const { data: jsCoach } = await supabase
          .from('coaches')
          .select('id, first_name, last_name, email, phone, birth_date, member_id')
          .eq('js_number', formData.js_number.trim())
          .maybeSingle();
        if (jsCoach && jsCoach.member_id !== editingMember?.id) {
          pendingLinkRef.current = { table: 'coaches', id: jsCoach.id, email: jsCoach.email };
          setDuplicateInfo({ type: 'js', person: { ...jsCoach, table: 'Entraîneur' }, crossTable: true });
          return;
        }
      }
    }

    if (formData.asf_licence_number && formData.asf_licence_number.trim()) {
      if (formData.asf_licence_number.length > 7) {
        showToast('Le numéro de licence ASF ne peut pas dépasser 7 chiffres', 'warning');
        return;
      }

      let asfDataQuery = supabase
        .from('members')
        .select('id, first_name, last_name, email, phone, birth_date, teams(name)')
        .eq('asf_licence_number', formData.asf_licence_number.trim());
      if (editingMember?.id) {
        asfDataQuery = asfDataQuery.neq('id', editingMember.id);
      }
      const { data: asfData } = await asfDataQuery.maybeSingle();

      if (asfData) {
        setDuplicateInfo({ type: 'asf', person: { ...asfData, table: 'Joueur', team_name: (asfData as any).teams?.name || null } });
        return;
      }

      if (!skipCrossTableRef.current) {
        const { data: asfCoach } = await supabase
          .from('coaches')
          .select('id, first_name, last_name, email, phone, birth_date, member_id')
          .eq('asf_licence_number', formData.asf_licence_number.trim())
          .maybeSingle();
        if (asfCoach && asfCoach.member_id !== editingMember?.id) {
          pendingLinkRef.current = { table: 'coaches', id: asfCoach.id, email: asfCoach.email };
          setDuplicateInfo({ type: 'asf', person: { ...asfCoach, table: 'Entraîneur' }, crossTable: true });
          return;
        }
      }
    }

    if (editingMember) {
      const updatePayload = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        second_name: formData.second_name || null,
        birth_date: formData.birth_date || null,
        nationality: formData.nationality || null,
        football_nationality: formData.football_nationality || null,
        country: formData.country || null,
        pseudonym: formData.pseudonym || null,
        salutation: formData.salutation || null,
        gender: formData.gender || 'M',
        avs_number: formData.avs_number || null,
        email: formData.email || null,
        email_pro: formData.email_pro || null,
        phone: formData.phone || null,
        phone_private: formData.phone_private || null,
        address: formData.address || null,
        street_number: formData.street_number || null,
        address2: formData.address2 || null,
        postal_code: formData.postal_code || null,
        city: formData.city || null,
        canton: formData.canton || null,
        team_id: formData.team_id || null,
        js_number: formData.js_number || null,
        asf_licence_number: formData.asf_licence_number || null,
        licence_status: formData.licence_status,
        position: formData.position || null,
        position_main_id: formData.position_main_id || null,
        position_secondary_id: formData.position_secondary_id || null,
        qualification_type: formData.qualification_type || null,
        qualified_from: formData.qualified_from || null,
        qualified_until: formData.qualified_until || null,
        affiliation_date: formData.affiliation_date || null,
        club_origine: formData.club_origine || null,
        classe_de_jeu: formData.classe_de_jeu || null,
        departure_note: formData.departure_note || null,
        departure_date: formData.departure_date || null,
        departure_club: formData.departure_club || null,
        legal_rep1_firstname: formData.legal_rep1_firstname || null,
        legal_rep1_lastname: formData.legal_rep1_lastname || null,
        legal_rep1_relation: formData.legal_rep1_relation || null,
        legal_rep1_email: formData.legal_rep1_email || null,
        legal_rep1_phone: formData.legal_rep1_phone || null,
        legal_rep1_address: formData.legal_rep1_address || null,
        legal_rep1_postal_code: formData.legal_rep1_postal_code || null,
        legal_rep1_city: formData.legal_rep1_city || null,
        legal_rep1_canton: formData.legal_rep1_canton || null,
        legal_rep2_firstname: formData.legal_rep2_firstname || null,
        legal_rep2_lastname: formData.legal_rep2_lastname || null,
        legal_rep2_relation: formData.legal_rep2_relation || null,
        legal_rep2_email: formData.legal_rep2_email || null,
        legal_rep2_phone: formData.legal_rep2_phone || null,
        legal_rep2_address: formData.legal_rep2_address || null,
        legal_rep2_postal_code: formData.legal_rep2_postal_code || null,
        legal_rep2_city: formData.legal_rep2_city || null,
        legal_rep2_canton: formData.legal_rep2_canton || null,
        remarques_club: formData.remarques_club || null,
        notes: formData.notes || null,
        groupement_id: formData.groupement_id || null,
        status: formData.status || null,
        origin_club_name: formData.origin_club_name || null,
        origin_club_asf_number: formData.origin_club_asf_number || null,
        billable: formData.billable !== false,
        jersey_number: formData.jersey_number != null ? formData.jersey_number : null,
        receives_convocations: formData.receives_convocations !== false,
        fee_exempt: formData.fee_exempt ?? false,
        fee_exempt_reason: formData.fee_exempt ? (formData.fee_exempt_reason || null) : null,
      };

      console.log('Update payload:', updatePayload);

      const { error } = await supabase
        .from('members')
        .update(updatePayload)
        .eq('id', editingMember.id);

      console.log('Update error:', error);

      if (error) {
        if (error.code === '23505' && (error.message || '').toLowerCase().includes('avs')) {
          showToast('Ce numéro AVS est déjà utilisé par un autre joueur du club.', 'error');
        } else if (error.code === '23505') {
          showToast('Enregistrement impossible : une valeur unique est déjà utilisée (doublon).', 'error');
        } else {
          showToast("Erreur lors de l'enregistrement : " + error.message, 'error');
        }
      } else {
        const oldEmail = editingMember.email;
        const newEmail = formData.email;
        if (oldEmail && newEmail && oldEmail !== newEmail) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .ilike('email', oldEmail)
            .maybeSingle();
          if (profile?.id) {
            try {
              await updateUserEmail(profile.id, newEmail, oldEmail);
            } catch {
            }
          }
        }
        if (pendingLinkRef.current) {
          const link = pendingLinkRef.current;
          await supabase.from(link.table).update({ member_id: editingMember.id }).eq('id', link.id);
          if (!formData.email && link.email) {
            await supabase.from('members').update({ email: link.email }).eq('id', editingMember.id);
          }
          pendingLinkRef.current = null;
          skipCrossTableRef.current = false;
          showToast('Fiches reliées', 'success');
        } else {
          showToast('Joueur mis à jour', 'success');
        }
        fetchMembers();
        setShowModal(false);
      }
    } else {
      const { data: insertedRow, error } = await supabase
        .from('members')
        .insert([formData])
        .select('id')
        .single();

      if (error) {
        if (error.code === '23505' && (error.message || '').toLowerCase().includes('avs')) {
          showToast('Ce numéro AVS est déjà utilisé par un autre joueur du club.', 'error');
        } else if (error.code === '23505') {
          showToast('Enregistrement impossible : une valeur unique est déjà utilisée (doublon).', 'error');
        } else {
          showToast("Erreur lors de l'enregistrement : " + error.message, 'error');
        }
      } else {
        if (pendingLinkRef.current && insertedRow?.id) {
          const link = pendingLinkRef.current;
          await supabase.from(link.table).update({ member_id: insertedRow.id }).eq('id', link.id);
          if (!formData.email && link.email) {
            await supabase.from('members').update({ email: link.email }).eq('id', insertedRow.id);
          }
          pendingLinkRef.current = null;
          skipCrossTableRef.current = false;
          showToast('Fiches reliées', 'success');
        } else {
          showToast('Joueur créé', 'success');
        }
        fetchMembers();
        fetchTotalCount();
        setShowModal(false);
      }
    }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('members')
      .delete()
      .eq('id', id);

    if (error) {
      if (error.code === '23503') {
        showToast('Suppression impossible : ce joueur a des données liées (factures, inscriptions...). Archivez-le plutôt.', 'error');
      } else {
        showToast('Erreur lors de la suppression : ' + error.message, 'error');
      }
      return;
    }

    fetchMembers();
    fetchTotalCount();
  };

  const findSiblings = async (member: Member) => {
    // Find sibling IDs from the union-find map
    let siblingIds: string[] = [];
    for (const group of Object.values(siblingMap)) {
      if (group.includes(member.id)) {
        siblingIds = group.filter(id => id !== member.id);
        break;
      }
    }
    if (siblingIds.length === 0) {
      showToast("Aucun frère/soeur identifié pour ce joueur", 'warning');
      return;
    }

    const { data: siblingsData } = await supabase
      .from('members')
      .select(`
        id, first_name, last_name, birth_date,
        address, street_number, legal_rep1_email, legal_rep1_firstname,
        legal_rep1_lastname,
        teams(id, name, category_id, team_categories(id, name))
      `)
      .in('id', siblingIds);

    setSiblings(siblingsData || []);
    setSelectedMember(member);
    setShowSiblingsModal(true);
  };

  const cleanClasseDeJeu = (classeDeJeu: string | null): string | null => {
    if (!classeDeJeu || classeDeJeu === '-') return null;

    return classeDeJeu
      .replace(/[-–]\s*tour printemps/gi, '')
      .replace(/[-–]\s*tour automne/gi, '')
      .replace(/\s*tour printemps/gi, '')
      .replace(/\s*tour automne/gi, '')
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/^[-–\s]+|[-–\s]+$/g, '')
      .trim();
  };

  const VALID_POSITIONS = ['Gardien', 'Défenseur', 'Milieu', 'Attaquant'];

  const sanitizePosition = (pos: string | null): string | null => {
    if (!pos || pos.trim() === '' || pos.trim() === '-') {
      return null;
    }

    const p = pos.trim();
    if (VALID_POSITIONS.includes(p)) {
      return p;
    }

    const lower = p.toLowerCase();
    if (lower.includes('goal') || lower.includes('garden') || lower.includes('gardien')) {
      return 'Gardien';
    }
    if (lower.includes('def') || lower.includes('défens')) {
      return 'Défenseur';
    }
    if (lower.includes('mil') || lower.includes('milieu')) {
      return 'Milieu';
    }
    if (lower.includes('att') || lower.includes('attaquant')) {
      return 'Attaquant';
    }

    console.log(`[!] Unknown position value: "${p}" → defaulting to null`);
    return null;
  };

  const getCategoryId = async (ligue: string | null, type: 'junior' | 'active'): Promise<string | null> => {
    if (!ligue) return null;

    const l = ligue.toLowerCase();

    let searchTerm: string | null = null;

    if (l.includes('juniors g')) searchTerm = 'Juniors G';
    else if (l.includes('juniors f') || l.includes('catégorie f')) searchTerm = 'Juniors F';
    else if (l.includes('juniors e') || l.includes('catégorie e')) searchTerm = 'Juniors E';
    else if (l.includes('d-7') || l.includes('d7')) searchTerm = 'Juniors D7';
    else if (l.includes('d-9') || l.includes('d9')) searchTerm = 'Juniors D9';
    else if (l.includes('juniors c')) searchTerm = 'Juniors C';
    else if (l.includes('juniors b')) searchTerm = 'Juniors B';
    else if (l.includes('juniors a')) searchTerm = 'Juniors A';
    else if (l.includes('ff-7') || l.includes('ff7')) searchTerm = 'Féminines FF7';
    else if (l.includes('ff-9') || l.includes('ff9')) searchTerm = 'Féminines FF9';
    else if (l.includes('ff-11') || l.includes('ff11')) searchTerm = 'Féminines FF11';
    else if (l.includes('ff-14') || l.includes('ff14')) searchTerm = 'Féminines FF14';
    else if (l.includes('ff-17') || l.includes('ff17') ||
             l.includes('féminines ff-17') || l.includes('juniores féminines')) searchTerm = 'Féminines FF17';
    else if (l.includes('ff-21') || l.includes('ff21')) searchTerm = 'Féminines FF21';
    else if (l.includes('5e ligue') || l.includes('5ème ligue')) searchTerm = '5ème ligue';
    else if (l.includes('4e ligue') || l.includes('4ème ligue')) searchTerm = '4ème ligue';
    else if (l.includes('3e ligue') || l.includes('3ème ligue')) searchTerm = '3ème ligue';
    else if (l.includes('2e ligue') || l.includes('2ème ligue')) searchTerm = '2ème ligue';
    else if (l.includes('1ère ligue') || l.includes('1ere ligue')) searchTerm = '1ère Ligue';
    else if (l.includes('seniors 40') || l.includes('seniors +40')) searchTerm = 'Seniors +40';
    else if (l.includes('seniors 50') || l.includes('seniors +50')) searchTerm = 'Seniors +50';
    else if (l.includes('seniors 30') || l.includes('seniors +30')) searchTerm = 'Seniors +30';
    else if (l.includes('brack') || l.includes('play more')) searchTerm = 'Juniors F';

    if (!searchTerm) return null;

    const { data } = await supabase
      .from('team_categories')
      .select('id, name')
      .ilike('name', `%${searchTerm}%`)
      .eq('type', type)
      .limit(1)
      .maybeSingle();

    console.log(`Category search "${searchTerm}" → ${data?.name || 'not found'}`);
    return data?.id || null;
  };

  const getTeamType = (ligue: string | null): 'junior' | 'active' => {
    if (!ligue) return 'active';
    const l = ligue.toLowerCase();
    if (
      l.includes('junior') || l.includes('juniore') ||
      l.includes('ff-') || l.includes('ff ') ||
      l.includes('brack') || l.includes('play more') ||
      l.includes('catégorie f') || l.includes('catégorie g') ||
      l.includes('catégorie e')
    ) return 'junior';
    return 'active';
  };

  const isFeminineTeam = (ligue: string | null): boolean => {
    const l = ligue?.toLowerCase() || '';
    return l.includes('féminin') || l.includes('féminine') ||
           l.includes('ff-') || l.includes('juniores');
  };

  const createOrGetTeam = async (
    affiliation: string | null,
    ligue: string | null,
    classeDeJeu: string | null,
    teamIdMap: Map<string, string>,
    key: string
  ): Promise<string | null> => {
    if (!affiliation || !ligue) return null;

    const type = getTeamType(ligue);
    const cleanedClasse = cleanClasseDeJeu(classeDeJeu);

    const teamName = cleanedClasse && cleanedClasse !== ''
      ? `${affiliation} - ${ligue} ${cleanedClasse}`
      : `${affiliation} - ${ligue}`;

    if (teamIdMap.has(key)) return teamIdMap.get(key)!;

    const { data: existing } = await supabase
      .from('teams')
      .select('id')
      .eq('name', teamName)
      .maybeSingle();

    if (existing) {
      teamIdMap.set(key, existing.id);
      return existing.id;
    }

    const categoryId = await getCategoryId(ligue, type);

    const { data: newTeam, error } = await supabase
      .from('teams')
      .insert([{
        name: teamName,
        type: type,
        category_id: categoryId,
        classe_de_jeu: cleanedClasse,
        season: '2025-2026',
        active: true
      }])
      .select('id')
      .single();

    if (!error && newTeam) {
      console.log(`Team created: "${teamName}" | type: ${type} | category_id: ${categoryId || 'null'}`);
      teamIdMap.set(key, newTeam.id);
      return newTeam.id;
    }

    return null;
  };

  const openInvoiceModal = async (member: Member) => {
    if (!activeSeason || !financeConfig) {
      showToast('Aucune saison active trouvée', 'error');
      return;
    }

    const { data: existing } = await supabase
      .from('invoices')
      .select('id, invoice_number, status')
      .eq('member_id', member.id)
      .eq('season_id', activeSeason.id)
      .neq('status', 'cancelled')
      .maybeSingle();

    if (existing) {
      showToast(
        `Ce joueur a déjà la facture ${existing.invoice_number}`,
        'warning'
      );
      return;
    }

    const memberWithTeam = await supabase
      .from('members')
      .select('*, team:teams!team_id(id, name, category_id)')
      .eq('id', member.id)
      .maybeSingle();

    const team = memberWithTeam.data?.team;
    const categoryId = Array.isArray(team) ? team[0]?.category_id : team?.category_id;

    const { data: allFeeConfigs } = await supabase
      .from('fee_configs')
      .select('category_id, amount')
      .eq('season_id', activeSeason.id);

    const baseAmount = allFeeConfigs?.find(f => f.category_id === categoryId)?.amount || 0;

    const discountMap = await computeSiblingDiscounts(
      activeSeason.id,
      new Set([member.id]),
      financeConfig,
      allFeeConfigs || []
    );

    const disc = discountMap[member.id] || { pct: 0, amount: 0, siblingCount: 1 };
    const discountAmount = Math.min(disc.amount, baseAmount);

    const today = new Date();
    const startYear = activeSeason.start_date.split('-')[0];
    const tour1End = new Date(parseInt(startYear), 11, 31);

    const isSecondTour = today > tour1End;
    const amountAfterDiscount = baseAmount - discountAmount;
    const suggestedAmount = isSecondTour
      ? amountAfterDiscount / 2
      : amountAfterDiscount;

    setInvoiceModalData({
      member,
      baseAmount,
      amount: suggestedAmount,
      isSecondTour,
      reason: isSecondTour
        ? 'Arrivée au 2ème tour (50%)'
        : disc.pct > 0
          ? `Rabais fratrie ${disc.pct}% (${disc.siblingCount} enfants)`
          : 'Saison complète',
      fratrie_discount_pct: disc.pct,
      fratrie_discount_amount: discountAmount,
      fratrie_sibling_count: disc.siblingCount
    });
    setShowInvoiceModal(true);
  };

  const showInvoiceInfo = async (invoice: { id: string; invoice_number: string; status: string }) => {
    setDownloadingInvoice(invoice.id);

    try {
      const { data: fullInvoice } = await supabase
        .from('invoices')
        .select(`
          *,
          member:members(
            first_name, last_name, salutation, birth_date,
            address, street_number, postal_code, city,
            asf_licence_number
          ),
          team:teams(
            name,
            category:team_categories(name)
          ),
          season:seasons(name)
        `)
        .eq('id', invoice.id)
        .maybeSingle();

      if (!fullInvoice) {
        showToast('Facture introuvable', 'error');
        return;
      }

      const { data: club } = await supabase
        .from('club_settings')
        .select('*')
        .maybeSingle();

      const { data: finance } = await supabase
        .from('finance_config')
        .select('*')
        .maybeSingle();

      const { generateInvoicePDF } = await import('../utils/generateInvoicePDF');
      await generateInvoicePDF({
        invoice_number: fullInvoice.invoice_number,
        issue_date: fullInvoice.issue_date,
        due_date: fullInvoice.due_date,
        qr_reference: fullInvoice.qr_reference,
        notes: fullInvoice.notes,

        member_first_name: fullInvoice.member.first_name,
        member_last_name: fullInvoice.member.last_name,
        member_salutation: fullInvoice.member.salutation,
        member_address: fullInvoice.member.address || '',
        member_street_number: fullInvoice.member.street_number,
        member_postal_code: fullInvoice.member.postal_code || '',
        member_city: fullInvoice.member.city || '',
        member_asf_licence: fullInvoice.member.asf_licence_number,
        member_birth_date: fullInvoice.member.birth_date,

        base_amount: fullInvoice.base_amount,
        fratrie_discount_pct: fullInvoice.fratrie_discount_pct || 0,
        fratrie_discount_amount: fullInvoice.fratrie_discount_amount || 0,
        reminder_fee: fullInvoice.reminder_fee || 0,
        total_amount: fullInvoice.total_amount,
        currency: fullInvoice.currency || 'CHF',

        category_name: fullInvoice.team?.category?.name || '',
        season_name: fullInvoice.season?.name || '',

        club_name: club?.club_name || '',
        club_address: club?.club_address || '',
        club_street_number: club?.club_street_number,
        club_postal_code: club?.club_postal_code || '',
        club_city: club?.club_city || '',
        club_email: finance?.email_sender?.trim() || club?.club_email || '',
        club_phone: club?.club_phone,
        club_website: club?.club_website,
        logo_url: club?.logo_url,

        qr_iban: finance?.qr_iban || '',
        bank_name: finance?.bank_name || '',
        bank_street: finance?.bank_street,
        bank_street_number: finance?.bank_street_number,
        bank_postal_code: finance?.bank_postal_code,
        bank_city: finance?.bank_city,

        contact_name: finance?.contact_name,
        contact_phone: finance?.contact_phone,
        payment_delay_days: finance?.payment_delay_days || 30,
      });
    } catch (e) {
      console.error(e);
      showToast("Le PDF n'a pas pu être généré. Rechargez la page et réessayez.", 'error');
    } finally {
      setDownloadingInvoice(null);
    }
  };

  const generateRFReference = (invoiceNumber: number): string => {
    // Build base reference (max 21 chars):
    const ref = String(invoiceNumber).padStart(21, '0');

    // ISO 11649: append 'RF00' + ref, convert letters to numbers
    // R=27, F=15
    const checkString = ref + '271500';

    // Calculate mod 97:
    let remainder = 0;
    for (const char of checkString) {
      remainder = (remainder * 10 + parseInt(char)) % 97;
    }

    const checkDigits = String(98 - remainder).padStart(2, '0');

    // Format: RF + checkDigits + reference
    const rfRef = 'RF' + checkDigits + ref;

    return rfRef; // return unformatted for QR data
  };

  const generateSingleInvoice = async (data: any) => {
    if (!activeSeason || !financeConfig) return;

    const { data: season } = await supabase
      .from('seasons')
      .select('invoice_next_number, invoice_prefix')
      .eq('id', activeSeason.id)
      .maybeSingle();

    if (!season) {
      showToast('Erreur lors de la récupération de la saison', 'error');
      return;
    }

    const prefix = financeConfig?.invoice_number_prefix || season.invoice_prefix;
    const invoiceNumber = `${prefix}-${
      String(season.invoice_next_number).padStart(4, '0')
    }`;

    const qrReference = generateRFReference(season.invoice_next_number);

    const issueDate = new Date();
    const dueDate = new Date();
    dueDate.setDate(
      dueDate.getDate() +
      (financeConfig?.payment_delay_days || 30)
    );

    const memberWithTeam = await supabase
      .from('members')
      .select('*, team:teams!team_id(id, name, category_id)')
      .eq('id', data.member.id)
      .maybeSingle();

    const team = memberWithTeam.data?.team;
    const categoryId = Array.isArray(team) ? team[0]?.category_id : team?.category_id;

    const { error } = await supabase
      .from('invoices')
      .insert({
        invoice_number: invoiceNumber,
        season_id: activeSeason.id,
        member_id: data.member.id,
        team_id: data.member.team_id,
        category_id: categoryId,
        base_amount: data.baseAmount,
        fratrie_discount_pct: data.fratrie_discount_pct || 0,
        fratrie_discount_amount: data.fratrie_discount_amount || 0,
        fratrie_sibling_count: data.fratrie_sibling_count || 1,
        total_amount: data.amount,
        qr_reference: qrReference,
        status: 'draft',
        issue_date: issueDate.toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0],
        notes: data.reason || null
      });

    if (!error) {
      await supabase
        .from('seasons')
        .update({
          invoice_next_number: season.invoice_next_number + 1
        })
        .eq('id', activeSeason.id);

      setShowInvoiceModal(false);
      showToast(`Facture ${invoiceNumber} générée !`, 'success');
      fetchMembers();
    } else {
      showToast('Erreur lors de la génération', 'error');
    }
  };

  const getGenderFromSalutation = (salutation: string | null | undefined): string | null => {
    if (!salutation) return null;
    const s = salutation.toLowerCase().trim();
    if (s.includes('madame') || s.includes('mme') || s === 'f') return 'F';
    if (s.includes('monsieur') || s.includes('m.') || s === 'm') return 'M';
    return null;
  };

  const normalizeLicenceStatus = (status: string | null | undefined): string | null => {
    if (!status) return null;
    const s = status.toLowerCase().trim();
    if (s.includes('attente')) return 'en_attente';
    if (s.includes('partant')) return 'declare_partant';
    if (s.includes('parti') || s.includes('transfert')) return 'parti';
    if (s.includes('inactif') || s.includes('inactive')) return 'inactif';
    if (s.includes('suspendu') || s.includes('suspend')) return 'suspendu';
    if (s.includes('actif') || s.includes('active')) return 'actif';
    return s;
  };

  const sanitizeJsNumber = (js: string | null | undefined): string | null => {
    if (!js || js.trim() === '' || js.trim() === '-') return null;
    const digits = js.replace(/[^\d]/g, '');
    return digits.length > 0 ? digits.substring(0, 9) : null;
  };

  const getLicenceNumber = (row: any): string | null => {
    const value = row['Numéro de passeport']
      || row['Numero de passeport']
      || row['N° de passeport']
      || row['Passeport']
      || row['Numéro de licence']
      || row['Numéro de licence ASF']
      || row['Licence ASF']
      || null;

    if (!value || value.trim() === '' || value.trim() === '-') return null;
    return String(value).trim();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { parseImportFile } = await import('../utils/memberImportParser');
      const rows = await parseImportFile(file);
      setImportPreview(rows as Partial<Member & { _affiliation?: string; _ligue?: string }>[]);
    } catch (err) {
      console.error('Import parse error:', err);
      showToast('Impossible de lire le fichier', 'error');
    }
  };

  const confirmImport = async () => {
    setIsImporting(true);

    const total = importPreview.length;
    setImportProgress({
      active: true,
      current: 0,
      total,
      phase: 'Import des joueurs...',
      teamsCreated: 0,
      playersImported: 0,
      playersUpdated: 0,
      playersSkipped: 0,
      currentPlayer: '',
      errors: []
    });

    const result = await importMembers(importPreview as ParsedRow[], {
      status: 'actif',
      createTeams: true,
      onProgress: (p) => {
        setImportProgress(prev => ({
          ...prev,
          current: p.current,
          total: p.total,
          phase: `${p.phase}`,
          currentPlayer: p.playerName ?? '',
          playersImported: p.imported ?? prev.playersImported,
          playersUpdated: p.updated ?? prev.playersUpdated,
          playersSkipped: p.skipped ?? prev.playersSkipped,
          teamsCreated: p.teamsCreatedCount ?? prev.teamsCreated,
        }));
      },
    });

    setImportProgress(prev => ({
      ...prev,
      active: false,
      phase: 'Import terminé !',
      playersImported: result.imported,
      playersUpdated: result.updated,
      playersSkipped: result.skipped,
      teamsCreated: result.teamsCreated.length,
    }));

    setImportResult({
      imported: result.imported,
      updated: result.updated,
      skipped: result.skipped,
      teamsCreated: result.teamsCreated,
      teamsWithoutCategory: result.teamsWithoutCategory,
      playersWithoutTeam: result.playersWithoutTeam,
      skippedReasons: result.skippedReasons,
    });
    setIsImporting(false);
    fetchMembers();
    fetchTotalCount();
    fetchTeams();
  };


  const closeImportModal = () => {
    setShowImportModal(false);
    setImportPreview([]);
    setImportResult(null);
    setIsImporting(false);
  };

  const parseDateDDMMYYYY = (dateStr: string): string | null => {
    const parts = dateStr.split('.');
    if (parts.length !== 3) return null;
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  };

  const showLegalRep = editingMember?.birth_date ? calculateAge(editingMember.birth_date)! < 18 : false;

  if (loading) {
    return <div className="p-8 text-[var(--text-primary)]">Chargement...</div>;
  }

  const isFiltered = searchQuery || filterTeam || filterStatus;
  const filteredCount = filteredMembers.length;

  const allSelectedAreDeparting =
    selectedIds.size > 0 &&
    Array.from(selectedIds).every(id =>
      members.find(m => m.id === id)?.licence_status === 'declare_partant'
    );

  return (
    <div className="p-4 lg:p-8 w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-3">
            <User className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
            Joueurs
            <PageTitleCount total={totalCount} filtered={filteredCount} isFiltered={!!isFiltered} />
          </h1>
          <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>Gestion des joueurs</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowSimulationModal(true)}>
            Simulation prochaine saison
          </Button>
          {isAdminOrCommittee && (
            <Button
              variant="secondary"
              onClick={() => setSimulateDecember(v => !v)}
              title="Aperçu admin du bandeau de décembre (sans effet sur la base)"
            >
              {simulateDecember ? 'Masquer aperçu décembre' : 'Simuler décembre'}
            </Button>
          )}
          {!accessLoading && canEdit && (
            <Button variant="secondary" onClick={() => setShowImportModal(true)}>
              <Upload size={20} />
              Importer CSV
            </Button>
          )}
          {!accessLoading && canEdit && (
            <Button variant="secondary" onClick={() => setShowGroupementImport(true)}>
              <Users size={20} />
              Importer groupement
            </Button>
          )}
          {!accessLoading && canEdit && (
            <Button
              variant="primary"
              onClick={() => handleOpenModal()}
            >
              <Plus size={20} />
              Nouveau joueur
            </Button>
          )}
        </div>
      </div>

      <DepartureReminderBanner
        simulateDecember={simulateDecember}
        onDisableTest={() => setSimulateDecember(false)}
        onViewDepartures={() => setFilterStatus('a_declarer_partant')}
      />

      <div className="mb-6 flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Rechercher par prénom, nom, email, AVS ou licence ASF..."
          />
        </div>
        <select
          value={filterTeam}
          onChange={(e) => setFilterTeam(e.target.value)}
          className="px-4 py-2 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)]"
        >
          <option value="">Toutes les équipes</option>
          {teams.map(team => (
            <option key={team.id} value={team.id}>{team.name}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-2 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)]"
        >
          <option value="active">Liste active (non archivés)</option>
          <option value="all">Tous les statuts</option>
          <option value="actif">Actifs</option>
          <option value="en_attente">En attente</option>
          <option value="a_declarer_partant">À déclarer partants</option>
          <option value="declare_partant">✔️ Déclarés partants</option>
          <option value="archive">Archivés</option>
          <option value="inactif">Inactifs</option>
          <option value="suspendu">Suspendus</option>
          <option value="groupement">Groupement</option>
        </select>
        <select
          value={filterGender}
          onChange={(e) => setFilterGender(e.target.value)}
          className="px-4 py-2 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)]"
        >
          <option value="">Tous</option>
          <option value="M">Masculin</option>
          <option value="F">Féminin</option>
        </select>
        <button
          onClick={() => setShowWithoutTeam(!showWithoutTeam)}
          style={{
            background: showWithoutTeam
              ? 'var(--warning-soft)'
              : 'transparent',
            border: '1px solid',
            borderColor: showWithoutTeam ? 'var(--warning)' : 'var(--border-color)',
            color: showWithoutTeam ? 'var(--warning-text)' : 'var(--text-muted)',
            borderRadius: '8px',
            padding: '6px 14px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: showWithoutTeam ? '600' : '400',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <AlertTriangle className="w-3.5 h-3.5 inline" /> Sans équipe
          {withoutTeamCount > 0 && (
            <span style={{
              background: 'var(--warning)',
              color: 'white',
              borderRadius: '99px',
              padding: '1px 7px',
              fontSize: '11px',
              fontWeight: '700'
            }}>
              {withoutTeamCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setShowUnavailable(!showUnavailable)}
          style={{
            background: showUnavailable
              ? 'var(--warning-soft)'
              : 'transparent',
            border: '1px solid',
            borderColor: showUnavailable ? 'var(--warning)' : 'var(--border-color)',
            color: showUnavailable ? 'var(--warning-text)' : 'var(--text-muted)',
            borderRadius: '8px',
            padding: '6px 14px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: showUnavailable ? '600' : '400',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          Indisponibles
          {unavailableCount > 0 && (
            <span style={{
              background: 'var(--warning)',
              color: 'white',
              borderRadius: '99px',
              padding: '1px 7px',
              fontSize: '11px',
              fontWeight: '700'
            }}>
              {unavailableCount}
            </span>
          )}
        </button>
      </div>

      {selectedIds.size > 0 && (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--primary)',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap'
        }}>
          <div style={{color: 'var(--text-primary)', fontWeight: '600'}}>
            {selectedIds.size} joueur(s) sélectionné(s)
            <span style={{color: 'var(--text-muted)', fontSize: '13px', marginLeft: '8px'}}>
              (sélection persistante entre les recherches)
            </span>
          </div>

          <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
            <Button variant="primary" size="sm" onClick={() => setShowAddToTeamModal(true)}>
              <Users className="w-4 h-4 inline mr-1" /> Ajouter à une équipe
            </Button>

            {selectedIds.size > 0 && (
              <Button
                variant="warning"
                size="sm"
                onClick={() => {
                  showConfirm({
                    title: 'Archiver les joueurs',
                    message: `Archiver ${selectedIds.size} joueur(s) ? Ils passeront en statut Archivé et sortiront de la liste active. (Leur statut de licence n'est pas modifié.)`,
                    confirmLabel: 'Oui, archiver',
                    cancelLabel: 'Annuler',
                    confirmStyle: 'primary',
                    onConfirm: () => { hideConfirm(); archiveSelected(); }
                  });
                }}
              >
                Archiver la sélection
              </Button>
            )}

            <Button variant="secondary" size="sm" onClick={() => exportSelected('xlsx')}>
              Exporter XLSX
            </Button>

            <Button variant="secondary" size="sm" onClick={() => exportSelected('csv')}>
              Exporter CSV
            </Button>

            <Button variant="secondary" size="sm" onClick={() => setSelectedIds(new Set())}>
              Effacer la sélection
            </Button>
          </div>
        </div>
      )}

      <div className="std-table-wrap">
        <style>{`
          .players-sticky-head thead th { position: relative; }
          .players-sticky-head thead th::after {
            content: '';
            position: absolute;
            left: 0; right: 0; bottom: -8px;
            height: 8px;
            pointer-events: none;
            background: linear-gradient(to bottom, rgba(0,0,0,0.28), rgba(0,0,0,0));
          }
        `}</style>
        <div
          className="overflow-x-auto"
          style={{ maxHeight: 'calc(100vh - 240px)', overflowY: 'auto', overflowX: 'auto' }}
        >
          <table className="std-table players-sticky-head" style={{ minWidth: '900px', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr>
                <th
                  className="px-4 py-3 text-center"
                  style={{
                    width: '50px',
                    position: 'sticky', top: 0, zIndex: 2,
                    background: 'var(--table-header-bg)',
                    borderBottom: '1px solid var(--border-color)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={filteredMembers.length > 0 && filteredMembers.every(m => selectedIds.has(m.id))}
                    onChange={toggleSelectAll}
                    title="Sélectionner tous les joueurs visibles"
                    className="cursor-pointer"
                  />
                </th>
                <SortableHeader label="Nom" field="last_name" sortField={sortField} sortDir={sortDir} onSort={handleSort} style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }} />
                <SortableHeader label="Prénom" field="first_name" sortField={sortField} sortDir={sortDir} onSort={handleSort} style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }} />
                <SortableHeader label="Année" field="birth_date" sortField={sortField} sortDir={sortDir} onSort={handleSort} style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }} />
                <SortableHeader label="Équipe" field="team" sortField={sortField} sortDir={sortDir} onSort={handleSort} style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }} />
                <SortableHeader label="Statut" field="licence_status" sortField={sortField} sortDir={sortDir} onSort={handleSort} style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }} />
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider"
                  style={{
                    position: 'sticky', top: 0, zIndex: 2,
                    background: 'var(--table-header-bg)',
                    borderBottom: '1px solid var(--border-color)',
                  }}
                >
                  Mobile
                </th>
                <th
                  className="py-3 text-center text-xs font-medium text-[var(--text-secondary)]"
                  style={{
                    width: '36px', minWidth: '36px',
                    position: 'sticky', top: 0, zIndex: 2,
                    background: 'var(--table-header-bg)',
                    borderBottom: '1px solid var(--border-color)',
                  }}
                  title="Parent au club"
                >
                </th>
                <th
                  className="px-6 py-3 text-right text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider"
                  style={{
                    width: '100px', minWidth: '100px',
                    position: 'sticky', top: 0, zIndex: 2,
                    background: 'var(--table-header-bg)',
                    borderBottom: '1px solid var(--border-color)',
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedMembers.map((member) => {
                const isSelected = selectedIds.has(member.id);
                const isGroupement = member.status === 'groupement' || !!member.groupement_id;
                const isDeparting = member.licence_status === 'declare_partant';
                return (
                <tr
                  key={member.id}
                  className="cursor-pointer"
                  onClick={() => handleRowClick(member)}
                  style={{
                    background: isSelected
                      ? 'rgba(var(--primary-rgb), 0.15)'
                      : isDeparting
                        ? 'var(--danger-soft)'
                        : isGroupement
                          ? 'var(--warning-soft)'
                          : 'transparent',
                    borderLeft: isSelected
                      ? '3px solid var(--primary)'
                      : isDeparting
                        ? '3px solid var(--danger)'
                        : isGroupement
                          ? '3px solid var(--warning)'
                          : '3px solid transparent'
                  }}
                >
                  <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(member.id)}
                      onChange={() => toggleSelect(member.id)}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-primary)] font-medium">
                    <span className="inline-flex items-center gap-2">
                      {getMemberPhotoUrl(member.photo_path, photoUrls, member.photo_url) ? (
                        <ZoomablePhoto src={getMemberPhotoUrl(member.photo_path, photoUrls, member.photo_url)!} caption={`${member.first_name} ${member.last_name}`} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <span className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                          {member.last_name[0]}{member.first_name[0]}
                        </span>
                      )}
                      {member.jersey_number != null && (
                        <span style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', fontSize: '10px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', whiteSpace: 'nowrap' }}>#{member.jersey_number}</span>
                      )}
                      {member.last_name}
                      <GroupementBadge
                        status={member.status}
                        groupementId={member.groupement_id}
                        groupementName={member.groupements?.name}
                      />
                      {availabilityBadgeVariant(member.availability) && (
                        <span title={availabilitySummary(member.availability, member.availability_until) || ''}>
                          <Badge variant={availabilityBadgeVariant(member.availability)!}>
                            {availabilityLabel(member.availability)}
                          </Badge>
                        </span>
                      )}
                      {member.receives_convocations === false && (
                        <Badge variant="neutral">Sans convocation</Badge>
                      )}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-primary)]">
                    {member.first_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-secondary)]">
                    {member.birth_date ? new Date(member.birth_date).getFullYear() : '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-secondary)]">
                    {member.teams?.name || '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {(() => {
                      if (member.status === 'archive') {
                        return <span className="inline-flex items-center gap-1.5"><Badge variant="neutral">Archivé</Badge>{member.departure_date && <span className="text-xs text-[var(--text-muted)]">{new Date(member.departure_date).toLocaleDateString('fr-FR')}</span>}</span>;
                      }
                      const b = getStatusBadge(member.licence_status);
                      return <Badge variant={b.variant}>{b.label}</Badge>;
                    })()}
                    {member.billable === false && (
                      <span title="Non facturable" style={{ marginLeft: '6px', color: 'var(--text-muted)', fontSize: '11px' }}><Ban className="w-3 h-3 inline" /></span>
                    )}
                    {member.fee_exempt && (
                      <span title={member.fee_exempt_reason || 'Exonéré'} style={{ marginLeft: '4px' }}><Badge variant="blue">Exonéré</Badge></span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-secondary)]">
                    {(() => {
                      const isMinor = member.birth_date
                        ? (new Date().getFullYear() - new Date(member.birth_date).getFullYear()) < 18
                        : false;
                      const repBadge = (
                        <span className="badge badge-neutral" style={{
                          fontSize: '10px',
                          borderRadius: '4px',
                          padding: '1px 5px',
                          marginLeft: '6px'
                        }}><Users className="w-3 h-3 inline mr-0.5" /> Rep.</span>
                      );
                      // Mineur : le bon interlocuteur est le représentant légal
                      if (isMinor && member.legal_rep1_phone) {
                        return <span>{member.legal_rep1_phone}{repBadge}</span>;
                      }
                      if (member.phone) return member.phone;
                      if (member.legal_rep1_phone) {
                        return <span>{member.legal_rep1_phone}{repBadge}</span>;
                      }
                      return '—';
                    })()}
                  </td>
                  <td className="py-4 text-center" style={{ width: '36px' }}>
                    {parentChildrenMap[member.id] && (
                      <span
                        title={`Parent de : ${parentChildrenMap[member.id].join(', ')}`}
                        className="badge badge-neutral"
                        style={{ fontSize: '12px', cursor: 'default' }}
                      ><User className="w-3 h-3 inline" /></span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium" style={{ minWidth: '120px' }} onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => findSiblings(member)}
                        title={hasSiblings(member) ? "Voir les frères/sœurs" : "Aucun frère/sœur trouvé"}
                        style={{
                          background: hasSiblings(member)
                            ? 'var(--success-soft)'
                            : 'var(--warning-soft)',
                          color: hasSiblings(member)
                            ? 'var(--success-text)' : 'var(--warning-text)',
                          border: `1px solid ${hasSiblings(member)
                            ? 'var(--success)'
                            : 'var(--warning)'}`,
                          borderRadius: '6px',
                          padding: '4px 8px',
                          cursor: 'pointer'
                        }}
                      >
                        <Users className="w-5 h-5" />
                      </button>
                      {financeEnabled && (() => {
                        const memberInvoice = invoiceMap[member.id];
                        const hasInvoice = !!memberInvoice;
                        const isDownloading = downloadingInvoice === memberInvoice?.id;
                        const isNonBillable = !hasInvoice && member.billable === false;
                        return (
                          <button
                            onClick={() => {
                              if (isNonBillable) return;
                              hasInvoice
                                ? showInvoiceInfo(memberInvoice)
                                : openInvoiceModal(member);
                            }}
                            disabled={isDownloading || isNonBillable}
                            title={isNonBillable
                              ? "Ce membre est marqué comme non facturable. Réactivez « À facturer » dans l'onglet Facturation pour générer une facture."
                              : hasInvoice
                                ? `Facture ${memberInvoice.invoice_number}`
                                : "Générer une facture"}
                            style={{
                              background: hasInvoice
                                ? 'var(--success-soft)'
                                : 'var(--warning-soft)',
                              color: hasInvoice ? 'var(--success-text)' : 'var(--warning-text)',
                              border: `1px solid ${hasInvoice
                                ? 'var(--success)'
                                : 'var(--warning)'}`,
                              borderRadius: '6px',
                              padding: '4px 8px',
                              cursor: isDownloading || isNonBillable ? 'not-allowed' : 'pointer',
                              fontSize: '16px',
                              opacity: isDownloading || isNonBillable ? 0.4 : 1
                            }}
                          >
                            {isDownloading ? <Clock className="w-4 h-4 inline animate-spin" /> : <FileText className="w-4 h-4 inline" />}
                          </button>
                        );
                      })()}
                      {!accessLoading && canEdit && member.status === 'archive' && (
                        <button
                          onClick={async () => {
                            const { error } = await supabase
                              .from('members')
                              .update({ status: 'actif', departure_date: null })
                              .eq('id', member.id);
                            if (!error) {
                              fetchMembers();
                              showToast('Joueur réactivé', 'success');
                            } else {
                              showToast('Erreur lors de la réactivation', 'error');
                            }
                          }}
                          title="Réactiver le joueur"
                          className="text-[var(--success)] hover:opacity-80"
                        >
                          <RefreshCw className="w-5 h-5" />
                        </button>
                      )}
                      {!accessLoading && canEdit && (
                        <>
                          <button
                            onClick={() => setCreateAccessFor(member)}
                            title="Créer un accès"
                            className="text-[var(--success)] hover:opacity-80"
                          >
                            <KeyRound className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleOpenModal(member)}
                            className="text-[var(--accent)] hover:opacity-80"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => {
                              showConfirm({
                                title: 'Supprimer le joueur',
                                message: 'Êtes-vous sûr de vouloir supprimer ce joueur ?',
                                confirmLabel: 'Oui, supprimer',
                                cancelLabel: 'Non',
                                confirmStyle: 'danger',
                                onConfirm: () => {
                                  hideConfirm();
                                  handleDelete(member.id);
                                }
                              });
                            }}
                            className="text-[var(--danger)] hover:opacity-80"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
              {sortedMembers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-[var(--text-muted)]">
                    Aucun joueur trouvé
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {createAccessFor && (
        <CreateUserModal
          onClose={() => setCreateAccessFor(null)}
          onSuccess={() => setCreateAccessFor(null)}
          lockRole
          preselected={{
            id: createAccessFor.id,
            full_name: `${createAccessFor.first_name} ${createAccessFor.last_name}`.trim(),
            email: createAccessFor.email,
            photo_url: null,
            source: 'member',
            source_label: 'Joueur',
            suggested_role: 'member',
          }}
        />
      )}

      <PlayerFormModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSubmit={handleSubmit}
        editingMember={editingMember}
        teams={teams}
        formData={formData}
        setFormData={setFormData}
        saving={saving}
      />

      <GroupementImportModal
        isOpen={showGroupementImport}
        onClose={() => setShowGroupementImport(false)}
        onImported={() => { fetchMembers(); }}
      />

      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--bg-card)] rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 rounded-t-xl flex items-center justify-between" style={{ background: 'var(--bg-modal-header)' }}>
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-modal-header)' }}>Importer CSV ClubCorner</h2>
              <button onClick={closeImportModal} className="hover:opacity-80" style={{ color: 'var(--text-modal-header)' }}>
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {importResult ? (
                <div className="space-y-4">
                  <div className="bg-[var(--success-soft)] border border-[var(--success)] rounded-lg p-6">
                    <div className="text-4xl mb-4 text-center"><CheckCircle className="w-10 h-10 inline" style={{ color: 'var(--success)' }} /></div>
                    <p className="text-xl font-semibold text-[var(--success)] mb-4 text-center">
                      Import terminé
                    </p>
                    <div className="grid grid-cols-3 gap-3 mb-6">
                      <div className="rounded-lg p-4 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--success)' }}>
                        <div className="text-2xl font-bold" style={{ color: 'var(--success)' }}>{importResult.imported}</div>
                        <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Joueurs importés</div>
                      </div>
                      <div className="rounded-lg p-4 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--accent)' }}>
                        <div className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>{importResult.teamsCreated.length}</div>
                        <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Équipes créées</div>
                      </div>
                      <div className="rounded-lg p-4 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--warning)' }}>
                        <div className="text-2xl font-bold" style={{ color: 'var(--warning)' }}>{importResult.skipped}</div>
                        <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Ignorés</div>
                      </div>
                    </div>
                    <div className="space-y-3 text-[var(--text-secondary)]">
                      <p className="font-medium">
                        <Check className="w-4 h-4 inline mr-1" /> {importResult.imported} joueurs importés
                      </p>
                      {importResult.updated > 0 && (
                        <p className="font-medium">
                          <RefreshCw className="w-4 h-4 inline mr-1" /> {importResult.updated} joueurs mis à jour
                        </p>
                      )}
                      <p className="font-medium">
                        <SkipForward className="w-4 h-4 inline mr-1" /> {importResult.skipped} joueurs ignorés (déjà à jour)
                      </p>

                      {importResult.teamsCreated.length > 0 && (
                        <div>
                          <p className="font-medium mb-2">
                            <MapPin className="w-4 h-4 inline mr-1" /> Équipes créées automatiquement ({importResult.teamsCreated.length}):
                          </p>
                          <div className="ml-4 space-y-1 max-h-60 overflow-y-auto">
                            {importResult.teamsCreated.map((team, idx) => (
                              <p key={idx} className="text-sm">
                                • {team.name} → {team.category || 'Sans catégorie'} ({team.type}) {team.category ? <Check className="w-3 h-3 inline" /> : <AlertTriangle className="w-3 h-3 inline" />}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}

                      {importResult.teamsWithoutCategory.length > 0 && (
                        <p className="text-[var(--warning-text)] font-medium">
                          <AlertTriangle className="w-4 h-4 inline mr-1" /> {importResult.teamsWithoutCategory.length} équipe{importResult.teamsWithoutCategory.length !== 1 ? 's' : ''} sans catégorie trouvée (à assigner manuellement)
                        </p>
                      )}

                      {importResult.playersWithoutTeam > 0 && (
                        <p className="text-[var(--warning-text)] font-medium">
                          <AlertTriangle className="w-4 h-4 inline mr-1" /> {importResult.playersWithoutTeam} joueur{importResult.playersWithoutTeam !== 1 ? 's' : ''} sans équipe
                        </p>
                      )}

                      {importResult.skippedReasons && importResult.skippedReasons.length > 0 && (
                        <div>
                          <p className="font-medium mb-2 text-[var(--warning-text)]">
                            <AlertTriangle className="w-4 h-4 inline mr-1" /> Premiers joueurs ignorés (raison):
                          </p>
                          <div className="ml-4 space-y-1 max-h-60 overflow-y-auto bg-[var(--bg-app)]/50 rounded p-2">
                            {importResult.skippedReasons.map((skip, idx) => (
                              <p key={idx} className="text-sm text-[var(--text-secondary)]">
                                {idx + 1}. {skip.name} — {skip.reason}
                              </p>
                            ))}
                            {importResult.skipped > 10 && (
                              <p className="text-sm text-[var(--text-muted)] italic">
                                ... et {importResult.skipped - 10} autres joueurs ignorés
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : importPreview.length > 0 ? (
                <div className="space-y-4">
                  <div className="bg-[var(--info-soft)] border border-[var(--info)] rounded-lg p-4">
                    <p className="text-[var(--info-text)] font-medium">
                      {importPreview.length} joueur{importPreview.length !== 1 ? 's' : ''} trouvé{importPreview.length !== 1 ? 's' : ''} dans le fichier
                    </p>
                  </div>

                  <div className="bg-[var(--warning-soft)] border border-[var(--warning)] rounded-lg p-4">
                    <p className="text-[var(--warning-text)] text-sm">
                      Ce fichier contient des données sensibles (AVS, licence ASF). Visibles uniquement par les admins.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-[var(--text-primary)] font-semibold mb-3">Aperçu (5 premières lignes)</h3>
                    <div className="bg-[var(--bg-app)] rounded-lg overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead style={{ background: 'var(--table-header-bg)' }}>
                          <tr>
                            <th className="px-4 py-2 text-left text-[var(--text-secondary)]">Prénom</th>
                            <th className="px-4 py-2 text-left text-[var(--text-secondary)]">Nom</th>
                            <th className="px-4 py-2 text-left text-[var(--text-secondary)]">Date naissance</th>
                            <th className="px-4 py-2 text-left text-[var(--text-secondary)]">Email</th>
                            <th className="px-4 py-2 text-left text-[var(--text-secondary)]">J+S</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                          {importPreview.slice(0, 5).map((member, idx) => (
                            <tr key={idx} className="hover:bg-[var(--bg-hover)]/50">
                              <td className="px-4 py-2 text-[var(--text-secondary)]">{member.first_name}</td>
                              <td className="px-4 py-2 text-[var(--text-secondary)]">{member.last_name}</td>
                              <td className="px-4 py-2 text-[var(--text-secondary)]">
                                {member.birth_date ? new Date(member.birth_date).toLocaleDateString('fr-FR') : '-'}
                              </td>
                              <td className="px-4 py-2 text-[var(--text-secondary)]">{member.email || '-'}</td>
                              <td className="px-4 py-2 text-[var(--text-secondary)]">{member.js_number || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-[var(--warning-soft)] border border-[var(--warning)] rounded-lg p-4">
                    <p className="text-[var(--warning-text)] text-sm">
                      Ce fichier contient des données sensibles (AVS, licence ASF). Visibles uniquement par les admins.
                    </p>
                  </div>

                  <div className="text-sm text-[var(--text-secondary)] space-y-2">
                    <p><strong>Format attendu:</strong></p>
                    <ul className="list-disc list-inside space-y-1 text-[var(--text-muted)]">
                      <li>Séparateur: point-virgule (;)</li>
                      <li>Encodage: ISO-8859-1</li>
                      <li>Première ligne: en-têtes</li>
                    </ul>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                      Sélectionner le fichier CSV
                    </label>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleFileSelect}
                      className="w-full px-3 py-2 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-[var(--bg-hover)] file:text-[var(--text-primary)] hover:file:opacity-80"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-[var(--border-color)] flex justify-end gap-3">
              {importResult ? (
                <Button
                  variant="primary"
                  onClick={closeImportModal}
                >
                  Fermer
                </Button>
              ) : importPreview.length > 0 ? (
                <>
                  <button
                    onClick={closeImportModal}
                    className="px-6 py-2 bg-[var(--bg-hover)] text-[var(--text-primary)] rounded-lg hover:opacity-80 transition-colors"
                  >
                    Annuler
                  </button>
                  <Button
                    variant="primary"
                    onClick={confirmImport}
                    disabled={isImporting}
                  >
                    {isImporting ? (
                      <>
                        <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Import en cours...
                      </>
                    ) : (
                      <>
                        Confirmer l'import →
                      </>
                    )}
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {showDetailPanel && selectedMember && (
        <div className="fixed inset-0 bg-black/50 z-50" onClick={handleCloseDetailPanel}>
          <div
            ref={detailPanelRef}
            onScroll={(e) => setDetailScrolled((e.target as HTMLElement).scrollTop > 0)}
            style={{
              position: 'fixed',
              right: 0,
              top: 0,
              bottom: 0,
              width: 'min(880px, 95vw)',
              maxWidth: '100vw',
              background: 'var(--bg-app)',
              borderLeft: '1px solid var(--border-color)',
              zIndex: 1000,
              overflowY: 'auto',
              boxShadow: '-4px 0 24px rgba(0,0,0,0.5)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0" style={{ zIndex: 10, background: 'var(--bg-app)' }}>
              <div className="px-6 py-4 flex items-center justify-between" style={{ background: 'var(--bg-modal-header)' }}>
                <div className="flex items-center gap-4">
                  {getMemberPhotoUrl(selectedMember.photo_path, photoUrls, selectedMember.photo_url) ? (
                    <ZoomablePhoto
                      src={getMemberPhotoUrl(selectedMember.photo_path, photoUrls, selectedMember.photo_url)!}
                      caption={`${selectedMember.first_name} ${selectedMember.last_name}`}
                      alt=""
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-[var(--accent)] flex items-center justify-center text-white font-bold text-lg">
                      {selectedMember.first_name[0]}{selectedMember.last_name[0]}
                    </div>
                  )}
                  <div>
                    <h2 className="text-xl font-bold" style={{ color: 'var(--text-modal-header)' }}>
                      {selectedMember.first_name} {selectedMember.last_name}
                    </h2>
                    <div className="flex items-center gap-2 mt-1">
                      {selectedMember.status === 'archive'
                        ? <Badge variant="neutral">Archivé</Badge>
                        : (() => {
                            const b = getStatusBadge(selectedMember.licence_status);
                            return <Badge variant={b.variant}>{b.label}</Badge>;
                          })()
                      }
                      {selectedMember.teams && (
                        <Badge variant="blue">
                          {selectedMember.teams.name}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleCloseDetailPanel}
                  className="hover:opacity-80"
                  style={{ color: 'var(--text-modal-header)' }}
                >
                  <X size={24} />
                </button>
              </div>

              <Tabs
                items={[
                  { key: 'profil', label: 'Profil' },
                  { key: 'legal', label: 'Représentants légaux' },
                  { key: 'club', label: 'Club' },
                  { key: 'notes', label: 'Notes' },
                  ...(financeEnabled ? [{ key: 'facturation', label: 'Facturation' }] : []),
                  ...(!accessLoading && canEdit ? [{ key: 'evaluation', label: 'Profil du joueur' }] : []),
                  { key: 'historique', label: 'Historique' },
                ]}
                value={detailTab}
                onChange={(key) => setDetailTab(key as 'profil' | 'legal' | 'club' | 'notes' | 'facturation' | 'evaluation' | 'historique')}
              />
              {detailScrolled && (
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '1px', boxShadow: '0 1px 4px rgba(0,0,0,0.12)' }} />
              )}
            </div>

            <div className="p-6 space-y-6" style={{ background: 'var(--bg-app)' }}>
              {detailTab === 'profil' && (
                <>
                  <div className="flex items-start gap-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px' }}>
                    <div className="relative">
                      {getMemberPhotoUrl(selectedMember.photo_path, photoUrls, selectedMember.photo_url) ? (
                        <ZoomablePhoto
                          src={getMemberPhotoUrl(selectedMember.photo_path, photoUrls, selectedMember.photo_url)!}
                          caption={`${selectedMember.first_name} ${selectedMember.last_name}`}
                          alt=""
                          className="rounded-lg object-cover"
                          style={{ width: 120, height: 154, border: '1px solid var(--border-color)' }}
                        />
                      ) : (
                        <div className="rounded-lg flex flex-col items-center justify-center gap-2" style={{ width: 120, height: 154, background: 'var(--bg-hover)', border: '1px dashed var(--border-color)' }}>
                          <Camera size={24} style={{ color: 'var(--text-muted)' }} />
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Aucune photo</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 pt-1">
                      {(selectedMember.photo_path || selectedMember.photo_url) && (
                        <button
                          onClick={handleDownloadPhoto}
                          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
                          style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
                        >
                          <Download size={14} />
                          Télécharger la photo
                        </button>
                      )}
                      <button
                        onClick={() => replacePhotoRef.current?.click()}
                        disabled={replacingPhoto}
                        className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
                        style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
                      >
                        <Camera size={14} />
                        {replacingPhoto
                          ? (selectedMember.photo_path ? 'Remplacement...' : 'Ajout...')
                          : (selectedMember.photo_path ? 'Remplacer la photo' : 'Ajouter une photo')}
                      </button>
                      <input
                        ref={replacePhotoRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleReplacePhoto(f);
                          e.target.value = '';
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
                    <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3 border-b border-[var(--border-color)] pb-2">Identité</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-[var(--text-muted)]">Prénom</p>
                        <p className="text-[var(--text-primary)]">{selectedMember.first_name}</p>
                      </div>
                      <div>
                        <p className="text-sm text-[var(--text-muted)]">Nom</p>
                        <p className="text-[var(--text-primary)]">{selectedMember.last_name}</p>
                      </div>
                      <div>
                        <p className="text-sm text-[var(--text-muted)]">Date de naissance</p>
                        <p className="text-[var(--text-primary)]">
                          {selectedMember.birth_date
                            ? `${new Date(selectedMember.birth_date).toLocaleDateString('fr-FR')} (${calculateAge(selectedMember.birth_date)} ans)`
                            : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-[var(--text-muted)]">Nationalité</p>
                        <p className="text-[var(--text-primary)]">{selectedMember.nationality || '-'}</p>
                      </div>
                      {selectedMember.gender && (
                        <div>
                          <p className="text-sm text-[var(--text-muted)]">Genre</p>
                          <p className="text-[var(--text-primary)]">{getGenreLabel(selectedMember.gender)}</p>
                        </div>
                      )}
                      {selectedMember.pseudonym && (
                        <div>
                          <p className="text-sm text-[var(--text-muted)]">Pseudonyme</p>
                          <p className="text-[var(--text-primary)]">{selectedMember.pseudonym}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {isAdminOrCommittee && (
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
                      <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3 border-b border-[var(--border-color)] pb-2">Documents (admin)</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-[var(--text-muted)]">Numéro AVS</p>
                          <p className="text-[var(--text-primary)]">{selectedMember.avs_number ? <MaskedAVS avs={selectedMember.avs_number} memberId={selectedMember.id} context="annuaire_joueurs" /> : '-'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-[var(--text-muted)]">Licence ASF</p>
                          <p className="text-[var(--text-primary)]">{selectedMember.asf_licence_number || '-'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-[var(--text-muted)]">Numéro J+S</p>
                          <p className="text-[var(--text-primary)]">{selectedMember.js_number || '-'}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
                    <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3 border-b border-[var(--border-color)] pb-2">Autorisations</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-[var(--text-muted)]">Autorisation photo (site, réseaux sociaux)</p>
                        <p className="text-[var(--text-primary)]">
                          {(selectedMember as any).photo_consent === true ? 'Oui' : (selectedMember as any).photo_consent === false ? 'Non' : 'Pas de réponse'}
                        </p>
                      </div>
                      {(selectedMember as any).photo_consent_date && (
                        <div>
                          <p className="text-sm text-[var(--text-muted)]">Date de réponse</p>
                          <p className="text-[var(--text-primary)]">{new Date((selectedMember as any).photo_consent_date).toLocaleDateString('fr-CH')}</p>
                        </div>
                      )}
                      {websiteEnabled && (
                      <div>
                        <p className="text-sm text-[var(--text-muted)]">Site du club</p>
                        <p className="text-[var(--text-primary)]">{(selectedMember as any).hide_from_site ? 'Masqué' : 'Visible'}</p>
                      </div>
                      )}
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
                    <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3 border-b border-[var(--border-color)] pb-2">Coordonnées</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-[var(--text-muted)]">Email privé</p>
                        {selectedMember.email ? (
                          <a href={`mailto:${selectedMember.email}`} className="text-[var(--accent)] hover:opacity-80">
                            <Mail className="w-3.5 h-3.5 inline mr-1" /> {selectedMember.email}
                          </a>
                        ) : (
                          <p className="text-[var(--text-primary)]">-</p>
                        )}
                      </div>
                      {selectedMember.email_pro && (
                        <div>
                          <p className="text-sm text-[var(--text-muted)]">Email pro</p>
                          <a href={`mailto:${selectedMember.email_pro}`} className="text-[var(--accent)] hover:opacity-80">
                            <Mail className="w-3.5 h-3.5 inline mr-1" /> {selectedMember.email_pro}
                          </a>
                        </div>
                      )}
                      <div>
                        <p className="text-sm text-[var(--text-muted)]">Mobile</p>
                        {selectedMember.phone ? (
                          <a href={`tel:${selectedMember.phone}`} className="text-[var(--accent)] hover:opacity-80">
                            <Smartphone className="w-3.5 h-3.5 inline mr-1" /> {selectedMember.phone}
                          </a>
                        ) : (
                          <p className="text-[var(--text-primary)]">-</p>
                        )}
                      </div>
                      {selectedMember.phone_private && (
                        <div>
                          <p className="text-sm text-[var(--text-muted)]">Téléphone privé</p>
                          <a href={`tel:${selectedMember.phone_private}`} className="text-[var(--accent)] hover:opacity-80">
                            <Phone className="w-3.5 h-3.5 inline mr-1" /> {selectedMember.phone_private}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
                    <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3 border-b border-[var(--border-color)] pb-2">Adresse</h3>
                    <div className="space-y-2">
                      <div style={{ color: 'var(--text-primary)', fontWeight: '600' }}>
                        {[selectedMember.address, selectedMember.street_number]
                          .filter(Boolean).join(' ') || '—'}
                      </div>
                      {selectedMember.address2 && (
                        <p className="text-[var(--text-primary)]">{selectedMember.address2}</p>
                      )}
                      <div style={{ color: 'var(--text-primary)' }}>
                        {[selectedMember.postal_code, selectedMember.city]
                          .filter(Boolean).join(' ') || '—'}
                      </div>
                      {selectedMember.canton && (
                        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                          {selectedMember.canton}{selectedMember.country
                            ? ` — ${countryNames[selectedMember.country] || selectedMember.country}` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {detailTab === 'legal' && (
                <>
                <div>
                  {(selectedMember.legal_rep1_firstname || selectedMember.legal_rep1_lastname || selectedMember.legal_rep1_email || selectedMember.legal_rep1_phone ||
                    selectedMember.legal_rep2_firstname || selectedMember.legal_rep2_lastname || selectedMember.legal_rep2_email || selectedMember.legal_rep2_phone) ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {(selectedMember.legal_rep1_firstname || selectedMember.legal_rep1_lastname || selectedMember.legal_rep1_email || selectedMember.legal_rep1_phone) && (
                        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <User className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
                            <h3 className="text-lg font-semibold text-[var(--text-primary)]">Représentant légal 1</h3>
                          </div>
                          {selectedMember.legal_rep1_relation && (
                            <Badge variant="blue" className="mb-3">
                              {selectedMember.legal_rep1_relation}
                            </Badge>
                          )}
                          <div className="space-y-2">
                            <p className="text-[var(--text-primary)] text-lg font-medium">
                              <User className="w-3.5 h-3.5 inline mr-1" /> {(selectedMember.legal_rep1_firstname || selectedMember.legal_rep1_lastname) ? `${selectedMember.legal_rep1_firstname || ''} ${selectedMember.legal_rep1_lastname || ''}`.trim() : (() => { const pa = selectedMember.legal_rep1_email && parentAccounts.find(p => p.email && p.email.toLowerCase() === selectedMember.legal_rep1_email!.toLowerCase()); return (pa && pa.fullName && pa.fullName !== 'Inconnu') ? pa.fullName : selectedMember.legal_rep1_email; })()}
                            </p>
                            {selectedMember.legal_rep1_email && (
                              <a href={`mailto:${selectedMember.legal_rep1_email}`} className="text-[var(--accent)] hover:opacity-80 block">
                                <Mail className="w-3.5 h-3.5 inline mr-1" /> {selectedMember.legal_rep1_email}
                              </a>
                            )}
                            {selectedMember.legal_rep1_phone && (
                              <a href={`tel:${selectedMember.legal_rep1_phone}`} className="text-[var(--accent)] hover:opacity-80 block">
                                <Smartphone className="w-3.5 h-3.5 inline mr-1" /> {selectedMember.legal_rep1_phone}
                              </a>
                            )}
                            {(selectedMember.legal_rep1_address || selectedMember.legal_rep1_postal_code || selectedMember.legal_rep1_city) && (
                              <div className="mt-3 pt-3 border-t border-[var(--border-color)]">
                                <p className="text-sm text-[var(--text-muted)] mb-1"><Home className="w-3.5 h-3.5 inline mr-1" /> Adresse</p>
                                {selectedMember.legal_rep1_address && (
                                  <p className="text-[var(--text-primary)]">{selectedMember.legal_rep1_address}</p>
                                )}
                                {(selectedMember.legal_rep1_postal_code || selectedMember.legal_rep1_city) && (
                                  <p className="text-[var(--text-primary)]">
                                    {selectedMember.legal_rep1_postal_code} {selectedMember.legal_rep1_city}
                                  </p>
                                )}
                                {selectedMember.legal_rep1_canton && (
                                  <p className="text-[var(--text-primary)]">{selectedMember.legal_rep1_canton}</p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {(selectedMember.legal_rep2_firstname || selectedMember.legal_rep2_lastname || selectedMember.legal_rep2_email || selectedMember.legal_rep2_phone) && (
                        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <User className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
                            <h3 className="text-lg font-semibold text-[var(--text-primary)]">Représentant légal 2</h3>
                          </div>
                          {selectedMember.legal_rep2_relation && (
                            <Badge variant="blue" className="mb-3">
                              {selectedMember.legal_rep2_relation}
                            </Badge>
                          )}
                          <div className="space-y-2">
                            <p className="text-[var(--text-primary)] text-lg font-medium">
                              <User className="w-3.5 h-3.5 inline mr-1" /> {(selectedMember.legal_rep2_firstname || selectedMember.legal_rep2_lastname) ? `${selectedMember.legal_rep2_firstname || ''} ${selectedMember.legal_rep2_lastname || ''}`.trim() : (() => { const pa = selectedMember.legal_rep2_email && parentAccounts.find(p => p.email && p.email.toLowerCase() === selectedMember.legal_rep2_email!.toLowerCase()); return (pa && pa.fullName && pa.fullName !== 'Inconnu') ? pa.fullName : selectedMember.legal_rep2_email; })()}
                            </p>
                            {selectedMember.legal_rep2_email && (
                              <a href={`mailto:${selectedMember.legal_rep2_email}`} className="text-[var(--accent)] hover:opacity-80 block">
                                <Mail className="w-3.5 h-3.5 inline mr-1" /> {selectedMember.legal_rep2_email}
                              </a>
                            )}
                            {selectedMember.legal_rep2_phone && (
                              <a href={`tel:${selectedMember.legal_rep2_phone}`} className="text-[var(--accent)] hover:opacity-80 block">
                                <Smartphone className="w-3.5 h-3.5 inline mr-1" /> {selectedMember.legal_rep2_phone}
                              </a>
                            )}
                            {(selectedMember.legal_rep2_address || selectedMember.legal_rep2_postal_code || selectedMember.legal_rep2_city) && (
                              <div className="mt-3 pt-3 border-t border-[var(--border-color)]">
                                <p className="text-sm text-[var(--text-muted)] mb-1"><Home className="w-3.5 h-3.5 inline mr-1" /> Adresse</p>
                                {selectedMember.legal_rep2_address && (
                                  <p className="text-[var(--text-primary)]">{selectedMember.legal_rep2_address}</p>
                                )}
                                {(selectedMember.legal_rep2_postal_code || selectedMember.legal_rep2_city) && (
                                  <p className="text-[var(--text-primary)]">
                                    {selectedMember.legal_rep2_postal_code} {selectedMember.legal_rep2_city}
                                  </p>
                                )}
                                {selectedMember.legal_rep2_canton && (
                                  <p className="text-[var(--text-primary)]">{selectedMember.legal_rep2_canton}</p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-[var(--text-muted)] text-lg mb-2">Aucun représentant légal enregistré</p>
                      {selectedMember.birth_date && (() => {
                        const age = calculateAge(selectedMember.birth_date);
                        return age !== null && age >= 18 && (
                          <p className="text-[var(--text-muted)] text-sm">
                            Ce joueur a {age} ans — représentants légaux non requis
                          </p>
                        );
                      })()}
                    </div>
                  )}
                </div>

                <div className="mt-6 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
                    Comptes ayant accès à cet enfant
                  </h3>

                  {parentAccountsError ? (
                    <p className="text-sm text-[var(--danger)]">Erreur : {parentAccountsError}</p>
                  ) : parentAccountsLoading ? (
                    <p className="text-sm text-[var(--text-secondary)]">Chargement...</p>
                  ) : parentAccounts.length === 0 ? (
                    <p className="text-sm text-[var(--text-muted)]">
                      Aucun compte n'a accès à cet enfant pour le moment.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {parentAccounts.map((pa) => (
                        <div
                          key={pa.parentMemberId}
                          className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-color)]"
                        >
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 bg-[var(--bg-hover)] text-[var(--text-primary)]"
                          >
                            {pa.fullName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm text-[var(--text-primary)]">
                                {pa.fullName}
                              </span>
                              {pa.source === 'auto' ? (
                                <Badge variant="neutral">Rattaché automatiquement (e-mail du représentant légal)</Badge>
                              ) : pa.source === 'activation' ? (
                                <Badge variant="blue">Rattaché après validation d'une demande</Badge>
                              ) : pa.source === 'committee' ? (
                                <Badge variant="blue">Rattaché par le comité</Badge>
                              ) : (
                                <Badge variant="neutral">Origine inconnue</Badge>
                              )}
                            </div>
                            {pa.email && (
                              <div className="text-xs text-[var(--text-muted)] truncate">{pa.email}</div>
                            )}
                            <div className="text-xs text-[var(--text-muted)] mt-0.5">
                              Lié le {new Date(pa.linkedAt).toLocaleDateString('fr-CH', { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', year: 'numeric' })} à {new Date(pa.linkedAt).toLocaleTimeString('fr-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => setRemoveTarget(pa)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0 bg-transparent border border-[var(--danger-soft)] text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                          >
                            <UserMinus size={14} />
                            Retirer l'accès
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                </>
              )}

              {detailTab === 'club' && (
                <>
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px', marginBottom: '16px' }}>
                  <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3 border-b border-[var(--border-color)] pb-2">Disponibilité</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-[var(--text-muted)] block mb-1">Statut</label>
                      <select
                        value={availForm.availability}
                        onChange={(e) => setAvailForm(f => ({ ...f, availability: e.target.value, ...(e.target.value === 'disponible' ? { until: '', note: '' } : {}) }))}
                        className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)]"
                      >
                        <option value="disponible">Disponible</option>
                        <option value="blesse">Blessé</option>
                        <option value="malade">Malade</option>
                        <option value="pause">Pause</option>
                      </select>
                    </div>
                    {availForm.availability !== 'disponible' && (
                      <div>
                        <label className="text-sm text-[var(--text-muted)] block mb-1">Retour prévu</label>
                        <input
                          type="date"
                          value={availForm.until}
                          onChange={(e) => setAvailForm(f => ({ ...f, until: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)]"
                        />
                      </div>
                    )}
                    {availForm.availability !== 'disponible' && (
                      <div className="col-span-2">
                        <label className="text-sm text-[var(--text-muted)] block mb-1">Remarque</label>
                        <input
                          type="text"
                          value={availForm.note}
                          onChange={(e) => setAvailForm(f => ({ ...f, note: e.target.value }))}
                          placeholder="Optionnel"
                          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)]"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-4">
                    <div>
                      {selectedMember.availability_updated_at && (
                        <span className="text-xs text-[var(--text-muted)]">
                          Mis à jour le {new Date(selectedMember.availability_updated_at).toLocaleDateString('fr-CH')}
                        </span>
                      )}
                    </div>
                    <button
                      disabled={availSaving}
                      onClick={async () => {
                        setAvailSaving(true);
                        try {
                          const { data, error } = await supabase.rpc('set_member_availability', {
                            p_member: selectedMember.id,
                            p_availability: availForm.availability,
                            p_until: availForm.until || null,
                            p_note: availForm.note || null,
                          });
                          if (error) throw error;
                          const updated = {
                            ...selectedMember,
                            availability: availForm.availability,
                            availability_until: availForm.until || null,
                            availability_note: availForm.note || null,
                            availability_updated_at: data?.availability_updated_at || new Date().toISOString(),
                          };
                          setSelectedMember(updated);
                          fetchMembers();
                        } catch (err) {
                          console.error('Availability save error:', err);
                        } finally {
                          setAvailSaving(false);
                        }
                      }}
                      className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      style={{ background: 'var(--accent)', color: 'var(--text-inverse)' }}
                    >
                      {availSaving ? 'Enregistrement...' : 'Enregistrer'}
                    </button>
                  </div>
                </div>
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
                  <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3 border-b border-[var(--border-color)] pb-2">Informations club</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-[var(--text-muted)]">Équipe</p>
                      <p className="text-[var(--text-primary)]">{selectedMember.teams?.name || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-[var(--text-muted)]">Équipes secondaires</p>
                      <SecondaryTeamsReadOnly memberId={selectedMember.id} primaryTeamId={selectedMember.team_id} />
                    </div>
                    <div>
                      <p className="text-sm text-[var(--text-muted)]">Statut licence</p>
                      {selectedMember.status === 'archive'
                        ? <Badge variant="neutral">Archivé</Badge>
                        : (() => {
                            const b = getStatusBadge(selectedMember.licence_status);
                            return <Badge variant={b.variant}>{b.label}</Badge>;
                          })()
                      }
                    </div>
                    <div>
                      <p className="text-sm text-[var(--text-muted)]">Numéro J+S</p>
                      <p className="text-[var(--text-primary)]">{selectedMember.js_number || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-[var(--text-muted)]">Numéro de licence ASF</p>
                      <p className="text-[var(--text-primary)]">{selectedMember.asf_licence_number || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-[var(--text-muted)]">📅 Date d'affiliation</p>
                      <p className="text-[var(--text-primary)]">{selectedMember.affiliation_date ? new Date(selectedMember.affiliation_date).toLocaleDateString('fr-CH') : '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-[var(--text-muted)]"><MapPin className="w-3.5 h-3.5 inline mr-1" /> Club d'origine</p>
                      <p className="text-[var(--text-primary)]">{selectedMember.club_origine || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-[var(--text-muted)]"><Trophy className="w-3.5 h-3.5 inline mr-1" /> Classe de jeu</p>
                      <p className="text-[var(--text-primary)]">{selectedMember.classe_de_jeu || '-'}</p>
                    </div>
                    {selectedMember.position && (
                      <div>
                        <p className="text-sm text-[var(--text-muted)]">Position</p>
                        <Badge variant="blue">
                          {selectedMember.position === 'Gardien' && <Hand className="w-4 h-4 inline" />}
                          {selectedMember.position === 'Défenseur' && <Shield className="w-4 h-4 inline" />}
                          {selectedMember.position === 'Milieu' && <Zap className="w-4 h-4 inline" />}
                          {selectedMember.position === 'Attaquant' && <Zap className="w-4 h-4 inline" />}
                          {selectedMember.position === 'Autre' && <CircleHelp className="w-4 h-4 inline" />}
                          {' '}{selectedMember.position}
                        </Badge>
                      </div>
                    )}
                    {selectedMember.qualification_type && (
                      <div className="col-span-2">
                        <p className="text-sm text-[var(--text-muted)]">Type de qualification</p>
                        <p className="text-[var(--text-primary)]">{selectedMember.qualification_type}</p>
                      </div>
                    )}
                    {(selectedMember.qualified_from || selectedMember.qualified_until) && (
                      <div className="col-span-2">
                        <p className="text-sm text-[var(--text-muted)]">Qualifié dès le → Qualifié à</p>
                        <p className="text-[var(--text-primary)]">
                          {selectedMember.qualified_from ? new Date(selectedMember.qualified_from).toLocaleDateString('fr-CH') : '?'}
                          {' → '}
                          {selectedMember.qualified_until ? new Date(selectedMember.qualified_until).toLocaleDateString('fr-CH') : '?'}
                        </p>
                      </div>
                    )}
                  </div>

                  {websiteEnabled && (
                  <div className="flex items-center justify-between mt-6" style={{ padding: '12px 16px', background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
                    <div>
                      <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Ne pas apparaître sur le site du club</label>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Le nom de ce joueur ne sera jamais publié sur le site internet du club.</p>
                    </div>
                    <Toggle
                      checked={(selectedMember as any).hide_from_site === true}
                      onChange={async (checked) => {
                        const { error } = await supabase
                          .from('members')
                          .update({ hide_from_site: checked })
                          .eq('id', selectedMember.id);
                        if (!error) {
                          fetchMembers();
                          setSelectedMember({ ...selectedMember, hide_from_site: checked } as any);
                        }
                      }}
                    />
                  </div>
                  )}

                  <div className="mt-4" style={{ padding: '12px 16px', background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
                    <div className="mb-2">
                      <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Autorisation photo (site, réseaux sociaux)</label>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Concerne uniquement le site internet du club, les réseaux sociaux et les publications. Sans réponse, le club considère que c'est non.</p>
                    </div>
                    <div className="flex gap-2 mt-2">
                      {([{ label: 'Oui', value: true }, { label: 'Non', value: false }, { label: 'Pas de réponse', value: null }] as const).map(opt => {
                        const current = (selectedMember as any).photo_consent;
                        const isActive = current === opt.value;
                        return (
                          <button
                            key={String(opt.value)}
                            onClick={async () => {
                              if (isActive) return;
                              const today = new Date().toISOString().slice(0, 10);
                              const updates: Record<string, any> = { photo_consent: opt.value, photo_consent_date: opt.value !== null ? today : null };
                              const { error } = await supabase.from('members').update(updates).eq('id', selectedMember.id);
                              if (!error) {
                                setSelectedMember({ ...selectedMember, photo_consent: opt.value, photo_consent_date: opt.value !== null ? today : null } as any);
                                fetchMembers();
                              }
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                            style={{
                              background: isActive ? 'var(--accent)' : 'var(--bg-card)',
                              color: isActive ? '#fff' : 'var(--text-secondary)',
                              border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border-color)'}`,
                              cursor: isActive ? 'default' : 'pointer',
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {(selectedMember.licence_status === 'declare_partant' || selectedMember.licence_status === 'parti') && (
                    <div className="mt-6">
                      <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3 border-b border-[var(--border-color)] pb-2">Départ</h3>
                      <div className="space-y-3">
                        <div>
                          <p className="text-sm text-[var(--text-muted)]">Date de départ</p>
                          <p className="text-[var(--text-primary)]">
                            {selectedMember.departure_date
                              ? new Date(selectedMember.departure_date).toLocaleDateString('fr-FR')
                              : '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-[var(--text-muted)]">Club de destination</p>
                          <p className="text-[var(--text-primary)]">{selectedMember.departure_club || '-'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-[var(--text-muted)]">Raison</p>
                          <p className="text-[var(--text-primary)] whitespace-pre-wrap">{selectedMember.departure_note || '-'}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                </>
              )}

              {detailTab === 'notes' && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
                  {(selectedMember.notes || (isAdminOrCommittee && selectedMember.remarques_club)) ? (
                    <div className="space-y-6">
                      {selectedMember.notes && (
                        <div>
                          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3 border-b border-[var(--border-color)] pb-2">Notes internes</h3>
                          <p className="text-[var(--text-primary)] whitespace-pre-wrap">{selectedMember.notes}</p>
                        </div>
                      )}
                      {isAdminOrCommittee && selectedMember.remarques_club && (
                        <div>
                          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3 border-b border-[var(--border-color)] pb-2"><Clipboard className="w-4 h-4 inline mr-1" /> Importé depuis ClubCorner</h3>
                          <p className="text-[var(--text-primary)] whitespace-pre-wrap">{selectedMember.remarques_club}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-[var(--text-muted)] text-lg">Aucune note enregistrée</p>
                    </div>
                  )}
                </div>
              )}

              {detailTab === 'facturation' && financeEnabled && (
                <div style={{ padding: '16px 0' }}>
                  {!accessLoading && canEdit && (
                    <>
                    <div className="flex items-center justify-between" style={{ padding: '12px 16px', marginBottom: '16px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
                      <div>
                        <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>À facturer</label>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Si désactivé, ce membre est exclu de l'émission en masse des factures.</p>
                      </div>
                      <Toggle
                        checked={selectedMember.billable !== false}
                        onChange={async (checked) => {
                          const { error } = await supabase
                            .from('members')
                            .update({ billable: checked })
                            .eq('id', selectedMember.id);
                          if (!error) {
                            fetchMembers();
                            setSelectedMember({ ...selectedMember, billable: checked });
                          }
                        }}
                      />
                    </div>
                    <div style={{ padding: '12px 16px', marginBottom: '16px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Exonéré de cotisation</label>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Ce membre ne sera pas facturé lors de la génération des cotisations.</p>
                        </div>
                        <Toggle
                          checked={selectedMember.fee_exempt === true}
                          onChange={async (checked) => {
                            const update: any = { fee_exempt: checked };
                            if (!checked) update.fee_exempt_reason = null;
                            const { error } = await supabase
                              .from('members')
                              .update(update)
                              .eq('id', selectedMember.id);
                            if (!error) {
                              fetchMembers();
                              setSelectedMember({ ...selectedMember, fee_exempt: checked, fee_exempt_reason: checked ? selectedMember.fee_exempt_reason : null });
                            }
                          }}
                        />
                      </div>
                      {selectedMember.fee_exempt && (
                        <div style={{ marginTop: '12px' }}>
                          <label className="text-xs font-medium" style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Motif</label>
                          <input
                            type="text"
                            value={selectedMember.fee_exempt_reason || ''}
                            placeholder="Raison de l'exonération..."
                            onChange={(e) => setSelectedMember({ ...selectedMember, fee_exempt_reason: e.target.value })}
                            onBlur={async () => {
                              await supabase
                                .from('members')
                                .update({ fee_exempt_reason: selectedMember.fee_exempt_reason || null })
                                .eq('id', selectedMember.id);
                              fetchMembers();
                            }}
                            style={{
                              width: '100%',
                              background: 'var(--bg-input)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '8px',
                              padding: '8px 12px',
                              color: 'var(--text-primary)',
                              fontSize: '13px'
                            }}
                          />
                        </div>
                      )}
                    </div>
                    </>
                  )}
                  {memberInvoices.length > 0 && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '12px',
                      marginBottom: '20px'
                    }}>
                      <div style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '10px',
                        padding: '14px',
                        textAlign: 'center'
                      }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '11px',
                          textTransform: 'uppercase', marginBottom: '4px' }}>
                          Total facturé
                        </div>
                        <div style={{ color: 'var(--text-primary)', fontWeight: '700',
                          fontSize: '18px' }}>
                          CHF {memberInvoices
                            .filter(i => i.status !== 'cancelled')
                            .reduce((sum, i) => sum +
                              parseFloat(i.total_amount || 0), 0)
                            .toFixed(2)}
                        </div>
                      </div>

                      <div style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--success)',
                        borderRadius: '10px',
                        padding: '14px',
                        textAlign: 'center'
                      }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '11px',
                          textTransform: 'uppercase', marginBottom: '4px' }}>
                          Total payé
                        </div>
                        <div style={{ color: 'var(--success-text)', fontWeight: '700',
                          fontSize: '18px' }}>
                          CHF {memberInvoices
                            .filter(i => i.status === 'paid')
                            .reduce((sum, i) => sum +
                              parseFloat(i.paid_amount || i.total_amount || 0), 0)
                            .toFixed(2)}
                        </div>
                      </div>

                      <div style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--danger)',
                        borderRadius: '10px',
                        padding: '14px',
                        textAlign: 'center'
                      }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '11px',
                          textTransform: 'uppercase', marginBottom: '4px' }}>
                          Solde ouvert
                        </div>
                        <div style={{
                          color: memberInvoices.some(i =>
                            !['paid','cancelled'].includes(i.status))
                            ? 'var(--danger)' : 'var(--success-text)',
                          fontWeight: '700', fontSize: '18px'
                        }}>
                          CHF {memberInvoices
                            .filter(i => !['paid','cancelled']
                              .includes(i.status))
                            .reduce((sum, i) => sum +
                              parseFloat(i.total_amount || 0), 0)
                            .toFixed(2)}
                        </div>
                      </div>
                    </div>
                  )}

                  {memberInvoices.length === 0 ? (
                    <div style={{
                      color: 'var(--text-muted)', textAlign: 'center',
                      padding: '40px', fontSize: '14px'
                    }}>
                      Aucune facture pour ce joueur
                    </div>
                  ) : (
                    memberInvoices.map(invoice => {
                      const today = new Date().toISOString().split('T')[0];
                      const overdue = !['paid','cancelled']
                        .includes(invoice.status) &&
                        invoice.due_date < today;

                      return (
                        <div key={invoice.id} style={{
                          background: overdue
                            ? 'var(--danger-soft)'
                            : 'var(--bg-card)',
                          border: `1px solid ${overdue
                            ? 'var(--danger)'
                            : 'var(--border-color)'}`,
                          borderRadius: '10px',
                          padding: '16px',
                          marginBottom: '10px'
                        }}>
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '8px'
                          }}>
                            <div style={{ display: 'flex',
                              alignItems: 'center', gap: '10px' }}>
                              <span style={{
                                color: 'var(--text-primary)', fontWeight: '700',
                                fontSize: '15px'
                              }}>
                                {invoice.invoice_number}
                              </span>
                              <span style={{
                                color: 'var(--text-muted)', fontSize: '12px'
                              }}>
                                {invoice.season?.name}
                              </span>
                            </div>
                            <StatusBadge status={
                              overdue ? 'overdue' : invoice.status
                            } />
                          </div>

                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start'
                          }}>
                            <div>
                              <div style={{
                                color: 'var(--text-muted)', fontSize: '13px'
                              }}>
                                {invoice.category?.name}
                              </div>
                              {invoice.fratrie_discount_pct > 0 && (
                                <div style={{
                                  color: 'var(--warning-text)', fontSize: '12px',
                                  marginTop: '2px'
                                }}>
                                  Rabais fratrie {invoice.fratrie_discount_pct}%
                                  (-CHF {parseFloat(
                                    invoice.fratrie_discount_amount || 0
                                  ).toFixed(2)})
                                </div>
                              )}
                              {invoice.notes && (
                                <div style={{
                                  color: 'var(--text-muted)', fontSize: '12px',
                                  marginTop: '2px', fontStyle: 'italic'
                                }}>
                                  {invoice.notes}
                                </div>
                              )}
                              {invoice.cancelled_reason && (
                                <div style={{
                                  color: 'var(--danger)', fontSize: '12px',
                                  marginTop: '2px'
                                }}>
                                  Annulée: {invoice.cancelled_reason}
                                </div>
                              )}
                            </div>

                            <div style={{ textAlign: 'right' }}>
                              <div style={{
                                color: 'var(--text-primary)', fontWeight: '700',
                                fontSize: '16px'
                              }}>
                                CHF {parseFloat(
                                  invoice.total_amount || 0
                                ).toFixed(2)}
                              </div>
                              {invoice.status === 'paid' && (
                                <div style={{
                                  color: 'var(--success-text)', fontSize: '12px'
                                }}>
                                  Payé le {new Date(invoice.paid_date)
                                    .toLocaleDateString('fr-CH')}
                                </div>
                              )}
                              {invoice.balance > 0 && (
                                <div style={{
                                  color: 'var(--danger)', fontSize: '12px'
                                }}>
                                  Solde: CHF {parseFloat(
                                    invoice.balance
                                  ).toFixed(2)}
                                </div>
                              )}
                              {invoice.due_date &&
                                invoice.status !== 'paid' &&
                                invoice.status !== 'cancelled' && (
                                <div style={{
                                  color: overdue ? 'var(--danger)' : 'var(--text-muted)',
                                  fontSize: '12px'
                                }}>
                                  Échéance: {new Date(invoice.due_date)
                                    .toLocaleDateString('fr-CH')}
                                </div>
                              )}
                            </div>
                          </div>

                          <div style={{
                            marginTop: '10px',
                            display: 'flex',
                            justifyContent: 'flex-end'
                          }}>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => downloadInvoice(invoice.id)}
                            >
                              <ArrowDown className="w-3.5 h-3.5 inline mr-1" /> PDF
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {detailTab === 'evaluation' && (
                <PlayerProfileTab
                  memberId={selectedMember.id}
                  memberPosition={selectedMember.position || null}
                  memberPositionMainId={selectedMember.position_main_id || null}
                  memberPositionSecondaryId={selectedMember.position_secondary_id || null}
                  teamCategoryName={selectedMember.teams?.name || null}
                  jerseyNumber={selectedMember.jersey_number}
                />
              )}

              {detailTab === 'historique' && (
                <MemberHistoryTab
                  memberId={selectedMember.id}
                  readOnly={accessLoading || !canEdit}
                />
              )}
            </div>

            <div className="sticky bottom-0 bg-[var(--bg-card)] border-t border-[var(--border-color)] px-6 py-4 flex items-center gap-3 flex-wrap">
              {!accessLoading && canEdit && (
                <Button
                  variant="primary"
                  onClick={() => {
                    setShowDetailPanel(false);
                    handleOpenModal(selectedMember);
                  }}
                >
                  <Pencil className="w-3.5 h-3.5 inline mr-1" /> Modifier
                </Button>
              )}
              {!accessLoading && canEdit && selectedMember.status === 'archive' && (
                <Button
                  variant="primary"
                  onClick={async () => {
                    const { error } = await supabase
                      .from('members')
                      .update({ status: 'actif', departure_date: null })
                      .eq('id', selectedMember.id);
                    if (!error) {
                      fetchMembers();
                      setSelectedMember({ ...selectedMember, status: 'actif', departure_date: null });
                      showToast('Joueur réactivé', 'success');
                    } else {
                      showToast('Erreur lors de la réactivation', 'error');
                    }
                  }}
                  title="Remettre ce joueur en statut actif"
                >
                  Réactiver le joueur
                </Button>
              )}
              {!accessLoading && canEdit && selectedMember.status !== 'archive' && (selectedMember.licence_status === 'actif' || selectedMember.licence_status === 'en_attente') && (
                <Button
                  variant="warning"
                  onClick={async () => {
                    const { error } = await supabase
                      .from('members')
                      .update({ licence_status: 'a_declarer_partant' })
                      .eq('id', selectedMember.id);
                    if (!error) {
                      fetchMembers();
                      setSelectedMember({ ...selectedMember, licence_status: 'a_declarer_partant' });
                      showToast('Joueur marqué à déclarer partant', 'success');
                    } else {
                      showToast('Erreur lors de la mise à jour', 'error');
                    }
                  }}
                  title="Marquer ce joueur comme à déclarer partant dans ClubCorner"
                >
                  Marquer à déclarer partant
                </Button>
              )}
              {!accessLoading && canEdit && selectedMember.status !== 'archive' && selectedMember.licence_status === 'a_declarer_partant' && (
                <Button
                  variant="primary"
                  onClick={async () => {
                    const { error } = await supabase
                      .from('members')
                      .update({ licence_status: 'declare_partant' })
                      .eq('id', selectedMember.id);
                    if (!error) {
                      fetchMembers();
                      setSelectedMember({ ...selectedMember, licence_status: 'declare_partant' });
                      showToast('Joueur déclaré dans ClubCorner', 'success');
                    } else {
                      showToast('Erreur lors de la mise à jour', 'error');
                    }
                  }}
                  title="Confirmer que la déclaration a été faite dans ClubCorner"
                >
                  Confirmer : déclaré dans ClubCorner
                </Button>
              )}
              {!accessLoading && canEdit && selectedMember.status !== 'archive' && (
                <Button
                  variant="warning"
                  onClick={async () => {
                    const today = new Date().toISOString().split('T')[0];
                    const patch: { status: string; departure_date?: string } = { status: 'archive' };
                    if (!selectedMember.departure_date) patch.departure_date = today;
                    const { error } = await supabase
                      .from('members')
                      .update(patch)
                      .eq('id', selectedMember.id);
                    if (!error) {
                      fetchMembers();
                      setSelectedMember({
                        ...selectedMember,
                        status: 'archive',
                        departure_date: selectedMember.departure_date || today,
                      });
                      showToast('Joueur archivé', 'success');
                    } else {
                      showToast('Erreur lors de l\'archivage', 'error');
                    }
                  }}
                  title="Archiver le joueur (changement de club ou départ confirmé)"
                >
                  Archiver
                </Button>
              )}
              {selectedMember.status !== 'archive' && (
                <div>
                  {!accessLoading && canEdit ? (
                    <select
                      value={selectedMember.licence_status}
                      onChange={async (e) => {
                        const newStatus = e.target.value;
                        const { error } = await supabase
                          .from('members')
                          .update({ licence_status: newStatus })
                          .eq('id', selectedMember.id);

                        if (!error) {
                          fetchMembers();
                          setSelectedMember({ ...selectedMember, licence_status: newStatus });
                        }
                      }}
                      className="px-4 py-2 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm"
                    >
                      <option value="actif">Actif</option>
                      <option value="en_attente">En attente</option>
                      <option value="a_declarer_partant">À déclarer partant</option>
                      <option value="declare_partant">Déclaré partant</option>
                      <option value="inactif">Inactif</option>
                      <option value="suspendu">Suspendu</option>
                    </select>
                  ) : (
                    (() => {
                      const b = getStatusBadge(selectedMember.licence_status);
                      return <Badge variant={b.variant}>{b.label}</Badge>;
                    })()
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {invoiceModalData && (
        <StandardModal
          isOpen={showInvoiceModal}
          onClose={() => setShowInvoiceModal(false)}
          title="Générer une facture"
          subtitle={`${invoiceModalData.member.first_name} ${invoiceModalData.member.last_name}`}
          width="480px"
        >
            {invoiceModalData.member.billable === false && (
              <Alert variant="danger" title="Membre non facturable">
                Ce membre est marqué comme non facturable. Réactivez « À facturer » dans l'onglet Facturation pour générer une facture.
              </Alert>
            )}
            <Alert variant="info" title={`Saison ${activeSeason?.name}`}>
              {invoiceModalData.isSecondTour ? (
                <span>Arrivée au 2ème tour — montant réduit à 50%</span>
              ) : (
                <span>Arrivée au 1er tour — montant complet</span>
              )}
            </Alert>

            <div style={{ display: 'grid', gap: '16px', marginTop: '20px', marginBottom: '24px' }}>
              <div>
                <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                  Montant de base (cotisation catégorie)
                </label>
                <div style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '16px' }}>
                  CHF {invoiceModalData.baseAmount.toFixed(2)}
                </div>
              </div>

              {invoiceModalData.fratrie_discount_pct > 0 && (
                <Alert
                  variant="warning"
                  title={`Rabais fratrie ${invoiceModalData.fratrie_discount_pct}% (${invoiceModalData.fratrie_sibling_count} enfants)`}
                >
                  - CHF {invoiceModalData.fratrie_discount_amount.toFixed(2)}
                </Alert>
              )}

              {invoiceModalData.fratrie_sibling_count > 1 && invoiceModalData.fratrie_discount_pct === 0 && (
                <Alert variant="info">
                  Fratrie de {invoiceModalData.fratrie_sibling_count} enfants — rabais attribué au cadet
                </Alert>
              )}

              <div>
                <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                  Montant à facturer <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>(modifiable)</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    value={invoiceModalData.amount}
                    onChange={e => setInvoiceModalData({
                      ...invoiceModalData,
                      amount: parseFloat(e.target.value) || 0
                    })}
                    style={{
                      width: '100%',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '10px 60px 10px 12px',
                      color: 'var(--text-primary)',
                      fontSize: '16px',
                      fontWeight: 600,
                      textAlign: 'right',
                    }}
                  />
                  <span style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                    fontSize: '14px',
                    fontWeight: 500,
                    pointerEvents: 'none',
                  }}>
                    CHF
                  </span>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                  Remarque (optionnel)
                </label>
                <input
                  type="text"
                  value={invoiceModalData.reason}
                  onChange={e => setInvoiceModalData({
                    ...invoiceModalData,
                    reason: e.target.value
                  })}
                  style={{
                    width: '100%',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <Button
                variant="secondary"
                onClick={() => setShowInvoiceModal(false)}
                style={{ flex: 1 }}
              >
                Annuler
              </Button>
              <Button
                variant="primary"
                onClick={() => generateSingleInvoice(invoiceModalData)}
                disabled={!invoiceModalData.amount || invoiceModalData.amount <= 0 || invoiceModalData.member.billable === false}
                title={invoiceModalData.member.billable === false ? "Ce membre est marqué comme non facturable. Réactivez « À facturer » dans l'onglet Facturation pour générer une facture." : undefined}
                style={{ flex: 2 }}
              >
                Générer la facture
              </Button>
            </div>
        </StandardModal>
      )}

      {showSimulationModal && (() => {
        const { currentCounts, futureCounts, totalCurrent, totalFuture } = getSimulationData();
        const currentYear = new Date().getFullYear();

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowSimulationModal(false)}>
            <div className="bg-[var(--bg-modal)] rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="px-6 py-4 rounded-t-xl" style={{ background: 'var(--bg-modal-header)' }}>
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold" style={{ color: 'var(--text-modal-header)' }}>
                    🔮 Simulation — Prochaine saison {currentYear}/{currentYear + 1} → {currentYear + 1}/{currentYear + 2}
                  </h2>
                  <button onClick={() => setShowSimulationModal(false)} className="hover:opacity-80" style={{ color: 'var(--text-modal-header)' }}>
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead style={{ background: 'var(--table-header-bg)' }}>
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase">Catégorie</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-[var(--text-secondary)] uppercase">Saison actuelle</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-[var(--text-secondary)] uppercase">Future saison</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {ALL_CATEGORIES.map((cat) => {
                        const current = currentCounts[cat] || 0;
                        const future = futureCounts[cat] || 0;
                        const diff = future - current;

                        let bgColor = 'transparent';
                        let icon = '';
                        if (diff > 0) {
                          bgColor = 'var(--success-soft)';
                          icon = '↗';
                        } else if (diff < 0) {
                          bgColor = 'var(--danger-soft)';
                          icon = '↘';
                        }

                        return (
                          <tr key={cat} style={{ backgroundColor: bgColor }}>
                            <td className="px-4 py-3 text-sm text-[var(--text-primary)] font-medium">{cat}</td>
                            <td className="px-4 py-3 text-sm text-[var(--text-secondary)] text-center">{current}</td>
                            <td className="px-4 py-3 text-sm text-[var(--text-primary)] text-center font-medium">
                              {future} {icon}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-[var(--bg-card)] font-bold">
                        <td className="px-4 py-3 text-sm text-[var(--text-primary)]">TOTAL</td>
                        <td className="px-4 py-3 text-sm text-[var(--text-primary)] text-center">{totalCurrent}</td>
                        <td className="px-4 py-3 text-sm text-[var(--text-primary)] text-center">{totalFuture}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="mt-6 p-4 bg-[var(--bg-card)] rounded-lg">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-xs text-[var(--text-muted)] uppercase mb-1">Total joueurs juniors actuels</div>
                      <div className="text-2xl font-bold text-[var(--text-primary)]">{totalCurrent}</div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--text-muted)] uppercase mb-1">Total joueurs juniors future</div>
                      <div className="text-2xl font-bold text-[var(--text-primary)]">{totalFuture}</div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--text-muted)] uppercase mb-1">Variation</div>
                      <div className={`text-2xl font-bold ${totalFuture - totalCurrent > 0 ? 'text-[var(--success)]' : totalFuture - totalCurrent < 0 ? 'text-[var(--danger)]' : 'text-[var(--text-primary)]'}`}>
                        {totalFuture - totalCurrent > 0 ? '+' : ''}{totalFuture - totalCurrent}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-[var(--bg-card)] px-6 py-4 border-t border-[var(--border-color)] flex justify-end gap-3">
                <button
                  onClick={exportSimulation}
                  className="flex items-center gap-2 px-6 py-2 bg-[var(--success)] rounded-lg text-white font-medium hover:opacity-90 transition-colors"
                >
                  📊 Exporter XLSX
                </button>
                <button
                  onClick={() => setShowSimulationModal(false)}
                  className="px-6 py-2 bg-[var(--bg-hover)] text-[var(--text-primary)] rounded-lg hover:opacity-80 transition-colors"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {showAddToTeamModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: '12px',
            padding: '24px', maxWidth: '500px', width: '90%',
            border: '1px solid var(--border-color)'
          }}>
            <h2 style={{
              fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)',
              marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px'
            }}>
              <Users className="w-4 h-4 inline mr-1" /> Ajouter à une équipe
            </h2>

            <div style={{ color: 'var(--text-muted)', marginBottom: '20px', fontSize: '14px' }}>
              {selectedIds.size} joueur(s) sélectionné(s)
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', color: 'var(--text-primary)', marginBottom: '8px', fontWeight: '600' }}>
                Sélectionner une équipe:
              </label>
              <select
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                style={{
                  width: '100%', padding: '10px', borderRadius: '6px',
                  background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border-color)',
                  fontSize: '14px'
                }}
              >
                <option value="">-- Sélectionnez une équipe --</option>

                {teams.filter((t: any) => t.type === 'junior').length > 0 && (
                  <>
                    <option disabled style={{ color: 'var(--text-muted)' }}>── Juniors ──</option>
                    {teams.filter((t: any) => t.type === 'junior').map((team: any) => (
                      <option key={team.id} value={team.id}>
                        {team.name} {team.team_categories?.name ? `(${team.team_categories.name})` : ''}
                      </option>
                    ))}
                  </>
                )}

                {teams.filter((t: any) => t.type === 'active').length > 0 && (
                  <>
                    <option disabled style={{ color: 'var(--text-muted)' }}>── Équipes actives ──</option>
                    {teams.filter((t: any) => t.type === 'active').map((team: any) => (
                      <option key={team.id} value={team.id}>
                        {team.name} {team.team_categories?.name ? `(${team.team_categories.name})` : ''}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <Alert variant="warning">
                Les joueurs déjà dans une équipe seront déplacés vers la nouvelle équipe
              </Alert>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowAddToTeamModal(false);
                  setSelectedTeamId('');
                }}
                style={{
                  padding: '10px 20px', borderRadius: '6px',
                  background: 'var(--bg-hover)', color: 'var(--text-muted)',
                  border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '600'
                }}
              >
                Annuler
              </button>
              <Button
                variant="primary"
                onClick={() => {
                  if (selectedTeamId) {
                    addToTeam(selectedTeamId);
                  }
                }}
                disabled={!selectedTeamId}
              >
                <Check className="w-4 h-4 inline mr-1" /> Ajouter à l'équipe
              </Button>
            </div>
          </div>
        </div>
      )}

      <DuplicatePersonModal
        duplicateInfo={duplicateInfo}
        onClose={handleCloseDuplicateModal}
        linking={linking}
        currentEmail={formData.email}
        onLink={async () => {
          if (!duplicateInfo?.crossTable) return;
          setLinking(true);
          try {
            skipCrossTableRef.current = true;
            setDuplicateInfo(null);
            await handleSubmit({ preventDefault: () => {} } as FormEvent);
          } finally {
            setLinking(false);
          }
        }}
      />

      {importProgress.active && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.8)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '32px',
            width: '480px',
            maxWidth: '90vw'
          }}>
            <h3 style={{
              color: 'var(--text-primary)', margin: '0 0 20px',
              fontSize: '18px', fontWeight: '700',
              display: 'flex', alignItems: 'center', gap: '10px'
            }}>
              <Clock className="w-6 h-6" style={{ color: 'var(--text-secondary)' }} />
              Import en cours...
            </h3>

            <div style={{
              color: 'var(--text-muted)', fontSize: '14px',
              marginBottom: '12px'
            }}>
              {importProgress.phase}
            </div>

            <div style={{
              background: 'var(--bg-app)',
              borderRadius: '99px',
              height: '12px',
              overflow: 'hidden',
              marginBottom: '12px'
            }}>
              <div style={{
                width: `${importProgress.total > 0
                  ? Math.round((importProgress.current / importProgress.total) * 100)
                  : 0}%`,
                height: '100%',
                background: 'var(--primary)',
                borderRadius: '99px',
                transition: 'width 0.3s ease'
              }} />
            </div>

            <div style={{
              color: 'var(--text-muted)', fontSize: '13px',
              textAlign: 'center', marginBottom: '20px'
            }}>
              {importProgress.current} / {importProgress.total}
              {' '}({importProgress.total > 0
                ? Math.round((importProgress.current / importProgress.total) * 100)
                : 0}%)
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '12px'
            }}>
              <div style={{
                background: 'var(--success-soft)',
                border: '1px solid var(--success)',
                borderRadius: '8px', padding: '10px',
                textAlign: 'center'
              }}>
                <div style={{
                  color: 'var(--success-text)', fontSize: '22px',
                  fontWeight: '800'
                }}>
                  {importProgress.playersImported}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                  Joueurs importés
                </div>
              </div>
              <div style={{
                background: 'var(--info-soft)',
                border: '1px solid var(--info)',
                borderRadius: '8px', padding: '10px',
                textAlign: 'center'
              }}>
                <div style={{
                  color: 'var(--accent)', fontSize: '22px',
                  fontWeight: '800'
                }}>
                  {importProgress.teamsCreated}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                  Équipes créées
                </div>
              </div>
              <div style={{
                background: 'var(--warning-soft)',
                border: '1px solid var(--warning)',
                borderRadius: '8px', padding: '10px',
                textAlign: 'center'
              }}>
                <div style={{
                  color: 'var(--warning-text)', fontSize: '22px',
                  fontWeight: '800'
                }}>
                  {importProgress.playersSkipped}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                  Ignorés
                </div>
              </div>
            </div>

            {importProgress.currentPlayer && (
              <div style={{
                marginTop: '16px',
                color: 'var(--text-muted)', fontSize: '12px',
                textAlign: 'center',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                Traitement: {importProgress.currentPlayer}
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        {...confirmState}
        onCancel={hideConfirm}
      />

      {showSiblingsModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '28px',
            width: '500px'
          }}>
            <h3 style={{ color: 'var(--text-primary)', marginBottom: '16px', fontSize: '20px', fontWeight: '700' }}>
              <Users className="w-4 h-4 inline mr-1" /> Frères/sœurs de {selectedMember?.first_name} {selectedMember?.last_name}
            </h3>

            {siblings.length === 0 ? (
              <div style={{ color: 'var(--text-muted)' }}>
                Aucun frère/sœur trouvé dans le club.
              </div>
            ) : (
              <>
                <div style={{
                  color: 'var(--success-text)',
                  marginBottom: '16px',
                  fontSize: '14px'
                }}>
                  {siblings.length} frère{siblings.length > 1 ? 's/sœurs' : '/sœur'} trouvé{siblings.length > 1 ? 's' : ''} —
                  Rabais applicable: {
                    siblings.length + 1 === 2 ? '20%' :
                    siblings.length + 1 === 3 ? '30%' : '40%'
                  }
                </div>

                {siblings.map((s: any) => (
                  <div key={s.id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '10px 0',
                    borderBottom: '1px solid var(--border-color)'
                  }}>
                    <div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: '600' }}>
                        {s.first_name} {s.last_name}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                        {s.teams?.name || 'Sans équipe'}
                      </div>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                      {s.birth_date
                        ? new Date(s.birth_date).toLocaleDateString('fr-CH')
                        : '—'}
                    </div>
                  </div>
                ))}

                <div style={{
                  color: 'var(--text-muted)',
                  fontSize: '12px',
                  marginTop: '12px'
                }}>
                  <Lightbulb className="w-4 h-4 inline mr-1" /> Le rabais s'appliquera sur la facture du joueur avec la cotisation la moins élevée lors de la génération des factures.
                </div>
              </>
            )}

            <button
              onClick={() => setShowSiblingsModal(false)}
              style={{
                marginTop: '20px',
                width: '100%',
                background: 'transparent',
                color: 'var(--text-muted)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '10px',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      <StandardModal
        isOpen={!!removeTarget}
        onClose={() => { if (!removing) setRemoveTarget(null); }}
        title="Retirer l'accès"
        width="460px"
      >
        <p style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--text-primary)', margin: 0, marginBottom: '20px' }}>
          Retirer l'accès de <strong>{removeTarget?.fullName}</strong> à la fiche de <strong>{selectedMember?.first_name} {selectedMember?.last_name}</strong>&nbsp;?
          Cette personne ne verra plus cet enfant dans l'application. Les données de l'enfant ne sont pas modifiées.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <Button type="button" variant="secondary" onClick={() => setRemoveTarget(null)} disabled={removing}>
            Annuler
          </Button>
          <Button type="button" variant="danger" onClick={handleRemoveParentAccess} loading={removing} disabled={removing}>
            {removing ? 'Suppression...' : 'Retirer l\'accès'}
          </Button>
        </div>
      </StandardModal>

      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '24px', right: '24px',
          background: toast.type === 'success' ? 'var(--success)' : toast.type === 'error' ? 'var(--danger)' : 'var(--warning)',
          color: 'white',
          borderRadius: '10px',
          padding: '14px 20px',
          fontWeight: '700',
          fontSize: '14px',
          zIndex: 9999,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
        }}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

