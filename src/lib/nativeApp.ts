export function isNativeApp(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('ClubSphereApp/')
}
