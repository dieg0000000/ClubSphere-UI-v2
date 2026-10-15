import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const MFA_ROLES = ['admin', 'president', 'vice_president', 'committee'];

interface MfaStatus {
  loading: boolean;
  isConcerned: boolean;
  hasVerifiedFactor: boolean;
  currentLevel: string | null;
  nextLevel: string | null;
  needsChallenge: boolean;
  graceDeadline: Date | null;
  graceExpired: boolean;
  refresh: () => Promise<void>;
}

export function useMfaStatus(): MfaStatus {
  const { user, effectiveRole, rolesLoading, isPlatformAdmin, platformAdminLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [hasVerifiedFactor, setHasVerifiedFactor] = useState(false);
  const [currentLevel, setCurrentLevel] = useState<string | null>(null);
  const [nextLevel, setNextLevel] = useState<string | null>(null);
  const [graceDeadline, setGraceDeadline] = useState<Date | null>(null);

  const concernedByRole = !!effectiveRole && MFA_ROLES.includes(effectiveRole);
  const isConcerned = concernedByRole || isPlatformAdmin;

  const allReady = !rolesLoading && !platformAdminLoading;

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    if (!allReady) return;

    if (!isConcerned) {
      setLoading(false);
      setHasVerifiedFactor(false);
      setCurrentLevel(null);
      setNextLevel(null);
      setGraceDeadline(null);
      return;
    }

    try {
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!mountedRef.current) return;

      if (aalData) {
        setCurrentLevel(aalData.currentLevel);
        setNextLevel(aalData.nextLevel);
        setHasVerifiedFactor(aalData.nextLevel === 'aal2');
      }

      // Platform admins get NO grace period - they must enroll immediately
      if (isPlatformAdmin) {
        if (!aalData || aalData.nextLevel !== 'aal2') {
          // Set deadline to past so graceExpired is immediately true
          setGraceDeadline(new Date(0));
        }
      } else if (!aalData || aalData.nextLevel !== 'aal2') {
        const { data: graceRow, error: selectError } = await supabase
          .from('mfa_grace_periods')
          .select('first_prompted_at')
          .eq('profile_id', user.id)
          .maybeSingle();

        if (!mountedRef.current) return;

        if (selectError) {
          console.error('[useMfaStatus] grace select error', selectError.message);
        }

        if (graceRow) {
          const deadline = new Date(graceRow.first_prompted_at);
          deadline.setDate(deadline.getDate() + 7);
          setGraceDeadline(deadline);
        } else if (!selectError) {
          const { error: insertError } = await supabase
            .from('mfa_grace_periods')
            .upsert(
              { profile_id: user.id, first_prompted_at: new Date().toISOString() },
              { onConflict: 'profile_id', ignoreDuplicates: true },
            );

          if (!mountedRef.current) return;

          const isExpectedConflict = insertError
            && (insertError.code === '23505' || insertError.code === '42501');
          if (insertError && !isExpectedConflict) {
            console.error('[useMfaStatus] grace insert error', insertError.message);
          }

          const { data: storedRow } = await supabase
            .from('mfa_grace_periods')
            .select('first_prompted_at')
            .eq('profile_id', user.id)
            .maybeSingle();

          if (!mountedRef.current) return;

          if (storedRow) {
            const deadline = new Date(storedRow.first_prompted_at);
            deadline.setDate(deadline.getDate() + 7);
            setGraceDeadline(deadline);
          }
        }
      }
    } catch (err) {
      console.error('[useMfaStatus]', err);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [user?.id, isConcerned, isPlatformAdmin, allReady]);

  useEffect(() => {
    if (!allReady) return;
    refresh();
  }, [refresh, allReady]);

  const needsChallenge = isConcerned && hasVerifiedFactor && currentLevel === 'aal1' && nextLevel === 'aal2';
  const graceExpired = isConcerned && !hasVerifiedFactor && graceDeadline !== null && new Date() >= graceDeadline;

  return {
    loading: loading || !allReady,
    isConcerned,
    hasVerifiedFactor,
    currentLevel,
    nextLevel,
    needsChallenge,
    graceDeadline,
    graceExpired,
    refresh,
  };
}
