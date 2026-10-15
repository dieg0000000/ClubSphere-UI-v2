import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CircleAlert as AlertCircle, ShieldCheck, Loader2, Check, X } from 'lucide-react';
import { invokeFunction } from '../lib/invokeFunction';
import { useTheme } from '../context/ThemeContext';
import PasswordInput from '../components/PasswordInput';
import { passwordLongEnough, mapPasswordAuthError, PasswordLengthHint, PasswordMismatchHint } from '../components/PasswordChecklist';
import { translateAuthError } from '../utils/authErrorMessages';
import { TermsCheckbox } from '../components/TermsCheckbox';

interface InviteInfo {
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  role_label: string;
  club_name: string;
  password_rules: string;
}

type PageState =
  | { kind: 'loading' }
  | { kind: 'ready'; info: InviteInfo }
  | { kind: 'error'; message: string }
  | { kind: 'success'; email: string };

export default function InviteRegistration() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const token = searchParams.get('token');

  const [pageState, setPageState] = useState<PageState>({ kind: 'loading' });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [passwordErrors, setPasswordErrors] = useState<string[] | null>(null);
  const [termsChecked, setTermsChecked] = useState(false);

  useEffect(() => {
    if (!token) {
      setPageState({ kind: 'error', message: 'Lien invalide' });
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error: fnErr } = await invokeFunction('register-invite', {
        method: 'POST',
        body: { token },
      });
      if (cancelled) return;
      if (fnErr || data?.error) {
        setPageState({ kind: 'error', message: data?.error || fnErr || 'Lien invalide' });
      } else if (data?.success) {
        setPageState({ kind: 'ready', info: data as InviteInfo });
      } else {
        setPageState({ kind: 'error', message: 'Réponse inattendue du serveur.' });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const passwordValid = passwordLongEnough(password);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const canSubmit = passwordValid && passwordsMatch && termsChecked && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || pageState.kind !== 'ready') return;
    if (!passwordsMatch) return;
    setLoading(true);
    setFieldError(null);
    setPasswordErrors(null);

    const { data, error: fnErr } = await invokeFunction('register-invite', {
      method: 'POST',
      body: { token, password },
    });
    setLoading(false);

    if (fnErr || data?.error) {
      const raw = data?.error || fnErr || '';
      const mapped = mapPasswordAuthError(raw);
      if (mapped) setPasswordErrors(mapped);
      else setFieldError(translateAuthError(raw));
      return;
    }
    if (data?.success) {
      setPageState({ kind: 'success', email: data.email || (pageState as any).info?.email || '' });
    } else {
      setFieldError('Réponse inattendue du serveur.');
    }
  }

  if (pageState.kind === 'loading') {
    return (
      <PageShell>
        <Card>
          <div className="flex flex-col items-center justify-center py-10">
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent)' }} />
            <p className="mt-4 text-sm" style={{ color: 'var(--text-secondary)' }}>Chargement de l'invitation...</p>
          </div>
        </Card>
      </PageShell>
    );
  }

  if (pageState.kind === 'error') {
    return (
      <PageShell>
        <Card>
          <ClubBranding theme={theme} />
          <div className="flex items-center gap-3 mb-4" style={{ color: 'var(--danger-text)' }}>
            <AlertCircle size={24} />
            <h1 className="text-xl font-bold">Invitation invalide</h1>
          </div>
          <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>{pageState.message}</p>
          <button
            onClick={() => navigate('/login')}
            className="w-full px-4 py-3 font-medium rounded-lg transition-colors"
            style={{ background: 'var(--grad)', color: 'var(--text-inverse)' }}
          >
            Aller à la page de connexion
          </button>
        </Card>
      </PageShell>
    );
  }

  if (pageState.kind === 'success') {
    return (
      <PageShell>
        <Card>
          <ClubBranding theme={theme} />
          <div className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'var(--success-soft)' }}>
              <ShieldCheck size={32} style={{ color: 'var(--success-text)' }} />
            </div>
            <h1 className="text-xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
              Votre compte est activé
            </h1>
            <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
              Vous pouvez maintenant vous connecter avec votre adresse e-mail et le mot de passe que vous venez de choisir.
            </p>
            <button
              onClick={() => navigate(`/login?email=${encodeURIComponent(pageState.email)}`)}
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

  const { info } = pageState;

  return (
    <PageShell>
      <Card>
        <ClubBranding theme={theme} />

        <div className="text-center mb-6">
          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Bienvenue, {info.first_name} !
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {info.club_name} vous ouvre un accès <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>{info.role_label}</span> à ClubSphère.
            Choisissez votre mot de passe pour activer votre compte.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Email
            </label>
            <input
              type="email"
              value={info.email}
              readOnly
              className="w-full px-4 py-3 rounded-lg focus:outline-none"
              style={{
                background: 'var(--bg-app)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-muted)',
                cursor: 'default',
              }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Mot de passe
            </label>
            <PasswordInput
              value={password}
              onChange={(e) => { setPassword(e.target.value); setFieldError(null); setPasswordErrors(null); }}
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
              onChange={(e) => { setConfirmPassword(e.target.value); setFieldError(null); }}
              className="w-full px-4 py-3 rounded-lg focus:outline-none focus:ring-2"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--accent)' } as React.CSSProperties}
              placeholder="Retapez votre mot de passe"
              required
              disabled={loading}
            />
            <PasswordMismatchHint password={password} confirmPassword={confirmPassword} />
          </div>

          <TermsCheckbox checked={termsChecked} onChange={setTermsChecked} disabled={loading} />

          {fieldError && (
            <div className="p-4 rounded-lg" style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger)' }}>
              <div className="flex items-start gap-3">
                <AlertCircle size={20} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--danger-text)' }} />
                <p className="text-sm" style={{ color: 'var(--danger-text)' }}>{fieldError}</p>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full px-4 py-3 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: canSubmit ? 'var(--grad)' : undefined,
              backgroundColor: canSubmit ? undefined : 'var(--border-color)',
              color: canSubmit ? 'var(--text-inverse)' : 'var(--text-muted)',
            }}
          >
            {loading ? 'Activation en cours...' : 'Activer mon compte'}
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
      <p className="text-xs mt-1 flex items-center gap-1 justify-center" style={{ color: 'var(--text-muted)' }}>Propulsé par <img src="https://zkprbqayjqfeixrjhadc.supabase.co/storage/v1/object/public/club-assets/branding/clubsphere-wordmark.png" alt="ClubSphère" style={{ height: 20, width: 'auto' }} /></p>
    </div>
  );
}
