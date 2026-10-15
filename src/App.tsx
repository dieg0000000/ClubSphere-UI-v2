import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { useActiveNavView } from './hooks/useNavView'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { ResetPassword } from './pages/ResetPassword'
import { AuthConfirm } from './pages/AuthConfirm'
import { Setup } from './pages/Setup'
import { Onboarding } from './pages/Onboarding'
import { Dashboard } from './pages/Dashboard'
import { News } from './pages/News'
import { AdminNews } from './pages/AdminNews'
import { AdminNewsList } from './pages/AdminNewsList'
import { Events } from './pages/Events'
import VieDuClub from './pages/VieDuClub'
import { EventDetail } from './pages/EventDetail'
import { Volunteers } from './pages/Volunteers'
import { VolunteerDetail } from './pages/VolunteerDetail'
import { AdminEvents } from './pages/AdminEvents'
import { AdminTheme } from './pages/AdminTheme'
import { Teams } from './pages/Teams'
import { AdminTeams } from './pages/AdminTeams'
import { AdminCategories } from './pages/AdminCategories'
import AdminCoaches from './pages/AdminCoaches'
import AdminQualifications from './pages/AdminQualifications'
import AdminCategoriesManagement from './pages/AdminCategoriesManagement'
import AdminAnuaireJoueurs from './pages/AdminAnuaireJoueurs'
import AdminAnuaireClub from './pages/AdminAnuaireClub'
import AdminSponsors from './pages/AdminSponsors'
import AdminDeclarationPartants from './pages/AdminDeclarationPartants'
import AdminEventDetail from './pages/AdminEventDetail'
import AnnuaireMember from './pages/AnnuaireMember'
import CoachRegistration from './pages/CoachRegistration'
import AdminRegistration from './pages/AdminRegistration'
import InviteRegistration from './pages/InviteRegistration'
import CoachProfile from './pages/CoachProfile'
import PlayerProfile from './pages/PlayerProfile'
import ParentProfile from './pages/ParentProfile'
import AdminProfile from './pages/AdminProfile'
import ParentTeams from './pages/ParentTeams'
import CoachTeams from './pages/CoachTeams'
import CoachTeamPlayers from './pages/CoachTeamPlayers'
import CoachPresences from './pages/CoachPresences'
import CoachExpenses from './pages/CoachExpenses'
import AdminTerrains from './pages/AdminTerrains'
import AdminEntrainements from './pages/AdminEntrainements'
import Terrains from './pages/Terrains'
import AdminPVSeances from './pages/AdminPVSeances'
import AdminPVSeanceDetail from './pages/AdminPVSeanceDetail'
import { AdminJSPresences } from './pages/AdminJSPresences'
import { AdminJSPresencesOld } from './pages/AdminJSPresencesOld'
import { TeamAttendance } from './pages/TeamAttendance'
import { AdminFinancesConfig } from './pages/AdminFinancesConfig'
import { AdminFinancesSaisons } from './pages/AdminFinancesSaisons'
import { AdminFinancesFacturation } from './pages/AdminFinancesFacturation'
import { AdminFinancesDashboard } from './pages/AdminFinancesDashboard'
import { AdminFinancesDashboardCharts } from './pages/AdminFinancesDashboardCharts'
import { AdminFinancesSituation } from './pages/AdminFinancesSituation'
import { AdminDepenses } from './pages/AdminDepenses'
import AdminClubSettings from './pages/AdminClubSettings'
import AdminSiteInternet from './pages/AdminSiteInternet'
import Messages from './pages/Messages'
import AdminMatches from './pages/AdminMatches'
import MatchSchedule from './pages/MatchSchedule'
import Calendrier from './pages/Calendrier'
import CommitteeMobileCalendar from './pages/CommitteeMobileCalendar'
import MatchDetail from './pages/MatchDetail'
import AdminNotificationConfig from './pages/AdminNotificationConfig'
import AdminUsers from './pages/AdminUsers'
import AdminActivations from './pages/AdminActivations'
import AdminBenevoles from './pages/AdminBenevoles'
import { ComingSoon } from './pages/ComingSoon'
import { HelpCenter } from './pages/HelpCenter'
import { NotFound } from './pages/NotFound'
import DebugRoles from './pages/DebugRoles'
import CancelRegistration from './pages/CancelRegistration'
import TrainingRespond from './pages/TrainingRespond'
import { Classements } from './pages/Classements'
import { Documents } from './pages/Documents'
import { AdminDocuments } from './pages/AdminDocuments'
import AdminGalleries from './pages/AdminGalleries'
import AdminGalleryDetail from './pages/AdminGalleryDetail'
import Gallery from './pages/Gallery'
import GalleryAlbum from './pages/GalleryAlbum'
import AdminGroupements from './pages/AdminGroupements'
import PublicInscription from './pages/PublicInscription'
import PublicEventRegistration from './pages/PublicEventRegistration'
import AdminInscriptions from './pages/AdminInscriptions'
import AdminInscriptionValidation from './pages/AdminInscriptionValidation'
import Styleguide from './pages/Styleguide'
import Styleguide2 from './pages/Styleguide2'
import Organisation from './pages/Organisation'
import OrganisationEventDetail from './pages/OrganisationEventDetail'
import EventCommitteeRegistration from './pages/EventCommitteeRegistration'
import { FinanceRouteGuard } from './components/FinanceRouteGuard'
import { MfaGuard } from './components/MfaGuard'
import NotificationsRedirect from './pages/NotificationsRedirect'
import { InstallHelp } from './pages/InstallHelp'
import CommitteeMobileAnnuaire from './pages/CommitteeMobileAnnuaire'
import CommitteeMobileInscriptions from './pages/CommitteeMobileInscriptions'
import CommitteeMobileActivations from './pages/CommitteeMobileActivations'
import CommitteeMobileExpenses from './pages/CommitteeMobileExpenses'
import CommitteeMobileSupport from './pages/CommitteeMobileSupport'
import CommitteeMobileFinances from './pages/CommitteeMobileFinances'
import CommitteeMobileFacturation from './pages/CommitteeMobileFacturation'
import CommitteeMobileEvents from './pages/CommitteeMobileEvents'
import CommitteeMobileSeances from './pages/CommitteeMobileSeances'
import CommitteeMobileSponsors from './pages/CommitteeMobileSponsors'
import CommitteeMobileEquipes from './pages/CommitteeMobileEquipes'
import CommitteeMobileDocuments from './pages/CommitteeMobileDocuments'
import CommitteeMobileNews from './pages/CommitteeMobileNews'
import Polls from './pages/Polls'
import PollDetailPage from './pages/PollDetail'
import PollCreate from './pages/PollCreate'

