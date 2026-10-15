import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { MemberVariant } from '../config/navMenus'

export function useHasTeamContext(
  userId: string | undefined,
  userEmail: string | undefined,
  memberVariant: MemberVariant
): boolean {
  const defaultValue = memberVariant === 'player' || memberVariant === 'parent'
  const [hasTeam, setHasTeam] = useState(defaultValue)

  useEffect(() => {
    if (!userId) return
    if (memberVariant === 'supporter' || memberVariant === 'generic') {
      setHasTeam(false)
      return
    }

    let cancelled = false

    ;(async () => {
      let found = false

      if (userEmail) {
        const { data, error } = await supabase
          .from('members')
          .select('id, team_id')
          .ilike('email', userEmail)
          .limit(5)
        if (error) {
          console.warn('[useHasTeamContext] members query failed', error.message)
          return
        }
        if (data?.some(m => m.team_id)) found = true
      }

      if (!found) {
        const { data: children, error: childErr } = await supabase
          .from('parent_members')
          .select('member_id')
          .eq('parent_user_id', userId)

        if (childErr) {
          console.warn('[useHasTeamContext] parent_members query failed', childErr.message)
          return
        }

        if (children && children.length > 0) {
          const { count, error: countErr } = await supabase
            .from('members')
            .select('id', { count: 'exact', head: true })
            .in('id', children.map(c => c.member_id))
            .not('team_id', 'is', null)
          if (countErr) {
            console.warn('[useHasTeamContext] members count query failed', countErr.message)
            return
          }
          if ((count || 0) > 0) found = true
        }
      }

      if (!cancelled) setHasTeam(found)
    })()

    return () => { cancelled = true }
  }, [userId, userEmail, memberVariant])

  return hasTeam
}
