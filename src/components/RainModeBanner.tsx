import { useState, useEffect, useCallback } from 'react'
import { CloudRain } from 'lucide-react'
import { supabase } from '../lib/supabase'

export function RainModeBanner() {
  const [active, setActive] = useState(false)

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from('club_settings')
      .select('rain_mode_active')
      .limit(1)
      .maybeSingle()
    setActive(data?.rain_mode_active === true)
  }, [])

  useEffect(() => {
    fetch()
    const onFocus = () => fetch()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [fetch])

  if (!active) return null

  return (
    <div style={{
      background: '#dc2626',
      color: '#fff',
      padding: '10px 16px',
      fontSize: '13px',
      fontWeight: 600,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      lineHeight: 1.4,
      textAlign: 'center',
      zIndex: 9998,
      flexShrink: 0,
    }}>
      <CloudRain size={16} style={{ flexShrink: 0 }} />
      Mode pluie actif&thinsp;: les entraînements sont déplacés selon leur plan pluie jusqu&rsquo;à nouvel avis. Consultez votre calendrier.
    </div>
  )
}
