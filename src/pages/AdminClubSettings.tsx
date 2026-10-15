import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Save, Copy, Check, TriangleAlert as AlertTriangle, RefreshCw, Plus, Pencil, Trash2, ChevronUp, ChevronDown, X } from 'lucide-react';
import { setWebsiteModuleEnabledCache } from '../hooks/useWebsiteModuleEnabled';
import PhoneInput from '../components/PhoneInput';
import ConfirmModal from '../components/ConfirmModal';
import { Tabs } from '../components/ui/Tabs';
import { setFinanceModuleEnabledCache } from '../hooks/useFinanceModuleEnabled';
import { setAttendanceDefaultPresentCache } from '../hooks/useAttendanceDefaultPresent';
import { useTenant } from '../context/TenantContext';
import Button from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { StatusPill } from '../components/ui/StatusPill';

interface ClubSettings {
  id?: string;
  club_name: string;
  club_address: string;
  club_street_number: string;
  club_postal_code: string;
  club_city: string;
  club_email: string;
  club_phone: string;
  club_website: string;
  sender_email: string;
  sender_name: string;
  logo_url: string | null;
  logo_path: string | null;
  club_asf_number: string;
  inscription_slug: string;
  email_redirect_address: string;
  shop_url: string;
  waitlist_email_mode: 'waitlist' | 'welcome';
  confrerie_label: string;
  confrerie_contacts_visible_to_members: boolean;
  rain_mode_enabled: boolean;
}

type TabKey = 'informations' | 'emails' | 'logo' | 'inscriptions' | 'finances' | 'event_types' | 'news_categories' | 'postes' | 'prestations' | 'asf_calendar';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'informations', label: 'Informations' },
  { key: 'emails', label: 'Emails' },
  { key: 'logo', label: 'Logo' },
  { key: 'inscriptions', label: 'Inscriptions' },
  { key: 'finances', label: 'Finances' },
  { key: 'event_types', label: "Types d'événements" },
  { key: 'news_categories', label: "Types d'actualité" },
  { key: 'postes', label: 'Postes' },
  { key: 'prestations', label: 'Prestations sponsoring' },
  { key: 'asf_calendar', label: 'Calendrier ASF' },
];

const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function slugifyClubName(name: string): string {
  return (name || 'club')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'club';
}

function randomSuffix(length = 7): string {
  let out = '';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) {
    out += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  }
  return out;
}

