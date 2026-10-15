import { useState, useEffect, useCallback } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useWebsiteModuleEnabled } from '../hooks/useWebsiteModuleEnabled';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';
import { Tabs } from '../components/ui/Tabs';
import Button from '../components/ui/Button';
import { Toggle } from '../components/Toggle';
import { ExternalLink, Save, Eye, EyeOff, Newspaper, Calendar, FileText, Users, UserX, Handshake, Info, Camera } from 'lucide-react';

type TabKey = 'apercu' | 'contenus' | 'equipes' | 'histoire' | 'masques' | 'sponsors';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'apercu', label: 'Aperçu' },
  { key: 'contenus', label: 'Contenus' },
  { key: 'equipes', label: 'Équipes' },
  { key: 'histoire', label: 'Histoire' },
  { key: 'masques', label: 'Masqués' },
  { key: 'sponsors', label: 'Sponsors' },
];

interface Counts {
  news: number;
  events: number;
  documents: number;
  teamsRoster: number;
  hiddenPlayers: number;
  hiddenConfrerie: number;
  sponsorsDisplayed: number;
}

interface NewsRow { id: string; title: string; published_at: string | null; publish_on_site: boolean; }
interface EventRow { id: string; title: string; date: string; publish_on_site: boolean; }
interface DocRow { id: string; title: string; category: string | null; created_at: string; publish_on_site: boolean; target_team_ids: string[] | null; ag_session_id: string | null; }
interface TeamRow { id: string; name: string; publish_roster: boolean; category: { name: string } | null; }
interface TeamPhotoRow { id: string; team_id: string; storage_path: string; publish_on_site: boolean; }
interface HiddenPlayer { id: string; first_name: string; last_name: string; }
interface HiddenConfrerie { id: string; first_name: string; last_name: string; }
interface SponsorRow { id: string; company_name: string; status: string; display_logo: boolean; show_in_directory: boolean; }

