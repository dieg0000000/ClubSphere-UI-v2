import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Shield } from 'lucide-react';
import { Alert } from './ui/Alert';
import Button from './ui/Button';

interface MfaChallengeScreenProps {
  onVerified: () => void;
}

export function MfaChallengeScreen({ onVerified }: MfaChallengeScreenProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (code.length !== 6) {
      setError('Le code doit contenir 6 chiffres');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp?.find(f => f.status === 'verified');
      if (!totp) {
        setError('Aucun facteur TOTP trouvé');
        setLoading(false);
        return;
      }

      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: totp.id,
      });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: totp.id,
        challengeId: challengeData.id,
        code,
      });
      if (verifyError) throw verifyError;

      onVerified();
    } catch (err: any) {
      setError(err.message || 'Code invalide');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && code.length === 6) {
      handleVerify();
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-page)',
      padding: '24px',
    }}>
      <div style={{
        width: '100%', maxWidth: '400px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        padding: '32px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '50%',
            background: 'var(--info-soft)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <Shield size={28} style={{ color: 'var(--info)' }} />
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
            Vérification en deux étapes
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
            Entrez le code à 6 chiffres de votre application d'authentification
          </p>
        </div>

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
            marginBottom: '16px',
          }}
        />

        {error && (
          <div style={{ marginBottom: '16px' }}>
            <Alert variant="danger">{error}</Alert>
          </div>
        )}

        <Button
          variant="primary"
          onClick={handleVerify}
          loading={loading}
          disabled={code.length !== 6}
          style={{ width: '100%' }}
          size="lg"
        >
          Vérifier
        </Button>

        <p style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center', marginTop: '16px', margin: '16px 0 0 0' }}>
          Téléphone perdu ? Contactez le support ClubSphere.
        </p>
      </div>
    </div>
  );
}
