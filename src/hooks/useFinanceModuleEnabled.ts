import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { waitForBundleIfPending } from '../lib/dashboardCache';

let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;
const listeners = new Set<(v: boolean) => void>();

async function fetchFinanceEnabled(): Promise<boolean> {
  if (cached !== null) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    const bundleData = await waitForBundleIfPending();
    if (bundleData) {
      cached = bundleData.financeEnabled;
      inflight = null;
      return bundleData.financeEnabled;
    }
    const { data } = await supabase
      .from('club_settings')
      .select('finance_module_enabled')
      .maybeSingle();
    const enabled = data?.finance_module_enabled !== false;
    cached = enabled;
    inflight = null;
    return enabled;
  })();
  return inflight;
}

export function setFinanceModuleEnabledCache(enabled: boolean): void {
  cached = enabled;
  listeners.forEach(fn => fn(enabled));
}

export function useFinanceModuleEnabled(): { enabled: boolean; loading: boolean } {
  const [enabled, setEnabled] = useState<boolean>(cached ?? true);
  const [loading, setLoading] = useState<boolean>(cached === null);

  useEffect(() => {
    let active = true;
    if (cached === null) {
      fetchFinanceEnabled().then(v => {
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
