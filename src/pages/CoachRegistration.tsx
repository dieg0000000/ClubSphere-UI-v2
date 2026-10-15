import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CircleAlert as AlertCircle, CircleCheck, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { invokeFunction } from '../lib/invokeFunction';
import Button from '../components/ui/Button';
import { TermsCheckbox } from '../components/TermsCheckbox';
import { recordSignupAcceptance } from '../lib/terms';
import PasswordInput from '../components/PasswordInput';
import { passwordLongEnough, mapPasswordAuthError, PasswordLengthHint, PasswordMismatchHint } from '../components/PasswordChecklist';
import { translateAuthError } from '../utils/authErrorMessages';

export default function CoachRegistration() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const isReset = searchParams.get('reset') === 'true';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [passwordErrors, setPasswordErrors] = useState<string[] | null>(null);
  const [info, setInfo] = useState('');
  const [success, setSuccess] = useState(false);
  const [coach, setCoach] = useState<any>(null);
  const [fetchingCoach, setFetchingCoach] = useState(true);
  const [termsChecked, setTermsChecked] = useState(false);

  useEffect(() => {
    const fetchCoach = async () => {
      if (!token) {
        setFetchingCoach(false);
        return;
      }

      const { data } = await supabase
        .rpc('get_coach_invite_info', { p_token: token });

      setCoach(data && data.length > 0 ? data[0] : null);
      setFetchingCoach(false);
    };

    fetchCoach();
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setPasswordErrors(null);
    if (!canSubmit) return;
    setLoading(true);

    try {

      const { data, error: fnError } = await invokeFunction('register-coach', {
        body: { token, password }
      });

      if (fnError || data?.error) {
        const passwordLines = mapPasswordAuthError(String(data?.error || fnError || ''));
        if (passwordLines) {
          setPasswordErrors(passwordLines);
          setLoading(false);
          return;
        }
        setError(translateAuthError(data?.error || fnError || ''));
        setLoading(false);
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: coach.email,
        password
      });

      if (!signInError) {
        await recordSignupAcceptance('coach_activation');
        navigate('/dashboard');
      } else {
        navigate('/login?registered=true&email=' + encodeURIComponent(coach.email));
      }
    } catch (err: any) {
      setError(translateAuthError(err));
      setLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setPasswordErrors(null);
    if (!canSubmit) return;
    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) {
        const passwordLines = mapPasswordAuthError(error.message);
        if (passwordLines) {
          setPasswordErrors(passwordLines);
          setLoading(false);
          return;
        }
        setError(translateAuthError(error as any));
        setLoading(false);
        return;
      }

      // Get current session to ensure user_id
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      console.log('Reset password - user_id:', userId);

      if (!userId) {
        setError('Session non trouvée');
        setLoading(false);
        return;
      }

      const { data: coachData, error: rpcError } = await supabase
        .rpc('complete_coach_password_reset', { p_token: token });

      if (rpcError) {
        setError('Une erreur est survenue lors de l\'activation.');
        setLoading(false);
        return;
      }

      const coachInfo = coachData && coachData.length > 0 ? coachData[0] : null;

      if (!coachInfo) {
        setError('Coach non trouvé');
        setLoading(false);
        return;
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          first_name: coachInfo.first_name,
          last_name: coachInfo.last_name,
          full_name: `${coachInfo.first_name} ${coachInfo.last_name}`,
          email: coachInfo.email,
          phone: coachInfo.phone || null,
          role: 'coach'
        }, { onConflict: 'id' });

      console.log('Profile error:', profileError);

      if (profileError) {
        setError('Erreur profil: ' + profileError.message);
        setLoading(false);
        return;
      }

      navigate('/dashboard');

    } catch (err: any) {
      setError(translateAuthError(err));
      setLoading(false);
    }
  }

  const canSubmit = passwordLongEnough(password) && password === confirmPassword && (isReset || termsChecked);

  if (fetchingCoach) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-app)' }}>
        <div className="rounded-[22px] p-8 max-w-md w-full" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-lg)' }}>
          <div className="text-center">
            <div className="animate-pulse mb-4" style={{ color: 'var(--text-muted)' }}>Chargement...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!token || !coach) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-app)' }}>
        <div className="rounded-[22px] p-8 max-w-md w-full" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-lg)' }}>
          <div className="flex items-center gap-3 mb-4" style={{ color: 'var(--danger-text)' }}>
            <AlertCircle size={24} />
            <h1 className="text-xl font-bold">Lien invalide</h1>
          </div>
          <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
            Lien invalide ou expiré. Contactez l'administrateur du club.
          </p>
          <Button
            variant="primary"
            onClick={() => navigate('/login')}
            className="w-full"
          >
            Retour à la connexion
          </Button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-app)' }}>
        <div className="rounded-[22px] p-8 max-w-md w-full" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-lg)' }}>
          <div className="text-center">
            <CircleCheck size={48} aria-hidden="true" style={{ color: 'var(--success)', margin: '0 auto 16px' }} />
            <h1 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Compte créé avec succès</h1>
            <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
              Vous allez être redirigé vers la page de connexion...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-app)' }}>
      <div className="rounded-[22px] p-8 max-w-md w-full" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-lg)' }}>
        <div className="text-center mb-8">
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-inverse)',
              fontWeight: '800',
              fontSize: '22px',
              margin: '0 auto 16px'
            }}
          >
            {coach.first_name?.[0]}{coach.last_name?.[0]}
          </div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Bonjour, {coach.first_name} {coach.last_name} !
          </h1>
          <p className="mb-2" style={{ color: 'var(--text-secondary)' }}>
            {isReset ? 'Définissez votre nouveau mot de passe' : 'Créez votre mot de passe pour accéder à l\'application ClubSphere'}
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            <Mail className="w-3.5 h-3.5 inline mr-1" />{coach.email}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg" style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger)' }}>
            <div className="flex items-start gap-3">
              <AlertCircle size={20} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--danger-text)' }} />
              <p className="text-sm" style={{ color: 'var(--danger-text)' }}>{error}</p>
            </div>
          </div>
        )}

        {info && (
          <div className="mb-6 p-4 rounded-lg" style={{ background: 'var(--info-soft)', border: '1px solid var(--info)' }}>
            <div className="flex items-start gap-3">
              <AlertCircle size={20} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--info-text)' }} />
              <p className="text-sm" style={{ color: 'var(--info-text)' }}>{info}</p>
            </div>
          </div>
        )}

        <form onSubmit={isReset ? handleResetPassword : handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              Mot de passe
            </label>
            <PasswordInput
              value={password}
              onChange={(e) => { setPassword(e.target.value); setPasswordErrors(null); }}
              className="w-full px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              placeholder="Mot de passe"
              required
              disabled={loading}
            />
            <PasswordLengthHint password={password} errors={passwordErrors} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              Confirmer le mot de passe
            </label>
            <PasswordInput
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              placeholder="Retapez votre mot de passe"
              required
              disabled={loading}
            />
            <PasswordMismatchHint password={password} confirmPassword={confirmPassword} />
          </div>

          {!isReset && (
            <TermsCheckbox checked={termsChecked} onChange={setTermsChecked} disabled={loading} />
          )}

          <Button
            variant="primary"
            type="submit"
            disabled={loading || !canSubmit}
            className="w-full"
          >
            {loading ? (isReset ? 'Mise à jour...' : 'Création en cours...') : (isReset ? 'Définir le mot de passe' : 'Créer mon compte')}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Vous avez déjà un compte ?{' '}
            <button
              onClick={() => navigate('/login')}
              className="transition-colors"
              style={{ color: 'var(--accent)' }}
            >
              Se connecter
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