export default function AdminClubSettings() {
  const { clubId } = useTenant();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as TabKey | null;
  const initialTab: TabKey = TABS.some(t => t.key === tabFromUrl) ? (tabFromUrl as TabKey) : 'informations';

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [settings, setSettings] = useState<ClubSettings>({
    club_name: '',
    club_address: '',
    club_street_number: '',
    club_postal_code: '',
    club_city: '',
    club_email: '',
    club_phone: '',
    club_website: '',
    sender_email: '',
    sender_name: '',
    logo_url: '',
    logo_path: '',
    club_asf_number: '',
    inscription_slug: '',
    email_redirect_address: '',
    shop_url: '',
    waitlist_email_mode: 'waitlist',
    confrerie_label: 'Confrérie',
    confrerie_contacts_visible_to_members: false,
    rain_mode_enabled: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  // ASF Calendar state
  const [asfCalendarUrl, setAsfCalendarUrl] = useState('');
  const [asfCalendarSaved, setAsfCalendarSaved] = useState('');
  const [asfSaving, setAsfSaving] = useState(false);
  const [asfSyncing, setAsfSyncing] = useState(false);
  interface AsfSyncLogRow {
    id: string;
    run_at: string;
    events_total: number | null;
    created: number | null;
    updated: number | null;
    unchanged: number | null;
    unmatched: number | null;
    error: string | null;
    unmatched_teams: any[] | null;
    changes: any[] | null;
  }
  const [asfSyncLog, setAsfSyncLog] = useState<AsfSyncLogRow[]>([]);
  const [asfLogExpanded, setAsfLogExpanded] = useState<string | null>(null);
  const [confirmRegenOpen, setConfirmRegenOpen] = useState(false);
  const [financeEnabled, setFinanceEnabled] = useState<boolean>(true);
  const [financeSaving, setFinanceSaving] = useState(false);
  const [financeSavedAt, setFinanceSavedAt] = useState<number | null>(null);
  const [websiteEnabled, setWebsiteEnabled] = useState<boolean>(false);
  const [websiteSaving, setWebsiteSaving] = useState(false);
  const [websiteSavedAt, setWebsiteSavedAt] = useState<number | null>(null);
  const [websiteConfirmOpen, setWebsiteConfirmOpen] = useState(false);
  const [attendanceDefaultPresent, setAttendanceDefaultPresent] = useState(false);
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [attendanceSavedAt, setAttendanceSavedAt] = useState<number | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);



  // Event types state
  interface EventTypeRow { id: string; name: string; display_order: number; active: boolean; }
  const [eventTypes, setEventTypes] = useState<EventTypeRow[]>([]);
  const [etLoading, setEtLoading] = useState(false);
  const [etNewName, setEtNewName] = useState('');
  const [etAdding, setEtAdding] = useState(false);
  const [etEditing, setEtEditing] = useState<string | null>(null);
  const [etEditName, setEtEditName] = useState('');

  // News categories state
  interface NewsCatRow { id: string; name: string; display_order: number; active: boolean; }
  const [newsCategories, setNewsCategories] = useState<NewsCatRow[]>([]);
  const [ncLoading, setNcLoading] = useState(false);
  const [ncNewName, setNcNewName] = useState('');
  const [ncAdding, setNcAdding] = useState(false);
  const [ncEditing, setNcEditing] = useState<string | null>(null);
  const [ncEditName, setNcEditName] = useState('');

  // Positions state
  interface PositionRow { id: string; name: string; description: string | null; default_is_committee: boolean; display_order: number; active: boolean; }
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [posLoading, setPosLoading] = useState(false);
  const [posModalOpen, setPosModalOpen] = useState(false);
  const [posEditing, setPosEditing] = useState<PositionRow | null>(null);
  const [posForm, setPosForm] = useState({ name: '', description: '', default_is_committee: false });
  const [posSaving, setPosSaving] = useState(false);
  const [posDeleteConfirm, setPosDeleteConfirm] = useState<PositionRow | null>(null);
  const [posDeleting, setPosDeleting] = useState(false);

  // Prestation types state
  interface PrestationRow { id: string; name: string; category: string; list_price: number | null; display_order: number; active: boolean; }
  const PREST_CATEGORIES: { value: string; label: string }[] = [
    { value: 'package', label: 'Package' },
    { value: 'club500', label: 'Club des 500 inclus' },
    { value: 'panneau', label: 'Panneau' },
    { value: 'livret', label: 'Livret' },
    { value: 'textile', label: 'Textile / équipement' },
    { value: 'invitation', label: 'Invitation' },
    { value: 'autre', label: 'Autre' },
  ];
  const [prestations, setPrestations] = useState<PrestationRow[]>([]);
  const [prLoading, setPrLoading] = useState(false);
  const [prModalOpen, setPrModalOpen] = useState(false);
  const [prEditing, setPrEditing] = useState<PrestationRow | null>(null);
  const [prForm, setPrForm] = useState({ name: '', category: 'autre', list_price: '' as string });
  const [prSaving, setPrSaving] = useState(false);
  const [prDeleteConfirm, setPrDeleteConfirm] = useState<PrestationRow | null>(null);
  const [prDeleting, setPrDeleting] = useState(false);
  useEffect(() => {
    document.title = 'Paramètres du club - ClubSphere';
    fetchSettings();
    loadEventTypes();
    loadNewsCategories();
    loadPositions();
    loadPrestations();
    loadAsfSyncLog();
  }, [clubId]);

  // ---- Event types CRUD ----
  const loadEventTypes = async () => {
    if (!clubId) return;
    setEtLoading(true);
    const { data } = await supabase
      .from('event_types')
      .select('id, name, display_order, active')
      .eq('club_id', clubId)
      .order('display_order');
    setEventTypes(data || []);
    setEtLoading(false);
  };

  const addEventType = async () => {
    const name = etNewName.trim();
    if (!name || !clubId) return;
    setEtAdding(true);
    try {
      const existing = eventTypes.find(t => t.name.trim().toLowerCase() === name.toLowerCase());
      if (existing) {
        if (existing.active) {
          showToast('Ce type d’événement existe déjà.', 'error');
          setEtAdding(false);
          return;
        }
        const maxOrder = eventTypes.length > 0 ? Math.max(...eventTypes.map(t => t.display_order)) : 0;
        const { error } = await supabase.from('event_types').update({ active: true, display_order: maxOrder + 1 }).eq('id', existing.id);
        if (error) { showToast('Impossible d’enregistrer ce type, réessayez.', 'error'); setEtAdding(false); return; }
        setEtNewName('');
        loadEventTypes();
        showToast(`Le type « ${existing.name} » a été réactivé.`);
        setEtAdding(false);
        return;
      }
      const maxOrder = eventTypes.length > 0 ? Math.max(...eventTypes.map(t => t.display_order)) : 0;
      const { error } = await supabase.from('event_types').insert({ club_id: clubId, name, display_order: maxOrder + 1 });
      if (error) { showToast('Impossible d’enregistrer ce type, réessayez.', 'error'); setEtAdding(false); return; }
      setEtNewName('');
      loadEventTypes();
      showToast(`Type « ${name} » ajouté`);
    } catch {
      showToast('Impossible d’enregistrer ce type, réessayez.', 'error');
    } finally {
      setEtAdding(false);
    }
  };

  const renameEventType = async (id: string) => {
    const name = etEditName.trim();
    if (!name) return;
    try {
      const collision = eventTypes.find(t => t.id !== id && t.name.trim().toLowerCase() === name.toLowerCase());
      if (collision) {
        if (!collision.active) {
          showToast(`Ce nom est utilisé par un type désactivé. Réactivez-le ou choisissez un autre nom.`, 'error');
        } else {
          showToast('Ce type d’événement existe déjà.', 'error');
        }
        return;
      }
      const { error } = await supabase.from('event_types').update({ name }).eq('id', id);
      if (error) { showToast('Impossible d’enregistrer ce type, réessayez.', 'error'); return; }
      setEtEditing(null);
      loadEventTypes();
      showToast('Type renommé');
    } catch {
      showToast('Impossible d’enregistrer ce type, réessayez.', 'error');
    }
  };

  const toggleEventTypeActive = async (id: string, active: boolean) => {
    const { error } = await supabase.from('event_types').update({ active: !active }).eq('id', id);
    if (error) { showToast('Erreur: ' + error.message, 'error'); return; }
    loadEventTypes();
    showToast(!active ? 'Type réactivé' : 'Type désactivé');
  };

  const moveEventType = async (id: string, direction: 'up' | 'down') => {
    const idx = eventTypes.findIndex(t => t.id === id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= eventTypes.length) return;
    const a = eventTypes[idx];
    const b = eventTypes[swapIdx];
    const [r1, r2] = await Promise.all([
      supabase.from('event_types').update({ display_order: b.display_order }).eq('id', a.id),
      supabase.from('event_types').update({ display_order: a.display_order }).eq('id', b.id),
    ]);
    if (r1.error || r2.error) { showToast('Erreur lors du déplacement', 'error'); return; }
    loadEventTypes();
  };
  // ---- End event types ----

  // ---- News categories CRUD ----
  const loadNewsCategories = async () => {
    if (!clubId) return;
    setNcLoading(true);
    const { data } = await supabase
      .from('news_categories')
      .select('id, name, display_order, active')
      .eq('club_id', clubId)
      .order('display_order');
    setNewsCategories(data || []);
    setNcLoading(false);
  };

  const addNewsCategory = async () => {
    const name = ncNewName.trim();
    if (!name || !clubId) return;
    setNcAdding(true);
    try {
      const existing = newsCategories.find(t => t.name.trim().toLowerCase() === name.toLowerCase());
      if (existing) {
        if (existing.active) {
          showToast('Ce type d’actualité existe déjà.', 'error');
          setNcAdding(false);
          return;
        }
        const maxOrder = newsCategories.length > 0 ? Math.max(...newsCategories.map(t => t.display_order)) : 0;
        const { error } = await supabase.from('news_categories').update({ active: true, display_order: maxOrder + 1 }).eq('id', existing.id);
        if (error) { showToast('Impossible d’enregistrer ce type, réessayez.', 'error'); setNcAdding(false); return; }
        setNcNewName('');
        loadNewsCategories();
        showToast(`Le type « ${existing.name} » a été réactivé.`);
        setNcAdding(false);
        return;
      }
      const maxOrder = newsCategories.length > 0 ? Math.max(...newsCategories.map(t => t.display_order)) : 0;
      const { error } = await supabase.from('news_categories').insert({ club_id: clubId, name, display_order: maxOrder + 1 });
      if (error) { showToast('Impossible d’enregistrer ce type, réessayez.', 'error'); setNcAdding(false); return; }
      setNcNewName('');
      loadNewsCategories();
      showToast(`Type « ${name} » ajouté`);
    } catch {
      showToast('Impossible d’enregistrer ce type, réessayez.', 'error');
    } finally {
      setNcAdding(false);
    }
  };

  const renameNewsCategory = async (id: string) => {
    const name = ncEditName.trim();
    if (!name) return;
    try {
      const collision = newsCategories.find(t => t.id !== id && t.name.trim().toLowerCase() === name.toLowerCase());
      if (collision) {
        if (!collision.active) {
          showToast(`Ce nom est utilisé par un type désactivé. Réactivez-le ou choisissez un autre nom.`, 'error');
        } else {
          showToast('Ce type d’actualité existe déjà.', 'error');
        }
        return;
      }
      const { error } = await supabase.from('news_categories').update({ name }).eq('id', id);
      if (error) { showToast('Impossible d’enregistrer ce type, réessayez.', 'error'); return; }
      setNcEditing(null);
      loadNewsCategories();
      showToast('Type renommé');
    } catch {
      showToast('Impossible d’enregistrer ce type, réessayez.', 'error');
    }
  };

  const toggleNewsCategoryActive = async (id: string, active: boolean) => {
    const { error } = await supabase.from('news_categories').update({ active: !active }).eq('id', id);
    if (error) { showToast('Erreur: ' + error.message, 'error'); return; }
    loadNewsCategories();
    showToast(!active ? 'Type réactivé' : 'Type désactivé');
  };

  const moveNewsCategory = async (id: string, direction: 'up' | 'down') => {
    const idx = newsCategories.findIndex(t => t.id === id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= newsCategories.length) return;
    const a = newsCategories[idx];
    const b = newsCategories[swapIdx];
    const [r1, r2] = await Promise.all([
      supabase.from('news_categories').update({ display_order: b.display_order }).eq('id', a.id),
      supabase.from('news_categories').update({ display_order: a.display_order }).eq('id', b.id),
    ]);
    if (r1.error || r2.error) { showToast('Erreur lors du déplacement', 'error'); return; }
    loadNewsCategories();
  };
  // ---- End news categories ----

  // ---- Positions CRUD ----
  const loadPositions = async () => {
    if (!clubId) return;
    setPosLoading(true);
    const { data } = await supabase
      .from('club_positions')
      .select('id, name, description, default_is_committee, display_order, active')
      .eq('club_id', clubId)
      .order('display_order');
    setPositions(data || []);
    setPosLoading(false);
  };

  const openPosAdd = () => {
    setPosEditing(null);
    setPosForm({ name: '', description: '', default_is_committee: false });
    setPosModalOpen(true);
  };

  const openPosEdit = (p: PositionRow) => {
    setPosEditing(p);
    setPosForm({ name: p.name, description: p.description || '', default_is_committee: p.default_is_committee });
    setPosModalOpen(true);
  };

  const savePosition = async () => {
    if (!posForm.name.trim() || !clubId) return;
    setPosSaving(true);
    if (posEditing) {
      const { error } = await supabase.from('club_positions').update({
        name: posForm.name.trim(),
        description: posForm.description.trim() || null,
        default_is_committee: posForm.default_is_committee,
      }).eq('id', posEditing.id);
      if (error) { showToast('Erreur lors de la mise à jour', 'error'); setPosSaving(false); return; }
    } else {
      const maxOrder = positions.length > 0 ? Math.max(...positions.map(p => p.display_order)) + 1 : 1;
      const { error } = await supabase.from('club_positions').insert({
        club_id: clubId,
        name: posForm.name.trim(),
        description: posForm.description.trim() || null,
        default_is_committee: posForm.default_is_committee,
        display_order: maxOrder,
        active: true,
      });
      if (error) { showToast('Erreur lors de l\'ajout', 'error'); setPosSaving(false); return; }
    }
    setPosSaving(false);
    setPosModalOpen(false);
    loadPositions();
  };

  const togglePositionActive = async (id: string, active: boolean) => {
    await supabase.from('club_positions').update({ active: !active }).eq('id', id);
    loadPositions();
  };

  const movePosition = async (id: string, direction: 'up' | 'down') => {
    const idx = positions.findIndex(p => p.id === id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= positions.length) return;
    const a = positions[idx];
    const b = positions[swapIdx];
    await Promise.all([
      supabase.from('club_positions').update({ display_order: b.display_order }).eq('id', a.id),
      supabase.from('club_positions').update({ display_order: a.display_order }).eq('id', b.id),
    ]);
    loadPositions();
  };

  const deletePosition = async () => {
    if (!posDeleteConfirm) return;
    setPosDeleting(true);
    const { error } = await supabase.from('club_positions').delete().eq('id', posDeleteConfirm.id);
    setPosDeleting(false);
    if (error) {
      if (error.code === '23503') {
        showToast('Ce poste est attribué à des membres — retirez-le d\'abord de leurs fiches, ou désactivez-le.', 'error');
      } else {
        showToast('Erreur lors de la suppression', 'error');
      }
      setPosDeleteConfirm(null);
      return;
    }
    setPosDeleteConfirm(null);
    loadPositions();
  };
  // ---- End positions ----

  // ---- Prestation types CRUD ----
  const loadPrestations = async () => {
    if (!clubId) return;
    setPrLoading(true);
    const { data } = await supabase
      .from('sponsor_prestation_types')
      .select('id, name, category, list_price, display_order, active')
      .eq('club_id', clubId)
      .order('display_order')
      .order('name');
    setPrestations(data || []);
    setPrLoading(false);
  };

  const openPrAdd = () => {
    setPrEditing(null);
    setPrForm({ name: '', category: 'autre', list_price: '' });
    setPrModalOpen(true);
  };

  const openPrEdit = (p: PrestationRow) => {
    setPrEditing(p);
    setPrForm({ name: p.name, category: p.category, list_price: p.list_price != null ? String(p.list_price) : '' });
    setPrModalOpen(true);
  };

  const savePrestation = async () => {
    if (!prForm.name.trim() || !clubId) return;
    setPrSaving(true);
    const payload = {
      name: prForm.name.trim(),
      category: prForm.category,
      list_price: prForm.list_price.trim() ? Number(prForm.list_price) : null,
    };
    if (prEditing) {
      const { error } = await supabase.from('sponsor_prestation_types').update(payload).eq('id', prEditing.id);
      if (error) { showToast('Erreur lors de la mise à jour', 'error'); setPrSaving(false); return; }
    } else {
      const maxOrder = prestations.length > 0 ? Math.max(...prestations.map(p => p.display_order)) + 1 : 1;
      const { error } = await supabase.from('sponsor_prestation_types').insert({
        club_id: clubId,
        ...payload,
        display_order: maxOrder,
        active: true,
      });
      if (error) { showToast('Erreur lors de l\'ajout', 'error'); setPrSaving(false); return; }
    }
    setPrSaving(false);
    setPrModalOpen(false);
    loadPrestations();
    showToast(prEditing ? 'Prestation mise à jour' : 'Prestation ajoutée');
  };

  const togglePrestationActive = async (id: string, active: boolean) => {
    await supabase.from('sponsor_prestation_types').update({ active: !active }).eq('id', id);
    loadPrestations();
  };

  const movePrestation = async (id: string, direction: 'up' | 'down') => {
    const idx = prestations.findIndex(p => p.id === id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= prestations.length) return;
    const a = prestations[idx];
    const b = prestations[swapIdx];
    await Promise.all([
      supabase.from('sponsor_prestation_types').update({ display_order: b.display_order }).eq('id', a.id),
      supabase.from('sponsor_prestation_types').update({ display_order: a.display_order }).eq('id', b.id),
    ]);
    loadPrestations();
  };

  const deletePrestation = async () => {
    if (!prDeleteConfirm) return;
    setPrDeleting(true);
    const { error } = await supabase.from('sponsor_prestation_types').delete().eq('id', prDeleteConfirm.id);
    setPrDeleting(false);
    if (error) {
      if (error.code === '23503') {
        showToast('Cette prestation est utilisée par des contrats : désactivez-la plutôt que de la supprimer.', 'error');
      } else {
        showToast('Erreur lors de la suppression', 'error');
      }
      setPrDeleteConfirm(null);
      return;
    }
    setPrDeleteConfirm(null);
    loadPrestations();
    showToast('Prestation supprimée');
  };
  // ---- End prestation types ----

  const handleTabChange = (key: TabKey) => {
    setActiveTab(key);
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    setSearchParams(next, { replace: true });
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchSettings = async () => {
    if (!clubId) return;
    try {
      const { data, error } = await supabase
        .from('club_settings')
        .select('*')
        .eq('club_id', clubId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching settings:', error);
      } else if (data) {
        setSettings({
          club_name: data.club_name || '',
          club_address: data.club_address || '',
          club_street_number: data.club_street_number || '',
          club_postal_code: data.club_postal_code || '',
          club_city: data.club_city || '',
          club_email: data.club_email || '',
          club_phone: data.club_phone || '',
          club_website: data.club_website || '',
          sender_email: data.sender_email || '',
          sender_name: data.sender_name || '',
          logo_url: data.logo_url || '',
          logo_path: data.logo_path || '',
          club_asf_number: data.club_asf_number || '',
          inscription_slug: data.inscription_slug || '',
          email_redirect_address: data.email_redirect_address || '',
          shop_url: data.shop_url || '',
          waitlist_email_mode: data.waitlist_email_mode === 'welcome' ? 'welcome' : 'waitlist',
          confrerie_label: data.confrerie_label || 'Confrérie',
          confrerie_contacts_visible_to_members: data.confrerie_contacts_visible_to_members === true,
          rain_mode_enabled: data.rain_mode_enabled === true
        });
        setFinanceEnabled(data.finance_module_enabled !== false);
        setFinanceModuleEnabledCache(data.finance_module_enabled !== false);
        setWebsiteEnabled(data.website_module_enabled === true);
        setAttendanceDefaultPresent(data.attendance_default_present === true);
        setAttendanceDefaultPresentCache(data.attendance_default_present === true);
        setAsfCalendarUrl(data.asf_calendar_url || '');
        setAsfCalendarSaved(data.asf_calendar_url || '');

      }
    } catch (err) {
      console.error('Unexpected error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof ClubSettings, value: string | boolean) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!clubId) { showToast('Club non identifié.', 'error'); return; }

    const shopVal = settings.shop_url.trim();
    if (shopVal && !/^https?:\/\/.+/i.test(shopVal)) {
      showToast('L\'URL de la boutique doit commencer par http:// ou https://', 'error');
      return;
    }

    const redirectEmail = settings.email_redirect_address.trim();
    if (redirectEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(redirectEmail)) {
      showToast('Adresse email de redirection invalide', 'error');
      return;
    }

    setSaving(true);

    const { error } = await supabase
      .from('club_settings')
      .upsert({
        club_id: clubId,
        club_name: settings.club_name || null,
        club_address: settings.club_address || null,
        club_street_number: settings.club_street_number || null,
        club_postal_code: settings.club_postal_code || null,
        club_city: settings.club_city || null,
        club_email: settings.club_email || null,
        club_phone: settings.club_phone || null,
        club_website: settings.club_website || null,
        sender_email: settings.sender_email || null,
        sender_name: settings.sender_name || null,
        email_redirect_address: settings.email_redirect_address.trim() || null,
        shop_url: settings.shop_url.trim() || null,
        club_asf_number: settings.club_asf_number || null,
        confrerie_label: settings.confrerie_label.trim() || 'Confrérie',
        confrerie_contacts_visible_to_members: settings.confrerie_contacts_visible_to_members,
        rain_mode_enabled: settings.rain_mode_enabled,
        updated_at: new Date().toISOString()
      }, { onConflict: 'club_id' });

    setSaving(false);

    if (error) {
      console.error('Save error:', error);
      showToast('Erreur: ' + error.message, 'error');
    } else {
      showToast('Paramètres sauvegardés !');
    }
  };

  const handleToggleAttendanceDefault = async (next: boolean) => {
    if (!clubId) { showToast('Club non identifié.', 'error'); return; }
    setAttendanceSaving(true);
    const previous = attendanceDefaultPresent;
    setAttendanceDefaultPresent(next);

    const { error } = await supabase
      .from('club_settings')
      .upsert(
        { club_id: clubId, attendance_default_present: next, updated_at: new Date().toISOString() },
        { onConflict: 'club_id' }
      );

    setAttendanceSaving(false);
    if (error) {
      console.error('Attendance default toggle save error:', error);
      setAttendanceDefaultPresent(previous);
      showToast('Erreur lors de la sauvegarde.', 'error');
      return;
    }
    setAttendanceDefaultPresentCache(next);
    setAttendanceSavedAt(Date.now());
    setTimeout(() => setAttendanceSavedAt(prev => (prev && Date.now() - prev >= 1400 ? null : prev)), 1500);
  };

  const handleToggleWebsiteModule = async (next: boolean) => {
    if (!clubId) { showToast('Club non identifié.', 'error'); return; }
    setWebsiteSaving(true);
    const previous = websiteEnabled;
    setWebsiteEnabled(next);

    const { error } = await supabase
      .from('club_settings')
      .upsert(
        { club_id: clubId, website_module_enabled: next, updated_at: new Date().toISOString() },
        { onConflict: 'club_id' }
      );

    setWebsiteSaving(false);
    if (error) {
      console.error('Website toggle save error:', error);
      setWebsiteEnabled(previous);
      showToast('Erreur lors de la sauvegarde.', 'error');
      return;
    }
    setWebsiteModuleEnabledCache(next);
    setWebsiteSavedAt(Date.now());
    setTimeout(() => setWebsiteSavedAt(prev => (prev && Date.now() - prev >= 1400 ? null : prev)), 1500);
  };

  const handleToggleFinanceModule = async (next: boolean) => {
    if (!clubId) { showToast('Club non identifié.', 'error'); return; }
    setFinanceSaving(true);
    const previous = financeEnabled;
    setFinanceEnabled(next);

    const { error } = await supabase
      .from('club_settings')
      .upsert(
        { club_id: clubId, finance_module_enabled: next, updated_at: new Date().toISOString() },
        { onConflict: 'club_id' }
      );

    setFinanceSaving(false);
    if (error) {
      console.error('Finance toggle save error:', error);
      setFinanceEnabled(previous);
      showToast('Erreur lors de la sauvegarde.', 'error');
      return;
    }
    setFinanceModuleEnabledCache(next);
    setFinanceSavedAt(Date.now());
    setTimeout(() => setFinanceSavedAt(prev => (prev && Date.now() - prev >= 1400 ? null : prev)), 1500);
  };

  // ---- ASF Calendar ----
  const loadAsfSyncLog = async () => {
    if (!clubId) return;
    const { data } = await supabase
      .from('asf_sync_log')
      .select('id, run_at, events_total, created, updated, unchanged, unmatched, unmatched_teams, changes, error')
      .eq('club_id', clubId)
      .order('run_at', { ascending: false })
      .limit(20);
    setAsfSyncLog(data || []);
  };



  const handleSaveAsfUrl = async () => {
    if (!clubId) return;
    const url = asfCalendarUrl.trim();
    if (url && !/^https?:\/\/.+/i.test(url)) {
      showToast('L\'URL doit commencer par http:// ou https://', 'error');
      return;
    }
    setAsfSaving(true);
    const { error } = await supabase
      .from('club_settings')
      .upsert({ club_id: clubId, asf_calendar_url: url || null, updated_at: new Date().toISOString() }, { onConflict: 'club_id' });
    setAsfSaving(false);
    if (error) {
      showToast('Erreur: ' + error.message, 'error');
    } else {
      setAsfCalendarSaved(url);
      showToast(url ? 'URL du calendrier ASF sauvegardée' : 'Synchronisation ASF désactivée');
    }
  };

  const handleSyncNow = async () => {
    setAsfSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-asf-calendar`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({}),
        }
      );
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        showToast(body.error || `Erreur ${resp.status}`, 'error');
      } else {
        const c = Array.isArray(body.clubs) && body.clubs[0] ? body.clubs[0] : body;
        const parts: string[] = [];
        if (c.events_total != null) parts.push(`${c.events_total} événements`);
        if (c.created) parts.push(`${c.created} créés`);
        if (c.updated) parts.push(`${c.updated} mis à jour`);
        if (c.unchanged) parts.push(`${c.unchanged} inchangés`);
        if (c.unmatched) parts.push(`${c.unmatched} non appariés`);
        showToast(parts.length > 0 ? parts.join(', ') : 'Synchronisation terminée');
        await loadAsfSyncLog();
      }
    } catch (err: any) {
      showToast('Erreur réseau: ' + (err.message || 'impossible de contacter le serveur'), 'error');
    } finally {
      setAsfSyncing(false);
    }
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadLogo(file);
  };

  const handleLogoDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await uploadLogo(file);
  };

  const uploadLogo = async (file: File) => {
    if (!clubId) { showToast('Club non identifié.', 'error'); return; }
    if (file.size > 2 * 1024 * 1024) {
      showToast('Le fichier ne doit pas dépasser 2MB', 'error');
      return;
    }
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      showToast('Format accepté: PNG ou JPG', 'error');
      return;
    }

    setUploading(true);

    try {
      if (settings.logo_path) {
        await supabase.storage.from('club-assets').remove([settings.logo_path]);
      }

      const ext = file.name.split('.').pop();
      const path = `logos/${clubId}/club-logo-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('club-assets')
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('club-assets')
        .getPublicUrl(path);

      await supabase
        .from('club_settings')
        .upsert(
          { club_id: clubId, logo_url: publicUrl, logo_path: path, updated_at: new Date().toISOString() },
          { onConflict: 'club_id' }
        );

      setSettings(prev => ({ ...prev, logo_url: publicUrl, logo_path: path }));
      showToast('Logo mis à jour !');
    } catch (err: any) {
      console.error('Error uploading logo:', err);
      showToast('Erreur upload: ' + err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const deleteLogo = async () => {
    if (!settings.logo_path) return;
    if (!clubId) { showToast('Club non identifié.', 'error'); return; }

    const { error: storageError } = await supabase.storage
      .from('club-assets')
      .remove([settings.logo_path]);

    if (storageError) {
      showToast('Erreur suppression: ' + storageError.message, 'error');
      return;
    }

    await supabase
      .from('club_settings')
      .upsert(
        { club_id: clubId, logo_url: null, logo_path: null, updated_at: new Date().toISOString() },
        { onConflict: 'club_id' }
      );

    setSettings(prev => ({ ...prev, logo_url: '', logo_path: '' }));
    showToast('Logo supprimé !');
  };

  const inscriptionUrl = settings.inscription_slug
    ? `${window.location.origin}/inscription/${settings.inscription_slug}`
    : '';

  const handleCopyUrl = async () => {
    if (!inscriptionUrl) return;
    try {
      await navigator.clipboard.writeText(inscriptionUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Impossible de copier le lien', 'error');
    }
  };

  const saveSlug = async (newSlug: string): Promise<{ ok: boolean; error?: string }> => {
    if (!clubId) return { ok: false, error: 'Club non identifié.' };

    const { error } = await supabase
      .from('club_settings')
      .upsert(
        { club_id: clubId, inscription_slug: newSlug, updated_at: new Date().toISOString() },
        { onConflict: 'club_id' }
      );

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  };

  const generateAndSaveSlug = async (): Promise<boolean> => {
    const base = slugifyClubName(settings.club_name);
    for (let i = 0; i < 3; i++) {
      const candidate = `${base}-${randomSuffix(7)}`;
      const result = await saveSlug(candidate);
      if (result.ok) {
        setSettings(prev => ({ ...prev, inscription_slug: candidate }));
        return true;
      }
      const msg = (result.error || '').toLowerCase();
      if (!msg.includes('unique') && !msg.includes('duplicate')) {
        showToast('Erreur: ' + result.error, 'error');
        return false;
      }
    }
    showToast('Impossible de générer un lien unique. Réessayez.', 'error');
    return false;
  };

  const handleGenerateSlug = async () => {
    setRegenerating(true);
    const ok = await generateAndSaveSlug();
    setRegenerating(false);
    if (ok) showToast('Lien généré !');
  };

  const handleRegenerateConfirm = async () => {
    setRegenerating(true);
    const ok = await generateAndSaveSlug();
    setRegenerating(false);
    setConfirmRegenOpen(false);
    if (ok) showToast('Nouveau lien généré');
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Chargement...</div>;
  }

  return (
    <div style={{ padding: '32px', maxWidth: '1200px', margin: '0 auto' }}>
      {toast && (
        <div style={{
          position: 'fixed', top: '24px', right: '24px',
          background: toast.type === 'success' ? 'var(--success)' : 'var(--danger)',
          color: 'var(--text-inverse)', padding: '12px 20px', borderRadius: '8px',
          boxShadow: 'var(--shadow)', zIndex: 1000, fontWeight: '500'
        }}>
          {toast.message}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 className="text-2xl font-bold" style={{ marginBottom: '8px', color: 'var(--text-primary)' }}>Paramètres</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Configuration du club</p>
        </div>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={saving}
          leftIcon={<Save className="w-4 h-4" />}
        >
          {saving ? 'Sauvegarde...' : 'Sauvegarder'}
        </Button>
      </div>

      <Tabs
        items={TABS.map(t => ({ key: t.key, label: t.label }))}
        value={activeTab}
        onChange={(id) => handleTabChange(id as TabKey)}
        className="mb-6"
      />

      <div style={{ display: activeTab === 'informations' ? 'block' : 'none' }}>
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '32px', border: '1px solid var(--border-color)' }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: '600', marginBottom: '24px' }}>
            Informations du club
          </h3>

          <div style={{ maxWidth: '600px', display: 'grid', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>Nom du club</label>
              <input
                type="text"
                value={settings.club_name}
                onChange={(e) => handleInputChange('club_name', e.target.value)}
                style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text-primary)', fontSize: '14px' }}
                placeholder="Nom du club"
              />
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 3 }}>
                <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>Rue</label>
                <input
                  type="text"
                  value={settings.club_address}
                  onChange={(e) => handleInputChange('club_address', e.target.value)}
                  style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text-primary)', fontSize: '14px' }}
                  placeholder="Route de Lausanne"
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>N°</label>
                <input
                  type="text"
                  value={settings.club_street_number}
                  onChange={(e) => handleInputChange('club_street_number', e.target.value)}
                  style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text-primary)', fontSize: '14px' }}
                  placeholder="12"
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>NPA</label>
                <input
                  type="text"
                  value={settings.club_postal_code}
                  onChange={(e) => handleInputChange('club_postal_code', e.target.value)}
                  style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text-primary)', fontSize: '14px' }}
                  placeholder="1032"
                />
              </div>
              <div style={{ flex: 3 }}>
                <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>Ville</label>
                <input
                  type="text"
                  value={settings.club_city}
                  onChange={(e) => handleInputChange('club_city', e.target.value)}
                  style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text-primary)', fontSize: '14px' }}
                  placeholder="Ville"
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>Email</label>
              <input
                type="email"
                value={settings.club_email}
                onChange={(e) => handleInputChange('club_email', e.target.value)}
                style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text-primary)', fontSize: '14px' }}
                placeholder="info@monclub.ch"
              />
            </div>

            <div>
              <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>Téléphone</label>
              <PhoneInput
                value={settings.club_phone}
                onChange={(v) => handleInputChange('club_phone', v)}
              />
            </div>

            <div>
              <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>Site web</label>
              <input
                type="url"
                value={settings.club_website}
                onChange={(e) => handleInputChange('club_website', e.target.value)}
                style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text-primary)', fontSize: '14px' }}
                placeholder="www.monclub.ch"
              />
            </div>

            <div>
              <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>Boutique du club (URL)</label>
              <input
                type="url"
                value={settings.shop_url}
                onChange={(e) => handleInputChange('shop_url', e.target.value)}
                style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text-primary)', fontSize: '14px' }}
                placeholder="https://shop.monclub.ch"
              />
              <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '6px', lineHeight: 1.5 }}>
                Lien vers la boutique de votre club chez un prestataire externe. Laissez vide pour masquer l'entrée Boutique.
              </p>
            </div>

            <div>
              <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>Numéro ASF du club</label>
              <input
                type="text"
                value={settings.club_asf_number}
                onChange={(e) => handleInputChange('club_asf_number', e.target.value.replace(/\D/g, '').slice(0, 10))}
                style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text-primary)', fontSize: '14px' }}
                placeholder="Ex : 12345"
              />
              <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '6px', lineHeight: 1.5 }}>
                Numéro officiel attribué par l'Association Suisse de Football. Requis pour le module Groupements.
              </p>
            </div>

            <div>
              <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>Nom du cercle de donateurs</label>
              <input
                type="text"
                value={settings.confrerie_label}
                onChange={(e) => handleInputChange('confrerie_label', e.target.value)}
                style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text-primary)', fontSize: '14px' }}
                placeholder="Ex : Confrérie, Club des 500"
              />
              <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '6px', lineHeight: 1.5 }}>
                Nom affiché dans l'annuaire et sur les factures du cercle de donateurs.
              </p>
            </div>

            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderTop: '1px solid var(--border-color)', marginTop: '8px' }}>
              <div>
                <label style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600 }}>
                  Afficher les coordonnées du {settings.confrerie_label || 'Club des 500'} aux membres du cercle
                </label>
                <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px', lineHeight: 1.5, maxWidth: '480px' }}>
                  Par défaut, seuls l'administration et le comité voient l'e-mail et le téléphone des membres du {settings.confrerie_label || 'Club des 500'}. Activez pour que les membres du cercle voient aussi ces coordonnées.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.confrerie_contacts_visible_to_members}
                onClick={() => handleInputChange('confrerie_contacts_visible_to_members', !settings.confrerie_contacts_visible_to_members)}
                style={{
                  width: '46px', height: '26px', borderRadius: '13px', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0,
                  background: settings.confrerie_contacts_visible_to_members ? 'var(--success)' : 'var(--border-color)', transition: 'background 0.2s'
                }}
              >
                <span style={{
                  position: 'absolute', top: '3px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
                  left: settings.confrerie_contacts_visible_to_members ? '23px' : '3px'
                }} />
              </button>
            </div>

            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderTop: '1px solid var(--border-color)', marginTop: '8px' }}>
              <div>
                <label style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600 }}>
                  Utiliser le mode pluie
                </label>
                <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px', lineHeight: 1.5, maxWidth: '480px' }}>
                  Permet au comité de basculer tous les entraînements du jour sur leur plan pluie (lieu et horaire de repli définis sur chaque créneau) et d'en avertir joueurs et parents.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.rain_mode_enabled}
                onClick={() => handleInputChange('rain_mode_enabled', !settings.rain_mode_enabled)}
                style={{
                  width: '46px', height: '26px', borderRadius: '13px', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0,
                  background: settings.rain_mode_enabled ? 'var(--success)' : 'var(--border-color)', transition: 'background 0.2s'
                }}
              >
                <span style={{
                  position: 'absolute', top: '3px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
                  left: settings.rain_mode_enabled ? '23px' : '3px'
                }} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: activeTab === 'emails' ? 'block' : 'none' }}>
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '32px', border: '1px solid var(--border-color)' }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: 600, marginBottom: '6px' }}>
            Configuration des emails sortants
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '24px' }}>
            Adresse utilisée comme expéditeur pour tous les emails du club
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', maxWidth: '800px' }}>
            <div>
              <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Nom expéditeur *</label>
              <input
                type="text"
                value={settings.sender_name}
                onChange={(e) => handleInputChange('sender_name', e.target.value)}
                style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text-primary)', fontSize: '14px' }}
                placeholder={settings.club_name || 'Nom du club'}
              />
            </div>

            <div>
              <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Adresse email expéditeur *</label>
              <input
                type="email"
                value={settings.sender_email}
                onChange={(e) => handleInputChange('sender_email', e.target.value)}
                style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text-primary)', fontSize: '14px' }}
                placeholder="noreply@clubsphere.ch"
              />
              <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '6px', lineHeight: 1.5 }}>
                Cette adresse doit être vérifiée dans Resend avant utilisation. Contactez l'administrateur ClubSphère pour la configuration.
              </p>
            </div>
          </div>

          {/* Mode essai */}
          <div style={{ marginTop: '32px', borderTop: '1px solid var(--border-color)', paddingTop: '24px' }}>
            <h4 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
              Mode essai
            </h4>

            {settings.email_redirect_address.trim() && (
              <div style={{ marginBottom: '16px' }}>
                <Alert
                  variant="warning"
                  action={
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={async () => {
                        const { error } = await supabase
                          .from('club_settings')
                          .update({ email_redirect_address: null })
                          .eq('club_id', clubId);
                        if (error) {
                          showToast('Erreur: ' + error.message, 'error');
                        } else {
                          handleInputChange('email_redirect_address', '');
                          showToast('Mode essai désactivé — les emails partiront aux vrais destinataires');
                        }
                      }}
                    >
                      Désactiver
                    </Button>
                  }
                >
                  Mode essai actif — tous les emails du club sont redirigés vers {settings.email_redirect_address.trim()}
                </Alert>
              </div>
            )}

            <div>
              <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                Rediriger tous les emails vers
              </label>
              <input
                type="email"
                value={settings.email_redirect_address}
                onChange={(e) => handleInputChange('email_redirect_address', e.target.value)}
                style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text-primary)', fontSize: '14px' }}
                placeholder="adresse@exemple.ch"
              />
              <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '6px', lineHeight: 1.5 }}>
                Tant que cette adresse est renseignée, AUCUN email ne part aux vrais destinataires : tout est redirigé ici avec le préfixe [ESSAI]. Laissez vide pour l'envoi normal. Idéal pendant votre période d'essai.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: activeTab === 'logo' ? 'block' : 'none' }}>
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '32px', border: '1px solid var(--border-color)' }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: '600', marginBottom: '24px' }}>
            Logo du club
          </h3>

          <div style={{ maxWidth: '600px' }}>
            {settings.logo_url && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '16px', display: 'inline-block', marginBottom: '10px' }}>
                  <img src={settings.logo_url} alt="Logo du club" style={{ maxHeight: '80px', maxWidth: '200px', objectFit: 'contain' }} />
                </div>
                <div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={deleteLogo}
                  >
                    Supprimer le logo
                  </Button>
                </div>
              </div>
            )}

            <div
              onDrop={handleLogoDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => logoInputRef.current?.click()}
              style={{ border: '2px dashed var(--border-color)', borderRadius: '10px', padding: '32px', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.2s' }}
            >
              <div style={{ color: 'var(--text-primary)', fontWeight: '600', marginBottom: '4px' }}>
                Glisser-déposer ou cliquer pour choisir
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                PNG ou JPG — fond blanc recommandé — max 2MB
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept=".png,.jpg,.jpeg"
                style={{ display: 'none' }}
                onChange={handleLogoChange}
              />
            </div>

            {uploading && (
              <div style={{ marginTop: '12px', background: 'var(--info-soft)', borderRadius: '8px', padding: '10px 16px', color: 'var(--info-text)', fontSize: '13px' }}>
                Upload en cours...
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: activeTab === 'inscriptions' ? 'block' : 'none' }}>
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '32px', border: '1px solid var(--border-color)' }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: 600, marginBottom: '6px' }}>
            Inscription publique des nouveaux joueurs
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '24px', lineHeight: 1.6, maxWidth: '760px' }}>
            Ce lien permet à de nouveaux joueurs (ou à leurs parents) de soumettre une demande d'inscription au club via un formulaire public. Copiez ce lien et publiez-le sur le site web du club, par email aux familles intéressées, ou sur les réseaux sociaux. Les demandes reçues apparaîtront dans le module Inscriptions.
          </p>

          {settings.inscription_slug ? (
            <>
              <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                Lien public d'inscription
              </label>
              <div style={{ display: 'flex', gap: '8px', maxWidth: '760px', alignItems: 'stretch' }}>
                <input
                  type="text"
                  value={inscriptionUrl}
                  readOnly
                  onFocus={(e) => e.currentTarget.select()}
                  style={{ flex: 1, background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                />
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  style={{
                    background: copied ? 'var(--success)' : 'var(--accent)',
                    color: 'var(--text-inverse)', border: 'none', borderRadius: '8px',
                    padding: '10px 16px', fontSize: '14px', fontWeight: 600,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                    transition: 'background 0.2s', whiteSpace: 'nowrap'
                  }}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copié !' : 'Copier le lien'}
                </button>
              </div>

              <div style={{ marginTop: '24px' }}>
                <button
                  type="button"
                  onClick={() => setConfirmRegenOpen(true)}
                  disabled={regenerating}
                  style={{
                    background: 'var(--warning-soft)', color: 'var(--warning-text)',
                    border: '1px solid var(--warning)', borderRadius: '8px',
                    padding: '8px 14px', fontSize: '13px', fontWeight: 600,
                    cursor: regenerating ? 'not-allowed' : 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    opacity: regenerating ? 0.6 : 1
                  }}
                >
                  <AlertTriangle className="w-4 h-4" />
                  Régénérer le lien
                </button>
                <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '8px', lineHeight: 1.5, maxWidth: '760px' }}>
                  Régénérer un lien invalide immédiatement l'ancien. Utile si le lien a fuité ou est devenu public par erreur.
                </p>
              </div>
            </>
          ) : (
            <div style={{ maxWidth: '760px' }}>
              <div style={{ background: 'var(--warning-soft)', border: '1px solid var(--warning)', borderRadius: '8px', padding: '16px', marginBottom: '16px', color: 'var(--warning-text)', fontSize: '14px' }}>
                Aucun lien généré — Générez un lien pour activer l'inscription publique.
              </div>
              <Button
                variant="primary"
                type="button"
                onClick={handleGenerateSlug}
                disabled={regenerating}
                leftIcon={<RefreshCw className="w-4 h-4" />}
              >
                Générer un lien
              </Button>
            </div>
          )}

          <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--border-color)' }}>
            <h3 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: 600, marginBottom: '6px' }}>
              Email envoyé aux familles quand une catégorie est complète
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px', lineHeight: 1.5, maxWidth: '760px' }}>
              Choisissez le type d'email envoyé automatiquement lorsqu'une demande d'inscription concerne une catégorie dont toutes les places sont prises.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '760px' }}>
              {[
                { value: 'waitlist' as const, label: "Email de mise en liste d'attente", helper: "La famille est informée que la demande est placée en liste d'attente." },
                { value: 'welcome' as const, label: 'Email de confirmation standard', helper: "La famille reçoit la confirmation habituelle, sans mention de liste d'attente. La demande reste en liste d'attente côté club et le comité reste averti." },
              ].map(opt => (
                <label
                  key={opt.value}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '12px',
                    padding: '14px 16px', borderRadius: '10px', cursor: 'pointer',
                    background: settings.waitlist_email_mode === opt.value ? 'var(--accent-soft, rgba(0,120,255,0.06))' : 'var(--input-bg)',
                    border: `1.5px solid ${settings.waitlist_email_mode === opt.value ? 'var(--accent)' : 'var(--border-color)'}`,
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  <input
                    type="radio"
                    name="waitlist_email_mode"
                    value={opt.value}
                    checked={settings.waitlist_email_mode === opt.value}
                    onChange={() => {
                      setSettings(prev => ({ ...prev, waitlist_email_mode: opt.value }));
                      if (clubId) {
                        supabase.from('club_settings').upsert({ club_id: clubId, waitlist_email_mode: opt.value, updated_at: new Date().toISOString() }, { onConflict: 'club_id' }).then(({ error }) => {
                          if (error) showToast('Erreur: ' + error.message, 'error');
                          else showToast('Préférence sauvegardée !');
                        });
                      }
                    }}
                    style={{ marginTop: '3px', accentColor: 'var(--accent)', width: '16px', height: '16px', flexShrink: 0 }}
                  />
                  <div>
                    <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 500 }}>{opt.label}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.5, marginTop: '2px' }}>{opt.helper}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: activeTab === 'finances' ? 'block' : 'none' }}>
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '32px', border: '1px solid var(--border-color)' }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
            Module Facturation des cotisations
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.5, marginBottom: '24px', maxWidth: 640 }}>
            Désactivez cette option si votre club utilise un produit tiers pour la facturation des cotisations.
            Le module Finances (tableau de bord, factures, configuration, saisons, cotisations) sera masqué.
            Le module Sponsors reste accessible.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16, background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: 10, maxWidth: 640 }}>
            <button
              type="button"
              role="switch"
              aria-checked={financeEnabled}
              disabled={financeSaving}
              onClick={() => handleToggleFinanceModule(!financeEnabled)}
              style={{
                position: 'relative',
                width: 46, height: 26, borderRadius: 999,
                background: financeEnabled ? 'var(--success)' : 'var(--text-muted)',
                border: 'none', cursor: financeSaving ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s',
                flexShrink: 0,
                opacity: financeSaving ? 0.7 : 1,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 3, left: financeEnabled ? 23 : 3,
                  width: 20, height: 20, borderRadius: '50%',
                  background: 'var(--text-inverse)', transition: 'left 0.2s',
                  boxShadow: 'var(--shadow-sm)',
                }}
              />
            </button>
            <div style={{ flex: 1 }}>
              <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 }}>
                Utiliser le module Facturation des cotisations
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>
                {financeEnabled ? 'Le module est actuellement actif.' : 'Le module est actuellement désactivé.'}
              </div>
            </div>
            {financeSavedAt !== null && (
              <span style={{ color: 'var(--success)', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Check className="w-4 h-4" /> Enregistré
              </span>
            )}
          </div>

          {!financeEnabled && (
            <div style={{
              marginTop: 16, maxWidth: 640,
              background: 'var(--warning-soft)', border: '1px solid var(--warning)',
              borderRadius: 10, padding: 14, color: 'var(--warning-text)', fontSize: 13, lineHeight: 1.5,
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <AlertTriangle className="w-5 h-5" style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                <strong>Attention :</strong> le module Facturation des cotisations est désactivé. Aucune
                facture ne sera générée. Le module Sponsors reste accessible.
              </span>
            </div>
          )}
        </div>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px', marginTop: '32px', maxWidth: '700px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px' }}>
          Gestion du site internet
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px', lineHeight: 1.5, maxWidth: 640 }}>
          Active les options de publication sur le site internet du club (menu Site internet, cases « Publier sur le site », effectifs et photos d'équipe).
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16, background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: 10, maxWidth: 640 }}>
          <button
            type="button"
            role="switch"
            aria-checked={websiteEnabled}
            disabled={websiteSaving}
            onClick={() => {
              if (websiteEnabled) {
                setWebsiteConfirmOpen(true);
              } else {
                handleToggleWebsiteModule(true);
              }
            }}
            style={{
              position: 'relative',
              width: 46, height: 26, borderRadius: 999,
              background: websiteEnabled ? 'var(--success)' : 'var(--text-muted)',
              border: 'none', cursor: websiteSaving ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
              flexShrink: 0,
              opacity: websiteSaving ? 0.7 : 1,
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 3, left: websiteEnabled ? 23 : 3,
                width: 20, height: 20, borderRadius: '50%',
                background: 'var(--text-inverse)', transition: 'left 0.2s',
                boxShadow: 'var(--shadow-sm)',
              }}
            />
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 }}>
              Gestion du site internet
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>
              {websiteEnabled ? 'La gestion du site est actuellement active.' : 'La gestion du site est actuellement désactivée.'}
            </div>
          </div>
          {websiteSavedAt !== null && (
            <span style={{ color: 'var(--success)', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Check className="w-4 h-4" /> Enregistré
            </span>
          )}
        </div>
      </div>

      {websiteConfirmOpen && (
        <ConfirmModal
          isOpen={websiteConfirmOpen}
          title="Désactiver la gestion du site internet ?"
          message="Le site du club ne recevra plus aucune information. Vos choix de publication sont conservés et reviendront si vous réactivez la gestion du site."
          confirmLabel="Désactiver"
          cancelLabel="Annuler"
          onConfirm={() => { setWebsiteConfirmOpen(false); handleToggleWebsiteModule(false); }}
          onCancel={() => setWebsiteConfirmOpen(false)}
        />
      )}

      {/* Entraînements settings — after finances, before event_types */}
      <div style={{ display: activeTab === 'inscriptions' ? 'block' : 'none', marginTop: '24px' }}>
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '32px', border: '1px solid var(--border-color)' }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
            Présences aux entraînements et aux matchs
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.5, marginBottom: '24px', maxWidth: 640 }}>
            Configurez le comportement par défaut pour les présences aux entraînements et aux matchs.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16, background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: 10, maxWidth: 640 }}>
            <button
              type="button"
              role="switch"
              aria-checked={attendanceDefaultPresent}
              disabled={attendanceSaving}
              onClick={() => handleToggleAttendanceDefault(!attendanceDefaultPresent)}
              style={{
                position: 'relative',
                width: 46, height: 26, borderRadius: 999,
                background: attendanceDefaultPresent ? 'var(--success)' : 'var(--text-muted)',
                border: 'none', cursor: attendanceSaving ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s',
                flexShrink: 0,
                opacity: attendanceSaving ? 0.7 : 1,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 3, left: attendanceDefaultPresent ? 23 : 3,
                  width: 20, height: 20, borderRadius: '50%',
                  background: 'var(--text-inverse)', transition: 'left 0.2s',
                  boxShadow: 'var(--shadow-sm)',
                }}
              />
            </button>
            <div style={{ flex: 1 }}>
              <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 }}>
                Présents par défaut aux entraînements et aux matchs
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2, lineHeight: 1.4 }}>
                Si activé, les membres sont considérés comme présents aux entraînements, et les joueurs convoqués comme présents aux matchs : les familles ne signalent que les absences (excuse à l'entraînement, désistement à la convocation). Si désactivé, seules les présences confirmées comptent.
              </div>
            </div>
            {attendanceSavedAt !== null && (
              <span style={{ color: 'var(--success)', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Check className="w-4 h-4" /> Enregistré
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Types d'événements tab */}
      <div style={{ display: activeTab === 'event_types' ? 'block' : 'none' }}>
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '32px', border: '1px solid var(--border-color)' }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>
            Types d'événements
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '24px' }}>
            Gérez les types disponibles lors de la création d'événements. Renommer un type ne modifie pas les événements existants.
          </p>

          {/* Add new type */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', maxWidth: '500px' }}>
            <input
              type="text"
              value={etNewName}
              onChange={(e) => setEtNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEventType(); } }}
              placeholder="Nouveau type..."
              style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', fontSize: '14px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
            />
            <Button size="sm" onClick={addEventType} disabled={!etNewName.trim() || etAdding}>
              <Plus size={16} /> Ajouter
            </Button>
          </div>

          {/* List */}
          {etLoading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Chargement...</p>
          ) : eventTypes.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Aucun type configuré.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '600px' }}>
              {eventTypes.map((et, idx) => (
                <div key={et.id} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 14px', borderRadius: '8px',
                  background: et.active ? 'var(--bg-input)' : 'var(--bg-hover)',
                  border: '1px solid var(--border-color)',
                  opacity: et.active ? 1 : 0.6,
                }}>
                  {/* Order arrows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <button
                      onClick={() => moveEventType(et.id, 'up')}
                      disabled={idx === 0}
                      style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', opacity: idx === 0 ? 0.3 : 1, padding: 0, lineHeight: 1 }}
                    >
                      <ChevronUp size={14} color="var(--text-muted)" />
                    </button>
                    <button
                      onClick={() => moveEventType(et.id, 'down')}
                      disabled={idx === eventTypes.length - 1}
                      style={{ background: 'none', border: 'none', cursor: idx === eventTypes.length - 1 ? 'default' : 'pointer', opacity: idx === eventTypes.length - 1 ? 0.3 : 1, padding: 0, lineHeight: 1 }}
                    >
                      <ChevronDown size={14} color="var(--text-muted)" />
                    </button>
                  </div>

                  {/* Name or edit */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {etEditing === et.id ? (
                      <form onSubmit={(e) => { e.preventDefault(); renameEventType(et.id); }} style={{ display: 'flex', gap: '6px' }}>
                        <input
                          autoFocus
                          value={etEditName}
                          onChange={(e) => setEtEditName(e.target.value)}
                          style={{ flex: 1, padding: '4px 8px', borderRadius: '6px', fontSize: '14px', background: 'var(--bg-input)', border: '1px solid var(--accent)', color: 'var(--text-primary)' }}
                        />
                        <Button size="sm" type="submit" disabled={!etEditName.trim()}>OK</Button>
                        <button type="button" onClick={() => setEtEditing(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '13px' }}>Annuler</button>
                      </form>
                    ) : (
                      <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{et.name}</span>
                    )}
                  </div>

                  {/* Status */}
                  <StatusPill variant={et.active ? 'green' : 'neutral'}>{et.active ? 'Actif' : 'Inactif'}</StatusPill>

                  {/* Actions */}
                  {etEditing !== et.id && (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => { setEtEditing(et.id); setEtEditName(et.name); }}
                        title="Renommer"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                      >
                        <Pencil size={14} color="var(--text-muted)" />
                      </button>
                      <button
                        onClick={() => toggleEventTypeActive(et.id, et.active)}
                        title={et.active ? 'Désactiver' : 'Réactiver'}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', fontSize: '12px', color: et.active ? 'var(--danger)' : 'var(--success)' }}
                      >
                        {et.active ? 'Désactiver' : 'Réactiver'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Types d'actualité tab */}
      <div style={{ display: activeTab === 'news_categories' ? 'block' : 'none' }}>
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '32px', border: '1px solid var(--border-color)' }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>
            Types d'actualité
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '24px' }}>
            Gérez les types disponibles lors de la création d'articles. Le renommage ne modifie pas les articles existants.
          </p>

          {/* Add new type */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', maxWidth: '500px' }}>
            <input
              type="text"
              value={ncNewName}
              onChange={(e) => setNcNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNewsCategory(); } }}
              placeholder="Nouveau type..."
              style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', fontSize: '14px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
            />
            <Button size="sm" onClick={addNewsCategory} disabled={!ncNewName.trim() || ncAdding}>
              <Plus size={16} /> Ajouter
            </Button>
          </div>

          {/* List */}
          {ncLoading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Chargement...</p>
          ) : newsCategories.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Aucun type configuré.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '600px' }}>
              {newsCategories.map((nc, idx) => (
                <div key={nc.id} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 14px', borderRadius: '8px',
                  background: nc.active ? 'var(--bg-input)' : 'var(--bg-hover)',
                  border: '1px solid var(--border-color)',
                  opacity: nc.active ? 1 : 0.6,
                }}>
                  {/* Order arrows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <button
                      onClick={() => moveNewsCategory(nc.id, 'up')}
                      disabled={idx === 0}
                      style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', opacity: idx === 0 ? 0.3 : 1, padding: 0, lineHeight: 1 }}
                    >
                      <ChevronUp size={14} color="var(--text-muted)" />
                    </button>
                    <button
                      onClick={() => moveNewsCategory(nc.id, 'down')}
                      disabled={idx === newsCategories.length - 1}
                      style={{ background: 'none', border: 'none', cursor: idx === newsCategories.length - 1 ? 'default' : 'pointer', opacity: idx === newsCategories.length - 1 ? 0.3 : 1, padding: 0, lineHeight: 1 }}
                    >
                      <ChevronDown size={14} color="var(--text-muted)" />
                    </button>
                  </div>

                  {/* Name or edit */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {ncEditing === nc.id ? (
                      <form onSubmit={(e) => { e.preventDefault(); renameNewsCategory(nc.id); }} style={{ display: 'flex', gap: '6px' }}>
                        <input
                          autoFocus
                          value={ncEditName}
                          onChange={(e) => setNcEditName(e.target.value)}
                          style={{ flex: 1, padding: '4px 8px', borderRadius: '6px', fontSize: '14px', background: 'var(--bg-input)', border: '1px solid var(--accent)', color: 'var(--text-primary)' }}
                        />
                        <Button size="sm" type="submit" disabled={!ncEditName.trim()}>OK</Button>
                        <button type="button" onClick={() => setNcEditing(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '13px' }}>Annuler</button>
                      </form>
                    ) : (
                      <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{nc.name}</span>
                    )}
                  </div>

                  {/* Status */}
                  <StatusPill variant={nc.active ? 'green' : 'neutral'}>{nc.active ? 'Actif' : 'Inactif'}</StatusPill>

                  {/* Actions */}
                  {ncEditing !== nc.id && (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => { setNcEditing(nc.id); setNcEditName(nc.name); }}
                        title="Renommer"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                      >
                        <Pencil size={14} color="var(--text-muted)" />
                      </button>
                      <button
                        onClick={() => toggleNewsCategoryActive(nc.id, nc.active)}
                        title={nc.active ? 'Désactiver' : 'Réactiver'}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', fontSize: '12px', color: nc.active ? 'var(--danger)' : 'var(--success)' }}
                      >
                        {nc.active ? 'Désactiver' : 'Réactiver'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ========= POSTES TAB ========= */}
      <div style={{ display: activeTab === 'postes' ? 'block' : 'none' }}>
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '32px', border: '1px solid var(--border-color)' }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>
            Postes &amp; Fonctions
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '24px', lineHeight: 1.5 }}>
            Ces postes sont proposés lors de la création d'un membre du comité ou d'une fonction du club. La préliste correspond aux fonctions types de l'ASF — adaptez-la librement.
          </p>

          <div style={{ marginBottom: '24px' }}>
            <Button size="sm" onClick={openPosAdd}>
              <Plus size={16} /> Ajouter un poste
            </Button>
          </div>

          {posLoading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Chargement...</p>
          ) : positions.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Aucun poste configuré.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {positions.map((pos, idx) => (
                <div key={pos.id} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 14px', borderRadius: '8px',
                  background: pos.active ? 'var(--bg-input)' : 'var(--bg-hover)',
                  border: '1px solid var(--border-color)',
                  opacity: pos.active ? 1 : 0.6,
                }}>
                  {/* Order arrows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <button
                      onClick={() => movePosition(pos.id, 'up')}
                      disabled={idx === 0}
                      style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', opacity: idx === 0 ? 0.3 : 1, padding: 0, lineHeight: 1 }}
                    >
                      <ChevronUp size={14} color="var(--text-muted)" />
                    </button>
                    <button
                      onClick={() => movePosition(pos.id, 'down')}
                      disabled={idx === positions.length - 1}
                      style={{ background: 'none', border: 'none', cursor: idx === positions.length - 1 ? 'default' : 'pointer', opacity: idx === positions.length - 1 ? 0.3 : 1, padding: 0, lineHeight: 1 }}
                    >
                      <ChevronDown size={14} color="var(--text-muted)" />
                    </button>
                  </div>

                  {/* Name + description excerpt */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{pos.name}</span>
                    {pos.description && (
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {pos.description}
                      </p>
                    )}
                  </div>

                  {/* Badge */}
                  <span style={{
                    fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '9999px',
                    background: pos.default_is_committee ? 'var(--info-soft)' : 'var(--bg-hover)',
                    color: pos.default_is_committee ? 'var(--info-text)' : 'var(--text-muted)',
                    whiteSpace: 'nowrap',
                  }}>
                    {pos.default_is_committee ? 'Comité' : 'Opérationnel'}
                  </span>

                  {/* Active toggle */}
                  <button
                    onClick={() => togglePositionActive(pos.id, pos.active)}
                    title={pos.active ? 'Désactiver' : 'Réactiver'}
                    style={{
                      background: pos.active ? 'var(--success)' : 'var(--border-color)',
                      border: 'none', borderRadius: '9999px', width: '36px', height: '20px',
                      position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: '2px',
                      left: pos.active ? '18px' : '2px',
                      width: '16px', height: '16px', borderRadius: '50%',
                      background: 'var(--text-inverse)', transition: 'left 0.2s',
                    }} />
                  </button>

                  {/* Edit / Delete */}
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={() => openPosEdit(pos)}
                      title="Modifier"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                    >
                      <Pencil size={14} color="var(--text-muted)" />
                    </button>
                    <button
                      onClick={() => setPosDeleteConfirm(pos)}
                      title="Supprimer"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                    >
                      <Trash2 size={14} color="var(--danger)" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Position edit modal */}
      {posModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
        }} onClick={() => setPosModalOpen(false)}>
          <div style={{
            background: 'var(--card-bg)', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '460px',
            border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-lg)',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: 600, margin: 0 }}>
                {posEditing ? 'Modifier le poste' : 'Ajouter un poste'}
              </h3>
              <button onClick={() => setPosModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <X size={18} color="var(--text-muted)" />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Nom <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  value={posForm.name}
                  onChange={(e) => setPosForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ex : Responsable technique"
                  autoFocus
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '14px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Description
                </label>
                <textarea
                  value={posForm.description}
                  onChange={(e) => setPosForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Description optionnelle du rôle..."
                  rows={3}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '14px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setPosForm(f => ({ ...f, default_is_committee: !f.default_is_committee }))}
                  style={{
                    background: posForm.default_is_committee ? 'var(--accent)' : 'var(--border-color)',
                    border: 'none', borderRadius: '9999px', width: '40px', height: '22px',
                    position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
                  }}
                >
                  <span style={{
                    position: 'absolute', top: '2px',
                    left: posForm.default_is_committee ? '20px' : '2px',
                    width: '18px', height: '18px', borderRadius: '50%',
                    background: 'var(--text-inverse)', transition: 'left 0.2s',
                  }} />
                </button>
                <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Position au comité par défaut</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
              <button
                onClick={() => setPosModalOpen(false)}
                style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '14px', background: 'var(--bg-hover)', border: '1px solid var(--border-color)', cursor: 'pointer', color: 'var(--text-primary)' }}
              >
                Annuler
              </button>
              <Button size="sm" onClick={savePosition} disabled={!posForm.name.trim() || posSaving}>
                {posSaving ? 'Enregistrement...' : posEditing ? 'Mettre à jour' : 'Ajouter'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========= PRESTATIONS SPONSORING TAB ========= */}
      <div style={{ display: activeTab === 'prestations' ? 'block' : 'none' }}>
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '32px', border: '1px solid var(--border-color)' }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>
            Grille de prestations sponsoring
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '24px', lineHeight: 1.5 }}>
            Ces prestations servent à composer les contrats de sponsoring (packages, panneaux, livret, textile…). Le tarif de grille est une valeur indicative, modifiable contrat par contrat.
          </p>

          <div style={{ marginBottom: '24px' }}>
            <Button size="sm" onClick={openPrAdd}>
              <Plus size={16} /> Ajouter une prestation
            </Button>
          </div>

          {prLoading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Chargement...</p>
          ) : prestations.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Aucune prestation configurée.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {prestations.map((pr, idx) => (
                <div key={pr.id} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 14px', borderRadius: '8px',
                  background: pr.active ? 'var(--bg-input)' : 'var(--bg-hover)',
                  border: '1px solid var(--border-color)',
                  opacity: pr.active ? 1 : 0.6,
                }}>
                  {/* Order arrows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <button
                      onClick={() => movePrestation(pr.id, 'up')}
                      disabled={idx === 0}
                      style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', opacity: idx === 0 ? 0.3 : 1, padding: 0, lineHeight: 1 }}
                    >
                      <ChevronUp size={14} color="var(--text-muted)" />
                    </button>
                    <button
                      onClick={() => movePrestation(pr.id, 'down')}
                      disabled={idx === prestations.length - 1}
                      style={{ background: 'none', border: 'none', cursor: idx === prestations.length - 1 ? 'default' : 'pointer', opacity: idx === prestations.length - 1 ? 0.3 : 1, padding: 0, lineHeight: 1 }}
                    >
                      <ChevronDown size={14} color="var(--text-muted)" />
                    </button>
                  </div>

                  {/* Name + category */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{pr.name}</span>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                      {PREST_CATEGORIES.find(c => c.value === pr.category)?.label || pr.category}
                    </p>
                  </div>

                  {/* Price */}
                  <span style={{
                    fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)',
                    minWidth: '80px', textAlign: 'right',
                  }}>
                    {pr.list_price != null ? `CHF ${Number(pr.list_price).toFixed(0)}` : '—'}
                  </span>

                  {/* Active toggle */}
                  <button
                    onClick={() => togglePrestationActive(pr.id, pr.active)}
                    title={pr.active ? 'Désactiver' : 'Réactiver'}
                    style={{
                      background: pr.active ? 'var(--success)' : 'var(--border-color)',
                      border: 'none', borderRadius: '9999px', width: '36px', height: '20px',
                      position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: '2px',
                      left: pr.active ? '18px' : '2px',
                      width: '16px', height: '16px', borderRadius: '50%',
                      background: 'var(--text-inverse)', transition: 'left 0.2s',
                    }} />
                  </button>

                  {/* Edit / Delete */}
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={() => openPrEdit(pr)}
                      title="Modifier"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                    >
                      <Pencil size={14} color="var(--text-muted)" />
                    </button>
                    <button
                      onClick={() => setPrDeleteConfirm(pr)}
                      title="Supprimer"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                    >
                      <Trash2 size={14} color="var(--danger)" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Prestation edit modal */}
      {prModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
        }} onClick={() => setPrModalOpen(false)}>
          <div style={{
            background: 'var(--card-bg)', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '460px',
            border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-lg)',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: 600, margin: 0 }}>
                {prEditing ? 'Modifier la prestation' : 'Ajouter une prestation'}
              </h3>
              <button onClick={() => setPrModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <X size={18} color="var(--text-muted)" />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Prestation <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  value={prForm.name}
                  onChange={(e) => setPrForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ex : Panneau 3 m double"
                  autoFocus
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '14px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Catégorie
                </label>
                <select
                  value={prForm.category}
                  onChange={(e) => setPrForm(f => ({ ...f, category: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '14px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                >
                  {PREST_CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Tarif de grille (CHF)
                </label>
                <input
                  type="number"
                  value={prForm.list_price}
                  onChange={(e) => setPrForm(f => ({ ...f, list_price: e.target.value }))}
                  placeholder="Laisser vide = libre"
                  min="0"
                  step="1"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '14px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Valeur indicative, modifiable contrat par contrat.</p>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
              <button
                onClick={() => setPrModalOpen(false)}
                style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '14px', background: 'var(--bg-hover)', border: '1px solid var(--border-color)', cursor: 'pointer', color: 'var(--text-primary)' }}
              >
                Annuler
              </button>
              <Button size="sm" onClick={savePrestation} disabled={!prForm.name.trim() || prSaving}>
                {prSaving ? 'Enregistrement...' : prEditing ? 'Mettre à jour' : 'Ajouter'}
              </Button>
            </div>
          </div>
        </div>
      )}


      {/* ASF Calendar Tab */}
      <div style={{ display: activeTab === 'asf_calendar' ? 'block' : 'none' }}>
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '32px', border: '1px solid var(--border-color)' }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>
            Calendrier ASF
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '24px', lineHeight: '1.5' }}>
            Collez l'URL complète du flux calendrier de votre club depuis le match center (format ICS). Les matchs de toutes vos équipes seront importés et mis à jour automatiquement deux fois par jour — les familles sont notifiées en cas de changement.
          </p>

          <Alert variant="danger" title="Avant d'activer la synchronisation" icon={<AlertTriangle size={18} />}>
            Chaque changement détecté (heure, date, terrain, annulation) déclenche une notification et un e-mail aux joueurs, parents et staff de l'équipe concernée. Configurez le calendrier ASF une fois que le club a planifié tous ses matchs à domicile dans le match center (horaires des juniors G, F, E et D notamment). Sinon, les membres recevront des dizaines de notifications au fil des ajustements.
          </Alert>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '24px', marginTop: '12px' }}>
            Synchronisation automatique deux fois par jour, à 07h30 et 16h30.
          </p>

          <div>
            <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
              URL du calendrier du match center (ACVF/ASF)
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-start' }}>
              <input
                type="url"
                value={asfCalendarUrl}
                onChange={(e) => setAsfCalendarUrl(e.target.value)}
                placeholder="https://matchcenter.afv.ch/..."
                style={{ flex: '1 1 280px', minWidth: 0, background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text-primary)', fontSize: '14px' }}
              />
              <Button
                size="sm"
                onClick={handleSaveAsfUrl}
                disabled={asfSaving || asfCalendarUrl.trim() === asfCalendarSaved}
              >
                {asfSaving ? 'Enregistrement...' : <><Save size={14} style={{ marginRight: '4px' }} /> Enregistrer</>}
              </Button>
            </div>
            {asfCalendarUrl.trim() && !/^https?:\/\/.+/i.test(asfCalendarUrl.trim()) && (
              <p style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '6px' }}>L'URL doit commencer par http:// ou https://</p>
            )}
          </div>

          <div style={{ marginTop: '20px' }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSyncNow}
              disabled={!asfCalendarSaved || asfSyncing}
            >
              {asfSyncing ? (
                <><RefreshCw size={14} className="animate-spin" style={{ marginRight: '6px' }} /> Synchronisation en cours...</>
              ) : (
                <><RefreshCw size={14} style={{ marginRight: '6px' }} /> Synchroniser maintenant</>
              )}
            </Button>
            {!asfCalendarSaved && (
              <span style={{ marginLeft: '12px', color: 'var(--text-muted)', fontSize: '12px' }}>Enregistrez une URL pour activer la synchronisation</span>
            )}
          </div>
        </div>

        {/* Sync Journal */}
        {asfSyncLog.length > 0 && (
          <div style={{ marginTop: '24px', background: 'var(--card-bg)', borderRadius: '12px', padding: '24px', border: '1px solid var(--border-color)' }}>
            <h4 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
              Journal de synchronisation
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {asfSyncLog.map((row) => {
                const isExpanded = asfLogExpanded === row.id;
                const dt = new Date(row.run_at);
                const dateStr = dt.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Zurich' });
                const timeStr = dt.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' });
                return (
                  <div key={row.id} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                    <button
                      onClick={() => setAsfLogExpanded(isExpanded ? null : row.id)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                        background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left'
                      }}
                    >
                      <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: '600', minWidth: '140px' }}>
                        {dateStr} {timeStr}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '12px', flex: 1 }}>
                        {row.events_total != null && `${row.events_total} évén.`}
                        {row.created ? ` · ${row.created} créés` : ''}
                        {row.updated ? ` · ${row.updated} MAJ` : ''}
                        {row.unchanged ? ` · ${row.unchanged} inch.` : ''}
                        {row.unmatched ? ` · ${row.unmatched} non app.` : ''}
                      </span>
                      {row.error && (
                        <span style={{
                          background: 'var(--danger-soft, #fee)', color: 'var(--danger-text, #c00)',
                          fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '99px'
                        }}>
                          ERREUR
                        </span>
                      )}
                      {isExpanded ? <ChevronUp size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />}
                    </button>

                    {isExpanded && (
                      <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border-color)' }}>
                        {row.error && (
                          <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', background: 'var(--danger-soft, #fee)', border: '1px solid var(--danger, #c00)' }}>
                            <p style={{ color: 'var(--danger-text, #c00)', fontSize: '13px', fontWeight: '600', margin: 0 }}>Erreur</p>
                            <p style={{ color: 'var(--danger-text, #c00)', fontSize: '12px', marginTop: '4px', margin: 0 }}>{row.error}</p>
                          </div>
                        )}

                        {row.unmatched_teams && row.unmatched_teams.length > 0 && (
                          <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', background: 'var(--warning-soft, #fff8e1)', border: '1px solid var(--warning, #f5a623)' }}>
                            <p style={{ color: 'var(--warning-text, #8a6d00)', fontSize: '13px', fontWeight: '600', margin: 0 }}>
                              Équipes non reconnues
                            </p>
                            <ul style={{ margin: '6px 0 0 16px', padding: 0, listStyleType: 'disc' }}>
                              {row.unmatched_teams.map((t: any, i: number) => (
                                <li key={i} style={{ color: 'var(--warning-text, #8a6d00)', fontSize: '12px', marginTop: '2px' }}>
                                  {t.label || t.name || JSON.stringify(t)}{t.count > 1 ? ` (${t.count} matchs)` : ''}
                                </li>
                              ))}
                            </ul>
                            <p style={{ color: 'var(--warning-text, #8a6d00)', fontSize: '11px', marginTop: '8px', margin: '8px 0 0', fontStyle: 'italic' }}>
                              Vérifiez que le nom de l'équipe dans ClubSphère est identique au calendrier ASF.
                            </p>
                          </div>
                        )}

                        {row.changes && row.changes.length > 0 && (
                          <div style={{ marginTop: '12px' }}>
                            <p style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>Modifications détectées</p>
                            <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                              <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: '600' }}>Équipe</th>
                                    <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: '600' }}>Champ</th>
                                    <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: '600' }}>Ancien</th>
                                    <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: '600' }}>Nouveau</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {row.changes.map((c: any, i: number) => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                      <td style={{ padding: '4px 8px', color: 'var(--text-primary)' }}>{c.team || '—'}</td>
                                      <td style={{ padding: '4px 8px', color: 'var(--text-secondary)' }}>
                                        {c.field === 'disparu_du_flux' ? <span style={{ color: 'var(--danger)' }}>Disparu du flux</span> : (c.field || '—')}
                                      </td>
                                      <td style={{ padding: '4px 8px', color: 'var(--text-muted)' }}>{c.old || '—'}</td>
                                      <td style={{ padding: '4px 8px', color: 'var(--text-primary)' }}>{c.new || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {!row.error && (!row.unmatched_teams || row.unmatched_teams.length === 0) && (!row.changes || row.changes.length === 0) && (
                          <p style={{ marginTop: '12px', color: 'var(--text-muted)', fontSize: '12px' }}>Aucun détail supplémentaire.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Prestation delete confirm */}
      <ConfirmModal
        isOpen={!!prDeleteConfirm}
        title="Supprimer cette prestation ?"
        message={<>Êtes-vous sûr de vouloir supprimer <strong>{prDeleteConfirm?.name}</strong> ? Cette action est irréversible.</>}
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        confirmStyle="danger"
        loading={prDeleting}
        loadingLabel="Suppression..."
        onConfirm={deletePrestation}
        onCancel={() => setPrDeleteConfirm(null)}
      />

      {/* Position delete confirm */}
      <ConfirmModal
        isOpen={!!posDeleteConfirm}
        title="Supprimer ce poste ?"
        message={<>Êtes-vous sûr de vouloir supprimer le poste <strong>{posDeleteConfirm?.name}</strong> ? Cette action est irréversible.</>}
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        confirmStyle="danger"
        loading={posDeleting}
        loadingLabel="Suppression..."
        onConfirm={deletePosition}
        onCancel={() => setPosDeleteConfirm(null)}
      />

      <ConfirmModal
        isOpen={confirmRegenOpen}
        title="Régénérer le lien d'inscription ?"
        message={
          <>
            Êtes-vous sûr de vouloir régénérer ce lien ? L'ancien lien ne fonctionnera plus.
            Vous devrez republier le nouveau lien partout où l'ancien était utilisé
            (site web, emails, réseaux sociaux).
          </>
        }
        confirmLabel="Régénérer"
        cancelLabel="Annuler"
        confirmStyle="warning"
        loading={regenerating}
        loadingLabel="Régénération..."
        onConfirm={handleRegenerateConfirm}
        onCancel={() => setConfirmRegenOpen(false)}
      />
    </div>
  );
}
