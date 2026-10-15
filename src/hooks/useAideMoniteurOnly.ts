import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useAideMoniteurOnly(teamId: string | null | undefined): boolean {
  const [readOnly, setReadOnly] = useState(false)

  useEffect(() => {
    if (!teamId) { setReadOnly(false); return }

    let cancelled = false

    ;(async () => {
      const { data, error } = await supabase.rpc('is_aide_moniteur_only', { p_team_id: teamId })
      if (cancelled) return
      setReadOnly(!error && data === true)
    })()

    return () => { cancelled = true }
  }, [teamId])

  return readOnly
}
