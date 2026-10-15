import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export interface FootballPosition {
  id: string
  name: string
  category: string
  side: string | null
  sort_order: number
}

export interface PositionGroup {
  category: string
  positions: FootballPosition[]
}

let cachedPositions: FootballPosition[] | null = null

export function useFootballPositions() {
  const [positions, setPositions] = useState<FootballPosition[]>(cachedPositions || [])
  const [loading, setLoading] = useState(!cachedPositions)

  useEffect(() => {
    if (cachedPositions) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('football_positions')
        .select('id, name, category, side, sort_order')
        .order('sort_order', { ascending: true })
      if (!cancelled && data) {
        cachedPositions = data as FootballPosition[]
        setPositions(cachedPositions)
      }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const grouped: PositionGroup[] = []
  const categoryOrder = ['Gardien', 'Défense', 'Milieu', 'Attaque']
  for (const cat of categoryOrder) {
    const items = positions.filter(p => p.category === cat)
    if (items.length > 0) grouped.push({ category: cat, positions: items })
  }
  const others = positions.filter(p => !categoryOrder.includes(p.category))
  if (others.length > 0) grouped.push({ category: 'Autre', positions: others })

  return { positions, grouped, loading }
}
