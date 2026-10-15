import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { ALL_TIME_OPTIONS, computeGridTimeRange } from '../utils/timeSlots';
import { Plus, X, TriangleAlert as AlertTriangle, MapPin, CreditCard as Edit2, Map, CloudRain } from 'lucide-react';
import TerrainMap from '../components/TerrainMap';
import { useModuleAccess } from '../hooks/useModuleAccess';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import Button from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { Tabs } from '../components/ui/Tabs';
import ConfirmModal from '../components/ConfirmModal';

interface Terrain {
  id: string;
  name: string;
  location: string | null;
  total_space: number;
  active: boolean;
  latitude: number | null;
  longitude: number | null;
  kind?: string;
}

interface TerrainHalf {
  id: string;
  terrain_id: string;
  name: string;
  label: string;
  active?: boolean;
}

interface TerrainRestriction {
  id: string;
  terrain_half_id: string;
  day: number;
  reason: string | null;
}

interface TerrainSlot {
  id: string;
  terrain_half_id: string;
  team_id: string;
  day: number;
  start_time: string;
  end_time: string;
  space_used: number;
  rain_terrain_id?: string | null;
  rain_start_time?: string | null;
  rain_end_time?: string | null;
  rain_note?: string | null;
  team?: {
    id: string;
    name: string;
    type: string;
    category?: {
      name: string;
    } | null;
  };
}

interface Team {
  id: string;
  name: string;
  type: string;
  category_id: string | null;
  category?: {
    name: string;
  } | null;
}

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];


