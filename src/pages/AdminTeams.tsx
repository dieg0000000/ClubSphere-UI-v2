import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { CreditCard as Edit2, Trash2, Plus, X, UserPlus, ClipboardList, TriangleAlert as AlertTriangle, Lightbulb, CalendarDays, ChevronUp, ChevronDown } from 'lucide-react';
import { STAFF_ROLE_LABELS } from '../types';
import type { TeamStaff } from '../types';
import SearchInput from '../components/ui/SearchInput';
import { SortableHeader } from '../components/SortableHeader';
import useEscapeKey from '../hooks/useEscapeKey';
import { useNavigate } from 'react-router-dom';
import ConfirmModal from '../components/ConfirmModal';
import { useModuleAccess } from '../hooks/useModuleAccess';
import { useTenant } from '../context/TenantContext';
import { useWebsiteModuleEnabled } from '../hooks/useWebsiteModuleEnabled';
import { Tabs } from '../components/ui/Tabs'
import { Toggle } from '../components/Toggle';
import { Badge } from '../components/ui/Badge';
import PageTitleCount from '../components/PageTitleCount';
import { availabilityBadgeVariant, availabilityLabel, availabilitySummary } from '../utils/availabilityHelpers';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import Button from '../components/ui/Button';
import TeamPhotoCard from '../components/TeamPhotoCard';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const DAY_NAMES: Record<number | string, string> = {
  1: 'Lundi',
  2: 'Mardi',
  3: 'Mercredi',
  4: 'Jeudi',
  5: 'Vendredi',
  6: 'Samedi',
  7: 'Dimanche'
};

interface TerrainSlot {
  id: string;
  day: number;
  start_time: string;
  end_time: string;
  terrain?: {
    name: string;
  };
  half?: {
    name: string;
    label: string;
  };
}

interface Member {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  gender: string;
  licence_status: string;
  availability: string | null;
  availability_until: string | null;
  jersey_number: number | null;
  receives_convocations: boolean;
}

interface CoachQualification {
  name: string;
  description: string;
}

interface Coach {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  member_id?: string | null;
  coaching_qualifications?: CoachQualification | null;
  status: string;
}

interface TeamCategory {
  id: string;
  name: string;
  type: 'junior' | 'active';
  display_order: number;
}

interface Team {
  id: string;
  type: 'junior' | 'active';
  name: string;
  category_id: string;
  coach_id: string;
  assistant_coach_id: string | null;
  training_days: string[];
  training_time: string;
  training_location: string;
  season: string;
  training_start?: string;
  training_end?: string;
  asf_label?: string | null;
  widget_url?: string | null;
  show_widget?: boolean;
  team_categories?: TeamCategory;
  team_staff?: TeamStaff[];
  terrain_slots?: TerrainSlot[];
}

interface Season {
  id: string;
  name: string;
  active: boolean;
}

interface TeamPlayerRow extends Member {
  _secondary?: boolean;
}

interface TeamFormData {
  type: 'junior' | 'active';
  name: string;
  category_id: string;
  season: string;
  is_training_group: boolean;
  training_days: string[];
  training_time: string;
  training_location: string;
  training_start: string;
  training_end: string;
  asf_label: string;
  widget_url: string;
  show_widget: boolean;
  publish_roster: boolean;
}

interface StaffFormRow {
  id?: string;
  coach_id: string;
  coach_name: string;
  coach_member_id?: string | null;
  role: string;
  sort_order: number;
}

