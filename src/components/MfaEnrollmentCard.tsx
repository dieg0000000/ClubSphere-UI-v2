import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Shield, CircleCheck as CheckCircle } from 'lucide-react';
import { Alert } from './ui/Alert';
import Button from './ui/Button';
import { StatusPill } from './ui/StatusPill';
import CopyIconButton from './CopyIconButton';

interface MfaEnrollmentCardProps {
  hasVerifiedFactor: boolean;
  onEnrolled: () => void;
}

async function cleanupUnverifiedFactors() {
  const { data } = await supabase.auth.mfa.listFactors();
  if (!data?.totp) return;
  for (const f of data.totp) {
    if ((f.status as string) === 'unverified') {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }
}

function friendlyName() {
  return `ClubSphere ${new Date().toISOString().slice(0, 10)}`;
}

function formatMfaError(detail: string): { message: string; detail: string } {
  return {
    message: "Impossible d'activer la double authentification. Reessayez ou contactez le support.",
    detail,
  };
}

export function MfaEnrollmentCard({ hasVerifiedFactor, onEnrolled }: MfaEnrollmentCardProps) {
  const [step, setStep] = useState<'idle' | 'qr' | 'verify' | 'success'>('idle');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const verifiedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (factorId && !verifiedRef.current) {
        supabase.auth.mfa.unenroll({ factorId });
      }
    };
  }, [factorId]);

  const startEnrollment = async () => {
    setError(null);
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setError({ message: 'Session expiree. Veuillez vous reconnecter.' });
        return;
      }

      await cleanupUnverifiedFactors();

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: friendlyName(),
      });

      if (enrollError) {
        setError(formatMfaError(enrollError.message));
        return;
      }

      if (!data || !data.totp) {
        setError({ message: 'Reponse inattendue du serveur. Veuillez reessayer.' });
        return;
      }

      const svgContent = data.totp.qr_code;
      const qrUrl = svgContent.startsWith('data:')
        ? svgContent
        : `data:image/svg+xml;utf-8,${encodeURIComponent(svgContent)}`;

      verifiedRef.current = false;
      setQrCode(qrUrl);
      setSecret(data.totp.secret);
      setFactorId(data.id);
      setStep('qr');
    } catch (err: any) {
      setError(formatMfaError(err?.message || 'Erreur inattendue'));
    } finally {
      setLoading(false);
    }
  };

  const cancelEnrollment = async () => {
    if (factorId && !verifiedRef.current) {
      await supabase.auth.mfa.unenroll({ factorId });
    }
    setFactorId('');
    setQrCode('');
    setSecret('');
    setCode('');
    setError(null);
    setStep('idle');
  };

  const verifyCode = async () => {
    if (code.length !== 6) {
      setError({ message: 'Le code doit contenir 6 chiffres' });
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (challengeError) {
        setError(formatMfaError(challengeError.message));
        return;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code,
      });
      if (verifyError) {
        setError({ message: 'Code invalide' });
        return;
      }

      verifiedRef.current = true;
      setStep('success');
      onEnrolled();
    } catch (err: any) {
      setError(formatMfaError(err?.message || 'Erreur lors de la verification'));
    } finally {
      setLoading(false);
    }
  };

  if (hasVerifiedFactor && step !== 'success') {
    return (
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        padding: '24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <Shield size={20} style={{ color: 'var(--accent)' }} />
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            Securite
          </h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <StatusPill variant="green">2FA active</StatusPill>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '12px', margin: '12px 0 0 0' }}>
          Telephone perdu ? Contactez le support ClubSphere.
        </p>
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: '12px',
      padding: '24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <Shield size={20} style={{ color: 'var(--accent)' }} />
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          Securite
        </h3>
      </div>

      {step === 'idle' && (
        <div style={{ display: 'grid', gap: '16px' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
            Protegez votre compte avec l'authentification a deux facteurs (TOTP).
          </p>
          <Button variant="primary" onClick={startEnrollment} loading={loading}>
            Activer l'authentification a deux facteurs
          </Button>
          {error && (
            <div>
              <Alert variant="danger">{error.message}</Alert>
              {error.detail && <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '4px' }}>{error.detail}</p>}
            </div>
          )}
        </div>
      )}

      {step === 'qr' && (
        <div style={{ display: 'grid', gap: '16px' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
            Scannez ce QR code avec votre application d'authentification (Google Authenticator, Authy, etc.)
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px', background: 'var(--bg-card)', borderRadius: '8px', width: 'fit-content', margin: '0 auto' }}>
            <img src={qrCode} alt="QR Code TOTP" style={{ width: '200px', height: '200px' }} />
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '6px' }}>
              ou saisissez ce code manuellement :
            </p>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: 'var(--bg-input)', border: '1px solid var(--border-color)',
              borderRadius: '8px', padding: '8px 12px',
            }}>
              <code style={{ fontSize: '13px', color: 'var(--text-primary)', fontFamily: 'monospace', wordBreak: 'break-all', flex: 1 }}>
                {secret}
              </code>
              <CopyIconButton value={secret} label="code secret" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Button variant="secondary" onClick={cancelEnrollment} style={{ flex: 1 }}>
              Annuler
            </Button>
            <Button variant="primary" onClick={() => setStep('verify')} style={{ flex: 2 }}>
              Suivant
            </Button>
          </div>
        </div>
      )}

      {step === 'verify' && (
        <div style={{ display: 'grid', gap: '16px' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
            Entrez le code a 6 chiffres affiche par votre application :
          </p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            style={{
              width: '100%',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '12px',
              color: 'var(--text-primary)',
              fontSize: '24px',
              fontWeight: 600,
              textAlign: 'center',
              letterSpacing: '8px',
            }}
          />
          {error && (
            <div>
              <Alert variant="danger">{error.message}</Alert>
              {error.detail && <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '4px' }}>{error.detail}</p>}
            </div>
          )}
          <div style={{ display: 'flex', gap: '10px' }}>
            <Button variant="secondary" onClick={cancelEnrollment} style={{ flex: 1 }}>
              Annuler
            </Button>
            <Button variant="primary" onClick={verifyCode} loading={loading} disabled={code.length !== 6} style={{ flex: 2 }}>
              Verifier
            </Button>
          </div>
        </div>
      )}

      {step === 'success' && (
        <Alert variant="success" icon={<CheckCircle size={18} />} title="2FA activee">
          L'authentification a deux facteurs est maintenant active sur votre compte.
        </Alert>
      )}
    </div>
  );
}
