import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { STAFF_ROLE_LABELS } from '../types';
import { ArrowLeft, Mail, Users, X, Smartphone, Save, Camera, Trash2 } from 'lucide-react';
import { processPassportPhoto } from '../lib/imageProcessing';
import { useConfirmModal } from '../hooks/useConfirmModal';
import ConfirmModal from '../components/ConfirmModal';
import { useNavigate } from 'react-router-dom';
import GroupementBadge from '../components/GroupementBadge';
import { useMemberPhotos, invalidateMemberPhoto } from '../hooks/useMemberPhotos';
import { reportLoadError } from '../utils/reportLoadError';
import { LoadError } from '../components/LoadError';
import { getMemberPhotoUrl } from '../utils/memberPhotoUrl';
import { useTenant } from '../context/TenantContext';
import { Tabs } from '../components/ui/Tabs';
import Button from '../components/ui/Button';
import {
  EvaluationData, EMPTY_EVALUATION, TECHNIQUE_FIELDS, TACTIQUE_FIELDS,
  MENTAL_FIELDS, getActiveSeason, getSeasonOptions, ratingColor,
} from '../lib/evaluationFields';
import { Badge } from '../components/ui/Badge';
import TeamPhotoCard from '../components/TeamPhotoCard';
import { ZoomablePhoto } from '../components/PhotoViewer';
import { availabilityBadgeVariant, availabilityLabel, availabilitySummary } from '../utils/availabilityHelpers';
import MemberHistoryTab from '../components/MemberHistoryTab';
import { Alert } from '../components/ui/Alert';
import { useAideMoniteurOnly } from '../hooks/useAideMoniteurOnly';

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  position: string | null;
  position_main_id: string | null;
  position_secondary_id: string | null;
  licence_status: string;
  email: string;
  phone: string | null;
  photo_path: string | null;
  photo_url: string | null;
  legal_rep1_firstname: string | null;
  legal_rep1_lastname: string | null;
  legal_rep1_email: string | null;
  legal_rep1_phone: string | null;
  legal_rep2_firstname: string | null;
  legal_rep2_lastname: string | null;
  legal_rep2_email: string | null;
  legal_rep2_phone: string | null;
  status: string | null;
  groupement_id: string | null;
  availability: string | null;
  availability_until: string | null;
  availability_note: string | null;
  jersey_number: number | null;
  receives_convocations: boolean;
  groupements?: { id: string; name: string } | null;
  _secondary?: boolean;
}

interface Team {
  id: string;
  name: string;
  category: {
    name: string;
  } | null;
}

