import { useState, useEffect } from 'react'
import { CloudRain } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ConfirmModal } from './ConfirmModal'
import Button from './ui/Button'

interface Props {
  onToast?: (message: string, type: 'success' | 'error') => void
}

export function RainModeToggle({ onToast }: Props) {
  const [rainEnabled, setRainEnabled] = useState(false)
  const [rainActive, setRainActive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showActivate, setShowActivate] = useState(false)
  const [showDeactivate, setShowDeactivate] = useState(false)

  const fetchState = async () => {
    const { data } = await supabase
      .from('club_settings')
      .select('rain_mode_enabled, rain_mode_active')
      .limit(1)
      .maybeSingle()
    setRainEnabled(data?.rain_mode_enabled === true)
    setRainActive(data?.rain_mode_active === true)
    setLoading(false)
  }

  useEffect(() => {
    fetchState()
  }, [])

  if (loading || !rainEnabled) return null

  const handleActivate = async () => {
    setSaving(true)
    setShowActivate(false)
    const { data, error } = await supabase.rpc('set_rain_mode', { p_active: true })
    if (error) {
      onToast?.(error.message, 'error')
      setSaving(false)
      return
    }
    setRainActive(true)
    const sessionsToday = (data as any)?.sessions_today ?? 0
    onToast?.(`Mode pluie activé — ${sessionsToday} séance(s) aujourd'hui`, 'success')

    setSaving(false)
  }

  const handleDeactivate = async () => {
    setSaving(true)
    setShowDeactivate(false)
    const { error } = await supabase.rpc('set_rain_mode', { p_active: false })
    if (error) {
      onToast?.(error.message, 'error')
      setSaving(false)
      return
    }
    setRainActive(false)
    onToast?.('Mode pluie désactivé', 'success')
    setSaving(false)
  }

  return (
    <>
      {rainActive ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowDeactivate(true)}
          disabled={saving}
        >
          <CloudRain size={16} style={{ marginRight: '6px' }} />
          {saving ? 'Désactivation…' : 'Désactiver le mode pluie'}
        </Button>
      ) : (
        <Button
          variant="danger"
          size="sm"
          onClick={() => setShowActivate(true)}
          disabled={saving}
        >
          <CloudRain size={16} style={{ marginRight: '6px' }} />
          {saving ? 'Activation…' : 'Activer le mode pluie'}
        </Button>
      )}

      <ConfirmModal
        isOpen={showActivate}
        title="Activer le mode pluie ?"
        message="Les entraînements du jour passent sur leur plan pluie (lieu et horaire de repli). Joueurs et parents concernés reçoivent une notification. Tant que le mode reste actif, un rappel part chaque jour à midi."
        confirmLabel="Activer"
        cancelLabel="Annuler"
        confirmStyle="danger"
        onConfirm={handleActivate}
        onCancel={() => setShowActivate(false)}
      />

      <ConfirmModal
        isOpen={showDeactivate}
        title="Désactiver le mode pluie ?"
        message="Les entraînements reviennent à leur lieu et horaire habituels."
        confirmLabel="Désactiver"
        cancelLabel="Annuler"
        confirmStyle="warning"
        onConfirm={handleDeactivate}
        onCancel={() => setShowDeactivate(false)}
      />
    </>
  )
}
