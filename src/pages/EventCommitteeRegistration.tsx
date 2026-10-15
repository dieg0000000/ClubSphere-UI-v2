import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CircleAlert as AlertCircle, Users } from 'lucide-react';
import { invokeFunction } from '../lib/invokeFunction';
import { useTheme } from '../context/ThemeContext';
import PasswordInput from '../components/PasswordInput';
import { passwordLongEnough, mapPasswordAuthError, PasswordLengthHint, PasswordMismatchHint } from '../components/PasswordChecklist';
import { TermsCheckbox } from '../components/TermsCheckbox';

type ResultState =
  | { kind: 'created'; event_title: string }
  | { kind: 'existing' }
  | { kind: 'error'; message: string };

export default function EventCommitteeRegistration() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const token = searchParams.get('token');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null);
  const [passwordErrors, setPasswordErrors] = useState<string[] | null>(null);
  const [termsChecked, setTermsChecked] = useState(false);

  const passwordValid = passwordLongEnough(password);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const canSubmit = firstName.trim().length > 0 && lastName.trim().length > 0 && passwordValid && passwordsMatch && termsChecked && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !token) return;
    setLoading(true);
    setResult(null);
    setPasswordErrors(null);

    const { data, error: fnErr } = await invokeFunction('register-event-committee', {
      method: 'POST',
      body: { token, password, first_name: firstName.trim(), last_name: lastName.trim(), ...(phone.trim() ? { phone: phone.trim() } : {}) },
    });

    setLoading(false);

    if (fnErr || data?.error) {
      const mapped = mapPasswordAuthError(data?.error || fnErr);
      if (mapped) setPasswordErrors(mapped);
      else setResult({ kind: 'error', message: data?.error || fnErr || "Erreur lors de la création du compte." });
      return;
    }

    if (data?.success && data?.already_had_account) {
      setResult({ kind: 'existing' });
    } else if (data?.success) {
      setResult({ kind: 'created', event_title: data.event_title || '' });
    } else {
      setResult({ kind: 'error', message: "Réponse inattendue du serveur." });
    }
  }

  if (!token) {
    return (
      <PageShell>
        <Card>
          <div className="flex items-center gap-3 mb-4" style={{ color: 'var(--danger-text)' }}>
            <AlertCircle size={24} />
            <h1 className="text-xl font-bold">Lien d'invitation invalide</h1>
          </div>
          <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
            Lien d'invitation invalide.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="w-full px-4 py-3 font-medium rounded-lg transition-colors"
            style={{ background: 'var(--grad)', color: 'var(--text-inverse)' }}
          >
            Retour à la connexion
          </button>
        </Card>
      </PageShell>
    );
  }

  if (result && result.kind !== 'error') {
    return (
      <PageShell>
        <Card>
          <ClubBranding theme={theme} />
          <div className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'var(--success-soft)' }}>
              <Users size={32} style={{ color: 'var(--success-text)' }} />
            </div>
            {result.kind === 'existing' ? (
              <>
                <h1 className="text-xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                  Accès activé
                </h1>
                <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
                  Votre compte existait déjà — connectez-vous, votre accès au comité d'organisation est déjà actif.
                </p>
              </>
            ) : (
              <>
                <h1 className="text-xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                  Compte créé !
                </h1>
                <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
                  Votre compte est créé ! Vous faites partie du comité d'organisation de « {result.event_title} ».
                </p>
              </>
            )}
            <button
              onClick={() => navigate('/login')}
              className="w-full px-4 py-3 font-medium rounded-lg transition-colors"
              style={{ background: 'var(--grad)', color: 'var(--text-inverse)' }}
            >
              Se connecter
            </button>
          </div>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Card>
        <ClubBranding theme={theme} />

        <div className="text-center mb-6">
          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Rejoindre le comité d'organisation
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Créez votre compte pour rejoindre le comité d'organisation.
          </p>
        </div>

        {result?.kind === 'error' && (
          <div className="mb-5 p-4 rounded-lg" style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger)' }}>
            <div className="flex items-start gap-3">
              <AlertCircle size={20} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--danger-text)' }} />
              <p className="text-sm" style={{ color: 'var(--danger-text)' }}>{result.message}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Prénom
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-4 py-3 rounded-lg focus:outline-none focus:ring-2"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--accent)' } as React.CSSProperties}
                placeholder="Prénom"
                required
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Nom
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-4 py-3 rounded-lg focus:outline-none focus:ring-2"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--accent)' } as React.CSSProperties}
                placeholder="Nom"
                required
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Téléphone <span style={{ color: 'var(--text-muted)' }} className="font-normal">(optionnel)</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-3 rounded-lg focus:outline-none focus:ring-2"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--accent)' } as React.CSSProperties}
              placeholder="+41 79 123 45 67"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Mot de passe
            </label>
            <PasswordInput
              value={password}
              onChange={(e) => { setPassword(e.target.value); setPasswordErrors(null); }}
              className="w-full px-4 py-3 rounded-lg focus:outline-none focus:ring-2"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--accent)' } as React.CSSProperties}
              placeholder="Mot de passe"
              required
              disabled={loading}
            />
            <PasswordLengthHint password={password} errors={passwordErrors} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Confirmer le mot de passe
            </label>
            <PasswordInput
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg focus:outline-none focus:ring-2"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--accent)' } as React.CSSProperties}
              placeholder="Retapez votre mot de passe"
              required
              disabled={loading}
            />
            <PasswordMismatchHint password={password} confirmPassword={confirmPassword} />
          </div>

          <TermsCheckbox checked={termsChecked} onChange={setTermsChecked} disabled={loading} />

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full px-4 py-3 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: canSubmit ? 'var(--grad)' : undefined,
              backgroundColor: canSubmit ? undefined : 'var(--border-color)',
              color: 'var(--text-inverse)',
            }}
          >
            {loading ? 'Création en cours...' : 'Créer mon compte'}
          </button>
        </form>

        <div className="mt-5 text-center">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Vous avez déjà un compte ?{' '}
            <button
              onClick={() => navigate('/login')}
              className="font-medium transition-colors"
              style={{ color: 'var(--accent)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--accent)')}
            >
              Se connecter
            </button>
          </p>
        </div>
      </Card>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-app)' }}>
      {children}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-8 max-w-md w-full" style={{ background: 'var(--bg-card)', borderRadius: '22px', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border-color)' }}>
      {children}
    </div>
  );
}

function ClubBranding({ theme }: { theme: { name: string; logoUrl: string } }) {
  return (
    <div className="text-center mb-6">
      {theme.logoUrl ? (
        <img
          src={theme.logoUrl}
          alt={theme.name}
          className="h-16 w-auto mx-auto mb-3 object-contain"
        />
      ) : (
        <div
          className="mx-auto mb-3 w-16 h-16 rounded-full flex items-center justify-center font-bold text-xl"
          style={{ background: 'var(--grad)', color: 'var(--text-inverse)' }}
        >
          {theme.name?.[0] || 'C'}
        </div>
      )}
      <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{theme.name}</h2>
      <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>Propulsé par <img src="https://zkprbqayjqfeixrjhadc.supabase.co/storage/v1/object/public/club-assets/branding/clubsphere-wordmark.png" alt="ClubSphère" style={{ height: 20, width: 'auto' }} /></p>
    </div>
  );
}