const computeEndTime = (start: string): string => {
  const [h, m] = start.split(':').map(Number);
  const totalMinutes = h * 60 + m + 90;
  const endH = Math.floor(totalMinutes / 60);
  const endM = totalMinutes % 60;
  return `${String(Math.min(endH, 23)).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
};

export default function AdminTerrains() {
  const { canEdit, loading: accessLoading } = useModuleAccess('terrains');
  const [terrains, setTerrains] = useState<Terrain[]>([]);
  const [halves, setHalves] = useState<TerrainHalf[]>([]);
  const [restrictions, setRestrictions] = useState<TerrainRestriction[]>([]);
  const [slots, setSlots] = useState<TerrainSlot[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTerrain, setSelectedTerrain] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast, showToast } = useToast();

  const [showAddTerrainModal, setShowAddTerrainModal] = useState(false);
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [selectedHalfId, setSelectedHalfId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [editingTerrain, setEditingTerrain] = useState<Terrain | null>(null);

  const [newTerrain, setNewTerrain] = useState({
    id: '',
    name: '',
    location: '',
    total_space: 4,
    latitude: '',
    longitude: '',
    kind: 'exterieur'
  });
  const [slotOverlapError, setSlotOverlapError] = useState<string | null>(null);
  const [newSlot, setNewSlot] = useState({
    team_id: '',
    start_time: '18:00',
    end_time: '19:30',
    space_used: 1,
    rain_terrain_id: '',
    rain_start_time: '',
    rain_end_time: '',
    rain_note: ''
  });
  const [rainTimeError, setRainTimeError] = useState<string | null>(null);

  const [nameError, setNameError] = useState<string | null>(null);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deleteBlockedMessage, setDeleteBlockedMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [rainModeEnabled, setRainModeEnabled] = useState(false);

  useEffect(() => { document.title = 'Terrains - ClubSphere' }, [])

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (terrains.length > 0 && !selectedTerrain) {
      setSelectedTerrain(terrains[0].id);
    }
  }, [terrains]);

  const fetchData = async () => {
    await Promise.all([
      fetchTerrains(),
      fetchHalves(),
      fetchRestrictions(),
      fetchSlots(),
      fetchTeams(),
      fetchRainMode()
    ]);
    setLoading(false);
  };

  const fetchRainMode = async () => {
    const { data } = await supabase
      .from('club_settings')
      .select('rain_mode_enabled')
      .limit(1)
      .maybeSingle();
    setRainModeEnabled(data?.rain_mode_enabled === true);
  };

  const fetchTerrains = async () => {
    const { data } = await supabase
      .from('terrains')
      .select('*')
      .eq('active', true)
      .order('name');
    if (data) setTerrains(data);
  };

  const fetchHalves = async () => {
    const { data: halvesData, error: halvesError } = await supabase
      .from('terrain_halves')
      .select('id, terrain_id, name')
      .order('name');

    if (halvesError) {
      console.error('Error fetching halves:', halvesError);
      return;
    }

    const halves = halvesData?.map(h => ({
      ...h,
      label: `Moitié ${h.name}`,
      active: true
    })) || [];

    if (halves) setHalves(halves as TerrainHalf[]);
  };

  const fetchRestrictions = async () => {
    const { data } = await supabase
      .from('terrain_restrictions')
      .select('*');
    if (data) setRestrictions(data);
  };

  const fetchSlots = async () => {
    const { data: slotsRaw, error: slotsError } = await supabase
      .from('terrain_slots')
      .select('id, terrain_half_id, team_id, day, start_time, end_time, space_used, season, rain_terrain_id, rain_start_time, rain_end_time, rain_note')
      .eq('season', '2025-2026');

    if (slotsError) {
      console.error('Error fetching slots:', slotsError);
      setSlots([]);
      return;
    }

    if (slotsRaw && slotsRaw.length > 0) {
      const teamIds = [...new Set(slotsRaw.map(s => s.team_id).filter(Boolean))];

      const { data: teamsData } = await supabase
        .from('teams')
        .select('id, name, type, category_id, team_categories(name)')
        .in('id', teamIds);

      const slotsWithTeams = slotsRaw.map(slot => {
        const teamMatch = teamsData?.find(t => t.id === slot.team_id);
        const team = Array.isArray(teamMatch) ? teamMatch[0] : teamMatch;
        return {
          ...slot,
          team: team ? {
            id: team.id,
            name: team.name,
            type: team.type,
            category: Array.isArray(team.team_categories) ? team.team_categories[0] : team.team_categories
          } : undefined
        };
      });

      setSlots(slotsWithTeams as TerrainSlot[]);
    } else {
      setSlots([]);
    }
  };

  const fetchTeams = async () => {
    const { data } = await supabase
      .from('teams')
      .select(`
        id,
        name,
        type,
        category_id,
        category:team_categories!teams_category_id_fkey(
          id,
          name
        )
      `)
      .eq('active', true)
      .order('name');
    if (data) {
      const formattedTeams = data.map(team => ({
        ...team,
        category: Array.isArray(team.category) ? team.category[0] : team.category
      }));
      console.log('Teams with categories:', formattedTeams);
      setTeams(formattedTeams as Team[]);
    }
  };

  const handleAddTerrain = async () => {
    if (!newTerrain.name.trim()) return;

    const trimmedName = newTerrain.name.trim();
    const duplicate = terrains.find(
      t => t.name.trim().toLowerCase() === trimmedName.toLowerCase() && t.id !== newTerrain.id
    );
    if (duplicate) {
      setNameError('Un terrain portant ce nom existe déjà.');
      return;
    }
    setNameError(null);

    if (newTerrain.id) {
      const terrainData = {
        name: newTerrain.name,
        location: newTerrain.location || null,
        total_space: newTerrain.total_space,
        latitude: newTerrain.latitude ? parseFloat(newTerrain.latitude) : null,
        longitude: newTerrain.longitude ? parseFloat(newTerrain.longitude) : null,
        kind: newTerrain.kind || 'exterieur'
      };

      const { error } = await supabase
        .from('terrains')
        .update(terrainData)
        .eq('id', newTerrain.id);

      if (error) {
        showToast('Erreur modification: ' + error.message, 'error');
        return;
      }

      await fetchData();
      setShowAddTerrainModal(false);
      setNewTerrain({ id: '', name: '', location: '', total_space: 4, latitude: '', longitude: '', kind: 'exterieur' });
      setEditingTerrain(null);
    } else {
      const terrainData = {
        name: newTerrain.name,
        location: newTerrain.location,
        total_space: newTerrain.total_space,
        latitude: newTerrain.latitude ? parseFloat(newTerrain.latitude) : null,
        longitude: newTerrain.longitude ? parseFloat(newTerrain.longitude) : null,
        kind: newTerrain.kind || 'exterieur'
      };

      const { data: terrain, error: insertErr } = await supabase
        .from('terrains')
        .insert([terrainData])
        .select()
        .single();

      if (insertErr) {
        showToast('Erreur création: ' + insertErr.message, 'error');
        return;
      }

      if (terrain) {
        const halvesInsert = newTerrain.kind === 'salle'
          ? [{ terrain_id: terrain.id, name: 'A', label: 'Salle', active: true }]
          : [
              { terrain_id: terrain.id, name: 'A', label: 'Demi-terrain A', active: true },
              { terrain_id: terrain.id, name: 'B', label: 'Demi-terrain B', active: true }
            ];
        const { error: halvesErr } = await supabase.from('terrain_halves').insert(halvesInsert);
        if (halvesErr) {
          showToast('Terrain créé mais erreur demi-terrains: ' + halvesErr.message, 'error');
        }

        await fetchData();
        setShowAddTerrainModal(false);
        setNewTerrain({ id: '', name: '', location: '', total_space: 4, latitude: '', longitude: '', kind: 'exterieur' });
      }
    }
  };

  const handleEditTerrain = (terrain: Terrain) => {
    setNewTerrain({
      id: terrain.id,
      name: terrain.name,
      location: terrain.location || '',
      total_space: terrain.total_space,
      latitude: terrain.latitude?.toString() || '',
      longitude: terrain.longitude?.toString() || '',
      kind: terrain.kind || 'exterieur'
    });
    setEditingTerrain(terrain);
    setShowAddTerrainModal(true);
  };

  const handleCloseModal = () => {
    setShowAddTerrainModal(false);
    setNewTerrain({ id: '', name: '', location: '', total_space: 4, latitude: '', longitude: '', kind: 'exterieur' });
    setEditingTerrain(null);
    setNameError(null);
    setDeleteBlockedMessage(null);
    setDeleteStep(0);
  };

  const handleRequestDeleteTerrain = () => {
    if (!editingTerrain) return;

    const terrainHalves = halves.filter(h => h.terrain_id === editingTerrain.id);
    const halfIds = terrainHalves.map(h => h.id);
    const linkedSlots = slots.filter(s => halfIds.includes(s.terrain_half_id));

    if (linkedSlots.length > 0) {
      setDeleteBlockedMessage(
        `Impossible de supprimer ce terrain : il contient ${linkedSlots.length} créneau(x) d'entraînement. Veuillez d'abord les supprimer ou les réassigner.`
      );
      return;
    }

    setDeleteBlockedMessage(null);
    setDeleteStep(1);
  };

  const handleConfirmDeleteTerrain = async () => {
    if (!editingTerrain) return;
    setDeleting(true);

    try {
      const terrainHalves = halves.filter(h => h.terrain_id === editingTerrain.id);
      for (const half of terrainHalves) {
        const { error: rErr } = await supabase.from('terrain_restrictions').delete().eq('terrain_half_id', half.id);
        if (rErr) throw rErr;
        const { error: hErr } = await supabase.from('terrain_halves').delete().eq('id', half.id);
        if (hErr) throw hErr;
      }

      const { error: tErr } = await supabase.from('terrains').delete().eq('id', editingTerrain.id);
      if (tErr) throw tErr;

      setDeleteStep(0);
      setShowAddTerrainModal(false);
      setEditingTerrain(null);
      setNewTerrain({ id: '', name: '', location: '', total_space: 4, latitude: '', longitude: '', kind: 'exterieur' });

      if (selectedTerrain === editingTerrain.id) {
        setSelectedTerrain(null);
      }

      await fetchData();
    } catch (error: any) {
      showToast('Erreur suppression: ' + error.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  useEscapeKey(() => {
    if (deleteStep > 0) {
      setDeleteStep(0);
      return;
    }
    setShowAddTerrainModal(false);
    setShowSlotModal(false);
    setEditingSlotId(null);
    setEditingTerrain(null);
    setNameError(null);
    setDeleteBlockedMessage(null);
  });

  const handleStartTimeChange = (start: string) => {
    setNewSlot(prev => ({ ...prev, start_time: start, end_time: computeEndTime(start) }));
  };

  const closeSlotModal = () => {
    setShowSlotModal(false);
    setEditingSlotId(null);
    setSlotOverlapError(null);
    setRainTimeError(null);
    setNewSlot({ team_id: '', start_time: '18:00', end_time: '19:30', space_used: 1, rain_terrain_id: '', rain_start_time: '', rain_end_time: '', rain_note: '' });
  };

  const handleSaveSlot = async () => {
    if (!selectedHalfId || !newSlot.team_id || !selectedDay || !newSlot.start_time || !newSlot.end_time) {
      showToast('Veuillez remplir tous les champs', 'warning');
      return;
    }


    if (newSlot.rain_start_time && newSlot.rain_end_time && newSlot.rain_end_time <= newSlot.rain_start_time) {
      setRainTimeError("L'heure de fin pluie doit être après l'heure de début.");
      return;
    }
    setRainTimeError(null);

    const slotData: Record<string, unknown> = {
      terrain_half_id: selectedHalfId,
      team_id: newSlot.team_id,
      day: selectedDay,
      start_time: newSlot.start_time,
      end_time: newSlot.end_time,
      space_used: newSlot.space_used,
      rain_terrain_id: newSlot.rain_terrain_id || null,
      rain_start_time: newSlot.rain_start_time || null,
      rain_end_time: newSlot.rain_end_time || null,
      rain_note: newSlot.rain_note.trim() || null
    };

    const { error } = editingSlotId
      ? await supabase.from('terrain_slots').update(slotData).eq('id', editingSlotId)
      : await supabase.from('terrain_slots').insert([slotData]);

    if (error) {
      if (error.message?.includes('TEAM_SLOT_OVERLAP')) {
        setSlotOverlapError("Impossible : cette équipe a déjà un créneau d'entraînement qui chevauche cet horaire ce jour-là.");
      } else {
        setSlotOverlapError('Erreur sauvegarde : ' + error.message);
      }
      return;
    }

    await fetchSlots();
    closeSlotModal();
  };

  const handleDeleteSlot = async (slotId: string) => {
    const { error } = await supabase.from('terrain_slots').delete().eq('id', slotId);
    if (error) {
      showToast('Erreur suppression: ' + error.message, 'error');
      return;
    }
    await fetchSlots();
    closeSlotModal();
  };

  const openAddSlotModal = (halfId: string, day: number) => {
    setSelectedHalfId(halfId);
    setSelectedDay(day);
    setEditingSlotId(null);
    setNewSlot({ team_id: '', start_time: '18:00', end_time: '19:30', space_used: 1, rain_terrain_id: '', rain_start_time: '', rain_end_time: '', rain_note: '' });
    setRainTimeError(null);
    setShowSlotModal(true);
  };

  const openEditSlotModal = (slot: TerrainSlot) => {
    setSelectedHalfId(slot.terrain_half_id);
    setSelectedDay(slot.day);
    setEditingSlotId(slot.id);
    setNewSlot({
      team_id: slot.team_id,
      start_time: slot.start_time.slice(0, 5),
      end_time: slot.end_time.slice(0, 5),
      space_used: slot.space_used,
      rain_terrain_id: slot.rain_terrain_id || '',
      rain_start_time: slot.rain_start_time?.slice(0, 5) || '',
      rain_end_time: slot.rain_end_time?.slice(0, 5) || '',
      rain_note: slot.rain_note || ''
    });
    setRainTimeError(null);
    setShowSlotModal(true);
  };

  const getTerrainHalves = () => {
    if (!selectedTerrain) return [];
    return halves.filter(h => h.terrain_id === selectedTerrain);
  };

  const getSlotsForHalfAndDay = (halfId: string, day: number) => {
    const collator = new Intl.Collator('fr', { sensitivity: 'base' });
    return slots
      .filter(s => s.terrain_half_id === halfId && s.day === day)
      .sort((a, b) => {
        const sa = (a.start_time ?? '').slice(0, 5);
        const sb = (b.start_time ?? '').slice(0, 5);
        if (sa !== sb) return sa < sb ? -1 : 1;
        const ea = (a.end_time ?? '').slice(0, 5);
        const eb = (b.end_time ?? '').slice(0, 5);
        if (ea !== eb) return ea < eb ? -1 : 1;
        const na = teams.find(t => t.id === a.team_id)?.name ?? '';
        const nb = teams.find(t => t.id === b.team_id)?.name ?? '';
        return collator.compare(na, nb);
      });
  };

  const getRainFallbackSlots = (day: number) => {
    if (!selectedTerrain) return [];
    const currentHalfIds = new Set(currentHalves.map(h => h.id));
    return slots.filter(s =>
      s.rain_terrain_id === selectedTerrain &&
      s.day === day &&
      !currentHalfIds.has(s.terrain_half_id)
    );
  };

  const getSlotOriginTerrainName = (slot: TerrainSlot) => {
    const half = halves.find(h => h.id === slot.terrain_half_id);
    if (!half) return '';
    return terrains.find(t => t.id === half.terrain_id)?.name || '';
  };

  const handleRainSlotClick = (slot: TerrainSlot) => {
    const half = halves.find(h => h.id === slot.terrain_half_id);
    if (half) setSelectedTerrain(half.terrain_id);
    openEditSlotModal(slot);
  };

  const isRestricted = (halfId: string, day: number) => {
    return restrictions.some(r => r.terrain_half_id === halfId && r.day === day);
  };

  const getRestrictionReason = (halfId: string, day: number) => {
    const restriction = restrictions.find(r => r.terrain_half_id === halfId && r.day === day);
    return restriction?.reason || 'Indisponible';
  };

  const detectConflicts = () => {
    const conflicts: string[] = [];
    const currentHalves = getTerrainHalves();

    currentHalves.forEach(half => {
      DAYS.forEach((dayName, dayIndex) => {
        const day = dayIndex + 1;
        const daySlots = getSlotsForHalfAndDay(half.id, day);

        if (daySlots.length < 2) return;

        // Check each pair of slots for TIME OVERLAP and SPACE CAPACITY
        for (let i = 0; i < daySlots.length; i++) {
          for (let j = i + 1; j < daySlots.length; j++) {
            const slotA = daySlots[i];
            const slotB = daySlots[j];

            // Convert times to minutes for comparison
            const toMinutes = (time: string) => {
              const [h, m] = time.split(':').map(Number);
              return h * 60 + m;
            };

            const startA = toMinutes(slotA.start_time);
            const endA = toMinutes(slotA.end_time);
            const startB = toMinutes(slotB.start_time);
            const endB = toMinutes(slotB.end_time);

            // Strict overlap - equal times (endA === startB) is NOT an overlap
            const overlaps = startA < endB && startB < endA;

            if (!overlaps) continue;

            // Calculate space used during overlap
            const spaceA = slotA.space_used === 1 ? 1 : 2;
            const spaceB = slotB.space_used === 1 ? 1 : 2;
            const totalSpace = spaceA + spaceB;

            // Max capacity of a half = 2 quarters
            // Only conflict if total > 2 quarters
            if (totalSpace > 2) {
              const overlapStart = Math.max(startA, startB);
              const overlapEnd = Math.min(endA, endB);
              const formatTime = (minutes: number) => {
                const h = Math.floor(minutes / 60);
                const m = minutes % 60;
                return `${h}:${String(m).padStart(2, '0')}`;
              };

              conflicts.push(
                `Conflit: ${slotA.team?.name || 'Équipe'} (${spaceA}Q) et ${slotB.team?.name || 'Équipe'} (${spaceB}Q) dépassent la capacité sur ${half.name} le ${dayName} de ${formatTime(overlapStart)} à ${formatTime(overlapEnd)} (${totalSpace}/2 quarts utilisés)`
              );
            }
            // 2 quarters = OK, no conflict
            // Only 3 or 4 quarters = conflict
          }
        }

        if (isRestricted(half.id, day) && daySlots.length > 0) {
          conflicts.push(
            `Restriction: ${half.name} est interdit le ${dayName} mais ${daySlots.length} créneaux sont assignés`
          );
        }
      });
    });

    return conflicts;
  };

  const getTeamsWithoutSlots = () => {
    const teamsWithSlots = new Set(slots.map(s => s.team_id));
    return teams.filter(t => !teamsWithSlots.has(t.id));
  };

  const timesOverlap = (start1: string, end1: string, start2: string, end2: string) => {
    return start1 < end2 && start2 < end1;
  };

  const getSlotStyle = (slot: any) => {
    if (!slot) return {};

    switch(slot.team?.type) {
      case 'junior':
        return {
          background: 'var(--accent)',
          borderLeft: '3px solid var(--accent-hover)',
          color: 'var(--text-inverse)'
        };
      case 'active':
        return {
          background: 'var(--danger)',
          borderLeft: '3px solid var(--danger-text)',
          color: 'var(--text-inverse)'
        };
      default:
        return {
          background: 'var(--text-muted)',
          borderLeft: '3px solid var(--text-secondary)',
          color: 'var(--text-inverse)'
        };
    }
  };

  const abbreviateTeamName = (name: string) => {
    const parts = name.split(' ');
    if (parts.length > 2) {
      return parts.slice(-2).join(' ');
    }
    return name;
  };

  const currentTerrain = terrains.find(t => t.id === selectedTerrain);
  const currentHalves = getTerrainHalves();
  const conflicts = detectConflicts();
  const slotModalHalf = halves.find(h => h.id === selectedHalfId);
  const slotModalIsSalle = terrains.find(t => t.id === slotModalHalf?.terrain_id)?.kind === 'salle';

  const gridTimeSlots = useMemo(() => {
    if (!selectedTerrain) return [] as string[];
    const halfIds = new Set(halves.filter(h => h.terrain_id === selectedTerrain).map(h => h.id));
    const terrainSlots = slots.filter(s => halfIds.has(s.terrain_half_id));
    return computeGridTimeRange(
      terrainSlots.map(s => s.start_time.slice(0, 5)),
      terrainSlots.map(s => s.end_time.slice(0, 5))
    );
  }, [selectedTerrain, halves, slots]);

  if (loading) {
    return <div className="p-8" style={{ color: 'var(--text-primary)' }}>Chargement...</div>;
  }

  return (
    <div className="p-4 lg:p-8 w-full">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
            <Map className="w-5 h-5" />
            Terrains
          </h1>
          <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>Gestion des terrains</p>
        </div>
        <Button
          onClick={() => setShowAddTerrainModal(true)}
          leftIcon={<Plus size={20} />}
        >
          Nouveau Terrain
        </Button>
      </div>

      {terrains.length === 0 && (
        <div className="rounded-lg p-12 text-center" style={{ background: 'var(--bg-card)' }}>
          <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>Aucun terrain configuré</p>
          <Button
            onClick={() => setShowAddTerrainModal(true)}
          >
            Ajouter un terrain
          </Button>
        </div>
      )}

      {terrains.length > 0 && (
        <>
          <Tabs
            value={selectedTerrain ?? ''}
            onChange={(id) => setSelectedTerrain(id)}
            items={terrains.map(t => ({ key: t.id, label: t.name + (t.kind === 'salle' ? ' (Salle)' : t.kind === 'dur' ? ' (Dur)' : '') }))}
            className="mb-6"
          />

          {currentTerrain && (
            <div className="mb-6">
              <div className="rounded-lg p-4" style={{ background: 'var(--bg-card)' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <MapPin size={16} />
                    {currentTerrain.location || 'Aucune adresse'}
                    <span className="mx-2">•</span>
                    <span>{currentTerrain.kind === 'salle' ? 'Salle entière' : `Capacité totale: ${currentTerrain.total_space} quarts`}</span>
                    {currentTerrain.kind && currentTerrain.kind !== 'exterieur' && (
                      <>
                        <span className="mx-2">•</span>
                        <span style={{ background: currentTerrain.kind === 'salle' ? 'color-mix(in srgb, var(--primary) 14%, var(--bg-card))' : 'color-mix(in srgb, var(--warning) 14%, var(--bg-card))', color: currentTerrain.kind === 'salle' ? 'var(--primary)' : 'var(--warning-text)', fontSize: '11px', fontWeight: 600, padding: '1px 8px', borderRadius: '6px' }}>
                          {currentTerrain.kind === 'salle' ? 'Salle' : 'Terrain dur'}
                        </span>
                      </>
                    )}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleEditTerrain(currentTerrain)}
                    leftIcon={<Edit2 size={14} />}
                  >
                    Modifier
                  </Button>
                </div>

                {currentTerrain.latitude && currentTerrain.longitude && (
                  <TerrainMap
                    latitude={parseFloat(String(currentTerrain.latitude))}
                    longitude={parseFloat(String(currentTerrain.longitude))}
                    name={currentTerrain.name}
                    address={currentTerrain.location || undefined}
                  />
                )}
              </div>
            </div>
          )}

          <div className="rounded-lg overflow-x-auto" style={{ background: 'var(--bg-card)' }}>
            <table style={{ width: '100%', minWidth: '800px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-table-header)' }}>
                  <th style={{
                    padding: '12px 16px',
                    color: 'var(--text-table-header)',
                    fontSize: '12px',
                    textTransform: 'uppercase',
                    fontWeight: '600',
                    textAlign: 'left',
                    minWidth: '120px'
                  }}>
                    {currentTerrain?.kind === 'salle' ? 'Jour' : 'Jour / Demi-Terrain'}
                  </th>
                  {currentHalves.map(half => (
                    <th key={half.id} style={{
                      padding: '12px 16px',
                      color: 'var(--text-table-header)',
                      fontSize: '14px',
                      fontWeight: '600',
                      textAlign: 'center',
                      minWidth: '200px'
                    }}>
                      {currentTerrain?.kind === 'salle' ? 'Salle entière' : `${currentTerrain?.name} - ${half.name}`}
                      {currentTerrain?.kind !== 'salle' && (
                        <div style={{ color: 'var(--text-inverse)', opacity: 0.7, fontSize: '11px', fontWeight: '400', marginTop: '4px' }}>
                          {half.label}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((day, dayIndex) => (
                  <tr key={day} style={{ borderTop: '1px solid var(--border-color)' }}>
                    <td style={{
                      padding: '16px',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      fontWeight: '600',
                      verticalAlign: 'top'
                    }}>
                      {day}
                    </td>
                    {currentHalves.map(half => {
                      const dayNum = dayIndex + 1;
                      const restricted = isRestricted(half.id, dayNum);
                      const daySlots = getSlotsForHalfAndDay(half.id, dayNum);

                      return (
                        <td key={half.id} style={{
                          padding: '12px',
                          verticalAlign: 'top',
                          background: restricted ? 'var(--bg-hover)' : 'transparent'
                        }}>
                          {restricted ? (
                            <Alert variant="warning">
                              {getRestrictionReason(half.id, dayNum)}
                            </Alert>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {daySlots.map(slot => (
                                <div
                                  key={slot.id}
                                  onClick={() => openEditSlotModal(slot)}
                                  style={{
                                    minHeight: '56px',
                                    padding: '8px 10px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'center',
                                    gap: '3px',
                                    ...getSlotStyle(slot),
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    transition: 'transform 0.2s'
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'scale(1.02)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'scale(1)';
                                  }}
                                >
                                  <div style={{
                                    fontSize: '11px',
                                    fontWeight: '700',
                                    color: 'var(--text-inverse)',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    lineHeight: '1.3'
                                  }}>
                                    {slot.team?.name}
                                  </div>
                                  {slot.team?.category?.name && (
                                    <div style={{
                                      fontSize: '10px',
                                      color: 'var(--text-inverse)',
                                      opacity: 0.85,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      lineHeight: '1.2'
                                    }}>
                                      {slot.team.category.name}
                                    </div>
                                  )}
                                  <div style={{
                                    fontSize: '11px',
                                    color: 'var(--text-inverse)',
                                    opacity: 0.95,
                                    marginTop: '2px',
                                    lineHeight: '1.2'
                                  }}>
                                    {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                                  </div>
                                  {currentTerrain?.kind !== 'salle' && (
                                    <div style={{
                                      fontSize: '10px',
                                      color: 'var(--text-inverse)',
                                      opacity: 0.85,
                                      marginTop: '2px',
                                      lineHeight: '1.2'
                                    }}>
                                      {slot.space_used} quart{slot.space_used > 1 ? 's' : ''}
                                    </div>
                                  )}
                                  {rainModeEnabled && slot.rain_terrain_id && (
                                    <div style={{
                                      fontSize: '10px',
                                      color: 'var(--info-text)',
                                      background: 'var(--info-soft)',
                                      borderRadius: '3px',
                                      padding: '2px 4px',
                                      marginTop: '3px',
                                      lineHeight: '1.3'
                                    }}>
                                      <CloudRain size={10} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '3px' }} />
                                      Pluie : {terrains.find(t => t.id === slot.rain_terrain_id)?.name ?? '?'}
                                      {(slot.rain_start_time || slot.rain_end_time) && (
                                        <> {(slot.rain_start_time || slot.start_time).slice(0, 5)}&ndash;{(slot.rain_end_time || slot.end_time).slice(0, 5)}</>
                                      )}
                                      {slot.rain_note && <em style={{ display: 'block' }}>{slot.rain_note}</em>}
                                    </div>
                                  )}
                                </div>
                              ))}
                              {getRainFallbackSlots(dayNum).map(slot => {
                                const rainStart = (slot.rain_start_time || slot.start_time).slice(0, 5);
                                const rainEnd = (slot.rain_end_time || slot.end_time).slice(0, 5);
                                const originTerrain = getSlotOriginTerrainName(slot);
                                return (
                                  <div
                                    key={`rain-${slot.id}`}
                                    onClick={() => handleRainSlotClick(slot)}
                                    style={{
                                      minHeight: '48px',
                                      padding: '8px 10px',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      justifyContent: 'center',
                                      gap: '3px',
                                      border: '1.5px dashed var(--info)',
                                      borderRadius: '8px',
                                      cursor: 'pointer',
                                      background: 'var(--info-soft)',
                                      transition: 'transform 0.2s, border-color 0.2s',
                                      opacity: 0.85
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.transform = 'scale(1.02)';
                                      e.currentTarget.style.borderColor = 'var(--info-text)';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.transform = 'scale(1)';
                                      e.currentTarget.style.borderColor = 'var(--info)';
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                      <span style={{
                                        fontSize: '11px',
                                        fontWeight: '700',
                                        color: 'var(--text-secondary)',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        lineHeight: '1.3'
                                      }}>
                                        {slot.team?.name || 'Équipe'} &middot; {rainStart}&ndash;{rainEnd}
                                      </span>
                                      <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '3px',
                                        fontSize: '9px',
                                        fontWeight: 700,
                                        color: 'var(--info-text)',
                                        background: 'color-mix(in srgb, var(--info) 18%, var(--bg-card))',
                                        borderRadius: '4px',
                                        padding: '1px 5px',
                                        lineHeight: '1.4',
                                        flexShrink: 0
                                      }}>
                                        <CloudRain size={10} /> Pluie
                                      </span>
                                    </div>
                                    {originTerrain && (
                                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: '1.2' }}>
                                        depuis {originTerrain}
                                      </div>
                                    )}
                                    {slot.rain_note && (
                                      <em style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: '1.3', display: 'block' }}>
                                        {slot.rain_note}
                                      </em>
                                    )}
                                  </div>
                                );
                              })}
                              {daySlots.length === 0 && getRainFallbackSlots(dayNum).length === 0 && (
                                <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>&mdash;</span>
                              )}
                              {!accessLoading && canEdit && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => openAddSlotModal(half.id, dayNum)}
                                >
                                  + Ajouter créneau
                                </Button>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {conflicts.length > 0 && (
            <div className="mt-6">
              <Alert variant="danger" title="Conflits détectés">
                <ul className="space-y-1" style={{ margin: 0, paddingLeft: '18px' }}>
                  {conflicts.map((conflict, idx) => (
                    <li key={idx}>{conflict}</li>
                  ))}
                </ul>
              </Alert>
            </div>
          )}

          {getTeamsWithoutSlots().length > 0 && (
            <div style={{
              background: 'var(--warning-soft)',
              border: '1px solid var(--warning)',
              borderRadius: '10px',
              padding: '16px 20px',
              marginTop: '16px'
            }}>
              <div style={{
                display: 'flex', alignItems: 'center',
                gap: '8px', marginBottom: '12px'
              }}>
                <AlertTriangle className="w-4 h-4" style={{ color: 'var(--warning)' }} />
                <h3 style={{
                  color: 'var(--warning-text)', margin: 0,
                  fontSize: '15px', fontWeight: '700'
                }}>
                  {getTeamsWithoutSlots().length} équipe(s) sans créneau d'entraînement
                </h3>
              </div>

              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: '8px'
              }}>
                {getTeamsWithoutSlots().map(team => (
                  <div key={team.id} style={{
                    background: 'var(--warning-soft)',
                    border: '1px solid var(--warning)',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '13px',
                    color: 'var(--warning-text)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px'
                  }}>
                    <span style={{ fontWeight: '600' }}>
                      {team.name}
                    </span>
                    {team.category?.name && (
                      <span style={{
                        fontSize: '11px',
                        color: 'var(--warning-text)',
                        opacity: 0.7
                      }}>
                        {team.category.name}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {getTeamsWithoutSlots().length === 0 && teams.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center',
              gap: '8px', color: 'var(--success)',
              fontSize: '14px', marginTop: '12px',
              fontWeight: '600'
            }}>
              <span>✓</span>
              <span>Toutes les équipes ont des créneaux d'entraînement assignés</span>
            </div>
          )}
        </>
      )}

      {showAddTerrainModal && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}
          onClick={() => { if (deleteStep === 0) handleCloseModal(); }}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              borderRadius: '12px',
              maxWidth: '500px',
              width: '100%',
              zIndex: 10000,
              position: 'relative',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center" style={{ background: 'var(--bg-modal-header)', padding: '16px 24px', borderRadius: '12px 12px 0 0' }}>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-modal-header)', fontWeight: 700 }}>
                {editingTerrain ? 'Modifier le terrain' : 'Nouveau Terrain'}
              </h2>
              <button onClick={handleCloseModal} style={{ background: 'transparent', border: 'none', color: 'var(--text-modal-header)', cursor: 'pointer', padding: '4px' }}>
                <X size={22} />
              </button>
            </div>

            <div className="space-y-4" style={{ padding: '24px' }}>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Nom du terrain</label>
                <input
                  type="text"
                  value={newTerrain.name}
                  onChange={(e) => { setNewTerrain({ ...newTerrain, name: e.target.value }); setNameError(null); }}
                  className="w-full px-3 py-2 rounded-lg"
                  style={{ background: 'var(--bg-input)', border: `1px solid ${nameError ? 'var(--danger)' : 'var(--border-color)'}`, color: 'var(--text-primary)' }}
                  placeholder="Ex: Terrain 1"
                />
                {nameError && (
                  <p style={{ color: 'var(--danger)', fontSize: '13px', marginTop: '6px', fontWeight: 500 }}>{nameError}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Adresse</label>
                <input
                  type="text"
                  value={newTerrain.location}
                  onChange={(e) => setNewTerrain({ ...newTerrain, location: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  placeholder="Ex: Chemin du Stade 1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Type</label>
                <select
                  value={newTerrain.kind}
                  onChange={(e) => {
                    const k = e.target.value;
                    setNewTerrain(prev => ({ ...prev, kind: k, ...(k === 'salle' ? { total_space: 1 } : prev.kind === 'salle' ? { total_space: 4 } : {}) }));
                  }}
                  className="w-full px-3 py-2 rounded-lg"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                >
                  <option value="exterieur">Terrain extérieur</option>
                  <option value="dur">Terrain dur</option>
                  <option value="salle">Salle</option>
                </select>
              </div>

              {newTerrain.kind !== 'salle' && (
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Capacité totale (quarts)</label>
                  <input
                    type="number"
                    min="1"
                    value={newTerrain.total_space}
                    onChange={(e) => setNewTerrain({ ...newTerrain, total_space: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 rounded-lg"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  />
                </div>
              )}
              {newTerrain.kind === 'salle' && (
                <div style={{ color: 'var(--text-secondary)', fontSize: '13px', fontStyle: 'italic' }}>
                  Une salle est un espace unique (pas de demi-terrains ni de quarts).
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Latitude</label>
                  <input
                    type="text"
                    value={newTerrain.latitude}
                    onChange={(e) => setNewTerrain({ ...newTerrain, latitude: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    placeholder="Ex: 46.519962"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Longitude</label>
                  <input
                    type="text"
                    value={newTerrain.longitude}
                    onChange={(e) => setNewTerrain({ ...newTerrain, longitude: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    placeholder="Ex: 6.633597"
                  />
                </div>
              </div>

              {editingTerrain && (
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '8px' }}>
                  {deleteBlockedMessage && (
                    <div style={{
                      background: 'var(--danger-soft)',
                      border: '1px solid var(--danger)',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      marginBottom: '12px',
                      display: 'flex',
                      gap: '8px',
                      alignItems: 'flex-start'
                    }}>
                      <AlertTriangle size={16} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '1px' }} />
                      <span style={{ color: 'var(--danger-text)', fontSize: '13px', lineHeight: '1.4' }}>{deleteBlockedMessage}</span>
                    </div>
                  )}
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleRequestDeleteTerrain}
                    style={{ width: '100%' }}
                  >
                    Supprimer ce terrain
                  </Button>
                </div>
              )}

              <div className="flex justify-end mt-6" style={{ gap: '12px' }}>
                <Button variant="secondary" onClick={handleCloseModal}>
                  Annuler
                </Button>
                <Button variant="primary" onClick={handleAddTerrain}>
                  {editingTerrain ? 'Modifier' : 'Créer'}
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showSlotModal && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}
          onClick={closeSlotModal}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              borderRadius: '12px',
              maxWidth: '500px',
              width: '100%',
              zIndex: 10000,
              position: 'relative',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center" style={{ background: 'var(--bg-modal-header)', padding: '16px 24px', borderRadius: '12px 12px 0 0' }}>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-modal-header)', fontWeight: 700 }}>
                {editingSlotId ? 'Modifier le créneau' : 'Nouveau Créneau'}
              </h2>
              <button onClick={closeSlotModal} style={{ background: 'transparent', border: 'none', color: 'var(--text-modal-header)', cursor: 'pointer', padding: '4px' }}>
                <X size={22} />
              </button>
            </div>

            <div className="space-y-4" style={{ padding: '24px' }}>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Équipe</label>
                <select
                  value={newSlot.team_id}
                  onChange={(e) => { setSlotOverlapError(null); setNewSlot({ ...newSlot, team_id: e.target.value }); }}
                  className="w-full px-3 py-2 rounded-lg"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                >
                  <option value="">Sélectionner une équipe</option>
                  <optgroup label="-- Juniors --">
                    {teams
                      .filter(t => t.type === 'junior')
                      .map(team => (
                        <option key={team.id} value={team.id}>
                          {team.name} — {team.category?.name ?? 'Sans catégorie'}
                        </option>
                      ))
                    }
                  </optgroup>
                  <optgroup label="-- Équipes actives --">
                    {teams
                      .filter(t => t.type === 'active')
                      .map(team => (
                        <option key={team.id} value={team.id}>
                          {team.name} — {team.category?.name ?? 'Sans catégorie'}
                        </option>
                      ))
                    }
                  </optgroup>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Heure de début</label>
                <select
                  value={newSlot.start_time}
                  onChange={(e) => { setSlotOverlapError(null); handleStartTimeChange(e.target.value); }}
                  className="w-full px-3 py-2 rounded-lg"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                >
                  {ALL_TIME_OPTIONS.map(time => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Heure de fin</label>
                <select
                  value={newSlot.end_time}
                  onChange={(e) => { setSlotOverlapError(null); setNewSlot({ ...newSlot, end_time: e.target.value }); }}
                  className="w-full px-3 py-2 rounded-lg"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                >
                  {ALL_TIME_OPTIONS.map(time => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>
              </div>

              {!slotModalIsSalle && (
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Espace utilisé (quarts)</label>
                  <input
                    type="number"
                    min="1"
                    value={newSlot.space_used}
                    onChange={(e) => setNewSlot({ ...newSlot, space_used: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 rounded-lg"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  />
                </div>
              )}

              {rainModeEnabled && (
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '8px' }}>
                  <label style={{ color: 'var(--info-text)', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}><CloudRain size={16} /> Plan pluie</label>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Lieu de repli</label>
                      <select
                        value={newSlot.rain_terrain_id}
                        onChange={(e) => setNewSlot({ ...newSlot, rain_terrain_id: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg"
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      >
                        <option value="">-- Aucun --</option>
                        {terrains.filter(t => t.kind === 'salle').length > 0 && (
                          <optgroup label="Salles">
                            {terrains.filter(t => t.kind === 'salle').map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="Terrains">
                          {terrains.filter(t => t.kind !== 'salle').map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Heure de début</label>
                        <select
                          value={newSlot.rain_start_time}
                          onChange={(e) => { setRainTimeError(null); setNewSlot({ ...newSlot, rain_start_time: e.target.value }); }}
                          className="w-full px-3 py-2 rounded-lg"
                          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        >
                          <option value="">Idem</option>
                          {ALL_TIME_OPTIONS.map(time => (
                            <option key={time} value={time}>{time}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Heure de fin</label>
                        <select
                          value={newSlot.rain_end_time}
                          onChange={(e) => { setRainTimeError(null); setNewSlot({ ...newSlot, rain_end_time: e.target.value }); }}
                          className="w-full px-3 py-2 rounded-lg"
                          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        >
                          <option value="">Idem</option>
                          {ALL_TIME_OPTIONS.map(time => (
                            <option key={time} value={time}>{time}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {rainTimeError && (
                      <Alert variant="danger" title="Erreur">{rainTimeError}</Alert>
                    )}

                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Remarque</label>
                      <input
                        type="text"
                        value={newSlot.rain_note}
                        onChange={(e) => setNewSlot({ ...newSlot, rain_note: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg"
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        placeholder="Ex : 1x sur 2, voir avec la D1"
                      />
                    </div>
                  </div>
                </div>
              )}

              {editingSlotId && !accessLoading && canEdit && (
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '8px' }}>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDeleteSlot(editingSlotId)}
                    style={{ width: '100%' }}
                  >
                    Supprimer ce créneau
                  </Button>
                </div>
              )}

              {slotOverlapError && (
                <Alert variant="danger" title="Erreur">
                  {slotOverlapError}
                </Alert>
              )}

              <div className="flex justify-end mt-6" style={{ gap: '12px' }}>
                <Button variant="secondary" onClick={closeSlotModal}>
                  Annuler
                </Button>
                <Button variant="primary" onClick={handleSaveSlot}>
                  {editingSlotId ? 'Enregistrer' : 'Créer'}
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {deleteStep === 1 && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 10001 }}>
          <ConfirmModal
            isOpen
            title="Supprimer le terrain"
            message={`Êtes-vous sûr de vouloir supprimer le terrain « ${editingTerrain?.name ?? ''} » ?`}
            confirmLabel="Continuer"
            cancelLabel="Annuler"
            confirmStyle="warning"
            onConfirm={() => setDeleteStep(2)}
            onCancel={() => setDeleteStep(0)}
          />
        </div>,
        document.body
      )}

      {deleteStep === 2 && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 10001 }}>
          <ConfirmModal
            isOpen
            title="Confirmation définitive"
            message={`Cette action est définitive et irréversible. Confirmez-vous la suppression du terrain « ${editingTerrain?.name ?? ''} » ?`}
            confirmLabel="Supprimer définitivement"
            cancelLabel="Annuler"
            confirmStyle="danger"
            loading={deleting}
            loadingLabel="Suppression..."
            onConfirm={handleConfirmDeleteTerrain}
            onCancel={() => setDeleteStep(0)}
          />
        </div>,
        document.body
      )}
      <Toast toast={toast} />
    </div>
  );
}
