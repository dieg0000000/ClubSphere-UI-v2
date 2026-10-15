import { useEffect, useState } from 'react';
import { reportLoadError } from '../utils/reportLoadError';
import { LoadError } from '../components/LoadError';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { X, Plus, ArrowLeft, Pencil, TriangleAlert as AlertTriangle, RotateCcw, Bell, Check, ClipboardList, CircleCheck, CircleX, ChartBar as BarChart3 } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';
import { Tabs } from '../components/ui/Tabs';
import Button from '../components/ui/Button';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import { useAttendanceDefaultPresent } from '../hooks/useAttendanceDefaultPresent';
import { useTenant } from '../context/TenantContext';
import { RainBadge } from '../components/RainBadge';
import { genderLabel } from '../components/TrainingAttendanceControl';
import { Badge } from '../components/ui/Badge';
import { Alert } from '../components/ui/Alert';
import { useAideMoniteurOnly } from '../hooks/useAideMoniteurOnly';
import { useCanManageTeamAttendance } from '../hooks/useCanManageTeamAttendance';
import { READ_ONLY_NOTE, attendanceSaveErrorToast } from '../utils/attendanceSaveError';

interface Member {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  gender: string | null;
  team_id?: string;
  status?: string | null;
  _secondary?: boolean;
}

interface TerrainSlot {
  id: string;
  day: number;
  start_time: string;
  end_time: string;
}

interface TrainingSession {
  id: string;
  session_date: string;
  slot_id: string | null;
  notes: string | null;
  cancelled: boolean;
  cancelled_reason: string | null;
  validated_at: string | null;
  validated_by: string | null;
  attendance: AttendanceRecord[];
  terrain_slots?: TerrainSlot;
  override_start_time?: string | null;
  override_end_time?: string | null;
  override_terrain_id?: string | null;
  override_terrain?: { name: string } | null;
  rain_applied?: boolean;
  rain_plan_defined?: boolean;
  rain_note?: string | null;
  effective_start_time?: string | null;
  effective_end_time?: string | null;
  effective_terrain_name?: string | null;
  base_start_time?: string | null;
  base_end_time?: string | null;
  base_terrain_name?: string | null;
}

interface Team {
  id: string;
  name: string;
  training_start: string | null;
  training_end: string | null;
  club_id?: string;
}

interface TerrainOption {
  id: string;
  name: string;
}

interface AttendanceRecord {
  id: string;
  member_id: string;
  present: boolean;
  status: string | null;
  absence_reason: string | null;
  members?: Member | null;
}

const ATTENDANCE_SELECT = 'attendance:training_attendance(id, member_id, present, status, absence_reason, members:member_id(id, first_name, last_name, birth_date, gender, team_id, status))';

const activeAttendance = (session: { attendance: AttendanceRecord[] }) =>
  session.attendance.filter(a => a.members && a.members.status !== 'archive');

function derivePresent(
  a: AttendanceRecord,
  defaultPresent: boolean,
  isValidated: boolean
): boolean {
  if (isValidated) return a.present;
  const s = a.status;
  if (s === 'confirmed' || s === 'present_real') return true;
  if (s === 'excused' || s === 'absent_justified' || s === 'absent_unjustified') return false;
  return defaultPresent;
}

const DAY_NAMES: Record<number, string> = {
  1: 'Lundi',
  2: 'Mardi',
  3: 'Mercredi',
  4: 'Jeudi',
  5: 'Vendredi',
  6: 'Samedi',
  7: 'Dimanche'
};

