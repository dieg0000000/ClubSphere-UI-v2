import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { waitForBundleIfPending } from '../lib/dashboardCache';

let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;
const listeners = new Set<(v: boolean) => void>();

async function fetchWebsiteEnabled(): Promise<boolean> {
  if (cached !== null) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    const bundleData = await waitForBundleIfPending();
    if (bundleData && bundleData.websiteEnabled !== undefined) {
      cached = bundleData.websiteEnabled;
      inflight = null;
      return bundleData.websiteEnabled;
    }
    const { data } = await supabase
      .from('club_settings')
      .select('website_module_enabled')
      .maybeSingle();
    const enabled = data?.website_module_enabled === true;
    cached = enabled;
    inflight = null;
    return enabled;
  })();
  return inflight;
}

export function setWebsiteModuleEnabledCache(enabled: boolean): void {
  cached = enabled;
  listeners.forEach(fn => fn(enabled));
}

export function useWebsiteModuleEnabled(): { enabled: boolean; loading: boolean } {
  const [enabled, setEnabled] = useState<boolean>(cached ?? false);
  const [loading, setLoading] = useState<boolean>(cached === null);

  useEffect(() => {
    let active = true;
    if (cached === null) {
      fetchWebsiteEnabled().then(v => {
        if (!active) return;
        setEnabled(v);
        setLoading(false);
      });
    } else {
      setEnabled(cached);
      setLoading(false);
    }
    const listener = (v: boolean) => { if (active) setEnabled(v); };
    listeners.add(listener);
    return () => {
      active = false;
      listeners.delete(listener);
    };
  }, []);

  return { enabled, loading };
}
