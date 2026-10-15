import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { safeUUID } from '../lib/ids';
import { invokeFunction } from '../lib/invokeFunction';
import { Plus, CreditCard as Edit2, Trash2, Send, X, Lock, Copy, Key, UserX, Pencil, Mail, Check, Activity, Clipboard, Circle as XCircle, Search, Link2, Landmark, Eye, EyeOff } from 'lucide-react';
import SearchInput from '../components/ui/SearchInput';
import { isValidPhone } from '../utils/phoneHelpers';
import PhoneInput from '../components/PhoneInput';
import { updateUserEmail } from '../lib/updateEmail';
import { SortableHeader } from '../components/SortableHeader';
import { formatAVS, validateAVS } from '../utils/formatHelpers';
import { STAFF_ROLE_LABELS } from '../types';
import { checkAVSUnique, checkJSUnique, fetchFullDuplicateInfo } from '../utils/validationHelpers';
import DuplicatePersonModal from '../components/DuplicatePersonModal';
import PageTitleCount from '../components/PageTitleCount';
import useEscapeKey from '../hooks/useEscapeKey';
import ConfirmModal from '../components/ConfirmModal';
import { StandardModal } from '../components/StandardModal';
import { useModuleAccess } from '../hooks/useModuleAccess';
import { Badge } from '../components/ui/Badge';
import { Tabs } from '../components/ui/Tabs';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import Button from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import PasswordInput from '../components/PasswordInput';
import { passwordLongEnough, mapPasswordAuthError, PasswordLengthHint, PasswordMismatchHint } from '../components/PasswordChecklist';
import CountrySelect from '../components/CountrySelect';

interface CoachingQualification {
  id: string;
  name: string;
  description: string;
  display_order: number;
  validity_years?: number | null;
}

interface Coach {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  email: string;
  phone: string;
  address: string;
  postal_code: string;
  city: string;
  qualification_id: string;
  avs_number?: string | null;
  js_number?: string | null;
  status: 'invited' | 'registered' | 'active' | 'inactive';
  invite_token: string;
  invite_sent_at: string;
  user_id?: string | null;
  can_login?: boolean;
  coaching_qualifications?: CoachingQualification;
  diploma_expiry_date?: string | null;
  next_js_course_date?: string | null;
  next_js_course_name?: string | null;
  next_js_course_number?: string | null;
  next_js_course_location?: string | null;
  wants_js_renewal?: boolean;
  self_deleted_at?: string | null;
  member_id?: string | null;
  linked_member?: { id: string; first_name: string; last_name: string; birth_date: string; email?: string; phone?: string; address?: string; postal_code?: string; city?: string; avs_number?: string; teams?: { name: string } | null } | null;
  salutation?: string | null;
  nationality?: string | null;
  member_since?: string | null;
  notes?: string | null;
}


function isDiplomaExpired(expiry?: string | null): boolean {
  if (!expiry) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(expiry);
  return d < today;
}

function ExpiredBadge() {
  return <Badge variant="red">EXPIRÉ</Badge>;
}

