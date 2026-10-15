import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { STAFF_ROLE_LABELS } from '../types';
import { Users, Calendar, MapPin, ChevronRight, ClipboardList, GraduationCap, Swords, Clock, FileText } from 'lucide-react';
import { reportLoadError } from '../utils/reportLoadError';
import { LoadError } from '../components/LoadError';

interface Team {
  id: string;
  name: string;
  type: string;
  season: string;
  training_days: string | null;
  training_time: string | null;
  training_location: string | null;
  category: {
    name: string;
  } | null;
  my_role: string;
  player_count: number;
}

interface BundleMatch {
  id: string;
  team_id: string;
  match_date: string;
  match_time: string | null;
  opponent_name: string;
  is_home: boolean;
  status: string;
  designation: string | null;
  cancellation_reason: string | null;
  match_number: string | null;
  venue_name: string | null;
  venue_city: string | null;
  venue_field_name: string | null;
  venue_address: string | null;
}

interface BundleConvocation {
  id: string;
  match_id: string;
  team_id: string;
  status: string;
  published_at: string | null;
}

interface BundleConvocationPlayer {
  id: string;
  convocation_id: string;
  member_id: string;
  origin_team_id: string | null;
  status: string;
  decline_reason: string | null;
  role: string | null;
  position_id: string | null;
  sort_order: number | null;
}