export default function AdminSiteInternet() {
  const { clubId } = useTenant();
  const { enabled: websiteEnabled, loading: websiteLoading } = useWebsiteModuleEnabled();
  const [activeTab, setActiveTab] = useState<TabKey>('apercu');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  if (!websiteLoading && !websiteEnabled) return <Navigate to="/dashboard" replace />;

  const [clubWebsite, setClubWebsite] = useState('');
  const [counts, setCounts] = useState<Counts>({ news: 0, events: 0, documents: 0, teamsRoster: 0, hiddenPlayers: 0, hiddenConfrerie: 0, sponsorsDisplayed: 0 });

  const [news, setNews] = useState<NewsRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [hiddenPlayers, setHiddenPlayers] = useState<HiddenPlayer[]>([]);
  const [hiddenConfrerie, setHiddenConfrerie] = useState<HiddenConfrerie[]>([]);
  const [sponsors, setSponsors] = useState<SponsorRow[]>([]);

  const [siteHistory, setSiteHistory] = useState('');
  const [teamPhotos, setTeamPhotos] = useState<Record<string, TeamPhotoRow>>({});
  const [activeSeasonId, setActiveSeasonId] = useState<string | null>(null);
  const [publishModal, setPublishModal] = useState<{ teamId: string; photo: TeamPhotoRow } | null>(null);
  const [publishThumbUrl, setPublishThumbUrl] = useState<string | null>(null);
  const [publishGaps, setPublishGaps] = useState<{ member_id: string; name: string; photo_consent: boolean | null }[]>([]);
  const [publishConsent, setPublishConsent] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishGapsLoading, setPublishGapsLoading] = useState(false);
  const [teamThumbUrls, setTeamThumbUrls] = useState<Record<string, string>>({});
  const [siteHistorySaved, setSiteHistorySaved] = useState('');
  const [historySaving, setHistorySaving] = useState(false);

  const [loading, setLoading] = useState(true);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchData = useCallback(async () => {
    if (!clubId) return;
    setLoading(true);

    const seasonRes = await supabase.from('seasons').select('id').eq('club_id', clubId).eq('active', true).maybeSingle();
    const seasonId = seasonRes.data?.id || null;
    setActiveSeasonId(seasonId);

    const [settingsRes, newsRes, eventsRes, docsRes, teamsRes, playersRes, confrerieRes, sponsorsRes] = await Promise.all([
      supabase.from('club_settings').select('club_website, site_history').eq('club_id', clubId).maybeSingle(),
      supabase.from('news').select('id, title, published_at, publish_on_site').eq('club_id', clubId).order('published_at', { ascending: false }),
      supabase.from('events').select('id, title, date, publish_on_site').eq('club_id', clubId).order('date', { ascending: false }),
      supabase.from('documents').select('id, title, category, created_at, publish_on_site, target_team_ids, ag_session_id').eq('club_id', clubId).eq('is_active', true).is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('teams').select('id, name, publish_roster, category:team_categories (name)').eq('club_id', clubId).eq('active', true).order('name'),
      supabase.from('members').select('id, first_name, last_name').eq('club_id', clubId).eq('hide_from_site', true),
      supabase.from('confrerie_members').select('id, first_name, last_name').eq('club_id', clubId).eq('hide_from_site', true),
      supabase.from('sponsors').select('id, company_name, status, display_logo, show_in_directory').eq('club_id', clubId),
    ]);

    if (settingsRes.data) {
      setClubWebsite(settingsRes.data.club_website || '');
      setSiteHistory(settingsRes.data.site_history || '');
      setSiteHistorySaved(settingsRes.data.site_history || '');
    }

    const n = newsRes.data || [];
    const e = eventsRes.data || [];
    const d = docsRes.data || [];
    const t = (teamsRes.data || []) as unknown as TeamRow[];
    const hp = playersRes.data || [];
    const hc = confrerieRes.data || [];
    const s = sponsorsRes.data || [];
    const visibleSponsors = s.filter(sp => sp.status === 'actif' && sp.display_logo && sp.show_in_directory);

    setNews(n as NewsRow[]);
    setEvents(e as EventRow[]);
    setDocs(d as DocRow[]);
    setTeams(t);
    setHiddenPlayers(hp);
    setHiddenConfrerie(hc);
    setSponsors(visibleSponsors);

    if (seasonId) {
      const { data: photoRows } = await supabase
        .from('team_photos')
        .select('id, team_id, storage_path, publish_on_site')
        .eq('club_id', clubId)
        .eq('season_id', seasonId);
      const map: Record<string, TeamPhotoRow> = {};
      for (const p of (photoRows || [])) map[p.team_id] = p as TeamPhotoRow;
      setTeamPhotos(map);

      const paths = (photoRows || []).filter(p => p.storage_path).map(p => p.storage_path);
      if (paths.length > 0) {
        const { data: signed } = await supabase.storage.from('team-photos').createSignedUrls(paths, 3600);
        const thumbs: Record<string, string> = {};
        if (signed) {
          for (const s of signed) {
            const row = (photoRows || []).find(p => p.storage_path === s.path);
            if (row && s.signedUrl) thumbs[row.team_id] = s.signedUrl;
          }
        }
        setTeamThumbUrls(thumbs);
      } else {
        setTeamThumbUrls({});
      }
    } else {
      setTeamPhotos({});
      setTeamThumbUrls({});
    }

    setCounts({
      news: n.filter(x => (x as any).publish_on_site).length,
      events: e.filter(x => (x as any).publish_on_site).length,
      documents: d.filter(x => (x as any).publish_on_site).length,
      teamsRoster: t.filter(x => x.publish_roster).length,
      hiddenPlayers: hp.length,
      hiddenConfrerie: hc.length,
      sponsorsDisplayed: visibleSponsors.length,
    });

    setLoading(false);
  }, [clubId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const togglePublish = async (table: string, id: string, field: string, current: boolean) => {
    const { error } = await supabase.from(table).update({ [field]: !current }).eq('id', id);
    if (error) { showToast('Erreur : ' + error.message, 'error'); return; }
    showToast(!current ? 'Publié sur le site' : 'Retiré du site');
    fetchData();
  };

  const handleSaveHistory = async () => {
    if (!clubId) return;
    setHistorySaving(true);
    const val = siteHistory.trim() || null;
    const { error } = await supabase
      .from('club_settings')
      .upsert({ club_id: clubId, site_history: val, updated_at: new Date().toISOString() }, { onConflict: 'club_id' });
    setHistorySaving(false);
    if (error) { showToast('Erreur : ' + error.message, 'error'); return; }
    setSiteHistorySaved(siteHistory.trim());
    showToast('Histoire enregistrée');
  };

  const openPublishModal = async (teamId: string, photo: TeamPhotoRow) => {
    setPublishModal({ teamId, photo });
    setPublishConsent(false);
    setPublishGaps([]);
    setPublishThumbUrl(null);
    setPublishGapsLoading(true);

    const [urlRes, gapsRes] = await Promise.all([
      supabase.storage.from('team-photos').createSignedUrl(photo.storage_path, 3600),
      supabase.rpc('team_photo_consent_gaps', { p_team_id: teamId }),
    ]);
    setPublishThumbUrl(urlRes.data?.signedUrl || null);
    setPublishGaps((gapsRes.data as any[]) || []);
    setPublishGapsLoading(false);
  };

  const handlePublish = async () => {
    if (!publishModal) return;
    setPublishLoading(true);
    const { error } = await supabase.rpc('publish_team_photo', {
      p_photo_id: publishModal.photo.id,
      p_publish: true,
      p_consent_confirmed: true,
    });
    setPublishLoading(false);
    if (error) { showToast('Erreur : ' + error.message, 'error'); return; }
    showToast('Photo publiée sur le site');
    setPublishModal(null);
    fetchData();
  };

  const cardStyle: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' };
  const mutedText: React.CSSProperties = { color: 'var(--text-muted)', fontSize: '13px', lineHeight: '1.5' };

  const CounterCard = ({ label, count, icon, tabKey }: { label: string; count: number; icon: React.ReactNode; tabKey?: TabKey }) => (
    <button
      onClick={() => tabKey && setActiveTab(tabKey)}
      style={{ ...cardStyle, cursor: tabKey ? 'pointer' : 'default', textAlign: 'left', width: '100%' }}
      className="hover:border-[var(--accent)] transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent-light, var(--bg-sidebar))', color: 'var(--accent)' }}>
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{count}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
        </div>
      </div>
    </button>
  );

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('fr-CH') : '-';

  const isDocRestricted = (doc: DocRow) => !!doc.ag_session_id || (doc.target_team_ids && doc.target_team_ids.length > 0);

  if (loading) {
    return (
      <div className="p-6 md:p-8 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Site internet</h1>
        <p style={{ color: 'var(--text-muted)' }}>Chargement...</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Site internet</h1>

      <Tabs
        items={TABS}
        value={activeTab}
        onChange={(t) => setActiveTab(t as TabKey)}
      />

      <div className="mt-6">
        {/* Aperçu */}
        <div style={{ display: activeTab === 'apercu' ? 'block' : 'none' }}>
          <div style={cardStyle} className="mb-6">
            {clubWebsite ? (
              <a href={clubWebsite} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 font-medium hover:opacity-80" style={{ color: 'var(--accent)' }}>
                <ExternalLink size={16} /> Voir le site
              </a>
            ) : (
              <div>
                <p style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Adresse du site non renseignée</p>
                <Link to="/admin/parametres-club" className="text-sm mt-1 inline-block hover:opacity-80" style={{ color: 'var(--accent)' }}>
                  Paramètres &rsaquo; Informations
                </Link>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <CounterCard label="Actualités publiées" count={counts.news} icon={<Newspaper size={18} />} tabKey="contenus" />
            <CounterCard label="Événements publiés" count={counts.events} icon={<Calendar size={18} />} tabKey="contenus" />
            <CounterCard label="Documents publiés" count={counts.documents} icon={<FileText size={18} />} tabKey="contenus" />
            <CounterCard label="Équipes avec effectif" count={counts.teamsRoster} icon={<Users size={18} />} tabKey="equipes" />
            <CounterCard label="Joueurs masqués" count={counts.hiddenPlayers} icon={<UserX size={18} />} tabKey="masques" />
            <CounterCard label="Confrérie masqués" count={counts.hiddenConfrerie} icon={<EyeOff size={18} />} tabKey="masques" />
            <CounterCard label="Sponsors affichés" count={counts.sponsorsDisplayed} icon={<Handshake size={18} />} tabKey="sponsors" />
          </div>
        </div>

        {/* Contenus */}
        <div style={{ display: activeTab === 'contenus' ? 'block' : 'none' }}>
          {/* News */}
          <div style={cardStyle} className="mb-6">
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              <Newspaper size={16} className="inline mr-2" />Actualités
            </h3>
            {news.length === 0 ? (
              <p style={mutedText}>Aucune actualité.</p>
            ) : (
              <div className="space-y-3">
                {news.map(n => (
                  <div key={n.id} className="flex items-center justify-between gap-4 py-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{n.title}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatDate(n.published_at)}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Sur le site</span>
                      <Toggle checked={n.publish_on_site} onChange={() => togglePublish('news', n.id, 'publish_on_site', n.publish_on_site)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Events */}
          <div style={cardStyle} className="mb-6">
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              <Calendar size={16} className="inline mr-2" />Événements
            </h3>
            {events.length === 0 ? (
              <p style={mutedText}>Aucun événement.</p>
            ) : (
              <div className="space-y-3">
                {events.map(e => (
                  <div key={e.id} className="flex items-center justify-between gap-4 py-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{e.title}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatDate(e.date)}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Sur le site</span>
                      <Toggle checked={e.publish_on_site} onChange={() => togglePublish('events', e.id, 'publish_on_site', e.publish_on_site)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Documents */}
          <div style={cardStyle}>
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              <FileText size={16} className="inline mr-2" />Documents
            </h3>
            {docs.length === 0 ? (
              <p style={mutedText}>Aucun document.</p>
            ) : (
              <div className="space-y-3">
                {docs.map(d => {
                  const restricted = isDocRestricted(d);
                  return (
                    <div key={d.id} className="flex items-center justify-between gap-4 py-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{d.title}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{d.category ? d.category.replace(/_/g, ' ') + ' · ' : ''}{formatDate(d.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {restricted ? (
                          <span className="text-xs italic" style={{ color: 'var(--text-muted)' }} title="Document réservé, ne peut pas être publié">
                            <Info size={14} className="inline mr-1" />Réservé
                          </span>
                        ) : (
                          <>
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Sur le site</span>
                            <Toggle checked={d.publish_on_site} onChange={() => togglePublish('documents', d.id, 'publish_on_site', d.publish_on_site)} />
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Équipes */}
        <div style={{ display: activeTab === 'equipes' ? 'block' : 'none' }}>
          <div style={cardStyle}>
            <div className="flex items-center gap-2 mb-2">
              <Info size={14} style={{ color: 'var(--text-muted)' }} />
              <p style={mutedText}>
                Nom et prénom de chaque joueur, et numéro de maillot s'il est renseigné. Aucune autre information n'est publiée. Un joueur peut être retiré du site avec la case « Ne pas apparaître sur le site du club » de sa fiche.
              </p>
            </div>
            {teams.length === 0 ? (
              <p style={mutedText} className="mt-4">Aucune équipe active.</p>
            ) : (
              <div className="space-y-3 mt-4">
                {teams.map(t => {
                  const tp = teamPhotos[t.id];
                  const hasPhoto = !!tp;
                  return (
                    <div key={t.id} className="py-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t.name}</p>
                          {t.category && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{(t.category as any).name}</p>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Effectif publié</span>
                          <Toggle checked={t.publish_roster} onChange={() => togglePublish('teams', t.id, 'publish_roster', t.publish_roster)} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Camera size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        {hasPhoto ? (
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {teamThumbUrls[t.id] && (
                              <img src={teamThumbUrls[t.id]} alt="" style={{ width: 48, height: 36, objectFit: 'cover', borderRadius: 6, flexShrink: 0, border: '1px solid var(--border-color)' }} />
                            )}
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Photo d'équipe sur le site</span>
                            <Toggle
                              checked={tp.publish_on_site}
                              onChange={async () => {
                                if (!tp.publish_on_site) {
                                  openPublishModal(t.id, tp);
                                } else {
                                  const { error } = await supabase.rpc('publish_team_photo', { p_photo_id: tp.id, p_publish: false, p_consent_confirmed: false });
                                  if (error) { showToast('Erreur : ' + error.message, 'error'); return; }
                                  showToast('Photo retirée du site');
                                  fetchData();
                                }
                              }}
                            />
                          </div>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Aucune photo pour la saison active</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Histoire */}
        <div style={{ display: activeTab === 'histoire' ? 'block' : 'none' }}>
          <div style={cardStyle}>
            <h3 style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>
              Histoire du club
            </h3>
            <p style={{ ...mutedText, marginBottom: '24px' }}>
              Ce texte est publié sur le site internet du club, dans la page Histoire.
            </p>
            <textarea
              value={siteHistory}
              onChange={e => { if (e.target.value.length <= 20000) setSiteHistory(e.target.value); }}
              rows={16}
              placeholder="Racontez l'histoire de votre club…"
              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px 14px', color: 'var(--text-primary)', fontSize: '14px', lineHeight: '1.6', resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
              <span style={{ fontSize: '12px', color: siteHistory.length > 19500 ? 'var(--danger)' : 'var(--text-muted)' }}>
                {siteHistory.length.toLocaleString('fr-CH')} / 20 000
              </span>
              <Button
                size="sm"
                onClick={handleSaveHistory}
                disabled={historySaving || siteHistory.trim() === siteHistorySaved}
              >
                {historySaving ? 'Enregistrement...' : <><Save size={14} style={{ marginRight: '4px' }} /> Enregistrer</>}
              </Button>
            </div>
          </div>
        </div>

        {/* Masqués */}
        <div style={{ display: activeTab === 'masques' ? 'block' : 'none' }}>
          <div style={cardStyle} className="mb-6">
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              <UserX size={16} className="inline mr-2" />Joueurs masqués
            </h3>
            {hiddenPlayers.length === 0 ? (
              <p style={mutedText}>Aucun joueur masqué.</p>
            ) : (
              <div className="space-y-2">
                {hiddenPlayers.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{p.first_name} {p.last_name}</p>
                    <Link to="/admin/annuaire/joueurs" className="text-xs hover:opacity-80" style={{ color: 'var(--accent)' }}>
                      Voir la fiche
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={cardStyle}>
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              <EyeOff size={16} className="inline mr-2" />Confrérie masqués
            </h3>
            {hiddenConfrerie.length === 0 ? (
              <p style={mutedText}>Aucun membre de la confrérie masqué.</p>
            ) : (
              <div className="space-y-2">
                {hiddenConfrerie.map(c => (
                  <div key={c.id} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{c.first_name} {c.last_name}</p>
                    <Link to="/admin/annuaire/club" className="text-xs hover:opacity-80" style={{ color: 'var(--accent)' }}>
                      Voir la fiche
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sponsors */}
        <div style={{ display: activeTab === 'sponsors' ? 'block' : 'none' }}>
          <div style={cardStyle}>
            <div className="flex items-start gap-2 mb-4 p-3 rounded-lg" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
              <Info size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }} />
              <p style={mutedText}>
                Même liste que le carrousel de l'application. Pour modifier, ouvrez la fiche du sponsor.
              </p>
            </div>
            {sponsors.length === 0 ? (
              <p style={mutedText}>Aucun sponsor affiché sur le site.</p>
            ) : (
              <div className="space-y-2">
                {sponsors.map(s => (
                  <div key={s.id} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{s.company_name}</p>
                    <Link to="/admin/sponsors" className="text-xs hover:opacity-80" style={{ color: 'var(--accent)' }}>
                      Voir la fiche
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium"
          style={{
            background: toast.type === 'error' ? 'var(--danger)' : 'var(--success, #22c55e)',
            color: '#fff',
          }}
        >
          {toast.msg}
        </div>
      )}

      {publishModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.5)', padding: 16,
        }} onClick={e => { if (e.target === e.currentTarget && !publishLoading) setPublishModal(null) }}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: 16, padding: 24,
            width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
              Publier la photo d'équipe
            </h3>

            {publishThumbUrl && (
              <img src={publishThumbUrl} alt="" style={{ width: '100%', borderRadius: 10, marginBottom: 16, display: 'block' }} />
            )}

            {publishGapsLoading ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Vérification des accords...</p>
            ) : publishGaps.length > 0 ? (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 13, color: 'var(--warning-text, var(--warning))', fontWeight: 600, marginBottom: 8 }}>
                  {publishGaps.length} joueur{publishGaps.length > 1 ? 's' : ''} de l'équipe n'ont pas donné leur accord pour la diffusion de leur image :
                </p>
                <ul style={{ paddingLeft: 20, margin: 0 }}>
                  {publishGaps.map(g => (
                    <li key={g.member_id} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      {g.name} — <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>
                        {g.photo_consent === false ? 'refusé' : 'pas de réponse'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--success-text, var(--success))', marginBottom: 16 }}>
                Tous les joueurs de l'équipe ont donné leur accord.
              </p>
            )}

            <label style={{ display: 'flex', gap: 8, cursor: 'pointer', marginBottom: 20 }}>
              <input
                type="checkbox"
                checked={publishConsent}
                onChange={e => setPublishConsent(e.target.checked)}
                style={{ accentColor: 'var(--accent)', marginTop: 2, flexShrink: 0 }}
              />
              <span style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                Je confirme que tous les joueurs visibles sur la photo ont donné leur accord pour sa publication sur le site du club.
              </span>
            </label>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" size="sm" onClick={() => setPublishModal(null)} disabled={publishLoading}>Annuler</Button>
              <Button variant="primary" size="sm" onClick={handlePublish} disabled={!publishConsent || publishLoading || publishGapsLoading}>
                {publishLoading ? 'Publication...' : 'Publier'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
