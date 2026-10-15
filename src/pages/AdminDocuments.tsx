import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { safeUUID } from '../lib/ids';
import { invokeFunction } from '../lib/invokeFunction';
import { useAuth } from '../context/AuthContext';
import { useWebsiteModuleEnabled } from '../hooks/useWebsiteModuleEnabled';
import { Plus, X, Download, Trash2, FileText, Image, Pencil, Globe } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';
import useEscapeKey from '../hooks/useEscapeKey';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import { useConfirmModal } from '../hooks/useConfirmModal';
import type * as XLSXTypes from 'xlsx';
import GroupementBadge from '../components/GroupementBadge';
import { Tabs } from '../components/ui/Tabs';
import SearchInput from '../components/ui/SearchInput';
import Button from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';

const CATEGORIES = [
  { value: 'pv_ag',                label: 'PV Assemblée générale' },
  { value: 'pv_technique',         label: 'PV Séances techniques' },
  { value: 'divers',               label: 'Documents divers' },
  { value: 'charte_joueurs',       label: 'Charte joueurs (adultes)' },
  { value: 'charte_joueurs_mineurs', label: 'Charte enfants & parents' },
  { value: 'charte_entraineurs',   label: 'Charte entraîneurs' },
] as const;

type CategoryValue = typeof CATEGORIES[number]['value'];

interface Season { id: string; name: string; active?: boolean; }
interface AGSession { id: string; title: string; date: string; }
interface Team { id: string; name: string; active?: boolean; }
interface Doc {
  id: string;
  title: string;
  description?: string;
  category: CategoryValue;
  file_url: string;
  file_name: string;
  file_type: string;
  is_active: boolean;
  created_at: string;
  season_id?: string;
  ag_session_id?: string;
  target_team_ids?: string[] | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  seasons?: { name: string };
  profiles?: { first_name?: string; last_name?: string; email: string };
  deleted_profile?: { first_name?: string; last_name?: string; email: string } | null;
}
interface Ack {
  id: string;
  acknowledged_at: string;
  user_id: string;
  member_id?: string | null;
  validated_by_parent_id?: string | null;
  email_sent_at?: string | null;
}
interface ParentInfo {
  userId: string;
  firstName: string;
  lastName: string;
  email?: string;
}
interface TrackingRow {
  key: string;
  name: string;
  role: string;
  teams: string;
  email?: string;
  userId?: string;
  memberId?: string;
  status: 'validated' | 'pending';
  acknowledgedAt?: string;
  validatedByName?: string;
  emailSent: boolean;
  emailSentAt?: string;
  birthDate?: string;
  age?: number | null;
  parents?: ParentInfo[];
  validatedByParentId?: string | null;
  parentEmails?: string[];
  hasParent?: boolean;
  playerName?: string;
  memberStatus?: string | null;
  groupementId?: string | null;
  groupementName?: string | null;
}
interface CharteNotif {
  id: string;
  document_id: string;
  recipient_email: string;
  recipient_user_id: string | null;
  recipient_member_id: string | null;
  is_test: boolean;
  sent_at: string;
}

interface CharteTeamRpc {
  team_id: string;
  team_name: string;
  expected: number;
  validated: number;
  missing: { member_id: string; name: string }[];
}
interface CharteDocRpc {
  id: string;
  title: string;
  category: string;
  created_at: string;
  expected: number;
  validated: number;
  teams?: CharteTeamRpc[];
  missing?: { coach_id: string; name: string }[];
}

function getCategoryLabel(v: string) {
  return CATEGORIES.find(c => c.value === v)?.label ?? v;
}

