import { useAuth } from '../context/AuthContext'
import { Navigate } from 'react-router-dom'

interface RoleConfig {
  role: string
  label: string
  menuItems: string[]
  notes?: string
}

const roleConfigs: RoleConfig[] = [
  {
    role: 'admin / president / vice_president / committee / responsable_technique / responsable_competitions',
    label: 'Admin & Comité',
    menuItems: [
      'Accueil (/dashboard)',
      'Actualités (/news)',
      'Événements (/events)',
      'Bénévoles (/benevoles)',
      'Équipes (/teams)',
      'Annuaire (/annuaire)',
      'Terrains (/terrains)',
      'Messages (/messages)',
      'Documents (/documents)',
      'Support (/feedback)',
      '[Administration] — menu déroulant avec tous les sous-menus admin',
      'Déconnexion',
    ],
    notes: 'isAdmin = role === "admin". Les autres rôles comité (president, vice_president, committee, responsable_technique, responsable_competitions) ne sont PAS détectés comme isCoach/isPlayer/isParent, donc ils tombent dans le bloc catch-all "!isPlayer && !isParent && !isCoach || isAdmin". Ils voient le menu général SANS le menu Administration (car isAdmin est false pour eux).',
  },
  {
    role: 'coach / assistant_coach',
    label: 'Entraîneur / Entraîneur adjoint',
    menuItems: [
      'Accueil (/dashboard)',
      'Mon Profil (/mon-profil/coach)',
      'Mes Équipes (/mes-equipes)',
      'Planning des matchs (/planning-matchs)',
      'Messages (/messages)',
      'Actualités (/news)',
      'Événements (/events)',
      'Déconnexion',
    ],
    notes: 'isCoach = role === "coach" || role === "assistant_coach". Le menu Administration est masqué (isAdmin = false).',
  },
  {
    role: 'member (joueur / joueuse)',
    label: 'Joueur / Joueuse',
    menuItems: [
      'Accueil (/dashboard)',
      'Mon Profil (/mon-profil/joueur)',
      'Mon Équipe (/mon-equipe)',
      'Planning des matchs (/planning-matchs)',
      'Messages (/messages)',
      'Actualités (/news)',
      'Événements (/events)',
      'Bénévoles (/benevoles) — uniquement si inscrit comme bénévole',
      'Déconnexion',
    ],
    notes: 'isPlayer = role === "member". Le genre (M/F) est chargé depuis members.gender pour afficher "Joueur" ou "Joueuse" dans le label de rôle.',
  },
  {
    role: 'parent',
    label: 'Parent',
    menuItems: [
      'Accueil (/dashboard)',
      'Mon Profil (/mon-profil/parent)',
      'Mon Équipe (/mon-equipe)',
      'Planning des matchs (/planning-matchs)',
      'Messages (/messages)',
      'Actualités (/news)',
      'Événements (/events)',
      'Bénévoles (/benevoles) — uniquement si inscrit comme bénévole',
      'Déconnexion',
    ],
    notes: 'isParent = role === "parent".',
  },
]

const catchAllRoles = [
  'president',
  'vice_president',
  'committee',
  'responsable_technique',
  'responsable_competitions',
]

const catchAllItems = [
  'Accueil (/dashboard)',
  'Actualités (/news)',
  'Événements (/events)',
  'Bénévoles (/benevoles)',
  'Équipes (/teams)',
  'Annuaire (/annuaire)',
  'Terrains (/terrains)',
  'Messages (/messages)',
  'Documents (/documents)',
  'Support (/feedback)',
  'Déconnexion',
]

