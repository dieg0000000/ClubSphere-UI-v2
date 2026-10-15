import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Flag, ImageIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Alert } from '../components/ui/Alert';
import { StandardModal } from '../components/StandardModal';
import { PhotoViewer } from '../components/PhotoViewer';
import { Toast } from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { GALLERY_COLUMNS, formatGalleryDate, signGalleryPaths, type Gallery, type GalleryPhoto } from '../lib/galleries';

const PHOTO_COLUMNS = 'id,gallery_id,path,thumb_path,caption,sort_order,width,height,hidden_from_public';

const labelStyle: CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4,
};
const inputStyle: CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)',
  background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 14,
};

interface AlbumDetail extends Gallery {
  team: { name: string } | null;
  event: { title: string } | null;
}

export default function GalleryAlbum() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast, showToast } = useToast();
  const [gallery, setGallery] = useState<AlbumDetail | null>(null);
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [fullUrls, setFullUrls] = useState<Record<string, string>>({});
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [reportPhotoId, setReportPhotoId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [galleryRes, photosRes] = await Promise.all([
        supabase.from('galleries')
          .select(`${GALLERY_COLUMNS}, team:teams(name), event:events(title)`)
          .eq('id', id).maybeSingle(),
        supabase.from('gallery_photos').select(PHOTO_COLUMNS).eq('gallery_id', id)
          .order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
      ]);
      if (cancelled) return;
      setLoading(false);
      if (galleryRes.error || photosRes.error) {
        setLoadError("Impossible de charger l'album.");
        return;
      }
      if (!galleryRes.data) {
        setLoadError("Cet album n'existe pas ou a été supprimé.");
        return;
      }
      const rows = (photosRes.data ?? []) as GalleryPhoto[];
      setGallery(galleryRes.data as unknown as AlbumDetail);
      setPhotos(rows);
      const urls = await signGalleryPaths(rows.map((p) => p.thumb_path));
      if (!cancelled) setThumbUrls(urls);
    })();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (!user?.id || photos.length === 0) return;
    let cancelled = false;
    supabase.from('gallery_photo_reports')
      .select('photo_id')
      .eq('reporter_user_id', user.id)
      .in('photo_id', photos.map((p) => p.id))
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setReportedIds(new Set(data.map((r) => r.photo_id as string)));
      });
    return () => { cancelled = true; };
  }, [user?.id, photos]);

  const viewerPhoto = viewerIndex !== null ? photos[viewerIndex] : null;

  useEffect(() => {
    if (!viewerPhoto || fullUrls[viewerPhoto.path]) return;
    let cancelled = false;
    signGalleryPaths([viewerPhoto.path]).then((urls) => {
      if (!cancelled) setFullUrls((prev) => ({ ...prev, ...urls }));
    });
    return () => { cancelled = true; };
  }, [viewerPhoto, fullUrls]);

  const closeViewer = useCallback(() => setViewerIndex(null), []);
  const prevPhoto = useCallback(() => {
    setViewerIndex((i) => (i === null ? i : (i - 1 + photos.length) % photos.length));
  }, [photos.length]);
  const nextPhoto = useCallback(() => {
    setViewerIndex((i) => (i === null ? i : (i + 1) % photos.length));
  }, [photos.length]);

  const openReport = (photoId: string) => {
    setReason('');
    setReportError(null);
    setReportPhotoId(photoId);
  };

  const closeReport = useCallback(() => {
    if (!sending) setReportPhotoId(null);
  }, [sending]);

  const sendReport = async () => {
    const motif = reason.trim();
    if (!reportPhotoId || !motif) return;
    setSending(true);
    setReportError(null);
    const { error } = await supabase.rpc('report_gallery_photo', { p_photo: reportPhotoId, p_reason: motif });
    setSending(false);
    if (error) {
      setReportError("Impossible d'envoyer le signalement. Réessayez plus tard.");
      return;
    }
    setReportedIds((prev) => new Set(prev).add(reportPhotoId));
    setReportPhotoId(null);
    showToast('Signalement envoyé au comité.', 'success');
  };

  const backButton = (
    <Button variant="ghost" size="sm" leftIcon={<ArrowLeft size={16} />} onClick={() => navigate('/galerie')}>
      Galerie
    </Button>
  );

  if (loading && !gallery) {
    return <div className="p-4 lg:p-8 w-full"><p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Chargement…</p></div>;
  }

  if (loadError || !gallery) {
    return (
      <div className="p-4 lg:p-8 w-full">
        <div className="mb-4">{backButton}</div>
        <Alert variant="danger">{loadError ?? "Impossible de charger l'album."}</Alert>
      </div>
    );
  }

  const date = formatGalleryDate(gallery.taken_on);
  const linked = gallery.team?.name ?? gallery.event?.title ?? null;
  const viewerSrc = viewerPhoto ? fullUrls[viewerPhoto.path] ?? thumbUrls[viewerPhoto.thumb_path] : undefined;

  return (
    <div className="p-4 lg:p-8 w-full">
      <div className="mb-4">{backButton}</div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{gallery.title}</h1>
        <div className="mt-2 flex items-center gap-2 flex-wrap" style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          {date && <span className="flex items-center gap-1"><Calendar size={14} aria-hidden="true" />{date}</span>}
          {linked && <Badge variant="blue">{linked}</Badge>}
          <span>{photos.length} photo{photos.length > 1 ? 's' : ''}</span>
        </div>
        {gallery.description && (
          <p className="mt-2" style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
            {gallery.description}
          </p>
        )}
      </div>

      {photos.length === 0 ? (
        <div className="rounded-xl p-10 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <ImageIcon size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 8px' }} aria-hidden="true" />
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Aucune photo dans cet album pour le moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {photos.map((photo, index) => {
            const url = thumbUrls[photo.thumb_path];
            return (
              <button
                key={photo.id}
                type="button"
                onClick={() => setViewerIndex(index)}
                aria-label={photo.caption ? `Agrandir : ${photo.caption}` : 'Agrandir la photo'}
                className="block w-full aspect-square rounded-lg overflow-hidden"
                style={{ background: 'var(--bg-hover)', cursor: 'zoom-in', border: '1px solid var(--border-color)' }}
              >
                {url ? (
                  <img src={url} alt={photo.caption ?? ''} className="w-full h-full object-cover" loading="lazy" draggable={false} />
                ) : (
                  <span className="w-full h-full flex items-center justify-center">
                    <ImageIcon size={24} style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {viewerPhoto && viewerSrc && !reportPhotoId && (
        <PhotoViewer
          src={viewerSrc}
          caption={viewerPhoto.caption}
          onClose={closeViewer}
          onPrev={photos.length > 1 ? prevPhoto : undefined}
          onNext={photos.length > 1 ? nextPhoto : undefined}
          action={reportedIds.has(viewerPhoto.id) ? (
            <Badge variant="neutral" icon={<Flag size={11} />}>Signalée</Badge>
          ) : (
            <Button variant="ghost" size="sm" leftIcon={<Flag size={14} />} onClick={() => openReport(viewerPhoto.id)}>
              Signaler
            </Button>
          )}
        />
      )}

      <StandardModal isOpen={!!reportPhotoId} onClose={closeReport} title="Signaler cette photo au comité">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {reportError && <Alert variant="danger" onClose={() => setReportError(null)}>{reportError}</Alert>}
          <div>
            <label style={labelStyle} htmlFor="gallery-report-reason">Motif (par exemple : mon enfant est reconnaissable)</label>
            <textarea
              id="gallery-report-reason"
              style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={closeReport} disabled={sending}>Annuler</Button>
            <Button variant="primary" onClick={sendReport} loading={sending} disabled={!reason.trim()}>Envoyer</Button>
          </div>
        </div>
      </StandardModal>

      <Toast toast={toast} />
    </div>
  );
}
