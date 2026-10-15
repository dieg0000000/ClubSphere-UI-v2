import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { computeGridTimeRange } from '../utils/timeSlots';
import { MapPin, ChevronDown, Ban } from 'lucide-react';
import TerrainMap from '../components/TerrainMap';
import { FilterButtonGroup } from '../components/FilterButtonGroup';
import { Badge } from '../components/ui/Badge';

interface TerrainHalf {
  id: string;
  terrain_id: string;
  name: string;
  label: string;
  active?: boolean;
}

interface Terrain {
  id: string;
  name: string;
  location: string | null;
  total_space: number;
  active: boolean;
  latitude: number | null;
  longitude: number | null;
  kind?: string;
  halves?: TerrainHalf[];
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
    category?: { name: string } | null;
  };
  teams?: { name: string; category_id: string | null };
}

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];



export default function Terrains() {
  const [terrains, setTerrains] = useState<Terrain[]>([]);
  const [halves, setHalves] = useState<TerrainHalf[]>([]);
  const [restrictions, setRestrictions] = useState<TerrainRestriction[]>([]);
  const [slots, setSlots] = useState<TerrainSlot[]>([]);
  const [selectedTerrains, setSelectedTerrains] = useState<string[]>([]);
  const [filterTeam, setFilterTeam] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [rainModeEnabled, setRainModeEnabled] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const debug = async () => {
      // Check 1: Auth status
      const { data: { user } } = await supabase.auth.getUser();
      console.log('User:', user?.id, user?.email);

      // Check 2: Raw fetch no filters no joins
      const { data: raw, error: rawError } = await supabase
        .from('terrains')
        .select('id, name, active');
      console.log('Raw terrains:', raw, 'Error:', rawError);

      // Check 3: Check RLS
      const { data: rls, error: rlsError } = await supabase
        .from('terrains')
        .select('count');
      console.log('Count:', rls, 'Error:', rlsError);

      // Set terrains directly from raw:
      if (raw && raw.length > 0) {
        setTerrains(raw as Terrain[]);
        console.log('SET terrains from raw:', raw.length);
      }
    };
    debug();
  }, []);

  useEffect(() => {
    if (terrains.length > 0 && selectedTerrains.length === 0) {
      const firstTwo = terrains.slice(0, 2).map(t => t.id);
      console.log('Auto-selecting terrains:', firstTwo);
      setSelectedTerrains(firstTwo);
    }
  }, [terrains]);

  const fetchData = async () => {
    await Promise.all([
      fetchTerrains(),
      fetchHalves(),
      fetchRestrictions(),
      fetchSlots(),
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
    const { data: terrains, error } = await supabase
      .from('terrains')
      .select('*')
      .eq('active', true)
      .order('name');

    if (error) {
      console.error('Error fetching terrains:', error);
      return;
    }

    const { data: halvesData, error: halvesError } = await supabase
      .from('terrain_halves')
      .select('id, terrain_id, name')
      .order('name');

    if (halvesError) {
      console.error('Error fetching halves:', halvesError);
      return;
    }

    const halves = halvesData?.map(h => {
      const t = terrains.find(tr => tr.id === h.terrain_id);
      return {
        ...h,
        label: t?.kind === 'salle' ? 'Salle entière' : `Moitié ${h.name}`
      };
    }) || [];

    const terrainsWithHalves = terrains.map(terrain => ({
      ...terrain,
      halves: halves.filter(h => h.terrain_id === terrain.id)
    }));

    setTerrains(terrainsWithHalves);
    setHalves(halves);
  };

  const fetchHalves = async () => {
    // No longer needed since we fetch halves with terrains
    // Keeping for backward compatibility
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

  const getTerrainHalves = (terrain: Terrain) => {
    if (terrain.halves && terrain.halves.length > 0) {
      const active = terrain.halves.filter(h => h.active !== false);
      if (terrain.kind === 'salle') {
        const first = active[0];
        return first ? [{ ...first, label: 'Salle entière' }] : [];
      }
      return active;
    }
    if (terrain.kind === 'salle') {
      return [
        { id: `${terrain.id}-A`, terrain_id: terrain.id, name: 'A', label: 'Salle entière', active: true },
      ];
    }
    return [
      { id: `${terrain.id}-A`, terrain_id: terrain.id, name: 'A', label: 'Moitié A', active: true },
      { id: `${terrain.id}-B`, terrain_id: terrain.id, name: 'B', label: 'Moitié B', active: true },
    ];
  };

  const getSlotsForHalfAndDay = (halfId: string, day: number) => {
    const collator = new Intl.Collator('fr', { sensitivity: 'base' });
    let daySlots = slots.filter(s => s.terrain_half_id === halfId && s.day === day);

    if (filterTeam) {
      daySlots = daySlots.filter(s =>
        s.teams?.name?.toLowerCase().includes(filterTeam.toLowerCase())
      );
    }

    return daySlots.sort((a, b) => {
      const sa = (a.start_time ?? '').substring(0, 5);
      const sb = (b.start_time ?? '').substring(0, 5);
      if (sa !== sb) return sa < sb ? -1 : 1;
      const ea = (a.end_time ?? '').substring(0, 5);
      const eb = (b.end_time ?? '').substring(0, 5);
      if (ea !== eb) return ea < eb ? -1 : 1;
      return collator.compare(a.teams?.name ?? '', b.teams?.name ?? '');
    });
  };

  const isRestricted = (halfId: string, day: number) => {
    return restrictions.some(r => r.terrain_half_id === halfId && r.day === day);
  };

  const getRestrictionReason = (halfId: string, day: number) => {
    const restriction = restrictions.find(r => r.terrain_half_id === halfId && r.day === day);
    return restriction?.reason || 'Indisponible';
  };

  const getTeamColor = (slot: TerrainSlot | undefined) => {
    if (!slot) return null;

    const teamType = (slot as any).team?.type;

    if (teamType === 'junior') {
      return {
        background: 'var(--info)',
        border: '1px solid var(--info)',
        color: 'var(--text-inverse)'
      };
    }
    if (teamType === 'active') {
      return {
        background: 'var(--danger)',
        border: '1px solid var(--danger)',
        color: 'var(--text-inverse)'
      };
    }

    return {
      background: 'var(--text-muted)',
      border: '1px solid var(--border-strong)',
      color: 'var(--text-inverse)'
    };
  };

  const abbreviateTeamName = (name: string) => {
    return name;
  };

  const normalizeTime = (t: string) => t?.substring(0, 5);

  const getSlotForTimeAndDay = (halfId: string, day: string, time: string) => {
    const dayIndex = DAYS.indexOf(day) + 1;
    const result = slots.find(s => {
      const sameHalf = s.terrain_half_id === halfId;
      const sameDay = s.day === dayIndex;
      const startTime = s.start_time?.substring(0, 5) || '';
      const endTime = s.end_time?.substring(0, 5) || '';
      const inTimeRange = startTime <= time && endTime > time;

      return sameHalf && sameDay && inTimeRange;
    });
    return result;
  };

  const visibleTerrains = terrains.filter(t => selectedTerrains.includes(t.id));
  const terrainsToShow = visibleTerrains.length > 0 ? visibleTerrains : terrains.slice(0, 2);

  const gridTimeSlots = useMemo(() => {
    const shownIds = new Set(terrainsToShow.map(t => t.id));
    const shownHalves = halves.filter(h => shownIds.has(h.terrain_id));
    const halfIds = new Set(shownHalves.map(h => h.id));
    const terrainSlots = slots.filter(s => halfIds.has(s.terrain_half_id));
    return computeGridTimeRange(
      terrainSlots.map(s => (s.start_time ?? '').substring(0, 5)),
      terrainSlots.map(s => (s.end_time ?? '').substring(0, 5))
    );
  }, [terrainsToShow, halves, slots]);

  console.log('Visible terrains count:', visibleTerrains.length);
  console.log('Terrains to show:', terrainsToShow.length);

  if (loading) {
    return <div className="p-8" style={{ color: 'var(--text-primary)' }}>Chargement...</div>;
  }

  return (
    <div className="p-4 lg:p-8 w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Planning des Terrains</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Consultez les horaires d'entraînement</p>
      </div>

      {terrains.length === 0 && (
        <div className="rounded-lg p-12 text-center" style={{ background: 'var(--bg-card)' }}>
          <p style={{ color: 'var(--text-secondary)' }}>Aucun terrain configuré</p>
        </div>
      )}

      {terrains.length > 0 && (
        <>
          <div className="mb-6 flex items-center gap-3 flex-wrap">
            <span style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Afficher
            </span>
            <FilterButtonGroup
              options={terrains.map(t => ({ id: t.id, label: t.name }))}
              selectedId={selectedTerrains}
              onChange={(id) => {
                if (selectedTerrains.includes(id)) {
                  if (selectedTerrains.length > 1) {
                    setSelectedTerrains(prev => prev.filter(x => x !== id));
                  }
                } else {
                  if (selectedTerrains.length < terrains.length) {
                    setSelectedTerrains(prev => [...prev, id]);
                  }
                }
              }}
              className="!mb-0"
            />
            <Badge variant="neutral">
              {selectedTerrains.length}/{terrains.length}
            </Badge>
          </div>

          <details style={{ marginBottom: '16px' }}>
            <summary style={{
              cursor: 'pointer',
              color: 'var(--accent-text)',
              fontSize: '13px',
              fontWeight: 500,
              padding: '10px 14px',
              userSelect: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--accent-soft)',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              transition: 'background 0.15s, border-color 0.15s',
              listStyle: 'none'
            }}>
              <MapPin size={14} style={{ flexShrink: 0 }} />
              Voir les emplacements des terrains
              <ChevronDown size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
            </summary>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '16px',
              marginTop: '16px'
            }}>
              {terrainsToShow.map(terrain => (
                <div
                  key={terrain.id}
                  style={{
                    background: 'var(--bg-card)',
                    borderRadius: '12px',
                    padding: '16px',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <h3 style={{
                    color: 'var(--text-primary)',
                    fontSize: '16px',
                    fontWeight: '600',
                    marginBottom: '8px'
                  }}>
                    <MapPin className="w-4 h-4 inline mr-1" />{terrain.name}
                  </h3>

                  {(terrain.location) && (
                    <div style={{
                      color: 'var(--text-secondary)',
                      fontSize: '14px',
                      marginBottom: '8px'
                    }}>
                      <MapPin className="w-3 h-3 inline mr-1" />{terrain.location}
                    </div>
                  )}

                  {terrain.latitude && terrain.longitude && (
                    <a
                      href={`https://maps.google.com/?q=${terrain.latitude},${terrain.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        color: 'var(--primary)',
                        fontSize: '13px',
                        fontWeight: '600',
                        textDecoration: 'none',
                        padding: '6px 12px',
                        border: '1px solid var(--danger)',
                        borderRadius: '8px',
                        marginBottom: '12px',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <MapPin className="w-3 h-3 inline mr-1" />Ouvrir dans Google Maps →
                    </a>
                  )}

                  {terrain.latitude && terrain.longitude && (
                    <TerrainMap
                      latitude={parseFloat(String(terrain.latitude))}
                      longitude={parseFloat(String(terrain.longitude))}
                      name={terrain.name}
                      address={terrain.location || undefined}
                    />
                  )}

                  {!terrain.latitude && terrain.location && (
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(
                        [terrain.location, 'Suisse'].filter(Boolean).join(', ')
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: 'var(--primary)',
                        fontSize: '13px',
                        textDecoration: 'none'
                      }}
                    >
                      <MapPin className="w-3 h-3 inline mr-1" />Voir sur Google Maps →
                    </a>
                  )}
                </div>
              ))}
            </div>
          </details>

          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              minWidth: `${200 + terrainsToShow.reduce((acc, t) => acc + (getTerrainHalves(t).length * 5 * 80), 0)}px`,
              borderCollapse: 'collapse'
            }}>
              <thead>
                <tr>
                  <th style={{
                    width: '80px', background: 'var(--bg-sidebar)',
                    position: 'sticky', left: 0, zIndex: 10,
                    padding: '10px 8px',
                    color: 'var(--text-secondary)',
                    fontSize: '12px',
                    fontWeight: '600',
                    textAlign: 'left'
                  }}>
                    Heure
                  </th>
                  {terrainsToShow.map(terrain => (
                    <th
                      key={terrain.id}
                      colSpan={getTerrainHalves(terrain).length * 5}
                      style={{
                        background: 'var(--bg-table-header)',
                        color: 'var(--text-table-header)',
                        fontWeight: '700',
                        fontSize: '14px',
                        padding: '10px',
                        textAlign: 'center',
                        borderLeft: '2px solid var(--border-color)',
                        borderBottom: '1px solid var(--border-color)'
                      }}
                    >
                      <MapPin className="w-4 h-4 inline mr-1" />{terrain.name}
                    </th>
                  ))}
                </tr>

                <tr>
                  <th style={{
                    background: 'var(--bg-sidebar)',
                    position: 'sticky', left: 0, zIndex: 10
                  }} />
                  {terrainsToShow.map(terrain =>
                    getTerrainHalves(terrain).map(half => (
                      <th
                        key={half.id}
                        colSpan={5}
                        style={{
                          background: 'var(--bg-table-header)',
                          color: 'var(--text-modal-header)',
                          fontSize: '12px',
                          fontWeight: '600',
                          padding: '8px',
                          textAlign: 'center',
                          borderLeft: '1px solid var(--border-color)',
                          borderBottom: '1px solid var(--border-color)'
                        }}
                      >
                        {half.label || half.name}
                      </th>
                    ))
                  )}
                </tr>

                <tr>
                  <th style={{
                    background: 'var(--bg-sidebar)',
                    position: 'sticky', left: 0, zIndex: 10
                  }} />
                  {terrainsToShow.map(terrain =>
                    getTerrainHalves(terrain).map(half =>
                      ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'].map((day, dayIndex) => (
                        <th
                          key={`${half.id}-${day}`}
                          style={{
                            background: 'var(--bg-sidebar)',
                            color: 'var(--text-secondary)',
                            fontSize: '11px',
                            padding: '6px 4px',
                            textAlign: 'center',
                            width: '100px',
                            minWidth: '100px',
                            borderLeft: dayIndex === 0
                              ? '1px solid var(--border-color)' : 'none',
                            borderBottom: '1px solid var(--border-color)'
                          }}
                        >
                          {day.substring(0, 2)}
                        </th>
                      ))
                    )
                  )}
                </tr>
              </thead>

              <tbody>
                {gridTimeSlots.map(time => (
                  <tr key={time} style={{ height: '56px' }}>
                    <td style={{
                      width: '70px',
                      minWidth: '70px',
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      fontWeight: '600',
                      padding: '4px 8px',
                      verticalAlign: 'middle',
                      background: 'var(--bg-sidebar)',
                      position: 'sticky',
                      left: 0,
                      zIndex: 5,
                      borderRight: '1px solid var(--border-color)',
                      borderBottom: '1px solid var(--border-color)',
                      whiteSpace: 'nowrap'
                    }}>
                      {time}
                    </td>

                    {terrainsToShow.map(terrain =>
                      getTerrainHalves(terrain).map(half =>
                        ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi']
                          .map((day, dayIndex) => {
                            const dayNum = DAYS.indexOf(day) + 1;
                            const slot = slots.find(s =>
                              s.terrain_half_id === half.id &&
                              s.day === dayNum &&
                              s.start_time?.substring(0, 5) <= time &&
                              s.end_time?.substring(0, 5) > time
                            );
                            const isRestrictedDay = isRestricted(half.id, dayNum);

                            return (
                              <td
                                key={`${half.id}-${day}-${time}`}
                                style={{
                                  padding: '2px',
                                  height: '56px',
                                  minHeight: '56px',
                                  width: '100px',
                                  minWidth: '100px',
                                  background: isRestrictedDay && !slot
                                    ? 'var(--danger-soft)'
                                    : 'transparent',
                                  border: '1px solid var(--border-color)',
                                  cursor: isRestrictedDay ? 'not-allowed' : 'default',
                                  verticalAlign: 'top',
                                  overflow: 'hidden'
                                }}
                                title={slot
                                  ? `${slot.team?.name || 'Équipe'} (${slot.start_time?.substring(0, 5)}-${slot.end_time?.substring(0, 5)})`
                                  : isRestrictedDay
                                  ? 'Jour restreint'
                                  : ''
                                }
                              >
                                {slot && (
                                  <div style={{
                                    height: '100%',
                                    padding: '4px 6px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'center',
                                    gap: '2px',
                                    background: slot.team?.type === 'junior'
                                      ? 'var(--info)'
                                      : 'var(--danger)',
                                    borderLeft: slot.team?.type === 'junior'
                                      ? '3px solid var(--info)'
                                      : '3px solid var(--danger)',
                                    borderRadius: '3px',
                                    overflow: 'hidden'
                                  }}>
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
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        lineHeight: '1.2'
                                      }}>
                                        {slot.team.category.name}
                                      </div>
                                    )}
                                    {rainModeEnabled && slot.rain_terrain_id && (
                                      <div style={{
                                        fontSize: '9px',
                                        color: 'var(--info-text)',
                                        background: 'var(--info-soft)',
                                        borderRadius: '2px',
                                        padding: '1px 3px',
                                        marginTop: '2px',
                                        lineHeight: '1.3'
                                      }}>
                                        Pluie : {terrains.find(t => t.id === slot.rain_terrain_id)?.name ?? '?'}
                                        {(slot.rain_start_time || slot.rain_end_time) && (
                                          <> {(slot.rain_start_time || slot.start_time).substring(0, 5)}&ndash;{(slot.rain_end_time || slot.end_time).substring(0, 5)}</>
                                        )}
                                        {slot.rain_note && <em style={{ display: 'block' }}>{slot.rain_note}</em>}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {isRestrictedDay && !slot && (
                                  <div style={{
                                    height: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}>
                                    <span style={{
                                      color: 'var(--danger)',
                                      fontSize: '14px'
                                    }}><Ban className="w-3.5 h-3.5" /></span>
                                  </div>
                                )}
                              </td>
                            );
                          })
                      )
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{
            display: 'flex', gap: '10px',
            marginTop: '12px', flexWrap: 'wrap',
            alignItems: 'center',
            padding: '12px 16px',
            background: 'var(--bg-card)',
            borderRadius: '8px',
            border: '1px solid var(--border-color)'
          }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500, marginRight: '4px' }}>Légende :</span>
            <Badge variant="blue" icon={
              <span style={{ width: 10, height: 10, borderRadius: '3px', background: 'var(--info)', display: 'inline-block' }} />
            }>Juniors</Badge>
            <Badge variant="red" icon={
              <span style={{ width: 10, height: 10, borderRadius: '3px', background: 'var(--danger)', display: 'inline-block' }} />
            }>Actifs</Badge>
            <Badge variant="neutral" icon={
              <span style={{ width: 10, height: 10, borderRadius: '3px', background: 'var(--danger-soft)', border: '1px solid var(--danger)', display: 'inline-block' }} />
            }>Jour restreint</Badge>
          </div>
        </>
      )}
    </div>
  );
}