export function TeamAttendance() {
  const { teamId } = useParams<{ teamId: string }>();
  const aideReadOnly = useAideMoniteurOnly(teamId);
  const { canManage, loaded: canManageLoaded } = useCanManageTeamAttendance(teamId);
  const notCoachReadOnly = !aideReadOnly && !canManage;
  const sheetReadOnly = aideReadOnly || !canManageLoaded || !canManage;
  const navigate = useNavigate();
  const location = useLocation();
  const fromPresencesTab = !!(location.state as any)?.fromPresencesTab;
  const showUnvalidated = !!(location.state as any)?.showUnvalidated;
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<Team | null>(null);
  const [activeTab, setActiveTab] = useState<'sessions' | 'stats'>('sessions');
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [terrainSlots, setTerrainSlots] = useState<TerrainSlot[]>([]);
  const [showNewSession, setShowNewSession] = useState(false);
  const [filterUnvalidated, setFilterUnvalidated] = useState(showUnvalidated);
  const [newSessionDate, setNewSessionDate] = useState(new Date().toISOString().split('T')[0]);
  const [newSessionSlot, setNewSessionSlot] = useState('');
  const [selectedSession, setSelectedSession] = useState<TrainingSession | null>(null);

  const [terrainsList, setTerrainsList] = useState<TerrainOption[]>([]);
  const [editSession, setEditSession] = useState<TrainingSession | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editTerrainId, setEditTerrainId] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const [cancelSessionTarget, setCancelSessionTarget] = useState<TrainingSession | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const [notifConfirmAction, setNotifConfirmAction] = useState<null | { type: 'modify' | 'cancel' | 'restore'; session: TrainingSession }>(null);
  const [notifyChecked, setNotifyChecked] = useState(true);
  const [editChanges, setEditChanges] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [autoOpenDone, setAutoOpenDone] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const [reminderDays, setReminderDays] = useState<number[]>([]);
  const [remindersSent, setRemindersSent] = useState<Record<string, { sent_at: string; recipients_count: number }>>({});
  const [pendingResponseCount, setPendingResponseCount] = useState(0);
  const [sendingReminderDay, setSendingReminderDay] = useState<number | null>(null);
  const [reminderProgress, setReminderProgress] = useState<{ day: number; current: number; total: number; status: 'sending' | 'success' | 'error' } | null>(null);

  const { toast, showToast } = useToast();
  const { clubId } = useTenant();
  const { value: attendanceDefaultPresent, loaded: attendanceSettingLoaded } = useAttendanceDefaultPresent(clubId);

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

  useEffect(() => {
    if (teamId) {
      loadData();
    }
  }, [teamId]);

  const loadData = async () => {
    try {
      setLoading(true);

      const { data: teamData } = await supabase
        .from('teams')
        .select('id, name, training_start, training_end, club_id')
        .eq('id', teamId)
        .single();

      if (teamData) {
        setTeam(teamData);
        if (teamData.club_id) {
          const { data: ter } = await supabase
            .from('terrains')
            .select('id, name')
            .eq('club_id', teamData.club_id)
            .eq('active', true)
            .order('name');
          setTerrainsList(ter || []);
        }
      }

      const cols = 'id, first_name, last_name, birth_date, position, gender, team_id';
      const [primaryRes, secondaryRes] = await Promise.all([
        supabase.from('members').select(cols).eq('team_id', teamId).order('last_name'),
        supabase.from('team_members').select(`member_id, members:member_id(${cols})`).eq('team_id', teamId),
      ]);
      const primaryIds = new Set((primaryRes.data || []).map((p: any) => p.id));
      const secondaryPlayers = (secondaryRes.data || [])
        .map((r: any) => r.members)
        .filter((m: any) => m && !primaryIds.has(m.id))
        .map((m: any) => ({ ...m, _secondary: true }));
      const allMembers = [...(primaryRes.data || []), ...secondaryPlayers].sort((a: any, b: any) => (a.last_name || '').localeCompare(b.last_name || ''));
      setMembers(allMembers);

      const { data: slots } = await supabase
        .from('terrain_slots')
        .select('id, day, start_time, end_time')
        .eq('team_id', teamId)
        .order('day');

      setTerrainSlots(slots || []);

      await loadSessions();

      const { data: reminderConfig } = await supabase
        .from('club_notification_config')
        .select('reminder_days_array')
        .eq('notification_type', 'training_reminder')
        .maybeSingle();
      setReminderDays(Array.isArray(reminderConfig?.reminder_days_array) ? reminderConfig.reminder_days_array : []);
    } catch (error) {
      reportLoadError('TeamAttendance', error);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const loadReminderState = async (sessionId: string) => {
    const { data: sent } = await supabase
      .from('training_reminders_sent')
      .select('days_before, sent_at, recipients_count')
      .eq('session_id', sessionId);
    const map: Record<string, { sent_at: string; recipients_count: number }> = {};
    for (const row of sent || []) {
      map[String(row.days_before)] = { sent_at: row.sent_at, recipients_count: row.recipients_count || 0 };
    }
    setRemindersSent(map);

    const { data: att } = await supabase
      .from('training_attendance')
      .select('responded_at')
      .eq('session_id', sessionId);
    const pending = (att || []).filter(a => a.responded_at === null).length;
    setPendingResponseCount(pending);
  };

  const sendReminderNow = async (sessionId: string, daysBefore: number) => {
    setSendingReminderDay(daysBefore);

    const { count: pendingCount } = await supabase
      .from('training_attendance')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .is('responded_at', null);

    const total = Math.max(1, pendingCount ?? 0);
    setReminderProgress({ day: daysBefore, current: 0, total, status: 'sending' });

    const estimatedMs = Math.max(800, Math.ceil(total / 4) * 1000);
    const startedAt = Date.now();
    const tick = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const ratio = Math.min(0.95, elapsed / estimatedMs);
      setReminderProgress(prev => prev
        ? { ...prev, current: Math.min(prev.total - 1, Math.floor(ratio * prev.total)) }
        : prev);
    }, 150);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-training-reminder`;
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ session_id: sessionId, days_before: daysBefore, force: true }),
      });
      const json = await resp.json();
      window.clearInterval(tick);
      if (!resp.ok || json.error) {
        setReminderProgress({ day: daysBefore, current: 0, total, status: 'error' });
        showToast(`Erreur: ${json.error || 'envoi du rappel'}`, 'error');
      } else {
        const sent = json.sent_count ?? 0;
        const skipped = json.skipped_count ?? 0;
        const firstErr = Array.isArray(json.errors) && json.errors.length > 0 ? String(json.errors[0]) : '';
        setReminderProgress({ day: daysBefore, current: sent + skipped, total: Math.max(total, sent + skipped), status: skipped > 0 ? 'error' : 'success' });
        const msg = skipped > 0
          ? `Rappel envoye a ${sent} destinataire(s)\n(${skipped} email(s) non envoye(s) - verifier la configuration${firstErr ? ': ' + firstErr.slice(0, 200) : ''})`
          : `Rappel envoye a ${sent} destinataire(s).`;
        showToast(msg, 'success');
        await loadReminderState(sessionId);
      }
    } catch (e) {
      window.clearInterval(tick);
      setReminderProgress({ day: daysBefore, current: 0, total, status: 'error' });
      reportLoadError('TeamAttendance', e);
      showToast('Erreur lors de l\'envoi du rappel', 'error');
    } finally {
      setSendingReminderDay(null);
      window.setTimeout(() => setReminderProgress(null), 1500);
    }
  };

  const loadSessions = async () => {
    const [{ data }, { data: viewData }] = await Promise.all([
      supabase
        .from('training_sessions')
        .select(`
          id, session_date, slot_id, notes, cancelled, cancelled_reason,
          validated_at, validated_by,
          override_start_time, override_end_time, override_terrain_id,
          override_terrain:override_terrain_id (name),
          terrain_slots:slot_id (id, day, start_time, end_time, terrain_halves:terrain_half_id (label, terrains:terrain_id (id, name))),
          ${ATTENDANCE_SELECT}
        `)
        .eq('team_id', teamId)
        .order('session_date', { ascending: true }),
      supabase
        .from('v_training_sessions_effective')
        .select('id, rain_applied, rain_plan_defined, rain_note, effective_start_time, effective_end_time, effective_terrain_name, base_start_time, base_end_time, base_terrain_name')
        .eq('team_id', teamId),
    ]);

    const rainMap = new Map<string, any>();
    for (const v of (viewData || []) as any[]) {
      rainMap.set(v.id, v);
    }

    const allSessions = ((data || []) as any as TrainingSession[]).map(s => {
      const v = rainMap.get(s.id);
      return {
        ...s,
        rain_applied: !!v?.rain_applied,
        rain_plan_defined: !!v?.rain_plan_defined,
        rain_note: v?.rain_note || null,
        effective_start_time: v?.effective_start_time || null,
        effective_end_time: v?.effective_end_time || null,
        effective_terrain_name: v?.effective_terrain_name || null,
        base_start_time: v?.base_start_time || null,
        base_end_time: v?.base_end_time || null,
        base_terrain_name: v?.base_terrain_name || null,
      } as TrainingSession;
    });
    const today = new Date().toISOString().split('T')[0];
    const todaySessions = allSessions.filter(s => s.session_date === today);
    const upcoming = allSessions.filter(s => s.session_date > today);
    const past = allSessions.filter(s => s.session_date < today).reverse();
    setSessions([...todaySessions, ...upcoming, ...past]);
  };

  useEffect(() => {
    if (autoOpenDone || !fromPresencesTab || sessions.length === 0 || !attendanceSettingLoaded) return;
    const today = new Date().toISOString().split('T')[0];
    const todaySessions = sessions.filter(s => s.session_date === today && !s.cancelled);
    if (todaySessions.length === 1) {
      setAutoOpenDone(true);
      openAttendanceSheet(todaySessions[0]);
    } else {
      setAutoOpenDone(true);
    }
  }, [sessions, fromPresencesTab, autoOpenDone, attendanceSettingLoaded]);

  const cancelSession = (session: TrainingSession) => {
    setCancelSessionTarget(session);
    setCancelReason('');
  };

  const restoreSession = (session: TrainingSession) => {
    setNotifConfirmAction({ type: 'restore', session });
    setNotifyChecked(true);
    setEditChanges([]);
  };

  const formatTimeShort = (t: string | null | undefined) => {
    if (!t) return '--:--';
    return t.slice(0, 5);
  };

  const getEffectiveStart = (s: TrainingSession) => s.override_start_time || s.terrain_slots?.start_time || '';
  const getEffectiveEnd = (s: TrainingSession) => s.override_end_time || s.terrain_slots?.end_time || '';
  const getEffectiveTerrainId = (s: TrainingSession) => s.override_terrain_id || ((s.terrain_slots as any)?.terrain_halves?.terrains?.id) || '';
  const getEffectiveTerrainName = (s: TrainingSession) => {
    if (s.override_terrain_id && s.override_terrain) return s.override_terrain.name;
    const half = (s.terrain_slots as any)?.terrain_halves;
    return half?.terrains?.name || '';
  };
  const sessionHasOverride = (s: TrainingSession) => !!(s.override_start_time || s.override_end_time || s.override_terrain_id);

  const openEditSession = (s: TrainingSession) => {
    setEditSession(s);
    setEditDate(s.session_date);
    setEditStart(formatTimeShort(getEffectiveStart(s)));
    setEditEnd(formatTimeShort(getEffectiveEnd(s)));
    setEditTerrainId(getEffectiveTerrainId(s));
  };

  const handleSaveEdit = () => {
    if (!editSession) return;
    const slotStart = formatTimeShort(editSession.terrain_slots?.start_time);
    const slotEnd = formatTimeShort(editSession.terrain_slots?.end_time);
    const slotTerrainId = ((editSession.terrain_slots as any)?.terrain_halves?.terrains?.id) || '';

    const changes: any[] = [];
    if (editDate !== editSession.session_date) {
      changes.push({ field: 'date', old: editSession.session_date, new: editDate });
    }
    if (editStart !== formatTimeShort(getEffectiveStart(editSession)) || editEnd !== formatTimeShort(getEffectiveEnd(editSession))) {
      changes.push({ field: 'heure', old: `${formatTimeShort(getEffectiveStart(editSession))} - ${formatTimeShort(getEffectiveEnd(editSession))}`, new: `${editStart} - ${editEnd}` });
    }
    if (editTerrainId !== getEffectiveTerrainId(editSession)) {
      const oldName = getEffectiveTerrainName(editSession);
      const newName = terrainsList.find(t => t.id === editTerrainId)?.name || '';
      changes.push({ field: 'terrain', old: oldName, new: newName });
    }

    if (changes.length === 0) {
      showToast('Aucune modification détectée', 'warning');
      return;
    }

    setEditChanges(changes);
    setNotifConfirmAction({ type: 'modify', session: editSession });
    setNotifyChecked(true);
  };

  const handleConfirmCancelSession = () => {
    if (!cancelSessionTarget) return;
    setEditChanges([{ field: 'annulation', old: null, new: null }]);
    setNotifConfirmAction({ type: 'cancel', session: cancelSessionTarget });
    setNotifyChecked(true);
  };

  const handleResetOverrides = async () => {
    if (!editSession) return;
    setEditSaving(true);
    const { error } = await supabase
      .from('training_sessions')
      .update({ override_start_time: null, override_end_time: null, override_terrain_id: null })
      .eq('id', editSession.id);
    if (error) {
      showToast('Erreur lors de la réinitialisation', 'error');
    } else {
      showToast('Créneau d\'origine rétabli', 'success');
      setEditSession(null);
      await loadSessions();
    }
    setEditSaving(false);
  };

  const executeNotifAction = async () => {
    if (!notifConfirmAction) return;
    const { type, session } = notifConfirmAction;
    setEditSaving(true);

    const changes = [...editChanges];

    if (type === 'modify') {
      const updates: any = {};
      const slotStart = formatTimeShort(session.terrain_slots?.start_time);
      const slotEnd = formatTimeShort(session.terrain_slots?.end_time);
      const slotTerrainId = ((session.terrain_slots as any)?.terrain_halves?.terrains?.id) || '';

      if (editDate !== session.session_date) {
        updates.session_date = editDate;
      }
      const newStart = editStart === slotStart ? null : editStart;
      const newEnd = editEnd === slotEnd ? null : editEnd;
      if (editStart !== formatTimeShort(getEffectiveStart(session)) || editEnd !== formatTimeShort(getEffectiveEnd(session))) {
        updates.override_start_time = newStart;
        updates.override_end_time = newEnd;
      }
      const newTerrainId = editTerrainId === slotTerrainId ? null : editTerrainId;
      if (editTerrainId !== getEffectiveTerrainId(session)) {
        updates.override_terrain_id = newTerrainId || null;
      }

      if (Object.keys(updates).length === 0) {
        showToast('Aucune modification détectée', 'warning');
        setEditSaving(false);
        setNotifConfirmAction(null);
        return;
      }

      const { error } = await supabase.from('training_sessions').update(updates).eq('id', session.id);
      if (error) {
        showToast(attendanceSaveErrorToast('Erreur lors de la sauvegarde: ', error), 'error');
        setEditSaving(false);
        setNotifConfirmAction(null);
        return;
      }
      showToast('Entraînement modifié', 'success');
      setEditSession(null);
    } else if (type === 'cancel') {
      const { error } = await supabase
        .from('training_sessions')
        .update({ cancelled: true, cancelled_reason: cancelReason || null })
        .eq('id', session.id);
      if (error) {
        showToast(attendanceSaveErrorToast('Erreur lors de l\'annulation: ', error), 'error');
        setEditSaving(false);
        setNotifConfirmAction(null);
        return;
      }
      showToast('Entraînement annulé', 'success');
      setCancelSessionTarget(null);
      setCancelReason('');
    } else if (type === 'restore') {
      const { error } = await supabase
        .from('training_sessions')
        .update({ cancelled: false, cancelled_reason: null })
        .eq('id', session.id);
      if (error) {
        showToast(attendanceSaveErrorToast('Erreur lors de la restauration: ', error), 'error');
        setEditSaving(false);
        setNotifConfirmAction(null);
        return;
      }
      showToast('Entraînement restauré', 'success');
    }

    if (notifyChecked && changes.length > 0) {
      try {
        const { data: { session: authSession } } = await supabase.auth.getSession();
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-training-change`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authSession?.access_token}`,
            },
            body: JSON.stringify({ session_id: session.id, changes }),
          }
        );
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          if (resp.status === 403) {
            showToast('Notification refusée : vous n\'avez pas les droits pour notifier cette équipe.', 'error');
          } else {
            showToast(body.error || 'Erreur lors de l\'envoi des notifications', 'error');
          }
        }
      } catch {
        showToast('Impossible d\'envoyer les notifications', 'error');
      }
    }

    setEditSaving(false);
    setNotifConfirmAction(null);
    setEditChanges([]);
    await loadSessions();
  };

  const handleCreateSession = async () => {
    if (!newSessionDate) {
      showToast('Veuillez sélectionner une date', 'warning');
      return;
    }

    setSaving(true);
    try {
      const { data: user } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('training_sessions')
        .insert({
          team_id: teamId,
          session_date: newSessionDate,
          slot_id: newSessionSlot || null,
          created_by: user.user?.id
        });

      if (error) {
        if (error.code === '23505') {
          showToast('Une séance existe déjà pour cette équipe à cette date et ce créneau.', 'error');
          await loadSessions();
          setShowNewSession(false);
          return;
        }
        throw error;
      }

      setShowNewSession(false);
      setNewSessionDate(new Date().toISOString().split('T')[0]);
      setNewSessionSlot('');
      await loadSessions();
    } catch (error) {
      reportLoadError('TeamAttendance', error);
      showToast('Erreur lors de la création de la séance', 'error');
    } finally {
      setSaving(false);
    }
  };

  const sessionPlayers = (session: TrainingSession): Member[] =>
    activeAttendance(session)
      .map(a => ({ ...(a.members as Member), _secondary: a.members!.team_id !== teamId }))
      .sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''));

  const openAttendanceSheet = async (session: TrainingSession) => {
    setSelectedSession(session);
    const isValidated = !!session.validated_at;
    const attendanceMap: Record<string, boolean> = {};
    sessionPlayers(session).forEach(m => {
      const rec = session.attendance.find(a => a.member_id === m.id);
      attendanceMap[m.id] = rec
        ? derivePresent(rec, attendanceDefaultPresent, isValidated)
        : attendanceDefaultPresent;
    });
    setAttendance(attendanceMap);
    await loadReminderState(session.id);
  };

  const toggleAttendance = async (memberId: string, sessionId: string) => {
    const currentValue = attendance[memberId] || false;
    const newValue = !currentValue;

    setAttendance(prev => ({ ...prev, [memberId]: newValue }));

    try {
      const { error: upsertErr } = await supabase
        .from('training_attendance')
        .upsert({
          session_id: sessionId,
          member_id: memberId,
          present: newValue,
          status: newValue ? 'confirmed' : 'absent_unjustified'
        }, { onConflict: 'session_id,member_id' });
      if (upsertErr) throw upsertErr;

      if (selectedSession?.validated_at) {
        const { error: resetErr } = await supabase
          .from('training_sessions')
          .update({
            validated_at: null,
            validated_by: null
          })
          .eq('id', sessionId);
        if (resetErr) throw resetErr;
      }

      await loadSessions();
      if (selectedSession) {
        const updatedSession = await supabase
          .from('training_sessions')
          .select(`
            id, session_date, slot_id, notes, cancelled, cancelled_reason,
            validated_at, validated_by,
            override_start_time, override_end_time, override_terrain_id,
            override_terrain:override_terrain_id (name),
            terrain_slots:slot_id (id, day, start_time, end_time, terrain_halves:terrain_half_id (label, terrains:terrain_id (id, name))),
            ${ATTENDANCE_SELECT}
          `)
          .eq('id', sessionId)
          .single();

        if (updatedSession.data) {
          setSelectedSession(updatedSession.data as any);
        }
      }
    } catch (error) {
      reportLoadError('TeamAttendance', error);
      setAttendance(prev => ({ ...prev, [memberId]: currentValue }));
    }
  };

  const getSessionStatus = (session: TrainingSession): 'to_validate' | 'validated' | 'cancelled' | 'upcoming' => {
    if (session.cancelled) return 'cancelled';
    if (session.validated_at) return 'validated';
    const today = new Date().toISOString().split('T')[0];
    if (session.session_date <= today) return 'to_validate';
    return 'upcoming';
  };

  const STATUS_CONFIG = {
    validated: {
      label: 'Validée',
      color: 'var(--success-text)',
      bg: 'var(--success-soft)',
      border: 'color-mix(in srgb, var(--success) 30%, transparent)'
    },
    to_validate: {
      label: 'À valider',
      color: 'var(--warning-text)',
      bg: 'var(--warning-soft)',
      border: 'color-mix(in srgb, var(--warning) 30%, transparent)'
    },
    cancelled: {
      label: 'Annulée',
      color: 'var(--text-muted)',
      bg: 'var(--bg-subtle)',
      border: 'var(--border-color)'
    },
    upcoming: {
      label: 'À venir',
      color: 'var(--text-secondary)',
      bg: 'var(--bg-card)',
      border: 'var(--border-color)'
    }
  };

  const StatusBadge = ({ status }: { status: 'to_validate' | 'validated' | 'cancelled' | 'upcoming' }) => {
    const config = STATUS_CONFIG[status];
    return (
      <span style={{
        display: 'inline-flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: '4px',
        background: config.bg,
        color: config.color,
        border: `1px solid ${config.border}`,
        borderRadius: '99px',
        padding: '3px 10px',
        fontSize: '12px',
        fontWeight: '700',
        whiteSpace: 'nowrap',
        width: 'fit-content'
      }}>
        {status === 'validated' && <Check size={12} aria-hidden="true" style={{ flexShrink: 0 }} />}
        {status === 'to_validate' && <AlertTriangle size={12} aria-hidden="true" style={{ flexShrink: 0 }} />}
        {config.label}
      </span>
    );
  };

  const validateSession = async () => {
    if (!selectedSession) return;

    setIsValidating(true);

    const { data: { user } } = await supabase.auth.getUser();

    const upsertRows = sessionPlayers(selectedSession).map(m => ({
      session_id: selectedSession.id,
      member_id: m.id,
      present: attendance[m.id] ?? (attendanceDefaultPresent ? true : false),
      status: attendance[m.id] === false
        ? (selectedSession.attendance.find(a => a.member_id === m.id)?.status === 'absent_justified' ? 'absent_justified' : 'absent_unjustified')
        : 'confirmed',
      responded_by: user?.id ?? null,
      responded_at: new Date().toISOString(),
    }));

    const { error: attErr } = await supabase
      .from('training_attendance')
      .upsert(upsertRows, { onConflict: 'session_id,member_id' });

    if (attErr) {
      showToast(attendanceSaveErrorToast('Erreur sauvegarde présences: ', attErr), 'error');
      setIsValidating(false);
      return;
    }

    const { error } = await supabase
      .from('training_sessions')
      .update({
        validated_at: new Date().toISOString(),
        validated_by: user?.id
      })
      .eq('id', selectedSession.id);

    if (!error) {
      await loadSessions();
      setSelectedSession(null);
    } else {
      showToast(attendanceSaveErrorToast('Erreur validation: ', error), 'error');
    }

    setIsValidating(false);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    const dayName = DAY_NAMES[date.getDay() === 0 ? 7 : date.getDay()];
    return `${dayName} ${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
  };

  const formatDateFR = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('fr-CH', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  const calculateStats = () => {
    return members.map(member => {
      const total = sessions.filter(s => !s.cancelled).length;
      const present = sessions.filter(s => {
        if (s.cancelled) return false;
        const rec = s.attendance.find(a => a.member_id === member.id);
        return rec ? derivePresent(rec, attendanceDefaultPresent, !!s.validated_at) : attendanceDefaultPresent;
      }).length;
      const pct = total > 0 ? Math.round((present / total) * 100) : 0;
      return { ...member, present, total, pct };
    }).sort((a, b) => b.pct - a.pct);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[var(--accent)]"></div>
      </div>
    );
  }

  if (loadFailed) {
    return <LoadError onRetry={loadData} />;
  }

  const stats = calculateStats();

  return (
    <div className="ta-page">
      <div className="ta-header">
        <button
          onClick={() => navigate(-1)}
          className="ta-header__back"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="ta-header__title">
          Présences — {team?.name}
        </h1>
      </div>

      {aideReadOnly && (
        <div style={{ marginBottom: '16px' }}>
          <Alert variant="info" title="Aide-moniteur — accès en lecture seule." />
        </div>
      )}

      {canManageLoaded && notCoachReadOnly && (
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px' }}>{READ_ONLY_NOTE}</p>
      )}

      <Tabs
        items={[
          { key: 'sessions', label: 'Séances', icon: <ClipboardList size={14} aria-hidden="true" /> },
          { key: 'stats', label: 'Statistiques présences', icon: <BarChart3 size={14} aria-hidden="true" /> },
        ]}
        value={activeTab}
        onChange={(k) => setActiveTab(k as 'sessions' | 'stats')}
        className="mb-6"
      />

      {activeTab === 'sessions' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              Séances d'entraînement
            </h2>
            {!sheetReadOnly && (
              <Button
                variant="primary"
                leftIcon={<Plus size={18} />}
                onClick={() => setShowNewSession(true)}
              >
                Nouvelle séance
              </Button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button
              onClick={() => setFilterUnvalidated(false)}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                border: '1px solid var(--border-color)',
                background: !filterUnvalidated ? 'var(--primary)' : 'var(--bg-card)',
                color: !filterUnvalidated ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              Toutes
            </button>
            <button
              onClick={() => setFilterUnvalidated(true)}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                border: '1px solid var(--border-color)',
                background: filterUnvalidated ? 'var(--primary)' : 'var(--bg-card)',
                color: filterUnvalidated ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              Non validées
              {(() => { const c = sessions.filter(s => !s.cancelled && !s.validated_at && s.session_date < new Date().toISOString().split('T')[0]).length; return c > 0 ? ` (${c})` : ''; })()}
            </button>
          </div>

          {(() => {
            const today = new Date().toISOString().split('T')[0];
            const displayedSessions = filterUnvalidated
              ? sessions.filter(s => !s.cancelled && !s.validated_at && s.session_date < today).sort((a, b) => b.session_date.localeCompare(a.session_date))
              : sessions;
            if (displayedSessions.length === 0) return (
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '40px',
                textAlign: 'center',
                color: 'var(--text-secondary)'
              }}>
                {filterUnvalidated ? 'Aucune séance non validée' : "Aucune séance d'entraînement enregistrée"}
              </div>
            );
            return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {displayedSessions.map(session => {
                const status = getSessionStatus(session);
                const isValidated = !!session.validated_at;
                const sessionRows = activeAttendance(session);
                const presentCount = sessionRows.filter(rec => derivePresent(rec, attendanceDefaultPresent, isValidated)).length;
                const totalCount = sessionRows.length;
                const announcedAbsent = !isValidated && !session.cancelled
                  ? sessionRows.filter(a => a.status === 'excused' || a.status === 'absent_justified').length
                  : 0;

                return (
                  <div
                    key={session.id}
                    className="ta-session-card"
                    data-cancelled={session.cancelled || undefined}
                  >
                    <div className="ta-session-card__body">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span className="ta-session-card__date" style={{
                          textDecoration: session.cancelled ? 'line-through' : 'none'
                        }}>
                          {formatDateFR(session.session_date)}
                        </span>
                        <StatusBadge status={status} />
                      </div>

                      {(session.override_start_time || session.terrain_slots) && (
                        <span className="ta-session-card__time">
                          {(session.override_start_time || session.terrain_slots?.start_time || '').substring(0, 5)} – {(session.override_end_time || session.terrain_slots?.end_time || '').substring(0, 5)}
                          {getEffectiveTerrainName(session) && (
                            <span style={{ color: 'var(--text-tertiary)', marginLeft: '8px' }}>
                              · {getEffectiveTerrainName(session)}
                            </span>
                          )}
                          {sessionHasOverride(session) && (
                            <span className="ml-1.5 inline-block w-2 h-2 rounded-full" style={{ background: 'var(--warning)' }} title="Horaire/terrain modifié" />
                          )}
                        </span>
                      )}
                      {session.rain_applied && (
                        <RainBadge
                          rain_applied={true}
                          rain_plan_defined={!!session.rain_plan_defined}
                          rain_note={session.rain_note}
                          base_terrain_name={session.base_terrain_name}
                          base_start_time={session.base_start_time}
                          base_end_time={session.base_end_time}
                        />
                      )}

                      {!session.cancelled && (
                        <span className="ta-session-card__count">
                          {presentCount} / {totalCount}
                          <span className="ta-session-card__count-label">
                            {isValidated ? ' présents' : ' prévus'}
                          </span>
                          {announcedAbsent > 0 && (
                            <span style={{ color: 'var(--warning-text)', fontSize: '12px', fontWeight: 400, marginLeft: '6px' }}>
                              · {announcedAbsent} absence{announcedAbsent > 1 ? 's' : ''} annoncée{announcedAbsent > 1 ? 's' : ''}
                            </span>
                          )}
                        </span>
                      )}
                    </div>

                    <div className="ta-session-card__actions">
                      {!session.cancelled ? (
                        <>
                          {!sheetReadOnly && (
                          <button
                            onClick={() => openEditSession(session)}
                            className="ta-session-card__btn"
                            style={{ fontSize: '13px', background: 'var(--warning)', color: '#1a1a1a', border: '1px solid var(--warning)', fontWeight: 600, borderRadius: '6px', padding: '5px 12px', cursor: 'pointer' }}
                          >
                            <Pencil size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} />
                            Modifier
                          </button>
                          )}
                          <button
                            onClick={() => openAttendanceSheet(session)}
                            className="ta-session-card__btn ta-session-card__btn--primary"
                          >
                            <ClipboardList size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />Présences
                          </button>
                          {!sheetReadOnly && (
                          <button
                            onClick={() => cancelSession(session)}
                            className="ta-session-card__btn ta-session-card__btn--danger"
                          >
                            <X size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />Annuler
                          </button>
                          )}
                        </>
                      ) : !sheetReadOnly ? (
                        <button
                          onClick={() => restoreSession(session)}
                          className="ta-session-card__btn ta-session-card__btn--warning"
                        >
                          <RotateCcw size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />Restaurer
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          );
          })()}
        </div>
      )}

      {activeTab === 'stats' && (
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '16px' }}>
            Statistiques de présence
          </h2>

          {sessions.length === 0 ? (
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              padding: '40px',
              textAlign: 'center',
              color: 'var(--text-secondary)'
            }}>
              Aucune donnée disponible
            </div>
          ) : (
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              overflow: 'hidden'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-table-header)' }}>
                    <th style={{ textAlign: 'left', padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '600' }}>
                      JOUEUR
                    </th>
                    <th style={{ textAlign: 'center', padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '600' }}>
                      PRÉSENCES
                    </th>
                    <th style={{ textAlign: 'center', padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '600' }}>
                      TOTAL
                    </th>
                    <th style={{ textAlign: 'center', padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '600' }}>
                      %
                    </th>
                    <th style={{ textAlign: 'left', padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '600' }}>
                      ASSIDUITÉ
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map(player => (
                    <tr key={player.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ color: 'var(--text-primary)', fontWeight: '600' }}>
                          {player.last_name} {player.first_name}
                        </div>
                        {player.birth_date && (
                          <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                            {new Date(player.birth_date).getFullYear()}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--success-text)', fontWeight: '700', fontSize: '18px' }}>
                        {player.present}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '16px' }}>
                        {player.total}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--text-primary)', fontWeight: '700', fontSize: '18px' }}>
                        {player.pct}%
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{
                          background: 'var(--bg-hover)',
                          borderRadius: '99px',
                          height: '8px',
                          width: '120px'
                        }}>
                          <div style={{
                            background: player.pct >= 75 ? 'var(--success)' : player.pct >= 50 ? 'var(--warning)' : 'var(--danger)',
                            borderRadius: '99px',
                            height: '8px',
                            width: `${player.pct}%`,
                            transition: 'width 0.3s'
                          }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showNewSession && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50
          }}
          onClick={() => setShowNewSession(false)}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '24px',
              width: '90%',
              maxWidth: '500px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                Nouvelle séance
              </h3>
              <button
                onClick={() => setShowNewSession(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={24} />
              </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>
                Date *
              </label>
              <input
                type="date"
                value={newSessionDate}
                onChange={(e) => setNewSessionDate(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '10px',
                  color: 'var(--text-primary)',
                  fontSize: '14px'
                }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>
                Créneau (optionnel)
              </label>
              <select
                value={newSessionSlot}
                onChange={(e) => setNewSessionSlot(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '10px',
                  color: 'var(--text-primary)',
                  fontSize: '14px'
                }}
              >
                <option value="">Aucun créneau</option>
                {terrainSlots.map(slot => (
                  <option key={slot.id} value={slot.id}>
                    {DAY_NAMES[slot.day]} {slot.start_time.substring(0, 5)} – {slot.end_time.substring(0, 5)}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <Button
                variant="primary"
                className="flex-1"
                loading={saving}
                disabled={saving}
                onClick={handleCreateSession}
              >
                {saving ? 'Création...' : 'Créer la séance'}
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setShowNewSession(false)}
              >
                Annuler
              </Button>
            </div>
          </div>
        </div>
      )}

      {selectedSession && (
        <div
          className="ta-sheet-overlay"
          onClick={() => setSelectedSession(null)}
        >
          <div
            className="ta-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            {/* HEADER */}
            <div className="ta-sheet__header">
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 className="ta-sheet__title">
                  Présences du {formatDateFR(selectedSession.session_date)}
                </h3>
                <div className="ta-sheet__subtitle">{team?.name}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '2px' }}>
                  {formatTimeShort(getEffectiveStart(selectedSession))} - {formatTimeShort(getEffectiveEnd(selectedSession))}
                  {getEffectiveTerrainName(selectedSession) ? ` · ${getEffectiveTerrainName(selectedSession)}` : ''}
                </div>
                <RainBadge
                  rain_applied={!!selectedSession.rain_applied}
                  rain_plan_defined={!!selectedSession.rain_plan_defined}
                  rain_note={selectedSession.rain_note}
                  base_terrain_name={selectedSession.base_terrain_name}
                  base_start_time={selectedSession.base_start_time}
                  base_end_time={selectedSession.base_end_time}
                />
              </div>
              <button
                onClick={() => setSelectedSession(null)}
                className="ta-sheet__close"
              >
                <X size={22} />
              </button>
            </div>

            {/* REMINDERS */}
            {reminderDays.length > 0 && (
              <div className="ta-sheet__reminders">
                {[...reminderDays].sort((a, b) => b - a).map(d => {
                  const sentInfo = remindersSent[String(d)];
                  return (
                    <div key={d} className="ta-sheet__reminder-row">
                      <div className="ta-sheet__reminder-info">
                        <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                          Rappel J-{d}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {' — '}
                          {sentInfo
                            ? `Envoyé le ${new Date(sentInfo.sent_at).toLocaleDateString('fr-CH')} (${sentInfo.recipients_count} dest.)`
                            : 'Non envoyé'}
                          {!sentInfo && pendingResponseCount > 0 && ` · ${pendingResponseCount} sans réponse`}
                        </span>
                      </div>
                      {reminderProgress && reminderProgress.day === d ? (
                        <div className="ta-sheet__reminder-progress">
                          <div style={{
                            position: 'relative',
                            background: 'var(--bg-sidebar)',
                            borderRadius: '99px',
                            height: '22px',
                            overflow: 'hidden',
                            border: '1px solid var(--border-color)',
                          }}>
                            <div style={{
                              width: `${Math.min(100, Math.round((reminderProgress.current / Math.max(1, reminderProgress.total)) * 100))}%`,
                              height: '100%',
                              background: reminderProgress.status === 'error'
                                ? 'var(--danger)'
                                : reminderProgress.status === 'success'
                                  ? 'var(--success)'
                                  : 'var(--primary)',
                              borderRadius: '99px',
                              transition: 'width 0.3s ease, background 0.3s ease',
                            }} />
                            <div style={{
                              position: 'absolute', inset: 0,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: 'white', fontSize: '11px', fontWeight: 700,
                              textShadow: '0 1px 2px rgba(0,0,0,0.6)',
                            }}>
                              {reminderProgress.status === 'success'
                                ? `Envoyé (${reminderProgress.current} / ${reminderProgress.total})`
                                : reminderProgress.status === 'error'
                                  ? `Erreur (${reminderProgress.current} / ${reminderProgress.total})`
                                  : `Envoi… ${reminderProgress.current} / ${reminderProgress.total}`}
                            </div>
                          </div>
                        </div>
                      ) : sheetReadOnly ? null : (
                        <button
                          type="button"
                          className="ta-sheet__reminder-btn"
                          disabled={sendingReminderDay === d}
                          onClick={() => sendReminderNow(selectedSession.id, d)}
                        >
                          Envoyer maintenant
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* PLAYER LIST */}
            <div className="ta-sheet__list">
              {sessionPlayers(selectedSession).map(player => {
                const isPresent = attendance[player.id];
                const rec = selectedSession.attendance.find(a => a.member_id === player.id);
                const intentStatus = rec?.status;
                const coachTouched = rec?.status === 'confirmed' || rec?.status === 'absent_unjustified' || rec?.status === 'present_real' || rec?.status === 'absent_justified';
                const familyAnnounced = intentStatus === 'absent_justified';
                const familyConfirmed = intentStatus === 'confirmed';
                const isDefaultPresent = !coachTouched && !familyAnnounced && !familyConfirmed && attendanceDefaultPresent;
                const pLabel = genderLabel(player.gender, 'present');
                const eLabel = genderLabel(player.gender, 'excused');

                let intentLabel: string | null = null;
                let intentVariant: 'excused' | 'confirmed' = 'confirmed';
                let intentOpacity: number | undefined;
                if (coachTouched) {
                  intentLabel = null;
                } else if (familyAnnounced) {
                  intentVariant = 'excused';
                  intentLabel = rec?.absence_reason?.trim() ? `${eLabel} — ${rec.absence_reason.trim()}` : eLabel;
                } else if (familyConfirmed) {
                  intentLabel = pLabel;
                } else if (isDefaultPresent) {
                  intentLabel = `${pLabel} (par défaut)`;
                  intentOpacity = 0.65;
                }

                return (
                  <div
                    key={player.id}
                    className="ta-sheet__player-row"
                    onClick={sheetReadOnly ? undefined : () => toggleAttendance(player.id, selectedSession.id)}
                    style={sheetReadOnly ? { cursor: 'default' } : undefined}
                  >
                    <div className="ta-sheet__player-info">
                      <span className="ta-sheet__player-name" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px' }}>
                        <span>{player.last_name} {player.first_name}</span>
                        {player.birth_date && (
                          <span className="ta-sheet__player-year">
                            {new Date(player.birth_date).getFullYear()}
                          </span>
                        )}
                        {player._secondary && <Badge variant="neutral">Secondaire</Badge>}
                      </span>
                      {intentLabel && (
                        <span
                          className={`ta-sheet__intent ${intentVariant === 'excused' ? 'ta-sheet__intent--excused' : 'ta-sheet__intent--confirmed'}`}
                          title={familyAnnounced && rec?.absence_reason?.trim() ? rec.absence_reason.trim() : undefined}
                          style={intentOpacity ? { opacity: intentOpacity } : undefined}
                        >
                          {intentLabel}
                        </span>
                      )}
                    </div>
                    {sheetReadOnly ? (
                      <Badge variant={isPresent ? 'green' : 'red'}>{isPresent ? 'Présent' : 'Absent'}</Badge>
                    ) : (
                    <span className={`ta-sheet__pill ${isPresent ? 'ta-sheet__pill--present' : 'ta-sheet__pill--absent'}`}>
                      {isPresent ? <><CircleCheck size={12} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />Présent</> : <><CircleX size={12} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />Absent</>}
                    </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* BOTTOM BAR */}
            <div className="ta-sheet__footer">
              <div className="ta-sheet__footer-count">
                <span className="ta-sheet__footer-count-num">
                  {Object.values(attendance).filter(v => v).length}
                </span>
                {' présents / '}
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {sessionPlayers(selectedSession).length}
                </span>
                {' joueurs'}
                {selectedSession.validated_at && (
                  <span className="ta-sheet__footer-validated">
                    {' · Validé le '}
                    {new Date(selectedSession.validated_at).toLocaleDateString('fr-CH', {
                      day: 'numeric',
                      month: 'long',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                )}
              </div>
              <div className="ta-sheet__footer-actions">
                <Button type="button" variant="secondary" onClick={() => setSelectedSession(null)}>
                  {sheetReadOnly ? 'Fermer' : 'Annuler'}
                </Button>
                {!sheetReadOnly && (
                <Button
                  variant="primary"
                  onClick={validateSession}
                  disabled={isValidating || selectedSession.validated_at !== null}
                >
                  {isValidating ? 'Validation…'
                    : selectedSession.validated_at ? 'Liste validée'
                    : 'Valider la liste'}
                </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Session Modal */}
      {editSession && !notifConfirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md rounded-xl p-6 space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Modifier la séance</h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{team?.name} — {formatDate(editSession.session_date)}</p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Date</label>
                <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-input, var(--bg-app))', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Début</label>
                  <input type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-input, var(--bg-app))', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Fin</label>
                  <input type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-input, var(--bg-app))', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Terrain</label>
                <select value={editTerrainId} onChange={(e) => setEditTerrainId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-input, var(--bg-app))', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                  <option value="">— Aucun —</option>
                  {terrainsList.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>

            {sessionHasOverride(editSession) && (
              <button
                onClick={handleResetOverrides}
                disabled={editSaving}
                className="text-xs underline"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Rétablir le créneau d'origine
              </button>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setEditSession(null)} disabled={editSaving}>Annuler</Button>
              <Button variant="primary" onClick={handleSaveEdit} disabled={editSaving}>Enregistrer</Button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Session Modal */}
      {cancelSessionTarget && !notifConfirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md rounded-xl p-6 space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Annuler la séance</h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{team?.name} — {formatDate(cancelSessionTarget.session_date)}</p>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Raison (obligatoire)</label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ex: mauvaise météo, terrain indisponible..."
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--bg-input, var(--bg-app))', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => { setCancelSessionTarget(null); setCancelReason(''); }}>Retour</Button>
              <Button variant="danger" onClick={handleConfirmCancelSession} disabled={!cancelReason.trim()}>Annuler la séance</Button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Confirmation */}
      {notifConfirmAction && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-sm rounded-xl p-6 space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Bell size={20} style={{ color: 'var(--primary)' }} />
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                {notifConfirmAction.type === 'modify' ? 'Confirmer la modification' : notifConfirmAction.type === 'cancel' ? 'Confirmer l\'annulation' : 'Confirmer la restauration'}
              </h3>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {notifConfirmAction.session.session_date ? formatDate(notifConfirmAction.session.session_date) : ''} — {team?.name}
            </p>

            {editChanges.length > 0 && notifConfirmAction.type === 'modify' && (
              <ul className="text-sm space-y-1" style={{ color: 'var(--text-primary)', paddingLeft: '16px', listStyleType: 'disc' }}>
                {editChanges.map((c: any, i: number) => (
                  <li key={i}>
                    {c.field === 'date' && `Date : ${c.old} → ${c.new}`}
                    {c.field === 'heure' && `Heure : ${c.old} → ${c.new}`}
                    {c.field === 'terrain' && `Terrain : ${c.old || '—'} → ${c.new || '—'}`}
                  </li>
                ))}
              </ul>
            )}

            {notifConfirmAction.type !== 'restore' && (
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg" style={{ background: 'var(--bg-sidebar, var(--bg-hover))', border: '1px solid var(--border-color)' }}>
                <input type="checkbox" checked={notifyChecked} onChange={(e) => setNotifyChecked(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--primary, var(--accent))' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Notifier l'équipe (push + email)</span>
              </label>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => { setNotifConfirmAction(null); setEditChanges([]); }} disabled={editSaving}>Retour</Button>
              <Button variant="primary" onClick={executeNotifAction} disabled={editSaving}>
                {editSaving ? 'En cours...' : 'Confirmer'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        {...confirmState}
        onCancel={hideConfirm}
      />
      <Toast toast={toast} />
    </div>
  );
}
