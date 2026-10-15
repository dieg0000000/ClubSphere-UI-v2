import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Pencil, Trash2, Upload } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { safeUUID } from '../lib/ids';
import { prepareGalleryImage } from '../lib/imageProcessing';
import {
  GALLERY_BUCKET, GALLERY_COLUMNS, GALLERY_MAX_PHOTOS, formatGalleryDate, removeGalleryFiles, signGalleryPaths,
  type Gallery, type GalleryPhoto, type ConsentWarning, consentWarningText,
} from '../lib/galleries';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { useModuleAccess } from '../hooks/useModuleAccess';
import { useToast } from '../hooks/useToast';
import { useConfirmModal } from '../hooks/useConfirmModal';
import { Toast } from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';
import { StandardModal } from '../components/StandardModal';
import { PhotoViewer } from '../components/PhotoViewer';
import GalleryFormModal from '../components/GalleryFormModal';
import GalleryPhotoGrid from '../components/GalleryPhotoGrid';
import GalleryVisibilityControl, { fetchConsentWarnings } from '../components/GalleryVisibilityControl';
import GalleryReportsSection, { type GalleryReport } from '../components/GalleryReportsSection';
import Button from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Alert } from '../components/ui/Alert';

interface GalleryDetail extends Gallery {
  team: { name: string } | null;
  event: { title: string } | null;
  season: { name: string } | null;
}

const PHOTO_COLUMNS = 'id,gallery_id,path,thumb_path,caption,sort_order,width,height,hidden_from_public';
const REPORT_COLUMNS =
  'id,photo_id,reason,created_at,reporter:profiles!gallery_photo_reports_reporter_user_id_fkey(full_name,first_name,last_name),photo:gallery_photos!inner(gallery_id,thumb_path)';
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const ACCEPTED = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';

