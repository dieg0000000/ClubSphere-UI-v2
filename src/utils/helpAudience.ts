export type HelpAudience = 'admin' | 'coach' | 'member'

const ADMIN_ROLES = [
  'admin',
  'president',
  'vice_president',
  'committee',
  'responsable_technique',
  'responsable_competitions',
]

const COACH_ROLES = ['coach', 'assistant_coach']

function normalize(roles: string[]): string[] {
  return roles.map(r => r.toLowerCase())
}

// An article's audience is the lowest (most inclusive) tier among its role tags:
// if it targets any member-level role it is a member article seen by everyone,
// otherwise if it targets a coach role it is coach-level, otherwise admin-level.
export function getArticleAudience(roles: string[]): HelpAudience {
  const r = normalize(roles)
  const isAdminTier = (x: string) => ADMIN_ROLES.includes(x)
  const isCoachTier = (x: string) => COACH_ROLES.includes(x)
  if (r.some(x => !isAdminTier(x) && !isCoachTier(x))) return 'member'
  if (r.some(isCoachTier)) return 'coach'
  return 'admin'
}

// The set of audiences a user may view, as the cumulative union of their roles:
// everyone sees member; coaches also see coach; admins/committee see everything.
export function getAllowedAudiences(clubRoles: string[]): Set<HelpAudience> {
  const r = normalize(clubRoles)
  const allowed = new Set<HelpAudience>(['member'])
  if (r.some(x => COACH_ROLES.includes(x))) {
    allowed.add('coach')
  }
  if (r.some(x => ADMIN_ROLES.includes(x))) {
    allowed.add('coach')
    allowed.add('admin')
  }
  return allowed
}

export function canViewHelpArticle(clubRoles: string[], roles: string[]): boolean {
  return getAllowedAudiences(clubRoles).has(getArticleAudience(roles))
}
