import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Images, Calendar, ImageIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';
import { useAuth } from '../context/AuthContext';
import { Badge } from '../components/ui/Badge';
import { Alert } from '../components/ui/Alert';
import { FilterButtonGroup } from '../components/FilterButtonGroup';
import { fetchMemberGalleries, formatGalleryDate, signGalleryPaths, type GalleryListRow } from '../lib/galleries';

const ALL = 'all';
const MY_TEAMS = 'my-teams';

export default function Gallery() {
  const navigate = useNavigate();
  const { clubId } = useTenant();
  const { user } = useAuth();
  const [galleries, setGalleries] = useState<GalleryListRow[]>([]);
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});
  const [myTeamIds, setMyTeamIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState(ALL);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clubId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error: loadError } = await fetchMemberGalleries(clubId);
      if (cancelled) return;
      setLoading(false);
      if (loadError) {
        setError('Impossible de charger les albums.');
        return;
      }
      const rows = data ?? [];
      setGalleries(rows);
      const paths = rows.map((g) => g.cover?.thumb_path).filter((p): p is string => !!p);
      const urls = await signGalleryPaths(paths);
      if (!cancelled) setCoverUrls(urls);
    })();
    return () => { cancelled = true; };
  }, [clubId]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const today = new Date().toISOString().split('T')[0];
    supabase.rpc('get_calendar_bundle', { p_start: today, p_end: today }).then(({ data, error: rpcError }) => {
      if (cancelled || rpcError || !data || !Array.isArray(data.teams)) return;
      setMyTeamIds(new Set((data.teams as { id: string }[]).map((t) => t.id)));
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  const seasons = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of galleries) {
      if (g.season_id && g.season) map.set(g.season_id, g.season.name);
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [galleries]);

  const filterOptions = useMemo(() => {
    const options: { id: string; label: string }[] = [{ id: ALL, label: 'Tous' }];
    if (myTeamIds.size > 0) options.push({ id: MY_TEAMS, label: 'Mes équipes' });
    if (seasons.length > 1) {
      for (const s of seasons) options.push({ id: `season:${s.id}`, label: s.name });
    }
    return options;
  }, [myTeamIds, seasons]);

  const visible = useMemo(() => {
    if (filter === MY_TEAMS) return galleries.filter((g) => g.team_id && myTeamIds.has(g.team_id));
    if (filter.startsWith('season:')) {
      const seasonId = filter.slice('season:'.length);
      return galleries.filter((g) => g.season_id === seasonId);
    }
    return galleries;
  }, [filter, galleries, myTeamIds]);

  return (
    <div className="p-4 lg:p-8 w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
          <Images size={24} aria-hidden="true" /> Galerie
        </h1>
        <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>Albums photos du club</p>
      </div>

      {error && <div className="mb-4"><Alert variant="danger" onClose={() => setError(null)}>{error}</Alert></div>}

      {!loading && galleries.length > 0 && filterOptions.length > 1 && (
        <div className="mb-4">
          <FilterButtonGroup options={filterOptions} selectedId={filter} onChange={setFilter} />
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Chargement…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-xl p-10 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <ImageIcon size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 8px' }} aria-hidden="true" />
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Aucun album pour le moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {visible.map((g) => {
            const count = g.photos?.[0]?.count ?? 0;
            const coverUrl = g.cover?.thumb_path ? coverUrls[g.cover.thumb_path] : undefined;
            const linked = g.team?.name ?? g.event?.title ?? null;
            const date = formatGalleryDate(g.taken_on);
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => navigate(`/galerie/${g.id}`)}
                className="text-left rounded-xl overflow-hidden transition-shadow hover:shadow-lg"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', cursor: 'pointer' }}
              >
                <div className="aspect-[4/3] flex items-center justify-center" style={{ background: 'var(--bg-hover)' }}>
                  {coverUrl ? (
                    <img src={coverUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <ImageIcon size={36} style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
                  )}
                </div>
                <div className="p-4 flex flex-col gap-2">
                  <h2 className="font-semibold" style={{ color: 'var(--text-primary)', fontSize: 15, lineHeight: 1.3 }}>{g.title}</h2>
                  <div className="flex items-center gap-3 flex-wrap" style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                    {date && <span className="flex items-center gap-1"><Calendar size={13} aria-hidden="true" />{date}</span>}
                    <span>{count} photo{count > 1 ? 's' : ''}</span>
                  </div>
                  {linked && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="blue">{linked}</Badge>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
