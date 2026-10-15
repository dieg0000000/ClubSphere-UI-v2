import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ProfileLoading } from '../components/ProfileLayout';

export default function NotificationsRedirect() {
  const { clubRoles, rolesLoading } = useAuth();

  if (rolesLoading) return <ProfileLoading />;

  const path = clubRoles.includes('parent')
    ? '/mon-profil/parent'
    : clubRoles.includes('member')
    ? '/mon-profil/joueur'
    : clubRoles.includes('coach') || clubRoles.includes('assistant_coach')
    ? '/mon-profil/coach'
    : '/mon-profil';

  return <Navigate to={`${path}?tab=notifications`} replace />;
}
