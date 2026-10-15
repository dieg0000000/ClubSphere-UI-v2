import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Alert } from './ui/Alert';
import Button from './ui/Button';

export default function GalleryReportsAlert() {
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [galleryId, setGalleryId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, count: total, error } = await supabase
      .from('gallery_photo_reports')
      .select('id, photo:gallery_photos!inner(gallery_id)', { count: 'exact' })
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .limit(1);
    const latest = data?.[0] as unknown as { photo?: { gallery_id?: string } } | undefined;
    if (error || !total || !latest?.photo?.gallery_id) {
      setCount(0);
      setGalleryId(null);
      return;
    }
    setCount(total);
    setGalleryId(latest.photo.gallery_id);
  }, []);

  useEffect(() => {
    load();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', load);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', load);
    };
  }, [load]);

  if (count === 0 || !galleryId) return null;

  return (
    <Alert
      variant="danger"
      title={count === 1 ? '1 signalement de photo en attente' : `${count} signalements de photo en attente`}
      action={
        <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/galeries/${galleryId}#gallery-reports-title`)}>
          Voir
        </Button>
      }
    />
  );
}
