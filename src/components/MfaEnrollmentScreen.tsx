import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Shield, CircleCheck as CheckCircle } from 'lucide-react';
import { Alert } from './ui/Alert';
import Button from './ui/Button';
import CopyIconButton from './CopyIconButton';

interface MfaEnrollmentScreenProps {
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

export function MfaEnrollmentScreen({ onEnrolled }: MfaEnrollmentScreenProps) {
  const [step, setStep] = useState<'intro' | 'qr' | 'verify' | 'success'>('intro');
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
      setTimeout(() => onEnrolled(), 1500);
    } catch (err: any) {
      setError(formatMfaError(err?.message || 'Erreur lors de la verification'));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && code.length === 6) {
      verifyCode();
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-page)',
      padding: '24px',
      overflow: 'auto',
    }}>
      <div style={{
        width: '100%', maxWidth: '440px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        padding: '32px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '50%',
            background: 'var(--warning-soft)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <Shield size={28} style={{ color: 'var(--warning)' }} />
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
            Authentification a deux facteurs obligatoire
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
            L'authentification a deux facteurs est desormais obligatoire pour votre role.
            Configurez-la pour continuer.
          </p>
        </div>

        {step === 'intro' && (
          <div style={{ display: 'grid', gap: '16px' }}>
            <Alert variant="warning">
              Vous devez activer la 2FA avant de pouvoir acceder a l'administration.
            </Alert>
            <Button variant="primary" onClick={startEnrollment} loading={loading} style={{ width: '100%' }} size="lg">
              Commencer la configuration
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
              Scannez ce QR code avec votre application d'authentification
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
            <Button variant="primary" onClick={() => setStep('verify')} style={{ width: '100%' }}>
              Suivant
            </Button>
          </div>
        )}

        {step === 'verify' && (
          <div style={{ display: 'grid', gap: '16px' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
              Entrez le code a 6 chiffres de votre application :
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={handleKeyDown}
              placeholder="000000"
              style={{
                width: '100%',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '14px',
                color: 'var(--text-primary)',
                fontSize: '28px',
                fontWeight: 600,
                textAlign: 'center',
                letterSpacing: '10px',
              }}
            />
            {error && (
              <div>
                <Alert variant="danger">{error.message}</Alert>
                {error.detail && <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '4px' }}>{error.detail}</p>}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <Button variant="secondary" onClick={() => { setStep('qr'); setCode(''); setError(null); }} style={{ flex: 1 }}>
                Retour
              </Button>
              <Button variant="primary" onClick={verifyCode} loading={loading} disabled={code.length !== 6} style={{ flex: 2 }}>
                Verifier
              </Button>
            </div>
          </div>
        )}

        {step === 'success' && (
          <Alert variant="success" icon={<CheckCircle size={18} />} title="2FA activee">
            Authentification a deux facteurs configuree avec succes.
          </Alert>
        )}

        <p style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center', marginTop: '16px', margin: '16px 0 0 0' }}>
          Telephone perdu ? Contactez le support ClubSphere.
        </p>
      </div>
    </div>
  );
}