export default function CoachTeams() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<Team[]>([]);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [matches, setMatches] = useState<BundleMatch[]>([]);
  const [convocations, setConvocations] = useState<BundleConvocation[]>([]);
  const [convocationPlayers, setConvocationPlayers] = useState<BundleConvocationPlayer[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    fetchCoachTeams();
  }, [user]);

  const fetchCoachTeams = async () => {
    if (!user) return;

    try {
      setLoadFailed(false);
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const { data: coachData, error: coachError } = await supabase
        .from('coaches')
        .select('id')
        .eq('user_id', authUser?.id ?? '')
        .maybeSingle();

      if (coachError) throw coachError;
      if (!coachData) return;

      setCoachId(coachData.id);

      const { data: staffRows, error: staffError } = await supabase
        .from('team_staff')
        .select(`
          role,
          sort_order,
          teams(
            id, name, type, season,
            training_days, training_time, training_location,
            category:team_categories!category_id(name)
          )
        `)
        .eq('coach_id', coachData.id)
        .order('sort_order')
        .order('teams(name)');

      if (staffError) throw staffError;

      const teamsWithCounts = await Promise.all(
        (staffRows || []).filter((r: any) => r.teams).map(async (row: any) => {
          const t = row.teams;
          const [primaryRes, secondaryRes] = await Promise.all([
            supabase.from('members').select('*', { count: 'exact', head: true }).eq('team_id', t.id),
            supabase.from('team_members').select('*', { count: 'exact', head: true }).eq('team_id', t.id),
          ]);

          return {
            ...t,
            category: Array.isArray(t.category) ? t.category[0] : t.category,
            my_role: row.role,
            player_count: (primaryRes.count || 0) + (secondaryRes.count || 0)
          };
        })
      );

      setTeams(teamsWithCounts);

      const todayStr = new Date().toISOString().split('T')[0];
      const in8wStr = new Date(Date.now() + 56 * 24 * 3600 * 1000).toISOString().split('T')[0];
      const { data: bundle } = await supabase.rpc('get_my_teams_bundle', {
        p_start: todayStr,
        p_end: in8wStr,
      });
      if (bundle) {
        setMatches((bundle.matches || []) as BundleMatch[]);
        setConvocations((bundle.convocations || []) as BundleConvocation[]);
        setConvocationPlayers((bundle.convocation_players || []) as BundleConvocationPlayer[]);
      }
    } catch (error) {
      reportLoadError('CoachTeams', error);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const formatMatchDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('fr-CH', { weekday: 'short', day: 'numeric', month: 'long' });
  };

  const formatTime = (timeStr: string) => timeStr.substring(0, 5);

  const getConvocationLabel = (matchId: string) => {
    const conv = convocations.find(c => c.match_id === matchId);
    if (!conv) return 'Convocation non publiée';
    if (conv.status === 'draft') return 'Convocation en préparation';
    if (conv.status === 'published') {
      const count = convocationPlayers.filter(cp => cp.convocation_id === conv.id).length;
      return `Convocation publiée · ${count} convoqué${count !== 1 ? 's' : ''}`;
    }
    return 'Convocation non publiée';
  };

  const sortedMatches = [...matches].sort((a, b) => {
    const da = a.match_date + (a.match_time || '23:59');
    const db = b.match_date + (b.match_time || '23:59');
    return da.localeCompare(db);
  });

  const teamNameById = new Map(teams.map(t => [t.id, t.name]));



  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div style={{ color: 'var(--text-muted)' }}>Chargement...</div>
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="ct-page">
        <LoadError onRetry={fetchCoachTeams} />
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>Mes Équipes</h1>
        <div className="rounded-lg p-8 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <Users size={48} style={{ color: 'var(--text-muted)' }} className="mx-auto mb-4" />
          <p style={{ color: 'var(--text-secondary)' }}>Aucune équipe assignée</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ct-page">
      <div className="ct-page__header">
        <h1 className="ct-page__title">Mes Équipes</h1>
        <span className="ct-page__count">
          {teams.length} {teams.length === 1 ? 'équipe' : 'équipes'}
        </span>
      </div>

      <div className="ct-list">
        {teams.map((team) => {
          const role = STAFF_ROLE_LABELS[team.my_role] || team.my_role;

          return (
            <div key={team.id} className="ct-card">
              <div className="ct-card__top">
                <h3 className="ct-card__name">{team.name}</h3>
                {team.category && (
                  <span className="ct-card__category">{team.category.name}</span>
                )}
              </div>

              <div className="ct-card__role">
                <GraduationCap className="w-4 h-4 inline mr-1" />{role}
              </div>

              <div className="ct-card__details">
                {team.training_days && team.training_time && (
                  <div className="ct-card__detail">
                    <Calendar size={16} />
                    <span>{team.training_days} • {team.training_time}</span>
                  </div>
                )}
                {team.training_location && (
                  <div className="ct-card__detail">
                    <MapPin size={16} />
                    <span>{team.training_location}</span>
                  </div>
                )}
                <div className="ct-card__detail">
                  <Users size={16} />
                  <span>{team.player_count} {team.player_count === 1 ? 'joueur' : 'joueurs'}</span>
                </div>
              </div>

              <div className="ct-card__actions">
                <button
                  onClick={() => navigate(`/mes-equipes/${team.id}/joueurs`)}
                  className="ct-card__btn ct-card__btn--secondary"
                >
                  <Users size={16} />
                  Joueurs
                  <ChevronRight size={16} />
                </button>
                <button
                  onClick={() => navigate(`/mes-equipes/presences/${team.id}`)}
                  className="ct-card__btn ct-card__btn--accent"
                >
                  <ClipboardList size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Présences
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Matches section */}
      <div style={{ marginTop: '32px' }}>
        <div className="ct-page__header">
          <h2 className="ct-page__title" style={{ fontSize: '1.25rem' }}>Prochains matchs</h2>
          <span className="ct-page__count">
            {sortedMatches.length} {sortedMatches.length === 1 ? 'match' : 'matchs'}
          </span>
        </div>

        {sortedMatches.length === 0 ? (
          <div className="rounded-lg p-8 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <Swords size={36} style={{ color: 'var(--text-muted)' }} className="mx-auto mb-3" />
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Aucun match à venir</p>
          </div>
        ) : (
          <div className="ct-list">
            {sortedMatches.map(match => {
              const cancelled = match.status === 'annulé' || match.status === 'cancelled';
              const convLabel = getConvocationLabel(match.id);
              const teamName = teamNameById.get(match.team_id) || '';

              return (
                <div
                  key={match.id}
                  className="ct-card"
                  style={{
                    cursor: 'pointer',
                    opacity: cancelled ? 0.6 : 1,
                    textDecoration: cancelled ? 'line-through' : 'none',
                  }}
                  onClick={() => navigate(`/matchs/${match.id}`)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: 'var(--text-muted)',
                      textDecoration: 'none',
                    }}>
                      {teamName}
                    </span>
                    <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', textDecoration: cancelled ? 'line-through' : 'none' }}>
                    <span style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: '700' }}>
                      {formatMatchDate(match.match_date)}
                    </span>
                    {match.match_time ? (
                      <span style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Clock size={13} />{formatTime(match.match_time)}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>heure non fixée</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', textDecoration: cancelled ? 'line-through' : 'none' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 10px',
                      borderRadius: '99px',
                      fontSize: '12px',
                      fontWeight: '600',
                      background: match.is_home ? 'var(--success-soft)' : 'var(--bg-hover)',
                      color: match.is_home ? 'var(--success-text)' : 'var(--text-muted)',
                      textDecoration: 'none',
                    }}>
                      {match.is_home ? 'Domicile' : 'Extérieur'}
                    </span>
                    <span style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: '600' }}>
                      vs {match.opponent_name}
                    </span>
                  </div>

                  {match.venue_name && (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px', textDecoration: cancelled ? 'line-through' : 'none' }}>
                      <MapPin size={13} />
                      {match.venue_name}{match.venue_city ? `, ${match.venue_city}` : ''}
                    </div>
                  )}

                  {cancelled && match.cancellation_reason && (
                    <div style={{ color: 'var(--danger)', fontSize: '13px', fontStyle: 'italic', marginBottom: '4px', textDecoration: 'none' }}>
                      {match.cancellation_reason}
                    </div>
                  )}

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    marginTop: '8px',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: convLabel.includes('publiée ·') ? 'var(--success-text)' : 'var(--text-muted)',
                    textDecoration: 'none',
                  }}>
                    <FileText size={13} />
                    {convLabel}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
