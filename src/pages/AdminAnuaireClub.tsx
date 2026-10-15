import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, CreditCard as Edit2, Trash2, X as CloseIcon, Upload, Eye, X, Shield, Info, Save, Download, Archive, RotateCcw, ListFilter as Filter, Link2, Landmark, Handshake, Scale, Search } from 'lucide-react';
import SearchInput from '../components/ui/SearchInput';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { useModuleAccess } from '../hooks/useModuleAccess';
import { useWebsiteModuleEnabled } from '../hooks/useWebsiteModuleEnabled';
import { SortableHeader } from '../components/SortableHeader';
import MemberLinkSelector from '../components/MemberLinkSelector';
import PersonLinkSelector from '../components/PersonLinkSelector';
import MemberDetailSlideOver from '../components/MemberDetailSlideOver';
import { Tabs } from '../components/ui/Tabs';
import { formatAVS, validateAVS } from '../utils/formatHelpers';
import { Toggle } from '../components/Toggle';
import PhoneInput from '../components/PhoneInput';
import Button from '../components/ui/Button';
import { Badge, type BadgeVariant } from '../components/ui/Badge';
import { checkAVSUnique, fetchFullDuplicateInfo } from '../utils/validationHelpers';
import DuplicatePersonModal from '../components/DuplicatePersonModal';
import PageTitleCount from '../components/PageTitleCount';
import useEscapeKey from '../hooks/useEscapeKey';
import ConfirmModal from '../components/ConfirmModal';
import ConfrerieImportModal from '../components/ConfrerieImportModal';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import CountrySelect from '../components/CountrySelect';
import { ZoomablePhoto } from '../components/PhotoViewer';

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
  profile_id: string | null;
  coach_id: string | null;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  email: string | null;
  public_email: string | null;
  phone: string | null;
  hide_phone: boolean;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  role: string | null;
  is_committee: boolean;
  avs_number: string | null;
  profile_photo_url: string | null;
  qualification_id: string | null;
  coaching_qualifications?: { name: string } | null;
  position_names?: string[];
  _resolved_email?: string | null;
  _resolved_phone?: string | null;
  _resolved_photo?: string | null;
}

