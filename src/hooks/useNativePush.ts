import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  getNativeBridge,
  isNativePushRegistered,
  nativePushPermissionGranted,
  registerNativePushDevice,
} from '../lib/nativePush'

const REGISTER_DELAY_MS = 1500
const RECHECK_INTERVAL_MS = 1000
const RECHECK_WINDOW_MS = 20000

function readEnabled(): boolean {
  return nativePushPermissionGranted() && isNativePushRegistered()
}

export function useNativePush(clubId: string | null) {
  const { canRegisterPush } = useAuth()
  const [enabled, setEnabled] = useState(readEnabled)
  const [activating, setActivating] = useState(false)

  useEffect(() => {
    if (!clubId || !canRegisterPush || !nativePushPermissionGranted()) return
    let cancelled = false
    registerNativePushDevice(clubId).then(() => {
      if (!cancelled) setEnabled(readEnabled())
    })
    return () => { cancelled = true }
  }, [clubId, canRegisterPush])

  const activate = useCallback(async () => {
    const bridge = getNativeBridge()
    if (!bridge || !clubId) return
    setActivating(true)
    bridge.requestPushPermission()
    await new Promise(resolve => setTimeout(resolve, REGISTER_DELAY_MS))
    if (!canRegisterPush) {
      setActivating(false)
      return
    }
    await registerNativePushDevice(clubId)
    const deadline = Date.now() + RECHECK_WINDOW_MS
    while (!readEnabled() && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, RECHECK_INTERVAL_MS))
    }
    setEnabled(readEnabled())
    setActivating(false)
  }, [clubId, canRegisterPush])

  return { enabled, activating, activate }
}
