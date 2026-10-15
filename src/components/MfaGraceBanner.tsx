import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMfaStatus } from '../hooks/useMfaStatus';
import { Alert } from './ui/Alert';
import Button from './ui/Button';

export function MfaGraceBanner() {
  const mfa = useMfaStatus();
  const navigate = useNavigate();
  const location = useLocation();
  const [dismissed, setDismissed] = useState(false);

  if (mfa.loading || !mfa.isConcerned || mfa.hasVerifiedFactor || dismissed) {
    return null;
  }

  const deadline = mfa.graceDeadline;
  const now = new Date();
  let daysLeft: number | null = null;
  if (deadline) {
    const diffMs = deadline.getTime() - now.getTime();
    daysLeft = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }

  const isUrgent = daysLeft !== null && daysLeft <= 2;
  const variant = isUrgent ? 'danger' : 'warning';

  const title = isUrgent
    ? `Dernier délai : l'authentification à deux facteurs devient obligatoire dans ${daysLeft} jour${daysLeft! > 1 ? 's' : ''}.`
    : daysLeft !== null
      ? `L'authentification à deux facteurs sera obligatoire dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}.`
      : `L'authentification à deux facteurs est requise pour votre rôle.`;

  const handleNavigate = () => {
    if (location.pathname === '/mon-profil') {
      const el = document.getElementById('mfa-security-card');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.outline = '2px solid var(--warning)';
        el.style.borderRadius = '14px';
        setTimeout(() => { el.style.outline = 'none'; }, 2500);
      }
    } else {
      navigate('/mon-profil');
      setTimeout(() => {
        const el = document.getElementById('mfa-security-card');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.style.outline = '2px solid var(--warning)';
          el.style.borderRadius = '14px';
          setTimeout(() => { el.style.outline = 'none'; }, 2500);
        }
      }, 400);
    }
  };

  return (
    <div style={{ marginBottom: '16px' }}>
      <Alert
        variant={variant}
        title={title}
        onClose={() => setDismissed(true)}
        action={
          <Button variant={variant === 'danger' ? 'destructive' : 'warning'} size="sm" onClick={handleNavigate}>
            Configurer la 2FA &rarr;
          </Button>
        }
      >
        Activez-la depuis votre profil pour éviter d'être bloqué.
      </Alert>
    </div>
  );
}