interface ClubPosition {
  id: string;
  name: string;
  description: string | null;
  default_is_committee: boolean;
  display_order: number;
  active: boolean;
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
  salutation: string | null;
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
  sponsor_id: string | null;
  annual_amount: number | null;
  category: 'member' | 'supporter';
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

interface Qualification {
  id: string;
  name: string;
  description: string | null;
}

interface ClubPersonResult {
  source: string;
  sources: string[];
  source_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  profile_id: string | null;
  has_account: boolean;
  already_confrerie: boolean;
}

const CLUB_PERSON_SOURCE_BADGES: Record<string, { label: string; variant: BadgeVariant }> = {
  joueur: { label: 'Joueur', variant: 'blue' },
  parent: { label: 'Parent', variant: 'pink' },
  entraineur: { label: 'Entraîneur', variant: 'orange' },
  supporter: { label: 'Supporter', variant: 'green' },
  comite: { label: 'Comité', variant: 'neutral' },
  compte: { label: 'Compte', variant: 'sky' },
};

type TabType = 'committee' | 'supporters' | 'referees' | 'confrerie';

export default function AdminAnuaireClub() {
  const { user } = useAuth();
  const { clubId } = useTenant();
  const { canEdit, loading: accessLoading } = useModuleAccess('annuaire');
  const { enabled: websiteEnabled } = useWebsiteModuleEnabled()
  const [activeTab, setActiveTab] = useState<TabType>('committee');
  const [loading, setLoading] = useState(true);

  const [committeeMembers, setCommitteeMembers] = useState<CommitteeMember[]>([]);
  const [supporters, setSupporters] = useState<Supporter[]>([]);
  const [confrerieMembers, setConfrerieMembers] = useState<ConfrerieMember[]>([]);
  const [confrerieLabel, setConfrerieLabel] = useState('Confrérie');
  const [confrerieClubAmount, setConfrerieClubAmount] = useState<number>(500);
  const [confrerieFilter, setConfrerieFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [confrerieSearch, setConfrerieSearch] = useState('');
  const [confrerieImportOpen, setConfrerieImportOpen] = useState(false);
  const [confreriePersonSearch, setConfreriePersonSearch] = useState('');
  const [confreriePersonResults, setConfreriePersonResults] = useState<ClubPersonResult[]>([]);
  const [confreriePersonLinked, setConfreriePersonLinked] = useState<ClubPersonResult | null>(null);
  const [sponsors, setSponsors] = useState<{id: string; company_name: string}[]>([]);
  const confrerieSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [committeePersonSearch, setCommitteePersonSearch] = useState('');
  const [committeePersonResults, setCommitteePersonResults] = useState<ClubPersonResult[] | null>(null);
  const committeeSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [referees, setReferees] = useState<Referee[]>([]);
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [sortField, setSortField] = useState<string>('last_name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedCommitteeMember, setSelectedCommitteeMember] = useState<CommitteeMember | null>(null);
  const [selectedSupporter, setSelectedSupporter] = useState<Supporter | null>(null);
  const [selectedReferee, setSelectedReferee] = useState<Referee | null>(null);
  const [selectedConfrerieMember, setSelectedConfrerieMember] = useState<ConfrerieMember | null>(null);
  const [pendingReopenConfrerieId, setPendingReopenConfrerieId] = useState<string | null>(null);

  const [formData, setFormData] = useState<any>({});
  const [linkedHints, setLinkedHints] = useState<{ email?: string; phone?: string; photo?: string; birth_date?: string; address?: string; postal_code?: string; city?: string; qualification_id?: string; qualification_name?: string; avs_number?: string }>({});
  const [clubPositions, setClubPositions] = useState<ClubPosition[]>([]);
  const [selectedPositionIds, setSelectedPositionIds] = useState<string[]>([]);
  const [isCommitteeToggle, setIsCommitteeToggle] = useState(true);
  const [isCommitteeManuallySet, setIsCommitteeManuallySet] = useState(false);
  const [legacyRoleHint, setLegacyRoleHint] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [duplicateInfo, setDuplicateInfo] = useState<{ type: 'avs' | 'js' | 'asf'; person: any; crossTable?: boolean } | null>(null);
  const [linking, setLinking] = useState(false);
  const skipCrossTableRef = useRef(false);
  const pendingLinkRef = useRef<{ table: string; id: string; email?: string | null } | null>(null);
  const [modalTab, setModalTab] = useState<'info' | 'access'>('info');
  const [accessState, setAccessState] = useState<Record<string, { can_view: boolean; can_edit: boolean }>>({});
  const [accessProfileId, setAccessProfileId] = useState<string | null>(null);
  const [accessProfileRole, setAccessProfileRole] = useState<string | null>(null);
  const [accessLoaded, setAccessLoaded] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
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

  useEffect(() => { document.title = 'Annuaire Club - ClubSphere' }, [])

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    if (pendingReopenConfrerieId && !showModal) {
      const refreshed = confrerieMembers.find(m => m.id === pendingReopenConfrerieId);
      if (refreshed) setSelectedConfrerieMember(refreshed);
      setPendingReopenConfrerieId(null);
    }
  }, [confrerieMembers, showModal]);

  const handleCloseModal = useCallback(() => {
    setShowModal(false);
    setPendingReopenConfrerieId(null);
  }, []);

  const handleCloseCommitteeDetail = useCallback(() => {
    setSelectedCommitteeMember(null);
  }, []);

  const handleCloseSupporterDetail = useCallback(() => {
    setSelectedSupporter(null);
  }, []);

  const handleCloseRefereeDetail = useCallback(() => {
    setSelectedReferee(null);
  }, []);

  const handleCloseDuplicateModal = useCallback(() => {
    setDuplicateInfo(null);
    pendingLinkRef.current = null;
    skipCrossTableRef.current = false;
  }, []);

  useEscapeKey(handleCloseModal);
  useEscapeKey(handleCloseCommitteeDetail);
  useEscapeKey(handleCloseSupporterDetail);
  useEscapeKey(handleCloseRefereeDetail);
  useEscapeKey(handleCloseDuplicateModal);

  const fetchAll = async () => {
    try {
      await Promise.all([
        fetchCommitteeMembers(),
        fetchSupporters(),
        fetchReferees(),
        fetchQualifications(),
        fetchClubPositions(),
        fetchConfrerieMembers(),
        fetchConfrerieLabel(),
        supabase.from('sponsors').select('id, company_name').eq('active', true).order('company_name').then(({ data }) => { if (data) setSponsors(data); }),
      ]);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchClubPositions = async () => {
    const { data } = await supabase
      .from('club_positions')
      .select('id, name, description, default_is_committee, display_order, active')
      .eq('club_id', clubId)
      .eq('active', true)
      .order('display_order');
    setClubPositions(data || []);
  };

  const fetchCommitteeMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('committee_members')
        .select('*, coaching_qualifications(name), committee_member_positions(position_id, club_positions(name))')
        .order('last_name');
      if (error) {
        console.error('Error fetching committee members:', error);
        return;
      }
      if (!data) return;
      const profileIds = data.filter((m: any) => m.profile_id).map((m: any) => m.profile_id);
      const memberIds = data.filter((m: any) => m.member_id).map((m: any) => m.member_id);
      const coachIds = data.filter((m: any) => m.coach_id).map((m: any) => m.coach_id);
      const [{ data: profiles }, { data: members }, { data: coaches }] = await Promise.all([
        profileIds.length ? supabase.from('profiles').select('id, email, phone, avatar_url').in('id', profileIds) : { data: [] as any[] },
        memberIds.length ? supabase.from('members').select('id, email, phone, photo_url').in('id', memberIds) : { data: [] as any[] },
        coachIds.length ? supabase.from('coaches').select('id, email, phone, avatar_url').in('id', coachIds) : { data: [] as any[] },
      ]);
      const pMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      const mMap = new Map((members || []).map((m: any) => [m.id, m]));
      const cMap = new Map((coaches || []).map((c: any) => [c.id, c]));
      const mapped = data.map((m: any) => {
        const linked = m.coach_id ? cMap.get(m.coach_id) : m.member_id ? mMap.get(m.member_id) : m.profile_id ? pMap.get(m.profile_id) : null;
        return {
          ...m,
          position_names: (m.committee_member_positions || [])
            .map((p: any) => p.club_positions?.name)
            .filter(Boolean),
          _resolved_email: m.public_email || m.email || linked?.email || null,
          _resolved_phone: m.phone || linked?.phone || null,
          _resolved_photo: m.profile_photo_url || linked?.avatar_url || linked?.photo_url || null,
        };
      });
      setCommitteeMembers(mapped);
    } catch (err) {
      console.error('Unexpected error fetching committee members:', err);
    }
  };

  const fetchSupporters = async () => {
    try {
      const { data, error } = await supabase
        .from('supporters')
        .select('*')
        .order('last_name');
      if (error) {
        console.error('Error fetching supporters:', error);
      } else if (data) {
        setSupporters(data);
      }
    } catch (err) {
      console.error('Unexpected error fetching supporters:', err);
    }
  };

  const fetchReferees = async () => {
    try {
      const { data, error } = await supabase
        .from('referees')
        .select('*')
        .order('last_name');
      if (error) {
        console.error('Error fetching referees:', error);
      } else if (data) {
        setReferees(data);
      }
    } catch (err) {
      console.error('Unexpected error fetching referees:', err);
    }
  };

  const fetchConfrerieMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('confrerie_members')
        .select('*')
        .order('last_name');
      if (!error && data) setConfrerieMembers(data);
    } catch (err) {
      console.error('Error fetching confrerie members:', err);
    }
  };

  const fetchConfrerieLabel = async () => {
    if (!clubId) return;
    const { data } = await supabase
      .from('club_settings')
      .select('confrerie_label')
      .eq('club_id', clubId)
      .maybeSingle();
    if (data?.confrerie_label) setConfrerieLabel(data.confrerie_label);
    const { data: fc } = await supabase.from('finance_config').select('confrerie_amount').limit(1).maybeSingle();
    if (fc?.confrerie_amount) setConfrerieClubAmount(fc.confrerie_amount);
  };

  const handleArchiveConfrerie = async (member: ConfrerieMember) => {
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from('confrerie_members')
      .update({ active: false, archived_at: today })
      .eq('id', member.id);
    if (!error) {
      setConfrerieMembers(prev => prev.map(m => m.id === member.id ? { ...m, active: false, archived_at: today } : m));
      showToast(`${member.first_name} ${member.last_name} archivé(e).`, 'success');
    } else {
      showToast('Erreur lors de l\'archivage.', 'error');
    }
  };

  const handleReactivateConfrerie = async (member: ConfrerieMember) => {
    const { error } = await supabase
      .from('confrerie_members')
      .update({ active: true, archived_at: null })
      .eq('id', member.id);
    if (!error) {
      setConfrerieMembers(prev => prev.map(m => m.id === member.id ? { ...m, active: true, archived_at: null } : m));
      showToast(`${member.first_name} ${member.last_name} réactivé(e).`, 'success');
    } else {
      showToast('Erreur lors de la réactivation.', 'error');
    }
  };

  const formatDateCH = (dateStr: string | null): string => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  };

  const exportConfrerieExcel = async (members: ConfrerieMember[]) => {
    try {
    const ExcelJS = await import('exceljs');
    const billingLabel = (m: ConfrerieMember) => m.billing_mode === 'package' ? 'Package' : m.billing_mode === 'print' ? 'Courrier' : 'E-mail';
    const sponsorName = (m: ConfrerieMember) => m.sponsor_id ? (sponsors.find((s: any) => s.id === m.sponsor_id)?.company_name || '') : '';

    const toDateVal = (dateStr: string | null): Date | string => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d;
    };

    const headers = [
      'Nom', 'Prénom', 'Civilité', 'Société', 'Email', 'Mobile',
      'Tél. privé', 'Tél. professionnel', 'Fax', 'Adresse', 'NPA', 'Localité',
      'Date de naissance', 'Nationalité', 'Membre depuis', 'Mode de facturation',
      'Sponsor', 'N° passeport ASF', 'Qualifié le', 'Poste', 'Réf. externe',
      'Statut', 'Remarques', 'Cotisation annuelle', 'Catégorie',
    ];
    const dateCols = [13, 15, 19];

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(confrerieLabel.slice(0, 31));

    const headerRow = ws.addRow(headers);
    headerRow.eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    });

    ws.views = [{ state: 'frozen' as const, ySplit: 1, xSplit: 0 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

    for (const m of members) {
      ws.addRow([
        m.last_name || '', m.first_name || '', m.salutation || '', m.company || '',
        m.email || '', m.phone || '', m.phone_private || '', m.phone_pro || '',
        m.fax || '', m.address || '', m.postal_code || '', m.city || '',
        toDateVal(m.birth_date), m.nationality || '', toDateVal(m.member_since),
        billingLabel(m), sponsorName(m), m.asf_licence_number || '',
        toDateVal(m.qualified_at), m.position || '', m.external_ref || '',
        m.active ? 'Actif' : 'Archivé', m.notes || '',
        m.annual_amount != null ? m.annual_amount : '', m.category === 'supporter' ? 'Supporter' : 'Membre',
      ]);
    }

    for (const colIdx of dateCols) {
      ws.getColumn(colIdx).numFmt = 'DD.MM.YYYY';
    }

    const colWidths = headers.map((_h, i) => {
      let max = headers[i].length;
      ws.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        const cell = row.getCell(i + 1);
        const len = cell.value instanceof Date ? 10 : String(cell.value || '').length;
        if (len > max) max = len;
      });
      return Math.max(10, Math.min(max + 2, 45));
    });
    colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    const buf = await wb.xlsx.writeBuffer();
    const slug = confrerieLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const today = new Date().toISOString().slice(0, 10);
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}-${today}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    } catch (e) { console.error('Export failed', e); showToast("L'export n'a pas pu être généré. Rechargez la page et réessayez.", 'error'); }
  };

  const getArchivedElapsed = (archivedAt: string): string => {
    const d = new Date(archivedAt);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days < 30) return `il y a ${days} jour${days > 1 ? 's' : ''}`;
    const months = Math.floor(days / 30);
    if (months < 12) return `il y a ${months} mois`;
    const years = Math.floor(months / 12);
    const remMonths = months % 12;
    if (remMonths === 0) return `il y a ${years} an${years > 1 ? 's' : ''}`;
    return `il y a ${years} an${years > 1 ? 's' : ''} et ${remMonths} mois`;
  };

  const searchPeopleForCommittee = (query: string) => {
    setCommitteePersonSearch(query);
    if (committeeSearchTimer.current) clearTimeout(committeeSearchTimer.current);
    if (query.length < 2) { setCommitteePersonResults(null); return; }
    committeeSearchTimer.current = setTimeout(async () => {
      const { data, error } = await supabase.rpc('search_club_people', { p_query: query, p_limit: 20 });
      setCommitteePersonResults(!error && Array.isArray(data) ? (data as ClubPersonResult[]) : []);
    }, 300);
  };

  const linkCommitteePerson = async (p: ClubPersonResult) => {
    const memberId = p.source === 'joueur' ? p.source_id : null;
    const coachId = p.source === 'entraineur' ? p.source_id : null;
    const profileId = p.profile_id || null;
    const isLinked = !!(memberId || coachId || profileId);
    const fillEmpty = (key: string, value: string | null) =>
      !isLinked && !formData[key] && value ? { [key]: value } : {};
    setFormData({
      ...formData,
      first_name: formData.first_name || p.first_name,
      last_name: formData.last_name || p.last_name,
      ...fillEmpty('email', p.email),
      ...fillEmpty('phone', p.phone),
      ...fillEmpty('address', p.address),
      ...fillEmpty('postal_code', p.postal_code),
      ...fillEmpty('city', p.city),
      profile_id: profileId,
      member_id: memberId,
      coach_id: coachId,
    });
    setCommitteePersonSearch('');
    setCommitteePersonResults(null);
    const hints: typeof linkedHints = isLinked ? {
      email: p.email || undefined,
      phone: p.phone || undefined,
      address: p.address || undefined,
      postal_code: p.postal_code || undefined,
      city: p.city || undefined,
    } : {};
    setLinkedHints(hints);
    if (!memberId && !coachId) return;
    const { data: extra } = coachId
      ? await supabase.from('coaches').select('avatar_url, birth_date, qualification_id, coaching_qualifications(name), avs_number').eq('id', coachId).maybeSingle()
      : await supabase.from('members').select('photo_url, birth_date, avs_number').eq('id', memberId as string).maybeSingle();
    if (!extra) return;
    const x = extra as any;
    setLinkedHints({
      ...hints,
      photo: x.avatar_url || x.photo_url || undefined,
      birth_date: x.birth_date || undefined,
      qualification_id: x.qualification_id || undefined,
      qualification_name: x.coaching_qualifications?.name || undefined,
      avs_number: x.avs_number || undefined,
    });
  };

  const searchPeopleForConfrerie = (query: string) => {
    setConfreriePersonSearch(query);
    if (confrerieSearchTimer.current) clearTimeout(confrerieSearchTimer.current);
    if (query.length < 2) { setConfreriePersonResults([]); return; }
    confrerieSearchTimer.current = setTimeout(async () => {
      const { data } = await supabase.rpc('search_club_people', { p_query: query, p_limit: 20 });
      setConfreriePersonResults((data as ClubPersonResult[]) || []);
    }, 300);
  };

  const fetchQualifications = async () => {
    try {
      const { data, error } = await supabase
        .from('coaching_qualifications')
        .select('id, name, description')
        .eq('active', true)
        .order('display_order');
      if (error) {
        console.error('Error fetching qualifications:', error);
      } else if (data) {
        setQualifications(data);
      }
    } catch (err) {
      console.error('Unexpected error fetching qualifications:', err);
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

  const loadAccessForProfile = async (profileId: string | null | undefined) => {
    if (!profileId) {
      setAccessProfileId(null);
      setAccessProfileRole(null);
      setAccessState({});
      setAccessLoaded(true);
      return;
    }

    setAccessProfileId(profileId);

    const { data: userProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', profileId)
      .maybeSingle();
    setAccessProfileRole(userProfile?.role ?? null);

    if (!clubId) {
      const state: Record<string, { can_view: boolean; can_edit: boolean }> = {};
      for (const mod of MODULES) {
        state[mod.key] = { can_view: false, can_edit: false };
      }
      setAccessState(state);
      setAccessLoaded(true);
      return;
    }

    const { data: accessRows } = await supabase
      .from('committee_access')
      .select('module, can_view, can_edit')
      .eq('profile_id', profileId)
      .eq('club_id', clubId);

    const state: Record<string, { can_view: boolean; can_edit: boolean }> = {};
    for (const mod of MODULES) {
      state[mod.key] = { can_view: false, can_edit: false };
    }
    if (accessRows) {
      for (const row of accessRows) {
        state[row.module] = { can_view: row.can_view, can_edit: row.can_edit };
      }
    }
    setAccessState(state);
    setAccessLoaded(true);
  };

  const handleOpenModal = (item: any = null) => {
    setCommitteePersonSearch('');
    setCommitteePersonResults(null);
    setModalTab('info');
    if (item) {
      setEditingItem(item);
      setFormData(item);
      setPhotoPreview(item.profile_photo_url || null);
      setLinkedHints({});
      if (activeTab === 'committee' && (item.profile_id || item.member_id || item.coach_id)) {
        const table = item.coach_id ? 'coaches' : item.member_id ? 'members' : 'profiles';
        const id = item.coach_id || item.member_id || item.profile_id;
        const cols = table === 'coaches'
          ? 'email, phone, avatar_url, birth_date, address, postal_code, city, qualification_id, coaching_qualifications(name), avs_number'
          : table === 'members'
          ? 'email, phone, photo_url, birth_date, address, postal_code, city, avs_number'
          : 'email, phone, avatar_url, address, npa, city';
        Promise.all([
          supabase.from(table).select(cols).eq('id', id).maybeSingle(),
          table === 'profiles'
            ? supabase.from('members').select('birth_date').eq('profile_id', id).limit(1).maybeSingle()
            : Promise.resolve({ data: null }),
        ]).then(([{ data: lnkRow }, { data: memberRow }]) => {
          const lnk = lnkRow ? { ...(lnkRow as any), birth_date: (lnkRow as any).birth_date ?? (memberRow as any)?.birth_date } : null;
          if (lnk) setLinkedHints({
            email: (lnk as any).email || undefined,
            phone: (lnk as any).phone || undefined,
            photo: (lnk as any).avatar_url || (lnk as any).photo_url || undefined,
            birth_date: (lnk as any).birth_date || undefined,
            address: (lnk as any).address || undefined,
            postal_code: (lnk as any).postal_code || (lnk as any).npa || undefined,
            city: (lnk as any).city || undefined,
            qualification_id: (lnk as any).qualification_id || undefined,
            qualification_name: (lnk as any).coaching_qualifications?.name || undefined,
            avs_number: (lnk as any).avs_number || undefined,
          });
        });
      }
      if (activeTab === 'committee') {
        // Resolve linked user account: profile_id > coach.user_id > member.profile_id > email lookup
        (async () => {
          let resolvedProfileId: string | null = item.profile_id || null;
          if (!resolvedProfileId && item.coach_id) {
            const { data: coach } = await supabase.from('coaches').select('user_id').eq('id', item.coach_id).maybeSingle();
            resolvedProfileId = coach?.user_id || null;
          }
          if (!resolvedProfileId && item.member_id) {
            const { data: member } = await supabase.from('members').select('profile_id').eq('id', item.member_id).maybeSingle();
            resolvedProfileId = member?.profile_id || null;
          }
          if (!resolvedProfileId) {
            // Fallback: resolve by email (use inherited email if own is empty)
            const resolvedEmail = item.email || linkedHints.email;
            if (resolvedEmail) {
              const { data: prof } = await supabase.from('profiles').select('id').eq('email', resolvedEmail.toLowerCase()).maybeSingle();
              resolvedProfileId = prof?.id || null;
            }
          }
          loadAccessForProfile(resolvedProfileId);
        })();
        // Load linked positions
        const linkedPositions: string[] = (item.committee_member_positions || [])
          .map((p: any) => p.position_id)
          .filter(Boolean);
        setSelectedPositionIds(linkedPositions);
        setIsCommitteeToggle(item.is_committee ?? true);
        setIsCommitteeManuallySet(true); // On edit, no auto-adjustment
        // Show legacy hint if no positions linked
        if (linkedPositions.length === 0 && item.role) {
          setLegacyRoleHint(item.role);
        } else {
          setLegacyRoleHint(null);
        }
      }
    } else {
      setEditingItem(null);
      setPhotoPreview(null);
      setLinkedHints({});
      setAccessProfileId(null);
      setAccessProfileRole(null);
      setAccessState({});
      setAccessLoaded(false);
      if (activeTab === 'committee') {
        setSelectedPositionIds([]);
        setIsCommitteeToggle(true);
        setIsCommitteeManuallySet(false);
        setLegacyRoleHint(null);
      }
      if (activeTab === 'referees') {
        setFormData({ active: true });
      } else if (activeTab === 'confrerie') {
        setFormData({ active: true, billing_mode: 'email', salutation: '' });
        setConfreriePersonSearch('');
        setConfreriePersonResults([]);
        setConfreriePersonLinked(null);
      } else {
        setFormData({});
      }
    }
    if (activeTab === 'confrerie' && selectedConfrerieMember) {
      setPendingReopenConfrerieId(selectedConfrerieMember.id);
      setSelectedConfrerieMember(null);
    }
    setShowModal(true);
  };

  const handleLinkMember = (member: any) => {
    setFormData({
      ...formData,
      member_id: member.id,
      first_name: member.first_name,
      last_name: member.last_name,
      email: member.email,
      phone: member.phone,
      address: member.address,
      postal_code: member.postal_code,
      city: member.city
    });
  };

  const handleUnlinkMember = () => {
    setFormData({
      ...formData,
      member_id: null
    });
  };

  const handleAccessViewChange = (moduleKey: string, checked: boolean) => {
    setAccessState((prev) => {
      const row = { ...prev[moduleKey] };
      row.can_view = checked;
      if (!checked) row.can_edit = false;
      return { ...prev, [moduleKey]: row };
    });
  };

  const handleAccessEditChange = (moduleKey: string, checked: boolean) => {
    setAccessState((prev) => {
      const row = { ...prev[moduleKey] };
      row.can_edit = checked;
      if (checked) row.can_view = true;
      return { ...prev, [moduleKey]: row };
    });
  };

  const handleSaveAccess = async () => {
    if (!accessProfileId) return;
    if (!clubId) {
      showToast('Aucun club actif détecté. Impossible d’enregistrer les accès.', 'error');
      return;
    }
    setSavingAccess(true);
    try {
      const rows = MODULES.map((mod) => ({
        profile_id: accessProfileId,
        club_id: clubId,
        module: mod.key,
        can_view: accessState[mod.key]?.can_view ?? false,
        can_edit: accessState[mod.key]?.can_edit ?? false,
      }));
      const { error } = await supabase
        .from('committee_access')
        .upsert(rows, { onConflict: 'profile_id,module,club_id' });
      if (error) throw error;
      const name = editingItem ? `${editingItem.first_name} ${editingItem.last_name}` : '';
      setSuccessToast(`Accès enregistrés pour ${name}`);
      setTimeout(() => setSuccessToast(null), 3000);
      handleCloseModal();
    } catch (err) {
      console.error('Error saving access:', err);
      showToast('Erreur lors de la sauvegarde des droits.', 'error');
    } finally {
      setSavingAccess(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Veuillez sélectionner une image valide', 'warning');
      return;
    }

    setUploadingPhoto(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      if ((activeTab === 'committee' || activeTab === 'referees') && !clubId) {
        showToast('Club non identifié.', 'error');
        setUploadingPhoto(false);
        return;
      }
      const filePath =
        activeTab === 'committee' ? `${clubId}/committee/${fileName}` :
        activeTab === 'referees' ? `${clubId}/referees/${fileName}` :
        fileName;

      const { data, error } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.error('Upload error:', error);
        showToast('Erreur lors du téléchargement de la photo.', 'error');
        setUploadingPhoto(false);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      setPhotoPreview(publicUrl);
      setFormData({ ...formData, profile_photo_url: publicUrl });
    } catch (err) {
      console.error('Upload error:', err);
      showToast('Erreur lors du téléchargement.', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (activeTab === 'committee' && formData.avs_number && formData.avs_number.trim()) {
      if (!validateAVS(formData.avs_number)) {
        showToast('Format AVS invalide. Format attendu: 756.XXXX.XXXX.XX', 'warning');
        return;
      }

      let avsCommitteeQuery = supabase
        .from('committee_members')
        .select('id, first_name, last_name, email, phone, birth_date, role')
        .eq('avs_number', formData.avs_number.trim());
      if (editingItem?.id) {
        avsCommitteeQuery = avsCommitteeQuery.neq('id', editingItem.id);
      }
      const { data: avsCommittee } = await avsCommitteeQuery.maybeSingle();
      if (avsCommittee) {
        setDuplicateInfo({ type: 'avs', person: { ...avsCommittee, table: 'Comité' } });
        return;
      }

      if (!skipCrossTableRef.current) {
        const { data: avsData } = await supabase
          .from('members')
          .select('id, first_name, last_name, email, phone, birth_date, teams(name)')
          .eq('avs_number', formData.avs_number.trim())
          .maybeSingle();
        if (avsData && (avsData as any).id !== editingItem?.member_id) {
          pendingLinkRef.current = { table: 'members', id: avsData.id, email: avsData.email };
          setDuplicateInfo({ type: 'avs', person: { ...avsData, table: 'Joueur', team_name: (avsData as any).teams?.name || null }, crossTable: true });
          return;
        }
        const { data: avsCoach } = await supabase
          .from('coaches')
          .select('id, first_name, last_name, email, phone, birth_date')
          .eq('avs_number', formData.avs_number.trim())
          .maybeSingle();
        if (avsCoach && (avsCoach as any).id !== editingItem?.coach_id) {
          pendingLinkRef.current = { table: 'coaches', id: avsCoach.id, email: avsCoach.email };
          setDuplicateInfo({ type: 'avs', person: { ...avsCoach, table: 'Entraîneur' }, crossTable: true });
          return;
        }
      }
    }

    const table =
      activeTab === 'committee' ? 'committee_members' :
      activeTab === 'supporters' ? 'supporters' :
      activeTab === 'confrerie' ? 'confrerie_members' :
      'referees';

    const { coaching_qualifications: _cq, committee_member_positions: _cmp, position_names: _pn, ...rawData } = { ...formData };

    const dataToSubmit: Record<string, any> = {};
    for (const [k, v] of Object.entries(rawData)) {
      if (!k.startsWith('_')) dataToSubmit[k] = v;
    }

    // For committee members: set role and is_committee
    if (activeTab === 'committee') {
      const posNames = clubPositions
        .filter(p => selectedPositionIds.includes(p.id))
        .map(p => p.name);
      dataToSubmit.role = posNames.length > 0 ? posNames.join(' · ') : null;
      dataToSubmit.is_committee = isCommitteeToggle;
    }

    dataToSubmit.club_id = clubId;

    if (editingItem) {
      const { error } = await supabase
        .from(table)
        .update(dataToSubmit)
        .eq('id', editingItem.id);

      if (error) {
        showToast('Erreur lors de la sauvegarde: ' + error.message, 'error');
        return;
      }
      if (activeTab === 'committee') {
        await syncPositions(editingItem.id);
      }
      if (pendingLinkRef.current && activeTab === 'committee') {
        const link = pendingLinkRef.current;
        if (link.table === 'members') {
          await supabase.from('committee_members').update({ member_id: link.id }).eq('id', editingItem.id);
        } else if (link.table === 'coaches') {
          await supabase.from('committee_members').update({ coach_id: link.id }).eq('id', editingItem.id);
        }
        if (!(formData as any).email && link.email) {
          await supabase.from('committee_members').update({ email: link.email }).eq('id', editingItem.id);
        }
        pendingLinkRef.current = null;
        skipCrossTableRef.current = false;
        showToast('Fiches reliées', 'success');
      }
      await fetchAll();
      setShowModal(false);
      setPhotoPreview(null);
    } else {
      const { data: inserted, error } = await supabase
        .from(table)
        .insert([dataToSubmit])
        .select('id')
        .single();

      if (error) {
        showToast('Erreur lors de la création: ' + error.message, 'error');
        return;
      }
      if (activeTab === 'committee' && inserted) {
        await syncPositions(inserted.id);
      }
      if (pendingLinkRef.current && activeTab === 'committee' && inserted) {
        const link = pendingLinkRef.current;
        if (link.table === 'members') {
          await supabase.from('committee_members').update({ member_id: link.id }).eq('id', inserted.id);
        } else if (link.table === 'coaches') {
          await supabase.from('committee_members').update({ coach_id: link.id }).eq('id', inserted.id);
        }
        if (!(formData as any).email && link.email) {
          await supabase.from('committee_members').update({ email: link.email }).eq('id', inserted.id);
        }
        pendingLinkRef.current = null;
        skipCrossTableRef.current = false;
        showToast('Fiches reliées', 'success');
      }
      await fetchAll();
      setShowModal(false);
      setPhotoPreview(null);
    }
  };

  const syncPositions = async (committeeMemberId: string) => {
    const { error: delErr } = await supabase
      .from('committee_member_positions')
      .delete()
      .eq('committee_member_id', committeeMemberId);
    if (delErr) {
      showToast('Erreur lors de la mise à jour des postes: ' + delErr.message, 'error');
      return;
    }
    if (selectedPositionIds.length > 0) {
      const rows = selectedPositionIds.map(posId => ({
        committee_member_id: committeeMemberId,
        position_id: posId,
      }));
      const { error: insErr } = await supabase.from('committee_member_positions').insert(rows);
      if (insErr) {
        showToast('Erreur lors de l\'ajout des postes: ' + insErr.message, 'error');
      }
    }
  };

  const handleDelete = async (id: string) => {
    const table =
      activeTab === 'committee' ? 'committee_members' :
      activeTab === 'supporters' ? 'supporters' :
      activeTab === 'confrerie' ? 'confrerie_members' :
      'referees';

    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', id);

    if (error) {
      showToast('Erreur lors de la suppression: ' + error.message, 'error');
      return;
    }
    fetchAll();
  };

  const getGlobalSearchResults = () => {
    if (searchQuery.length < 2) return null;

    const query = searchQuery.trim().toLowerCase();
    const parts = query.split(' ').filter(Boolean);

    const matchesPerson = (p: any) => {
      if (parts.length === 1) {
        return (
          p.first_name?.toLowerCase().includes(query) ||
          p.last_name?.toLowerCase().includes(query) ||
          p.email?.toLowerCase().includes(query) ||
          p.role?.toLowerCase().includes(query) ||
          p.licence_level?.toLowerCase().includes(query)
        );
      } else {
        const fullName1 = `${p.first_name} ${p.last_name}`.toLowerCase();
        const fullName2 = `${p.last_name} ${p.first_name}`.toLowerCase();
        return (
          fullName1.includes(query) ||
          fullName2.includes(query) ||
          p.email?.toLowerCase().includes(query) ||
          p.role?.toLowerCase().includes(query) ||
          p.licence_level?.toLowerCase().includes(query)
        );
      }
    };

    const filteredCommittee = committeeMembers.filter(matchesPerson);
    const filteredSupporters = supporters.filter(matchesPerson);
    const filteredReferees = referees.filter(matchesPerson);

    return {
      committee: filteredCommittee,
      supporters: filteredSupporters,
      referees: filteredReferees,
      total: filteredCommittee.length + filteredSupporters.length + filteredReferees.length
    };
  };

  const renderCommitteeTab = () => {
    const sorted = [...committeeMembers].sort((a, b) => {
      const aVal = a[sortField as keyof CommitteeMember];
      const bVal = b[sortField as keyof CommitteeMember];
      if (!aVal) return 1;
      if (!bVal) return -1;
      const cmp = String(aVal).localeCompare(String(bVal), 'fr', { sensitivity: 'base' });
      if (cmp !== 0) return sortDir === 'asc' ? cmp : -cmp;
      const cmp2 = String(a.first_name || '').localeCompare(String(b.first_name || ''), 'fr', { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp2 : -cmp2;
    });

    return (
      <div
        className="overflow-x-auto"
        style={{ maxHeight: 'calc(100vh - 240px)', overflowY: 'auto', overflowX: 'auto' }}
      >
        <table className="std-table anuaire-club-sticky-head" style={{ minWidth: '900px', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ width: '80px', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                Photo
              </th>
              <SortableHeader label="Nom" field="last_name" sortField={sortField} sortDir={sortDir} onSort={handleSort} style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }} />
              <SortableHeader label="Prénom" field="first_name" sortField={sortField} sortDir={sortDir} onSort={handleSort} style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }} />
              <SortableHeader label="Postes" field="role" sortField={sortField} sortDir={sortDir} onSort={handleSort} style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }} />
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                Mobile
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                Lié joueur
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ width: '100px', minWidth: '100px', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((member) => (
              <tr key={member.id} className="cursor-pointer" onClick={() => setSelectedCommitteeMember(member)}>
                <td className="px-6 py-4">
                  {member._resolved_photo ? (
                    <div className="relative">
                      <ZoomablePhoto src={member._resolved_photo} caption={`${member.first_name} ${member.last_name}`} alt="" className="w-10 h-10 rounded-full object-cover" />
                      {!member.profile_photo_url && (member.profile_id || member.member_id || member.coach_id) && (
                        <Link2 size={10} className="absolute -bottom-0.5 -right-0.5 rounded-full p-0.5" style={{ background: 'var(--bg-card)', color: 'var(--accent)' }} />
                      )}
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium" style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}>
                      {member.first_name[0]}{member.last_name[0]}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  {member.last_name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {member.first_name}
                </td>
                <td className="px-6 py-4 text-sm" style={{ verticalAlign: 'top' }}>
                  {(() => {
                    const names = (member.position_names && member.position_names.length > 0) ? member.position_names : [];
                    const fallback = member.role || null;
                    const badgeLabel = member.is_committee ? 'Comité' : 'Opérationnel';
                    const badge = (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{
                        background: member.is_committee ? 'var(--info-soft)' : 'var(--bg-hover)',
                        color: member.is_committee ? 'var(--accent)' : 'var(--text-muted)',
                      }}>
                        {badgeLabel}
                      </span>
                    );
                    if (names.length === 0 && !fallback) return badge;
                    if (names.length === 1) return <div className="flex items-center gap-2 flex-wrap">{badge}<span>{names[0]}</span></div>;
                    if (names.length === 0 && fallback) return <div className="flex items-center gap-2 flex-wrap">{badge}<span>{fallback}</span></div>;
                    return (
                      <div>
                        <div style={{ marginBottom: '4px' }}>{badge}</div>
                        {names.map((n, i) => <div key={i} style={{ color: 'var(--text-secondary)', lineHeight: '1.4' }}>{n}</div>)}
                      </div>
                    );
                  })()}
                </td>
                <td className="px-6 py-4 text-sm" style={{ maxWidth: '200px', wordBreak: 'break-all', whiteSpace: 'normal' }} title={member._resolved_email || ''}>
                  {member._resolved_email ? (
                    <span className="flex items-center gap-1">
                      {member._resolved_email}
                      {!member.email && !member.public_email && <span title="Hérité du lien" className="shrink-0 inline-flex"><Link2 size={11} style={{ color: 'var(--accent)' }} /></span>}
                    </span>
                  ) : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {member._resolved_phone ? (
                    <span className="flex items-center gap-1">
                      {member._resolved_phone}
                      {!member.phone && <span title="Hérité du lien" className="shrink-0 inline-flex"><Link2 size={11} style={{ color: 'var(--accent)' }} /></span>}
                      {member.hide_phone && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium" style={{ background: 'var(--warning-soft, #fef3c7)', color: 'var(--warning-text, #92400e)', fontSize: '10px' }}>Numéro masqué</span>}
                    </span>
                  ) : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {member.member_id ? (
                    <Badge variant="blue">Lié</Badge>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>-</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium" style={{ minWidth: '120px' }} onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-2">
                    {!accessLoading && canEdit && (
                      <>
                        <button
                          onClick={() => handleOpenModal(member)}
                          style={{ color: 'var(--accent)' }}
                          title="Modifier"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => {
                            showConfirm({
                              title: 'Supprimer le membre',
                              message: 'Êtes-vous sûr de vouloir supprimer ce membre du comité ?',
                              confirmLabel: 'Oui, supprimer',
                              cancelLabel: 'Non',
                              confirmStyle: 'danger',
                              onConfirm: () => {
                                hideConfirm();
                                handleDelete(member.id);
                              }
                            });
                          }}
                          style={{ color: 'var(--danger)' }}
                          title="Supprimer"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center">
                  Aucun membre du comité
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const renderSupportersTab = () => {
    const sorted = [...supporters].sort((a, b) => {
      const aVal = a[sortField as keyof Supporter];
      const bVal = b[sortField as keyof Supporter];
      if (!aVal) return 1;
      if (!bVal) return -1;
      const cmp = String(aVal).localeCompare(String(bVal), 'fr', { sensitivity: 'base' });
      if (cmp !== 0) return sortDir === 'asc' ? cmp : -cmp;
      const cmp2 = String(a.first_name || '').localeCompare(String(b.first_name || ''), 'fr', { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp2 : -cmp2;
    });

    return (
      <div
        className="overflow-x-auto"
        style={{ maxHeight: 'calc(100vh - 240px)', overflowY: 'auto', overflowX: 'auto' }}
      >
        <table className="std-table anuaire-club-sticky-head" style={{ minWidth: '800px', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
            <tr>
              <SortableHeader label="Nom" field="last_name" sortField={sortField} sortDir={sortDir} onSort={handleSort} style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }} />
              <SortableHeader label="Prénom" field="first_name" sortField={sortField} sortDir={sortDir} onSort={handleSort} style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }} />
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                Mobile
              </th>
              <SortableHeader label="Membre depuis" field="member_since" sortField={sortField} sortDir={sortDir} onSort={handleSort} style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }} />
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                Lié joueur
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ width: '100px', minWidth: '100px', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((supporter) => (
              <tr key={supporter.id} className="cursor-pointer" onClick={() => setSelectedSupporter(supporter)}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  {supporter.last_name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {supporter.first_name}
                </td>
                <td className="px-6 py-4 text-sm" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={supporter.email || ''}>
                  {supporter.email || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {supporter.phone || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {supporter.member_since ? formatDateCH(supporter.member_since) : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {supporter.member_id ? (
                    <Badge variant="blue">Lié</Badge>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>-</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium" style={{ minWidth: '120px' }} onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-2">
                    {!accessLoading && canEdit && (
                      <>
                        <button
                          onClick={() => handleOpenModal(supporter)}
                          style={{ color: 'var(--accent)' }}
                          title="Modifier"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => {
                            showConfirm({
                              title: 'Supprimer le supporter',
                              message: 'Êtes-vous sûr de vouloir supprimer ce supporter ?',
                              confirmLabel: 'Oui, supprimer',
                              cancelLabel: 'Non',
                              confirmStyle: 'danger',
                              onConfirm: () => {
                                hideConfirm();
                                handleDelete(supporter.id);
                              }
                            });
                          }}
                          style={{ color: 'var(--danger)' }}
                          title="Supprimer"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center">
                  Aucun supporter
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const getFilteredSortedConfrerie = () => {
    let filtered = confrerieMembers.filter(m => confrerieFilter === 'all' ? true : confrerieFilter === 'archived' ? !m.active : m.active);
    if (confrerieSearch) {
      const term = confrerieSearch.toLowerCase();
      filtered = filtered.filter(m =>
        m.first_name.toLowerCase().includes(term) ||
        m.last_name.toLowerCase().includes(term) ||
        (m.email && m.email.toLowerCase().includes(term)) ||
        (m.company && m.company.toLowerCase().includes(term)) ||
        (m.external_ref && m.external_ref.toLowerCase().includes(term))
      );
    }
    return [...filtered].sort((a, b) => {
      const aVal = a[sortField as keyof ConfrerieMember];
      const bVal = b[sortField as keyof ConfrerieMember];
      if (!aVal) return 1;
      if (!bVal) return -1;
      const cmp = String(aVal).localeCompare(String(bVal), 'fr', { sensitivity: 'base' });
      if (cmp !== 0) return sortDir === 'asc' ? cmp : -cmp;
      const cmp2 = String(a.first_name || '').localeCompare(String(b.first_name || ''), 'fr', { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp2 : -cmp2;
    });
  };

  const renderConfrerieToolbar = () => {
    const sorted = getFilteredSortedConfrerie();
    return (
      <div className="mb-6 flex flex-wrap gap-4 items-center">
        <div className="flex-1 min-w-[200px]">
          <SearchInput
            value={confrerieSearch}
            onChange={setConfrerieSearch}
            placeholder="Rechercher..."
          />
        </div>

        <select
          value={confrerieFilter}
          onChange={(e) => setConfrerieFilter(e.target.value as 'active' | 'archived' | 'all')}
          className="px-4 py-2 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)]"
        >
          <option value="active">Liste active (non archivés)</option>
          <option value="archived">Archivés</option>
          <option value="all">Tous</option>
        </select>

        <Button variant="secondary" size="sm" onClick={() => setConfrerieImportOpen(true)}>
          <Upload size={16} />
          Importer CSV
        </Button>

        <Button variant="secondary" size="sm" onClick={() => exportConfrerieExcel(sorted)}>
          <Download size={16} />
          Exporter Excel
        </Button>

        <span style={{ marginLeft: 'auto', color: 'var(--text-secondary)', fontSize: '14px' }}>
          {sorted.length} membre{sorted.length !== 1 ? 's' : ''}
        </span>
      </div>
    );
  };

  const renderConfrerieTab = () => {
    const sorted = getFilteredSortedConfrerie();
    const billingPill = (m: ConfrerieMember) => {
      const styles: Record<string, { bg: string; color: string; label: string }> = {
        email: { bg: 'var(--bg-hover)', color: 'var(--text-secondary)', label: 'E-mail' },
        print: { bg: 'var(--bg-hover)', color: 'var(--text-secondary)', label: 'Courrier' },
        package: { bg: 'var(--warning-soft, #fffbeb)', color: 'var(--warning-text, #92400e)', label: 'Package' },
      };
      const s = styles[m.billing_mode] || styles.email;
      const sponsorName = m.billing_mode === 'package' && m.sponsor_id ? (sponsors.find((sp: any) => sp.id === m.sponsor_id)?.company_name || '') : '';
      return (
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ background: s.bg, color: s.color }}
          title={sponsorName || undefined}
        >
          {s.label}
        </span>
      );
    };

    const thStyle = { position: 'sticky' as const, top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' };

    return (
      <div
        className="overflow-x-auto"
        style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto', overflowX: 'auto' }}
      >
          <table className="std-table anuaire-club-sticky-head" style={{ minWidth: '1000px', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr>
                <SortableHeader label="Nom" field="last_name" sortField={sortField} sortDir={sortDir} onSort={handleSort} style={thStyle} />
                <SortableHeader label="Prénom" field="first_name" sortField={sortField} sortDir={sortDir} onSort={handleSort} style={thStyle} />
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={thStyle}>
                  Société
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={thStyle}>
                  Email
                </th>
                <SortableHeader label="Membre depuis" field="member_since" sortField={sortField} sortDir={sortDir} onSort={handleSort} style={thStyle} />
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style={thStyle}>
                  Cotisation
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={thStyle}>
                  Facturation
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={thStyle}>
                  Statut
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ width: '140px', minWidth: '140px', ...thStyle }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((member) => (
                <tr key={member.id} className="cursor-pointer" onClick={() => setSelectedConfrerieMember(member)} style={{ opacity: member.active ? 1 : 0.55 }}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {member.last_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {member.first_name}
                  </td>
                  <td className="px-6 py-4 text-sm" style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={member.company || ''}>
                    {member.company || ''}
                  </td>
                  <td className="px-6 py-4 text-sm" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={member.email || ''}>
                    {member.email || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {member.member_since ? formatDateCH(member.member_since) : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    CHF {(member.annual_amount ?? confrerieClubAmount).toFixed(2)}
                    {member.category === 'supporter' && (
                      <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: 'var(--info-soft, #eff6ff)', color: 'var(--accent)' }}>Supporter</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {billingPill(member)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex items-center gap-1.5 flex-wrap">
                    {member.active ? (
                      <Badge variant="green">Actif</Badge>
                    ) : (
                      <span title={member.archived_at ? `Archivé depuis le ${formatDateCH(member.archived_at)} (${getArchivedElapsed(member.archived_at)})` : ''}>
                        <Badge variant="neutral">Archivé</Badge>
                      </span>
                    )}
                    {websiteEnabled && (member as any).hide_from_site && <Badge variant="neutral">Masqué du site</Badge>}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium" style={{ minWidth: '140px' }}>
                    <div className="flex items-center justify-end gap-2">
                      {!accessLoading && canEdit && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleOpenModal(member); }}
                            style={{ color: 'var(--accent)' }}
                            title="Modifier"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                          {member.active ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); showConfirm({
                                  title: 'Archiver le membre',
                                  message: `Archiver ${member.first_name} ${member.last_name} ? Ce membre ne sera plus visible dans la liste active ni facturable.`,
                                  confirmLabel: 'Oui, archiver',
                                  cancelLabel: 'Non',
                                  confirmStyle: 'warning',
                                  onConfirm: () => {
                                    hideConfirm();
                                    handleArchiveConfrerie(member);
                                  }
                                });
                              }}
                              style={{ color: 'var(--text-muted)' }}
                              title="Archiver"
                            >
                              <Archive className="w-5 h-5" />
                            </button>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); showConfirm({
                                  title: 'Réactiver le membre',
                                  message: `Réactiver ${member.first_name} ${member.last_name} ?`,
                                  confirmLabel: 'Oui, réactiver',
                                  cancelLabel: 'Non',
                                  confirmStyle: 'primary',
                                  onConfirm: () => {
                                    hideConfirm();
                                    handleReactivateConfrerie(member);
                                  }
                                });
                              }}
                              style={{ color: 'var(--success)' }}
                              title="Réactiver"
                            >
                              <RotateCcw className="w-5 h-5" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center" style={{ color: 'var(--text-secondary)' }}>
                    Aucun membre dans la {confrerieLabel}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
    );
  };

  const renderRefereesTab = () => {
    const sorted = [...referees].sort((a, b) => {
      const aVal = a[sortField as keyof Referee];
      const bVal = b[sortField as keyof Referee];
      if (!aVal) return 1;
      if (!bVal) return -1;
      const cmp = String(aVal).localeCompare(String(bVal), 'fr', { sensitivity: 'base' });
      if (cmp !== 0) return sortDir === 'asc' ? cmp : -cmp;
      const cmp2 = String(a.first_name || '').localeCompare(String(b.first_name || ''), 'fr', { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp2 : -cmp2;
    });

    return (
      <div
        className="overflow-x-auto"
        style={{ maxHeight: 'calc(100vh - 240px)', overflowY: 'auto', overflowX: 'auto' }}
      >
        <table className="std-table anuaire-club-sticky-head" style={{ minWidth: '800px', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
            <tr>
              <SortableHeader label="Nom" field="last_name" sortField={sortField} sortDir={sortDir} onSort={handleSort} style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }} />
              <SortableHeader label="Prénom" field="first_name" sortField={sortField} sortDir={sortDir} onSort={handleSort} style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }} />
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                Mobile
              </th>
              <SortableHeader label="Niveau" field="licence_level" sortField={sortField} sortDir={sortDir} onSort={handleSort} style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }} />
              <SortableHeader label="Actif" field="active" sortField={sortField} sortDir={sortDir} onSort={handleSort} style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }} />
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                Lié joueur
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ width: '100px', minWidth: '100px', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((referee) => (
              <tr key={referee.id} className="cursor-pointer" onClick={() => setSelectedReferee(referee)}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  {referee.last_name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {referee.first_name}
                </td>
                <td className="px-6 py-4 text-sm" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={referee.email || ''}>
                  {referee.email || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {referee.phone || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {referee.licence_level || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <Badge variant={referee.active ? 'green' : 'neutral'}>
                    {referee.active ? 'Actif' : 'Inactif'}
                  </Badge>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {referee.member_id ? (
                    <Badge variant="blue">Lié</Badge>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>-</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium" style={{ minWidth: '120px' }} onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-2">
                    {!accessLoading && canEdit && (
                      <>
                        <button
                          onClick={() => handleOpenModal(referee)}
                          style={{ color: 'var(--accent)' }}
                          title="Modifier"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => {
                            showConfirm({
                              title: 'Supprimer l\'arbitre',
                              message: 'Êtes-vous sûr de vouloir supprimer cet arbitre ?',
                              confirmLabel: 'Oui, supprimer',
                              cancelLabel: 'Non',
                              confirmStyle: 'danger',
                              onConfirm: () => {
                                hideConfirm();
                                handleDelete(referee.id);
                              }
                            });
                          }}
                          style={{ color: 'var(--danger)' }}
                          title="Supprimer"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center">
                  Aucun arbitre
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const renderGlobalSearchResults = () => {
    const results = getGlobalSearchResults();
    if (!results) return null;

    if (results.total === 0) {
      return (
        <div className="rounded-lg shadow-xl p-12 text-center" style={{ background: 'var(--bg-card)' }}>
          <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>Aucun résultat trouvé pour "{searchQuery}"</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="rounded-lg shadow-xl p-4" style={{ background: 'var(--bg-card)' }}>
          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{results.total} résultat{results.total > 1 ? 's' : ''} dans tout l'annuaire</p>
        </div>

        {results.committee.length > 0 && (
          <div className="std-table-wrap">
            <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}><Landmark className="w-5 h-5 inline mr-2" />Comité ({results.committee.length} résultat{results.committee.length > 1 ? 's' : ''})</h3>
            </div>
            <div>
              {results.committee.map((member) => (
                <div
                  key={member.id}
                  onClick={() => setSelectedCommitteeMember(member)}
                  className="std-row px-6 py-4 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-4">
                    {member.profile_photo_url ? (
                      <ZoomablePhoto src={member.profile_photo_url} caption={`${member.first_name} ${member.last_name}`} alt="" className="w-12 h-12 rounded-full object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-medium" style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}>
                        {member.first_name[0]}{member.last_name[0]}
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{member.first_name} {member.last_name}</p>
                      <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {(() => {
                          const names = (member.position_names && member.position_names.length > 0) ? member.position_names : [];
                          const fallback = member.role || null;
                          const badgeLabel = member.is_committee ? 'Comité' : 'Opérationnel';
                          const badge = (
                            <span className="text-xs font-medium" style={{ color: member.is_committee ? 'var(--accent)' : 'var(--text-muted)' }}>
                              ({badgeLabel})
                            </span>
                          );
                          if (names.length === 0 && !fallback) return badge;
                          if (names.length <= 1) return <span>{badge} {names[0] || fallback || 'Rôle non spécifié'}</span>;
                          return (
                            <span>
                              {badge}
                              {names.map((n, i) => <span key={i}>{i > 0 ? ', ' : ' '}{n}</span>)}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                    <Eye className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {results.supporters.length > 0 && (
          <div className="std-table-wrap">
            <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}><Handshake className="w-5 h-5 inline mr-2" />Supporters ({results.supporters.length} résultat{results.supporters.length > 1 ? 's' : ''})</h3>
            </div>
            <div>
              {results.supporters.map((supporter) => (
                <div
                  key={supporter.id}
                  onClick={() => setSelectedSupporter(supporter)}
                  className="std-row px-6 py-4 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-medium" style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}>
                      {supporter.first_name[0]}{supporter.last_name[0]}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{supporter.first_name} {supporter.last_name}</p>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{supporter.email || 'Email non spécifié'}</p>
                    </div>
                    <Eye className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {results.referees.length > 0 && (
          <div className="std-table-wrap">
            <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}><Scale className="w-5 h-5 inline mr-2" />Arbitres ({results.referees.length} résultat{results.referees.length > 1 ? 's' : ''})</h3>
            </div>
            <div>
              {results.referees.map((referee) => (
                <div
                  key={referee.id}
                  onClick={() => setSelectedReferee(referee)}
                  className="std-row px-6 py-4 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-4">
                    {referee.profile_photo_url ? (
                      <ZoomablePhoto src={referee.profile_photo_url} caption={`${referee.first_name} ${referee.last_name}`} alt="" className="w-12 h-12 rounded-full object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-medium" style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}>
                        {referee.first_name[0]}{referee.last_name[0]}
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{referee.first_name} {referee.last_name}</p>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{referee.licence_level || 'Niveau non spécifié'}</p>
                    </div>
                    <Eye className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    );
  };

  const renderModal = () => {
    if (activeTab === 'committee') {
      return (
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {(formData.profile_id || formData.member_id || (formData as any).coach_id) ? (
            <PersonLinkSelector
              linkedProfileId={formData.profile_id || null}
              linkedMemberId={formData.member_id || null}
              linkedCoachId={(formData as any).coach_id || null}
              onLink={() => {}}
              onUnlink={() => { setFormData({ ...formData, profile_id: null, member_id: null, coach_id: null } as any); setLinkedHints({}); }}
            />
          ) : (
            <div className="relative">
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                Rechercher une personne existante
              </label>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  value={committeePersonSearch}
                  onChange={(e) => searchPeopleForCommittee(e.target.value)}
                  placeholder="Rechercher par nom, prénom ou email..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
              {committeePersonResults && committeePersonSearch.length >= 2 && (
                <div className="absolute z-50 mt-1 w-full rounded-lg shadow-lg overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', maxHeight: '280px', overflowY: 'auto' }}>
                  {committeePersonResults.length === 0 ? (
                    <p className="px-4 py-2.5 text-sm" style={{ color: 'var(--text-muted)' }}>Aucune personne trouvée</p>
                  ) : committeePersonResults.map((p) => (
                    <button
                      key={`${p.source}-${p.source_id}`}
                      type="button"
                      onClick={() => linkCommitteePerson(p)}
                      className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                      style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{p.first_name} {p.last_name}</p>
                          {p.email && <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{p.email}</p>}
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-1 flex-shrink-0">
                          {(p.sources?.length ? p.sources : [p.source]).map(s => (
                            <Badge key={s} variant={CLUB_PERSON_SOURCE_BADGES[s]?.variant || 'neutral'}>
                              {CLUB_PERSON_SOURCE_BADGES[s]?.label || s}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                Optionnel — recherchez parmi les joueurs, parents, entraîneurs, supporters et comptes du club.
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Si cette personne crée un compte plus tard avec la même adresse e-mail, il sera relié automatiquement.
              </p>
            </div>
          )}
          <div>
            <h3 className="text-lg font-semibold mb-4">1. Identité</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Prénom *</label>
                <input
                  type="text"
                  required
                  value={formData.first_name || ''}
                  onChange={(e) => setFormData({...formData, first_name: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Nom *</label>
                <input
                  type="text"
                  required
                  value={formData.last_name || ''}
                  onChange={(e) => setFormData({...formData, last_name: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Date de naissance</label>
                <input
                  type="date"
                  value={formData.birth_date || ''}
                  onChange={(e) => setFormData({...formData, birth_date: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
                {!formData.birth_date && linkedHints.birth_date && (
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Hérité du lien : {formatDateCH(linkedHints.birth_date)}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Photo de profil</label>
                <div className="flex items-center gap-4">
                  {photoPreview || formData.profile_photo_url ? (
                    <img
                      src={photoPreview || formData.profile_photo_url}
                      alt="Prévisualisation"
                      className="w-16 h-16 rounded-full object-cover"
                    />
                  ) : linkedHints.photo ? (
                    <div className="relative">
                      <img src={linkedHints.photo} alt="Héritée" className="w-16 h-16 rounded-full object-cover opacity-60" />
                      <span className="absolute -bottom-1 left-0 right-0 text-center text-[9px]" style={{ color: 'var(--text-muted)' }}>hérité</span>
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-full flex items-center justify-center text-sm font-medium" style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}>
                      {formData.first_name?.[0] || '?'}{formData.last_name?.[0] || '?'}
                    </div>
                  )}
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      disabled={uploadingPhoto}
                      className="hidden"
                      id="photo-upload"
                    />
                    <label
                      htmlFor="photo-upload"
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition-colors ${uploadingPhoto ? 'opacity-50 cursor-not-allowed' : ''}`}
                      style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
                    >
                      <Upload size={16} />
                      {uploadingPhoto ? 'Téléchargement...' : 'Choisir une photo'}
                    </label>
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="Ou entrez une URL"
                  value={formData.profile_photo_url || ''}
                  onChange={(e) => {
                    setFormData({...formData, profile_photo_url: e.target.value});
                    setPhotoPreview(e.target.value);
                  }}
                  className="w-full mt-2 px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">2. Coordonnées</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">E-mail du compte (connexion, privé)</label>
                <input
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder={linkedHints.email ? `Hérité du lien : ${linkedHints.email}` : ''}
                  className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">E-mail de communication</label>
                <input
                  type="email"
                  value={formData.public_email || ''}
                  onChange={(e) => setFormData({...formData, public_email: e.target.value || null})}
                  placeholder="Laissez vide pour afficher l'e-mail du compte"
                  className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Adresse du club, affichée dans l'app, le site et les PDF.</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Mobile</label>
                <PhoneInput
                  value={formData.phone || ''}
                  onChange={(v) => setFormData({ ...formData, phone: v })}
                  placeholder={linkedHints.phone ? `Hérité du lien : ${linkedHints.phone}` : undefined}
                />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!formData.hide_phone}
                    onChange={(e) => setFormData({...formData, hide_phone: e.target.checked})}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  Ne pas afficher le numéro de téléphone
                </label>
                <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>(visible uniquement par le comité)</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">3. Adresse</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-2">Adresse</label>
                <input
                  type="text"
                  value={formData.address || ''}
                  onChange={(e) => setFormData({...formData, address: e.target.value})}
                  placeholder={linkedHints.address ? `Hérité du lien : ${linkedHints.address}` : ''}
                  className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Code postal</label>
                <input
                  type="text"
                  value={formData.postal_code || ''}
                  onChange={(e) => setFormData({...formData, postal_code: e.target.value})}
                  placeholder={linkedHints.postal_code ? `Hérité du lien : ${linkedHints.postal_code}` : ''}
                  className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Ville</label>
                <input
                  type="text"
                  value={formData.city || ''}
                  onChange={(e) => setFormData({...formData, city: e.target.value})}
                  placeholder={linkedHints.city ? `Hérité du lien : ${linkedHints.city}` : ''}
                  className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">4. Postes &amp; Fonction</h3>

            {/* Multi-select positions */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Postes</label>
              {legacyRoleHint && selectedPositionIds.length === 0 && (
                <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                  Fonction actuelle : <em>{legacyRoleHint}</em>
                </p>
              )}
              <div className="rounded-lg p-3" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', maxHeight: '180px', overflowY: 'auto' }}>
                {clubPositions.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Aucun poste configuré (voir Paramètres → Postes)</p>
                ) : (
                  clubPositions.map(pos => (
                    <label key={pos.id} className="flex items-center gap-3 py-1.5 px-1 cursor-pointer hover:opacity-80">
                      <input
                        type="checkbox"
                        checked={selectedPositionIds.includes(pos.id)}
                        onChange={() => {
                          const next = selectedPositionIds.includes(pos.id)
                            ? selectedPositionIds.filter(id => id !== pos.id)
                            : [...selectedPositionIds, pos.id];
                          setSelectedPositionIds(next);
                          // Auto-preset is_committee on create if not manually set
                          if (!editingItem && !isCommitteeManuallySet) {
                            const anyCommittee = clubPositions
                              .filter(p => next.includes(p.id))
                              .some(p => p.default_is_committee);
                            setIsCommitteeToggle(anyCommittee);
                          }
                        }}
                        className="w-4 h-4 rounded"
                        style={{ accentColor: 'var(--accent)' }}
                      />
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{pos.name}</span>
                      <span className="text-xs ml-auto" style={{ color: pos.default_is_committee ? 'var(--accent)' : 'var(--text-muted)' }}>
                        {pos.default_is_committee ? 'Comité' : 'Opér.'}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>

            {/* is_committee toggle */}
            <div className="mb-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsCommitteeToggle(!isCommitteeToggle);
                    setIsCommitteeManuallySet(true);
                  }}
                  style={{
                    background: isCommitteeToggle ? 'var(--accent)' : 'var(--border-color)',
                    border: 'none', borderRadius: '9999px', width: '40px', height: '22px',
                    position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
                  }}
                >
                  <span style={{
                    position: 'absolute', top: '2px',
                    left: isCommitteeToggle ? '20px' : '2px',
                    width: '18px', height: '18px', borderRadius: '50%',
                    background: 'var(--text-inverse)', transition: 'left 0.2s',
                  }} />
                </button>
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Fait partie du comité</span>
              </div>
              <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                Détermine la section de l'annuaire : Comité ou Fonctions opérationnelles.
              </p>
            </div>

            {/* Qualification coach */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Qualification entraîneur</label>
                <select
                  value={formData.qualification_id || ''}
                  onChange={(e) => setFormData({...formData, qualification_id: e.target.value || null})}
                  className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                >
                  <option value="">{linkedHints.qualification_name ? `Hérité du lien : ${linkedHints.qualification_name}` : 'Aucune qualification'}</option>
                  {qualifications.map(qualification => (
                    <option key={qualification.id} value={qualification.id} title={qualification.description || ''}>
                      {qualification.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">5. AVS (Admin uniquement)</h3>
            <div>
              <label className="block text-sm font-medium mb-2">Numéro AVS</label>
              <input
                type="text"
                value={formData.avs_number || ''}
                onChange={(e) => setFormData({...formData, avs_number: formatAVS(e.target.value)})}
                placeholder={linkedHints.avs_number ? `Hérité du lien : ${linkedHints.avs_number}` : '756.XXXX.XXXX.XX'}
                maxLength={16}
                className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t" style={{ gap: '12px', borderColor: 'var(--border-color)' }}>
            <Button type="button" variant="secondary" onClick={handleCloseModal}>
              Annuler
            </Button>
            <Button type="submit" variant="primary">
              {editingItem ? 'Enregistrer' : 'Créer'}
            </Button>
          </div>
        </form>
      );
    } else if (activeTab === 'supporters') {
      return (
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Prénom *</label>
              <input
                type="text"
                required
                value={formData.first_name || ''}
                onChange={(e) => setFormData({...formData, first_name: e.target.value})}
                className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Nom *</label>
              <input
                type="text"
                required
                value={formData.last_name || ''}
                onChange={(e) => setFormData({...formData, last_name: e.target.value})}
                className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <input
                type="email"
                value={formData.email || ''}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Mobile</label>
              <PhoneInput
                value={formData.phone || ''}
                onChange={(v) => setFormData({ ...formData, phone: v })}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-2">Adresse</label>
              <input
                type="text"
                value={formData.address || ''}
                onChange={(e) => setFormData({...formData, address: e.target.value})}
                className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Code postal</label>
              <input
                type="text"
                value={formData.postal_code || ''}
                onChange={(e) => setFormData({...formData, postal_code: e.target.value})}
                className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Ville</label>
              <input
                type="text"
                value={formData.city || ''}
                onChange={(e) => setFormData({...formData, city: e.target.value})}
                className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-2">Membre depuis</label>
              <input
                type="date"
                value={formData.member_since || ''}
                onChange={(e) => setFormData({...formData, member_since: e.target.value})}
                className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t" style={{ gap: '12px', borderColor: 'var(--border-color)' }}>
            <Button type="button" variant="secondary" onClick={handleCloseModal}>
              Annuler
            </Button>
            <Button type="submit" variant="primary">
              {editingItem ? 'Enregistrer' : 'Créer'}
            </Button>
          </div>
        </form>
      );
    } else if (activeTab === 'confrerie') {
      const emailWarning = formData.billing_mode === 'email' && !formData.email;
      return (
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Lier une personne existante</label>
            {confreriePersonLinked ? (
              <div>
                <div className="flex items-center gap-2 rounded-lg p-3" style={{ background: 'var(--info-soft)', border: '1px solid var(--accent)' }}>
                  <Link2 size={16} style={{ color: 'var(--accent-text)' }} />
                  <span className="text-sm font-medium flex-1" style={{ color: 'var(--accent-text)' }}>
                    {confreriePersonLinked.first_name} {confreriePersonLinked.last_name}
                    {confreriePersonLinked.email && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> ({confreriePersonLinked.email})</span>}
                  </span>
                  <button type="button" onClick={() => { setConfreriePersonLinked(null); setFormData({ ...formData, profile_id: null, _linked_profile_name: null }); }} className="text-xs px-2 py-1 rounded" style={{ color: 'var(--danger)', background: 'var(--danger-soft)' }}>
                    Dissocier
                  </button>
                </div>
                {confreriePersonLinked.has_account && confreriePersonLinked.email ? (
                  <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: 'var(--success)' }}>
                    <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />
                    Lié au compte {confreriePersonLinked.email}
                  </p>
                ) : (
                  <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                    Pas encore de compte — sera lié automatiquement à l'inscription
                  </p>
                )}
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Rechercher par nom, prénom ou email..."
                  value={confreriePersonSearch}
                  onChange={(e) => searchPeopleForConfrerie(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
                {confreriePersonResults.length > 0 && confreriePersonSearch.length >= 2 && (
                  <div className="absolute z-50 mt-1 w-full rounded-lg shadow-lg overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', maxHeight: '280px', overflowY: 'auto' }}>
                    {confreriePersonResults.map((p) => {
                      const sourceLabels: Record<string, string> = { joueur: 'Joueur', comite: 'Comité', entraineur: 'Entraîneur', supporter: 'Supporter', parent: 'Parent', compte: 'Compte' };
                      const sourceColors: Record<string, string> = { joueur: '#2563eb', comite: '#7c3aed', entraineur: '#d97706', supporter: '#059669', parent: '#db2777', compte: '#0891b2' };
                      return (
                        <button
                          key={`${p.source}-${p.source_id}`}
                          type="button"
                          disabled={p.already_confrerie}
                          onClick={() => {
                            setConfreriePersonLinked(p);
                            setFormData({
                              ...formData,
                              first_name: p.first_name,
                              last_name: p.last_name,
                              email: p.email || formData.email || '',
                              phone: p.phone || formData.phone || '',
                              address: p.address || formData.address || '',
                              postal_code: p.postal_code || formData.postal_code || '',
                              city: p.city || formData.city || '',
                              profile_id: p.has_account && p.profile_id ? p.profile_id : null,
                              _linked_profile_name: p.has_account ? `${p.first_name} ${p.last_name}` : null,
                            });
                            setConfreriePersonSearch('');
                            setConfreriePersonResults([]);
                          }}
                          className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                          style={{ color: p.already_confrerie ? 'var(--text-muted)' : 'var(--text-primary)', opacity: p.already_confrerie ? 0.6 : 1, borderBottom: '1px solid var(--border-color)', cursor: p.already_confrerie ? 'not-allowed' : 'pointer' }}
                          onMouseEnter={(e) => { if (!p.already_confrerie) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <span className="font-medium">{p.first_name} {p.last_name}</span>
                              {p.email && <span className="ml-2" style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{p.email}</span>}
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {p.sources.map(s => (
                                <span key={s} className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: `${sourceColors[s] || '#6b7280'}18`, color: sourceColors[s] || '#6b7280' }}>
                                  {sourceLabels[s] || s}
                                </span>
                              ))}
                              {p.has_account && (
                                <span className="flex items-center gap-0.5 text-[10px] font-semibold" style={{ color: 'var(--success)' }}>
                                  <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: 'var(--success)' }} />
                                  Compte
                                </span>
                              )}
                              {p.already_confrerie && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                                  Déjà membre
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                  Optionnel — recherchez parmi les joueurs, comité, entraîneurs, supporters et parents du club.
                </p>
              </div>
            )}
          </div>

          {/* Section: Identité */}
          <fieldset className="border rounded-lg p-4" style={{ borderColor: 'var(--border-color)' }}>
            <legend className="text-sm font-semibold px-2" style={{ color: 'var(--text-primary)' }}>Identité</legend>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Civilité</label>
                <select
                  value={formData.salutation || ''}
                  onChange={(e) => setFormData({...formData, salutation: e.target.value || null})}
                  className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                >
                  <option value="">—</option>
                  <option value="Monsieur">Monsieur</option>
                  <option value="Madame">Madame</option>
                </select>
              </div>
              <div>{/* spacer */}</div>
              <div>
                <label className="block text-sm font-medium mb-2">Prénom *</label>
                <input type="text" required value={formData.first_name || ''} onChange={(e) => setFormData({...formData, first_name: e.target.value})} className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Nom *</label>
                <input type="text" required value={formData.last_name || ''} onChange={(e) => setFormData({...formData, last_name: e.target.value})} className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-2">Société</label>
                <input type="text" value={formData.company || ''} onChange={(e) => setFormData({...formData, company: e.target.value || null})} className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Si renseignée, la facture est adressée à la société, à l'attention de la personne</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Date de naissance</label>
                <input type="date" value={formData.birth_date || ''} onChange={(e) => setFormData({...formData, birth_date: e.target.value || null})} className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Nationalité</label>
                <CountrySelect
                  value={formData.nationality || ''}
                  onChange={(v) => setFormData({...formData, nationality: v || null})}
                />
              </div>
            </div>
          </fieldset>

          {/* Section: Coordonnées */}
          <fieldset className="border rounded-lg p-4" style={{ borderColor: 'var(--border-color)' }}>
            <legend className="text-sm font-semibold px-2" style={{ color: 'var(--text-primary)' }}>Coordonnées</legend>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-2">Adresse</label>
                <input type="text" value={formData.address || ''} onChange={(e) => setFormData({...formData, address: e.target.value})} className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">NPA</label>
                <input type="text" value={formData.postal_code || ''} onChange={(e) => setFormData({...formData, postal_code: e.target.value})} className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Localité</label>
                <input type="text" value={formData.city || ''} onChange={(e) => setFormData({...formData, city: e.target.value})} className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">E-mail</label>
                <input type="email" value={formData.email || ''} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Mobile</label>
                <PhoneInput value={formData.phone || ''} onChange={(v) => setFormData({ ...formData, phone: v })} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Tél. privé</label>
                <PhoneInput value={formData.phone_private || ''} onChange={(v) => setFormData({ ...formData, phone_private: v || null })} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Tél. professionnel</label>
                <PhoneInput value={formData.phone_pro || ''} onChange={(v) => setFormData({ ...formData, phone_pro: v || null })} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Fax</label>
                <input type="text" value={formData.fax || ''} onChange={(e) => setFormData({...formData, fax: e.target.value || null})} className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
              </div>
            </div>
          </fieldset>

          {/* Section: Adhésion */}
          <fieldset className="border rounded-lg p-4" style={{ borderColor: 'var(--border-color)' }}>
            <legend className="text-sm font-semibold px-2" style={{ color: 'var(--text-primary)' }}>Adhésion</legend>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Catégorie</label>
                <select
                  value={formData.category || 'member'}
                  onChange={(e) => setFormData({...formData, category: e.target.value as 'member' | 'supporter'})}
                  className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                >
                  <option value="member">{confrerieLabel}</option>
                  <option value="supporter">Supporter</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Cotisation annuelle (CHF)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.annual_amount ?? ''}
                  onChange={(e) => setFormData({...formData, annual_amount: e.target.value ? Number(e.target.value) : null})}
                  placeholder={`Montant du club : CHF ${confrerieClubAmount.toFixed(2)}`}
                  className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Laissez vide pour appliquer le montant du club.</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Membre depuis</label>
                <input type="date" value={formData.member_since || ''} onChange={(e) => setFormData({...formData, member_since: e.target.value})} className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Actif</label>
                <div className="flex items-center gap-2 mt-1">
                  <Toggle checked={formData.active ?? true} onChange={(v: boolean) => setFormData({...formData, active: v})} />
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{formData.active ? 'Actif' : 'Inactif'}</span>
                </div>
              </div>
              {websiteEnabled && (
              <div className="col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={(formData as any).hide_from_site === true} onChange={(e) => setFormData({...formData, hide_from_site: e.target.checked} as any)} style={{ accentColor: 'var(--accent)' }} />
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Ne pas apparaître sur le site du club</span>
                </label>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Par défaut, les membres de la confrérie sont listés (nom uniquement) sur le site internet du club.</p>
              </div>
              )}
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-2">Mode de facturation</label>
                <div className="flex flex-col gap-2 mt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="billing_mode" checked={formData.billing_mode === 'email'} onChange={() => setFormData({...formData, billing_mode: 'email', sponsor_id: formData.billing_mode === 'package' ? null : formData.sponsor_id})} style={{ accentColor: 'var(--accent)' }} />
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Par e-mail</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="billing_mode" checked={formData.billing_mode === 'print'} onChange={() => setFormData({...formData, billing_mode: 'print', sponsor_id: formData.billing_mode === 'package' ? null : formData.sponsor_id})} style={{ accentColor: 'var(--accent)' }} />
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Par courrier (impression)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="billing_mode" checked={formData.billing_mode === 'package'} onChange={() => setFormData({...formData, billing_mode: 'package'})} style={{ accentColor: 'var(--accent)' }} />
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Compris dans un package de sponsoring</span>
                  </label>
                </div>
                {formData.billing_mode === 'package' && (
                  <div className="mt-3 ml-6">
                    <label className="block text-sm font-medium mb-1">Sponsor</label>
                    <select
                      value={formData.sponsor_id || ''}
                      onChange={(e) => setFormData({...formData, sponsor_id: e.target.value || null})}
                      className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    >
                      <option value="">— Aucun (arrangement informel) —</option>
                      {sponsors.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.company_name}</option>
                      ))}
                    </select>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Aucune facture ne sera générée pour ce membre</p>
                  </div>
                )}
                {emailWarning && (
                  <p className="text-xs mt-2 font-medium" style={{ color: 'var(--warning-text, #92400e)' }}>Sans e-mail, choisissez « Par courrier »</p>
                )}
              </div>
            </div>
          </fieldset>

          {/* Section: Football (collapsible) */}
          <details className="border rounded-lg" style={{ borderColor: 'var(--border-color)' }}>
            <summary className="cursor-pointer text-sm font-semibold px-4 py-3" style={{ color: 'var(--text-primary)' }}>Football (facultatif)</summary>
            <div className="grid grid-cols-2 gap-4 p-4 pt-2">
              <div>
                <label className="block text-sm font-medium mb-2">N° de passeport ASF</label>
                <input type="text" value={formData.asf_licence_number || ''} onChange={(e) => setFormData({...formData, asf_licence_number: e.target.value || null})} className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Qualifié le</label>
                <input type="date" value={formData.qualified_at || ''} onChange={(e) => setFormData({...formData, qualified_at: e.target.value || null})} className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Poste</label>
                <select
                  value={formData.position || ''}
                  onChange={(e) => setFormData({...formData, position: e.target.value || null})}
                  className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                >
                  <option value="">—</option>
                  <option value="Gardien">Gardien</option>
                  <option value="Défenseur">Défenseur</option>
                  <option value="Milieu">Milieu</option>
                  <option value="Attaquant">Attaquant</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Réf. externe</label>
                <input type="text" value={formData.external_ref || ''} onChange={(e) => setFormData({...formData, external_ref: e.target.value || null})} className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>N° de membre dans votre ancien logiciel</p>
              </div>
            </div>
          </details>

          {/* Remarques */}
          <div>
            <label className="block text-sm font-medium mb-2">Remarques</label>
            <textarea value={formData.notes || ''} onChange={(e) => setFormData({...formData, notes: e.target.value})} rows={3} className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', resize: 'vertical' }} />
          </div>

          <div className="flex justify-end pt-4 border-t" style={{ gap: '12px', borderColor: 'var(--border-color)' }}>
            <Button type="button" variant="secondary" onClick={handleCloseModal}>
              Annuler
            </Button>
            <Button type="submit" variant="primary">
              {editingItem ? 'Enregistrer' : 'Créer'}
            </Button>
          </div>
        </form>
      );
    } else if (activeTab === 'referees') {
      return (
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <MemberLinkSelector
            linkedMemberId={formData.member_id || null}
            onLink={handleLinkMember}
            onUnlink={handleUnlinkMember}
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Prénom *</label>
              <input
                type="text"
                required
                value={formData.first_name || ''}
                onChange={(e) => setFormData({...formData, first_name: e.target.value})}
                className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Nom *</label>
              <input
                type="text"
                required
                value={formData.last_name || ''}
                onChange={(e) => setFormData({...formData, last_name: e.target.value})}
                className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Photo de profil</label>
              <div className="flex items-center gap-4">
                {photoPreview || formData.profile_photo_url ? (
                  <img
                    src={photoPreview || formData.profile_photo_url}
                    alt="Prévisualisation"
                    className="w-16 h-16 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full flex items-center justify-center text-sm font-medium" style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}>
                    {formData.first_name?.[0] || '?'}{formData.last_name?.[0] || '?'}
                  </div>
                )}
                <div className="flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    disabled={uploadingPhoto}
                    className="hidden"
                    id="referee-photo-upload"
                  />
                  <label
                    htmlFor="referee-photo-upload"
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition-colors ${uploadingPhoto ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Upload size={16} />
                    {uploadingPhoto ? 'Téléchargement...' : 'Choisir une photo'}
                  </label>
                </div>
              </div>
              <input
                type="text"
                placeholder="Ou entrez une URL"
                value={formData.profile_photo_url || ''}
                onChange={(e) => {
                  setFormData({...formData, profile_photo_url: e.target.value});
                  setPhotoPreview(e.target.value);
                }}
                className="w-full px-3 py-2 rounded-lg mt-2" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <input
                type="email"
                value={formData.email || ''}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
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
              <label className="block text-sm font-medium mb-2">Niveau/Licence</label>
              <input
                type="text"
                value={formData.licence_level || ''}
                onChange={(e) => setFormData({...formData, licence_level: e.target.value})}
                className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Actif</label>
              <div className="flex items-center h-10">
                <input
                  type="checkbox"
                  checked={formData.active || false}
                  onChange={(e) => setFormData({...formData, active: e.target.checked})}
                  className="w-5 h-5 rounded"
                />
                <span className="ml-2" style={{ color: 'var(--text-secondary)' }}>Arbitre actif</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t" style={{ gap: '12px', borderColor: 'var(--border-color)' }}>
            <Button type="button" variant="secondary" onClick={handleCloseModal}>
              Annuler
            </Button>
            <Button type="submit" variant="primary">
              {editingItem ? 'Enregistrer' : 'Créer'}
            </Button>
          </div>
        </form>
      );
    } else {
      return (
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-4">1. Entreprise</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-2">Nom entreprise *</label>
                <input
                  type="text"
                  required
                  value={formData.company_name || ''}
                  onChange={(e) => setFormData({...formData, company_name: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Téléphone société</label>
                <PhoneInput
                  value={formData.company_phone || ''}
                  onChange={(v) => setFormData({ ...formData, company_phone: v })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Logo URL</label>
                <input
                  type="text"
                  value={formData.logo_url || ''}
                  onChange={(e) => setFormData({...formData, logo_url: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Site web</label>
                <input
                  type="url"
                  value={formData.website_url || ''}
                  onChange={(e) => setFormData({...formData, website_url: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">2. Contact</h3>
            <MemberLinkSelector
              linkedMemberId={formData.contact_member_id || null}
              onLink={(member) => setFormData({
                ...formData,
                contact_member_id: member.id,
                contact_first_name: member.first_name,
                contact_last_name: member.last_name,
                email: member.email,
                phone: member.phone,
                address: member.address,
                postal_code: member.postal_code,
                city: member.city
              })}
              onUnlink={() => setFormData({...formData, contact_member_id: null})}
            />
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium mb-2">Prénom contact</label>
                <input
                  type="text"
                  value={formData.contact_first_name || ''}
                  onChange={(e) => setFormData({...formData, contact_first_name: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Nom contact</label>
                <input
                  type="text"
                  value={formData.contact_last_name || ''}
                  onChange={(e) => setFormData({...formData, contact_last_name: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Email</label>
                <input
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Mobile</label>
                <PhoneInput
                  value={formData.phone || ''}
                  onChange={(v) => setFormData({ ...formData, phone: v })}
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">3. Adresse</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-2">Adresse</label>
                <input
                  type="text"
                  value={formData.address || ''}
                  onChange={(e) => setFormData({...formData, address: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Code postal</label>
                <input
                  type="text"
                  value={formData.postal_code || ''}
                  onChange={(e) => setFormData({...formData, postal_code: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Ville</label>
                <input
                  type="text"
                  value={formData.city || ''}
                  onChange={(e) => setFormData({...formData, city: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">4. Sponsoring</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Type</label>
                <select
                  value={formData.sponsoring_type || ''}
                  onChange={(e) => setFormData({...formData, sponsoring_type: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                >
                  <option value="">Sélectionner</option>
                  <option value="Maillots">Maillots</option>
                  <option value="Financier">Financier</option>
                  <option value="Matériel">Matériel</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Statut</label>
                <select
                  value={formData.status || 'actif'}
                  onChange={(e) => setFormData({...formData, status: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                >
                  <option value="actif">Actif</option>
                  <option value="en_négociation">En négociation</option>
                  <option value="non_renouvelé">Non renouvelé</option>
                  <option value="expiré">Expiré</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Depuis</label>
                <input
                  type="date"
                  value={formData.sponsoring_since || ''}
                  onChange={(e) => setFormData({...formData, sponsoring_since: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-2">Notes</label>
                <textarea
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t" style={{ gap: '12px', borderColor: 'var(--border-color)' }}>
            <Button type="button" variant="secondary" onClick={handleCloseModal}>
              Annuler
            </Button>
            <Button type="submit" variant="primary">
              {editingItem ? 'Enregistrer' : 'Créer'}
            </Button>
          </div>
        </form>
      );
    }
  };

  if (loading) {
    return <div className="p-8" style={{ color: 'var(--text-primary)' }}>Chargement...</div>;
  }

  const searchResults = getGlobalSearchResults();
  const isSearchActive = searchQuery.length >= 2;

  return (
    <div className="p-4 lg:p-8 w-full" style={{ color: 'var(--text-primary)' }}>
      <style>{`
        .anuaire-club-sticky-head thead th { position: relative; }
        .anuaire-club-sticky-head thead th::after {
          content: '';
          position: absolute;
          left: 0; right: 0; bottom: -8px;
          height: 8px;
          pointer-events: none;
          background: linear-gradient(to bottom, rgba(0,0,0,0.28), rgba(0,0,0,0));
        }
      `}</style>
      {successToast && (
        <div className="fixed bottom-6 right-6 z-[9999] flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg text-sm font-medium" style={{ backgroundColor: 'var(--primary)', color: 'var(--accent-ink, var(--text-inverse))' }}>
          <Shield size={16} />
          {successToast}
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
            <Landmark className="w-5 h-5" />
            Annuaire Club
              <PageTitleCount total={activeTab === 'committee' ? committeeMembers.length : activeTab === 'supporters' ? supporters.length : activeTab === 'confrerie' ? confrerieMembers.filter(c => confrerieFilter === 'archived' ? !!c.archived_at : confrerieFilter === 'active' ? (c.active && !c.archived_at) : true).length : referees.length} />
          </h1>
          <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>Comité et membres</p>
        </div>
        {!accessLoading && canEdit && (
          <Button
            variant="primary"
            onClick={() => handleOpenModal()}
          >
            <Plus size={20} />
            Nouveau
          </Button>
        )}
      </div>

      <div className="mb-6">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          inputSize="lg"
          placeholder="Rechercher dans tout l'annuaire du club..."
        />
      </div>

      {isSearchActive ? (
        renderGlobalSearchResults()
      ) : (
        <>
          <Tabs
            items={[
              { key: 'committee', label: `Comité (${committeeMembers.length})` },
              { key: 'supporters', label: `Supporters (${supporters.length})` },
              { key: 'referees', label: `Arbitres (${referees.length})` },
              { key: 'confrerie', label: `${confrerieLabel} (${confrerieMembers.filter(m => m.active).length})` },
            ]}
            value={activeTab}
            onChange={(k) => setActiveTab(k as TabType)}
            className="mb-6 overflow-x-auto"
          />

          {activeTab === 'confrerie' && renderConfrerieToolbar()}

          <div className="std-table-wrap">
            {activeTab === 'committee' && renderCommitteeTab()}
            {activeTab === 'supporters' && renderSupportersTab()}
            {activeTab === 'referees' && renderRefereesTab()}
            {activeTab === 'confrerie' && renderConfrerieTab()}
          </div>
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-[60] overflow-y-auto" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="sticky top-0 z-10 rounded-t-xl" style={{ background: 'var(--bg-modal-header)' }}>
              <div className="flex items-center justify-between px-6 py-4">
                <h2 className="text-xl font-bold" style={{ color: 'var(--text-modal-header)' }}>
                  {editingItem ?
                    activeTab === 'committee' ? 'Modifier le membre' :
                    activeTab === 'supporters' ? 'Modifier le supporter' :
                    activeTab === 'referees' ? "Modifier l'arbitre" :
                    activeTab === 'confrerie' ? `Modifier le membre (${confrerieLabel})` :
                    'Modifier le sponsor'
                    :
                    activeTab === 'committee' ? 'Nouveau membre' :
                    activeTab === 'supporters' ? 'Nouveau supporter' :
                    activeTab === 'referees' ? 'Nouvel arbitre' :
                    activeTab === 'confrerie' ? `Nouveau membre (${confrerieLabel})` :
                    'Nouveau sponsor'
                  }
                </h2>
                <button onClick={handleCloseModal} className="hover:opacity-80 transition-opacity" style={{ color: 'var(--text-modal-header)' }}>
                  <CloseIcon size={24} />
                </button>
              </div>
              {activeTab === 'committee' && editingItem && (
                <div className="px-6 pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
                  <Tabs
                    items={[
                      { key: 'info', label: 'Informations', icon: <Info size={15} /> },
                      { key: 'access', label: 'Accès & Droits', icon: <Shield size={15} /> },
                    ]}
                    value={modalTab}
                    onChange={(k) => setModalTab(k as 'info' | 'access')}
                  />
                </div>
              )}
            </div>
            {activeTab === 'committee' && editingItem && modalTab === 'access' ? (
              <div className="p-6">
                {!accessProfileId ? (
                  <div className="p-4 rounded-lg" style={{ background: 'var(--bg-input)' }}>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Aucun compte utilisateur trouvé pour ce membre. Un compte doit être créé avec l'adresse email <strong style={{ color: 'var(--text-primary)' }}>{formData.email || linkedHints.email || '—'}</strong> pour pouvoir configurer les accès.
                    </p>
                  </div>
                ) : (accessProfileRole === 'admin' || accessProfileRole === 'president' || accessProfileRole === 'vice_president') ? (
                  <div className="p-4 rounded-lg" style={{ background: 'var(--warning-soft)', border: '1px solid var(--warning)' }}>
                    <p className="text-sm" style={{ color: 'var(--warning-text)' }}>
                      Cet utilisateur a le rôle <strong>{accessProfileRole}</strong> — il dispose de tous les accès automatiquement et ceux-ci ne peuvent pas être modifiés.
                    </p>
                  </div>
                ) : !accessLoaded ? (
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Chargement des droits...</p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-3 pr-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Module</th>
                            <th className="text-center py-3 px-4 font-medium w-20" style={{ color: 'var(--text-secondary)' }}>Voir</th>
                            <th className="text-center py-3 px-4 font-medium w-20" style={{ color: 'var(--text-secondary)' }}>Modifier</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y/50">
                          {MODULES.map((mod) => {
                            const row = accessState[mod.key] ?? { can_view: false, can_edit: false };
                            return (
                              <tr key={mod.key} className="hover:opacity-80">
                                <td className="py-3 pr-4" style={{ color: 'var(--text-primary)' }}>{mod.label}</td>
                                <td className="py-3 px-4 text-center">
                                  <input
                                    type="checkbox"
                                    checked={row.can_view}
                                    onChange={(e) => handleAccessViewChange(mod.key, e.target.checked)}
                                    className="w-4 h-4 rounded cursor-pointer" style={{ accentColor: 'var(--accent)' }}
                                  />
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <input
                                    type="checkbox"
                                    checked={row.can_edit}
                                    onChange={(e) => handleAccessEditChange(mod.key, e.target.checked)}
                                    className="w-4 h-4 rounded cursor-pointer" style={{ accentColor: 'var(--accent)' }}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-6 flex justify-end">
                      <Button
                        variant="primary"
                        onClick={handleSaveAccess}
                        disabled={savingAccess}
                      >
                        <Save size={16} />
                        {savingAccess ? 'Enregistrement...' : 'Enregistrer les droits'}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              renderModal()
            )}
          </div>
        </div>
      )}

      <MemberDetailSlideOver
        member={selectedCommitteeMember}
        type="committee"
        onClose={() => setSelectedCommitteeMember(null)}
      />

      <MemberDetailSlideOver
        member={selectedSupporter}
        type="supporter"
        onClose={() => setSelectedSupporter(null)}
      />

      <MemberDetailSlideOver
        member={selectedReferee}
        type="referee"
        onClose={() => setSelectedReferee(null)}
      />

      <MemberDetailSlideOver
        member={selectedConfrerieMember}
        type="confrerie"
        onClose={() => setSelectedConfrerieMember(null)}
      />

      <DuplicatePersonModal
        duplicateInfo={duplicateInfo}
        onClose={handleCloseDuplicateModal}
        linking={linking}
        currentEmail={(formData as any).email}
        onLink={async () => {
          if (!duplicateInfo?.crossTable) return;
          setLinking(true);
          try {
            skipCrossTableRef.current = true;
            setDuplicateInfo(null);
            await handleSubmit({ preventDefault: () => {} } as React.FormEvent);
          } finally {
            setLinking(false);
          }
        }}
      />

      <ConfirmModal
        {...confirmState}
        onCancel={hideConfirm}
      />

      <ConfrerieImportModal
        open={confrerieImportOpen}
        onClose={() => setConfrerieImportOpen(false)}
        clubId={clubId || ''}
        confrerieLabel={confrerieLabel}
        existingMembers={confrerieMembers.map(m => ({
          email: m.email,
          first_name: m.first_name,
          last_name: m.last_name,
        }))}
        onImportDone={() => fetchConfrerieMembers()}
      />

      <Toast toast={toast} />
    </div>
  );
}
