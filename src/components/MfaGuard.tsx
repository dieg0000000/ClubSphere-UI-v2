import { useState } from 'react';
import { useMfaStatus } from '../hooks/useMfaStatus';
import { MfaChallengeScreen } from './MfaChallengeScreen';
import { MfaEnrollmentScreen } from './MfaEnrollmentScreen';

interface MfaGuardProps {
  children: React.ReactNode;
}

export function MfaGuard({ children }: MfaGuardProps) {
  const mfa = useMfaStatus();
  const [challengePassed, setChallengePassed] = useState(false);
  const [enrollmentDone, setEnrollmentDone] = useState(false);

  if (mfa.loading) {
    return <>{children}</>;
  }

  if (!mfa.isConcerned) {
    return <>{children}</>;
  }

  if (mfa.needsChallenge && !challengePassed) {
    return <MfaChallengeScreen onVerified={() => setChallengePassed(true)} />;
  }

  if (mfa.graceExpired && !mfa.hasVerifiedFactor && !enrollmentDone) {
    return <MfaEnrollmentScreen onEnrolled={() => setEnrollmentDone(true)} />;
  }

  return <>{children}</>;
}
