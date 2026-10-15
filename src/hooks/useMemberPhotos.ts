import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const SIGNED_URL_EXPIRY = 3600;
const BATCH_SIZE = 20;

const urlCache = new Map<string, { url: string; expires: number }>();

// ── Invalidation globale ──
// Tout composant abonné (liste d'avatars, fiches) se rafraîchit quand une photo
// est invalidée après un upload/remplacement.
const listeners = new Set<() => void>();

export function invalidateMemberPhoto(path: string | null | undefined) {
  if (path) urlCache.delete(path);
  listeners.forEach((l) => l());
}

function useCacheBump(): number {
  const [bump, setBump] = useState(0);
  useEffect(() => {
    const l = () => setBump((b) => b + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return bump;
}

export function useMemberPhotos(photoPaths: (string | null | undefined)[]) {
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const pendingRef = useRef(false);
  const bump = useCacheBump();

  useEffect(() => {
    const pathsToFetch: string[] = [];
    const now = Date.now();
    const cached: Record<string, string> = {};

    for (const p of photoPaths) {
      if (!p) continue;
      const entry = urlCache.get(p);
      if (entry && entry.expires > now) {
        cached[p] = entry.url;
      } else {
        pathsToFetch.push(p);
      }
    }

    if (Object.keys(cached).length > 0) {
      setSignedUrls((prev) => {
        const next = { ...prev, ...cached };
        if (JSON.stringify(next) === JSON.stringify(prev)) return prev;
        return next;
      });
    }

    if (pathsToFetch.length === 0 || pendingRef.current) return;

    pendingRef.current = true;

    (async () => {
      try {
        const results: Record<string, string> = {};

        for (let i = 0; i < pathsToFetch.length; i += BATCH_SIZE) {
          const batch = pathsToFetch.slice(i, i + BATCH_SIZE);
          const { data, error } = await supabase.storage
            .from('member-photos')
            .createSignedUrls(batch, SIGNED_URL_EXPIRY);

          if (error || !data) continue;

          const expiresAt = now + (SIGNED_URL_EXPIRY - 60) * 1000;
          for (const item of data) {
            if (item.signedUrl && item.path) {
              results[item.path] = item.signedUrl;
              urlCache.set(item.path, { url: item.signedUrl, expires: expiresAt });
            }
          }
        }

        setSignedUrls((prev) => ({ ...prev, ...results }));
      } finally {
        pendingRef.current = false;
      }
    })();
  }, [photoPaths.filter(Boolean).sort().join(','), bump]);

  return signedUrls;
}

export function useSingleMemberPhoto(photoPath: string | null | undefined) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const bump = useCacheBump();

  useEffect(() => {
    if (!photoPath) {
      setSignedUrl(null);
      return;
    }

    const now = Date.now();
    const entry = urlCache.get(photoPath);
    if (entry && entry.expires > now) {
      setSignedUrl(entry.url);
      return;
    }

    (async () => {
      const { data, error } = await supabase.storage
        .from('member-photos')
        .createSignedUrl(photoPath, SIGNED_URL_EXPIRY);

      if (!error && data?.signedUrl) {
        urlCache.set(photoPath, { url: data.signedUrl, expires: now + (SIGNED_URL_EXPIRY - 60) * 1000 });
        setSignedUrl(data.signedUrl);
      }
    })();
  }, [photoPath, bump]);

  return signedUrl;
}

export function useRefreshablePhoto(photoPath: string | null | undefined) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = useCacheBump();

  const refresh = useCallback(() => {
    if (photoPath) urlCache.delete(photoPath);
    setRefreshKey((k) => k + 1);
  }, [photoPath]);

  useEffect(() => {
    if (!photoPath) {
      setSignedUrl(null);
      return;
    }

    const now = Date.now();
    const entry = urlCache.get(photoPath);
    if (entry && entry.expires > now) {
      setSignedUrl(entry.url);
      return;
    }

    (async () => {
      const { data, error } = await supabase.storage
        .from('member-photos')
        .createSignedUrl(photoPath, SIGNED_URL_EXPIRY);

      if (!error && data?.signedUrl) {
        urlCache.set(photoPath, { url: data.signedUrl, expires: now + (SIGNED_URL_EXPIRY - 60) * 1000 });
        setSignedUrl(data.signedUrl);
      }
    })();
  }, [photoPath, refreshKey, bump]);

  return { signedUrl, refresh };
}
