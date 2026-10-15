export function getProfilePath(clubRoles: string[]): string {
  if (clubRoles.includes('parent')) return '/mon-profil/parent'
  if (clubRoles.includes('member')) return '/mon-profil/joueur'
  return '/mon-profil'
}