function CalendrierSwitch() {
  const activeView = useActiveNavView()
  if (activeView === 'admin') return <CommitteeMobileCalendar key="admin-cal" />
  return <Calendrier key="member-cal" />
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/auth/confirm" element={<AuthConfirm />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/register/coach" element={<CoachRegistration />} />
          <Route path="/register/admin" element={<AdminRegistration />} />
          <Route path="/register/invite" element={<InviteRegistration />} />
          <Route path="/register/event-committee" element={<EventCommitteeRegistration />} />
          <Route path="/events/cancel-registration" element={<CancelRegistration />} />
          <Route path="/training/:session_id/respond" element={<TrainingRespond />} />
          <Route path="/inscription/:slug" element={<PublicInscription />} />
          <Route path="/evenement/:slug" element={<PublicEventRegistration />} />
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <Onboarding />
              </ProtectedRoute>
            }
          />

          <Route
            element={
              <ProtectedRoute>
                <MfaGuard>
                  <Layout />
                </MfaGuard>
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/mon-profil/coach" element={<CoachProfile />} />
            <Route path="/mon-profil/joueur" element={<PlayerProfile />} />
            <Route path="/mon-profil/player" element={<Navigate to="/mon-profil/joueur" replace />} />
            <Route path="/mon-profil/parent" element={<ParentProfile />} />
            <Route path="/mon-profil" element={<AdminProfile />} />
            <Route path="/mon-profil/notifications" element={<NotificationsRedirect />} />
            <Route path="/aide/installer" element={<InstallHelp />} />
            <Route path="/mon-equipe" element={<ParentTeams />} />
            <Route path="/mes-equipes" element={<CoachTeams />} />
            <Route path="/mes-equipes/:teamId/joueurs" element={<CoachTeamPlayers />} />
            <Route path="/mes-equipes/presences/:teamId" element={<TeamAttendance />} />
            <Route path="/coach-presences" element={<CoachPresences />} />
            <Route path="/notes-de-frais" element={<CoachExpenses />} />
            <Route path="/admin/equipes/presences/:teamId" element={<TeamAttendance />} />
            <Route path="/annuaire/joueurs" element={<AdminAnuaireJoueurs />} />
            <Route path="/news" element={<News />} />
            <Route path="/news/:id" element={<AdminNews />} />
            <Route path="/events" element={<Events />} />
            <Route path="/events/:id" element={<EventDetail />} />
            <Route path="/vie-du-club" element={<VieDuClub />} />
            <Route path="/benevoles" element={<Volunteers />} />
            <Route path="/benevoles/:id" element={<VolunteerDetail />} />
            <Route path="/comite/annuaire" element={<CommitteeMobileAnnuaire />} />
            <Route path="/comite/inscriptions" element={<CommitteeMobileInscriptions />} />
            <Route path="/comite/activations" element={<CommitteeMobileActivations />} />
            <Route path="/comite/depenses" element={<CommitteeMobileExpenses />} />
            <Route path="/comite/support" element={<CommitteeMobileSupport />} />
            <Route path="/comite/finances" element={<CommitteeMobileFinances />} />
            <Route path="/comite/facturation" element={<CommitteeMobileFacturation />} />
            <Route path="/comite/actualites" element={<CommitteeMobileNews />} />
            <Route path="/comite/evenements" element={<CommitteeMobileEvents />} />
            <Route path="/comite/seances" element={<CommitteeMobileSeances />} />
            <Route path="/comite/sponsors" element={<CommitteeMobileSponsors />} />
            <Route path="/comite/equipes" element={<CommitteeMobileEquipes />} />
            <Route path="/comite/documents" element={<CommitteeMobileDocuments />} />
            <Route path="/annuaire" element={<Navigate to="/annuaire-club" replace />} />
            <Route path="/annuaire-club" element={<AnnuaireMember />} />
            <Route path="/organisation" element={<Organisation />} />
            <Route path="/organisation/:eventId" element={<OrganisationEventDetail />} />
            <Route path="/admin/events" element={<AdminEvents />} />
            <Route path="/admin/evenements/:id" element={<AdminEventDetail />} />
            <Route path="/admin/news" element={<AdminNewsList />} />
            <Route path="/admin/actualites" element={<AdminNewsList />} />
            <Route path="/admin/actualites/:id" element={<AdminNews />} />
            <Route path="/admin/theme" element={<AdminTheme />} />
            <Route path="/admin/utilisateurs" element={<AdminUsers />} />
            <Route path="/admin/activations" element={<AdminActivations />} />
            <Route path="/admin/equipes" element={<AdminTeams />} />
            <Route path="/admin/entraineurs" element={<AdminCoaches />} />
            <Route path="/admin/qualifications" element={<AdminQualifications />} />
            <Route path="/admin/annuaire/joueurs" element={<AdminAnuaireJoueurs />} />
            <Route path="/admin/inscriptions" element={<AdminInscriptions />} />
            <Route path="/admin/inscriptions/:id/validate" element={<AdminInscriptionValidation />} />
            <Route path="/admin/annuaire/club" element={<AdminAnuaireClub />} />
            <Route path="/admin/sponsors" element={<AdminSponsors />} />
            <Route path="/admin/benevoles" element={<AdminBenevoles />} />
            <Route path="/admin/declaration-partants" element={<AdminDeclarationPartants />} />
            <Route path="/admin/teams" element={<AdminTeams />} />
            <Route path="/admin/categories" element={<AdminCategories />} />
            <Route path="/admin/terrains" element={<AdminTerrains />} />
            <Route path="/admin/entrainements" element={<AdminEntrainements />} />
            <Route path="/admin/pv-seances" element={<AdminPVSeances />} />
            <Route path="/admin/pv-seances/:id" element={<AdminPVSeanceDetail />} />
            <Route path="/admin/js-presences" element={<AdminJSPresences />} />
            <Route path="/admin/js-presences-old" element={<AdminJSPresencesOld />} />
            <Route path="/admin/finances" element={<FinanceRouteGuard><Navigate to="/admin/finances/dashboard" replace /></FinanceRouteGuard>} />
            <Route path="/admin/factures" element={<FinanceRouteGuard><Navigate to="/admin/finances/dashboard" replace /></FinanceRouteGuard>} />
            <Route path="/admin/finances/dashboard" element={<FinanceRouteGuard><AdminFinancesDashboardCharts /></FinanceRouteGuard>} />
            <Route path="/admin/finances/config" element={<FinanceRouteGuard><AdminFinancesConfig /></FinanceRouteGuard>} />
            <Route path="/admin/finances/saisons" element={<FinanceRouteGuard><AdminFinancesSaisons /></FinanceRouteGuard>} />
            <Route path="/admin/finances/situation" element={<FinanceRouteGuard><AdminFinancesSituation /></FinanceRouteGuard>} />
            <Route path="/admin/finances/facturation" element={<FinanceRouteGuard><AdminFinancesFacturation /></FinanceRouteGuard>} />
            <Route path="/admin/finances/factures" element={<FinanceRouteGuard><AdminFinancesDashboard /></FinanceRouteGuard>} />
            <Route path="/admin/finances/depenses" element={<FinanceRouteGuard><AdminDepenses /></FinanceRouteGuard>} />
            <Route path="/admin/parametres-club" element={<AdminClubSettings />} />
            <Route path="/admin/site-internet" element={<AdminSiteInternet />} />
            <Route path="/teams" element={<Teams />} />
            <Route path="/equipes" element={<Teams />} />
            <Route path="/terrains" element={<Terrains />} />
            <Route path="/planning" element={<Terrains />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/admin/matchs" element={<AdminMatches />} />
            <Route path="/planning-matchs" element={<MatchSchedule />} />
            <Route path="/calendrier" element={<CalendrierSwitch />} />
            <Route path="/galerie" element={<Gallery />} />
            <Route path="/galerie/:id" element={<GalleryAlbum />} />
            <Route path="/matchs/:matchId" element={<MatchDetail />} />
            <Route path="/admin/notifications" element={<AdminNotificationConfig />} />
            <Route path="/classements" element={<Classements />} />
            <Route path="/sondages" element={<Polls />} />
            <Route path="/sondages/nouveau" element={<PollCreate />} />
            <Route path="/sondages/:id" element={<PollDetailPage />} />
            <Route path="/sondages/:id/modifier" element={<PollCreate />} />
            <Route path="/people" element={<ComingSoon />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/admin/documents" element={<AdminDocuments />} />
            <Route path="/admin/galeries" element={<AdminGalleries />} />
            <Route path="/admin/galeries/:id" element={<AdminGalleryDetail />} />
            <Route path="/admin/groupements" element={<AdminGroupements />} />
            <Route path="/aide" element={<HelpCenter />} />
            <Route path="/admin" element={<ComingSoon />} />
            <Route path="/debug-roles" element={<DebugRoles />} />
            <Route path="/styleguide" element={<Styleguide />} />
            <Route path="/styleguide2" element={<Styleguide2 />} />
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </Router>
  )
}

export default App
