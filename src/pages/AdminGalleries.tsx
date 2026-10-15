import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Images, Plus, Calendar, ImageIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';
import { useModuleAccess } from '../hooks/useModuleAccess';
import Button from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Alert } from '../components/ui/Alert';
import GalleryFormModal from '../components/GalleryFormModal';
import { GALLERY_COLUMNS, formatGalleryDate, signGalleryPaths, type Gallery } from '../lib/galleries';

interface GalleryRow extends Gallery {
  photos: { count: number }[] | null;
  cover: { thumb_path: string } | null;
  team: { name: string } | null;
  event: { title: string } | null;
}

export default function AdminGalleries() {
  const navigate = useNavigate();
  const { clubId } = useTenant();
  const { canView, canEdit, loading: accessLoading } = useModuleAccess('galeries');
  const [galleries, setGalleries] = useState<GalleryRow[]>([]);
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [reportCounts, setReportCounts] = useState<Record<string, number>>({});

  const loadReportCounts = useCallback(async () => {
    if (!clubId || !canEdit) return;
    const { data, error: reportsError } = await supabase
      .from('gallery_photo_reports')
      .select('id, photo:gallery_photos!inner(gallery_id)')
      .eq('club_id', clubId)
      .is('resolved_at', null);
    if (reportsError) return;
    const counts: Record<string, number> = {};
    for (const r of (data ?? []) as unknown as { photo: { gallery_id: string } | null }[]) {
      const gid = r.photo?.gallery_id;
      if (gid) counts[gid] = (counts[gid] ?? 0) + 1;
    }
    setReportCounts(counts);
  }, [clubId, canEdit]);

  const load = useCallback(async () => {
    if (!clubId) return;
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('galleries')
      .select(`${GALLERY_COLUMNS}, photos:gallery_photos!gallery_photos_gallery_id_fkey(count), cover:gallery_photos!galleries_cover_fk(thumb_path), team:teams(name), event:events(title)`)
      .eq('club_id', clubId)
      .order('taken_on', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (loadError) {
      setError('Impossible de charger les albums.');
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as unknown as GalleryRow[];
    setGalleries(rows);
    setLoading(false);
    const paths = rows.map((g) => g.cover?.thumb_path).filter((p): p is string => !!p);
    setCoverUrls(await signGalleryPaths(paths));
  }, [clubId]);

  useEffect(() => {
    if (canView) load();
  }, [canView, load]);

  useEffect(() => {
    loadReportCounts();
  }, [loadReportCounts]);

  if (accessLoading) return null;

  if (!canView) {
    return (
      <div className="p-4 lg:p-8 w-full">
        <Alert variant="warning" title="Accès refusé">Vous n'avez pas accès aux galeries.</Alert>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 w-full">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
            <Images size={24} aria-hidden="true" /> Galeries
          </h1>
          <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>Albums photos du club</p>
        </div>
        {canEdit && (
          <Button variant="primary" leftIcon={<Plus size={16} />} onClick={() => setFormOpen(true)}>
            Nouvel album
          </Button>
        )}
      </div>

      {error && <div className="mb-4"><Alert variant="danger" onClose={() => setError(null)}>{error}</Alert></div>}

      {loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Chargement…</p>
      ) : galleries.length === 0 ? (
        <div className="rounded-xl p-10 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <ImageIcon size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 8px' }} aria-hidden="true" />
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Aucun album pour le moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {galleries.map((g) => {
            const count = g.photos?.[0]?.count ?? 0;
            const coverUrl = g.cover?.thumb_path ? coverUrls[g.cover.thumb_path] : undefined;
            const linked = g.team?.name ?? g.event?.title ?? null;
            const date = formatGalleryDate(g.taken_on);
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => navigate(`/admin/galeries/${g.id}`)}
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
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold" style={{ color: 'var(--text-primary)', fontSize: 15, lineHeight: 1.3 }}>{g.title}</h2>
                    <Badge variant={g.visibility === 'public' ? 'green' : 'neutral'}>
                      {g.visibility === 'public' ? 'Public' : 'Club'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap" style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                    {date && <span className="flex items-center gap-1"><Calendar size={13} aria-hidden="true" />{date}</span>}
                    <span>{count} photo{count > 1 ? 's' : ''}</span>
                  </div>
                  {(linked || reportCounts[g.id]) && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {linked && <Badge variant="blue">{linked}</Badge>}
                      {!!reportCounts[g.id] && <Badge variant="red">Signalements ({reportCounts[g.id]})</Badge>}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {clubId && (
        <GalleryFormModal
          isOpen={formOpen}
          clubId={clubId}
          onClose={() => setFormOpen(false)}
          onSaved={(saved) => {
            setFormOpen(false);
            navigate(`/admin/galeries/${saved.id}`);
          }}
        />
      )}
    </div>
  );
}
