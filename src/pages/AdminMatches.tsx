import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Upload, Calendar, MapPin, X, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, Bell, Play, CreditCard as Edit2, Plus, Users, Trophy } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useModuleAccess } from '../hooks/useModuleAccess';
import { parseCSV, parseMatchesFromCSV, importMatchesToDatabase, ParsedMatch, ImportProgress } from '../utils/csvMatchImport';
import useEscapeKey from '../hooks/useEscapeKey';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import Button from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { StandardModal } from '../components/StandardModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { Alert } from '../components/ui/Alert';
import { StatusPill } from '../components/ui/StatusPill';
import { displayScore } from '../utils/matchStatus';

export default function AdminMatches() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { canEdit, loading: accessLoading } = useModuleAccess('matchs');
  const initialPeriod = (['avenir','passes','tous'] as const).includes(searchParams.get('periode') as any)
    ? searchParams.get('periode') as 'avenir' | 'passes' | 'tous'
    : 'avenir';
  const [selectedPeriod, setSelectedPeriod] = useState<'avenir'|'passes'|'tous'>(initialPeriod);
  const [matches, setMatches] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [seasons, setSeasons] = useState<any[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>('all');
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [scoreTeamMap, setScoreTeamMap] = useState<Record<string, boolean>>({});
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifResult, setNotifResult] = useState<any>(null);
  const [simulateMatchId, setSimulateMatchId] = useState('');
  const [notifConfigDays, setNotifConfigDays] = useState<{ request: number[]; reminder: number[] }>({ request: [], reminder: [] });
  const [matchToCancel, setMatchToCancel] = useState<any>(null);
  const [matchToEdit, setMatchToEdit] = useState<any>(null);
  const [matchToConfirm, setMatchToConfirm] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [editForm, setEditForm] = useState<any>({});
  const [confirmForm, setConfirmForm] = useState<any>({});
  const [notifyOnEdit, setNotifyOnEdit] = useState(true);
  const [showEditNotifConfirm, setShowEditNotifConfirm] = useState(false);
  const [editChanges, setEditChanges] = useState<any[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [notifyOnCancel, setNotifyOnCancel] = useState(true);

  const { toast, showToast } = useToast();

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<ParsedMatch[]>([]);
  const [importSummary, setImportSummary] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [parsing, setParsing] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [venues, setVenues] = useState<any[]>([]);
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false);
  const [addForm, setAddForm] = useState({
    team_id: '',
    opponent_name: '',
    match_date: '',
    match_time: '',
    is_home: true,
    venue_id: '',
  });

  useEffect(() => { document.title = 'Matchs - ClubSphere' }, [])

  useEffect(() => {
    loadData();
  }, [selectedTeam, selectedSeason, selectedStatus]);

  const loadData = async () => {
    await Promise.all([loadTeams(), loadSeasons(), loadMatchesAndScores(), loadVenues()]);
    setLoading(false);
  };

  const loadMatchesAndScores = async () => {
    const loaded = await loadMatches();
    if (!loaded) return;
    const distinctTeamIds = [...new Set(loaded.map((m: any) => m.team_id).filter(Boolean))] as string[];
    const map: Record<string, boolean> = {};
    await Promise.all(
      distinctTeamIds.map(async (tid) => {
        try {
          const { data } = await supabase.rpc('team_records_score', { p_team_id: tid });
          map[tid] = data === true;
        } catch {
          map[tid] = false;
        }
      })
    );
    setScoreTeamMap(map);
  };

  const loadTeams = async () => {
    const { data } = await supabase
      .from('teams')
      .select('id, name, level_rank')
      .eq('active', true)
      .neq('is_training_group', true)
      .order('level_rank')
      .order('name');
    if (data) setTeams(data);
  };

  const loadVenues = async () => {
    const { data } = await supabase
      .from('venues')
      .select('id, name, city, field_name')
      .order('name');
    if (data) setVenues(data);
  };

  const loadSeasons = async () => {
    const { data } = await supabase
      .from('seasons')
      .select('id, name, code, active')
      .order('start_date', { ascending: false });
    if (data) {
      setSeasons(data);
      if (!selectedSeason && data.length > 0) {
        const activeSeason = data.find((s: any) => s.active) || data[0];
        setSelectedSeason(activeSeason.id);
      }
    }
  };

  const loadMatches = async (): Promise<any[] | null> => {
    let query = supabase
      .from('matches')
      .select(`
        *,
        team:teams(name),
        venue:venues(name, city, field_name),
        season:seasons(name)
      `)
      .order('match_date', { ascending: true });

    if (selectedTeam !== 'all') {
      query = query.eq('team_id', selectedTeam);
    }

    if (selectedSeason) {
      query = query.eq('season_id', selectedSeason);
    }

    if (selectedStatus !== 'all') {
      query = query.eq('status', selectedStatus);
    }

    const { data, error } = await query;
    if (error) {
      console.error('loadMatches error:', error);
      setLoadError(true);
      setMatches([]);
      return null;
    }
    setLoadError(false);
    setMatches(data ?? []);
    return data ?? [];
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || parsing) return;

    e.target.value = '';

    setCsvFile(file);
    setParsing(true);
    setCsvPreview([]);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      let content: string;
      const hasBOM = bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;

      if (hasBOM) {
        content = new TextDecoder('utf-8').decode(arrayBuffer);
      } else {
        try {
          content = new TextDecoder('utf-8', { fatal: true }).decode(arrayBuffer);
        } catch {
          content = new TextDecoder('iso-8859-1').decode(arrayBuffer);
        }
      }

      const rows = parseCSV(content);

      if (rows.length === 0) {
        showToast('Aucune donnée trouvée dans le fichier CSV. Vérifiez que le fichier utilise le point-virgule (;) comme séparateur.', 'warning');
        setParsing(false);
        return;
      }

      const parsed = await parseMatchesFromCSV(rows);

      if (parsed.length === 0) {
        showToast('Aucun match trouvé pour votre club dans ce fichier CSV.', 'warning');
      }

      setCsvPreview(parsed);
    } catch (error) {
      console.error('CSV import error:', error);
      showToast('Erreur lors de la lecture du fichier CSV: ' + (error as Error).message, 'error');
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!csvPreview.length || !selectedSeason) return;

    setImporting(true);
    setImportProgress(null);
    const summary = await importMatchesToDatabase(csvPreview, selectedSeason, {
      onProgress: (p) => setImportProgress(p),
    });
    setImportSummary(summary);
    setImporting(false);
    setImportProgress(null);

    await loadMatchesAndScores();
  };

  const closeImportModal = useCallback(() => {
    setShowImportModal(false);
    setCsvFile(null);
    setCsvPreview([]);
    setImportSummary(null);
    setImportProgress(null);
    setParsing(false);
  }, []);

  const handleCloseCancelModal = useCallback(() => setShowCancelModal(false), []);
  const handleCloseEditModal = useCallback(() => setShowEditModal(false), []);
  const handleCloseConfirmModal = useCallback(() => setShowConfirmModal(false), []);
  const handleCloseNotifModal = useCallback(() => { setShowNotifModal(false); setNotifResult(null); setSimulateMatchId(''); }, []);

  const handleCloseAddModal = useCallback(() => {
    setShowAddModal(false);
    setAddForm({ team_id: '', opponent_name: '', match_date: '', match_time: '', is_home: true, venue_id: '' });
    setShowDuplicateConfirm(false);
  }, []);

  useEscapeKey(closeImportModal);
  useEscapeKey(handleCloseCancelModal);
  useEscapeKey(handleCloseEditModal);
  useEscapeKey(handleCloseConfirmModal);
  useEscapeKey(handleCloseNotifModal);
  useEscapeKey(handleCloseAddModal);

  const insertFriendlyMatch = async () => {
    setAddSaving(true);
    try {
      const { error } = await supabase.from('matches').insert({
        match_number: `AMICAL-${Date.now()}`,
        team_id: addForm.team_id,
        match_date: addForm.match_date,
        match_time: addForm.match_time || null,
        opponent_name: addForm.opponent_name.trim(),
        is_home: addForm.is_home,
        venue_id: addForm.venue_id || null,
        match_type: 'amical',
        status: 'planifié',
        season_id: selectedSeason || null,
        imported_from_csv: false,
      });
      if (error) {
        if (error.code === '23505') {
          showToast('Un match avec ce numéro existe déjà. Veuillez réessayer.', 'error');
        } else {
          showToast('Erreur : ' + error.message, 'error');
        }
        return;
      }
      handleCloseAddModal();
      await loadMatches();
      showToast('Match amical ajouté avec succès.', 'success');
    } finally {
      setAddSaving(false);
    }
  };

  const handleAddMatch = async () => {
    if (!addForm.team_id || !addForm.match_date || !addForm.opponent_name.trim()) return;

    const { data: existing } = await supabase
      .from('matches')
      .select('id, match_time, opponent_name')
      .eq('team_id', addForm.team_id)
      .eq('match_date', addForm.match_date);

    if (existing && existing.length > 0) {
      setShowDuplicateConfirm(true);
      return;
    }

    await insertFriendlyMatch();
  };

  const handleCancelMatch = async () => {
    if (!matchToCancel || !cancelReason.trim()) return;

    const { error } = await supabase
      .from('matches')
      .update({
        status: 'annulé',
        cancellation_reason: cancelReason,
        updated_by: user?.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', matchToCancel.id);

    if (error) {
      showToast('Erreur lors de l\'annulation du match', 'error');
      return;
    }

    await supabase
      .from('attendance_match')
      .update({ status: 'match_annulé' })
      .eq('match_id', matchToCancel.id);

    if (notifyOnCancel) {
      await sendMatchChangeNotification(matchToCancel.id, [{ field: 'annulation', old: null, new: null }]);
    }

    setShowCancelModal(false);
    setMatchToCancel(null);
    setCancelReason('');
    setNotifyOnCancel(true);
    loadMatchesAndScores();

    showToast('Match annulé avec succès', 'success');
  };

  const handleConfirmMatch = async () => {
    if (!matchToConfirm) return;

    const { error } = await supabase
      .from('matches')
      .update({
        status: 'planifié',
        match_date: confirmForm.match_date,
        match_time: confirmForm.match_time,
        updated_by: user?.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', matchToConfirm.id);

    if (error) {
      showToast('Erreur lors de la confirmation du match', 'error');
      return;
    }

    setShowConfirmModal(false);
    setMatchToConfirm(null);
    setConfirmForm({});
    loadMatchesAndScores();
  };

  const handleEditMatch = async () => {
    if (!matchToEdit) return;

    const resolvedDate = editForm.match_date || matchToEdit.match_date;
    if (!resolvedDate) {
      showToast('La date du match est obligatoire.', 'warning');
      return;
    }

    const resolvedTime = editForm.match_time !== undefined ? editForm.match_time : (matchToEdit.match_time || '');
    const hasTime = resolvedTime && resolvedTime !== '';
    const resolvedVenueId = editForm.venue_id !== undefined ? editForm.venue_id : (matchToEdit.venue_id || '');

    const changes: any[] = [];
    if (resolvedDate !== matchToEdit.match_date) {
      changes.push({ field: 'date', old: matchToEdit.match_date, new: resolvedDate });
    }
    if ((resolvedTime || '') !== (matchToEdit.match_time || '')) {
      changes.push({ field: 'heure', old: matchToEdit.match_time || '', new: resolvedTime });
    }
    if ((resolvedVenueId || '') !== (matchToEdit.venue_id || '')) {
      changes.push({ field: 'terrain', old: matchToEdit.venue_id || null, new: resolvedVenueId || null });
    }

    if (changes.length > 0) {
      setEditChanges(changes);
      setNotifyOnEdit(true);
      setShowEditNotifConfirm(true);
    } else {
      setShowEditModal(false);
      setMatchToEdit(null);
      setEditForm({});
    }
  };

  const confirmEditSave = async () => {
    if (!matchToEdit) return;
    setEditSaving(true);

    const resolvedDate = editForm.match_date || matchToEdit.match_date;
    const resolvedTime = editForm.match_time !== undefined ? editForm.match_time : (matchToEdit.match_time || '');
    const hasTime = resolvedTime && resolvedTime !== '';
    const resolvedVenueId = editForm.venue_id !== undefined ? editForm.venue_id : (matchToEdit.venue_id || '');

    let newStatus = matchToEdit.status;
    if (!hasTime) {
      newStatus = 'à confirmer';
    } else if (matchToEdit.status === 'à confirmer' && hasTime) {
      newStatus = 'planifié';
    }

    const updateData: any = {
      match_date: resolvedDate,
      match_time: hasTime ? resolvedTime : null,
      venue_id: resolvedVenueId || null,
      status: newStatus,
      updated_by: user?.id,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('matches')
      .update(updateData)
      .eq('id', matchToEdit.id);

    if (error) {
      showToast('Erreur lors de la modification du match: ' + error.message, 'error');
      setEditSaving(false);
      return;
    }

    if (notifyOnEdit && editChanges.length > 0) {
      await sendMatchChangeNotification(matchToEdit.id, editChanges);
    }

    setShowEditNotifConfirm(false);
    setShowEditModal(false);
    setMatchToEdit(null);
    setEditForm({});
    setEditChanges([]);
    setEditSaving(false);
    loadMatchesAndScores();
    showToast('Match modifié avec succès', 'success');
  };

  const sendMatchChangeNotification = async (matchId: string, changes: any[]) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/notify-match-change`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ match_id: matchId, changes }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 403) {
          showToast('Notification refusée : vous n\'avez pas les droits pour notifier cette équipe.', 'error');
        } else {
          showToast('Erreur lors de l\'envoi de la notification : ' + (body.error || res.statusText), 'error');
        }
      }
    } catch (err: any) {
      showToast('Erreur réseau lors de l\'envoi de la notification.', 'error');
    }
  };

  const triggerNotifications = async (action: string, matchId?: string) => {
    setNotifLoading(true);
    setNotifResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/match-attendance-notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action, match_id: matchId || undefined }),
      });
      const result = await res.json();
      setNotifResult(result);
    } catch (err: any) {
      setNotifResult({ error: err.message });
    }
    setNotifLoading(false);
  };

  const loadNotifConfig = async () => {
    const { data } = await supabase
      .from('club_notification_config')
      .select('notification_type, reminder_days_array')
      .in('notification_type', ['attendance_request', 'match_reminder']);
    if (data) {
      const request = data.find(d => d.notification_type === 'attendance_request')?.reminder_days_array || [];
      const reminder = data.find(d => d.notification_type === 'match_reminder')?.reminder_days_array || [];
      setNotifConfigDays({ request, reminder });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
      case 'planifié':
        return <Badge variant="blue">Planifié</Badge>;
      case 'à confirmer':
        return <Badge variant="orange">À confirmer</Badge>;
      case 'cancelled':
      case 'annulé':
        return <Badge variant="red">Annulé</Badge>;
      case 'postponed':
      case 'reporté':
        return <Badge variant="yellow">Reporté</Badge>;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{ borderColor: 'var(--accent)' }}></div>
          <p style={{ color: 'var(--text-secondary)' }}>Chargement...</p>
        </div>
      </div>
    );
  }

  const todayStr = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  })();
  const matchSortKey = (m: any) => `${m.match_date}T${m.match_time ?? '00:00'}`;

  const handlePeriodChange = (p: 'avenir' | 'passes' | 'tous') => {
    setSelectedPeriod(p);
    const next = new URLSearchParams(searchParams);
    if (p === 'avenir') next.delete('periode'); else next.set('periode', p);
    setSearchParams(next, { replace: true });
  };

  const showScoreColumn = selectedPeriod === 'passes' || selectedPeriod === 'tous';

  const orderedMatches = (() => {
    if (selectedPeriod === 'avenir') {
      return matches.filter(m => m.match_date >= todayStr).sort((a, b) => matchSortKey(a).localeCompare(matchSortKey(b)));
    }
    if (selectedPeriod === 'passes') {
      return matches.filter(m => m.match_date < todayStr).sort((a, b) => matchSortKey(b).localeCompare(matchSortKey(a)));
    }
    return [...matches].sort((a, b) => matchSortKey(a).localeCompare(matchSortKey(b)));
  })();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
            <Trophy className="w-5 h-5" />
            Matchs
          </h1>
          <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>Planning des matchs</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          {!accessLoading && canEdit && (
            <Button
              variant="secondary"
              onClick={() => { setShowNotifModal(true); setNotifResult(null); loadNotifConfig(); }}
              leftIcon={<Bell size={20} />}
            >
              Notifications
            </Button>
          )}
          {!accessLoading && canEdit && (
            <Button
              onClick={() => setShowAddModal(true)}
              leftIcon={<Plus size={20} />}
            >
              Nouveau match amical
            </Button>
          )}
          {!accessLoading && canEdit && (
            <Button
              variant="secondary"
              onClick={() => setShowImportModal(true)}
              leftIcon={<Upload size={20} />}
            >
              Importer CSV
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-4 mb-6 flex-wrap">
        <select
          value={selectedTeam}
          onChange={(e) => setSelectedTeam(e.target.value)}
          className="px-4 py-2 rounded-lg"
          style={{
            background: 'var(--bg-card)',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: 'var(--border-color)',
            color: 'var(--text-primary)',
          }}
        >
          <option value="all">Toutes les équipes</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>

        <select
          value={selectedSeason}
          onChange={(e) => setSelectedSeason(e.target.value)}
          className="px-4 py-2 rounded-lg"
          style={{
            background: 'var(--bg-card)',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: 'var(--border-color)',
            color: 'var(--text-primary)',
          }}
        >
          {seasons.map((season) => (
            <option key={season.id} value={season.id}>
              {season.name} {season.active && '(Active)'}
            </option>
          ))}
        </select>

        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="px-4 py-2 rounded-lg"
          style={{
            background: 'var(--bg-card)',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: 'var(--border-color)',
            color: 'var(--text-primary)',
          }}
        >
          <option value="all">Tous les statuts</option>
          <option value="planifié">Planifié</option>
          <option value="à confirmer">À confirmer</option>
          <option value="annulé">Annulé</option>
          <option value="reporté">Reporté</option>
        </select>

        <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
          {([['avenir', 'À venir'], ['passes', 'Passés'], ['tous', 'Tous']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => handlePeriodChange(key as any)}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
                borderRight: key !== 'tous' ? '1px solid var(--border-color)' : 'none',
                background: selectedPeriod === key ? 'var(--accent)' : 'var(--bg-card)',
                color: selectedPeriod === key ? '#fff' : 'var(--text-primary)',
                transition: 'background 150ms, color 150ms',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="std-table-wrap">
        <style>{`
          .matches-sticky-head thead th { position: relative; }
          .matches-sticky-head thead th::after {
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
          <table className="std-table matches-sticky-head" style={{ borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                  Heure
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                  Désignation
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                  Équipe
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                  Adversaire
                </th>
                {showScoreColumn && (
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                    Score
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                  Dom/Ext
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                  Lieu
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                  Statut
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loadError ? (
                <tr>
                  <td colSpan={showScoreColumn ? 10 : 9} className="px-6 py-12 text-center" style={{ color: 'var(--danger-text)' }}>
                    Impossible de charger les matchs.
                  </td>
                </tr>
              ) : orderedMatches.length === 0 ? (
                <tr>
                  <td colSpan={showScoreColumn ? 10 : 9} className="px-6 py-12 text-center" style={{ color: 'var(--text-secondary)' }}>
                    Aucun match trouvé
                  </td>
                </tr>
              ) : (
                orderedMatches.map((match) => (
                  <tr
                    key={match.id}
                    onClick={() => navigate(`/matchs/${match.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Calendar size={16} style={{ color: 'var(--text-tertiary)' }} />
                        <div style={{ color: 'var(--text-primary)' }}>
                          {new Date(match.match_date).toLocaleDateString('fr-CH', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                      {match.match_time || '-'}
                    </td>
                    <td className="px-6 py-4" style={{ color: 'var(--text-primary)' }}>
                      <div className="flex items-center gap-2">
                        <StatusPill variant={
                          match.match_type === 'coupe' ? 'orange'
                            : match.match_type === 'amical' ? 'sky'
                            : 'green'
                        }>
                          {match.match_type === 'coupe' ? 'Coupe'
                            : match.match_type === 'amical' ? 'Amical'
                            : 'Championnat'}
                        </StatusPill>
                        {match.designation && <span>{match.designation}</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                      {(match.team as any)?.name}
                    </td>
                    <td className="px-6 py-4" style={{ color: 'var(--text-primary)' }}>
                      {match.opponent_name}
                    </td>
                    {showScoreColumn && (
                      <td className="px-6 py-4 whitespace-nowrap" style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
                        {scoreTeamMap[match.team_id] && match.score_for !== null && match.score_against !== null
                          ? (() => {
                              const [h, a] = displayScore(match.score_for, match.score_against, match.is_home);
                              return `${h} – ${a}${match.forfeit ? ' (forfait)' : ''}`;
                            })()
                          : ''}
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                      {match.is_home ? 'Domicile' : 'Extérieur'}
                    </td>
                    <td className="px-6 py-4">
                      {match.venue ? (
                        <div className="flex items-start gap-2">
                          <MapPin size={16} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                          <div>
                            <div style={{ color: 'var(--text-primary)' }}>{(match.venue as any)?.name}</div>
                            <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                              {(match.venue as any)?.city}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)' }}>-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(match.status)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => navigate(`/matchs/${match.id}`)}
                          className="transition-colors"
                          style={{ color: 'var(--accent)' }}
                          title="Convocation & présences"
                        >
                          <Users size={18} />
                        </button>
                        {!accessLoading && canEdit && match.status === 'à confirmer' && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setMatchToConfirm(match);
                              setConfirmForm({ match_date: match.match_date || '', match_time: match.match_time || '' });
                              setShowConfirmModal(true);
                            }}
                          >
                            Confirmer
                          </Button>
                        )}
                        {!accessLoading && canEdit && (match.status === 'planifié' || match.status === 'scheduled') && (
                          <>
                            <button
                              onClick={() => {
                                setMatchToEdit(match);
                                setEditForm({
                                  match_date: match.match_date,
                                  match_time: match.match_time || '',
                                  venue_id: match.venue_id || '',
                                });
                                setShowEditModal(true);
                              }}
                              className="transition-colors"
                              style={{ color: 'var(--info-text)' }}
                              title="Modifier"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button
                              onClick={() => {
                                setMatchToCancel(match);
                                setShowCancelModal(true);
                              }}
                              className="transition-colors"
                              style={{ color: 'var(--danger-text)' }}
                              title="Annuler le match"
                            >
                              <X size={18} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div
            className="w-full max-w-4xl rounded-lg shadow-xl max-h-[90vh] overflow-y-auto"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
          >
            <div className="flex items-center justify-between gap-3 px-6 py-4" style={{ background: 'var(--bg-table-header)', borderRadius: '8px 8px 0 0' }}>
              <div className="flex items-center gap-3">
                <Upload size={22} style={{ color: 'var(--text-table-header)' }} />
                <h2 className="text-lg font-bold" style={{ color: 'var(--text-table-header)' }}>
                  Importer des matchs (CSV ASF/ACVF)
                </h2>
              </div>
              <button onClick={closeImportModal} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <X size={22} style={{ color: 'var(--text-table-header)' }} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {!importSummary ? (
                <>
                  {!importing ? (
                    <>
                      <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                          Fichier CSV (format ASF/ACVF, séparateur point-virgule)
                        </label>
                        <input
                          type="file"
                          accept=".csv"
                          onChange={handleFileChange}
                          disabled={parsing}
                          className="w-full px-4 py-2 rounded-lg"
                          style={{
                            background: 'var(--bg-sidebar)',
                            borderWidth: '1px',
                            borderStyle: 'solid',
                            borderColor: 'var(--border-color)',
                            color: 'var(--text-primary)',
                          }}
                        />
                        {parsing && (
                          <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                            Analyse du fichier en cours...
                          </p>
                        )}
                        {csvFile && !parsing && csvPreview.length > 0 && (
                          <p className="mt-2 text-sm" style={{ color: 'var(--success-text)' }}>
                            ✓ Fichier chargé: {csvFile.name}
                          </p>
                        )}
                      </div>

                      {csvPreview.length > 0 && (
                        <div>
                          <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                            Aperçu ({csvPreview.length} matchs trouvés)
                          </h3>
                          <div className="max-h-96 overflow-y-auto border rounded-lg" style={{ borderColor: 'var(--border-color)' }}>
                            <table className="w-full text-sm">
                              <thead style={{ background: 'var(--table-header-bg)', position: 'sticky', top: 0 }}>
                                <tr>
                                  <th className="px-3 py-2 text-left" style={{ color: 'var(--text-secondary)' }}>Date</th>
                                  <th className="px-3 py-2 text-left" style={{ color: 'var(--text-secondary)' }}>Heure</th>
                                  <th className="px-3 py-2 text-left" style={{ color: 'var(--text-secondary)' }}>Équipe</th>
                                  <th className="px-3 py-2 text-left" style={{ color: 'var(--text-secondary)' }}>Adversaire</th>
                                  <th className="px-3 py-2 text-left" style={{ color: 'var(--text-secondary)' }}>Statut</th>
                                </tr>
                              </thead>
                              <tbody>
                                {csvPreview.map((match, idx) => (
                                  <tr key={idx} style={{ borderTopWidth: '1px', borderColor: 'var(--border-color)' }}>
                                    <td className="px-3 py-2" style={{ color: 'var(--text-primary)' }}>
                                      {new Date(match.matchDate).toLocaleDateString('fr-CH')}
                                    </td>
                                    <td className="px-3 py-2" style={{ color: 'var(--text-primary)' }}>
                                      {match.matchTime || '-'}
                                    </td>
                                    <td className="px-3 py-2">
                                      {match.teamNotRecognized ? (
                                        <span className="text-[var(--warning-text)]"><AlertTriangle className="w-3 h-3 inline mr-1" />{match.ourTeam}</span>
                                      ) : (
                                        <span style={{ color: 'var(--text-primary)' }}>{match.ourTeam}</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2" style={{ color: 'var(--text-primary)' }}>
                                      {match.opponentName}
                                    </td>
                                    <td className="px-3 py-2">
                                      {match.status === 'planifié' ? (
                                        <span style={{ color: 'var(--info-text)' }}>Planifié</span>
                                      ) : (
                                        <span className="text-[var(--warning-text)]">À confirmer</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      <div className="flex gap-3 pt-4">
                        <Button
                          variant="secondary"
                          onClick={closeImportModal}
                          className="flex-1"
                        >
                          Annuler
                        </Button>
                        <Button
                          onClick={handleImport}
                          disabled={csvPreview.length === 0 || parsing}
                          className="flex-1"
                        >
                          {parsing ? 'Analyse...' : `Importer ${csvPreview.length} match${csvPreview.length > 1 ? 's' : ''}`}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div style={{
                      background: 'var(--bg-hover)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '10px',
                      padding: '20px',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '14px' }}>
                          Importation : {importProgress?.current ?? 0} / {importProgress?.total ?? csvPreview.length}
                        </span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                          {importProgress && importProgress.total > 0
                            ? Math.round((importProgress.current / importProgress.total) * 100)
                            : 0}%
                        </span>
                      </div>
                      <div style={{
                        background: 'var(--bg-card)',
                        borderRadius: '6px',
                        height: '10px',
                        overflow: 'hidden',
                        border: '1px solid var(--border-color)',
                      }}>
                        <div style={{
                          background: 'var(--accent)',
                          height: '100%',
                          width: `${importProgress && importProgress.total > 0 ? Math.round((importProgress.current / importProgress.total) * 100) : 0}%`,
                          transition: 'width 150ms ease',
                          borderRadius: '6px',
                        }} />
                      </div>
                      <div style={{ display: 'flex', gap: '16px', marginTop: '14px' }}>
                        <div style={{
                          flex: 1,
                          background: 'var(--success-soft)',
                          border: '1px solid var(--success)',
                          borderRadius: '8px',
                          padding: '10px 12px',
                          textAlign: 'center',
                        }}>
                          <div style={{ color: 'var(--success-text)', fontSize: '20px', fontWeight: 800, lineHeight: 1 }}>
                            {importProgress?.added ?? 0}
                          </div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: '4px' }}>
                            Ajoutés
                          </div>
                        </div>
                        <div style={{
                          flex: 1,
                          background: 'var(--info-soft)',
                          border: '1px solid var(--info)',
                          borderRadius: '8px',
                          padding: '10px 12px',
                          textAlign: 'center',
                        }}>
                          <div style={{ color: 'var(--info-text)', fontSize: '20px', fontWeight: 800, lineHeight: 1 }}>
                            {importProgress?.existing ?? 0}
                          </div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: '4px' }}>
                            Déjà présents
                          </div>
                        </div>
                        <div style={{
                          flex: 1,
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          padding: '10px 12px',
                          textAlign: 'center',
                        }}>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '20px', fontWeight: 800, lineHeight: 1 }}>
                            {importProgress?.skipped ?? 0}
                          </div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: '4px' }}>
                            Ignorés
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '12px',
                  }}>
                    <div style={{
                      background: 'var(--success-soft)',
                      border: '1px solid var(--success)',
                      borderRadius: '10px',
                      padding: '16px',
                      textAlign: 'center',
                    }}>
                      <div style={{ color: 'var(--success-text)', fontSize: '28px', fontWeight: 800 }}>
                        {importSummary.imported}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>
                        Ajoutés
                      </div>
                    </div>
                    <div style={{
                      background: 'var(--info-soft)',
                      border: '1px solid var(--info)',
                      borderRadius: '10px',
                      padding: '16px',
                      textAlign: 'center',
                    }}>
                      <div style={{ color: 'var(--info-text)', fontSize: '28px', fontWeight: 800 }}>
                        {importSummary.existing}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>
                        Déjà présents
                      </div>
                    </div>
                    <div style={{
                      background: importSummary.skipped > 0 ? 'var(--warning-soft)' : 'var(--bg-hover)',
                      border: `1px solid ${importSummary.skipped > 0 ? 'var(--warning)' : 'var(--border-color)'}`,
                      borderRadius: '10px',
                      padding: '16px',
                      textAlign: 'center',
                    }}>
                      <div style={{ color: importSummary.skipped > 0 ? 'var(--warning-text)' : 'var(--text-secondary)', fontSize: '28px', fontWeight: 800 }}>
                        {importSummary.skipped}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>
                        Ignorés
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-4 rounded-lg" style={{ background: 'var(--bg-sidebar)' }}>
                    <CheckCircle size={24} style={{ color: 'var(--success-text)' }} />
                    <p className="font-semibold" style={{ color: 'var(--text-primary)', fontSize: '14px' }}>
                      {importSummary.imported + importSummary.existing + importSummary.skipped} matchs traités
                    </p>
                  </div>

                  {importSummary.unrecognizedTeams.length > 0 && (
                    <Alert variant="warning" title="Équipes non reconnues :">
                      <ul className="list-disc list-inside space-y-1" style={{ margin: 0 }}>
                        {importSummary.unrecognizedTeams.map((team: string, idx: number) => (
                          <li key={idx}>{team}</li>
                        ))}
                      </ul>
                    </Alert>
                  )}

                  {importSummary.unrecognizedTeams.length > 0 && (
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Un événement non apparié signifie que le nom de l'équipe ne correspond pas au match center : renseignez le « Libellé ASF » dans la fiche de l'équipe.
                    </p>
                  )}

                  <Button
                    variant="secondary"
                    onClick={closeImportModal}
                    className="w-full"
                  >
                    Fermer
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showConfirmModal && matchToConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div
            className="w-full max-w-md rounded-lg shadow-xl overflow-hidden"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
          >
            <div className="flex items-center gap-3 px-6 py-4" style={{ background: 'var(--bg-table-header)' }}>
              <CheckCircle size={22} style={{ color: 'var(--text-table-header)' }} />
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-table-header)' }}>
                Confirmer le match
              </h2>
            </div>

            <div className="p-6 space-y-4">
              <p style={{ color: 'var(--text-secondary)' }}>
                Match contre <strong>{matchToConfirm.opponent_name}</strong>
              </p>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                  Date du match *
                </label>
                <input
                  type="date"
                  value={confirmForm.match_date || ''}
                  onChange={(e) => setConfirmForm({ ...confirmForm, match_date: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg"
                  style={{
                    background: 'var(--bg-sidebar)',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                  Heure du match *
                </label>
                <input
                  type="time"
                  value={confirmForm.match_time || ''}
                  onChange={(e) => setConfirmForm({ ...confirmForm, match_time: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg"
                  style={{
                    background: 'var(--bg-sidebar)',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowConfirmModal(false);
                    setMatchToConfirm(null);
                    setConfirmForm({});
                  }}
                  className="flex-1"
                >
                  Annuler
                </Button>
                <Button
                  onClick={handleConfirmMatch}
                  disabled={!confirmForm.match_date || !confirmForm.match_time}
                  className="flex-1"
                >
                  Confirmer
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEditModal && matchToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}>
          <div
            className="w-full max-w-md rounded-lg shadow-xl overflow-hidden"
            style={{ background: 'var(--bg-card)' }}
          >
            <div className="flex items-center justify-between" style={{ background: 'var(--bg-table-header)', padding: '16px 24px' }}>
              <div className="flex items-center gap-3">
                <Edit2 size={22} style={{ color: 'var(--text-table-header)' }} />
                <h2 className="text-lg font-bold" style={{ color: 'var(--text-table-header)', fontWeight: 700 }}>
                  Modifier le match
                </h2>
              </div>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setMatchToEdit(null);
                  setEditForm({});
                }}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-table-header)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={22} />
              </button>
            </div>

            <div style={{ padding: '24px', background: 'var(--bg-card)' }} className="space-y-4">
              <div style={{
                background: 'var(--bg-hover)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '16px',
              }}>
                <div className="flex items-center justify-between gap-3">
                  <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '15px' }}>
                    {matchToEdit.is_home
                      ? <>{(matchToEdit.team as any)?.name} <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>vs</span> {matchToEdit.opponent_name}</>
                      : <>{matchToEdit.opponent_name} <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>vs</span> {(matchToEdit.team as any)?.name}</>
                    }
                  </div>
                  <span style={{
                    background: matchToEdit.is_home ? 'var(--success-soft)' : 'var(--info-soft)',
                    color: matchToEdit.is_home ? 'var(--success-text)' : 'var(--info-text)',
                    padding: '4px 10px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}>
                    {matchToEdit.is_home ? 'Domicile' : 'Extérieur'}
                  </span>
                </div>
                <div style={{ color: 'var(--text-tertiary)', fontSize: '12px', marginTop: '4px' }}>
                  {[(matchToEdit.team as any)?.category?.name || matchToEdit.designation, matchToEdit.match_date ? new Date(matchToEdit.match_date).toLocaleDateString('fr-CH') : null].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                  Date du match
                </label>
                <input
                  type="date"
                  value={editForm.match_date}
                  onChange={(e) => setEditForm({ ...editForm, match_date: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg"
                  style={{
                    background: 'var(--bg-sidebar)',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                  Heure du match
                </label>
                <input
                  type="time"
                  value={editForm.match_time}
                  onChange={(e) => setEditForm({ ...editForm, match_time: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg"
                  style={{
                    background: 'var(--bg-sidebar)',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                  Lieu / terrain
                </label>
                <select
                  value={editForm.venue_id || ''}
                  onChange={(e) => setEditForm({ ...editForm, venue_id: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg"
                  style={{
                    background: 'var(--bg-sidebar)',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="">— Aucun lieu —</option>
                  {venues.map((v: any) => (
                    <option key={v.id} value={v.id}>
                      {v.name}{v.field_name ? ` – ${v.field_name}` : ''}{v.city ? ` (${v.city})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {matchToEdit.asf_uid && (
                <div style={{
                  background: 'var(--info-soft)',
                  border: '1px solid var(--info)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  color: 'var(--info-text)',
                }}>
                  <span style={{ fontSize: '16px' }}>&#8505;&#65039;</span>
                  Match synchronisé ASF — les changements officiels arrivent automatiquement.
                </div>
              )}

              <div className="flex justify-end pt-4" style={{ gap: '12px' }}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowEditModal(false);
                    setMatchToEdit(null);
                    setEditForm({});
                  }}
                >
                  Annuler
                </Button>
                <Button variant="primary" onClick={handleEditMatch}>
                  Enregistrer
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEditNotifConfirm && matchToEdit && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div
            className="w-full max-w-md rounded-lg shadow-xl overflow-hidden"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
          >
            <div className="flex items-center gap-3 px-6 py-4" style={{ background: 'var(--bg-table-header)' }}>
              <Bell size={22} style={{ color: 'var(--text-table-header)' }} />
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-table-header)' }}>
                Enregistrer les modifications
              </h2>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Modifications détectées :
              </p>
              <ul className="text-sm space-y-1" style={{ color: 'var(--text-primary)', paddingLeft: '16px', listStyleType: 'disc' }}>
                {editChanges.map((c, i) => (
                  <li key={i}>
                    {c.field === 'date' && `Date : ${c.old} → ${c.new}`}
                    {c.field === 'heure' && `Heure : ${c.old || '—'} → ${c.new || '—'}`}
                    {c.field === 'terrain' && `Terrain modifié`}
                  </li>
                ))}
              </ul>

              <label
                className="flex items-center gap-3 cursor-pointer p-3 rounded-lg"
                style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
              >
                <input
                  type="checkbox"
                  checked={notifyOnEdit}
                  onChange={(e) => setNotifyOnEdit(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--accent)' }}
                />
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  Notifier l'équipe (push + email)
                </span>
              </label>

              <div className="flex justify-end pt-4" style={{ gap: '12px' }}>
                <Button
                  variant="secondary"
                  onClick={() => { setShowEditNotifConfirm(false); setEditChanges([]); }}
                  disabled={editSaving}
                >
                  Annuler
                </Button>
                <Button
                  variant="primary"
                  onClick={confirmEditSave}
                  disabled={editSaving}
                >
                  {editSaving ? 'Enregistrement...' : 'Confirmer'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showNotifModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-lg rounded-lg shadow-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="flex items-center justify-between gap-3 px-6 py-4" style={{ background: 'var(--bg-table-header)' }}>
              <div className="flex items-center gap-3">
                <Bell size={22} style={{ color: 'var(--text-table-header)' }} />
                <h2 className="text-lg font-bold" style={{ color: 'var(--text-table-header)' }}>
                  Notifications de présence
                </h2>
              </div>
              <button onClick={() => { setShowNotifModal(false); setNotifResult(null); setSimulateMatchId(''); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <X size={22} style={{ color: 'var(--text-table-header)' }} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="p-4 rounded-lg space-y-3" style={{ background: 'var(--bg-sidebar)' }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Envoyer les demandes de présence
                </p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Pour les matchs planifiés selon les jours configurés dans Notifications.
                  {notifConfigDays.request.length > 0 && (
                    <span className="font-medium"> Jours configurés : {notifConfigDays.request.map(d => `J-${d}`).join(', ')}.</span>
                  )}
                </p>
                <Button
                  size="sm"
                  onClick={() => triggerNotifications('send_j10')}
                  disabled={notifLoading}
                  leftIcon={<Bell size={16} />}
                >
                  {notifLoading ? 'Envoi...' : 'Envoyer les demandes'}
                </Button>
              </div>

              <div className="p-4 rounded-lg space-y-3" style={{ background: 'var(--bg-sidebar)' }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Envoyer les rappels
                </p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Aux joueurs sans réponse, selon les jours configurés dans Notifications.
                  {notifConfigDays.reminder.length > 0 && (
                    <span className="font-medium"> Jours configurés : {notifConfigDays.reminder.map(d => `J-${d}`).join(', ')}.</span>
                  )}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => triggerNotifications('send_reminders')}
                  disabled={notifLoading}
                  leftIcon={<Bell size={16} />}
                >
                  {notifLoading ? 'Envoi...' : 'Envoyer les rappels'}
                </Button>
              </div>

              <div className="p-4 rounded-lg space-y-3" style={{ background: 'var(--bg-sidebar)' }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Simuler notifications pour un match spécifique
                </p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Déclenche les demandes de présence pour un match précis quelle que soit sa date (test).
                </p>
                <select
                  value={simulateMatchId}
                  onChange={(e) => setSimulateMatchId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)'
                  }}
                >
                  <option value="">Sélectionner un match...</option>
                  {matches.filter(m => m.status === 'planifié').map((m) => (
                    <option key={m.id} value={m.id}>
                      {new Date(m.match_date).toLocaleDateString('fr-CH')} — {(m.team as any)?.name} vs {m.opponent_name}
                    </option>
                  ))}
                </select>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => simulateMatchId && triggerNotifications('send_j10_for_match', simulateMatchId)}
                  disabled={notifLoading || !simulateMatchId}
                  leftIcon={<Play size={16} />}
                >
                  {notifLoading ? 'Envoi...' : 'Simuler'}
                </Button>
              </div>

              {notifResult && (
                notifResult.error ? (
                  <Alert variant="danger" title="Erreur">
                    {notifResult.error}
                  </Alert>
                ) : (
                  <Alert variant="success" title="Succès">
                    {notifResult.processed !== undefined && <p>{notifResult.processed} joueur(s) notifié(s)</p>}
                    {notifResult.messages_sent !== undefined && <p>{notifResult.messages_sent} message(s) in-app envoyé(s)</p>}
                    {notifResult.reminders_sent !== undefined && <p>{notifResult.reminders_sent} rappel(s) envoyé(s)</p>}
                    {notifResult.message && <p>{notifResult.message}</p>}
                  </Alert>
                )
              )}
            </div>
          </div>
        </div>
      )}

      <StandardModal
        isOpen={showAddModal}
        onClose={handleCloseAddModal}
        title="Nouveau match amical"
        subtitle="Ajouter un match amical manuellement"
        width="480px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
              Équipe *
            </label>
            <select
              value={addForm.team_id}
              onChange={(e) => setAddForm({ ...addForm, team_id: e.target.value })}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: '8px',
                background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)',
                color: 'var(--text-primary)', fontSize: '14px',
              }}
            >
              <option value="">-- Choisir une équipe --</option>
              {teams.map((t: any) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
              Adversaire *
            </label>
            <input
              type="text"
              value={addForm.opponent_name}
              onChange={(e) => setAddForm({ ...addForm, opponent_name: e.target.value })}
              placeholder="Nom de l'équipe adverse"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: '8px',
                background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)',
                color: 'var(--text-primary)', fontSize: '14px',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
                Date *
              </label>
              <input
                type="date"
                value={addForm.match_date}
                onChange={(e) => setAddForm({ ...addForm, match_date: e.target.value })}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: '8px',
                  background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)', fontSize: '14px',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
                Heure
              </label>
              <input
                type="time"
                value={addForm.match_time}
                onChange={(e) => setAddForm({ ...addForm, match_time: e.target.value })}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: '8px',
                  background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)', fontSize: '14px',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
              Domicile / Extérieur
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setAddForm({ ...addForm, is_home: true })}
                style={{
                  flex: 1, padding: '10px', borderRadius: '8px', fontSize: '14px',
                  fontWeight: 600, cursor: 'pointer', textAlign: 'center',
                  border: '1px solid var(--border-color)',
                  background: addForm.is_home ? 'var(--success-soft)' : 'var(--bg-sidebar)',
                  color: addForm.is_home ? 'var(--success-text)' : 'var(--text-secondary)',
                }}
              >
                Domicile
              </button>
              <button
                type="button"
                onClick={() => setAddForm({ ...addForm, is_home: false })}
                style={{
                  flex: 1, padding: '10px', borderRadius: '8px', fontSize: '14px',
                  fontWeight: 600, cursor: 'pointer', textAlign: 'center',
                  border: '1px solid var(--border-color)',
                  background: !addForm.is_home ? 'var(--info-soft)' : 'var(--bg-sidebar)',
                  color: !addForm.is_home ? 'var(--info-text)' : 'var(--text-secondary)',
                }}
              >
                Extérieur
              </button>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
              Lieu
            </label>
            <select
              value={addForm.venue_id}
              onChange={(e) => setAddForm({ ...addForm, venue_id: e.target.value })}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: '8px',
                background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)',
                color: 'var(--text-primary)', fontSize: '14px',
              }}
            >
              <option value="">— Aucun lieu —</option>
              {venues.map((v: any) => (
                <option key={v.id} value={v.id}>
                  {v.name}{v.field_name ? ` – ${v.field_name}` : ''}{v.city ? ` (${v.city})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div style={{
            background: 'var(--bg-hover)', border: '1px solid var(--border-color)',
            borderRadius: '8px', padding: '10px 14px',
            display: 'flex', alignItems: 'center', gap: '8px',
            color: 'var(--text-secondary)', fontSize: '13px',
          }}>
            <span style={{ fontSize: '16px' }}>&#9917;</span>
            Type : <strong style={{ color: 'var(--text-primary)' }}>Amical</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '8px' }}>
            <Button variant="secondary" onClick={handleCloseAddModal} disabled={addSaving}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={handleAddMatch}
              disabled={addSaving || !addForm.team_id || !addForm.match_date || !addForm.opponent_name.trim()}
            >
              {addSaving ? 'Enregistrement...' : 'Ajouter le match'}
            </Button>
          </div>
        </div>
      </StandardModal>

      <ConfirmModal
        isOpen={showDuplicateConfirm}
        title="Match existant ce jour"
        message={`Cette équipe a déjà un match prévu le ${addForm.match_date ? new Date(addForm.match_date + 'T00:00:00').toLocaleDateString('fr-CH') : ''}. Voulez-vous quand même ajouter ce match amical ?`}
        confirmLabel="Confirmer"
        cancelLabel="Annuler"
        confirmStyle="warning"
        loading={addSaving}
        loadingLabel="Enregistrement..."
        onConfirm={async () => {
          setShowDuplicateConfirm(false);
          await insertFriendlyMatch();
        }}
        onCancel={() => setShowDuplicateConfirm(false)}
      />

      {showCancelModal && matchToCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}>
          <div
            className="w-full max-w-md rounded-lg shadow-xl overflow-hidden"
            style={{ background: 'var(--bg-card)' }}
          >
            <div className="flex items-center gap-3" style={{ background: 'var(--bg-table-header)', padding: '16px 24px' }}>
              <AlertTriangle size={22} style={{ color: 'var(--text-table-header)' }} />
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-table-header)', fontWeight: 700 }}>
                Annuler le match
              </h2>
            </div>

            <div className="p-6 space-y-4">
              <p style={{ color: 'var(--text-secondary)' }}>
                Match du {new Date(matchToCancel.match_date).toLocaleDateString('fr-CH')} contre{' '}
                <strong>{matchToCancel.opponent_name}</strong>
              </p>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                  Raison de l'annulation (obligatoire)
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 rounded-lg"
                  style={{
                    background: 'var(--bg-sidebar)',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)',
                  }}
                  placeholder="Ex: Terrain impraticable, conditions météo..."
                />
              </div>

              <label
                className="flex items-center gap-3 cursor-pointer p-3 rounded-lg"
                style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
              >
                <input
                  type="checkbox"
                  checked={notifyOnCancel}
                  onChange={(e) => setNotifyOnCancel(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--accent)' }}
                />
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  Notifier l'équipe (push + email)
                </span>
              </label>

              <div className="flex justify-end pt-4" style={{ gap: '12px' }}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowCancelModal(false);
                    setMatchToCancel(null);
                    setCancelReason('');
                    setNotifyOnCancel(true);
                  }}
                >
                  Fermer
                </Button>
                <Button
                  variant="danger"
                  onClick={handleCancelMatch}
                  disabled={!cancelReason.trim()}
                >
                  Confirmer l'annulation
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </div>
  );
}
