export const READ_ONLY_NOTE = 'Lecture seule : vous n\'êtes pas entraîneur de cette équipe.'

const PERMISSION_DENIED_MESSAGE = 'Action refusée : vous n\'avez pas les droits sur cette équipe.'

type SaveError = { code?: string; message?: string } | null | undefined

function isPermissionDenied(err: SaveError): boolean {
  return err?.code === '42501' || /row-level security/i.test(err?.message ?? '')
}

export function attendanceSaveErrorMessage(err: SaveError, fallback: string): string {
  if (isPermissionDenied(err)) return PERMISSION_DENIED_MESSAGE
  return err?.message || fallback
}

export function attendanceSaveErrorToast(prefix: string, err: SaveError): string {
  if (isPermissionDenied(err)) return PERMISSION_DENIED_MESSAGE
  return prefix + (err?.message ?? '')
}
