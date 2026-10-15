import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

let cachedClubId: string | null = null;
let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;
const listeners = new Set<(v: boolean) => void>();

async function fetchDefault(clubId: string): Promise<boolean> {
  if (cached !== null && cachedClubId === clubId) return cached;
  if (inflight && cachedClubId === clubId) return inflight;
  cachedClubId = clubId;
  inflight = (async () => {
    const { data, error } = await supabase
      .from('club_settings')
      .select('attendance_default_present')
      .eq('club_id', clubId)
      .maybeSingle();
    if (error) {
      console.error('useAttendanceDefaultPresent: query failed', error.message);
    }
    const val = data?.attendance_default_present === true;
    cached = val;
    inflight = null;
    return val;
  })();
  return inflight;
}

export function setAttendanceDefaultPresentCache(val: boolean): void {
  cached = val;
  listeners.forEach(fn => fn(val));
}

export function useAttendanceDefaultPresent(clubId: string | null): { value: boolean; loaded: boolean } {
  const [value, setValue] = useState<boolean>(cached !== null && cachedClubId === clubId ? cached : false);
  const [loaded, setLoaded] = useState<boolean>(cached !== null && cachedClubId === clubId);

  useEffect(() => {
    if (!clubId) return;
    let active = true;
    if (cached !== null && cachedClubId === clubId) {
      setValue(cached);
      setLoaded(true);
    } else {
      setLoaded(false);
      fetchDefault(clubId).then(v => {
        if (active) {
          setValue(v);
          setLoaded(true);
        }
      });
    }
    const listener = (v: boolean) => { if (active) setValue(v); };
    listeners.add(listener);
    return () => { active = false; listeners.delete(listener); };
  }, [clubId]);

  return { value, loaded };
}