const sidebarLogic = `
// Variables booléennes calculées depuis user.role :
const isAdmin = user?.role === 'admin'
const isCoach = user?.role === 'coach' || user?.role === 'assistant_coach'
const isParent = user?.role === 'parent'
const isPlayer = user?.role === 'member'

// Construction de navItems :
const navItems = [
  { path: '/dashboard', label: 'Accueil' },

  // Bloc coach (coach + assistant_coach) — exclut admin
  ...(isCoach && !isAdmin ? [
    { path: '/mon-profil/coach', label: 'Mon Profil' },
    { path: '/mes-equipes', label: 'Mes Équipes' },
    { path: '/planning-matchs', label: 'Planning des matchs' },
    { path: '/messages', label: 'Messages' },
    { path: '/news', label: 'Actualités' },
    { path: '/events', label: 'Événements' },
  ] : []),

  // Bloc joueur (member) — exclut admin
  ...(isPlayer && !isAdmin ? [
    { path: '/mon-profil/joueur', label: 'Mon Profil' },
    { path: '/mon-equipe', label: 'Mon Équipe' },
    { path: '/planning-matchs', label: 'Planning des matchs' },
    { path: '/messages', label: 'Messages' },
    { path: '/news', label: 'Actualités' },
    { path: '/events', label: 'Événements' },
    ...(isVolunteer ? [{ path: '/benevoles', label: 'Bénévoles' }] : []),
  ] : []),

  // Bloc parent — exclut admin
  ...(isParent && !isAdmin ? [
    { path: '/mon-profil/parent', label: 'Mon Profil' },
    { path: '/mon-equipe', label: 'Mon Équipe' },
    { path: '/planning-matchs', label: 'Planning des matchs' },
    { path: '/messages', label: 'Messages' },
    { path: '/news', label: 'Actualités' },
    { path: '/events', label: 'Événements' },
    ...(isVolunteer ? [{ path: '/benevoles', label: 'Bénévoles' }] : []),
  ] : []),

  // Bloc catch-all : tout rôle qui n'est ni joueur, ni parent, ni coach — OU admin
  // ATTENTION : la condition est (!isPlayer && !isParent && !isCoach) || isAdmin
  // Cela inclut : admin, president, vice_president, committee,
  //               responsable_technique, responsable_competitions
  ...(!isPlayer && !isParent && !isCoach || isAdmin ? [
    { path: '/news', label: 'Actualités' },
    { path: '/events', label: 'Événements' },
    { path: '/benevoles', label: 'Bénévoles' },
    { path: '/teams', label: 'Équipes' },
    { path: '/annuaire-club', label: 'Annuaire' },
    { path: '/terrains', label: 'Terrains' },
    { path: '/messages', label: 'Messages' },
    { path: '/documents', label: 'Documents' },
    { path: '/feedback', label: 'Support' },
  ] : []),
]

// Le menu Administration (isAdmin) est rendu séparément dans le JSX
// et ne s'affiche QUE pour role === 'admin'
`.trim()

export default function DebugRoles() {
  const { user } = useAuth()

  if (user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Debug — Sidebar par rôle</h1>
      <p className="text-sm text-gray-500 mb-8">Page réservée aux administrateurs. Montre exactement quels items de menu sont visibles pour chaque rôle.</p>

      <div className="grid gap-6 mb-10">
        {roleConfigs.map((cfg) => (
          <div key={cfg.role} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-gray-50 px-5 py-3 border-b border-gray-200">
              <div className="flex items-start gap-3">
                <div>
                  <p className="font-semibold text-gray-900">{cfg.label}</p>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">{cfg.role}</p>
                </div>
              </div>
            </div>
            <div className="p-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 uppercase tracking-wider">
                    <th className="pb-2 w-8">#</th>
                    <th className="pb-2">Item de menu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {cfg.menuItems.map((item, i) => (
                    <tr key={i}>
                      <td className="py-1.5 text-gray-400 text-xs">{i + 1}</td>
                      <td className="py-1.5 text-gray-800">{item}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {cfg.notes && (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs text-amber-800">{cfg.notes}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-10">
        <div className="bg-gray-50 px-5 py-3 border-b border-gray-200">
          <p className="font-semibold text-gray-900">Rôles comité — menu catch-all</p>
          <p className="text-xs text-gray-500 mt-0.5">Ces rôles ne correspondent à aucun bloc spécifique et voient le menu général</p>
        </div>
        <div className="p-5">
          <div className="flex flex-wrap gap-2 mb-4">
            {catchAllRoles.map((r) => (
              <span key={r} className="px-2 py-1 bg-gray-100 rounded text-xs font-mono text-gray-700">{r}</span>
            ))}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wider">
                <th className="pb-2 w-8">#</th>
                <th className="pb-2">Item de menu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {catchAllItems.map((item, i) => (
                <tr key={i}>
                  <td className="py-1.5 text-gray-400 text-xs">{i + 1}</td>
                  <td className="py-1.5 text-gray-800">{item}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-blue-800">
              Ces rôles NE voient PAS le menu Administration (déroulant). Seul <span className="font-mono font-semibold">role === 'admin'</span> a accès au menu Administration.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="bg-gray-50 px-5 py-3 border-b border-gray-200">
          <p className="font-semibold text-gray-900">Code source — logique de construction du sidebar</p>
          <p className="text-xs text-gray-500 mt-0.5">src/components/Sidebar.tsx</p>
        </div>
        <div className="p-5">
          <pre className="text-xs text-gray-700 bg-gray-50 rounded-lg p-4 overflow-x-auto border border-gray-200 leading-relaxed whitespace-pre-wrap">
            {sidebarLogic}
          </pre>
        </div>
      </div>
    </div>
  )
}
