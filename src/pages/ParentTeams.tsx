import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Users, User, Calendar, Clock, Phone, ChevronDown, Ban } from 'lucide-react';
import { STAFF_ROLE_LABELS, type TeamStaffEntry } from '../types';
import TrainingAttendanceControl from '../components/TrainingAttendanceControl';
import type { TrainingAttendanceState } from '../lib/trainingAttendance';
import { useAttendanceDefaultPresent } from '../hooks/useAttendanceDefaultPresent';
import { useTenant } from '../context/TenantContext';
import TeamPhotoCard from '../components/TeamPhotoCard';
import { ZoomablePhoto } from '../components/PhotoViewer';

interface TeamMember {
  id: string;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  contact_name: string | null;
  contact_phone: string | null;
}

interface TrainingSchedule {
  day_of_week: number;
  start_time: string;
  end_time: string;
  venue_name: string;
  venue_location: string;
}

interface UpcomingSession {
  id: string;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
  terrain_name: string | null;
  cancelled: boolean;
  cancelled_reason: string | null;
  att: TrainingAttendanceState;
}

interface StaffLine {
  name: string;
  role: string;
  phone: string;
}

interface ChildRef {
  id: string;
  name: string;
  gender: string | null;
  is_own: boolean;
}

interface TeamInfo {
  children: ChildRef[];
  team_id: string;
  team_name: string;
  category_name: string;
  staff: StaffLine[];
  training_days: string[];
  training_schedule: TrainingSchedule[];
  upcoming_sessions_by_child: Map<string, UpcomingSession[]>;
  members: TeamMember[];
}