export default function CoachTeamPlayers() {
  const { teamId } = useParams();
  const { user } = useAuth();
  const { clubId } = useTenant();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<Team | null>(null);
  const [staff, setStaff] = useState<{ first_name: string; last_name: string; role: string }[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [noConvExpanded, setNoConvExpanded] = useState(false);
  const [isTeamStaff, setIsTeamStaff] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const aideReadOnly = useAideMoniteurOnly(teamId);

  useEffect(() => {
    fetchTeamAndPlayers();
  }, [teamId, user]);

  const fetchTeamAndPlayers = async () => {
    console.log('CoachTeamPlayers - teamId prop:', teamId);

    if (!teamId) return;

    try {
      setLoadFailed(false);
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select(`
          id,
          name,
          category:team_categories!category_id(name)
        `)
        .eq('id', teamId)
        .maybeSingle();

      if (teamError) throw teamError;

      if (teamData) {
        console.log('CoachTeamPlayers - team prop:', teamData);
        setTeam({
          ...teamData,
          category: Array.isArray(teamData.category) ? teamData.category[0] : teamData.category
        });
      }

      const { data: staffRows } = await supabase
        .from('team_staff')
        .select('role, sort_order, coaches(first_name, last_name, user_id)')
        .eq('team_id', teamId)
        .order('sort_order');
      setIsTeamStaff(!!user?.id && (staffRows || []).some((r: any) => r.coaches?.user_id === user.id));
      setStaff(
        (staffRows || []).filter((r: any) => r.coaches).map((r: any) => ({
          first_name: r.coaches.first_name,
          last_name: r.coaches.last_name,
          role: r.role,
        }))
      );

      const playerCols = `
          id, first_name, last_name, birth_date, position,
          position_main_id, position_secondary_id, licence_status,
          email, phone, photo_path, photo_url,
          legal_rep1_firstname, legal_rep1_lastname, legal_rep1_email, legal_rep1_phone,
          legal_rep2_firstname, legal_rep2_lastname, legal_rep2_email, legal_rep2_phone,
          status, groupement_id, availability, availability_until, availability_note,
          jersey_number, receives_convocations, groupements(id, name)
      `;
      const [primaryRes, secondaryRes] = await Promise.all([
        supabase.from('members').select(playerCols).eq('team_id', teamId).order('last_name'),
        supabase.from('team_members').select(`member_id, members:member_id(${playerCols})`).eq('team_id', teamId),
      ]);

      if (primaryRes.error) throw primaryRes.error;

      const primaryIds = new Set((primaryRes.data || []).map((p: any) => p.id));
      const normalize = (p: any, sec: boolean) => ({
        ...p,
        groupements: Array.isArray(p.groupements) ? p.groupements[0] : p.groupements,
        _secondary: sec,
      });
      const primaries = (primaryRes.data || []).map((p: any) => normalize(p, false));
      const secondaries = (secondaryRes.data || [])
        .map((r: any) => r.members)
        .filter((m: any) => m && !primaryIds.has(m.id))
        .map((m: any) => normalize(m, true));
      setPlayers([...primaries, ...secondaries]);
    } catch (error) {
      reportLoadError('CoachTeamPlayers', error);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: { [key: string]: { bg: string; color: string; label: string } } = {
      actif: { bg: 'var(--success-soft)', color: 'var(--success-text)', label: 'Actif' },
      declare_partant: { bg: 'var(--warning-soft)', color: 'var(--warning-text)', label: 'A declarer partant' },
      partant: { bg: 'var(--warning-soft)', color: 'var(--warning-text)', label: 'Partant' },
      parti: { bg: 'var(--bg-hover)', color: 'var(--text-muted)', label: 'Archive' },
      inactif: { bg: 'var(--bg-hover)', color: 'var(--text-muted)', label: 'Inactif' }
    };

    const config = statusConfig[status] || statusConfig.actif;
    return (
      <span style={{ background: config.bg, color: config.color, borderRadius: '99px', padding: '3px 10px', fontSize: '12px', fontWeight: '600', display: 'inline-block' }}>
        {config.label}
      </span>
    );
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  const photoUrls = useMemberPhotos(players.map((p) => p.photo_path));

  const handlePhotoChanged = (memberId: string, photo_path: string | null, photo_url: string | null) => {
    setPlayers((prev) => prev.map((p) => (p.id === memberId ? { ...p, photo_path, photo_url } : p)));
    setSelectedPlayer((prev) => (prev && prev.id === memberId ? { ...prev, photo_path, photo_url } : prev));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div style={{ color: 'var(--text-muted)' }}>Chargement...</div>
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="ctp-page">
        <LoadError onRetry={fetchTeamAndPlayers} />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="flex items-center justify-center h-64">
        <div style={{ color: 'var(--text-muted)' }}>Équipe non trouvée</div>
      </div>
    );
  }

  return (
    <div className="ctp-page">
      <div className="ctp-header">
        <button
          onClick={() => navigate('/mes-equipes')}
          className="ctp-header__back"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="ctp-header__info">
          <h1 className="ctp-header__title">{team.name}</h1>
          {team.category && (
            <span className="ctp-header__category">{team.category.name}</span>
          )}
        </div>
        <span className="ctp-header__count">
          {players.length} {players.length === 1 ? 'joueur' : 'joueurs'}
        </span>
      </div>

      {aideReadOnly && (
        <div style={{ marginBottom: '16px' }}>
          <Alert variant="info" title="Aide-moniteur — accès en lecture seule." />
        </div>
      )}

      {teamId && <TeamPhotoCard teamId={teamId} readOnly={aideReadOnly} />}

      {staff.length > 0 && (
        <div className="rounded-lg p-3 mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          {staff.map((s, i) => (
            <span key={i} style={{ color: 'var(--text-secondary)' }}>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{s.first_name} {s.last_name}</span>
              {' — '}
              {STAFF_ROLE_LABELS[s.role] || s.role}
            </span>
          ))}
        </div>
      )}

      {(() => {
        const activePlayers = players.filter(p => p.receives_convocations !== false);
        const noConvPlayers = players.filter(p => p.receives_convocations === false);
        return players.length === 0 ? (
        <div className="rounded-lg p-8 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <Users size={48} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
          <p style={{ color: 'var(--text-secondary)' }}>Aucun joueur dans cette équipe</p>
        </div>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="ctp-cards">
            {activePlayers.map((player) => (
              <div
                key={player.id}
                className="ctp-card"
                onClick={() => setSelectedPlayer(player)}
              >
                <span className="ctp-card__avatar">
                  {getMemberPhotoUrl(player.photo_path, photoUrls, player.photo_url) ? (
                    <ZoomablePhoto src={getMemberPhotoUrl(player.photo_path, photoUrls, player.photo_url)!} caption={`${player.first_name} ${player.last_name}`} alt="" className="ctp-card__avatar-img" />
                  ) : (
                    <span className="ctp-card__avatar-initials">
                      {getInitials(player.first_name, player.last_name)}
                    </span>
                  )}
                </span>
                <span className="ctp-card__body">
                  <span className="ctp-card__name">
                    {player.jersey_number != null && <span style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', fontSize: '10px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', marginRight: '4px' }}>#{player.jersey_number}</span>}
                    {player.last_name} {player.first_name}
                    <GroupementBadge
                      status={player.status}
                      groupementId={player.groupement_id}
                      groupementName={player.groupements?.name}
                    />
                    {availabilityBadgeVariant(player.availability) && (
                      <span title={availabilitySummary(player.availability, player.availability_until) || ''}>
                        <Badge variant={availabilityBadgeVariant(player.availability)!}>{availabilityLabel(player.availability)}</Badge>
                      </span>
                    )}
                  </span>
                  <span className="ctp-card__sub">
                    {player.birth_date
                      ? new Date(player.birth_date).toLocaleDateString('fr-CH')
                      : '—'}
                    {player._secondary && <>{' '}<Badge variant="neutral">Secondaire</Badge></>}
                  </span>
                </span>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="ctp-table-wrap">
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              overflow: 'hidden'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: 'var(--bg-table-header)' }}>
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Nom</th>
                    <th className="px-4 py-3 text-left text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Prénom</th>
                    <th className="px-4 py-3 text-left text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Date de naissance</th>
                    <th className="px-4 py-3 text-left text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Téléphone</th>
                  </tr>
                </thead>
                <tbody>
                  {activePlayers.map((player) => (
                    <tr
                      key={player.id}
                      onClick={() => setSelectedPlayer(player)}
                      className="cursor-pointer transition-colors"
                      style={{ borderBottom: '1px solid var(--border-color)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>
                        <span className="inline-flex items-center gap-2">
                          {getMemberPhotoUrl(player.photo_path, photoUrls, player.photo_url) ? (
                            <ZoomablePhoto src={getMemberPhotoUrl(player.photo_path, photoUrls, player.photo_url)!} caption={`${player.first_name} ${player.last_name}`} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                          ) : (
                            <span className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                              {getInitials(player.first_name, player.last_name)}
                            </span>
                          )}
                          {player.jersey_number != null && <span style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', fontSize: '10px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px' }}>#{player.jersey_number}</span>}
                          {player.last_name}
                          <GroupementBadge
                            status={player.status}
                            groupementId={player.groupement_id}
                            groupementName={player.groupements?.name}
                          />
                          {availabilityBadgeVariant(player.availability) && (
                            <span title={availabilitySummary(player.availability, player.availability_until) || ''}>
                              <Badge variant={availabilityBadgeVariant(player.availability)!}>{availabilityLabel(player.availability)}</Badge>
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>
                        {player.first_name}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <span className="inline-flex items-center gap-1.5">
                          {player.birth_date
                            ? new Date(player.birth_date).toLocaleDateString('fr-CH')
                            : '—'}
                          {player._secondary && <Badge variant="neutral">Secondaire</Badge>}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {player.phone || player.legal_rep1_phone || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Collapsed "Sans convocation" group */}
          {noConvPlayers.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <button
                onClick={() => setNoConvExpanded(!noConvExpanded)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0', color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600 }}
              >
                {noConvExpanded ? '▾' : '▸'} Sans convocation ({noConvPlayers.length})
              </button>
              {noConvExpanded && (
                <>
                  <div className="ctp-cards">
                    {noConvPlayers.map((player) => (
                      <div key={player.id} className="ctp-card" onClick={() => setSelectedPlayer(player)} style={{ opacity: 0.6 }}>
                        <span className="ctp-card__avatar">
                          {getMemberPhotoUrl(player.photo_path, photoUrls, player.photo_url) ? (
                            <ZoomablePhoto src={getMemberPhotoUrl(player.photo_path, photoUrls, player.photo_url)!} caption={`${player.first_name} ${player.last_name}`} alt="" className="ctp-card__avatar-img" />
                          ) : (
                            <span className="ctp-card__avatar-initials">{getInitials(player.first_name, player.last_name)}</span>
                          )}
                        </span>
                        <span className="ctp-card__body">
                          <span className="ctp-card__name">
                            {player.jersey_number != null && <span style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', fontSize: '10px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', marginRight: '4px' }}>#{player.jersey_number}</span>}
                            {player.last_name} {player.first_name}
                            <Badge variant="neutral">Sans convocation</Badge>
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="ctp-table-wrap">
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                          {noConvPlayers.map((player) => (
                            <tr key={player.id} onClick={() => setSelectedPlayer(player)} className="cursor-pointer transition-colors" style={{ borderBottom: '1px solid var(--border-color)', opacity: 0.6 }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                            >
                              <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>
                                <span className="inline-flex items-center gap-2">
                                  {getMemberPhotoUrl(player.photo_path, photoUrls, player.photo_url) ? (
                                    <ZoomablePhoto src={getMemberPhotoUrl(player.photo_path, photoUrls, player.photo_url)!} caption={`${player.first_name} ${player.last_name}`} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                                  ) : (
                                    <span className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>{getInitials(player.first_name, player.last_name)}</span>
                                  )}
                                  {player.jersey_number != null && <span style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', fontSize: '10px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px' }}>#{player.jersey_number}</span>}
                                  {player.last_name}
                                  <Badge variant="neutral">Sans convocation</Badge>
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>{player.first_name}</td>
                              <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{player.phone || player.legal_rep1_phone || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      );
      })()}

      {selectedPlayer && (
        <PlayerSlideOver
          player={selectedPlayer}
          photoUrl={getMemberPhotoUrl(selectedPlayer.photo_path, photoUrls, selectedPlayer.photo_url) || undefined}
          teamCategoryName={team.category?.name || null}
          clubId={clubId}
          getStatusBadge={getStatusBadge}
          getInitials={getInitials}
          canEditPhoto={isTeamStaff && !aideReadOnly}
          readOnly={aideReadOnly}
          onPhotoChanged={handlePhotoChanged}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  );
}

/* ─── Player Slide-Over with Evaluation ─── */

interface PlayerSlideOverProps {
  player: Player;
  photoUrl?: string;
  teamCategoryName: string | null;
  clubId: string | null;
  getStatusBadge: (status: string) => React.ReactNode;
  getInitials: (first: string, last: string) => string;
  canEditPhoto: boolean;
  readOnly: boolean;
  onPhotoChanged: (memberId: string, photoPath: string | null, photoUrl: string | null) => void;
  onClose: () => void;
}

function PlayerSlideOver({ player, photoUrl, teamCategoryName, clubId, getStatusBadge, getInitials, canEditPhoto, readOnly, onPhotoChanged, onClose }: PlayerSlideOverProps) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const { confirmState, showConfirm, hideConfirm } = useConfirmModal();

  const handleUploadPhoto = async (file: File) => {
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      if (!player.photo_path && !clubId) throw new Error('Club introuvable');
      const blob = await processPassportPhoto(file);
      const path = player.photo_path || `${clubId}/${player.id}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('member-photos')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;
      const { data: pubData } = supabase.storage.from('member-photos').getPublicUrl(path);
      const publicUrl = `${pubData.publicUrl}?v=${Date.now()}`;
      const { error: dbError } = await supabase
        .from('members')
        .update({ photo_path: path, photo_url: publicUrl })
        .eq('id', player.id);
      if (dbError) throw dbError;
      invalidateMemberPhoto(path);
      onPhotoChanged(player.id, path, publicUrl);
    } catch (err) {
      console.error('Error uploading player photo:', err);
      setPhotoError("La photo n'a pas pu être enregistrée.");
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleDeletePhoto = () => {
    setPhotoError(null);
    showConfirm({
      title: 'Supprimer la photo',
      message: `Supprimer la photo de ${player.first_name} ${player.last_name} ?`,
      confirmStyle: 'danger',
      confirmLabel: 'Supprimer',
      onConfirm: async () => {
        hideConfirm();
        setPhotoBusy(true);
        try {
          if (player.photo_path) {
            const { error: removeError } = await supabase.storage.from('member-photos').remove([player.photo_path]);
            if (removeError) throw removeError;
          }
          const { error: dbError } = await supabase
            .from('members')
            .update({ photo_path: null, photo_url: null })
            .eq('id', player.id);
          if (dbError) throw dbError;
          invalidateMemberPhoto(player.photo_path);
          onPhotoChanged(player.id, null, null);
        } catch (err) {
          console.error('Error deleting player photo:', err);
          setPhotoError("La photo n'a pas pu être supprimée.");
        } finally {
          setPhotoBusy(false);
        }
      },
    });
  };
  const [positionNames, setPositionNames] = useState<{ main: string | null; secondary: string | null }>({ main: null, secondary: null });
  const [season, setSeason] = useState(getActiveSeason());
  const [evaluation, setEvaluation] = useState<EvaluationData>({ ...EMPTY_EVALUATION });
  const [evalLoading, setEvalLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [evalSuccess, setEvalSuccess] = useState(false);
  const [evalTab, setEvalTab] = useState<'technique' | 'tactique' | 'mental'>('technique');

  // Resolve parent account names for legal rep fallback
  const [repNameMap, setRepNameMap] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    const emails = [player.legal_rep1_email, player.legal_rep2_email].filter(Boolean) as string[];
    if (emails.length === 0) { setRepNameMap({}); return; }
    (async () => {
      const { data: links } = await supabase
        .from('parent_members')
        .select('parent_user_id')
        .eq('member_id', player.id);
      if (cancelled || !links?.length) return;
      const { data: profiles } = await supabase
        .from('profiles')
        .select('email, full_name')
        .in('id', links.map(l => l.parent_user_id));
      if (cancelled) return;
      const map: Record<string, string> = {};
      for (const p of profiles || []) {
        if (p.email && p.full_name) map[p.email.toLowerCase()] = p.full_name;
      }
      setRepNameMap(map);
    })();
    return () => { cancelled = true; };
  }, [player.id, player.legal_rep1_email, player.legal_rep2_email]);

  // Resolve position names
  useEffect(() => {
    let cancelled = false;
    const ids = [player.position_main_id, player.position_secondary_id].filter(Boolean) as string[];
    if (ids.length === 0) {
      setPositionNames({ main: null, secondary: null });
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('football_positions')
        .select('id, name')
        .in('id', ids);
      if (cancelled) return;
      const map = new Map((data || []).map(p => [p.id, p.name]));
      setPositionNames({
        main: player.position_main_id ? map.get(player.position_main_id) || null : null,
        secondary: player.position_secondary_id ? map.get(player.position_secondary_id) || null : null,
      });
    })();
    return () => { cancelled = true; };
  }, [player.position_main_id, player.position_secondary_id]);

  // Load evaluation
  const loadEvaluation = useCallback(async () => {
    if (!clubId) return;
    setEvalLoading(true);
    setEvalError(null);
    setEvalSuccess(false);
    const { data, error: fetchErr } = await supabase
      .from('player_evaluations')
      .select('*')
      .eq('member_id', player.id)
      .eq('season', season)
      .maybeSingle();

    if (fetchErr) {
      setEvalError(fetchErr.message);
      setEvalLoading(false);
      return;
    }

    if (data) {
      const ev: EvaluationData = { ...EMPTY_EVALUATION };
      for (const k of Object.keys(EMPTY_EVALUATION) as (keyof EvaluationData)[]) {
        if (k === 'observations') {
          ev.observations = data.observations ?? null;
        } else {
          ev[k] = typeof data[k] === 'number' ? data[k] : null;
        }
      }
      setEvaluation(ev);
    } else {
      setEvaluation({ ...EMPTY_EVALUATION });
    }
    setEvalLoading(false);
  }, [player.id, season, clubId]);

  useEffect(() => { loadEvaluation(); }, [loadEvaluation]);

  const handleSave = async () => {
    if (!clubId) return;
    setSaving(true);
    setEvalError(null);
    setEvalSuccess(false);

    const payload: Record<string, unknown> = {
      club_id: clubId,
      member_id: player.id,
      season,
    };
    for (const k of Object.keys(EMPTY_EVALUATION) as (keyof EvaluationData)[]) {
      payload[k] = evaluation[k];
    }

    const { error: upsertErr } = await supabase
      .from('player_evaluations')
      .upsert(payload, { onConflict: 'member_id,season' });

    if (upsertErr) {
      setEvalError("Échec de l'enregistrement : " + upsertErr.message);
    } else {
      setEvalSuccess(true);
      setTimeout(() => setEvalSuccess(false), 3000);
    }
    setSaving(false);
  };

  const updateField = (key: keyof EvaluationData, value: string) => {
    if (key === 'observations') {
      setEvaluation(prev => ({ ...prev, observations: value || null }));
      return;
    }
    const num = value === '' ? null : Math.min(10, Math.max(1, parseInt(value, 10)));
    if (value !== '' && isNaN(num as number)) return;
    setEvaluation(prev => ({ ...prev, [key]: num }));
  };

  const renderRatingField = (field: { key: keyof EvaluationData; label: string }) => {
    const val = evaluation[field.key] as number | null;
    return (
      <div key={field.key} className="flex items-center justify-between gap-2" style={{ marginBottom: '8px' }}>
        <span className="text-sm" style={{ color: 'var(--text-secondary)', flex: 1, minWidth: 0 }}>{field.label}</span>
        <input
          type="number"
          min={1}
          max={10}
          value={val ?? ''}
          readOnly={readOnly}
          onChange={(e) => updateField(field.key, e.target.value)}
          style={{
            width: '52px',
            padding: '4px 6px',
            borderRadius: '6px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-primary)',
            color: ratingColor(val),
            fontWeight: 700,
            fontSize: '14px',
            textAlign: 'center',
          }}
        />
      </div>
    );
  };

  const currentFields = evalTab === 'technique' ? TECHNIQUE_FIELDS
    : evalTab === 'tactique' ? TACTIQUE_FIELDS
    : MENTAL_FIELDS;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-end z-50" onClick={onClose}>
      <div
        className="h-full overflow-y-auto"
        style={{ width: '480px', maxWidth: '100vw', background: 'var(--bg-sidebar)', borderLeft: '1px solid var(--border-color)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <ConfirmModal {...confirmState} onCancel={hideConfirm} />
        {/* Header */}
        <div style={{ padding: '16px 24px', background: 'var(--bg-modal-header)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
              {photoUrl ? (
                <ZoomablePhoto src={photoUrl} caption={`${player.first_name} ${player.last_name}`} alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-modal-header)', fontWeight: 700, fontSize: '16px' }}>
                  {getInitials(player.first_name, player.last_name)}
                </div>
              )}
              <div>
                <h2 style={{ color: 'var(--text-modal-header)', fontSize: '20px', fontWeight: '700', marginBottom: '4px' }}>
                  {player.first_name} {player.last_name}
                </h2>
                <div style={{ color: 'var(--text-modal-header)', fontSize: '14px', opacity: 0.8 }}>
                  {player.birth_date
                    ? new Date(player.birth_date).toLocaleDateString('fr-CH')
                    : '—'}
                  {player.position ? ` · ${player.position}` : ''}
                </div>
                <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                  {getStatusBadge(player.licence_status)}
                  {availabilityBadgeVariant(player.availability) && (
                    <Badge variant={availabilityBadgeVariant(player.availability)!}>
                      {availabilitySummary(player.availability, player.availability_until) || availabilityLabel(player.availability)}
                    </Badge>
                  )}
                </div>
                {availabilityBadgeVariant(player.availability) && player.availability_note && (
                  <div style={{ marginTop: '4px', fontSize: '12px', fontStyle: 'italic', color: 'var(--text-modal-header)', opacity: 0.75 }}>
                    {player.availability_note}
                  </div>
                )}
                {canEditPhoto && (
                  <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={photoBusy}
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-opacity hover:opacity-80 disabled:opacity-60"
                      style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
                    >
                      <Camera size={14} />
                      {photoBusy ? 'Envoi en cours...' : photoUrl ? 'Remplacer la photo' : 'Ajouter une photo'}
                    </button>
                    {photoUrl && (
                      <button
                        type="button"
                        onClick={handleDeletePhoto}
                        disabled={photoBusy}
                        className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-opacity hover:opacity-80 disabled:opacity-60"
                        style={{ background: 'var(--bg-hover)', color: 'var(--danger-text)', border: '1px solid var(--border-color)' }}
                      >
                        <Trash2 size={14} />
                        Supprimer la photo
                      </button>
                    )}
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUploadPhoto(f);
                        e.target.value = '';
                      }}
                    />
                  </div>
                )}
                {photoError && (
                  <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--danger-text)', background: 'var(--danger-soft)', borderRadius: '6px', padding: '4px 8px' }}>
                    {photoError}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:opacity-80 transition-opacity"
              style={{ color: 'var(--text-modal-header)' }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div style={{ padding: '20px 24px', background: 'var(--bg-card)' }}>
          {/* Contact */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.05em', marginBottom: '8px' }}>
              Contact
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              <Smartphone className="w-3.5 h-3.5 inline mr-1" />{player.phone || '—'}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
              <Mail className="w-3.5 h-3.5 inline mr-1" />{player.email || '—'}
            </div>
          </div>

          {/* Legal rep 1 */}
          {(player.legal_rep1_firstname || player.legal_rep1_lastname || player.legal_rep1_email || player.legal_rep1_phone) && (
            <div style={{ marginBottom: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.05em', marginBottom: '8px' }}>
                Représentant légal 1
              </div>
              <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>
                {(player.legal_rep1_firstname || player.legal_rep1_lastname) ? `${player.legal_rep1_firstname || ''} ${player.legal_rep1_lastname || ''}`.trim() : (player.legal_rep1_email && repNameMap[player.legal_rep1_email.toLowerCase()]) || player.legal_rep1_email}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
                <Smartphone className="w-3.5 h-3.5 inline mr-1" />{player.legal_rep1_phone || '—'}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
                <Mail className="w-3.5 h-3.5 inline mr-1" />{player.legal_rep1_email || '—'}
              </div>
            </div>
          )}

          {/* Legal rep 2 */}
          {(player.legal_rep2_firstname || player.legal_rep2_lastname || player.legal_rep2_email || player.legal_rep2_phone) && (
            <div style={{ marginBottom: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.05em', marginBottom: '8px' }}>
                Représentant légal 2
              </div>
              <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>
                {(player.legal_rep2_firstname || player.legal_rep2_lastname) ? `${player.legal_rep2_firstname || ''} ${player.legal_rep2_lastname || ''}`.trim() : (player.legal_rep2_email && repNameMap[player.legal_rep2_email.toLowerCase()]) || player.legal_rep2_email}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
                <Smartphone className="w-3.5 h-3.5 inline mr-1" />{player.legal_rep2_phone || '—'}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
                <Mail className="w-3.5 h-3.5 inline mr-1" />{player.legal_rep2_email || '—'}
              </div>
            </div>
          )}

          {/* PROFIL JOUEUR section */}
          <div style={{ paddingTop: '16px', borderTop: '1px solid var(--border-color)', marginBottom: '20px' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.05em', marginBottom: '10px' }}>
              Profil joueur
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: player.jersey_number != null ? '0.5fr 1fr 1fr 1fr' : '1fr 1fr 1fr', gap: '8px' }}>
              {player.jersey_number != null && (
                <div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '2px' }}>N° maillot</p>
                  <p style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: '600' }}>#{player.jersey_number}</p>
                </div>
              )}
              <div>
                <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '2px' }}>Catégorie</p>
                <p style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: '600' }}>
                  {(player.position && player.position !== 'Non spécifié') ? player.position : '—'}
                </p>
              </div>
              <div>
                <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '2px' }}>Poste principal</p>
                <p style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: '600' }}>
                  {positionNames.main || '—'}
                </p>
              </div>
              <div>
                <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '2px' }}>Poste secondaire</p>
                <p style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: '600' }}>
                  {positionNames.secondary || '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Historique */}
          <div style={{ paddingTop: '16px', borderTop: '1px solid var(--border-color)', marginBottom: '20px' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.05em', marginBottom: '10px' }}>
              Historique
            </div>
            <MemberHistoryTab memberId={player.id} readOnly />
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px solid var(--border-color)', marginBottom: '20px' }} />

          {/* Evaluation section */}
          <div>
            {/* Season selector */}
            <div className="flex items-center gap-3 mb-4">
              <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Saison :</label>
              <select
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                style={{
                  padding: '5px 10px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                }}
              >
                {getSeasonOptions().map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {evalError && (
              <div style={{ background: 'var(--danger-soft)', color: 'var(--danger)', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', marginBottom: '12px' }}>
                {evalError}
              </div>
            )}

            {evalSuccess && (
              <div style={{ background: 'var(--success-soft)', color: 'var(--success)', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', marginBottom: '12px' }}>
                Évaluation enregistrée.
              </div>
            )}

            {evalLoading ? (
              <div className="text-center py-6" style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Chargement...</div>
            ) : (
              <>
                {/* Tabs */}
                <Tabs
                  items={[
                    { key: 'technique', label: 'Technique' },
                    { key: 'tactique', label: 'Tactique' },
                    { key: 'mental', label: 'Mental & Physique' },
                  ]}
                  value={evalTab}
                  onChange={(id) => setEvalTab(id as 'technique' | 'tactique' | 'mental')}
                />

                <div style={{ marginTop: '12px' }}>
                  {currentFields.map(renderRatingField)}
                </div>

                {/* Observations - always visible */}
                <div style={{ marginTop: '20px' }}>
                  <label className="block text-sm font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                    Observations
                  </label>
                  <textarea
                    value={evaluation.observations || ''}
                    onChange={(e) => updateField('observations', e.target.value)}
                    readOnly={readOnly}
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      resize: 'vertical',
                    }}
                    placeholder="Commentaires libres sur le joueur..."
                  />
                </div>

                {/* Save button */}
                {!readOnly && (
                  <div className="flex justify-end mt-4 mb-2">
                    <Button onClick={handleSave} disabled={saving}>
                      <Save size={16} />
                      {saving ? 'Enregistrement...' : 'Enregistrer'}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