export function AdminTeams() {
  const navigate = useNavigate();
  const { canEdit, loading: accessLoading } = useModuleAccess('equipes');
  const { enabled: websiteEnabled } = useWebsiteModuleEnabled()
  const [activeTab, setActiveTab] = useState<'junior' | 'active'>('junior');
  const [teams, setTeams] = useState<Team[]>([]);
  const [categories, setCategories] = useState<TeamCategory[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [modalTab, setModalTab] = useState<'info' | 'players' | 'widget'>('info');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Member[]>([]);
  const [teamPlayers, setTeamPlayers] = useState<TeamPlayerRow[]>([]);
  const [filterQuery, setFilterQuery] = useState('');
  const [showAttachSearch, setShowAttachSearch] = useState(false);
  const [pendingPlayerIds, setPendingPlayerIds] = useState<string[]>([]);
  const [terrainSlots, setTerrainSlots] = useState<TerrainSlot[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
  const { toast, showToast } = useToast();
  const { clubId } = useTenant();

  const [formData, setFormData] = useState<TeamFormData>({
    type: 'junior',
    name: '',
    category_id: '',
    season: '',
    is_training_group: false,
    training_days: [],
    training_time: '',
    training_location: '',
    training_start: '',
    training_end: '',
    asf_label: '',
    widget_url: '',
    show_widget: false,
    publish_roster: false
  });
  const [staffRows, setStaffRows] = useState<StaffFormRow[]>([]);
  const [existingStaff, setExistingStaff] = useState<StaffFormRow[]>([]);
  const [showStaffPicker, setShowStaffPicker] = useState(false);
  const [staffSearchQuery, setStaffSearchQuery] = useState('');
  const [staffPersonResults, setStaffPersonResults] = useState<any[]>([]);
  const staffSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [generatingStatus, setGeneratingStatus] = useState<string>('');
  const [generatingProgress, setGeneratingProgress] = useState<{ current: number; total: number } | null>(null);
  const cancelGenerationRef = useRef(false);

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
    document.title = 'Admin Équipes - ClubSphere'
    loadData();
  }, [activeTab]);

  const handleCloseModal = useCallback(() => {
    closeModal();
  }, []);

  useEscapeKey(handleCloseModal);

  useEffect(() => {
    const fetchCoaches = async () => {
      console.log('Fetching coaches...');
      const { data, error } = await supabase
        .from('coaches')
        .select(`
          id,
          first_name,
          last_name,
          email,
          status,
          member_id,
          qualification_id,
          coaching_qualifications (name, description)
        `)
        .order('last_name');

      console.log('Coaches data:', data);
      console.log('Coaches error:', error);

      if (data) setCoaches(data as any);
    };
    fetchCoaches();
  }, []);

  useEffect(() => {
    if (!clubId) return;
    const fetchSeasons = async () => {
      const { data } = await supabase
        .from('seasons')
        .select('id, name, active')
        .eq('club_id', clubId)
        .order('start_date', { ascending: false });
      if (data) {
        const uniqueSeasons = data.reduce<Season[]>((acc, s) => {
          if (!acc.find(x => x.name === s.name)) acc.push(s);
          return acc;
        }, []);
        setSeasons(uniqueSeasons);
      }
    };
    fetchSeasons();
  }, [clubId]);

  useEffect(() => {
    const fetchCategories = async () => {
      console.log('Fetching categories, type:', formData.type);
      const { data, error } = await supabase
        .from('team_categories')
        .select('id, name, type, display_order')
        .eq('type', formData.type)
        .eq('active', true)
        .order('display_order');

      console.log('Categories data:', data);
      console.log('Categories error:', error);

      if (data) setCategories(data);
    };
    fetchCategories();
  }, [formData.type]);

  const loadData = async () => {
    try {
      setLoading(true);
      const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select(`
          *,
          team_categories(*),
          team_staff(id, coach_id, role, sort_order, notes, coach:coaches(first_name, last_name, member_id))
        `)
        .eq('type', activeTab)
        .order('level_rank', { ascending: true })
        .order('name', { ascending: true });

      if (teamsError) throw teamsError;

      if (teamsData && teamsData.length > 0) {
        const teamIds = teamsData.map((t: any) => t.id);
        const { data: slotsData } = await supabase
          .from('terrain_slots')
          .select('id, team_id, day, start_time, end_time, half:terrain_halves(name, label, terrain:terrains(name))')
          .in('team_id', teamIds);

        const slotsByTeam: Record<string, TerrainSlot[]> = {};
        for (const slot of slotsData || []) {
          const s = slot as any;
          if (!slotsByTeam[s.team_id]) slotsByTeam[s.team_id] = [];
          slotsByTeam[s.team_id].push({
            id: s.id,
            day: s.day,
            start_time: s.start_time,
            end_time: s.end_time,
            terrain: s.half?.terrain ? { name: s.half.terrain.name } : undefined,
            half: s.half ? { name: s.half.name, label: s.half.label } : undefined
          });
        }

        const teamsWithSlots = teamsData.map((t: any) => ({
          ...t,
          terrain_slots: slotsByTeam[t.id] || []
        }));
        setTeams(teamsWithSlots);
      } else {
        setTeams(teamsData || []);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = async (team?: Team) => {
    console.log('Opening modal - coaches available:', coaches.length);
    console.log('Opening modal - categories available:', categories.length);
    console.log('Opening modal - activeTab:', activeTab);
    if (team) {
      setEditingTeam(team);
      setFormData({
        type: team.type,
        name: team.name,
        category_id: team.category_id,
        season: team.season,
        is_training_group: (team as any).is_training_group ?? false,
        training_days: team.training_days || [],
        training_time: team.training_time || '',
        training_location: team.training_location || '',
        training_start: (team as any).training_start || '',
        training_end: (team as any).training_end || '',
        asf_label: team.asf_label || '',
        widget_url: team.widget_url || '',
        show_widget: team.show_widget ?? false,
        publish_roster: (team as any).publish_roster ?? false
      });
      const rows: StaffFormRow[] = (team.team_staff || []).slice().sort((a, b) => a.sort_order - b.sort_order).map((s, i) => ({
        id: s.id,
        coach_id: s.coach_id,
        coach_name: s.coach ? `${s.coach.first_name} ${s.coach.last_name}` : '?',
        coach_member_id: s.coach?.member_id,
        role: s.role,
        sort_order: i
      }));
      setStaffRows(rows);
      setExistingStaff(rows.map(r => ({ ...r })));
      await loadTeamPlayers(team.id);

      // Fetch terrain slots for this team
      console.log('Fetching slots for team_id:', team.id);

      const { data: existingSlots, error: slotsError } = await supabase
        .from('terrain_slots')
        .select(`
          id, team_id, day, start_time, end_time,
          half:terrain_halves(name, label, terrain:terrains(name))
        `)
        .eq('team_id', team.id);

      console.log('Slots found:', existingSlots?.length, slotsError);
      console.log('Slots data:', existingSlots);

      // Also check all slots to see what team_ids exist:
      const { data: allSlots } = await supabase
        .from('terrain_slots')
        .select('id, team_id, day')
        .limit(10);

      console.log('All slots in DB:', allSlots);
      console.log('Current team.id:', team.id);
      console.log('Match?', allSlots?.some(s => s.team_id === team.id));

      // Transform the data to match our interface
      const transformedSlots: TerrainSlot[] = (existingSlots || []).map((slot: any) => ({
        id: slot.id,
        day: slot.day,
        start_time: slot.start_time,
        end_time: slot.end_time,
        terrain: slot.half?.terrain ? { name: slot.half.terrain.name } : undefined,
        half: slot.half ? {
          name: slot.half.name,
          label: slot.half.label
        } : undefined
      }));

      setTerrainSlots(transformedSlots);
    } else {
      setEditingTeam(null);
      const activeSeason = seasons.find(s => s.active);
      setFormData({
        type: activeTab,
        name: '',
        category_id: '',
        season: activeSeason?.name || '',
        is_training_group: false,
        training_days: [],
        training_time: '',
        training_location: '',
        training_start: '',
        training_end: '',
        asf_label: '',
        widget_url: '',
        show_widget: false,
        publish_roster: false
      });
      setStaffRows([]);
      setExistingStaff([]);
      setTeamPlayers([]);
      setPendingPlayerIds([]);
      setTerrainSlots([]);
    }
    setModalTab('info');
    setSearchQuery('');
    setSearchResults([]);
    setFilterQuery('');
    setShowAttachSearch(false);
    setFieldErrors({});
    setShowModal(true);
  };

  const loadTeamPlayers = async (teamId: string) => {
    try {
      const cols = 'id, first_name, last_name, birth_date, gender, licence_status, availability, availability_until, jersey_number, receives_convocations';
      const [primaryRes, secondaryRes] = await Promise.all([
        supabase.from('members').select(cols).eq('team_id', teamId).order('last_name'),
        supabase.from('team_members').select(`member_id, members:member_id(${cols})`).eq('team_id', teamId),
      ]);
      if (primaryRes.error) throw primaryRes.error;
      const primaryIds = new Set((primaryRes.data || []).map((p: any) => p.id));
      const secondaryPlayers: TeamPlayerRow[] = (secondaryRes.data || [])
        .map((r: any) => r.members)
        .filter((m: any) => m && !primaryIds.has(m.id))
        .map((m: any) => ({ ...m, _secondary: true }));
      setTeamPlayers([...(primaryRes.data || []), ...secondaryPlayers]);
    } catch (error) {
      console.error('Error loading team players:', error);
    }
  };

  const searchPlayers = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      const existingPlayerIds = editingTeam
        ? teamPlayers.map(p => p.id)
        : pendingPlayerIds;

      let qb = supabase
        .from('members')
        .select('id, first_name, last_name, birth_date, gender, licence_status, availability, availability_until, jersey_number, receives_convocations, team_id')
        .eq('licence_status', 'actif')
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`);

      if (existingPlayerIds.length > 0) {
        qb = qb.not('id', 'in', `(${existingPlayerIds.join(',')})`);
      }

      const { data, error } = await qb.limit(8);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error('Error searching players:', error);
    }
  };

  const handleAddPlayer = async (player: Member) => {
    const isTrainingGroup = formData.is_training_group;
    const playerHasPrimaryTeam = (player as any).team_id != null;
    const addAsSecondary = isTrainingGroup || playerHasPrimaryTeam;

    if (editingTeam) {
      try {
        const { error: insertError } = await supabase
          .from('team_members')
          .insert({ team_id: editingTeam.id, member_id: player.id, club_id: clubId });
        if (insertError) throw insertError;

        if (!addAsSecondary) {
          const { error: memberErr } = await supabase
            .from('members')
            .update({ team_id: editingTeam.id })
            .eq('id', player.id);
          if (memberErr) throw memberErr;
        }

        const row: TeamPlayerRow = { ...player, _secondary: addAsSecondary };
        setTeamPlayers([...teamPlayers, row]);
        setSearchResults(searchResults.filter(p => p.id !== player.id));
        showToast(`${player.first_name} ${player.last_name} ajouté${addAsSecondary ? ' (secondaire)' : ''}`, 'success');
      } catch (error) {
        console.error('Error adding player:', error);
        showToast('Erreur lors de l\'ajout du joueur', 'error');
      }
    } else {
      setPendingPlayerIds([...pendingPlayerIds, player.id]);
      const row: TeamPlayerRow = { ...player, _secondary: addAsSecondary };
      setTeamPlayers([...teamPlayers, row]);
      setSearchResults(searchResults.filter(p => p.id !== player.id));
    }
  };

  const handleRemovePlayer = async (player: TeamPlayerRow) => {
    const isSecondary = !!player._secondary;
    showConfirm({
      title: 'Retirer le joueur',
      message: `Retirer ce joueur de l’équipe ?`,
      confirmLabel: 'Oui, retirer',
      cancelLabel: 'Non',
      confirmStyle: 'danger',
      onConfirm: async () => {
        hideConfirm();
        if (editingTeam) {
          try {
            const { error: deleteError } = await supabase
              .from('team_members')
              .delete()
              .eq('team_id', editingTeam.id)
              .eq('member_id', player.id);
            if (deleteError) throw deleteError;

            if (!isSecondary) {
              const { error: memberErr } = await supabase
                .from('members')
                .update({ team_id: null })
                .eq('id', player.id);
              if (memberErr) throw memberErr;
            }

            setTeamPlayers(teamPlayers.filter(p => p.id !== player.id));
          } catch (error) {
            console.error('Error removing player:', error);
            showToast('Erreur lors du retrait du joueur', 'error');
          }
        } else {
          setPendingPlayerIds(pendingPlayerIds.filter(id => id !== player.id));
          setTeamPlayers(teamPlayers.filter(p => p.id !== player.id));
        }
      }
    });
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingTeam(null);
    setStaffRows([]);
    setExistingStaff([]);
    setShowStaffPicker(false);
    setStaffSearchQuery('');
  };

  const handleSave = async () => {
    const errors: Record<string, boolean> = {};
    if (!formData.name.trim()) errors.name = true;
    if (!formData.is_training_group && !formData.category_id) errors.category_id = true;
    if (!formData.season) errors.season = true;
    const widgetUrlTrimmed = formData.widget_url.trim();
    const isValidWidgetUrl = (() => {
      if (!widgetUrlTrimmed) return false;
      if (!widgetUrlTrimmed.startsWith('https://')) return false;
      try { return new URL(widgetUrlTrimmed).hostname.endsWith('football.ch'); } catch { return false; }
    })();
    if (formData.show_widget && !isValidWidgetUrl) {
      errors.widget_url = true;
    } else if (widgetUrlTrimmed && !isValidWidgetUrl) {
      errors.widget_url = true;
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      if (errors.widget_url && !errors.name && !errors.category_id && !errors.season) {
        setModalTab('widget');
      }
      showToast('Veuillez remplir tous les champs obligatoires', 'warning');
      return;
    }
    setFieldErrors({});

    setActionLoading(true);
    try {
      const teamData = {
        type: formData.type,
        name: formData.name,
        is_training_group: formData.is_training_group,
        asf_label: formData.is_training_group ? null : (formData.asf_label.trim() || null),
        category_id: formData.is_training_group && !formData.category_id ? null : formData.category_id,
        season: formData.season,
        training_days: formData.training_days,
        training_time: formData.training_time,
        training_location: formData.training_location,
        training_start: formData.training_start || null,
        training_end: formData.training_end || null,
        show_widget: formData.is_training_group ? false : formData.show_widget,
        widget_url: !formData.is_training_group && formData.show_widget && formData.widget_url.trim() ? formData.widget_url.trim() : null,
        publish_roster: formData.publish_roster
      };

      let newTeamId: string | null = null;

      if (editingTeam) {
        const { data, error } = await supabase
          .from('teams')
          .update(teamData)
          .eq('id', editingTeam.id);

        console.log('Team update data:', teamData);
        console.log('Team update error:', error);
        console.log('Team update error details:', error?.details);
        console.log('Team update error hint:', error?.hint);
        console.log('Team update error code:', error?.code);

        if (error) {
          showToast('Erreur: ' + error.message, 'error');
          throw error;
        }
      } else {
        const { data, error } = await supabase
          .from('teams')
          .insert([teamData])
          .select()
          .single();

        console.log('Team insert data:', teamData);
        console.log('Team insert error:', error);
        console.log('Team insert error details:', error?.details);
        console.log('Team insert error hint:', error?.hint);
        console.log('Team insert error code:', error?.code);

        if (error) {
          showToast('Erreur: ' + error.message, 'error');
          throw error;
        }

        newTeamId = data?.id || null;

        if (data && pendingPlayerIds.length > 0) {
          const teamMembersData = pendingPlayerIds.map(playerId => ({
            team_id: data.id,
            member_id: playerId,
            club_id: clubId
          }));

          const { error: membersError } = await supabase
            .from('team_members')
            .insert(teamMembersData);

          if (membersError) {
            console.error('Error adding team members:', membersError);
          }

          if (!formData.is_training_group) {
            for (const playerId of pendingPlayerIds) {
              const player = teamPlayers.find(p => p.id === playerId);
              if (player && !player._secondary) {
                const { error: memberErr } = await supabase
                  .from('members')
                  .update({ team_id: data.id })
                  .eq('id', playerId);
                if (memberErr) console.error('Error updating member team_id:', memberErr);
              }
            }
          }
        }
      }

      // --- Staff persistence (diff) ---
      const teamId = editingTeam ? editingTeam.id : newTeamId;
      if (teamId) {
        const numberedRows = staffRows.map((r, i) => ({ ...r, sort_order: i }));
        const toDelete = existingStaff.filter(e => !numberedRows.some(r => r.id === e.id));
        const toInsert = numberedRows.filter(r => !r.id);
        const toUpdate = numberedRows.filter(r => r.id && existingStaff.some(e => e.id === r.id && (e.role !== r.role || e.sort_order !== r.sort_order)));

        if (toDelete.length > 0) {
          const { error: delErr } = await supabase.from('team_staff').delete().in('id', toDelete.map(d => d.id!));
          if (delErr) { showToast('Erreur staff: ' + delErr.message, 'error'); throw delErr; }
        }
        for (const row of toUpdate) {
          const { error: updErr } = await supabase.from('team_staff').update({ role: row.role, sort_order: row.sort_order }).eq('id', row.id!);
          if (updErr) { showToast('Erreur staff: ' + updErr.message, 'error'); throw updErr; }
        }
        if (toInsert.length > 0) {
          const { error: insErr } = await supabase.from('team_staff').insert(toInsert.map(r => ({ team_id: teamId, coach_id: r.coach_id, role: r.role, sort_order: r.sort_order })));
          if (insErr) { showToast('Erreur staff: ' + insErr.message, 'error'); throw insErr; }
        }
        showToast('Staff enregistré', 'success');
      }

      await loadData();
      closeModal();
    } catch (error) {
      console.error('Error saving team:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('teams')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await loadData();
      setShowDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting team:', error);
      showToast('Erreur lors de la suppression', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const toggleDay = (day: string) => {
    setFormData(prev => ({
      ...prev,
      training_days: prev.training_days.includes(day)
        ? prev.training_days.filter(d => d !== day)
        : [...prev.training_days, day]
    }));
  };

  const moveStaffRow = (idx: number, dir: -1 | 1) => {
    setStaffRows(prev => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const handleStaffPersonSearch = (query: string) => {
    setStaffSearchQuery(query);
    if (staffSearchTimer.current) clearTimeout(staffSearchTimer.current);
    if (query.length < 2) { setStaffPersonResults([]); return; }
    staffSearchTimer.current = setTimeout(async () => {
      const { data } = await supabase.rpc('search_club_people', { p_query: query, p_limit: 20 });
      const results = ((data as any[]) || []);
      setStaffPersonResults(results);
    }, 300);
  };

  const formatBirthYear = (birthDate: string) => {
    return new Date(birthDate).getFullYear();
  };

  const generateSessions = async (team: Team) => {
    if (!formData.training_start || !formData.training_end) return;

    const parseLocalDate = (dateStr: string) => {
      const [year, month, day] = dateStr.split('-').map(Number);
      return new Date(year, month - 1, day);
    };

    const start = parseLocalDate(formData.training_start);
    const end = parseLocalDate(formData.training_end);

    if (end <= start) {
      setGeneratingStatus('La date de fin doit être postérieure à la date de début.');
      setTimeout(() => setGeneratingStatus(''), 5000);
      return;
    }

    const monthsDiff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    if (monthsDiff > 24) {
            setGeneratingStatus("La période d'entraînement ne peut pas dépasser 24 mois.");
      setTimeout(() => setGeneratingStatus(''), 5000);
      return;
    }

    showConfirm({
      title: 'Générer les séances',
      message: (
        <>
          Générer toutes les séances d'entraînement du{' '}
          {start.toLocaleDateString('fr-CH')} au{' '}
          {end.toLocaleDateString('fr-CH')} ?
          <br />
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Les séances existantes seront remplacées.
          </span>
        </>
      ),
      confirmLabel: 'Oui, générer',
      cancelLabel: 'Non',
      confirmStyle: 'primary',
      onConfirm: async () => {
        hideConfirm();
        cancelGenerationRef.current = false;
        setGeneratingStatus('Chargement des créneaux...');
        setGeneratingProgress(null);

        const { data: slots } = await supabase
          .from('terrain_slots')
          .select('id, day, start_time, end_time')
          .eq('team_id', team.id);

        if (!slots || slots.length === 0) {
          setGeneratingStatus('Aucun créneau configuré pour cette équipe.');
          setTimeout(() => setGeneratingStatus(''), 4000);
          return;
        }

        const findFirstOccurrence = (startDate: Date, slotDay: number | string) => {
          const targetDay = Number(slotDay) === 7 ? 0 : Number(slotDay);
          const date = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
          const currentDay = date.getDay();
          let diff = targetDay - currentDay;
          if (diff < 0) diff += 7;
          date.setDate(date.getDate() + diff);
          return date;
        };

        // Build session list in yielding chunks to keep UI responsive
        const sessionsToCreate: { team_id: string; session_date: string; slot_id: string; cancelled: boolean }[] = [];
        const CHUNK_SIZE = 200;
        let built = 0;

        const totalEstimate = slots.reduce((sum, slot) => {
          const first = findFirstOccurrence(start, slot.day);
          if (first > end) return sum;
          return sum + Math.floor((end.getTime() - first.getTime()) / (7 * 86400000)) + 1;
        }, 0);

        if (totalEstimate > 500) {
          setGeneratingStatus(`Cette période produirait ${totalEstimate} séances, ce qui est anormal. Vérifiez les dates.`);
          setTimeout(() => setGeneratingStatus(''), 6000);
          return;
        }

        setGeneratingStatus('Génération en cours...');
        setGeneratingProgress({ current: 0, total: totalEstimate });

        for (const slot of slots) {
          const current = findFirstOccurrence(start, slot.day);
          while (current <= end) {
            if (cancelGenerationRef.current) {
              setGeneratingStatus('Génération annulée.');
              setGeneratingProgress(null);
              setTimeout(() => setGeneratingStatus(''), 3000);
              return;
            }
            const y = current.getFullYear();
            const m = String(current.getMonth() + 1).padStart(2, '0');
            const d = String(current.getDate()).padStart(2, '0');
            sessionsToCreate.push({ team_id: team.id, session_date: `${y}-${m}-${d}`, slot_id: slot.id, cancelled: false });
            built++;
            current.setDate(current.getDate() + 7);
            if (built % CHUNK_SIZE === 0) {
              setGeneratingProgress({ current: built, total: totalEstimate });
              await new Promise(r => setTimeout(r, 0));
            }
          }
        }

        if (cancelGenerationRef.current) {
          setGeneratingStatus('Génération annulée.');
          setGeneratingProgress(null);
          setTimeout(() => setGeneratingStatus(''), 3000);
          return;
        }

        if (sessionsToCreate.length > 500) {
          setGeneratingStatus(`Cette période produirait ${sessionsToCreate.length} séances, ce qui est anormal. Vérifiez les dates.`);
          setGeneratingProgress(null);
          setTimeout(() => setGeneratingStatus(''), 6000);
          return;
        }

        setGeneratingProgress({ current: totalEstimate, total: totalEstimate });
        setGeneratingStatus('Enregistrement en base...');

        const { error: deleteError } = await supabase
          .from('training_sessions')
          .delete()
          .eq('team_id', team.id);

        if (deleteError) {
          setGeneratingStatus('Erreur suppression : ' + deleteError.message);
          setGeneratingProgress(null);
          return;
        }

        const { error: insertError } = await supabase
          .from('training_sessions')
          .insert(sessionsToCreate);

        if (insertError) {
          setGeneratingStatus('Erreur : ' + insertError.message);
        } else {
          setGeneratingStatus(`${sessionsToCreate.length} séances générées !`);
        }
        setGeneratingProgress(null);
        setTimeout(() => setGeneratingStatus(''), 4000);
      }
    });
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: 'green' | 'orange' | 'red' | 'neutral'; label: string }> = {
      actif:   { variant: 'green',   label: 'Actif' },
      partant: { variant: 'orange',  label: 'Partant' },
      parti:   { variant: 'red',     label: 'Parti' },
      inactif: { variant: 'neutral', label: 'Inactif' },
    };
    const c = config[status] || config.actif;
    return <Badge variant={c.variant}>{c.label}</Badge>;
  };

  useEffect(() => {
    searchPlayers(searchQuery);
  }, [searchQuery, teamPlayers, pendingPlayerIds]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortedTeams = [...teams].sort((a, b) => {
    if (!sortField) {
      const lr = ((a as any).level_rank ?? 9999) - ((b as any).level_rank ?? 9999);
      if (lr !== 0) return lr;
      return (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' });
    }

    let aVal: any = '';
    let bVal: any = '';

    switch (sortField) {
      case 'name':
        aVal = a.name || '';
        bVal = b.name || '';
        break;
      case 'type':
        aVal = a.type || '';
        bVal = b.type || '';
        break;
      case 'category':
        aVal = a.team_categories?.name || '';
        bVal = b.team_categories?.name || '';
        break;
      case 'season':
        aVal = a.season || '';
        bVal = b.season || '';
        break;
      default:
        return 0;
    }

    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2" style={{ borderColor: 'var(--accent)' }}></div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
            <CalendarDays className="w-5 h-5" />
            Équipes
              <PageTitleCount total={teams.length} />
          </h1>
          <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>Gestion des équipes</p>
        </div>
        {canEdit && (
          <Button
            onClick={() => handleOpenModal()}
            leftIcon={<Plus size={20} />}
          >
            Nouvelle équipe
          </Button>
        )}
      </div>

      <Tabs
        items={[
          { key: 'junior', label: 'Juniors' },
          { key: 'active', label: 'Actives' },
        ]}
        value={activeTab}
        onChange={(k) => setActiveTab(k as 'junior' | 'active')}
        className="mb-6"
      />

      <div className="rounded-lg shadow-xl overflow-hidden" style={{ background: 'var(--bg-card)' }}>
        <style>{`
          .teams-stickhead thead th {
            position: sticky; top: 0; z-index: 2;
            background: var(--table-header-bg);
            border-bottom: 1px solid var(--border-color);
          }
          .teams-stickhead thead th::after {
            content: ''; position: absolute; left: 0; right: 0; bottom: -8px; height: 8px;
            pointer-events: none;
            background: linear-gradient(to bottom, rgba(0,0,0,0.28), rgba(0,0,0,0));
          }
        `}</style>
        <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
          <table className="w-full teams-stickhead" style={{ minWidth: '900px' }}>
            <thead style={{ background: 'var(--table-header-bg)' }}>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer select-none transition-colors" style={{ width: '250px', color: 'var(--text-secondary)' }} onClick={() => handleSort('name')}>
                  Nom de l'équipe {sortField === 'name' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer select-none transition-colors" style={{ width: '100px', color: 'var(--text-secondary)' }} onClick={() => handleSort('type')}>
                  Type {sortField === 'type' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer select-none transition-colors" style={{ width: '200px', color: 'var(--text-secondary)' }} onClick={() => handleSort('category')}>
                  Catégorie {sortField === 'category' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ width: '220px', color: 'var(--text-secondary)' }}>
                  Staff
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ width: '170px', color: 'var(--text-secondary)' }}>
                  Entraînements
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ width: '100px', minWidth: '100px', color: 'var(--text-secondary)' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
              {sortedTeams.map((team) => (
                <tr key={team.id} className="hover:bg-[var(--bg-hover)]">
                  <td className="px-6 py-4 text-sm font-medium" style={{ maxWidth: '250px', color: 'var(--text-primary)' }} title={team.name}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team.name}</div>
                    {team.asf_label && <div className="text-xs font-normal" style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={team.asf_label}>{team.asf_label}</div>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <Badge variant={team.type === 'junior' ? 'blue' : 'green'}>
                      {team.type === 'junior' ? 'Junior' : 'Active'}
                    </Badge>
                    {(team as any).is_training_group && <Badge variant="neutral">Groupe</Badge>}
                    {websiteEnabled && (team as any).publish_roster && <Badge variant="neutral">Effectif publié</Badge>}
                  </td>
                  <td className="px-6 py-4 text-sm" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }} title={team.team_categories?.name || '-'}>
                    {team.team_categories?.name || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm" style={{ maxWidth: '220px', color: 'var(--text-secondary)' }}>
                    {team.team_staff && team.team_staff.length > 0 ? (
                      <div className="space-y-0.5">
                        {team.team_staff.slice().sort((a, b) => a.sort_order - b.sort_order).map(s => (
                          <div key={s.id} className="text-xs" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${s.coach?.first_name} ${s.coach?.last_name} — ${STAFF_ROLE_LABELS[s.role] || s.role}`}>
                            <span style={{ color: 'var(--text-primary)', fontWeight: s.role === 'principal' ? 600 : 400 }}>{s.coach?.first_name} {s.coach?.last_name}</span>
                            <span style={{ color: 'var(--text-muted)' }}> — {STAFF_ROLE_LABELS[s.role] || s.role}</span>
                          </div>
                        ))}
                      </div>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm" style={{ maxWidth: '170px', color: 'var(--text-secondary)' }}>
                    {team.terrain_slots && team.terrain_slots.length > 0 ? (
                      <div className="space-y-1">
                        {team.terrain_slots
                          .slice()
                          .sort((a, b) => Number(a.day) - Number(b.day))
                          .map(slot => (
                            <div key={slot.id} className="flex items-center gap-1 text-xs">
                              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{DAY_NAMES[slot.day]}</span>
                              <span style={{ color: 'var(--text-secondary)' }}>{slot.start_time?.substring(0, 5)}–{slot.end_time?.substring(0, 5)}</span>
                            </div>
                          ))}
                      </div>
                    ) : team.training_days && team.training_days.length > 0 ? (
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={team.training_days.join(', ')}>
                        <div>{team.training_days.join(', ')}</div>
                        {team.training_time && <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{team.training_time}</div>}
                      </div>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium" style={{ minWidth: '150px' }}>
                    <div className="flex items-center justify-end gap-2">
                      {!accessLoading && canEdit && (
                        <button
                          onClick={() => navigate(`/admin/equipes/presences/${team.id}`)}
                          style={{ color: 'var(--success)' }}
                          className="hover:opacity-80"
                          title="Gérer les présences"
                        >
                          <ClipboardList className="w-5 h-5" />
                        </button>
                      )}
                      {canEdit && (
                        <>
                          <button
                            onClick={() => handleOpenModal(team)}
                            style={{ color: 'var(--accent)' }}
                            className="hover:opacity-80"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => {
                              showConfirm({
                                title: 'Supprimer l\'équipe',
                                message: 'Êtes-vous sûr de vouloir supprimer cette équipe ?',
                                confirmLabel: 'Oui, supprimer',
                                cancelLabel: 'Non',
                                confirmStyle: 'danger',
                                onConfirm: () => {
                                  hideConfirm();
                                  handleDelete(team.id);
                                }
                              });
                            }}
                            style={{ color: 'var(--danger)' }}
                            className="hover:opacity-80"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {teams.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center" style={{ color: 'var(--text-secondary)' }}>
                    Aucune équipe trouvée
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="sticky top-0 px-6 py-4 rounded-t-xl" style={{ background: 'var(--bg-modal-header)', zIndex: 3 }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold" style={{ color: 'var(--text-modal-header)' }}>
                  {editingTeam ? 'Modifier l\'équipe' : 'Nouvelle équipe'}
                </h2>
                <button onClick={handleCloseModal} className="hover:opacity-80" style={{ background: 'transparent', border: 'none', color: 'var(--text-modal-header)', cursor: 'pointer', padding: '4px' }}>
                  <X size={22} />
                </button>
              </div>
              <Tabs
                value={modalTab}
                onChange={(k) => setModalTab(k as 'info' | 'players' | 'widget')}
                items={[
                  { key: 'info', label: 'Informations' },
                  { key: 'players', label: formData.is_training_group ? 'Joueurs rattachés' : 'Joueurs', count: teamPlayers.length },
                  ...(!formData.is_training_group ? [{ key: 'widget', label: 'Classement & Résultats' }] : []),
                ]}
              />
            </div>

            <div className="p-6 space-y-6">
              {modalTab === 'widget' ? (
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <Toggle
                      checked={formData.show_widget}
                      onChange={(v) => setFormData(prev => ({ ...prev, show_widget: v }))}
                    />
                    <span style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '500' }}>
                      Afficher le classement et résultats aux membres
                    </span>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                      Lien vers le match center (football.ch)
                    </label>
                    <input
                      type="text"
                      value={formData.widget_url}
                      onChange={e => {
                        setFormData(prev => ({ ...prev, widget_url: e.target.value }))
                        if (fieldErrors.widget_url) setFieldErrors(prev => ({ ...prev, widget_url: false }))
                      }}
                      placeholder="https://matchcenter-acvf.football.ch/default.aspx?v=…&t=…"
                      className="w-full rounded-lg px-4 py-2 focus:outline-none"
                      style={{
                        background: 'var(--bg-input)',
                        border: `1px solid ${fieldErrors.widget_url ? 'var(--error)' : 'var(--border-color)'}`,
                        color: 'var(--text-primary)'
                      }}
                    />
                    {fieldErrors.widget_url && (
                      <p style={{ color: 'var(--error)', fontSize: '12px', marginTop: '4px' }}>
                        L'adresse doit commencer par https:// et pointer vers football.ch
                      </p>
                    )}
                    <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '8px', lineHeight: '1.5' }}>
                      Sur football.ch &rsaquo; match center, ouvrez la page de l'équipe (calendrier / résultats / classement) et copiez l'adresse.
                    </p>
                  </div>
                </div>
              ) : modalTab === 'info' ? (
                <>
              <div>
                <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>1. Équipe</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Type *
                    </label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                        <input
                          type="radio"
                          checked={formData.type === 'junior'}
                          onChange={() => setFormData(prev => ({ ...prev, type: 'junior', category_id: '' }))}
                          className="" style={{ color: 'var(--accent)' }}
                        />
                        Junior
                      </label>
                      <label className="flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                        <input
                          type="radio"
                          checked={formData.type === 'active'}
                          onChange={() => setFormData(prev => ({ ...prev, type: 'active', category_id: '' }))}
                          className="" style={{ color: 'var(--accent)' }}
                        />
                        Active
                      </label>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-sidebar)' }}>
                    <div style={{ flex: 1 }}>
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Groupe d&rsquo;entraînement (sans championnat)</span>
                      <p style={{ margin: '4px 0 0', fontSize: '12px', lineHeight: '1.4', color: 'var(--text-muted)' }}>
                        Pour un groupe transversal : gardiens, préparation physique… Les joueurs y sont rattachés en équipe secondaire et gardent leur équipe principale.
                      </p>
                    </div>
                    <Toggle checked={formData.is_training_group} onChange={(v) => setFormData(prev => ({ ...prev, is_training_group: v }))} />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Nom de l&rsquo;équipe *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => { setFormData(prev => ({ ...prev, name: e.target.value })); setFieldErrors(prev => ({ ...prev, name: false })); }}
                      className="w-full rounded-lg px-4 py-2 focus:outline-none" style={{ background: 'var(--bg-input)', border: `1px solid ${fieldErrors.name ? 'var(--danger)' : 'var(--border-color)'}`, color: 'var(--text-primary)' }}
                      placeholder="Ex: Juniors U14"
                    />
                    {fieldErrors.name && <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>Champ requis</p>}
                  </div>

                  {!formData.is_training_group && (
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Libellé ASF (match center)
                    </label>
                    <input
                      type="text"
                      value={formData.asf_label}
                      onChange={(e) => setFormData(prev => ({ ...prev, asf_label: e.target.value }))}
                      className="w-full rounded-lg px-4 py-2 focus:outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      placeholder="ex. FC Crissier IV (Jun.E)"
                    />
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Nom exact de l'équipe tel qu'il apparaît dans le calendrier du match center ASF / clubcorner. Laisser vide si le nom de l'équipe est déjà identique.</p>
                  </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Catégorie {!formData.is_training_group && '*'}
                    </label>
                    <select
                      value={formData.category_id}
                      onChange={(e) => { setFormData(prev => ({ ...prev, category_id: e.target.value })); setFieldErrors(prev => ({ ...prev, category_id: false })); }}
                      className="w-full rounded-lg px-4 py-2 focus:outline-none" style={{ background: 'var(--bg-input)', border: `1px solid ${fieldErrors.category_id ? 'var(--danger)' : 'var(--border-color)'}`, color: 'var(--text-primary)' }}
                    >
                      <option value="">Sélectionner une catégorie</option>
                      {categories.filter(c => c.type === formData.type).map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                    {fieldErrors.category_id && <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>Champ requis</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Saison *
                    </label>
                    <select
                      value={formData.season}
                      onChange={(e) => { setFormData(prev => ({ ...prev, season: e.target.value })); setFieldErrors(prev => ({ ...prev, season: false })); }}
                      className="w-full rounded-lg px-4 py-2 focus:outline-none" style={{ background: 'var(--bg-input)', border: `1px solid ${fieldErrors.season ? 'var(--danger)' : 'var(--border-color)'}`, color: 'var(--text-primary)' }}
                    >
                      <option value="">Sélectionner une saison</option>
                      {seasons.map(s => (
                        <option key={s.id} value={s.name}>{s.name}{s.active ? ' (active)' : ''}</option>
                      ))}
                    </select>
                    {fieldErrors.season && <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>Champ requis</p>}
                    {editingTeam && (() => {
                      const activeSeason = seasons.find(s => s.active);
                      return activeSeason && formData.season !== activeSeason.name ? (
                        <div className="flex items-start gap-2 mt-2 p-2 rounded-lg" style={{ background: 'var(--warning-soft)', border: '1px solid var(--warning)' }}>
                          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs" style={{ color: 'var(--warning-text)' }}>
                              Cette équipe est rattachée à une ancienne saison. Saison en cours : {activeSeason.name}
                            </p>
                            <button
                              type="button"
                              className="text-xs font-medium mt-1 underline"
                              style={{ color: 'var(--warning-text)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                              onClick={() => { setFormData(prev => ({ ...prev, season: activeSeason.name })); setFieldErrors(prev => ({ ...prev, season: false })); }}
                            >
                              Passer à la saison en cours
                            </button>
                          </div>
                        </div>
                      ) : null;
                    })()}
                  </div>
                </div>

                {websiteEnabled && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-sidebar)' }}>
                  <div style={{ flex: 1 }}>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Publier l'effectif sur le site du club</span>
                    <p style={{ margin: '4px 0 0', fontSize: '12px', lineHeight: '1.4', color: 'var(--text-muted)' }}>
                      Les noms et prénoms des joueurs apparaîtront sur le site internet du club, avec le numéro de maillot s'il est renseigné. Aucune autre information n'est publiée.
                    </p>
                  </div>
                  <Toggle checked={formData.publish_roster} onChange={(v) => setFormData(prev => ({ ...prev, publish_roster: v }))} />
                </div>
                )}

                {editingTeam && (
                  <TeamPhotoCard teamId={editingTeam.id} />
                )}
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>2. Staff de l'équipe</h3>
                {coaches.length === 0 ? (
                  <div className="rounded-lg p-4 text-sm" style={{ background: 'var(--warning-soft)', border: '1px solid var(--warning)', color: 'var(--warning-text)' }}>
                    Aucun entraîneur disponible. <button onClick={() => window.open('/admin/entraineurs', '_blank')} className="underline">Gérer les entraîneurs</button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {staffRows.map((row, idx) => (
                      <div key={row.coach_id} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '8px 12px', borderRadius: '8px', background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{row.coach_name}</span>
                          {row.coach_member_id && <span className="text-xs ml-2 px-1.5 py-0.5 rounded" style={{ background: 'var(--info-soft)', color: 'var(--info-text)' }}>Junior</span>}
                        </div>
                        <select
                          value={row.role}
                          onChange={(e) => {
                            const newRole = e.target.value;
                            if (newRole === 'principal' && staffRows.some((r, i) => i !== idx && r.role === 'principal')) {
                              showToast('Une seule personne peut être entraîneur principal.', 'warning');
                              return;
                            }
                            setStaffRows(prev => prev.map((r, i) => i === idx ? { ...r, role: newRole } : r));
                          }}
                          className="rounded-lg px-3 py-1.5 text-sm focus:outline-none"
                          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', minWidth: '180px' }}
                        >
                          {Object.entries(STAFF_ROLE_LABELS).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <button type="button" disabled={idx === 0} onClick={() => moveStaffRow(idx, -1)} style={{ color: idx === 0 ? 'var(--text-muted)' : 'var(--text-secondary)', cursor: idx === 0 ? 'default' : 'pointer' }} title="Monter"><ChevronUp size={14} /></button>
                          <button type="button" disabled={idx === staffRows.length - 1} onClick={() => moveStaffRow(idx, 1)} style={{ color: idx === staffRows.length - 1 ? 'var(--text-muted)' : 'var(--text-secondary)', cursor: idx === staffRows.length - 1 ? 'default' : 'pointer' }} title="Descendre"><ChevronDown size={14} /></button>
                        </div>
                        <button type="button" onClick={() => setStaffRows(prev => prev.filter((_, i) => i !== idx))} style={{ color: 'var(--danger)' }} title="Retirer"><X size={16} /></button>
                      </div>
                    ))}

                    <div style={{ position: 'relative' }}>
                      <Button variant="secondary" size="sm" onClick={() => setShowStaffPicker(!showStaffPicker)}>
                        <Plus size={14} /> Ajouter une personne
                      </Button>
                      {showStaffPicker && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', marginTop: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 10, maxHeight: '300px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                          <div style={{ padding: '8px', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
                            <input
                              type="text"
                              placeholder="Rechercher une personne..."
                              value={staffSearchQuery}
                              onChange={(e) => handleStaffPersonSearch(e.target.value)}
                              className="w-full rounded px-3 py-1.5 text-sm focus:outline-none"
                              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                              autoFocus
                            />
                          </div>
                          <div style={{ overflowY: 'auto', flex: 1 }}>
                            {staffSearchQuery.length < 2 ? (
                              <div className="p-3 text-sm" style={{ color: 'var(--text-muted)' }}>Tapez au moins 2 caractères…</div>
                            ) : staffPersonResults.length === 0 ? (
                              <div className="p-3 text-sm" style={{ color: 'var(--text-muted)' }}>Aucun résultat</div>
                            ) : (
                              staffPersonResults.map((person, pIdx) => {
                                const sourceLabels: Record<string, string> = { joueur: 'Joueur', comite: 'Comité', entraineur: 'Entraîneur', supporter: 'Supporter', parent: 'Parent', compte: 'Compte' };
                                const hasNoEmail = !person.email;
                                const alreadyInStaff = !hasNoEmail && staffRows.some(r => {
                                  const coach = coaches.find(c => c.id === r.coach_id);
                                  return coach && coach.email === person.email;
                                });
                                const isDisabled = hasNoEmail || alreadyInStaff;
                                return (
                                  <button
                                    key={`${person.source}-${person.source_id}-${pIdx}`}
                                    type="button"
                                    disabled={isDisabled}
                                    onClick={async () => {
                                      if (isDisabled) return;
                                      try {
                                        let coachId: string;
                                        let coachName = `${person.first_name} ${person.last_name}`;
                                        let coachMemberId: string | null = null;

                                        // Check if person already has a coach record
                                        const { data: existingCoach } = await supabase
                                          .from('coaches')
                                          .select('id, first_name, last_name, member_id')
                                          .eq('email', person.email)
                                          .maybeSingle();

                                        if (existingCoach) {
                                          coachId = existingCoach.id;
                                          coachName = `${existingCoach.first_name} ${existingCoach.last_name}`;
                                          coachMemberId = existingCoach.member_id || null;
                                        } else {
                                          const { data: newCoach, error } = await supabase
                                            .from('coaches')
                                            .insert({
                                              first_name: person.first_name,
                                              last_name: person.last_name,
                                              email: person.email,
                                              phone: person.phone || null,
                                              address: person.address || null,
                                              postal_code: person.postal_code || null,
                                              city: person.city || null,
                                              status: 'active'
                                            })
                                            .select('id, first_name, last_name, member_id')
                                            .single();

                                          if (error) {
                                            if (error.message.includes('email') && (error.message.includes('unique') || error.message.includes('coaches_email_key'))) {
                                              showToast('Une fiche entraîneur existe déjà avec cette adresse e-mail.', 'warning');
                                              const { data: fallback } = await supabase
                                                .from('coaches')
                                                .select('id, first_name, last_name, member_id')
                                                .eq('email', person.email)
                                                .maybeSingle();
                                              if (fallback) {
                                                coachId = fallback.id;
                                                coachName = `${fallback.first_name} ${fallback.last_name}`;
                                                coachMemberId = fallback.member_id || null;
                                              } else {
                                                return;
                                              }
                                            } else {
                                              showToast('Erreur: ' + error.message, 'error');
                                              return;
                                            }
                                          } else {
                                            coachId = newCoach.id;
                                            coachName = `${newCoach.first_name} ${newCoach.last_name}`;
                                            coachMemberId = newCoach.member_id || null;
                                          }
                                        }

                                        setStaffRows(prev => [...prev, {
                                          coach_id: coachId,
                                          coach_name: coachName,
                                          coach_member_id: coachMemberId,
                                          role: 'assistant',
                                          sort_order: prev.length
                                        }]);
                                        setShowStaffPicker(false);
                                        setStaffSearchQuery('');
                                        setStaffPersonResults([]);
                                      } catch (err: any) {
                                        showToast('Erreur: ' + (err.message || 'Erreur inconnue'), 'error');
                                      }
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--bg-hover)]"
                                    style={{ color: 'var(--text-primary)', opacity: isDisabled ? 0.5 : 1, cursor: isDisabled ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', gap: '2px' }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                      <span>{person.first_name} {person.last_name}</span>
                                      {(person.sources || []).map((s: string) => (
                                        <span key={s} style={{ background: 'var(--info-soft)', color: 'var(--info-text)', fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '4px' }}>
                                          {sourceLabels[s] || s}
                                        </span>
                                      ))}
                                      {alreadyInStaff && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Déjà dans le staff</span>}
                                    </div>
                                    {hasNoEmail && (
                                      <span style={{ color: 'var(--danger)', fontSize: '11px' }}>
                                        Cette personne n'a pas d'adresse e-mail. Ajoutez-la d'abord sur sa fiche.
                                      </span>
                                    )}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>3. Entraînements</h3>

                {terrainSlots && terrainSlots.length > 0 ? (
                  <div>
                    {terrainSlots.map(slot => (
                      <div key={slot.id} style={{
                        display: 'flex',
                        gap: '12px',
                        alignItems: 'center',
                        padding: '10px 0',
                        borderBottom: '1px solid var(--border-color)',
                        color: 'var(--text-primary)'
                      }}>
                        <span style={{ fontWeight: '600', minWidth: '90px' }}>
                          {DAY_NAMES[slot.day] || slot.day}
                        </span>
                        <span style={{ color: 'var(--text-muted)' }}>
                          {slot.start_time?.substring(0,5)} – {slot.end_time?.substring(0,5)}
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '13px', marginLeft: 'auto' }}>
                          {slot.terrain?.name || ''}
                          {slot.half?.label ? ` — ${slot.half.label}` : ''}
                        </span>
                      </div>
                    ))}
                    <p style={{
                      color: 'var(--text-muted)', fontSize: '12px', marginTop: '8px'
                    }}>
                      Pour modifier les créneaux, allez dans Admin Terrains → Planning
                    </p>
                  </div>
                ) : (
                  <div style={{ color: 'var(--warning-text)', fontSize: '14px' }}>
                    <AlertTriangle className="w-4 h-4 inline mr-1" />Aucun créneau configuré —
                    allez dans Admin Terrains → Planning pour en ajouter
                  </div>
                )}
              </div>

              <div style={{ marginTop: '24px' }}>
                <h4 style={{ color: 'var(--text-primary)', marginBottom: '16px' }}>
                  4. Période d'entraînement
                </h4>

                <div style={{ display: 'flex', gap: '12px' }}>
                  {(() => {
                    const today = new Date();
                    const minDate = new Date(today.getFullYear() - 2, today.getMonth(), today.getDate()).toISOString().split('T')[0];
                    const maxDate = new Date(today.getFullYear() + 3, today.getMonth(), today.getDate()).toISOString().split('T')[0];
                    return (<>
                      <div style={{ flex: 1 }}>
                        <label style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Début de saison</label>
                        <input
                          type="date"
                          value={formData.training_start || ''}
                          min={minDate}
                          max={maxDate}
                          onChange={e => setFormData({ ...formData, training_start: e.target.value })}
                          style={{ width: '100%', marginTop: '4px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px', color: 'var(--text-primary)', fontSize: '14px' }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Fin de saison</label>
                        <input
                          type="date"
                          value={formData.training_end || ''}
                          min={minDate}
                          max={maxDate}
                          onChange={e => setFormData({ ...formData, training_end: e.target.value })}
                          style={{ width: '100%', marginTop: '4px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px', color: 'var(--text-primary)', fontSize: '14px' }}
                        />
                      </div>
                    </>);
                  })()}
                </div>

                {editingTeam && (
                  <>
                    <Button
                      onClick={() => generateSessions(editingTeam)}
                      disabled={!formData.training_start || !formData.training_end}
                      style={{ marginTop: '16px', width: '100%' }}>
                      <CalendarDays className="w-4 h-4 inline mr-1" />Générer le planning des entraînements
                    </Button>

                    {generatingStatus && (
                      <div style={{ marginTop: '8px', textAlign: 'center' }}>
                        <div style={{
                          color: generatingStatus.includes('générées') ? 'var(--success)' :
                                 generatingStatus.includes('Aucun') || generatingStatus.includes('annulée') ? 'var(--warning-text)' :
                                 generatingStatus.includes('en cours') || generatingStatus.includes('Enregistrement') || generatingStatus.includes('Chargement') ? 'var(--text-primary)' : 'var(--danger)',
                          fontSize: '13px',
                        }}>
                          {generatingProgress ? `Génération : ${generatingProgress.current} séances sur ${generatingProgress.total}` : generatingStatus}
                        </div>
                        {generatingProgress && (
                          <button
                            type="button"
                            onClick={() => { cancelGenerationRef.current = true; }}
                            style={{
                              marginTop: '6px', padding: '4px 14px',
                              fontSize: '12px', fontWeight: 600,
                              background: 'var(--danger-soft)', color: 'var(--danger-text)',
                              border: '1px solid var(--danger)', borderRadius: '6px',
                              cursor: 'pointer',
                            }}
                          >
                            Annuler
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
              </>
              ) : (
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                        <UserPlus size={20} />
                        Joueurs de l'équipe
                      </h3>
                      <Button variant="secondary" size="sm" onClick={() => { setShowAttachSearch(!showAttachSearch); setSearchQuery(''); setSearchResults([]); }}>
                        <Plus size={14} /> Rattacher un joueur
                      </Button>
                    </div>

                    {showAttachSearch && (
                      <div className="mb-6 rounded-lg p-4" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
                        <div className="mb-3">
                          <SearchInput
                            value={searchQuery}
                            onChange={setSearchQuery}
                            placeholder="Rechercher un joueur actif par nom ou prénom..."
                          />
                        </div>

                        {searchQuery.length > 0 && searchQuery.length < 2 && (
                          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            Tapez au moins 2 caractères pour rechercher
                          </div>
                        )}

                        {searchResults.length > 0 && (
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {searchResults.map((player) => (
                              <div
                                key={player.id}
                                className="flex items-center justify-between p-3 rounded-lg transition-colors" style={{ background: 'var(--bg-card)' }}
                              >
                                <div className="flex items-center gap-3">
                                  <div>
                                    <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                      {player.first_name} {player.last_name}
                                    </div>
                                    <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                      {formatBirthYear(player.birth_date)} • {player.gender === 'M' ? 'M' : 'F'}
                                    </div>
                                  </div>
                                  <div>
                                    {getStatusBadge(player.licence_status)}
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleAddPlayer(player)}
                                  className="px-3 py-1 rounded transition-colors text-sm font-medium"
                                  style={{ background: 'var(--success-soft)', color: 'var(--success-text)' }}
                                >
                                  + Ajouter
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {searchQuery.length >= 2 && searchResults.length === 0 && (
                          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                            Aucun joueur trouvé
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="text-sm font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
                      Joueurs dans cette équipe ({teamPlayers.length}) :
                    </h4>

                    {teamPlayers.length > 5 && (
                      <div className="mb-3">
                        <SearchInput
                          value={filterQuery}
                          onChange={setFilterQuery}
                          placeholder="Filtrer la liste..."
                        />
                      </div>
                    )}

                    {teamPlayers.length === 0 ? (
                      <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
                        Aucun joueur dans cette équipe
                      </div>
                    ) : (
                      <div className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-card)' }}>
                        <table className="w-full">
                          <thead style={{ background: 'var(--table-header-bg)' }}>
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Prénom</th>
                              <th className="px-4 py-2 text-left text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Nom</th>
                              <th className="px-4 py-2 text-left text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Année</th>
                              <th className="px-4 py-2 text-left text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Genre</th>
                              <th className="px-4 py-2 text-left text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Statut</th>
                              <th className="px-4 py-2 text-right text-xs font-medium" style={{ color: 'var(--text-secondary)' }}></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                            {teamPlayers
                              .filter(p => {
                                if (!filterQuery.trim()) return true;
                                const q = filterQuery.toLowerCase();
                                return p.first_name.toLowerCase().includes(q) || p.last_name.toLowerCase().includes(q);
                              })
                              .map((player) => (
                              <tr key={player.id} className="hover:bg-[var(--bg-hover)]">
                                <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>
                                  <span className="inline-flex items-center gap-1.5">
                                    {player.jersey_number != null && (
                                      <span style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', fontSize: '10px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px' }}>#{player.jersey_number}</span>
                                    )}
                                    {player.first_name}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>
                                  <span className="inline-flex items-center gap-1.5">
                                    {player.last_name}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                                  <span className="inline-flex items-center gap-1.5">
                                    {formatBirthYear(player.birth_date)}
                                    {player._secondary && <Badge variant="neutral">Secondaire</Badge>}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{player.gender}</td>
                                <td className="px-4 py-3 text-sm">
                                  <span className="inline-flex items-center gap-1.5">
                                    {getStatusBadge(player.licence_status)}
                                    {availabilityBadgeVariant(player.availability) && (
                                      <span title={availabilitySummary(player.availability, player.availability_until) || ''}>
                                        <Badge variant={availabilityBadgeVariant(player.availability)!}>
                                          {availabilityLabel(player.availability)}
                                        </Badge>
                                      </span>
                                    )}
                                    {player.receives_convocations === false && (
                                      <Badge variant="neutral">Sans convocation</Badge>
                                    )}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <button
                                    onClick={() => handleRemovePlayer(player)}
                                    className="hover:opacity-80 transition-colors"
                                    style={{ color: 'var(--danger)' }}
                                  >
                                    <X size={18} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 border-t p-6 flex justify-end gap-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
              <Button
                variant="secondary"
                onClick={handleCloseModal}
              >
                Annuler
              </Button>
              <Button
                onClick={handleSave}
                disabled={actionLoading}
              >
                {actionLoading ? 'Enregistrement...' : editingTeam ? 'Enregistrer' : 'Créer'}
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
