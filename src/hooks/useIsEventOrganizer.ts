import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useIsEventOrganizer(userId: string | undefined): boolean {
  const [isOrganizer, setIsOrganizer] = useState(false)

  useEffect(() => {
    if (!userId) { setIsOrganizer(false); return }

    let cancelled = false

    ;(async () => {
      const today = new Date().toISOString().slice(0, 10)
      const { data } = await supabase
        .from('event_committee_members')
        .select('id, events!inner(date)')
        .eq('profile_id', userId)
        .eq('status', 'active')
        .limit(1)
      if (cancelled) return
      const hasActive = !!(data && data.some((row: any) => {
        const eventDate = row.events?.date?.slice(0, 10)
        if (!eventDate) return true
        const expiry = new Date(eventDate)
        expiry.setDate(expiry.getDate() + 30)
        return expiry.toISOString().slice(0, 10) >= today
      }))
      setIsOrganizer(hasActive)
    })()

    return () => { cancelled = true }
  }, [userId])

  return isOrganizer
}