export default function AdminGalleryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const { user } = useAuth();
  const { clubId } = useTenant();
  const { canView, canEdit, loading: accessLoading } = useModuleAccess('galeries');
  const { toast, showToast } = useToast();
  const { confirmState, showConfirm, hideConfirm } = useConfirmModal();

  const [gallery, setGallery] = useState<GalleryDetail | null>(null);
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [fullUrls, setFullUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [limitError, setLimitError] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [captionPhoto, setCaptionPhoto] = useState<GalleryPhoto | null>(null);
  const [captionText, setCaptionText] = useState('');
  const [captionSaving, setCaptionSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [consentWarnings, setConsentWarnings] = useState<ConsentWarning[]>([]);
  const [reports, setReports] = useState<GalleryReport[]>([]);
  const [reportBusyId, setReportBusyId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadReports = useCallback(async () => {
    if (!id || !canEdit) return;
    const { data, error } = await supabase.from('gallery_photo_reports')
      .select(REPORT_COLUMNS)
      .eq('photo.gallery_id', id)
      .is('resolved_at', null)
      .order('created_at', { ascending: false });
    if (error) {
      showToast('Impossible de charger les signalements', 'error');
      return;
    }
    setReports((data ?? []) as unknown as GalleryReport[]);
  }, [id, canEdit, showToast]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  useEffect(() => {
    if (loading || hash !== '#gallery-reports-title') return;
    document.getElementById('gallery-reports-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loading, hash, reports.length]);

  const galleryId = gallery?.id;
  const galleryPublic = gallery?.visibility === 'public';
  const galleryTeamId = gallery?.team_id ?? null;
  useEffect(() => {
    if (!galleryId || !canEdit || !galleryPublic || !galleryTeamId) {
      setConsentWarnings([]);
      return;
    }
    let cancelled = false;
    fetchConsentWarnings(galleryId).then((w) => { if (!cancelled && w) setConsentWarnings(w); });
    return () => { cancelled = true; };
  }, [galleryId, galleryPublic, galleryTeamId, canEdit]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [galleryRes, photosRes] = await Promise.all([
      supabase.from('galleries')
        .select(`${GALLERY_COLUMNS}, team:teams(name), event:events(title), season:seasons(name)`)
        .eq('id', id).maybeSingle(),
      supabase.from('gallery_photos').select(PHOTO_COLUMNS).eq('gallery_id', id)
        .order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
    ]);
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
    setGallery(galleryRes.data as unknown as GalleryDetail);
    setPhotos(rows);
    setThumbUrls(await signGalleryPaths(rows.map((p) => p.thumb_path)));
  }, [id]);

  useEffect(() => {
    if (canView) load();
  }, [canView, load]);

  const viewerPhoto = viewerIndex !== null ? photos[viewerIndex] : null;

  useEffect(() => {
    if (!viewerPhoto || fullUrls[viewerPhoto.path]) return;
    let cancelled = false;
    signGalleryPaths([viewerPhoto.path]).then((urls) => {
      if (!cancelled) setFullUrls((prev) => ({ ...prev, ...urls }));
    });
    return () => { cancelled = true; };
  }, [viewerPhoto, fullUrls]);

  const uploadOne = async (file: File, sortOrder: number): Promise<GalleryPhoto> => {
    if (!gallery || !clubId) throw new Error('Album introuvable');
    const { full, thumb } = await prepareGalleryImage(file);
    if (full.blob.size > MAX_FILE_BYTES) throw new Error('Image trop volumineuse après compression');
    const name = safeUUID();
    const path = `${gallery.club_id}/${gallery.id}/${name}.webp`;
    const thumbPath = `${gallery.club_id}/${gallery.id}/thumbs/${name}.webp`;
    const storage = supabase.storage.from(GALLERY_BUCKET);
    const up1 = await storage.upload(path, full.blob, { contentType: 'image/webp', upsert: false });
    if (up1.error) throw new Error("Envoi refusé par le serveur");
    const up2 = await storage.upload(thumbPath, thumb.blob, { contentType: 'image/webp', upsert: false });
    if (up2.error) {
      await storage.remove([path]);
      throw new Error("Envoi de la vignette refusé par le serveur");
    }
    const { data, error } = await supabase.from('gallery_photos').insert({
      gallery_id: gallery.id,
      club_id: gallery.club_id,
      path,
      thumb_path: thumbPath,
      width: full.width,
      height: full.height,
      size_bytes: full.blob.size,
      sort_order: sortOrder,
      uploaded_by: user?.id ?? null,
    }).select(PHOTO_COLUMNS).maybeSingle();
    if (error || !data) {
      await storage.remove([path, thumbPath]);
      throw new Error(error?.message?.includes('maximum') ? 'Album complet (100 photos)' : "Enregistrement refusé");
    }
    return data as GalleryPhoto;
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !gallery || progress) return;
    const files = Array.from(fileList);
    setUploadErrors([]);
    if (photos.length + files.length > GALLERY_MAX_PHOTOS) {
      setLimitError(true);
      return;
    }
    setLimitError(false);
    const errors: string[] = [];
    let nextOrder = photos.reduce((max, p) => Math.max(max, p.sort_order), -1) + 1;
    setProgress({ done: 0, total: files.length });
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const photo = await uploadOne(file, nextOrder);
        nextOrder += 1;
        setPhotos((prev) => [...prev, photo]);
        const urls = await signGalleryPaths([photo.thumb_path]);
        setThumbUrls((prev) => ({ ...prev, ...urls }));
      } catch (err) {
        errors.push(`${file.name} : ${err instanceof Error ? err.message : 'erreur inconnue'}`);
      }
      setProgress({ done: i + 1, total: files.length });
    }
    setProgress(null);
    setUploadErrors(errors);
    const sent = files.length - errors.length;
    if (sent > 0) showToast(`${sent} photo${sent > 1 ? 's' : ''} ajoutée${sent > 1 ? 's' : ''}`, 'success');
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (canEdit) handleFiles(e.dataTransfer.files);
  };

  const handleReorder = async (ordered: GalleryPhoto[]) => {
    const previous = photos;
    const updated = ordered.map((p, i) => ({ ...p, sort_order: i }));
    setPhotos(updated);
    const changed = updated.filter((p) => previous.find((o) => o.id === p.id)?.sort_order !== p.sort_order);
    const results = await Promise.all(changed.map((p) =>
      supabase.from('gallery_photos').update({ sort_order: p.sort_order }).eq('id', p.id)));
    if (results.some((r) => r.error)) {
      showToast("L'ordre des photos n'a pas pu être enregistré", 'error');
      load();
    }
  };

  const handleSetCover = async (photo: GalleryPhoto) => {
    if (!gallery) return;
    const { error } = await supabase.from('galleries').update({ cover_photo_id: photo.id }).eq('id', gallery.id);
    if (error) {
      showToast("La couverture n'a pas pu être modifiée", 'error');
      return;
    }
    setGallery({ ...gallery, cover_photo_id: photo.id });
    showToast('Couverture mise à jour', 'success');
  };

  const openCaption = (photo: GalleryPhoto) => {
    setCaptionPhoto(photo);
    setCaptionText(photo.caption ?? '');
  };

  const saveCaption = async () => {
    if (!captionPhoto) return;
    setCaptionSaving(true);
    const caption = captionText.trim().slice(0, 300) || null;
    const { error } = await supabase.from('gallery_photos').update({ caption }).eq('id', captionPhoto.id);
    setCaptionSaving(false);
    if (error) {
      showToast("La légende n'a pas pu être enregistrée", 'error');
      return;
    }
    setPhotos((prev) => prev.map((p) => (p.id === captionPhoto.id ? { ...p, caption } : p)));
    setCaptionPhoto(null);
  };

  const deletePhoto = async (photo: GalleryPhoto) => {
    hideConfirm();
    try {
      await removeGalleryFiles([photo.path, photo.thumb_path]);
    } catch {
      showToast("La photo n'a pas pu être supprimée", 'error');
      return;
    }
    const { error } = await supabase.from('gallery_photos').delete().eq('id', photo.id);
    if (error) {
      showToast("La photo n'a pas pu être supprimée", 'error');
      return;
    }
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    setReports((prev) => prev.filter((r) => r.photo_id !== photo.id));
    setGallery((g) => (g && g.cover_photo_id === photo.id ? { ...g, cover_photo_id: null } : g));
    showToast('Photo supprimée', 'success');
  };

  const setPhotoHidden = async (photoId: string, hidden: boolean, silent = false) => {
    const { error } = await supabase.from('gallery_photos').update({ hidden_from_public: hidden }).eq('id', photoId);
    if (error) {
      showToast("La photo n'a pas pu être modifiée", 'error');
      return false;
    }
    setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, hidden_from_public: hidden } : p)));
    if (!silent) showToast(hidden ? 'Photo masquée du site' : 'Photo affichée sur le site', 'success');
    return true;
  };

  const handleReport = async (report: GalleryReport, hide: boolean) => {
    setReportBusyId(report.id);
    if (hide && !(await setPhotoHidden(report.photo_id, true, true))) {
      setReportBusyId(null);
      return;
    }
    const { error } = await supabase.from('gallery_photo_reports')
      .update({ resolved_at: new Date().toISOString(), resolved_by: user?.id ?? null })
      .eq('id', report.id);
    setReportBusyId(null);
    if (error) {
      showToast("Le signalement n'a pas pu être traité", 'error');
      return;
    }
    setReports((prev) => prev.filter((r) => r.id !== report.id));
    showToast(hide ? 'Photo masquée et signalement traité' : 'Signalement traité', 'success');
  };

  const confirmDeletePhoto = (photo: GalleryPhoto) => {
    showConfirm({
      title: 'Supprimer la photo',
      message: 'Cette photo sera définitivement supprimée de l’album.',
      confirmLabel: 'Supprimer',
      confirmStyle: 'danger',
      onConfirm: () => deletePhoto(photo),
    });
  };

  const deleteGallery = async () => {
    if (!gallery) return;
    setDeleting(true);
    try {
      const storage = supabase.storage.from(GALLERY_BUCKET);
      const folder = `${gallery.club_id}/${gallery.id}`;
      const [mainList, thumbList] = await Promise.all([
        storage.list(folder, { limit: 1000 }),
        storage.list(`${folder}/thumbs`, { limit: 1000 }),
      ]);
      const listed = [
        ...(mainList.data ?? []).filter((f) => f.id).map((f) => `${folder}/${f.name}`),
        ...(thumbList.data ?? []).filter((f) => f.id).map((f) => `${folder}/thumbs/${f.name}`),
      ];
      const paths = Array.from(new Set([...photos.flatMap((p) => [p.path, p.thumb_path]), ...listed]));
      await removeGalleryFiles(paths);
      const { error } = await supabase.from('galleries').delete().eq('id', gallery.id);
      if (error) throw error;
    } catch {
      setDeleting(false);
      hideConfirm();
      showToast("L'album n'a pas pu être supprimé", 'error');
      return;
    }
    hideConfirm();
    navigate('/admin/galeries');
  };

  const confirmDeleteGallery = () => {
    showConfirm({
      title: "Supprimer l'album",
      message: `L'album « ${gallery?.title ?? ''} » et ses ${photos.length} photo${photos.length > 1 ? 's' : ''} seront définitivement supprimés.`,
      confirmLabel: "Supprimer l'album",
      confirmStyle: 'danger',
      onConfirm: deleteGallery,
    });
  };

  if (accessLoading) return null;

  if (!canView) {
    return (
      <div className="p-4 lg:p-8 w-full">
        <Alert variant="warning" title="Accès refusé">Vous n'avez pas accès aux galeries.</Alert>
      </div>
    );
  }

  const backButton = (
    <Button variant="ghost" size="sm" leftIcon={<ArrowLeft size={16} />} onClick={() => navigate('/admin/galeries')}>
      Galeries
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
  const full = photos.length >= GALLERY_MAX_PHOTOS;
  const isPublic = gallery.visibility === 'public';
  const hiddenCount = photos.filter((p) => p.hidden_from_public).length;
  const visibleCount = photos.length - hiddenCount;

  return (
    <div className="p-4 lg:p-8 w-full">
      <div className="mb-4">{backButton}</div>

      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{gallery.title}</h1>
          <div className="mt-2 flex items-center gap-2 flex-wrap" style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            {date && <span className="flex items-center gap-1"><Calendar size={14} aria-hidden="true" />{date}</span>}
            <Badge variant={isPublic ? 'green' : 'neutral'}>
              {isPublic ? 'Public' : 'Club'}
            </Badge>
            {canEdit && (
              <GalleryVisibilityControl
                galleryId={gallery.id}
                visibility={gallery.visibility}
                hasTeam={!!gallery.team_id}
                onChanged={(visibility, warnings) => {
                  setGallery((g) => (g ? { ...g, visibility } : g));
                  setConsentWarnings(warnings);
                  showToast(visibility === 'public' ? 'Album publié sur le site' : 'Album réservé aux membres du club', 'success');
                }}
                onError={(msg) => showToast(msg, 'error')}
              />
            )}
            {canEdit && reports.length > 0 && (
              <a href="#gallery-reports-title" style={{ textDecoration: 'none' }}>
                <Badge variant="red">Signalements ({reports.length})</Badge>
              </a>
            )}
            {linked && <Badge variant="blue">{linked}</Badge>}
            {gallery.season && <Badge variant="sky">{gallery.season.name}</Badge>}
            <span>{photos.length} / {GALLERY_MAX_PHOTOS} photos</span>
          </div>
          {canEdit && (
            <p className="mt-2" style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5 }}>
              Club : visible par les membres connectés dans l'app. Public : affiché sur le site internet du club.
            </p>
          )}
          {gallery.description && (
            <p className="mt-2" style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
              {gallery.description}
            </p>
          )}
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" leftIcon={<Pencil size={16} />} onClick={() => setFormOpen(true)}>Modifier</Button>
            <Button variant="destructive" leftIcon={<Trash2 size={16} />} onClick={confirmDeleteGallery}>Supprimer l'album</Button>
          </div>
        )}
      </div>

      {isPublic && (
        <div className="mb-6 flex flex-col gap-3">
          <Alert variant="info">
            Album public — {visibleCount} photo{visibleCount > 1 ? 's' : ''} visible{visibleCount > 1 ? 's' : ''} sur le site, {hiddenCount} masquée{hiddenCount > 1 ? 's' : ''}.
          </Alert>
          {consentWarnings.length > 0 && (
            <Alert variant="warning" title="Attention">{consentWarningText(consentWarnings)}</Alert>
          )}
        </div>
      )}

      {canEdit && (
        <div className="mb-6 flex flex-col gap-3">
          <div
            role="button"
            tabIndex={0}
            aria-disabled={full || !!progress}
            onDragOver={(e) => { e.preventDefault(); if (!progress) setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => { if (!progress) fileInputRef.current?.click(); }}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !progress) {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            style={{
              padding: '24px', borderRadius: '8px', textAlign: 'center',
              cursor: progress ? 'progress' : 'pointer',
              border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border-color)'}`,
              background: dragOver ? 'var(--bg-hover)' : 'transparent',
              transition: 'border-color 0.15s, background 0.15s',
              opacity: progress ? 0.7 : 1,
            }}
          >
            <Upload size={24} style={{ color: 'var(--text-muted)', margin: '0 auto 8px' }} aria-hidden="true" />
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
              Glissez vos photos ici ou cliquez pour choisir
            </p>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
              JPG, PNG, WebP ou HEIC — {GALLERY_MAX_PHOTOS - photos.length} photo{GALLERY_MAX_PHOTOS - photos.length > 1 ? 's' : ''} restante{GALLERY_MAX_PHOTOS - photos.length > 1 ? 's' : ''}
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED}
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
          />

          {progress && (
            <div aria-live="polite">
              <div className="flex justify-between mb-1" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                <span>{progress.done} / {progress.total} photos envoyées</span>
                <span>{Math.round((progress.done / progress.total) * 100)} %</span>
              </div>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.done}
                style={{ height: 8, borderRadius: 999, background: 'var(--bg-hover)', overflow: 'hidden' }}
              >
                <div style={{
                  height: '100%', width: `${(progress.done / progress.total) * 100}%`,
                  background: 'var(--accent)', transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          )}

          {limitError && (
            <Alert variant="warning" onClose={() => setLimitError(false)}>
              Un album contient au maximum 100 photos.
            </Alert>
          )}

          {uploadErrors.length > 0 && (
            <Alert
              variant="danger"
              title={`${uploadErrors.length} photo${uploadErrors.length > 1 ? 's' : ''} non envoyée${uploadErrors.length > 1 ? 's' : ''}`}
              onClose={() => setUploadErrors([])}
            >
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {uploadErrors.map((msg, i) => <li key={i}>{msg}</li>)}
              </ul>
            </Alert>
          )}
        </div>
      )}

      {photos.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Aucune photo dans cet album.</p>
      ) : (
        <GalleryPhotoGrid
          photos={photos}
          thumbUrls={thumbUrls}
          coverId={gallery.cover_photo_id}
          canEdit={canEdit}
          isPublic={isPublic}
          onOpen={setViewerIndex}
          onReorder={handleReorder}
          onSetCover={handleSetCover}
          onToggleHidden={(photo) => setPhotoHidden(photo.id, !photo.hidden_from_public)}
          onEditCaption={openCaption}
          onDelete={confirmDeletePhoto}
        />
      )}

      {canEdit && (
        <GalleryReportsSection
          reports={reports}
          thumbUrls={thumbUrls}
          busyId={reportBusyId}
          onHide={(r) => handleReport(r, true)}
          onResolve={(r) => handleReport(r, false)}
        />
      )}

      {viewerPhoto && viewerIndex !== null && (
        <PhotoViewer
          src={fullUrls[viewerPhoto.path] ?? thumbUrls[viewerPhoto.thumb_path] ?? ''}
          caption={viewerPhoto.caption}
          onClose={() => setViewerIndex(null)}
          onPrev={viewerIndex > 0 ? () => setViewerIndex(viewerIndex - 1) : undefined}
          onNext={viewerIndex < photos.length - 1 ? () => setViewerIndex(viewerIndex + 1) : undefined}
        />
      )}

      <StandardModal isOpen={!!captionPhoto} onClose={() => setCaptionPhoto(null)} title="Légende">
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="photo-caption" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
              Légende de la photo
            </label>
            <textarea
              id="photo-caption"
              value={captionText}
              maxLength={300}
              onChange={(e) => setCaptionText(e.target.value)}
              autoFocus
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)',
                background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 14, minHeight: 90, resize: 'vertical',
              }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', marginTop: 4 }}>
              {captionText.length} / 300
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setCaptionPhoto(null)} disabled={captionSaving}>Annuler</Button>
            <Button variant="primary" onClick={saveCaption} loading={captionSaving}>Enregistrer</Button>
          </div>
        </div>
      </StandardModal>

      {clubId && (
        <GalleryFormModal
          isOpen={formOpen}
          clubId={clubId}
          gallery={gallery}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            load();
            showToast('Album mis à jour', 'success');
          }}
        />
      )}

      <ConfirmModal {...confirmState} loading={deleting} onCancel={hideConfirm} />
      <Toast toast={toast} />
    </div>
  );
}
