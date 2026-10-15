import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Calendar, Newspaper } from 'lucide-react'
import { Tabs } from '../components/ui/Tabs'
import { Events } from './Events'
import { News } from './News'

type VieTab = 'evenements' | 'actualites'

export default function VieDuClub() {
  const [params, setParams] = useSearchParams()

  const raw = params.get('tab')
  const tab: VieTab = raw === 'actualites' ? 'actualites' : 'evenements'

  const setTab = (t: VieTab) => {
    const next = new URLSearchParams(params)
    if (t === 'evenements') next.delete('tab')
    else next.set('tab', t)
    setParams(next, { replace: true })
  }

  const tabItems = [
    { key: 'evenements' as const, label: 'Événements', icon: <Calendar size={15} /> },
    { key: 'actualites' as const, label: 'Actualités', icon: <Newspaper size={15} /> },
  ]

  return (
    <div>
      <Tabs
        items={tabItems}
        value={tab}
        onChange={(k) => setTab(k as VieTab)}
        className="mb-6"
      />

      {tab === 'evenements' && <Events />}
      {tab === 'actualites' && <News />}
    </div>
  )
}