function formatValidatedAt(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yyyy} à ${hh}:${mi}`;
}

export function AdminDocuments() {
  const { user } = useAuth();
  const { enabled: websiteEnabled } = useWebsiteModuleEnabled()

  const [docs, setDocs] = useState<Doc[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [agSessions, setAGSessions] = useState<AGSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editDoc, setEditDoc] = useState<Doc | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    category: 'divers' as CategoryValue,
    season_id: '',
    is_active: true,
    file: null as File | null,
    target_team_ids: [] as string[],
    all_teams: true,
    publish_on_site: false,
  });
  const [actionLoading, setActionLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');

  const [filterSeason, setFilterSeason] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [viewMode, setViewMode] = useState<'active' | 'archives'>('active');

  const [deleteStep, setDeleteStep] = useState<'closed' | 'simple' | 'warn' | 'final'>('closed');
  const [deleteTarget, setDeleteTarget] = useState<Doc | null>(null);
  const [deleteAckCount, setDeleteAckCount] = useState(0);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [archiveAckModal, setArchiveAckModal] = useState<{ doc: Doc; acks: Ack[] } | null>(null);

  const [charteTab, setCharteTab] = useState<'charte_joueurs_parents' | 'charte_joueurs_adults' | 'charte_entraineurs'>('charte_joueurs_parents');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNoParentModal, setShowNoParentModal] = useState(false);
  const [resendingKey, setResendingKey] = useState<string | null>(null);
  const [acks, setAcks] = useState<Ack[]>([]);
  const [acksLoading, setAcksLoading] = useState(false);
  const [trackingRows, setTrackingRows] = useState<TrackingRow[]>([]);
  const [charteRpcDocs, setCharteRpcDocs] = useState<CharteDocRpc[]>([]);
  const [charteRpcLoading, setCharteRpcLoading] = useState(false);
  const [trackingLoaded, setTrackingLoaded] = useState(false);
  const [trackingFilter, setTrackingFilter] = useState<'all' | 'validated' | 'pending' | 'no_parent'>('all');
  const [excludedCoachCount, setExcludedCoachCount] = useState(0);
  const [charteTeamFilter, setCharteTeamFilter] = useState<string>('all');
  const [sendingReminder, setSendingReminder] = useState(false);
  const [notifs, setNotifs] = useState<CharteNotif[]>([]);

  const [showSendModal, setShowSendModal] = useState(false);
  const [sendMode, setSendMode] = useState<'choice' | 'test' | 'confirmAll'>('choice');
  const [testSelected, setTestSelected] = useState<string[]>([]);
  const [testSearch, setTestSearch] = useState('');
  const [testRoleFilter, setTestRoleFilter] = useState<'all' | 'Joueur (mineur)' | 'Parent' | 'Entraîneur'>('all');
  const [testTeamFilter, setTestTeamFilter] = useState<string>('all');
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ sent: number; total: number } | null>(null);

  const { toast, showToast } = useToast();
  const { confirmState, showConfirm, hideConfirm } = useConfirmModal();

  const [confirm, setConfirm] = useState<{
    isOpen: boolean; title: string; message: string; onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const [form, setForm] = useState({
    title: '',
    category: 'divers' as CategoryValue,
    season_id: '',
    ag_session_id: '',
    description: '',
    file: null as File | null,
    target_team_ids: [] as string[],
    all_teams: true,
    publish_on_site: false,
  });

  const closeModal = useCallback(() => setShowModal(false), []);
  const closeEditModal = useCallback(() => { setShowEditModal(false); setEditDoc(null); }, []);
  useEscapeKey(() => { closeModal(); closeEditModal(); });

  function openEditModal(doc: Doc) {
    setEditDoc(doc);
    setEditForm({
      title: doc.title,
      description: doc.description ?? '',
      category: doc.category,
      season_id: doc.season_id ?? '',
      is_active: doc.is_active,
      file: null,
      target_team_ids: doc.target_team_ids ?? [],
      publish_on_site: (doc as any).publish_on_site ?? false,
      all_teams: !doc.target_team_ids || doc.target_team_ids.length === 0,
    });
    setShowEditModal(true);
  }

  async function handleUpdate() {
    if (!editDoc) return;
    if (!editForm.title.trim() || !editForm.category || !editForm.season_id) {
      showToast('Veuillez remplir tous les champs obligatoires.', 'warning');
      return;
    }
    if (editForm.file && editForm.file.size > 10 * 1024 * 1024) {
      showToast('Le fichier ne peut pas dépasser 10 MB.', 'warning');
      return;
    }
    setActionLoading(true);
    setUploadStatus('Enregistrement…');
    try {
      let file_url = editDoc.file_url;
      let file_name = editDoc.file_name;
      let file_type = editDoc.file_type;

      if (editForm.file) {
        setUploadStatus('Upload en cours…');
        const ext = editForm.file.name.split('.').pop()?.toLowerCase() ?? '';
        const newFileType = ext === 'pdf' ? 'pdf' : 'image';
        const storagePath = `${editForm.season_id}/${editForm.category}/${safeUUID()}-${editForm.file.name}`;
        const { error: upErr } = await supabase.storage
          .from('documents')
          .upload(storagePath, editForm.file, { contentType: editForm.file.type });
        if (upErr) throw upErr;
        await supabase.storage.from('documents').remove([editDoc.file_url]);
        file_url = storagePath;
        file_name = editForm.file.name;
        file_type = newFileType;
      }

      setUploadStatus('Enregistrement…');
      const targetTeams =
        editForm.category === 'charte_entraineurs' && !editForm.all_teams && editForm.target_team_ids.length > 0
          ? editForm.target_team_ids
          : null;
      const { error: updErr } = await supabase.from('documents').update({
        title: editForm.title.trim(),
        category: editForm.category,
        season_id: editForm.season_id,
        description: editForm.description.trim() || null,
        is_active: editForm.is_active,
        file_url,
        file_name,
        file_type,
        target_team_ids: targetTeams,
        publish_on_site: (editForm.category === 'pv_ag' || (editForm.target_team_ids.length > 0 && !editForm.all_teams)) ? false : editForm.publish_on_site,
      }).eq('id', editDoc.id);
      if (updErr) throw updErr;

      setUploadStatus('');
      closeEditModal();
      await loadDocs();
    } catch (err: any) {
      setUploadStatus('');
      showToast('Erreur : ' + err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  }

  useEffect(() => {
    document.title = 'Admin Documents - ClubSphere';
    init();
  }, []);

  useEffect(() => { loadDocs(); }, [filterSeason, filterCategory, viewMode]);
  useEffect(() => { loadCharteFollowup(); }, [charteTab, filterSeason, seasons]);


  async function init() {
    const [{ data: s }, { data: ag }, { data: t }] = await Promise.all([
      supabase.from('seasons').select('id, name, active').order('name', { ascending: false }),
      supabase.from('meetings')
        .select('id, title, date')
        .or('type.eq.ag,title.ilike.%AG%,title.ilike.%assemblée%')
        .order('date', { ascending: false }),
      supabase.from('teams').select('id, name, level_rank, active').eq('active', true).order('level_rank').order('name'),
    ]);
    const seasonList: Season[] = s ?? [];
    setSeasons(seasonList);
    setAGSessions(ag ?? []);
    setTeams((t ?? []) as Team[]);
    const active = seasonList.find(x => x.active);
    if (active) setForm(p => ({ ...p, season_id: active.id }));
    await loadDocs();
    setLoading(false);
  }

  async function loadDocs() {
    let q = supabase
      .from('documents')
      .select('*, seasons(name), profiles:uploaded_by(first_name, last_name, email), deleted_profile:deleted_by(first_name, last_name, email)')
      .order('created_at', { ascending: false });
    if (viewMode === 'active') q = q.eq('is_active', true);
    else q = q.eq('is_active', false);
    if (filterSeason !== 'all') q = q.eq('season_id', filterSeason);
    if (filterCategory !== 'all') q = q.eq('category', filterCategory);
    const { data } = await q;
    setDocs((data ?? []) as Doc[]);
  }

  function charteDocCategoryFor(tab: typeof charteTab): CategoryValue {
    if (tab === 'charte_entraineurs') return 'charte_entraineurs';
    if (tab === 'charte_joueurs_parents') return 'charte_joueurs_mineurs';
    return 'charte_joueurs';
  }

  async function loadCharteFollowup() {
    let sid = filterSeason !== 'all' ? filterSeason : null;
    if (!sid) {
      // "Toutes les saisons": find the most recent season that has a published charter
      for (const s of seasons) {
        const hasCharte = docs.some(d => d.season_id === s.id && (d.category === 'charte_joueurs' || d.category === 'charte_joueurs_mineurs' || d.category === 'charte_entraineurs') && d.is_active);
        if (hasCharte) { sid = s.id; break; }
      }
      if (!sid) sid = seasons.find(s => s.active)?.id ?? null;
    }
    if (!sid) return;
    setCharteRpcLoading(true);
    setTrackingLoaded(false);
    setTrackingRows([]);
    try {
      const { data, error } = await supabase.rpc('get_charte_followup', { p_season_id: sid });
      if (error) { setCharteRpcDocs([]); }
      else { setCharteRpcDocs(((data as any)?.documents ?? []) as CharteDocRpc[]); }
    } catch { setCharteRpcDocs([]); }
    setCharteRpcLoading(false);
  }

  async function fetchAcksAndNotifs(docId: string) {
    const [{ data: ackData }, { data: notifData }] = await Promise.all([
      supabase
        .from('document_acknowledgements')
        .select('id, acknowledged_at, user_id, member_id, validated_by_parent_id, email_sent_at')
        .eq('document_id', docId),
      supabase
        .from('charte_notifications')
        .select('id, document_id, recipient_email, recipient_user_id, recipient_member_id, is_test, sent_at')
        .eq('document_id', docId)
        .eq('is_test', false),
    ]);
    return {
      ackList: (ackData ?? []) as Ack[],
      notifList: (notifData ?? []) as CharteNotif[],
    };
  }

  async function ensureTrackingLoaded() {
    if (trackingLoaded) return;
    const docCategory = charteDocCategoryFor(charteTab);
    const charteDoc = docs.find(d => d.category === docCategory && d.is_active);
    if (!charteDoc) { setTrackingRows([]); setTrackingLoaded(true); return; }
    setAcksLoading(true);
    const { ackList, notifList } = await fetchAcksAndNotifs(charteDoc.id);
    setAcks(ackList);
    setNotifs(notifList);
    const rpcDoc = charteRpcDocs.find(d => d.category === docCategory);
    const result = await buildTrackingRows(charteDoc, ackList, notifList, rpcDoc ?? null);
    setTrackingRows(result.rows);
    setExcludedCoachCount(result.excludedCoaches);
    setTrackingLoaded(true);
    setAcksLoading(false);
  }

  async function loadAcks() {
    const docCategory = charteDocCategoryFor(charteTab);
    const charteDoc = docs.find(d => d.category === docCategory && d.is_active);
    if (!charteDoc) { setAcks([]); setTrackingRows([]); setNotifs([]); return; }
    setAcksLoading(true);
    const { ackList, notifList } = await fetchAcksAndNotifs(charteDoc.id);
    setAcks(ackList);
    setNotifs(notifList);
    const rpcDoc = charteRpcDocs.find(d => d.category === docCategory);
    const result = await buildTrackingRows(charteDoc, ackList, notifList, rpcDoc ?? null);
    setTrackingRows(result.rows);
    setExcludedCoachCount(result.excludedCoaches);
    setAcksLoading(false);
  }

  async function buildTrackingRows(doc: Doc, ackList: Ack[], notifList: CharteNotif[], rpcDoc: CharteDocRpc | null): Promise<{ rows: TrackingRow[]; excludedCoaches: number }> {
    const rows: TrackingRow[] = [];
    if (!rpcDoc) return { rows, excludedCoaches: 0 };
    let excludedCoaches = 0;

    const notifByEmail = new Map<string, CharteNotif>();
    for (const n of notifList) {
      const key = n.recipient_email.toLowerCase();
      const existing = notifByEmail.get(key);
      if (!existing || new Date(n.sent_at) > new Date(existing.sent_at)) {
        notifByEmail.set(key, n);
      }
    }
    const getNotifFor = (email?: string) => email ? notifByEmail.get(email.toLowerCase()) : undefined;

    const parentProfiles = new Map<string, { first_name?: string; last_name?: string }>();
    const parentIds = ackList.map(a => a.validated_by_parent_id).filter(Boolean) as string[];
    if (parentIds.length) {
      const { data: pp } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', parentIds);
      for (const p of pp ?? []) parentProfiles.set(p.id, p);
    }

    if (doc.category === 'charte_joueurs' || doc.category === 'charte_joueurs_mineurs') {
      const isMinorsDoc = doc.category === 'charte_joueurs_mineurs';

      // Collect all member IDs from the RPC (missing = pending)
      const pendingMemberIds = new Set<string>();
      for (const team of rpcDoc.teams ?? []) {
        for (const m of team.missing) pendingMemberIds.add(m.member_id);
      }

      // Validated member IDs come from acknowledgements
      const ackByMember = new Map<string, Ack>();
      for (const a of ackList) {
        if (a.member_id) ackByMember.set(a.member_id, a);
      }

      // Build a map from RPC team data: member_id → team_name (for pending members)
      const rpcMemberTeam = new Map<string, string>();
      const rpcTeamIds = new Set<string>();
      const rpcTeamValidatedQuota = new Map<string, number>();
      for (const team of rpcDoc.teams ?? []) {
        rpcTeamIds.add(team.team_id);
        rpcTeamValidatedQuota.set(team.team_id, team.expected - team.missing.length);
        for (const m of team.missing) rpcMemberTeam.set(m.member_id, team.team_name);
      }

      // Candidate ack member IDs (may include people outside the RPC population)
      const candidateAckIds = Array.from(ackByMember.keys()).filter(id => !pendingMemberIds.has(id));

      // All IDs we need to look up for enrichment
      const lookupIds = Array.from(new Set([...pendingMemberIds, ...candidateAckIds]));
      if (lookupIds.length === 0) return { rows, excludedCoaches: 0 };

      // Fetch member details for enrichment
      const { data: members } = await supabase
        .from('members')
        .select('id, first_name, last_name, birth_date, email, legal_rep1_firstname, legal_rep1_lastname, legal_rep1_email, legal_rep2_email, team_id, teams:team_id(name), status, groupement_id, groupements(id, name)')
        .in('id', lookupIds);

      const memberMap = new Map<string, any>();
      for (const m of members ?? []) memberMap.set(m.id, m);

      // Filter validated ack members: only keep those whose team is in the RPC
      // and respect per-team validated quota so stray acks don't inflate the list
      const validatedMemberIds = new Set<string>();
      const teamValidatedUsed = new Map<string, number>();
      for (const id of candidateAckIds) {
        const m = memberMap.get(id);
        const teamId = m?.team_id;
        if (!teamId || !rpcTeamIds.has(teamId)) continue;
        const quota = rpcTeamValidatedQuota.get(teamId) ?? 0;
        const used = teamValidatedUsed.get(teamId) ?? 0;
        if (used >= quota) continue;
        teamValidatedUsed.set(teamId, used + 1);
        validatedMemberIds.add(id);
      }

      const allMemberIds = Array.from(new Set([...pendingMemberIds, ...validatedMemberIds]));

      // Fetch parent links for minors
      let parentLinkMap = new Map<string, ParentInfo[]>();
      if (isMinorsDoc) {
        const { data: parentLinks } = await supabase
          .from('parent_members')
          .select('parent_user_id, member_id, profiles:parent_user_id(id, first_name, last_name, email)')
          .in('member_id', allMemberIds);
        for (const pl of parentLinks ?? []) {
          const pp = (pl as any).profiles;
          if (!pp) continue;
          const arr = parentLinkMap.get(pl.member_id) ?? [];
          arr.push({
            userId: pp.id,
            firstName: pp.first_name ?? '',
            lastName: pp.last_name ?? '',
            email: pp.email ?? undefined,
          });
          parentLinkMap.set(pl.member_id, arr);
        }
      }

      for (const memberId of allMemberIds) {
        const m = memberMap.get(memberId);
        const ack = ackByMember.get(memberId);
        const isPending = pendingMemberIds.has(memberId);

        // Use RPC team name for pending members, DB team name for validated
        const teamName = isPending
          ? (rpcMemberTeam.get(memberId) ?? m?.teams?.name ?? '—')
          : (m?.teams?.name ?? '—');
        const name = m
          ? `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim()
          : `Membre ${memberId.slice(0, 8)}`;
        const age = m?.birth_date ? calcAge(m.birth_date) : null;
        const grp = m ? (Array.isArray(m.groupements) ? m.groupements[0] : m.groupements) : null;

        if (isMinorsDoc) {
          const parentsForMember: ParentInfo[] = [...(parentLinkMap.get(memberId) ?? [])];
          if (parentsForMember.length === 0 && m?.legal_rep1_firstname) {
            parentsForMember.push({
              userId: '',
              firstName: m.legal_rep1_firstname ?? '',
              lastName: m.legal_rep1_lastname ?? '',
              email: m.legal_rep1_email ?? undefined,
            });
          }
          const parentEmails = parentsForMember.map(p => p.email).filter(Boolean) as string[];
          if (m?.legal_rep2_email && !parentEmails.some(e => e.toLowerCase() === m.legal_rep2_email.toLowerCase())) {
            parentEmails.push(m.legal_rep2_email);
          }

          const sentNotifs = parentEmails.map(e => getNotifFor(e)).filter(Boolean) as CharteNotif[];
          const validatedByName = ack?.validated_by_parent_id
            ? `${parentProfiles.get(ack.validated_by_parent_id)?.first_name ?? ''} ${parentProfiles.get(ack.validated_by_parent_id)?.last_name ?? ''}`.trim()
            : undefined;

          rows.push({
            key: `m-${memberId}`,
            name,
            playerName: name,
            role: 'Joueur (mineur)',
            teams: teamName,
            email: parentEmails.join(', ') || undefined,
            memberId,
            birthDate: m?.birth_date,
            age,
            parents: parentsForMember,
            parentEmails,
            hasParent: parentsForMember.length > 0,
            status: ack ? 'validated' : 'pending',
            acknowledgedAt: ack?.acknowledged_at,
            validatedByParentId: ack?.validated_by_parent_id ?? null,
            validatedByName,
            emailSent: sentNotifs.length > 0,
            emailSentAt: sentNotifs.length ? sentNotifs.map(n => n.sent_at).sort().reverse()[0] : undefined,
            memberStatus: m?.status ?? null,
            groupementId: m?.groupement_id ?? null,
            groupementName: grp?.name ?? null,
          });
        } else {
          const mNotif = getNotifFor(m?.email ?? undefined);
          rows.push({
            key: `m-${memberId}`,
            name,
            playerName: name,
            role: 'Joueur (adulte)',
            teams: teamName,
            email: m?.email ?? undefined,
            memberId,
            birthDate: m?.birth_date,
            age,
            status: ack ? 'validated' : 'pending',
            acknowledgedAt: ack?.acknowledged_at,
            emailSent: !!mNotif,
            emailSentAt: mNotif?.sent_at,
            memberStatus: m?.status ?? null,
            groupementId: m?.groupement_id ?? null,
            groupementName: grp?.name ?? null,
          });
        }
      }
    } else {
      // Coaches: RPC population = all coaches with user_id IS NOT NULL
      const { count: totalCoachCount } = await supabase
        .from('coaches')
        .select('id', { count: 'exact', head: true })
        .is('self_deleted_at', null);
      const ackByUser = new Map<string, Ack>();
      for (const a of ackList) {
        if (a.user_id && !a.member_id) ackByUser.set(a.user_id, a);
      }

      // Pending coach IDs from RPC missing array
      const pendingCoachIds = new Set<string>();
      for (const m of rpcDoc.missing ?? []) pendingCoachIds.add(m.coach_id);

      // Validated coaches: find coach rows via their user_id from acks
      // We need all coaches with user_id to find validated ones
      const { data: allCoaches } = await supabase
        .from('coaches')
        .select('id, first_name, last_name, email, user_id')
        .not('user_id', 'is', null)
        .is('self_deleted_at', null);

      // Build coach-to-teams map from teams table
      const { data: teamList } = await supabase
        .from('teams')
        .select('id, name, coach_id, assistant_coach_id')
        .eq('active', true);
      const coachToTeams = new Map<string, string[]>();
      for (const t of teamList ?? []) {
        for (const cid of [t.coach_id, t.assistant_coach_id].filter(Boolean) as string[]) {
          const arr = coachToTeams.get(cid) ?? [];
          arr.push(t.name);
          coachToTeams.set(cid, arr);
        }
      }

      excludedCoaches = (totalCoachCount ?? 0) - (allCoaches ?? []).length;

      for (const c of allCoaches ?? []) {
        const ack = c.user_id ? ackByUser.get(c.user_id) : undefined;
        const cNotif = getNotifFor(c.email ?? undefined);
        rows.push({
          key: `c-${c.id}`,
          name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(),
          role: 'Entraîneur',
          teams: (coachToTeams.get(c.id) ?? []).join(', ') || '—',
          email: c.email,
          userId: c.user_id ?? undefined,
          status: ack ? 'validated' : 'pending',
          acknowledgedAt: ack?.acknowledged_at,
          emailSent: !!cNotif,
          emailSentAt: cNotif?.sent_at,
        });
      }
    }
    return { rows: rows.sort((a, b) => a.name.localeCompare(b.name)), excludedCoaches };
  }

  function calcAge(b: string): number | null {
    const d = new Date(b);
    if (isNaN(d.getTime())) return null;
    const n = new Date();
    let age = n.getFullYear() - d.getFullYear();
    const m = n.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && n.getDate() < d.getDate())) age--;
    return age;
  }

  function expandRowEmails(row: TrackingRow): string[] {
    if (row.parentEmails && row.parentEmails.length > 0) return row.parentEmails;
    if (row.email) {
      return row.email.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
  }

  async function sendReminderToPending() {
    const docCategory = charteDocCategoryFor(charteTab);
    const charteDoc = docs.find(d => d.category === docCategory && d.is_active);
    if (!charteDoc) return;
    const pendingEmails = trackingRows
      .filter(r => r.status === 'pending' && r.emailSent)
      .flatMap(r => expandRowEmails(r));
    const unique = Array.from(new Set(pendingEmails.filter(Boolean)));
    if (unique.length === 0) { showToast('Aucun destinataire éligible (email envoyé et non validé).', 'warning'); return; }
    showConfirm({
      title: 'Envoyer un rappel',
      message: `Envoyer un rappel à ${unique.length} personne(s) non validée(s) ?`,
      confirmStyle: 'warning',
      confirmLabel: 'Envoyer',
      onConfirm: async () => {
        hideConfirm();
        const pendingEmailsFinal = unique;
        setSendingReminder(true);
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-charte-reminder`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session?.access_token}`,
                Apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
              },
              body: JSON.stringify({ document_id: charteDoc.id, emails: pendingEmailsFinal }),
            }
          );
          const json = await res.json();
          if (json.success) {
            showToast(`Rappel envoyé à ${json.sent ?? pendingEmailsFinal.length} personne(s).`, 'success');
            await loadAcks();
          } else {
            showToast('Erreur : ' + (json.error ?? 'inconnue'), 'error');
          }
        } catch (e: any) {
          showToast('Erreur réseau : ' + e.message, 'error');
        } finally {
          setSendingReminder(false);
        }
      },
    });
    return;
  }

  function rowToRecipients(r: TrackingRow): { email: string; user_id: string | null; member_id: string | null }[] {
    if (r.parents && r.parents.length > 0) {
      return r.parents
        .filter(p => !!p.email)
        .map(p => ({ email: p.email!, user_id: p.userId, member_id: r.memberId ?? null }));
    }
    if (r.email) {
      return r.email.split(',').map(s => s.trim()).filter(Boolean).map(e => ({
        email: e, user_id: r.userId ?? null, member_id: r.memberId ?? null,
      }));
    }
    return [];
  }

  async function doSendCharte(mode: 'test' | 'all') {
    const docCategory = charteDocCategoryFor(charteTab);
    const charteDoc = docs.find(d => d.category === docCategory && d.is_active);
    if (!charteDoc) return;

    let selectedRows: TrackingRow[];
    if (mode === 'test') {
      selectedRows = trackingRows.filter(r => testSelected.includes(r.key));
    } else {
      selectedRows = trackingRows.filter(r => !!(r.email || (r.parents && r.parents.length > 0)));
    }

    const recipients = selectedRows.flatMap(rowToRecipients);
    if (recipients.length === 0) {
      showToast('Aucun destinataire avec email.', 'warning');
      return;
    }

    setSending(true);
    setSendProgress({ sent: 0, total: recipients.length });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-charte`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
            Apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            document_id: charteDoc.id,
            recipients,
            is_test: mode === 'test',
          }),
        }
      );
      const json = await res.json();
      if (json.success) {
        setSendProgress({ sent: json.sent ?? recipients.length, total: json.total ?? recipients.length });
        showToast(
          mode === 'test'
            ? `Test envoyé : ${json.sent ?? recipients.length} email(s).`
            : `Charte envoyée à ${json.sent ?? recipients.length} personne(s).`,
          'success'
        );
        setShowSendModal(false);
        setSendMode('choice');
        setTestSelected([]);
        setTestSearch('');
        setTestRoleFilter('all');
        setTestTeamFilter('all');
        await loadAcks();
      } else {
        showToast('Erreur : ' + (json.error ?? 'inconnue'), 'error');
      }
    } catch (e: any) {
      showToast('Erreur réseau : ' + e.message, 'error');
    } finally {
      setSending(false);
      setSendProgress(null);
    }
  }

  async function handleUpload() {
    if (!form.title.trim() || !form.category || !form.season_id || !form.file) {
      showToast('Veuillez remplir tous les champs obligatoires et sélectionner un fichier.', 'warning');
      return;
    }
    if (form.file.size > 10 * 1024 * 1024) {
      showToast('Le fichier ne peut pas dépasser 10 MB.', 'warning');
      return;
    }
    setActionLoading(true);
    setUploadStatus('Upload en cours…');
    try {
      const ext = form.file.name.split('.').pop()?.toLowerCase() ?? '';
      const fileType = ext === 'pdf' ? 'pdf' : 'image';
      const storagePath = `${form.season_id}/${form.category}/${safeUUID()}-${form.file.name}`;

      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(storagePath, form.file, { contentType: form.file.type });
      if (upErr) throw upErr;

      setUploadStatus('Enregistrement…');
      const targetTeams =
        form.category === 'charte_entraineurs' && !form.all_teams && form.target_team_ids.length > 0
          ? form.target_team_ids
          : null;
      const { error: insErr } = await supabase.from('documents').insert({
        title: form.title.trim(),
        category: form.category,
        season_id: form.season_id,
        ag_session_id: form.category === 'pv_ag' && form.ag_session_id ? form.ag_session_id : null,
        description: form.description.trim() || null,
        file_url: storagePath,
        file_name: form.file.name,
        file_type: fileType,
        uploaded_by: user?.id ?? null,
        is_active: true,
        target_team_ids: targetTeams,
        publish_on_site: (form.category === 'pv_ag' || (form.category === 'charte_entraineurs' && !form.all_teams && form.target_team_ids.length > 0)) ? false : form.publish_on_site,
      });
      if (insErr) throw insErr;

      setUploadStatus('');
      setShowModal(false);
      resetForm();
      await loadDocs();
      if (form.category === 'charte_joueurs' || form.category === 'charte_joueurs_mineurs' || form.category === 'charte_entraineurs') {
        showToast("Charte enregistrée. Cliquez sur 'Envoyer la charte' pour l'envoyer aux destinataires.", 'success');
      }
    } catch (err: any) {
      setUploadStatus('');
      showToast('Erreur : ' + err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDownload(doc: Doc) {
    const { data, error } = await invokeFunction('get-document-url', {
      body: { document_id: doc.id },
    });
    if (error || data?.error) {
      showToast(data?.error ?? error ?? 'Impossible de télécharger le fichier', 'error');
      return;
    }
    if (data?.signed_url) window.open(data.signed_url, '_blank');
    else showToast('Impossible de télécharger le fichier', 'error');
  }

  async function openDeleteFlow(doc: Doc) {
    setDeleteTarget(doc);
    setDeleteConfirmText('');
    const { count } = await supabase
      .from('document_acknowledgements')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', doc.id);
    const n = count ?? 0;
    setDeleteAckCount(n);
    setDeleteStep(n > 0 ? 'warn' : 'simple');
  }

  async function performSoftDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('documents').update({
        is_active: false,
        deleted_at: new Date().toISOString(),
        deleted_by: user?.id ?? null,
      }).eq('id', deleteTarget.id);
      if (error) throw error;
      setDeleteStep('closed');
      setDeleteTarget(null);
      setDeleteConfirmText('');
      await loadDocs();
    } catch (err: any) {
      showToast('Erreur : ' + err.message, 'error');
    } finally {
      setDeleting(false);
    }
  }

  function restoreDoc(doc: Doc) {
    showConfirm({
      title: 'Restaurer la charte',
      message: `Restaurer la charte "${doc.title}" ?`,
      confirmStyle: 'warning',
      confirmLabel: 'Restaurer',
      onConfirm: async () => {
        hideConfirm();
        setActionLoading(true);
        try {
          const { error } = await supabase.from('documents').update({
            is_active: true,
            deleted_at: null,
            deleted_by: null,
          }).eq('id', doc.id);
          if (error) throw error;
          await loadDocs();
        } catch (err: any) {
          showToast('Erreur : ' + err.message, 'error');
        } finally {
          setActionLoading(false);
        }
      },
    });
  }

  async function viewArchivedAcks(doc: Doc) {
    const { data } = await supabase
      .from('document_acknowledgements')
      .select('id, acknowledged_at, user_id, member_id, validated_by_parent_id, email_sent_at')
      .eq('document_id', doc.id)
      .order('acknowledged_at', { ascending: false });
    setArchiveAckModal({ doc, acks: (data ?? []) as Ack[] });
  }

  function resetForm() {
    const active = seasons.find(s => s.active);
    setForm({ title: '', category: 'divers', season_id: active?.id ?? '', ag_session_id: '', description: '', file: null, target_team_ids: [], all_teams: true, publish_on_site: false });
  }

  async function exportAcks() {
    try {
    const isMinorsTab = charteTab === 'charte_joueurs_parents';
    const isCoach = charteTab === 'charte_entraineurs';
    const rpcTeams = !isCoach ? (charteRpcDoc?.teams ?? []) : [];

    // Apply same filters as the displayed list
    const teamFiltered = trackingRows.filter(r => {
      if (charteTeamFilter === 'all') return true;
      if (isCoach) return r.teams.split(', ').some(t => t === charteTeamFilter);
      return r.teams === rpcTeams.find(t => t.team_id === charteTeamFilter)?.team_name;
    });
    const filtered = teamFiltered.filter(r => {
      if (!rowMatchesSearch(r, searchQuery)) return false;
      if (trackingFilter === 'all') return true;
      if (trackingFilter === 'validated') return r.status === 'validated';
      if (trackingFilter === 'pending') return r.status === 'pending';
      if (trackingFilter === 'no_parent') return r.hasParent === false;
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      const tc = (a.teams || '').localeCompare(b.teams || '', 'fr');
      if (tc !== 0) return tc;
      return a.name.localeCompare(b.name, 'fr');
    });

    const rows = sorted.map(r => {
      const base: Record<string, string> = {
        'Nom Prénom': r.name,
        'Équipe': isCoach ? r.teams : shortTeamName(r.teams),
      };
      if (isMinorsTab) {
        base['Représentant légal'] = r.hasParent === false
          ? 'Sans parent'
          : (r.parents ?? []).map(p => `${p.firstName} ${p.lastName}`.trim()).filter(Boolean).join(' / ') || '—';
      }
      base['Statut'] = r.status === 'validated'
        ? `Validée ${r.acknowledgedAt ? formatValidatedAt(r.acknowledgedAt) : ''}`
        : 'En attente';
      base['E-mail'] = r.emailSent
        ? `envoyé le ${r.emailSentAt ? new Date(r.emailSentAt).toLocaleDateString('fr-CH') : '—'}`
        : 'non envoyé';
      return base;
    });

    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Suivi');
    XLSX.writeFile(wb, `suivi-${charteTab}-${charteRpcDoc?.title ?? ''}.xlsx`);
    } catch (e) { console.error('Export failed', e); showToast("L'export n'a pas pu être généré. Rechargez la page et réessayez.", 'error'); }
  }

  const charteRpcDoc = charteRpcDocs.find(d => d.category === charteDocCategoryFor(charteTab));
  const charteDoc = docs.find(d => d.category === charteDocCategoryFor(charteTab) && d.is_active);

  // Auto-load per-person detail rows once RPC summary is available
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (charteRpcDoc && !trackingLoaded) ensureTrackingLoaded(); }, [charteRpcDoc, trackingLoaded]);

  function shortTeamName(name: string): string {
    const idx = name.indexOf(' - ');
    return idx >= 0 ? name.slice(idx + 3) : name;
  }

  async function resendForRow(row: TrackingRow) {
    if (!charteDoc) return;
    const recipients = rowToRecipients(row);
    if (recipients.length === 0) { showToast('Aucune adresse email pour ce destinataire.', 'warning'); return; }
    setResendingKey(row.key);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-charte`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
            Apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            document_id: charteDoc.id,
            recipients,
            is_test: false,
          }),
        }
      );
      const json = await res.json();
      if (json.success) {
        await loadAcks();
      } else {
        showToast('Erreur : ' + (json.error ?? 'inconnue'), 'error');
      }
    } catch (e: any) {
      showToast('Erreur réseau : ' + e.message, 'error');
    } finally {
      setResendingKey(null);
    }
  }

  function rowMatchesSearch(r: TrackingRow, q: string): boolean {
    if (!q) return true;
    const needle = q.toLowerCase();
    if (r.name.toLowerCase().includes(needle)) return true;
    if ((r.email ?? '').toLowerCase().includes(needle)) return true;
    if (r.parents) {
      for (const p of r.parents) {
        if (`${p.firstName} ${p.lastName}`.toLowerCase().includes(needle)) return true;
        if ((p.email ?? '').toLowerCase().includes(needle)) return true;
      }
    }
    return false;
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
            <FileText size={24} /> Documents
          </h1>
          <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>Gestion des documents du club</p>
        </div>
        <Button onClick={() => { resetForm(); setShowModal(true); }} leftIcon={<Plus size={20} />}>
          Ajouter un document
        </Button>
      </div>

      <Tabs
        items={[
          { key: 'active', label: 'Documents actifs' },
          { key: 'archives', label: 'Archives' },
        ]}
        value={viewMode}
        onChange={(id) => setViewMode(id as 'active' | 'archives')}
        className="mb-4"
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={filterSeason}
          onChange={e => setFilterSeason(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none"
          style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
        >
          <option value="all">Toutes les saisons</option>
          {seasons.map(s => <option key={s.id} value={s.id}>{s.name}{s.active ? ' (active)' : ''}</option>)}
        </select>
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none"
          style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
        >
          <option value="all">Toutes les catégories</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {/* Documents table */}
      <div className="rounded-lg shadow-xl overflow-hidden mb-10" style={{ background: 'var(--bg-card)' }}>
        <style>{`
          .documents-stickhead thead th {
            position: sticky; top: 0; z-index: 2;
            background: var(--table-header-bg);
            border-bottom: 1px solid var(--border-color);
          }
          .documents-stickhead thead th::after {
            content: ''; position: absolute; left: 0; right: 0; bottom: -8px; height: 8px;
            pointer-events: none;
            background: linear-gradient(to bottom, rgba(0,0,0,0.28), rgba(0,0,0,0));
          }
        `}</style>
        <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
          <table className="documents-stickhead w-full" style={{ minWidth: '800px' }}>
            <thead style={{ background: 'var(--table-header-bg)' }}>
              <tr>
                {(viewMode === 'active'
                  ? ['Titre', 'Catégorie', 'Saison', 'Fichier', 'Uploadé par', 'Date', '']
                  : ['Titre', 'Catégorie', 'Saison', 'Fichier', 'Archivé le', 'Archivé par', '']
                ).map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
              {docs.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center" style={{ color: 'var(--text-secondary)' }}>Aucun document trouvé</td></tr>
              ) : docs.map(doc => (
                <tr key={doc.id} className="hover:bg-[var(--bg-hover)]">
                  <td className="px-5 py-4 text-sm font-medium max-w-xs" style={{ color: 'var(--text-primary)' }}>
                    <div className="flex items-center gap-2 truncate">
                      {doc.file_type === 'pdf'
                        ? <FileText size={15} className="flex-shrink-0" style={{ color: 'var(--danger)' }} />
                        : <Image size={15} className="flex-shrink-0" style={{ color: 'var(--info-text)' }} />}
                      <span className="truncate" title={doc.title}>{doc.title}</span>
                      {websiteEnabled && (doc as any).publish_on_site && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 600, color: 'var(--info-text)', background: 'var(--info-bg, rgba(59,130,246,0.1))', padding: '1px 7px', borderRadius: '8px', whiteSpace: 'nowrap', marginLeft: '6px', flexShrink: 0 }}>
                          <Globe size={10} /> Sur le site
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{getCategoryLabel(doc.category)}</td>
                  <td className="px-5 py-4 text-sm whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{doc.seasons?.name ?? '—'}</td>
                  <td className="px-5 py-4 text-sm max-w-xs truncate" style={{ color: 'var(--text-muted)' }} title={doc.file_name}>{doc.file_name}</td>
                  {viewMode === 'active' ? (
                    <>
                      <td className="px-5 py-4 text-sm whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                        {doc.profiles
                          ? (`${doc.profiles.first_name ?? ''} ${doc.profiles.last_name ?? ''}`).trim() || doc.profiles.email
                          : '—'}
                      </td>
                      <td className="px-5 py-4 text-sm whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                        {new Date(doc.created_at).toLocaleDateString('fr-CH')}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-5 py-4 text-sm whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                        {doc.deleted_at ? new Date(doc.deleted_at).toLocaleDateString('fr-CH') : '—'}
                      </td>
                      <td className="px-5 py-4 text-sm whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                        {doc.deleted_profile
                          ? (`${doc.deleted_profile.first_name ?? ''} ${doc.deleted_profile.last_name ?? ''}`).trim() || doc.deleted_profile.email
                          : '—'}
                      </td>
                    </>
                  )}
                  <td className="px-5 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleDownload(doc)} style={{ color: 'var(--info-text)' }} title="Télécharger">
                        <Download size={17} />
                      </button>
                      {viewMode === 'active' ? (
                        <>
                          <button onClick={() => openEditModal(doc)} style={{ color: 'var(--text-secondary)' }} title="Modifier">
                            <Pencil size={17} />
                          </button>
                          <Button
                            variant="warning"
                            size="sm"
                            onClick={() => openDeleteFlow(doc)}
                            leftIcon={<Trash2 size={17} />}
                            title="Archiver"
                          />
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => viewArchivedAcks(doc)}
                            className="text-xs underline"
                            style={{ color: 'var(--info-text)' }}
                            title="Voir les validations"
                          >
                            Validations
                          </button>
                          <button
                            onClick={() => restoreDoc(doc)}
                            className="text-xs underline"
                            style={{ color: 'var(--success)' }}
                            title="Restaurer"
                          >
                            Restaurer
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

      {/* Charte tracking */}
      {viewMode === 'active' && <div>
        <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Suivi des chartes</h2>
        <Tabs
          items={[
            { key: 'charte_joueurs_parents', label: 'Charte enfants & parents' },
            { key: 'charte_joueurs_adults', label: 'Charte joueurs (adultes)' },
            { key: 'charte_entraineurs', label: 'Charte entraîneurs' },
          ]}
          value={charteTab}
          onChange={(id) => { setCharteTab(id as typeof charteTab); setTrackingFilter('all'); setSearchQuery(''); setCharteTeamFilter('all'); }}
          className="mb-6"
        />

        {charteRpcLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[var(--accent)]" />
          </div>
        ) : charteRpcDoc ? (
          <>
            {(() => {
              const isMinorsTab = charteTab === 'charte_joueurs_parents';
              const isCoach = charteTab === 'charte_entraineurs';

              // Build team options from RPC (for players) or from tracking rows (for coaches)
              const rpcTeams = !isCoach ? (charteRpcDoc.teams ?? []) : [];
              const coachTeamSet = new Map<string, string>();
              if (isCoach) {
                for (const r of trackingRows) {
                  for (const t of r.teams.split(', ').filter(Boolean)) {
                    if (t !== '—') coachTeamSet.set(t, t);
                  }
                }
              }
              const teamOptions: { id: string; label: string }[] = !isCoach
                ? rpcTeams.map(t => ({ id: t.team_id, label: shortTeamName(t.team_name) }))
                : Array.from(coachTeamSet.keys()).sort((a, b) => a.localeCompare(b, 'fr')).map(n => ({ id: n, label: shortTeamName(n) }));

              // Filter tracking rows by team
              const teamFiltered = trackingRows.filter(r => {
                if (charteTeamFilter === 'all') return true;
                if (isCoach) return r.teams.split(', ').some(t => t === charteTeamFilter);
                return r.teams === rpcTeams.find(t => t.team_id === charteTeamFilter)?.team_name;
              });

              // Apply status + search filters
              const filtered = teamFiltered.filter(r => {
                if (!rowMatchesSearch(r, searchQuery)) return false;
                if (trackingFilter === 'all') return true;
                if (trackingFilter === 'validated') return r.status === 'validated';
                if (trackingFilter === 'pending') return r.status === 'pending';
                if (trackingFilter === 'no_parent') return r.hasParent === false;
                return true;
              });

              // Sort by team then last name
              const sorted = [...filtered].sort((a, b) => {
                const ta = a.teams || '';
                const tb = b.teams || '';
                const tc = ta.localeCompare(tb, 'fr');
                if (tc !== 0) return tc;
                return a.name.localeCompare(b.name, 'fr');
              });

              // Counts from RPC, scoped to selected team
              let validatedCount: number;
              let totalCount: number;
              let counterLabel = '';
              if (charteTeamFilter !== 'all' && !isCoach) {
                const selTeam = rpcTeams.find(t => t.team_id === charteTeamFilter);
                validatedCount = selTeam?.validated ?? 0;
                totalCount = selTeam?.expected ?? 0;
                counterLabel = shortTeamName(selTeam?.team_name ?? '') + ' : ';
              } else {
                validatedCount = charteRpcDoc.validated;
                totalCount = charteRpcDoc.expected;
              }
              const pct = totalCount > 0 ? Math.round((validatedCount / totalCount) * 100) : 0;

              const noParentCount = isMinorsTab ? trackingRows.filter(r => r.hasParent === false).length : 0;

              // Column headers
              const headers = isMinorsTab
                ? ['Nom Prénom', 'Équipe', 'Représentant légal', 'Statut', 'E-mail', 'Action']
                : isCoach
                ? ['Nom Prénom', 'Équipe(s)', 'Statut', 'E-mail', 'Action']
                : ['Nom Prénom', 'Équipe', 'Statut', 'E-mail', 'Action'];
              const colSpan = headers.length;

              return (
                <>
                  {/* Header: title + RPC counts + actions */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
                      <div>
                        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{charteRpcDoc.title}</span>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                          {counterLabel}
                          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{validatedCount}</span> / {totalCount} validé{totalCount > 1 ? 's' : ''}
                        </span>
                        <Button size="sm" onClick={() => { setSendMode('choice'); setShowSendModal(true); }}>
                          Envoyer la charte
                        </Button>
                        <Button variant="secondary" size="sm" onClick={sendReminderToPending} disabled={sendingReminder}>
                          {sendingReminder ? 'Envoi…' : 'Renvoyer rappel'}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={exportAcks} leftIcon={<Download size={14} />}>
                          Export Excel
                        </Button>
                      </div>
                    </div>
                    <div style={{ background: 'var(--border-color)', borderRadius: '99px', height: '8px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--success)', transition: 'width 0.3s ease' }} />
                    </div>
                  </div>

                  {/* Excluded coaches note */}
                  {isCoach && excludedCoachCount > 0 && (
                    <p className="text-xs mt-2 mb-3" style={{ color: 'var(--text-muted)' }}>
                      {excludedCoachCount} entraîneur{excludedCoachCount > 1 ? 's' : ''} sans compte ClubSphere ne sont pas inclus dans ce suivi.
                    </p>
                  )}

                  {/* No-parent warning */}
                  {isMinorsTab && noParentCount > 0 && (
                    <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg mb-4" style={{ background: 'var(--warning-soft)', border: '1px solid var(--warning)' }}>
                      <div style={{ color: 'var(--warning-text)', fontSize: '14px' }}>
                        <strong>{noParentCount}</strong> joueur{noParentCount > 1 ? 's' : ''} mineur{noParentCount > 1 ? 's' : ''} sans représentant légal.
                      </div>
                      <button onClick={() => setShowNoParentModal(true)} className="px-3 py-1.5 text-sm rounded-lg font-medium" style={{ background: 'var(--warning-soft)', border: '1px solid var(--warning)', color: 'var(--warning-text)' }}>
                        Voir la liste
                      </button>
                    </div>
                  )}

                  {/* Filters row: team dropdown + status buttons + search */}
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <select
                      value={charteTeamFilter}
                      onChange={e => setCharteTeamFilter(e.target.value)}
                      className="border rounded-lg px-3 py-1.5 text-sm"
                      style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', borderColor: 'var(--border-color)' }}
                    >
                      <option value="all">Toutes les équipes</option>
                      {teamOptions.map(t => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                    {([
                      { k: 'all', l: 'Tous' },
                      { k: 'validated', l: 'Validés' },
                      { k: 'pending', l: 'En attente' },
                      ...(isMinorsTab ? [{ k: 'no_parent', l: 'Sans parent' }] : []),
                    ] as { k: typeof trackingFilter; l: string }[]).map(f => (
                      <button
                        key={f.k}
                        onClick={() => setTrackingFilter(f.k)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{
                          background: trackingFilter === f.k ? 'var(--accent)' : 'var(--bg-hover)',
                          color: trackingFilter === f.k ? 'var(--text-inverse)' : 'var(--text-secondary)',
                          border: '1px solid ' + (trackingFilter === f.k ? 'var(--accent)' : 'var(--border-color)'),
                        }}
                      >
                        {f.l}
                      </button>
                    ))}
                    <div className="flex-1 min-w-[200px]">
                      <SearchInput value={searchQuery} onChange={setSearchQuery} inputSize="sm" placeholder="Rechercher par nom" />
                    </div>
                  </div>

                  {/* Per-person list */}
                  <div className="rounded-lg overflow-hidden shadow-sm border border-[var(--border-color)]" style={{ background: 'var(--bg-card)' }}>
                    <table className="w-full">
                      <thead style={{ background: 'var(--table-header-bg)' }}>
                        <tr>
                          {headers.map(h => (
                            <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                        {acksLoading ? (
                          <tr><td colSpan={colSpan} className="px-5 py-8 text-center" style={{ color: 'var(--text-secondary)' }}>Chargement…</td></tr>
                        ) : sorted.length === 0 ? (
                          <tr><td colSpan={colSpan} className="px-5 py-8 text-center" style={{ color: 'var(--text-secondary)' }}>Aucun résultat</td></tr>
                        ) : sorted.map(r => {
                          const isVal = r.status === 'validated';
                          const rowBg = isVal ? 'rgba(var(--success-rgb, 34,197,94), 0.08)' : 'rgba(var(--danger-rgb, 239,68,68), 0.06)';
                          const resendable = rowToRecipients(r).length > 0;

                          const parentDisplay = isMinorsTab
                            ? (r.hasParent === false
                              ? <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Sans parent</span>
                              : <span style={{ color: 'var(--text-primary)' }}>{(r.parents ?? []).map(p => `${p.firstName} ${p.lastName}`.trim()).filter(Boolean).join(' / ') || '—'}</span>)
                            : null;

                          return (
                            <tr key={r.key} style={{ background: rowBg }}>
                              <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{r.name}</td>
                              <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{isCoach ? r.teams : shortTeamName(r.teams)}</td>
                              {isMinorsTab && (
                                <td className="px-4 py-3 text-sm">{parentDisplay}</td>
                              )}
                              <td className="px-4 py-3 text-sm">
                                {isVal ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: 'var(--success)', color: '#fff' }}>
                                    Validée {r.acknowledgedAt ? formatValidatedAt(r.acknowledgedAt) : ''}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: 'var(--danger)', color: '#fff' }}>
                                    En attente
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                                {r.emailSent
                                  ? `envoyé le ${r.emailSentAt ? new Date(r.emailSentAt).toLocaleDateString('fr-CH') : '—'}`
                                  : 'non envoyé'}
                              </td>
                              <td className="px-4 py-3 text-sm">
                                {!isVal && (
                                  <button
                                    onClick={() => resendForRow(r)}
                                    disabled={!resendable || resendingKey === r.key}
                                    className="text-xs px-2.5 py-1 rounded-md disabled:opacity-40"
                                    style={{ background: 'var(--info-soft)', border: '1px solid var(--info)', color: 'var(--info-text)' }}
                                  >
                                    {resendingKey === r.key ? 'Envoi…' : 'Renvoyer'}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* No-parent modal */}
                  {showNoParentModal && isMinorsTab && (
                    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
                      <div className="rounded-xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                        <div className="flex items-center justify-between border-b" style={{ borderColor: 'var(--border-color)', padding: '16px 24px' }}>
                          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Joueurs sans représentant légal</h2>
                          <button onClick={() => setShowNoParentModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '4px' }}><X size={22} /></button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1">
                          <ul className="space-y-2">
                            {trackingRows.filter(r => r.hasParent === false).map(r => (
                              <li key={r.key} className="flex justify-between text-sm border-b pb-2" style={{ borderColor: 'var(--border-color)' }}>
                                <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{r.playerName ?? r.name}</div>
                                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{r.teams}</div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </>
        ) : (
          <div className="rounded-lg p-8 text-center shadow-sm border border-[var(--border-color)]" style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>
            Aucune charte publiée pour cette saison.
          </div>
        )}
      </div>}

      {/* Upload modal */}
      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="sticky top-0 flex items-center justify-between px-6 py-4 rounded-t-xl" style={{ background: 'var(--bg-modal-header)' }}>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-modal-header)' }}>Ajouter un document</h2>
              <button onClick={closeModal} className="hover:opacity-80" style={{ background: 'transparent', border: 'none', color: 'var(--text-modal-header)', cursor: 'pointer', padding: '4px' }}><X size={22} /></button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Titre *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  className="w-full border rounded-lg px-4 py-2 focus:outline-none"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  placeholder="Ex: PV AG du 15 janvier 2026"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Catégorie *</label>
                <select
                  value={form.category}
                  onChange={e => setForm(p => ({ ...p, category: e.target.value as CategoryValue }))}
                  className="w-full border rounded-lg px-4 py-2 focus:outline-none"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                >
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Saison *</label>
                <select
                  value={form.season_id}
                  onChange={e => setForm(p => ({ ...p, season_id: e.target.value }))}
                  className="w-full border rounded-lg px-4 py-2 focus:outline-none"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                >
                  <option value="">Sélectionner une saison</option>
                  {seasons.map(s => <option key={s.id} value={s.id}>{s.name}{s.active ? ' (active)' : ''}</option>)}
                </select>
              </div>

              {form.category === 'charte_joueurs' && (
                <Alert variant="info">
                  Cette charte sera envoyée uniquement aux joueurs adultes (18 ans et plus).
                </Alert>
              )}
              {form.category === 'charte_joueurs_mineurs' && (
                <Alert variant="info">
                  Cette charte sera envoyée aux parents/représentants légaux des joueurs mineurs (moins de 18 ans).
                </Alert>
              )}

              {form.category === 'charte_entraineurs' && (
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Équipes concernées</label>
                  <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                    Sélectionnez les équipes dont les entraîneurs doivent valider cette charte
                  </p>
                  <label className="flex items-center gap-2 mb-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.all_teams}
                      onChange={e => setForm(p => ({ ...p, all_teams: e.target.checked, target_team_ids: e.target.checked ? [] : p.target_team_ids }))}
                      className="w-4 h-4"
                    />
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Toutes les équipes</span>
                  </label>
                  {!form.all_teams && (
                    <div className="max-h-40 overflow-y-auto border rounded-lg p-2" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-input)' }}>
                      {teams.map(t => (
                        <label key={t.id} className="flex items-center gap-2 py-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.target_team_ids.includes(t.id)}
                            onChange={e => setForm(p => ({
                              ...p,
                              target_team_ids: e.target.checked
                                ? [...p.target_team_ids, t.id]
                                : p.target_team_ids.filter(x => x !== t.id),
                            }))}
                            className="w-4 h-4"
                          />
                          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {form.category === 'pv_ag' && (
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Lier à une séance AG</label>
                  <select
                    value={form.ag_session_id}
                    onChange={e => setForm(p => ({ ...p, ag_session_id: e.target.value }))}
                    className="w-full border rounded-lg px-4 py-2 focus:outline-none"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  >
                    <option value="">— Aucune —</option>
                    {agSessions.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.title}{s.date ? ` (${new Date(s.date).toLocaleDateString('fr-CH')})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  rows={3}
                  className="w-full border rounded-lg px-4 py-2 focus:outline-none resize-none"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  placeholder="Description optionnelle…"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Fichier * (PDF, JPG, PNG — max 10 MB)</label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={e => setForm(p => ({ ...p, file: e.target.files?.[0] ?? null }))}
                  className="w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:text-white file:cursor-pointer"
                  style={{ color: 'var(--text-secondary)', '--tw-ring-color': 'var(--primary)' } as any}
                />
                {form.file && (
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    {form.file.name} ({(form.file.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
              </div>

              {/* Publish on site — hidden for AG or team-restricted docs */}
              {websiteEnabled && form.category !== 'pv_ag' && !(form.category === 'charte_entraineurs' && !form.all_teams && form.target_team_ids.length > 0) && (
                <div className="flex items-start gap-3">
                  <input
                    id="doc-publish-site"
                    type="checkbox"
                    checked={form.publish_on_site}
                    onChange={e => setForm(p => ({ ...p, publish_on_site: e.target.checked }))}
                    className="w-4 h-4 mt-0.5"
                  />
                  <label htmlFor="doc-publish-site">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      Publier sur le site du club
                    </span>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      Le document pourra être téléchargé par tout le monde depuis le site internet du club. Ne cochez jamais un document contenant des données personnelles.
                    </p>
                  </label>
                </div>
              )}

              {uploadStatus && <p className="text-sm" style={{ color: 'var(--info-text)' }}>{uploadStatus}</p>}
            </div>

            <div className="sticky bottom-0 border-t p-5 flex justify-end gap-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
              <Button variant="secondary" onClick={closeModal}>
                Annuler
              </Button>
              <Button onClick={handleUpload} disabled={actionLoading}>
                {actionLoading ? 'Upload…' : 'Uploader'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {showEditModal && editDoc && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="sticky top-0 flex items-center justify-between px-6 py-4 rounded-t-xl" style={{ background: 'var(--bg-modal-header)' }}>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-modal-header)' }}>Modifier le document</h2>
              <button onClick={closeEditModal} className="hover:opacity-80" style={{ background: 'transparent', border: 'none', color: 'var(--text-modal-header)', cursor: 'pointer', padding: '4px' }}><X size={22} /></button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Titre *</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))}
                  className="w-full border rounded-lg px-4 py-2 focus:outline-none"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Catégorie *</label>
                <select
                  value={editForm.category}
                  onChange={e => setEditForm(p => ({ ...p, category: e.target.value as CategoryValue }))}
                  className="w-full border rounded-lg px-4 py-2 focus:outline-none"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                >
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Saison *</label>
                <select
                  value={editForm.season_id}
                  onChange={e => setEditForm(p => ({ ...p, season_id: e.target.value }))}
                  className="w-full border rounded-lg px-4 py-2 focus:outline-none"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                >
                  <option value="">Sélectionner une saison</option>
                  {seasons.map(s => <option key={s.id} value={s.id}>{s.name}{s.active ? ' (active)' : ''}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Description</label>
                <textarea
                  value={editForm.description}
                  onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))}
                  rows={3}
                  className="w-full border rounded-lg px-4 py-2 focus:outline-none resize-none"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>

              {editForm.category === 'charte_entraineurs' && (
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Équipes concernées</label>
                  <label className="flex items-center gap-2 mb-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.all_teams}
                      onChange={e => setEditForm(p => ({ ...p, all_teams: e.target.checked, target_team_ids: e.target.checked ? [] : p.target_team_ids }))}
                      className="w-4 h-4"
                    />
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Toutes les équipes</span>
                  </label>
                  {!editForm.all_teams && (
                    <div className="max-h-40 overflow-y-auto border rounded-lg p-2" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-input)' }}>
                      {teams.map(t => (
                        <label key={t.id} className="flex items-center gap-2 py-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editForm.target_team_ids.includes(t.id)}
                            onChange={e => setEditForm(p => ({
                              ...p,
                              target_team_ids: e.target.checked
                                ? [...p.target_team_ids, t.id]
                                : p.target_team_ids.filter(x => x !== t.id),
                            }))}
                            className="w-4 h-4"
                          />
                          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3">
                <input
                  id="doc-active"
                  type="checkbox"
                  checked={editForm.is_active}
                  onChange={e => setEditForm(p => ({ ...p, is_active: e.target.checked }))}
                  className="w-4 h-4"
                />
                <label htmlFor="doc-active" className="text-sm" style={{ color: 'var(--text-secondary)' }}>Document actif</label>
              </div>

              {/* Publish on site — hidden for AG or team-restricted docs */}
              {websiteEnabled && editForm.category !== 'pv_ag' && !(editForm.target_team_ids.length > 0 && !editForm.all_teams) && (
                <div className="flex items-start gap-3">
                  <input
                    id="doc-edit-publish-site"
                    type="checkbox"
                    checked={editForm.publish_on_site}
                    onChange={e => setEditForm(p => ({ ...p, publish_on_site: e.target.checked }))}
                    className="w-4 h-4 mt-0.5"
                  />
                  <label htmlFor="doc-edit-publish-site">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      Publier sur le site du club
                    </span>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      Le document pourra être téléchargé par tout le monde depuis le site internet du club. Ne cochez jamais un document contenant des données personnelles.
                    </p>
                  </label>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                  Fichier (optionnel — garder le fichier actuel si vide)
                </label>
                <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Actuel : {editDoc.file_name}</p>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={e => setEditForm(p => ({ ...p, file: e.target.files?.[0] ?? null }))}
                  className="w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:text-white file:cursor-pointer" style={{ color: 'var(--text-secondary)' }}
                />
                {editForm.file && (
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    Nouveau : {editForm.file.name} ({(editForm.file.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
              </div>

              {uploadStatus && <p className="text-sm" style={{ color: 'var(--info-text)' }}>{uploadStatus}</p>}
            </div>

            <div className="sticky bottom-0 border-t p-5 flex justify-end gap-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
              <Button variant="secondary" onClick={closeEditModal}>Annuler</Button>
              <Button onClick={handleUpdate} disabled={actionLoading}>
                {actionLoading ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Send charte modal */}
      {showSendModal && charteDoc && (() => {
        const withEmail = trackingRows.filter(r => r.email);
        const uniqueTeams = Array.from(new Set(withEmail.map(r => r.teams).filter(t => t && t !== '—'))).sort();
        const filteredTest = withEmail.filter(r => {
          if (testRoleFilter !== 'all' && r.role !== testRoleFilter) return false;
          if (testTeamFilter !== 'all' && r.teams !== testTeamFilter) return false;
          if (testSearch) {
            const q = testSearch.toLowerCase();
            if (!r.name.toLowerCase().includes(q) && !(r.email ?? '').toLowerCase().includes(q)) return false;
          }
          return true;
        });
        const totalAll = withEmail.length;

        return (
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <div className="rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <div className="sticky top-0 flex items-center justify-between px-6 py-4 rounded-t-xl" style={{ background: 'var(--bg-modal-header)' }}>
                <h2 className="text-lg font-bold" style={{ color: 'var(--text-modal-header)' }}>
                  {sendMode === 'choice' ? 'Envoyer la charte' :
                   sendMode === 'test' ? 'Envoi de test' : 'Confirmer l\'envoi à tous'}
                </h2>
                <button
                  onClick={() => { if (!sending) { setShowSendModal(false); setSendMode('choice'); setTestSelected([]); } }}
                  className="hover:opacity-80"
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-modal-header)', cursor: 'pointer', padding: '4px' }}
                >
                  <X size={22} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Charte : <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{charteDoc.title}</span>
                </p>

                {sendMode === 'choice' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <button
                      onClick={() => setSendMode('test')}
                      className="text-left p-5 rounded-lg transition-all hover:border-[var(--accent)]"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)' }}
                    >
                      <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Envoi de test</h3>
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        Envoyez la charte à 5 personnes maximum pour tester.
                        Aucun suivi de validation enregistré.
                      </p>
                    </button>
                    <button
                      onClick={() => setSendMode('confirmAll')}
                      className="text-left p-5 rounded-lg transition-all hover:border-[var(--accent)]"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)' }}
                    >
                      <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                        Envoi à tous ({totalAll} destinataire{totalAll > 1 ? 's' : ''})
                      </h3>
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        Envoyez la charte à tous les destinataires concernés et commencez le suivi.
                      </p>
                    </button>
                  </div>
                )}

                {sendMode === 'test' && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <div className="flex-1 min-w-[200px]">
                        <SearchInput
                          value={testSearch}
                          onChange={setTestSearch}
                          inputSize="sm"
                          placeholder="Rechercher par nom ou email…"
                        />
                      </div>
                      <select
                        value={testRoleFilter}
                        onChange={e => setTestRoleFilter(e.target.value as typeof testRoleFilter)}
                        className="border rounded-lg px-3 py-2 text-sm focus:outline-none"
                        style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                      >
                        <option value="all">Tous rôles</option>
                        <option value="Joueur (mineur)">Joueurs</option>
                        <option value="Parent">Parents</option>
                        <option value="Entraîneur">Entraîneurs</option>
                      </select>
                      <select
                        value={testTeamFilter}
                        onChange={e => setTestTeamFilter(e.target.value)}
                        className="border rounded-lg px-3 py-2 text-sm focus:outline-none"
                        style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                      >
                        <option value="all">Toutes équipes</option>
                        {uniqueTeams.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span style={{ color: 'var(--text-muted)' }}>{filteredTest.length} résultat(s)</span>
                      <span className={testSelected.length >= 5 ? 'text-[var(--warning-text)] font-semibold' : ''} style={testSelected.length >= 5 ? undefined : { color: 'var(--text-secondary)' }}>
                        {testSelected.length}/5 sélectionné{testSelected.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="max-h-64 overflow-y-auto border rounded-lg" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-input)' }}>
                      {filteredTest.length === 0 ? (
                        <div className="p-4 text-sm text-center" style={{ color: 'var(--text-muted)' }}>Aucun destinataire</div>
                      ) : filteredTest.map(r => {
                        const selected = testSelected.includes(r.key);
                        const disabled = !selected && testSelected.length >= 5;
                        return (
                          <label
                            key={r.key}
                            className={`flex items-center gap-3 px-3 py-2 border-b ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
                            style={{ borderColor: 'var(--border-color)' }}
                            onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={disabled}
                              onChange={e => setTestSelected(prev =>
                                e.target.checked ? [...prev, r.key] : prev.filter(k => k !== r.key)
                              )}
                              className="w-4 h-4"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{r.name}</div>
                              <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                                {r.role} — {r.teams} — {r.email}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {sendMode === 'confirmAll' && (
                  <div className="space-y-3">
                    <Alert variant="warning">
                      La charte sera envoyée à <strong>{totalAll}</strong> destinataire(s). Le suivi de validation sera activé.
                    </Alert>
                    {sending && sendProgress && (
                      <div>
                        <div className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
                          Envoi en cours… {sendProgress.sent} / {sendProgress.total}
                        </div>
                        <div style={{ background: 'var(--border-color)', borderRadius: '99px', height: '8px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${sendProgress.total > 0 ? Math.round((sendProgress.sent / sendProgress.total) * 100) : 0}%`,
                            height: '100%', background: 'var(--success)', transition: 'width 0.3s ease',
                          }} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="sticky bottom-0 border-t p-5 flex justify-end gap-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
                {sendMode === 'choice' ? (
                  <Button variant="secondary" onClick={() => setShowSendModal(false)}>
                    Fermer
                  </Button>
                ) : (
                  <>
                    <Button variant="secondary" onClick={() => setSendMode('choice')} disabled={sending}>
                      Retour
                    </Button>
                    <Button
                      onClick={() => doSendCharte(sendMode === 'test' ? 'test' : 'all')}
                      disabled={sending || (sendMode === 'test' && testSelected.length === 0)}
                    >
                      {sending ? 'Envoi…' :
                        sendMode === 'test' ? `Envoyer le test (${testSelected.length})` :
                        `Confirmer et envoyer (${totalAll})`}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Delete charte — simple (no acks) */}
      {deleteStep === 'simple' && deleteTarget && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-xl w-full max-w-md" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="p-6">
              <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Supprimer ce document ?</h2>
              <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>Aucune validation n'est associée à ce document.</p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cette action est réversible (le document sera archivé).</p>
            </div>
            <div className="border-t p-5 flex justify-end gap-3" style={{ borderColor: 'var(--border-color)' }}>
              <Button variant="secondary" onClick={() => { setDeleteStep('closed'); setDeleteTarget(null); }} disabled={deleting}>Annuler</Button>
              <Button variant="danger" onClick={performSoftDelete} disabled={deleting}>
                {deleting ? 'Suppression…' : 'Supprimer'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete charte — step 1 warning */}
      {deleteStep === 'warn' && deleteTarget && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-xl w-full max-w-md" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="p-6">
              <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--warning-text)' }}>
                Supprimer cette charte ?
              </h2>
              <p className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
                <strong>{deleteAckCount}</strong> personne{deleteAckCount > 1 ? 's ont' : ' a'} validé cette charte.
              </p>
              <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
                La charte sera archivée et ne sera plus visible aux utilisateurs.
              </p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Les validations existantes seront conservées comme preuve légale.
              </p>
            </div>
            <div className="border-t p-5 flex justify-end gap-3" style={{ borderColor: 'var(--border-color)' }}>
              <Button variant="secondary" onClick={() => { setDeleteStep('closed'); setDeleteTarget(null); }}>Annuler</Button>
              <button
                onClick={() => setDeleteStep('final')}
                className="px-5 py-2 rounded-lg font-medium"
                style={{ backgroundColor: 'var(--warning)', color: 'var(--text-inverse)' }}
              >
                Continuer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete charte — step 2 final confirm */}
      {deleteStep === 'final' && deleteTarget && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-xl w-full max-w-md" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="p-6">
              <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Confirmation finale</h2>
              <p className="text-sm mb-3" style={{ color: 'var(--text-primary)' }}>
                En supprimant cette charte, les <strong>{deleteAckCount}</strong> validations existantes
                seront conservées comme preuve légale dans les archives.
              </p>
              <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
                Tapez <strong>SUPPRIMER</strong> ci-dessous pour confirmer :
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="SUPPRIMER"
                className="w-full border rounded-lg px-4 py-2 focus:outline-none"
                style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                autoFocus
              />
            </div>
            <div className="border-t p-5 flex justify-end gap-3" style={{ borderColor: 'var(--border-color)' }}>
              <Button variant="secondary" onClick={() => { setDeleteStep('closed'); setDeleteTarget(null); setDeleteConfirmText(''); }} disabled={deleting}>
                Annuler
              </Button>
              <Button
                variant="danger"
                onClick={performSoftDelete}
                disabled={deleting || deleteConfirmText !== 'SUPPRIMER'}
              >
                {deleting ? 'Suppression…' : 'Supprimer définitivement'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Archived doc — validations list */}
      {archiveAckModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-xl w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="flex items-center justify-between border-b" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)', borderRadius: '12px 12px 0 0', padding: '16px 24px' }}>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Validations archivées</h2>
              <button onClick={() => setArchiveAckModal(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '4px' }}>
                <X size={22} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                <strong>{archiveAckModal.doc.title}</strong> — archivée le{' '}
                {archiveAckModal.doc.deleted_at ? new Date(archiveAckModal.doc.deleted_at).toLocaleDateString('fr-CH') : '—'}.
                {' '}{archiveAckModal.acks.length} personne{archiveAckModal.acks.length > 1 ? 's l\'avaient' : ' l\'avait'} validée.
              </p>
              {archiveAckModal.acks.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Aucune validation enregistrée.</p>
              ) : (
                <ul className="space-y-2">
                  {archiveAckModal.acks.map(a => (
                    <li key={a.id} className="text-sm flex justify-between border-b pb-2" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-color)' }}>
                      <span className="truncate">User {a.user_id.slice(0, 8)}… {a.member_id ? `(member ${a.member_id.slice(0, 8)}…)` : ''}</span>
                      <span className="ml-3 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{new Date(a.acknowledged_at).toLocaleString('fr-CH')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirm.isOpen}
        title={confirm.title}
        message={confirm.message}
        confirmLabel="Oui, supprimer"
        cancelLabel="Annuler"
        confirmStyle="danger"
        onConfirm={confirm.onConfirm}
        onCancel={() => setConfirm(p => ({ ...p, isOpen: false }))}
      />

      <Toast toast={toast} />
      <ConfirmModal {...confirmState} onCancel={hideConfirm} />
    </div>
  );
}