export default function ParentTeams() {
  const { user } = useAuth();
  const { clubId } = useTenant();
  const { value: attendanceDefaultPresent } = useAttendanceDefaultPresent(clubId);
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [openTeamId, setOpenTeamId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchTeamsInfo();
  }, [user?.id, user?.email]);

  const fetchTeamsInfo = async () => {
    if (!user?.id) return;

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const in4wStr = new Date(Date.now() + 28 * 24 * 3600 * 1000).toISOString().split('T')[0];

      const { data: bundle, error: rpcErr } = await supabase.rpc('get_my_teams_bundle', {
        p_start: todayStr,
        p_end: in4wStr,
      });
      if (rpcErr || !bundle) {
        console.error('[ParentTeams] get_my_teams_bundle error', rpcErr);
        setLoading(false);
        return;
      }

      const memberTeamsMulti = new Map<string, string[]>();
      for (const mt of (bundle.member_teams || []) as any[]) {
        const arr = memberTeamsMulti.get(mt.member_id) || [];
        arr.push(mt.team_id);
        memberTeamsMulti.set(mt.member_id, arr);
      }
      const teamsById = new Map<string, any>((bundle.teams || []).map((t: any) => [t.id, t]));
      const staffByTeam = new Map<string, TeamStaffEntry[]>();
      for (const s of (bundle.staff || []) as TeamStaffEntry[]) {
        if (!staffByTeam.has(s.team_id)) staffByTeam.set(s.team_id, []);
        staffByTeam.get(s.team_id)!.push(s);
      }

      const directoryByTeam = new Map<string, TeamMember[]>();
      for (const d of (bundle.directory || []) as any[]) {
        const tid = d.team_id;
        if (!directoryByTeam.has(tid)) directoryByTeam.set(tid, []);
        directoryByTeam.get(tid)!.push({
          id: d.player_id,
          first_name: d.player_first_name,
          last_name: d.player_last_name,
          photo_url: d.player_photo_url,
          contact_name: d.contact_name,
          contact_phone: d.contact_phone,
        });
      }

      const slotsByTeam = new Map<string, TrainingSchedule[]>();
      for (const s of (bundle.training_slots || []) as any[]) {
        const tid = s.team_id;
        if (!slotsByTeam.has(tid)) slotsByTeam.set(tid, []);
        slotsByTeam.get(tid)!.push({
          day_of_week: s.day,
          start_time: s.start_time,
          end_time: s.end_time,
          venue_name: s.terrain_name || '',
          venue_location: s.terrain_location || '',
        });
      }

      const sessionsByTeam = new Map<string, any[]>();
      for (const s of (bundle.training_sessions || []) as any[]) {
        const tid = s.team_id;
        if (!sessionsByTeam.has(tid)) sessionsByTeam.set(tid, []);
        sessionsByTeam.get(tid)!.push(s);
      }

      const attMap = new Map<string, TrainingAttendanceState>();
      for (const r of (bundle.training_attendance || []) as any[]) {
        attMap.set(`${r.session_id}:${r.member_id}`, {
          status: r.status,
          present: r.present,
          responded_at: r.responded_at,
          absence_reason: r.absence_reason,
        });
      }

      const ownMemberIds = new Set(
        ((bundle.members || []) as any[]).filter((m: any) => m.is_self).map((m: any) => m.id)
      );

      // Build per-team cards, grouping children per team
      const teamCardMap = new Map<string, TeamInfo>();
      const orphanChildren: ChildRef[] = [];

      for (const m of (bundle.members || []) as any[]) {
        const childRef: ChildRef = {
          id: m.id,
          name: `${m.first_name || ''} ${m.last_name || ''}`.trim(),
          gender: m.gender ?? null,
          is_own: ownMemberIds.has(m.id),
        };
        const tids = memberTeamsMulti.get(m.id);
        if (!tids || tids.length === 0) {
          orphanChildren.push(childRef);
          continue;
        }
        for (const tid of tids) {
          const team = teamsById.get(tid);
          if (!team) continue;
          if (!teamCardMap.has(tid)) {
            const teamStaff = (staffByTeam.get(tid) || []).sort((a, b) => a.sort_order - b.sort_order);
            teamCardMap.set(tid, {
              children: [],
              team_id: tid,
              team_name: team.name,
              category_name: team.category_name || '-',
              staff: teamStaff.map(s => ({ name: `${s.first_name} ${s.last_name}`, role: STAFF_ROLE_LABELS[s.role] || s.role, phone: s.phone || '' })),
              training_days: team.training_days || [],
              training_schedule: slotsByTeam.get(tid) || [],
              upcoming_sessions_by_child: new Map(),
              members: directoryByTeam.get(tid) || [],
            });
          }
          const card = teamCardMap.get(tid)!;
          card.children.push(childRef);
          const sessions = sessionsByTeam.get(tid) || [];
          card.upcoming_sessions_by_child.set(m.id, sessions.map((s: any) => {
            const att = attMap.get(`${s.id}:${m.id}`) || { status: null, present: null, responded_at: null, absence_reason: null };
            return {
              id: s.id, session_date: s.session_date, start_time: s.start_time, end_time: s.end_time,
              terrain_name: s.terrain_half_label ? `${s.terrain_name} – ${s.terrain_half_label}` : s.terrain_name || null,
              cancelled: s.cancelled, cancelled_reason: s.cancelled_reason, att,
            };
          }));
        }
      }

      const teamsData: TeamInfo[] = [];
      // Orphan card (children with no team)
      if (orphanChildren.length > 0) {
        teamsData.push({
          children: orphanChildren, team_id: '', team_name: '', category_name: '',
          staff: [], training_days: [], training_schedule: [],
          upcoming_sessions_by_child: new Map(), members: [],
        });
      }
      for (const card of teamCardMap.values()) teamsData.push(card);

      setTeams(teamsData);
    } catch (error) {
      console.error('Error fetching teams info:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTrainingDay = (day: any) => {
    if (typeof day === 'string') {
      return day;
    }
    if (day && typeof day === 'object') {
      const dayName = day.day || '';
      const startTime = day.start_time || '';
      const endTime = day.end_time || '';
      return `${dayName} ${startTime}-${endTime}`;
    }
    return '-';
  };

  const getDayName = (dayOfWeek: number): string => {
    const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    return days[dayOfWeek % 7];
  };

  const formatTime = (time: string): string => {
    if (!time) return '';
    return time.substring(0, 5);
  };

  const formatTrainingSchedule = (schedule: TrainingSchedule): string => {
    const day = getDayName(schedule.day_of_week);
    const startTime = formatTime(schedule.start_time);
    const endTime = formatTime(schedule.end_time);
    const venue = schedule.venue_name;
    const location = schedule.venue_location;

    return `${day} ${startTime} - ${endTime} — ${venue}${location ? ', ' + location : ''}`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{teams.length > 1 ? 'Mes équipes' : 'Mon équipe'}</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          {user?.role === 'member' ? 'Informations sur mon équipe' : 'Informations sur les équipes de mes enfants'}
        </p>
      </div>

      {teams.length === 0 ? (
        <div className="rounded-lg p-8 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <Users size={48} style={{ margin: '0 auto 16px', color: 'var(--text-muted)', opacity: 0.4 }} />
          <p className="text-lg font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Aucune équipe rattachée à votre compte</p>
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>Votre profil n'est actuellement lié à aucune équipe.</p>
          <a href="/dashboard" style={{ color: 'var(--accent)', fontSize: '14px', fontWeight: 500 }}>Retour à l'accueil</a>
        </div>
      ) : (
        <div className="space-y-4">
          {teams.map((team) => {
            if (!team.team_id) {
              return (
                <div key="orphan" className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                  <div className="p-5 flex items-center gap-4">
                    <div className="flex-shrink-0 rounded-full flex items-center justify-center" style={{ width: 44, height: 44, background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                      <User className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <h2 className="text-lg font-bold truncate" style={{ color: 'var(--text-primary)' }}>{team.children.map(c => c.name).join(', ')}</h2>
                      </div>
                      <p className="text-sm" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Pas encore d'équipe attribuée</p>
                    </div>
                  </div>
                </div>
              );
            }
            const isOpen = openTeamId === team.team_id;
            const firstUpcoming = [...team.upcoming_sessions_by_child.values()].flat().find(s => !s.cancelled);
            const summary = firstUpcoming
              ? `Prochaine séance : ${new Date(firstUpcoming.session_date).toLocaleDateString('fr-CH', { weekday: 'short', day: 'numeric', month: 'short' })}`
              : team.training_schedule[0]
                ? `Entraînement : ${getDayName(team.training_schedule[0].day_of_week)}`
                : null;
            return (
            <div key={team.team_id} className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <button
                type="button"
                onClick={() => setOpenTeamId(isOpen ? null : team.team_id)}
                aria-expanded={isOpen}
                className="w-full text-left p-5 flex items-start gap-4 transition-colors"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <div className="flex-shrink-0 rounded-full flex items-center justify-center" style={{ width: 44, height: 44, background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                  <Users className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap mb-0.5">
                    <h2 className="text-lg font-bold line-clamp-2" style={{ color: 'var(--text-primary)' }}>{team.team_name}</h2>
                    {team.children.map(c => (
                      <span key={c.id} className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent-text, var(--accent))' }}>
                        {c.is_own ? 'Votre équipe' : c.name}
                      </span>
                    ))}
                  </div>
                  <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{team.category_name}</p>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {team.staff.length > 0
                      ? <><span style={{ color: 'var(--text-muted)' }}>{team.staff[0].role} : </span>{team.staff[0].name}</>
                      : <span style={{ color: 'var(--text-muted)' }}>Staff non renseigné</span>}
                  </p>
                  {summary && (
                    <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                      <Clock className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{summary}</span>
                    </p>
                  )}
                </div>
                <ChevronDown className="w-5 h-5 flex-shrink-0 transition-transform" style={{ color: 'var(--text-secondary)', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
              </button>

              {isOpen && (
              <div className="px-5 pb-5 pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>

              <div className="mb-6">
                <TeamPhotoCard teamId={team.team_id} />
              </div>

              <div className="mb-6">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                  <User className="w-4 h-4" />
                  Staff
                </h3>
                {team.staff.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {team.staff.map((s, i) => (
                      <div key={i}>
                        <p style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{s.name}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.role}</p>
                        {s.phone && (
                          <button
                            type="button"
                            onClick={() => { window.location.href = `tel:${s.phone.replace(/\s/g, '')}`; }}
                            className="text-sm flex items-center gap-1 mt-1 transition-colors"
                            style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-secondary)' }}
                          >
                            <Phone className="w-3 h-3" />
                            {s.phone}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Staff non renseigné</p>
                )}
              </div>

              {team.training_schedule.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                    <Calendar className="w-4 h-4" />
                    Entraînements
                  </h3>
                  <div className="space-y-2">
                    {team.training_schedule.map((schedule, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg px-4 py-3 flex items-start gap-2"
                        style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
                      >
                        <Calendar size={16} aria-hidden="true" style={{ color: 'var(--accent)' }} />
                        <span className="flex-1">{formatTrainingSchedule(schedule)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {team.children.map(child => {
                const childSessions = team.upcoming_sessions_by_child.get(child.id) || [];
                if (childSessions.length === 0 || !user?.id) return null;
                return (
                <div key={child.id} className="mb-6">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                    <Clock className="w-4 h-4" />
                    Prochaines séances{team.children.length > 1 ? ` — ${child.name}` : ''}
                  </h3>
                  <div className="space-y-2">
                    {childSessions.map((session) => {
                      const isCancelled = session.cancelled;
                      return (
                        <div
                          key={session.id}
                          className="rounded-lg px-4 py-3"
                          style={{
                            background: isCancelled ? 'var(--danger-soft)' : 'var(--bg-hover)',
                            border: isCancelled ? '1px solid var(--danger)' : '1px solid var(--border-color)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{
                              color: isCancelled ? 'var(--danger-text)' : 'var(--text-primary)',
                              fontWeight: 600, fontSize: 14,
                              textDecoration: isCancelled ? 'line-through' : undefined,
                            }}>
                              {new Date(session.session_date).toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' })}
                            </span>
                            {isCancelled && (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                padding: '2px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 800,
                                background: 'var(--danger)', color: '#fff', whiteSpace: 'nowrap',
                                letterSpacing: '0.03em', textTransform: 'uppercase',
                              }}>
                                <Ban size={11} aria-hidden="true" /> Annulé
                              </span>
                            )}
                          </div>
                          {isCancelled && session.cancelled_reason && (
                            <div style={{ fontSize: '13px', color: 'var(--danger-text)', fontWeight: 500, marginTop: 4 }}>
                              {session.cancelled_reason}
                            </div>
                          )}
                          {!isCancelled && (
                            <>
                              <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>
                                {session.start_time ? formatTime(session.start_time) : ''}
                                {session.end_time ? ` - ${formatTime(session.end_time)}` : ''}
                                {session.terrain_name ? `${session.start_time ? ' · ' : ''}${session.terrain_name}` : ''}
                              </div>
                              <TrainingAttendanceControl
                                sessionId={session.id}
                                sessionDate={session.session_date}
                                startTime={session.start_time}
                                memberId={child.id}
                                memberName={child.name}
                                status={session.att.status}
                                present={session.att.present}
                                respondedAt={session.att.responded_at}
                                userId={user.id}
                                defaultPresent={attendanceDefaultPresent}
                                gender={child.gender}
                              />
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                );
              })}

              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                  <Users className="w-4 h-4" />
                  Membres de l'équipe ({team.members.length})
                </h3>
                <div className="overflow-hidden rounded-lg" style={{ border: '1px solid var(--border-color)' }}>
                  {team.members.map((member, idx) => {
                    const initials = `${(member.first_name || '').charAt(0)}${(member.last_name || '').charAt(0)}`.toUpperCase();
                    const phone = member.contact_phone?.trim();
                    const playerFullName = `${member.first_name || ''} ${member.last_name || ''}`.trim();
                    const contactName = member.contact_name?.trim() || '';
                    const showContactName = contactName.length > 0 && contactName !== playerFullName;
                    const isLast = idx === team.members.length - 1;
                    const bg = idx % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-row-alt)';
                    return (
                      <div
                        key={member.id}
                        className="flex items-center gap-3 transition-colors"
                        style={{
                          padding: '12px 16px',
                          background: bg,
                          borderBottom: isLast ? 'none' : '1px solid var(--border-color)',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = bg; }}
                      >
                        {member.photo_url ? (
                          <ZoomablePhoto src={member.photo_url} caption={playerFullName} alt="" className="flex-shrink-0 rounded-full object-cover" style={{ width: 40, height: 40 }} />
                        ) : (
                          <div
                            className="flex-shrink-0 rounded-full flex items-center justify-center font-semibold text-sm"
                            style={{ width: 40, height: 40, background: 'var(--accent)', color: 'var(--accent-ink, var(--text-inverse))' }}
                          >
                            {initials || '?'}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="truncate" style={{ fontWeight: 600, fontSize: 16, display: 'inline-flex', alignItems: 'center', maxWidth: '100%', color: 'var(--text-primary)' }}>
                            <span className="truncate">{member.first_name} {member.last_name}</span>
                          </p>
                          {showContactName && (
                            <p className="truncate" style={{ fontWeight: 400, fontSize: 13, color: 'var(--text-secondary)' }}>
                              {contactName}
                            </p>
                          )}
                          {phone && (
                            <p className="truncate" style={{ fontWeight: 400, fontSize: 14, color: 'var(--text-secondary)' }}>
                              {phone}
                            </p>
                          )}
                        </div>
                        {phone && (
                          <button
                            type="button"
                            onClick={() => { window.location.href = `tel:${phone.replace(/\s/g, '')}`; }}
                            className="flex-shrink-0 rounded-full p-2 transition-colors"
                            style={{ color: 'var(--accent)', cursor: 'pointer' }}
                            aria-label={`Appeler ${member.first_name}`}
                          >
                            <Phone className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
                </div>
              )}
            </div>
          ); })}
        </div>
      )}
    </div>
  );
}