export default function AdminCoaches() {
  const { canEdit } = useModuleAccess('entraineurs');
  const [viewingCoach, setViewingCoach] = useState<Coach | null>(null);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [coachTeamsMap, setCoachTeamsMap] = useState<Record<string, { name: string; role: string }[]>>({});
  const [qualifications, setQualifications] = useState<CoachingQualification[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCoach, setEditingCoach] = useState<Coach | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<string | null>('last_name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [duplicateInfo, setDuplicateInfo] = useState<{ type: 'avs' | 'js' | 'asf'; person: any; crossTable?: boolean } | null>(null);
  const [linking, setLinking] = useState(false);
  const skipCrossTableRef = useRef(false);
  const pendingLinkRef = useRef<{ table: string; id: string; email?: string | null } | null>(null);
  const [canLogin, setCanLogin] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [newPasswordErrors, setNewPasswordErrors] = useState<string[] | null>(null);
  const canResetPassword = passwordLongEnough(newPassword) && newPassword === confirmNewPassword;
  const [activeTab, setActiveTab] = useState<'profil' | 'formation'>('profil');
  const [searchParams, setSearchParams] = useSearchParams();
  const pageTab: 'list' | 'planning' = searchParams.get('tab') === 'planning' ? 'planning' : 'list';
  const setPageTab = (tab: 'list' | 'planning') => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'planning') next.set('tab', 'planning');
    else next.delete('tab');
    setSearchParams(next, { replace: true });
  };
  const [personSearchResults, setPersonSearchResults] = useState<any[]>([]);
  const personSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    birth_date: '',
    email: '',
    phone: '',
    address: '',
    postal_code: '',
    city: '',
    qualification_id: '',
    avs_number: '',
    js_number: '',
    asf_licence_number: '',
    member_id: '' as string,
    status: 'active' as 'active' | 'inactive' | 'registered',
    diploma_expiry_date: '',
    next_js_course_date: '',
    next_js_course_name: '',
    next_js_course_number: '',
    next_js_course_location: '',
    wants_js_renewal: true,
    salutation: '',
    nationality: '',
    member_since: '',
    notes: '',
  });

  const [bankDetails, setBankDetails] = useState({ iban: '', account_holder: '', bank_name: '' });
  const [bankError, setBankError] = useState('');
  const [showIban, setShowIban] = useState(false);
  const [viewBankDetails, setViewBankDetails] = useState<{ iban: string; account_holder: string; bank_name: string } | null>(null);

  useEffect(() => {
    if (!viewingCoach) { setViewBankDetails(null); setShowIban(false); return; }
    supabase.from('coach_bank_details').select('iban, account_holder, bank_name').eq('coach_id', viewingCoach.id).maybeSingle().then(({ data }) => {
      setViewBankDetails(data || null);
    });
  }, [viewingCoach]);

  const selectedQualification = qualifications.find(q => q.id === formData.qualification_id);
  const showJsFormationFields = !!selectedQualification && selectedQualification.validity_years != null;

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

  const [jsRenewalFilter, setJsRenewalFilter] = useState(false);
  const [sendingJsNotification, setSendingJsNotification] = useState(false);
  const [jsNotifToast, setJsNotifToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [disableConfirmInput, setDisableConfirmInput] = useState('');
  const [disabling, setDisabling] = useState(false);
  const [deleteCoachId, setDeleteCoachId] = useState<string | null>(null);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2 | 3>(0);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [deletingCoach, setDeletingCoach] = useState(false);
  const { toast, showToast } = useToast();

  const handleSaveAndSendJsNotification = async () => {
    if (!editingCoach?.id) return;
    setSendingJsNotification(true);
    setJsNotifToast(null);
    try {
      const { error: updateErr } = await supabase
        .from('coaches')
        .update({
          next_js_course_date: formData.next_js_course_date || null,
          next_js_course_name: formData.next_js_course_name || null,
          next_js_course_number: formData.next_js_course_number || null,
          next_js_course_location: formData.next_js_course_location || null,
          diploma_expiry_date: formData.diploma_expiry_date || null,
          wants_js_renewal: formData.wants_js_renewal,
        })
        .eq('id', editingCoach.id);
      if (updateErr) {
        setJsNotifToast({ type: 'error', message: `Erreur: ${updateErr.message}` });
        return;
      }

      setEditingCoach({
        ...editingCoach,
        next_js_course_date: formData.next_js_course_date || null,
        next_js_course_name: formData.next_js_course_name || null,
        next_js_course_number: formData.next_js_course_number || null,
        next_js_course_location: formData.next_js_course_location || null,
        diploma_expiry_date: formData.diploma_expiry_date || null,
        wants_js_renewal: formData.wants_js_renewal,
      });

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-js-course-notification`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ coach_id: editingCoach.id }),
        }
      );
      const json = await resp.json();
      if (!resp.ok || !json.success) {
        setJsNotifToast({ type: 'error', message: `Erreur: ${json.error || 'envoi échoué'}` });
      } else {
        setJsNotifToast({ type: 'success', message: `Notification envoyée à ${json.recipient_email}` });
        await loadData();
      }
    } catch (e) {
      setJsNotifToast({ type: 'error', message: `Erreur: ${(e as Error).message}` });
    } finally {
      setSendingJsNotification(false);
      setTimeout(() => setJsNotifToast(null), 6000);
    }
  };

  useEffect(() => {
    document.title = 'Admin Entraîneurs - ClubSphere'
    loadData();
    const params = new URLSearchParams(window.location.search);
    if (params.get('filter') === 'js-renewal-needed') {
      setJsRenewalFilter(true);
    }
  }, []);

  const handleCloseModal = useCallback(() => {
    setShowModal(false);
  }, []);

  const handleCloseDuplicateModal = useCallback(() => {
    setDuplicateInfo(null);
    pendingLinkRef.current = null;
    skipCrossTableRef.current = false;
  }, []);

  const handleCloseResetPassword = useCallback(() => {
    setShowResetPassword(false);
  }, []);

  useEscapeKey(handleCloseModal);
  useEscapeKey(handleCloseDuplicateModal);
  useEscapeKey(handleCloseResetPassword);

  async function loadData() {
    try {
      setLoading(true);
      const [coachesResult, qualificationsResult, teamsResult] = await Promise.all([
        supabase
          .from('coaches')
          .select('*, coaching_qualifications(*), linked_member:member_id(id, first_name, last_name, birth_date, email, phone, address, postal_code, city, avs_number, teams(name))')
          .order('created_at', { ascending: false }),
        supabase
          .from('coaching_qualifications')
          .select('*')
          .eq('active', true)
          .order('display_order'),
        supabase
          .from('team_staff')
          .select('coach_id, role, sort_order, teams(name)')
      ]);

      if (coachesResult.error) {
        console.error('Error fetching coaches:', coachesResult.error);
      } else if (coachesResult.data) {
        setCoaches(coachesResult.data);
      }

      if (qualificationsResult.error) {
        console.error('Error fetching qualifications:', qualificationsResult.error);
      } else if (qualificationsResult.data) {
        setQualifications(qualificationsResult.data);
      }

      if (!teamsResult.error && teamsResult.data) {
        const sorted = [...teamsResult.data].sort((a: any, b: any) => (a.sort_order ?? 99) - (b.sort_order ?? 99));
        const map: Record<string, { name: string; role: string }[]> = {};
        for (const row of sorted as any[]) {
          if (!row.coach_id || !row.teams) continue;
          (map[row.coach_id] ??= []).push({ name: row.teams.name, role: row.role });
        }
        setCoachTeamsMap(map);
      }
    } catch (err) {
      console.error('Unexpected error loading data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (formData.phone && !isValidPhone(formData.phone)) {
      showToast('Numéro invalide.', 'warning');
      return;
    }

    if (formData.avs_number && formData.avs_number.trim()) {
      if (!validateAVS(formData.avs_number)) {
        showToast('Format AVS invalide. Format attendu: 756.XXXX.XXXX.XX', 'warning');
        return;
      }

      let avsCoachQuery = supabase
        .from('coaches')
        .select('id, first_name, last_name, email, phone, birth_date')
        .eq('avs_number', formData.avs_number.trim());
      if (editingCoach?.id) {
        avsCoachQuery = avsCoachQuery.neq('id', editingCoach.id);
      }
      const { data: avsCoach } = await avsCoachQuery.maybeSingle();
      if (avsCoach) {
        setDuplicateInfo({ type: 'avs', person: { ...avsCoach, table: 'Entraîneur' } });
        return;
      }

      if (!skipCrossTableRef.current) {
        let avsDataQuery = supabase
          .from('members')
          .select('id, first_name, last_name, email, phone, birth_date, teams(name)')
          .eq('avs_number', formData.avs_number.trim());
        if (formData.member_id) {
          avsDataQuery = avsDataQuery.neq('id', formData.member_id);
        }
        const { data: avsData } = await avsDataQuery.maybeSingle();
        if (avsData) {
          const alreadyLinked = formData.member_id === avsData.id || editingCoach?.member_id === avsData.id;
          if (!alreadyLinked) {
            pendingLinkRef.current = { table: 'members', id: avsData.id, email: avsData.email };
            setDuplicateInfo({ type: 'avs', person: { ...avsData, table: 'Joueur', team_name: (avsData as any).teams?.name || null }, crossTable: true });
            return;
          }
        }
        const { data: avsCommittee } = await supabase
          .from('committee_members')
          .select('id, first_name, last_name, email, phone, birth_date, role, coach_id')
          .eq('avs_number', formData.avs_number.trim())
          .maybeSingle();
        if (avsCommittee && avsCommittee.coach_id !== editingCoach?.id) {
          pendingLinkRef.current = { table: 'committee_members', id: avsCommittee.id, email: avsCommittee.email };
          setDuplicateInfo({ type: 'avs', person: { ...avsCommittee, table: 'Comité' }, crossTable: true });
          return;
        }
      }
    }

    if (formData.js_number && formData.js_number.trim()) {
      if (formData.js_number.length > 7) {
        showToast('Le numéro J+S ne peut pas dépasser 7 chiffres', 'warning');
        return;
      }

      let jsCoachQuery = supabase
        .from('coaches')
        .select('id, first_name, last_name, email, phone, birth_date')
        .eq('js_number', formData.js_number.trim());
      if (editingCoach?.id) {
        jsCoachQuery = jsCoachQuery.neq('id', editingCoach.id);
      }
      const { data: jsCoach } = await jsCoachQuery.maybeSingle();
      if (jsCoach) {
        setDuplicateInfo({ type: 'js', person: { ...jsCoach, table: 'Entraîneur' } });
        return;
      }

      if (!skipCrossTableRef.current) {
        let jsDataQuery = supabase
          .from('members')
          .select('id, first_name, last_name, email, phone, birth_date, teams(name)')
          .eq('js_number', formData.js_number.trim());
        if (formData.member_id) {
          jsDataQuery = jsDataQuery.neq('id', formData.member_id);
        }
        const { data: jsData } = await jsDataQuery.maybeSingle();
        if (jsData) {
          const alreadyLinked = formData.member_id === jsData.id || editingCoach?.member_id === jsData.id;
          if (!alreadyLinked) {
            pendingLinkRef.current = { table: 'members', id: jsData.id, email: jsData.email };
            setDuplicateInfo({ type: 'js', person: { ...jsData, table: 'Joueur', team_name: (jsData as any).teams?.name || null }, crossTable: true });
            return;
          }
        }
      }
    }

    if (formData.asf_licence_number && formData.asf_licence_number.trim()) {
      if (formData.asf_licence_number.length > 7) {
        showToast('Le numéro de licence ASF ne peut pas dépasser 7 chiffres', 'warning');
        return;
      }

      let asfCoachQuery = supabase
        .from('coaches')
        .select('id, first_name, last_name, email, phone, birth_date')
        .eq('asf_licence_number', formData.asf_licence_number.trim());
      if (editingCoach?.id) {
        asfCoachQuery = asfCoachQuery.neq('id', editingCoach.id);
      }
      const { data: asfCoach } = await asfCoachQuery.maybeSingle();
      if (asfCoach) {
        setDuplicateInfo({ type: 'asf', person: { ...asfCoach, table: 'Entraîneur' } });
        return;
      }

      if (!skipCrossTableRef.current) {
        let asfDataQuery = supabase
          .from('members')
          .select('id, first_name, last_name, email, phone, birth_date, teams(name)')
          .eq('asf_licence_number', formData.asf_licence_number.trim());
        if (formData.member_id) {
          asfDataQuery = asfDataQuery.neq('id', formData.member_id);
        }
        const { data: asfData } = await asfDataQuery.maybeSingle();
        if (asfData) {
          const alreadyLinked = formData.member_id === asfData.id || editingCoach?.member_id === asfData.id;
          if (!alreadyLinked) {
            pendingLinkRef.current = { table: 'members', id: asfData.id, email: asfData.email };
            setDuplicateInfo({ type: 'asf', person: { ...asfData, table: 'Joueur', team_name: (asfData as any).teams?.name || null }, crossTable: true });
            return;
          }
        }
      }
    }

    const needsInviteToken =
      canLogin === true &&
      !editingCoach?.user_id &&
      !editingCoach?.invite_token;

    const coachData: Record<string, any> = {
      first_name: formData.first_name,
      last_name: formData.last_name,
      birth_date: formData.birth_date || null,
      email: formData.email,
      phone: formData.phone || null,
      address: formData.address || null,
      postal_code: formData.postal_code || null,
      city: formData.city || null,
      qualification_id: formData.qualification_id || null,
      avs_number: formData.avs_number || null,
      js_number: formData.js_number || null,
      asf_licence_number: formData.asf_licence_number || null,
      status: needsInviteToken ? 'invited' : (formData.status || 'active'),
      can_login: canLogin === true,
      diploma_expiry_date: formData.diploma_expiry_date || null,
      next_js_course_date: formData.next_js_course_date || null,
      next_js_course_name: formData.next_js_course_name || null,
      next_js_course_number: formData.next_js_course_number || null,
      next_js_course_location: formData.next_js_course_location || null,
      wants_js_renewal: formData.wants_js_renewal,
      member_id: formData.member_id || null,
      salutation: formData.salutation || null,
      nationality: formData.nationality || null,
      member_since: formData.member_since || null,
      notes: formData.notes || null,
    };

    if (needsInviteToken) {
      coachData.invite_token = safeUUID();
      coachData.self_deleted_at = null;
    }

    console.log('can_login being saved:', canLogin);

    let savedCoachId: string | null = null;

    if (editingCoach) {
      const { error } = await supabase
        .from('coaches')
        .update(coachData)
        .eq('id', editingCoach.id);

      if (error) {
        showToast('Erreur: ' + error.message, 'error');
        return;
      }
      savedCoachId = editingCoach.id;

      const oldEmail = editingCoach.email;
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
    } else {
      const { data: insertedRows, error } = await supabase
        .from('coaches')
        .insert([coachData])
        .select('id');

      if (error) {
        if (error.message.includes('coaches_email_key') || (error.message.includes('unique') && error.message.includes('email'))) {
          showToast('Une fiche entraîneur existe déjà avec cette adresse e-mail.', 'error');
        } else {
          showToast('Erreur: ' + error.message, 'error');
        }
        return;
      }

      if (needsInviteToken && insertedRows?.[0]?.id) {
        const newCoachId = insertedRows[0].id;
        const { data: invData, error: invError } = await invokeFunction('send-coach-invite', {
          body: { coach_id: newCoachId }
        });

        if (invError || invData?.error) {
          await supabase.from('coaches').update({ invite_sent_at: null }).eq('id', newCoachId);
          showToast(
            'La fiche a été créée mais l\'email d\'invitation n\'a pas pu partir — réessayez via le bouton Envoyer dans la liste.',
            'warning'
          );
          setShowModal(false);
          resetForm();
          loadData();
          return;
        }

        await supabase.from('coaches').update({ invite_sent_at: new Date().toISOString() }).eq('id', newCoachId);
      }
      if (!savedCoachId && insertedRows?.[0]?.id) savedCoachId = insertedRows[0].id;
    }

    if (savedCoachId) {
      if (bankDetails.iban.trim()) {
        const { error: bankErr } = await supabase
          .from('coach_bank_details')
          .upsert({
            coach_id: savedCoachId,
            iban: bankDetails.iban.trim(),
            account_holder: bankDetails.account_holder.trim() || null,
            bank_name: bankDetails.bank_name.trim() || null,
          }, { onConflict: 'coach_id' });
        if (bankErr) {
          setBankError(bankErr.message);
          return;
        }
      } else if (editingCoach) {
        await supabase.from('coach_bank_details').delete().eq('coach_id', savedCoachId);
      }
    }

    if (pendingLinkRef.current && savedCoachId) {
      const link = pendingLinkRef.current;
      if (link.table === 'members') {
        await supabase.from('coaches').update({ member_id: link.id }).eq('id', savedCoachId);
        if (!formData.email && link.email) {
          await supabase.from('coaches').update({ email: link.email }).eq('id', savedCoachId);
        }
      } else if (link.table === 'committee_members') {
        await supabase.from('committee_members').update({ coach_id: savedCoachId }).eq('id', link.id);
        if (!formData.email && link.email) {
          await supabase.from('coaches').update({ email: link.email }).eq('id', savedCoachId);
        }
      }
      pendingLinkRef.current = null;
      skipCrossTableRef.current = false;
      showToast('Fiches reliées', 'success');
    }
    setShowModal(false);
    resetForm();
    loadData();
  }

  function handleDelete(id: string) {
    setDeleteCoachId(id);
    setDeleteConfirmInput('');
    setDeleteStep(1);
  }

  async function confirmDeleteCoach() {
    if (!deleteCoachId || deleteConfirmInput.trim().toUpperCase() !== 'EFFACER') return;
    setDeletingCoach(true);
    try {
      const { data, error } = await invokeFunction('delete-coach', {
        body: { coach_id: deleteCoachId }
      });
      if (error || data?.error) {
        showToast(data?.error || error || 'Erreur lors de la suppression', 'error');
        setDeletingCoach(false);
        return;
      }
      showToast('Entraîneur supprimé', 'success');
      setDeleteStep(0);
      setDeleteCoachId(null);
      setDeleteConfirmInput('');
      loadData();
    } catch (err: any) {
      console.error('Error deleting coach:', err);
      showToast('Erreur: ' + err.message, 'error');
    } finally {
      setDeletingCoach(false);
    }
  }

  async function handleSendInvite(coach: Coach) {
    try {
      const { data, error } = await invokeFunction('send-coach-invite', {
        body: { coach_id: coach.id }
      });

      if (error || data?.error) {
        showToast(data?.error || error || "Erreur lors de l'envoi", 'error');
        return;
      }

      await supabase.from('coaches').update({ invite_sent_at: new Date().toISOString() }).eq('id', coach.id);
      showToast(`Invitation envoyée à ${coach.first_name} ${coach.last_name}`, 'success');
      loadData();
    } catch (err: any) {
      showToast('Erreur: ' + (err?.message || "Erreur lors de l'envoi"), 'error');
    }
  }

  function openModal(coach?: Coach) {
    if (coach) {
      setEditingCoach(coach);
      setFormData({
        first_name: coach.first_name,
        last_name: coach.last_name,
        birth_date: coach.birth_date,
        email: coach.email,
        phone: coach.phone,
        address: coach.address,
        postal_code: coach.postal_code,
        city: coach.city,
        qualification_id: coach.qualification_id || '',
        avs_number: coach.avs_number || '',
        js_number: coach.js_number || '',
        asf_licence_number: (coach as any).asf_licence_number || '',
        member_id: coach.member_id || '',
        status: coach.status === 'registered' || coach.status === 'active' ? coach.status : 'active',
        diploma_expiry_date: coach.diploma_expiry_date || '',
        next_js_course_date: coach.next_js_course_date || '',
        next_js_course_name: coach.next_js_course_name || '',
        next_js_course_number: coach.next_js_course_number || '',
        next_js_course_location: coach.next_js_course_location || '',
        wants_js_renewal: coach.wants_js_renewal !== false,
        salutation: coach.salutation || '',
        nationality: coach.nationality || '',
        member_since: coach.member_since || '',
        notes: coach.notes || '',
      });
      setCanLogin(coach.can_login === true);
      supabase.from('coach_bank_details').select('iban, account_holder, bank_name').eq('coach_id', coach.id).maybeSingle().then(({ data }) => {
        if (data) setBankDetails({ iban: data.iban || '', account_holder: data.account_holder || '', bank_name: data.bank_name || '' });
        else setBankDetails({ iban: '', account_holder: '', bank_name: '' });
      });
      setBankError('');
    } else {
      resetForm();
    }
    setActiveTab('profil');
    setShowMemberPicker(false);
    setMemberSearchQuery('');
    setShowResetPassword(false);
    setNewPassword('');
    setConfirmNewPassword('');
    setNewPasswordErrors(null);
    setShowModal(true);
    setPersonSearchResults([]);
  }

  const handlePersonSearch = (query: string) => {
    setMemberSearchQuery(query);
    if (personSearchTimer.current) clearTimeout(personSearchTimer.current);
    if (query.length < 2) { setPersonSearchResults([]); return; }
    personSearchTimer.current = setTimeout(async () => {
      const { data } = await supabase.rpc('search_club_people', { p_query: query, p_limit: 20 });
      setPersonSearchResults((data as any[]) || []);
    }, 300);
  };

  function resetForm() {
    setEditingCoach(null);
    setCanLogin(false);
    setFormData({
      first_name: '',
      last_name: '',
      birth_date: '',
      email: '',
      phone: '',
      address: '',
      postal_code: '',
      city: '',
      qualification_id: '',
      avs_number: '',
      js_number: '',
      asf_licence_number: '',
      member_id: '',
      status: 'active',
      diploma_expiry_date: '',
      next_js_course_date: '',
      next_js_course_name: '',
      next_js_course_number: '',
      next_js_course_location: '',
      wants_js_renewal: true,
      salutation: '',
      nationality: '',
      member_since: '',
      notes: '',
    });
    setBankDetails({ iban: '', account_holder: '', bank_name: '' });
    setBankError('');
    setShowIban(false);
  }

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  async function handleGenerateInvite() {
    if (!editingCoach) return;

    try {
      let token = editingCoach.invite_token;

      if (!token) {
        token = safeUUID();

        const { error } = await supabase
          .from('coaches')
          .update({
            invite_token: token,
            can_login: true,
            status: 'invited',
            self_deleted_at: null
          })
          .eq('id', editingCoach.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('coaches')
          .update({
            can_login: true,
            status: 'invited',
            self_deleted_at: null
          })
          .eq('id', editingCoach.id);

        if (error) throw error;
      }

      const { data: invData, error: invError } = await invokeFunction('send-coach-invite', {
        body: { coach_id: editingCoach.id }
      });

      if (invError || invData?.error) {
        const inviteLink = `${window.location.origin}/register/coach?token=${token}`;
        await navigator.clipboard.writeText(inviteLink);
        showToast(
          "L'email n'a pas pu être envoyé — le lien a été copié dans le presse-papiers, transmettez-le manuellement.",
          'warning'
        );
        loadData();
        return;
      }

      await supabase.from('coaches').update({ invite_sent_at: new Date().toISOString() }).eq('id', editingCoach.id);

      const inviteLink = `${window.location.origin}/register/coach?token=${token}`;
      await navigator.clipboard.writeText(inviteLink);
      showToast("Invitation envoyée par email et lien copié dans le presse-papiers", 'success');

      loadData();
    } catch (error: any) {
      console.error('Error generating invite:', error);
      showToast('Erreur: ' + error.message, 'error');
    }
  }

  async function handleResetPassword() {
    if (!editingCoach || !editingCoach.user_id || !canResetPassword) return;
    setNewPasswordErrors(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-coach-account`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`
          },
          body: JSON.stringify({
            action: 'reset_password',
            userId: editingCoach.user_id,
            newPassword: newPassword
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        const mapped = mapPasswordAuthError(result.error);
        if (mapped) {
          setNewPasswordErrors(mapped);
          return;
        }
        throw new Error(result.error || 'Erreur lors de la réinitialisation');
      }

      showToast('Mot de passe réinitialisé', 'success');
      setShowResetPassword(false);
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (error: any) {
      console.error('Error resetting password:', error);
      showToast('Erreur: ' + error.message, 'error');
    }
  }

  function handleDisableAccess() {
    if (!editingCoach) return;
    setDisableConfirmInput('');
    setShowDisableConfirm(true);
  }

  async function confirmDisableAccess() {
    if (!editingCoach || disableConfirmInput.trim().toUpperCase() !== 'DESACTIVER') return;
    setDisabling(true);
    try {
      const { data, error } = await invokeFunction('disable-coach-access', {
        body: { coach_id: editingCoach.id }
      });

      if (error || data?.error) {
        showToast(data?.error || error || 'Erreur lors de la désactivation', 'error');
        setDisabling(false);
        return;
      }

      showToast(`Accès désactivé pour ${editingCoach.first_name} ${editingCoach.last_name}`, 'success');
      setCanLogin(false);
      setShowDisableConfirm(false);
      setShowModal(false);
      loadData();
    } catch (err: any) {
      console.error('Error disabling access:', err);
      showToast('Erreur: ' + err.message, 'error');
    } finally {
      setDisabling(false);
    }
  }




  const filteredCoaches = coaches.filter(coach => {
    if (jsRenewalFilter) {
      const q = coach.coaching_qualifications;
      if (!q || q.validity_years == null) return false;
      if (!coach.diploma_expiry_date) return false;
      if (coach.next_js_course_date) return false;
      if (coach.wants_js_renewal === false) return false;
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() + 10);
      if (new Date(coach.diploma_expiry_date) > cutoff) return false;
    }
    const search = searchTerm.trim().toLowerCase();
    const parts = search.split(' ').filter(Boolean);

    if (search === '') return true;

    if (parts.length === 1) {
      // Single word: search in first_name, last_name, email
      return (
        coach.first_name.toLowerCase().includes(search) ||
        coach.last_name.toLowerCase().includes(search) ||
        coach.email.toLowerCase().includes(search)
      );
    } else {
      // Multiple words: check for full name in both orders
      const fullName1 = `${coach.first_name} ${coach.last_name}`.toLowerCase();
      const fullName2 = `${coach.last_name} ${coach.first_name}`.toLowerCase();
      return (
        fullName1.includes(search) ||
        fullName2.includes(search) ||
        coach.email.toLowerCase().includes(search)
      );
    }
  });

  const sortedCoaches = [...filteredCoaches].sort((a, b) => {
    if (!sortField) {
      const lc = (a.last_name || '').localeCompare(b.last_name || '', 'fr', { sensitivity: 'base' });
      return lc !== 0 ? lc : (a.first_name || '').localeCompare(b.first_name || '', 'fr', { sensitivity: 'base' });
    }

    let aVal: any = '';
    let bVal: any = '';

    switch (sortField) {
      case 'first_name':
        aVal = a.first_name || '';
        bVal = b.first_name || '';
        break;
      case 'last_name':
        aVal = a.last_name || '';
        bVal = b.last_name || '';
        break;
      case 'email':
        aVal = a.email || '';
        bVal = b.email || '';
        break;
      case 'phone':
        aVal = a.phone || '';
        bVal = b.phone || '';
        break;
      case 'team':
        aVal = (coachTeamsMap[a.id] || []).map(t => t.name).join(', ');
        bVal = (coachTeamsMap[b.id] || []).map(t => t.name).join(', ');
        break;
      case 'qualification':
        aVal = a.coaching_qualifications?.name || '';
        bVal = b.coaching_qualifications?.name || '';
        break;
      case 'status':
        aVal = a.status || '';
        bVal = b.status || '';
        break;
      default:
        return 0;
    }

    const cmp = String(aVal).localeCompare(String(bVal), 'fr', { sensitivity: 'base' });
    if (cmp !== 0) return sortDir === 'asc' ? cmp : -cmp;
    const cmp2 = (a.last_name || '').localeCompare(b.last_name || '', 'fr', { sensitivity: 'base' });
    if (cmp2 !== 0) return sortDir === 'asc' ? cmp2 : -cmp2;
    return (a.first_name || '').localeCompare(b.first_name || '', 'fr', { sensitivity: 'base' });
  });

  const getStatusBadge = (status: string, inviteSentAt?: string | null) => {
    if (status === 'invited' && !inviteSentAt) {
      return <Badge variant="red">Email non envoyé</Badge>;
    }
    const config: Record<string, { variant: 'yellow' | 'blue' | 'green' | 'neutral'; label: string }> = {
      invited:    { variant: 'yellow',  label: 'Invitation envoyée' },
      registered: { variant: 'blue',    label: 'Enregistré' },
      active:     { variant: 'green',   label: 'Actif' },
      inactive:   { variant: 'neutral', label: 'Inactif' },
    };
    const c = config[status] || config.inactive;
    return <Badge variant={c.variant}>{c.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--accent)' }}></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6" style={{ background: 'var(--bg-page)' }}>
      <div className="w-full mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
              <Activity className="w-5 h-5" />
              Entraîneurs
              <PageTitleCount total={coaches.length} filtered={filteredCoaches.length} isFiltered={!!searchTerm || jsRenewalFilter} />
            </h1>
            <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>Gestion des entraîneurs</p>
          </div>
          {canEdit && (
            <Button
              onClick={() => openModal()}
              leftIcon={<Plus className="w-5 h-5" />}
            >
              Nouvel entraîneur
            </Button>
          )}
        </div>

        <Tabs
          items={[
            { key: 'list', label: 'Liste des entraîneurs' },
            { key: 'planning', label: 'Planning J+S', count: coaches.filter(c => c.next_js_course_date).length },
          ]}
          value={pageTab}
          onChange={(id) => setPageTab(id as 'list' | 'planning')}
          className="mb-6"
        />

        {pageTab === 'list' && jsRenewalFilter && (
          <div className="mb-4">
            <Alert
              variant="warning"
              action={
                <Button variant="secondary" size="sm" onClick={() => setJsRenewalFilter(false)}>
                  Effacer
                </Button>
              }
            >
              Filtre actif : entraîneurs dont le diplôme J+S doit être renouvelé
            </Alert>
          </div>
        )}

        {pageTab === 'list' && (
        <div className="mb-6">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Rechercher par prénom, nom ou email..."
          />
        </div>
        )}

        {pageTab === 'list' && (
        <div className="rounded-lg shadow-xl overflow-hidden" style={{ background: 'var(--bg-card)' }}>
          <style>{`
            .coaches-stickhead thead th {
              position: sticky; top: 0; z-index: 2;
              background: var(--table-header-bg);
              border-bottom: 1px solid var(--border-color);
            }
            .coaches-stickhead thead th::after {
              content: ''; position: absolute; left: 0; right: 0; bottom: -8px; height: 8px;
              pointer-events: none;
              background: linear-gradient(to bottom, var(--shadow-sm), transparent);
            }
          `}</style>
          <div style={{ width: '100%', overflowX: 'auto', maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
            <table className="coaches-stickhead" style={{ minWidth: '1400px', width: '100%' }}>
              <colgroup>
                <col style={{ width: '110px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '190px' }} />
                <col style={{ width: '140px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '180px' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '130px' }} />
                <col style={{ width: '130px' }} />
              </colgroup>
              <thead style={{ background: 'var(--table-header-bg)' }}>
                <tr>
                  <SortableHeader label="Nom" field="last_name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Prénom" field="first_name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Email" field="email" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Mobile" field="phone" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Équipe" field="team" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Qualification" field="qualification" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Statut" field="status" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                    Accès app
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedCoaches.map((coach) => (
                  <tr key={coach.id} className="hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer" onClick={() => setViewingCoach(coach)}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        <span>{coach.last_name}</span>
                        {coach.self_deleted_at && (
                          <span style={{
                            background: 'var(--orange-soft)',
                            color: 'var(--orange-text)',
                            border: '1px solid var(--orange-text)',
                            borderRadius: '999px',
                            padding: '2px 8px',
                            fontSize: '11px',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                          }}>
                            Compte supprimé
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-1.5">
                        {coach.first_name}
                        {coach.member_id && coach.linked_member && (() => {
                          const bd = new Date(coach.linked_member.birth_date);
                          const age = Math.floor((Date.now() - bd.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
                          return age < 18
                            ? <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--info-soft)', color: 'var(--info-text)', fontSize: '10px', fontWeight: 600 }}>Junior</span>
                            : <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--success-soft)', color: 'var(--success-text)', fontSize: '10px', fontWeight: 600 }}>Joueur</span>;
                        })()}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="overflow-hidden text-ellipsis whitespace-nowrap" title={coach.email}>
                        {coach.email}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {coach.phone || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {(coachTeamsMap[coach.id] || []).length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          {coachTeamsMap[coach.id].map((t, i) => (
                            <div key={i} className="whitespace-nowrap">
                              {t.name}
                              <span className="ml-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>{STAFF_ROLE_LABELS[t.role] || t.role}</span>
                            </div>
                          ))}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {coach.coaching_qualifications ? (
                        <div className="flex items-center gap-2 overflow-hidden whitespace-nowrap" title={coach.coaching_qualifications.name}>
                          <Badge variant="blue" className="overflow-hidden text-ellipsis">
                            {coach.coaching_qualifications.name}
                          </Badge>
                          {coach.coaching_qualifications.validity_years != null
                            && isDiplomaExpired(coach.diploma_expiry_date)
                            && <ExpiredBadge />}
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {getStatusBadge(coach.status, coach.invite_sent_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {coach.can_login ? (
                        <span style={{ color: 'var(--success-text)' }}><Check className="w-4 h-4 inline mr-1" />Peut se connecter</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}><XCircle className="w-4 h-4 inline mr-1" />Pas d'accès</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium" style={{ minWidth: '130px', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        {canEdit && coach.can_login === true && !coach.user_id && (
                          <button
                            onClick={() => handleSendInvite(coach)}
                            style={{ color: coach.invite_sent_at ? 'var(--accent)' : 'var(--warning-text)' }}
                            title={coach.invite_sent_at ? "Renvoyer l'invitation par email" : "Envoyer l'invitation par email"}
                          >
                            <Send className="w-5 h-5" />
                          </button>
                        )}
                        {canEdit && (
                          <>
                            <button
                              onClick={() => openModal(coach)}
                              style={{ color: 'var(--accent)' }}
                            >
                              <Edit2 className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleDelete(coach.id)}
                              style={{ color: 'var(--danger)' }}
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {pageTab === 'planning' && (
          <div className="rounded-lg shadow-xl overflow-hidden" style={{ background: 'var(--bg-card)' }}>
            <div style={{ width: '100%', overflowX: 'auto' }}>
              {(() => {
                const planningCoaches = [...coaches]
                  .filter(c => !!c.next_js_course_date)
                  .sort((a, b) => (a.next_js_course_date || '').localeCompare(b.next_js_course_date || ''));
                if (planningCoaches.length === 0) {
                  return (
                    <div className="p-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Aucun cours J+S n'est planifié actuellement.
                    </div>
                  );
                }
                return (
                  <table style={{ width: '100%' }}>
                    <thead style={{ background: 'var(--table-header-bg)' }}>
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Nom</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Prénom</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Date du cours</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Nom du cours</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Numéro du cours</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Lieu du cours</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {planningCoaches.map(coach => (
                        <tr key={coach.id} className="hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer" onClick={() => openModal(coach)}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">{coach.last_name}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">{coach.first_name}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {coach.next_js_course_date
                              ? new Date(coach.next_js_course_date).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
                              : '-'}
                          </td>
                          <td className="px-6 py-4 text-sm">{coach.next_js_course_name || '-'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">{coach.next_js_course_number || '-'}</td>
                          <td className="px-6 py-4 text-sm">{coach.next_js_course_location || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div
              className="sticky top-0 flex items-center justify-between px-6 py-4 rounded-t-xl"
              style={{ background: 'var(--bg-modal-header)' }}
            >
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-modal-header)' }}>
                {editingCoach ? 'Modifier l\'entraîneur' : 'Nouvel entraîneur'}
              </h2>
              <button onClick={() => setShowModal(false)} className="hover:opacity-80 transition-opacity" style={{ color: 'var(--text-modal-header)' }}>
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <Tabs
                items={[
                  { key: 'profil', label: 'Profil' },
                  {
                    key: 'formation',
                    label: showJsFormationFields ? 'Formation J+S' : 'Formation',
                    icon: showJsFormationFields && isDiplomaExpired(formData.diploma_expiry_date) ? <ExpiredBadge /> : undefined,
                  },
                ]}
                value={activeTab}
                onChange={(key) => setActiveTab(key as 'profil' | 'formation')}
              />

              <div style={{ display: activeTab === 'profil' ? 'block' : 'none' }} className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">
                  1. Personne du club
                </h3>
                <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                  Recherchez une personne existante dans le club pour créer ou compléter sa fiche entraîneur.
                </p>
                {formData.member_id ? (() => {
                  const linked = editingCoach?.linked_member as any;
                  return (
                    <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
                      <Link2 size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {linked ? `${linked.first_name} ${linked.last_name}` : '(joueur)'}
                          {linked?.birth_date && <span className="ml-1" style={{ color: 'var(--text-muted)' }}>· {new Date(linked.birth_date).getFullYear()}</span>}
                          {linked?.teams?.name && <span className="ml-1" style={{ color: 'var(--text-muted)' }}>· {linked.teams.name}</span>}
                        </div>
                      </div>
                      <button type="button" onClick={() => setFormData(prev => ({ ...prev, member_id: '' }))} style={{ color: 'var(--danger)' }} title="Retirer le lien"><X size={16} /></button>
                    </div>
                  );
                })() : (
                  <div style={{ position: 'relative' }}>
                    <button
                      type="button"
                      onClick={() => setShowMemberPicker(!showMemberPicker)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    >
                      <Search size={14} /> Rechercher une personne...
                    </button>
                    {showMemberPicker && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', marginTop: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 10, maxHeight: '300px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '8px', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
                          <input
                            type="text"
                            placeholder="Rechercher par nom..."
                            value={memberSearchQuery}
                            onChange={(e) => handlePersonSearch(e.target.value)}
                            className="w-full rounded px-3 py-1.5 text-sm focus:outline-none"
                            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                            autoFocus
                          />
                        </div>
                        <div style={{ overflowY: 'auto', flex: 1 }}>
                          {(() => {
                            const sourceLabels: Record<string, string> = { joueur: 'Joueur', comite: 'Comité', entraineur: 'Entraîneur', supporter: 'Supporter', parent: 'Parent', compte: 'Compte' };
                            if (memberSearchQuery.length < 2) return <div className="p-3 text-sm" style={{ color: 'var(--text-muted)' }}>Tapez au moins 2 caractères…</div>;
                            if (personSearchResults.length === 0) return <div className="p-3 text-sm" style={{ color: 'var(--text-muted)' }}>Aucun résultat</div>;
                            return personSearchResults.map((person: any, idx: number) => {
                              const hasEmail = !!person.email;
                              const isAlreadyCoach = Array.isArray(person.sources) && person.sources.includes('entraineur');
                              return (
                                <button
                                  key={person.source_id ? `${person.source}-${person.source_id}` : idx}
                                  type="button"
                                  disabled={!hasEmail}
                                  onClick={() => {
                                    if (!hasEmail) return;
                                    if (isAlreadyCoach) {
                                      const existingCoach = coaches.find(c => c.email && person.email && c.email.toLowerCase() === person.email.toLowerCase());
                                      if (existingCoach) {
                                        setShowMemberPicker(false);
                                        setMemberSearchQuery('');
                                        setPersonSearchResults([]);
                                        setShowModal(false);
                                        setTimeout(() => openModal(existingCoach), 100);
                                        return;
                                      }
                                    }
                                    setFormData(prev => {
                                      const isNew = !editingCoach;
                                      const isEmpty = !prev.first_name && !prev.last_name && !prev.birth_date && !prev.email;
                                      if (isNew && isEmpty) {
                                        return {
                                          ...prev,
                                          first_name: person.first_name || '',
                                          last_name: person.last_name || '',
                                          email: person.email || '',
                                          phone: person.phone || '',
                                          address: person.address || '',
                                          postal_code: person.postal_code || '',
                                          city: person.city || '',
                                        };
                                      }
                                      return prev;
                                    });
                                    setShowMemberPicker(false);
                                    setMemberSearchQuery('');
                                    setPersonSearchResults([]);
                                  }}
                                  className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--bg-hover)]"
                                  style={{ color: 'var(--text-primary)', display: 'block', ...(hasEmail ? {} : { opacity: 0.5, cursor: 'not-allowed' }) }}
                                >
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium">{person.first_name} {person.last_name}</span>
                                    {Array.isArray(person.sources) && person.sources.map((s: string) => (
                                      <span key={s} style={{ background: 'var(--info-soft)', color: 'var(--info-text)', fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '4px', lineHeight: '16px' }}>
                                        {sourceLabels[s] || s}
                                      </span>
                                    ))}
                                  </div>
                                  {hasEmail ? (
                                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{person.email}</div>
                                  ) : (
                                    <div className="text-xs mt-0.5" style={{ color: 'var(--danger)' }}>Cette personne n'a pas d'adresse e-mail. Ajoutez-la d'abord sur sa fiche.</div>
                                  )}
                                </button>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">
                  2. Identité
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Prénom *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.first_name}
                      onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' } as React.CSSProperties}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Nom *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.last_name}
                      onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' } as React.CSSProperties}
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium mb-1">
                    Date de naissance *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.birth_date}
                    onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' } as React.CSSProperties}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Civilité</label>
                    <select
                      value={formData.salutation}
                      onChange={(e) => setFormData({ ...formData, salutation: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg focus:outline-none"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' } as React.CSSProperties}
                    >
                      <option value="">—</option>
                      <option value="Monsieur">Monsieur</option>
                      <option value="Madame">Madame</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Nationalité</label>
                    <CountrySelect
                      value={formData.nationality}
                      onChange={(v) => setFormData({ ...formData, nationality: v })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Membre depuis</label>
                    <input
                      type="date"
                      value={formData.member_since}
                      onChange={(e) => setFormData({ ...formData, member_since: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg focus:outline-none"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' } as React.CSSProperties}
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium mb-1">Remarques</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg focus:outline-none resize-none"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' } as React.CSSProperties}
                    placeholder="Notes internes (non visible par l'entraîneur)"
                  />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">
                  3. Identifiants
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Numéro AVS
                    </label>
                    <input
                      type="text"
                      value={formData.avs_number}
                      onChange={(e) => setFormData({ ...formData, avs_number: formatAVS(e.target.value) })}
                      className="w-full px-3 py-2 rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' } as React.CSSProperties}
                      placeholder="756.XXXX.XXXX.XX"
                      maxLength={16}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Numéro J+S
                    </label>
                    <input
                      type="text"
                      value={formData.js_number}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/[^\d]/g, '');
                        const limited = digits.slice(0, 7);
                        setFormData({ ...formData, js_number: limited });
                      }}
                      className="w-full px-3 py-2 rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' } as React.CSSProperties}
                      placeholder="Ex: 123456 (max 7 chiffres)"
                      maxLength={7}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Numéro de licence ASF
                    </label>
                    <input
                      type="text"
                      value={formData.asf_licence_number}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/[^\d]/g, '');
                        const limited = digits.slice(0, 7);
                        setFormData({ ...formData, asf_licence_number: limited });
                      }}
                      className="w-full px-3 py-2 rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' } as React.CSSProperties}
                      placeholder="Ex: 123456 (max 7 chiffres)"
                      maxLength={7}
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">
                  4. Coordonnées
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' } as React.CSSProperties}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Numéro de mobile *
                    </label>
                    <PhoneInput
                      value={formData.phone}
                      onChange={(v) => setFormData({ ...formData, phone: v })}
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">
                  5. Adresse
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Adresse (rue + numéro) *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' } as React.CSSProperties}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Code postal *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.postal_code}
                        onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' } as React.CSSProperties}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Ville *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' } as React.CSSProperties}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">
                  6. Acces a l'application
                </h3>

                <div className="space-y-4">
                  <label className={`flex items-center gap-2 ${editingCoach?.can_login ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`} style={{ color: 'var(--text-primary)' }}>
                    <input
                      type="checkbox"
                      checked={canLogin === true}
                      onChange={(e) => setCanLogin(e.target.checked)}
                      disabled={editingCoach?.can_login === true}
                      className="rounded"
                    />
                    Autoriser la connexion à l'app
                  </label>
                  {editingCoach?.can_login === true && (
                    <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                      Pour retirer l'acces, utilisez le bouton Desactiver l'acces ci-dessous.
                    </p>
                  )}

                  {canLogin && (
                    <div className="pl-6 space-y-4 border-l-2" style={{ borderColor: 'var(--border-color)' }}>
                      {editingCoach?.user_id ? (
                        <div className="space-y-3">
                              <div className="space-y-2">
                                <div className="flex items-center gap-2" style={{ color: 'var(--success-text)' }}>
                                  <span><Check className="w-4 h-4 inline mr-1" />Compte actif</span>
                                </div>
                                <div className="text-sm">
                                  Le coach peut se connecter avec :
                                </div>
                                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                  <Mail className="w-4 h-4 inline mr-1" />{editingCoach.email}
                                </div>
                              </div>

                              {!showResetPassword ? (
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    variant="primary"
                                    size="sm"
                                    onClick={() => setShowResetPassword(true)}
                                    leftIcon={<Key size={16} />}
                                  >
                                    Réinitialiser le mot de passe
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="danger"
                                    size="sm"
                                    onClick={handleDisableAccess}
                                    leftIcon={<UserX size={16} />}
                                  >
                                    Désactiver l'accès
                                  </Button>
                                </div>
                              ) : (
                                <div className="space-y-3 p-4 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
                                  <h4 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Réinitialiser le mot de passe</h4>
                                  <div>
                                    <label className="block text-sm font-medium mb-1">
                                      Nouveau mot de passe
                                    </label>
                                    <PasswordInput
                                      value={newPassword}
                                      onChange={(e) => { setNewPassword(e.target.value); setNewPasswordErrors(null); }}
                                      className="w-full px-3 py-2 rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' } as React.CSSProperties}
                                      placeholder="Mot de passe"
                                    />
                                    <PasswordLengthHint password={newPassword} errors={newPasswordErrors} />
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium mb-1">
                                      Confirmer
                                    </label>
                                    <PasswordInput
                                      value={confirmNewPassword}
                                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                                      className="w-full px-3 py-2 rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' } as React.CSSProperties}
                                    />
                                    <PasswordMismatchHint password={newPassword} confirmPassword={confirmNewPassword} />
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      type="button"
                                      variant="primary"
                                      size="sm"
                                      onClick={handleResetPassword}
                                      disabled={!canResetPassword}
                                    >
                                      Enregistrer
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => {
                                        setShowResetPassword(false);
                                        setNewPassword('');
                                        setConfirmNewPassword('');
                                        setNewPasswordErrors(null);
                                      }}
                                    >
                                      Annuler
                                    </Button>
                                  </div>
                                </div>
                              )}
                        </div>
                      ) : !editingCoach?.can_login ? (
                        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Cochez « Autoriser la connexion » et enregistrez pour générer l'accès.
                          Vous pourrez ensuite envoyer l'invitation par email via l'icône d'envoi dans la liste des entraîneurs.
                        </div>
                      ) : (
                        <div className="space-y-3 p-4 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
                          <div className="text-sm">
                            <Mail className="w-4 h-4 inline mr-1" /><strong>Lien d'invitation</strong>
                          </div>
                          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                            Envoyez ce lien au coach pour qu'il crée lui-même son mot de passe.
                          </div>
                          <Button
                            type="button"
                            variant="primary"
                            onClick={handleGenerateInvite}
                            leftIcon={<Copy size={16} />}
                          >
                            <Clipboard className="w-4 h-4 inline mr-1" />Copier le lien d'invitation
                          </Button>
                          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            Lien valable jusqu'à utilisation.
                          </div>
                          <div className="pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
                            <Button
                              type="button"
                              variant="danger"
                              size="sm"
                              onClick={handleDisableAccess}
                              leftIcon={<UserX size={16} />}
                            >
                              Retirer l'acces / annuler l'invitation
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              </div>

              <div style={{ display: activeTab === 'formation' ? 'block' : 'none' }} className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">
                    Diplôme d'entraîneur
                  </h3>
                  <select
                    value={formData.qualification_id}
                    onChange={(e) => setFormData({ ...formData, qualification_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg focus:outline-none"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' } as React.CSSProperties}
                  >
                    <option value="">Aucun diplôme</option>
                    {qualifications.map((qual) => (
                      <option key={qual.id} value={qual.id} title={qual.description}>
                        {qual.name}
                      </option>
                    ))}
                  </select>
                </div>

                {showJsFormationFields && (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-1 flex items-center gap-2">
                        Date d'expiration du diplôme
                        {isDiplomaExpired(formData.diploma_expiry_date) && <ExpiredBadge />}
                      </label>
                      <input
                        type="date"
                        value={formData.diploma_expiry_date}
                        onChange={(e) => setFormData({ ...formData, diploma_expiry_date: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg focus:outline-none"
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' } as React.CSSProperties}
                      />
                      <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>Ex: 31.12.2026</p>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'var(--bg-hover)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '10px',
                        padding: '16px',
                      }}
                    >
                      <div>
                        <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>
                          Désire aller en formation
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                          Si désactivé et le diplôme expire, la qualification sera automatiquement retirée.
                        </div>
                      </div>
                      <div
                        onClick={() => canEdit && setFormData({ ...formData, wants_js_renewal: !formData.wants_js_renewal })}
                        style={{
                          width: '48px',
                          height: '26px',
                          background: formData.wants_js_renewal ? 'var(--success)' : 'var(--bg-input)',
                          borderRadius: '99px',
                          cursor: canEdit ? 'pointer' : 'not-allowed',
                          opacity: canEdit ? 1 : 0.5,
                          position: 'relative',
                          transition: 'background 0.2s',
                          flexShrink: 0,
                          marginLeft: '20px',
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            top: '3px',
                            left: formData.wants_js_renewal ? '25px' : '3px',
                            width: '20px',
                            height: '20px',
                            background: 'var(--text-inverse)',
                            borderRadius: '50%',
                            transition: 'left 0.2s',
                            boxShadow: 'var(--shadow-sm)',
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-4 rounded-lg p-4" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-color)' }}>
                      <h4 className="text-sm font-semibold uppercase tracking-wider">
                        Prochain cours J+S
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-1">Date du cours</label>
                          <input
                            type="date"
                            value={formData.next_js_course_date}
                            onChange={(e) => setFormData({ ...formData, next_js_course_date: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg focus:outline-none"
                            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' } as React.CSSProperties}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Numéro du cours</label>
                          <input
                            type="text"
                            value={formData.next_js_course_number}
                            onChange={(e) => setFormData({ ...formData, next_js_course_number: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg focus:outline-none"
                            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' } as React.CSSProperties}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Nom du cours</label>
                          <input
                            type="text"
                            value={formData.next_js_course_name}
                            onChange={(e) => setFormData({ ...formData, next_js_course_name: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg focus:outline-none"
                            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' } as React.CSSProperties}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Lieu du cours</label>
                          <input
                            type="text"
                            value={formData.next_js_course_location}
                            onChange={(e) => setFormData({ ...formData, next_js_course_location: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg focus:outline-none"
                            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' } as React.CSSProperties}
                          />
                        </div>
                      </div>

                      {(() => {
                        const formAllFilled = !!(
                          formData.next_js_course_date &&
                          formData.next_js_course_name &&
                          formData.next_js_course_number &&
                          formData.next_js_course_location
                        );
                        const enabled = !!editingCoach && formAllFilled && !sendingJsNotification;
                        const tooltip = !editingCoach
                          ? "Enregistrez d'abord l'entraîneur"
                          : !formAllFilled
                            ? "Renseignez d'abord les détails du cours"
                            : '';
                        if (!editingCoach) return null;
                        return (
                          <div className="pt-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
                            <button
                              type="button"
                              onClick={handleSaveAndSendJsNotification}
                              disabled={!enabled}
                              title={tooltip || undefined}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                background: enabled ? 'var(--accent)' : 'var(--bg-input)',
                                color: 'var(--text-inverse)',
                                borderRadius: '8px',
                                padding: '8px 16px',
                                fontSize: '13px',
                                fontWeight: 600,
                                cursor: enabled ? 'pointer' : 'not-allowed',
                                opacity: enabled ? 1 : 0.6,
                              }}
                            >
                              {sendingJsNotification ? (
                                <>
                                  <svg className="animate-spin" style={{ width: '16px', height: '16px' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                  </svg>
                                  Enregistrement et envoi...
                                </>
                              ) : (
                                <>
                                  <Mail className="w-4 h-4" />
                                  Enregistrer et notifier le coach
                                </>
                              )}
                            </button>
                            {jsNotifToast && (
                              <div
                                style={{
                                  marginTop: '10px',
                                  padding: '10px 14px',
                                  borderRadius: '8px',
                                  fontSize: '13px',
                                  fontWeight: 600,
                                  background: jsNotifToast.type === 'success' ? 'var(--success-soft)' : 'var(--danger-soft)',
                                  border: `1px solid ${jsNotifToast.type === 'success' ? 'var(--success)' : 'var(--danger)'}`,
                                  color: jsNotifToast.type === 'success' ? 'var(--success-text)' : 'var(--danger-text)',
                                }}
                              >
                                {jsNotifToast.message}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </>
                )}
              </div>

              {editingCoach && (coachTeamsMap[editingCoach.id] || []).length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">Équipes et rôles</h3>
                  <div className="rounded-lg p-3 space-y-1" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
                    {coachTeamsMap[editingCoach.id].map((t, i) => (
                      <div key={i} className="text-sm" style={{ color: 'var(--text-primary)' }}>
                        <span style={{ fontWeight: 500 }}>{t.name}</span>
                        <span className="ml-1.5" style={{ color: 'var(--text-muted)' }}>— {STAFF_ROLE_LABELS[t.role] || t.role}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>Le staff se gère dans la fiche de l'équipe.</p>
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider flex items-center gap-2">
                  <Landmark size={14} /> Coordonnées bancaires
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">IBAN</label>
                    <input
                      type="text"
                      value={bankDetails.iban}
                      onChange={(e) => { setBankDetails({ ...bankDetails, iban: e.target.value }); setBankError(''); }}
                      className="w-full px-3 py-2 rounded-lg focus:outline-none font-mono"
                      style={{ background: 'var(--bg-input)', border: `1px solid ${bankError ? 'var(--danger)' : 'var(--border-color)'}`, color: 'var(--text-primary)' } as React.CSSProperties}
                      placeholder="CH00 0000 0000 0000 0000 0"
                    />
                    {bankError && <p className="mt-1 text-xs" style={{ color: 'var(--danger-text)' }}>{bankError}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Titulaire du compte</label>
                      <input
                        type="text"
                        value={bankDetails.account_holder}
                        onChange={(e) => setBankDetails({ ...bankDetails, account_holder: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg focus:outline-none"
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' } as React.CSSProperties}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Banque</label>
                      <input
                        type="text"
                        value={bankDetails.bank_name}
                        onChange={(e) => setBankDetails({ ...bankDetails, bank_name: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg focus:outline-none"
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' } as React.CSSProperties}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowModal(false)}
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                >
                  {editingCoach ? 'Enregistrer' : 'Créer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewingCoach && !showModal && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setViewingCoach(null)} />
          <div className="fixed right-0 top-0 h-full z-50 overflow-y-auto" style={{ width: '600px', background: 'var(--bg-card)', borderLeft: '1px solid var(--border-color)' }}>
            <div className="sticky top-0 px-6 py-4 flex items-center justify-between" style={{ background: 'var(--bg-modal-header)' }}>
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-modal-header)' }}>
                {viewingCoach.first_name} {viewingCoach.last_name}
              </h2>
              <button onClick={() => setViewingCoach(null)} className="hover:opacity-80" style={{ color: 'var(--text-modal-header)' }}>
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="mb-1" style={{ color: 'var(--text-secondary)' }}>Email</div>
                  <div style={{ color: 'var(--text-primary)' }}>{viewingCoach.email}</div>
                </div>
                <div>
                  <div className="mb-1" style={{ color: 'var(--text-secondary)' }}>Mobile</div>
                  <div style={{ color: 'var(--text-primary)' }}>{viewingCoach.phone || '-'}</div>
                </div>
                <div>
                  <div className="mb-1" style={{ color: 'var(--text-secondary)' }}>Date de naissance</div>
                  <div style={{ color: 'var(--text-primary)' }}>{viewingCoach.birth_date ? new Date(viewingCoach.birth_date).toLocaleDateString('fr-CH') : '-'}</div>
                </div>
                <div>
                  <div className="mb-1" style={{ color: 'var(--text-secondary)' }}>Ville</div>
                  <div style={{ color: 'var(--text-primary)' }}>{viewingCoach.city || '-'}</div>
                </div>
                <div>
                  <div className="mb-1" style={{ color: 'var(--text-secondary)' }}>Qualification</div>
                  <div style={{ color: 'var(--text-primary)' }}>{viewingCoach.coaching_qualifications?.name || '-'}</div>
                </div>
                <div>
                  <div className="mb-1" style={{ color: 'var(--text-secondary)' }}>Statut</div>
                  <div>{getStatusBadge(viewingCoach.status, viewingCoach.invite_sent_at)}</div>
                </div>
                {viewingCoach.coaching_qualifications?.validity_years != null && (
                  <>
                    <div>
                      <div className="mb-1" style={{ color: 'var(--text-secondary)' }}>Date d'expiration</div>
                      <div className="flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                        {viewingCoach.diploma_expiry_date
                          ? new Date(viewingCoach.diploma_expiry_date).toLocaleDateString('fr-CH')
                          : '—'}
                        {isDiplomaExpired(viewingCoach.diploma_expiry_date) && <ExpiredBadge />}
                      </div>
                    </div>
                    {viewingCoach.next_js_course_date && (
                      <div>
                        <div className="mb-1" style={{ color: 'var(--text-secondary)' }}>Prochain cours J+S</div>
                        <div style={{ color: 'var(--text-primary)' }}>
                          {new Date(viewingCoach.next_js_course_date).toLocaleDateString('fr-CH')}
                          {viewingCoach.next_js_course_name ? ` · ${viewingCoach.next_js_course_name}` : ''}
                          {viewingCoach.next_js_course_number ? ` · N° ${viewingCoach.next_js_course_number}` : ''}
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="mb-1" style={{ color: 'var(--text-secondary)' }}>Renouvellement souhaité</div>
                      <div className="flex items-center gap-1.5">
                        {viewingCoach.wants_js_renewal !== false ? (
                          <>
                            <Check size={16} style={{ color: 'var(--success-text)' }} />
                            <span style={{ color: 'var(--text-primary)' }}>Oui</span>
                          </>
                        ) : (
                          <>
                            <X size={16} style={{ color: 'var(--danger-text)' }} />
                            <span style={{ color: 'var(--text-primary)' }}>Non</span>
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}
                <div>
                  <div className="mb-1" style={{ color: 'var(--text-secondary)' }}>Acces app</div>
                  <div style={{ color: 'var(--text-primary)' }}>{viewingCoach.can_login ? 'Peut se connecter' : 'Pas d\'acces'}</div>
                </div>
                {viewingCoach.salutation && (
                  <div>
                    <div className="mb-1" style={{ color: 'var(--text-secondary)' }}>Civilité</div>
                    <div style={{ color: 'var(--text-primary)' }}>{viewingCoach.salutation}</div>
                  </div>
                )}
                {viewingCoach.nationality && (
                  <div>
                    <div className="mb-1" style={{ color: 'var(--text-secondary)' }}>Nationalité</div>
                    <div style={{ color: 'var(--text-primary)' }}>{viewingCoach.nationality}</div>
                  </div>
                )}
                {viewingCoach.member_since && (
                  <div>
                    <div className="mb-1" style={{ color: 'var(--text-secondary)' }}>Membre depuis</div>
                    <div style={{ color: 'var(--text-primary)' }}>{new Date(viewingCoach.member_since).toLocaleDateString('fr-CH')}</div>
                  </div>
                )}
              </div>
              {viewingCoach.notes && (
                <div className="pt-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
                  <div className="mb-1 text-sm" style={{ color: 'var(--text-secondary)' }}>Remarques</div>
                  <div className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{viewingCoach.notes}</div>
                </div>
              )}
              {(coachTeamsMap[viewingCoach.id] || []).length > 0 && (
                <div className="pt-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
                  <div className="mb-1 text-sm" style={{ color: 'var(--text-secondary)' }}>Équipes</div>
                  <div className="flex flex-col gap-1">
                    {coachTeamsMap[viewingCoach.id].map((t, i) => (
                      <div key={i} className="text-sm" style={{ color: 'var(--text-primary)' }}>
                        <span style={{ fontWeight: 500 }}>{t.name}</span>
                        <span className="ml-1.5" style={{ color: 'var(--text-muted)' }}>{STAFF_ROLE_LABELS[t.role] || t.role}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {viewBankDetails?.iban && (
                <div className="pt-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
                  <div className="mb-1 text-sm flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                    <Landmark size={14} /> Coordonnées bancaires
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                        {showIban
                          ? viewBankDetails.iban.replace(/(.{4})/g, '$1 ').trim()
                          : viewBankDetails.iban.slice(0, 2) + '••••••••••••' + viewBankDetails.iban.slice(-4)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowIban(!showIban)}
                        className="p-1 rounded hover:opacity-70 flex items-center"
                        style={{ color: 'var(--accent)' }}
                      >
                        {showIban ? <EyeOff size={14} /> : <Eye size={14} />}
                        <span className="ml-1 text-xs">{showIban ? 'Masquer' : 'Afficher'}</span>
                      </button>
                    </div>
                    {viewBankDetails.account_holder && (
                      <div style={{ color: 'var(--text-primary)' }}>{viewBankDetails.account_holder}</div>
                    )}
                    {viewBankDetails.bank_name && (
                      <div style={{ color: 'var(--text-muted)' }}>{viewBankDetails.bank_name}</div>
                    )}
                  </div>
                </div>
              )}
              {viewingCoach.linked_member && (
                <div className="pt-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
                  <div className="text-sm flex items-center gap-2">
                    <Link2 size={14} style={{ color: 'var(--accent)' }} />
                    <span style={{ color: 'var(--text-secondary)' }}>Fiche joueur :</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                      {viewingCoach.linked_member.first_name} {viewingCoach.linked_member.last_name}
                      {viewingCoach.linked_member.teams?.name && ` (${viewingCoach.linked_member.teams.name})`}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 p-6 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <Button
                variant="secondary"
                onClick={() => setViewingCoach(null)}
              >
                Fermer
              </Button>
              {canEdit && (
                <Button
                  onClick={() => { openModal(viewingCoach); setViewingCoach(null); }}
                  leftIcon={<Pencil size={16} />}
                >
                  Modifier
                </Button>
              )}
            </div>
          </div>
        </>
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

      <StandardModal
        isOpen={showDisableConfirm}
        onClose={() => { if (disabling) return; setShowDisableConfirm(false); setDisableConfirmInput(''); }}
        title="Désactiver l'accès"
        width="460px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{
            background: 'var(--danger-soft)',
            border: '1px solid var(--danger)',
            borderRadius: '8px',
            padding: '12px 14px',
            color: 'var(--danger-text)',
            fontSize: '13px',
            lineHeight: 1.5,
          }}>
            <div style={{ fontWeight: 600, marginBottom: '6px' }}>
              Désactiver l'accès de {editingCoach?.first_name} {editingCoach?.last_name} ?
            </div>
            Le compte utilisateur, le profil et les rôles seront <strong>supprimés</strong>. Le coach ne pourra plus se connecter et devra être ré-invité pour retrouver l'accès.
            <br /><br />
            Le coach <strong>reste</strong> dans les listes d'équipes ; les présences et conversations de groupe sont conservées.
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Pour confirmer, tapez <strong>DESACTIVER</strong> ci-dessous :
            </label>
            <input
              type="text"
              value={disableConfirmInput}
              onChange={(e) => setDisableConfirmInput(e.target.value)}
              autoFocus
              disabled={disabling}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              placeholder="DESACTIVER"
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setShowDisableConfirm(false); setDisableConfirmInput(''); }}
              disabled={disabling}
            >
              Annuler
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={confirmDisableAccess}
              disabled={disableConfirmInput.trim().toUpperCase() !== 'DESACTIVER' || disabling}
            >
              {disabling ? 'Désactivation...' : "Désactiver l'accès"}
            </Button>
          </div>
        </div>
      </StandardModal>

      {(() => {
        const deleteCoach = coaches.find(c => c.id === deleteCoachId);
        const closeDeleteFlow = () => {
          if (deletingCoach) return;
          setDeleteStep(0);
          setDeleteCoachId(null);
          setDeleteConfirmInput('');
        };
        const finalDisabled = deleteConfirmInput.trim().toUpperCase() !== 'EFFACER' || deletingCoach;
        const stepTitle =
          deleteStep === 1 ? "Supprimer l'entraîneur"
          : deleteStep === 2 ? 'Confirmation'
          : deleteStep === 3 ? 'Confirmation finale'
          : '';
        return (
          <StandardModal
            isOpen={deleteStep !== 0}
            onClose={closeDeleteFlow}
            title={stepTitle}
            width="460px"
          >
            {deleteStep === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                  Êtes-vous sûr de vouloir supprimer{' '}
                  <strong>{deleteCoach?.first_name} {deleteCoach?.last_name}</strong> ?
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <Button type="button" variant="secondary" onClick={closeDeleteFlow} disabled={deletingCoach}>
                    Non
                  </Button>
                  <Button type="button" variant="danger" onClick={() => setDeleteStep(2)}>
                    Oui
                  </Button>
                </div>
              </div>
            )}

            {deleteStep === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{
                  background: 'var(--danger-soft)',
                  border: '1px solid var(--danger)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  color: 'var(--danger-text)',
                  fontSize: '13px',
                  lineHeight: 1.5,
                }}>
                  Cette action est <strong>définitive</strong>. Le compte de{' '}
                  <strong>{deleteCoach?.first_name} {deleteCoach?.last_name}</strong>, son profil et son accès seront supprimés. Le coach sera retiré de ses équipes (les équipes resteront sans entraîneur jusqu'à réassignation). Les présences saisies et les conversations de groupe sont conservées. Les messages personnels du coach seront supprimés.
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <Button type="button" variant="secondary" onClick={closeDeleteFlow} disabled={deletingCoach}>
                    Annuler
                  </Button>
                  <Button type="button" variant="danger" onClick={() => setDeleteStep(3)}>
                    Continuer
                  </Button>
                </div>
              </div>
            )}

            {deleteStep === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
                    Pour confirmer la suppression définitive, tapez <strong>EFFACER</strong> ci-dessous :
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmInput}
                    onChange={(e) => setDeleteConfirmInput(e.target.value)}
                    autoFocus
                    disabled={deletingCoach}
                    placeholder="EFFACER"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      background: 'var(--bg-input)',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={closeDeleteFlow}
                    disabled={deletingCoach}
                  >
                    Annuler
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    onClick={confirmDeleteCoach}
                    disabled={finalDisabled}
                  >
                    {deletingCoach ? 'Suppression...' : 'Supprimer définitivement'}
                  </Button>
                </div>
              </div>
            )}
          </StandardModal>
        );
      })()}

      <Toast toast={toast} />
    </div>
  );
}
