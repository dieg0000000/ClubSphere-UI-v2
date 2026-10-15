import { Preferences } from '@capacitor/preferences'
import logoUrl from '../public/logo-v1-400-transparent.png'

const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY
const BASE_DOMAIN: string = import.meta.env.VITE_NATIVE_BASE_DOMAIN || 'test.clubsphere.cloud'
const SLUG_KEY = 'club_slug'
const SLUG_PATTERN = /^[a-z0-9-]+$/

const MSG_NOT_FOUND = 'Club introuvable. Vérifiez le numéro, ou rendez-vous sur clubsphere.ch.'
const MSG_NETWORK = 'Connexion impossible. Vérifiez votre réseau et réessayez.'

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T
}

const screen = byId<HTMLElement>('club-select')
const form = byId<HTMLFormElement>('club-form')
const input = byId<HTMLInputElement>('club-slug')
const button = byId<HTMLButtonElement>('continue')
const errorBox = byId<HTMLDivElement>('error')
const website = byId<HTMLAnchorElement>('website')

function openClub(slug: string): void {
  window.location.replace(`https://${slug}.${BASE_DOMAIN}/`)
}

function applyNativeClubIcon(): void {
  const bridge = (window as { ClubSphereNative?: { applyClubIcon?: () => void } }).ClubSphereNative
  if (typeof bridge?.applyClubIcon === 'function') bridge.applyClubIcon()
}

function showError(message: string | null, notFound = false): void {
  errorBox.textContent = message ?? ''
  errorBox.hidden = !message
  website.hidden = !notFound
}

function setLoading(loading: boolean): void {
  button.disabled = loading || input.value.trim() === ''
  input.disabled = loading
  button.replaceChildren()
  if (loading) {
    const spinner = document.createElement('span')
    spinner.className = 'spinner'
    spinner.setAttribute('aria-hidden', 'true')
    button.append(spinner)
  }
  button.append('Continuer')
}

type ClubExistsResult = { exists: true; slug: string } | { exists: false }

async function lookupClub(clubNumber: string): Promise<ClubExistsResult> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/club_exists`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ p_slug: clubNumber }),
  })
  if (!res.ok) throw new Error(`club_exists ${res.status}`)
  const data: unknown = await res.json()
  if (data && typeof data === 'object' && 'exists' in data) {
    const d = data as { exists: unknown; slug?: unknown }
    if (d.exists === false) return { exists: false }
    if (d.exists === true && typeof d.slug === 'string' && SLUG_PATTERN.test(d.slug)) {
      return { exists: true, slug: d.slug }
    }
  }
  throw new Error('club_exists: unexpected response')
}

async function onSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault()
  const clubNumber = input.value.trim()
  if (!clubNumber) return
  showError(null)
  setLoading(true)
  let result: ClubExistsResult
  try {
    result = await lookupClub(clubNumber)
  } catch {
    setLoading(false)
    showError(MSG_NETWORK)
    return
  }
  if (!result.exists) {
    setLoading(false)
    showError(MSG_NOT_FOUND, true)
    return
  }
  await Preferences.set({ key: SLUG_KEY, value: result.slug })
  applyNativeClubIcon()
  openClub(result.slug)
}

function showClubSelection(): void {
  byId<HTMLImageElement>('logo').src = logoUrl
  input.addEventListener('input', () => {
    button.disabled = input.value.trim() === ''
    if (!errorBox.hidden) showError(null)
  })
  form.addEventListener('submit', (e) => void onSubmit(e))
  screen.hidden = false
  input.focus()
}

async function start(): Promise<void> {
  const { value } = await Preferences.get({ key: SLUG_KEY })
  if (value && SLUG_PATTERN.test(value)) {
    openClub(value)
    return
  }
  showClubSelection()
}

void start()
