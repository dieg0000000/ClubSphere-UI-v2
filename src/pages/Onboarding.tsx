import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Users, User, Heart, Send, LogOut, CircleCheck as CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { releaseNativePushDevice } from '../lib/nativePush';
import { claimFamilyLinksOnce } from '../lib/familyLinks';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import Button from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { formatAvsInput, isCompleteAvs } from '../utils/avs';
import { ROLE_BADGE } from '../components/ProfileLayout';

type UserType = 'parent' | 'member' | 'supporter' | null;

const ROLE_LOCKED_MESSAGE = 'Pour changer de type de compte, contactez le club.';

const USER_TYPE_LABELS: Record<Exclude<UserType, null>, string> = {
  parent: 'Parent / Joueur mineur',
  member: 'Joueur actif',
  supporter: 'Membre / Supporter',
};

function toUserType(role: string | null | undefined): UserType {
  if (role === 'parent' || role === 'member' || role === 'supporter') return role;
  return null;
}

const COMMITTEE_FUNCTION_ROLES = ['president', 'vice_president', 'responsable_technique', 'responsable_competitions'];

function clubRoleLabel(role: string): string {
  if (ROLE_BADGE[role]) return ROLE_BADGE[role].label;
  if (COMMITTEE_FUNCTION_ROLES.includes(role)) return 'Comité';
  return role;
}

function isRoleLockedError(err: { code?: string; message?: string } | null): boolean {
  return !!err && err.code === '42501' && (err.message ?? '').includes('rôle non modifiable');
}

export function Onboarding() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, updateProfile } = useAuth();
  const { clubId } = useTenant();

  const [step, setStep] = useState<'role' | 'avs' | 'request-sent'>('role');
  const [userType, setUserType] = useState<UserType>(null);
  const [avsNumber, setAvsNumber] = useState('');
  const [avsError, setAvsError] = useState('');
  const [lookupDone, setLookupDone] = useState(false);
  const [childFound, setChildFound] = useState<{ first_name: string; last_name: string } | null>(null);
  const [activationMessage, setActivationMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [storedType, setStoredType] = useState<UserType>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [clubRole, setClubRole] = useState<string | null>(null);

  const nameStepOnly = searchParams.get('step') === 'name';
  const userId = user?.id;

  useEffect(() => {
    if (nameStepOnly || !userId) return;
    let cancelled = false;
    supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error: roleErr }) => {
        if (cancelled) return;
        if (roleErr) console.error('Error loading account type:', roleErr);
        const role = typeof data?.role === 'string' ? data.role.trim() : '';
        const type = toUserType(role);
        setStoredType(type);
        if (type) setUserType(type);
        else if (role) setClubRole(role);
        setRoleLoaded(true);
      });
    return () => { cancelled = true; };
  }, [userId, nameStepOnly]);

  const handleNameSubmit = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setError('Veuillez renseigner votre prénom et nom.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (!user) throw new Error('User not found');
      const fullName = `${firstName.trim()} ${lastName.trim()}`;
      const { error: upErr } = await supabase
        .from('profiles')
        .update({ first_name: firstName.trim(), last_name: lastName.trim(), full_name: fullName })
        .eq('id', user.id);
      if (upErr) throw upErr;
      if (updateProfile) await updateProfile();
      navigate('/dashboard');
    } catch (err) {
      console.error('Error saving name:', err);
      setError(isRoleLockedError(err as { code?: string; message?: string }) ? ROLE_LOCKED_MESSAGE : 'Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  if (nameStepOnly) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-app)' }}>
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center" style={{ background: 'var(--bg-card)' }}>
              <User className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Complétez votre profil</h1>
            <p style={{ color: 'var(--text-secondary)' }}>Renseignez votre nom pour continuer</p>
          </div>
          <div className="rounded-lg p-8" style={{ background: 'var(--bg-card)', boxShadow: 'var(--shadow-lg)' }}>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Prénom</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Prénom"
                  className="w-full rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Nom</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Nom"
                  className="w-full rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>
            {error && <Alert variant="danger" className="mb-4">{error}</Alert>}
            <Button variant="primary" onClick={handleNameSubmit} disabled={loading} className="w-full">
              {loading ? 'Enregistrement...' : 'Continuer'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const handleClubRoleComplete = async () => {
    setLoading(true);
    setError('');
    try {
      if (!user) throw new Error('User not found');
      const { error: upErr } = await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', user.id);
      if (isRoleLockedError(upErr)) {
        setError(ROLE_LOCKED_MESSAGE);
        return;
      }
      if (upErr) throw upErr;
      if (updateProfile) await updateProfile();
      navigate('/dashboard');
    } catch (err) {
      console.error('Error completing club role onboarding:', err);
      setError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleContinue = async () => {
    if (clubRole) {
      await handleClubRoleComplete();
      return;
    }
    if (!userType) {
      setError('Veuillez sélectionner une option');
      return;
    }
    setError('');
    if (userType === 'supporter') {
      await handleSupporterComplete();
      return;
    }
    setStep('avs');
  };

  const handleSupporterComplete = async () => {
    setLoading(true);
    setError('');
    try {
      if (!user) throw new Error('User not found');
      const { data, error: claimErr } = await claimFamilyLinksOnce(user.id);
      if (claimErr) throw claimErr;

      if (data?.has_any_role) {
        if (updateProfile) await updateProfile();
        navigate('/dashboard');
      } else {
        const changes = storedType ? { onboarding_completed: true } : { role: 'supporter', onboarding_completed: true };
        const { error: upErr } = await supabase
          .from('profiles')
          .update(changes)
          .eq('id', user.id);
        if (isRoleLockedError(upErr)) {
          setError(ROLE_LOCKED_MESSAGE);
          return;
        }
        if (updateProfile) await updateProfile();
        navigate('/dashboard');
      }
    } catch (err) {
      console.error('Error completing supporter onboarding:', err);
      setError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  const handleAvsChange = (value: string) => {
    const formatted = formatAvsInput(value);
    setAvsNumber(formatted);
    setAvsError('');
    setLookupDone(false);
    setChildFound(null);
    setError('');
  };

  const handleLookupAndClaim = async () => {
    if (!avsNumber || !isCompleteAvs(avsNumber)) {
      setAvsError('Numéro AVS incomplet (13 chiffres attendus)');
      return;
    }
    if (!clubId) {
      setError('Club non identifié. Veuillez recharger la page.');
      return;
    }

    setLoading(true);
    setError('');
    setAvsError('');

    try {
      const { data, error: lookupErr } = await supabase
        .rpc('lookup_member_by_avs', { avs_input: avsNumber.trim(), p_club_id: clubId });

      if (lookupErr) throw lookupErr;

      if (data && data.length > 0) {
        setChildFound({ first_name: data[0].first_name, last_name: data[0].last_name });

        if (!user) throw new Error('User not found');
        const { error: claimErr } = await claimFamilyLinksOnce(user.id);
        if (claimErr) throw claimErr;

        if (updateProfile) await updateProfile();
        navigate('/dashboard');
        return;
      }

      setLookupDone(true);
      setChildFound(null);
    } catch (err) {
      console.error('Lookup/claim error:', err);
      setError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendActivationRequest = async () => {
    if (!activationMessage.trim()) {
      setError('Veuillez décrire votre situation pour que le club puisse traiter votre demande.');
      return;
    }
    if (!clubId) {
      setError('Club non identifié. Veuillez recharger la page.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error: rpcErr } = await supabase.rpc('request_activation', {
        p_avs: avsNumber.trim(),
        p_club_id: clubId,
        p_message: activationMessage.trim(),
      });

      if (rpcErr) throw rpcErr;

      setStep('request-sent');
    } catch (err) {
      console.error('Activation request error:', err);
      setError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await releaseNativePushDevice();
    await supabase.auth.signOut();
  };

  if (step === 'request-sent') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-app)' }}>
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center" style={{ background: 'var(--success-soft)' }}>
              <CheckCircle className="w-10 h-10" style={{ color: 'var(--success)' }} />
            </div>
            <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Demande transmise</h1>
          </div>
          <div className="rounded-lg p-8" style={{ background: 'var(--bg-card)', boxShadow: 'var(--shadow-lg)' }}>
            <p className="mb-6" style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '14px' }}>
              Votre demande a été transmise au club. Vous recevrez l'accès une fois validée par le comité.
            </p>
            <Button
              variant="secondary"
              onClick={handleLogout}
              leftIcon={<LogOut className="w-4 h-4" />}
              className="w-full"
            >
              Se déconnecter
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-app)' }}>
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <div className="w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center" style={{ background: 'var(--bg-card)' }}>
            <div className="text-4xl font-bold text-primary">CS</div>
          </div>
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Bienvenue sur ClubSphere</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Configuration de votre compte</p>
        </div>

        <div className="rounded-lg p-8" style={{ background: 'var(--bg-card)', boxShadow: 'var(--shadow-lg)' }}>
          {step === 'role' && (
            <div>
              {!roleLoaded ? (
                <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Chargement...</p>
              ) : storedType ? (
                <div className="mb-6">
                  <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                    Type de compte : {USER_TYPE_LABELS[storedType]}
                  </h2>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{ROLE_LOCKED_MESSAGE}</p>
                </div>
              ) : clubRole ? (
                <div className="mb-6">
                  <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                    Type de compte : {clubRoleLabel(clubRole)}
                  </h2>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{ROLE_LOCKED_MESSAGE}</p>
                </div>
              ) : (
              <>
              <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Qui êtes-vous?</h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <button
                  onClick={() => setUserType('parent')}
                  className={`p-6 rounded-lg border-2 transition-all ${
                    userType === 'parent'
                      ? 'border-primary bg-primary/10'
                      : 'border-[var(--border-color)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <Users className="w-12 h-12 mx-auto mb-4 text-primary" />
                  <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Parent / Joueur mineur</h3>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Pour les enfants et leurs représentants légaux
                  </p>
                </button>

                <button
                  onClick={() => setUserType('member')}
                  className={`p-6 rounded-lg border-2 transition-all ${
                    userType === 'member'
                      ? 'border-primary bg-primary/10'
                      : 'border-[var(--border-color)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <User className="w-12 h-12 mx-auto mb-4 text-primary" />
                  <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Joueur actif</h3>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Joueur adulte du club (≥ 18 ans)
                  </p>
                </button>

                <button
                  onClick={() => setUserType('supporter')}
                  className={`p-6 rounded-lg border-2 transition-all ${
                    userType === 'supporter'
                      ? 'border-primary bg-primary/10'
                      : 'border-[var(--border-color)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <Heart className="w-12 h-12 mx-auto mb-4 text-primary" />
                  <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Membre / Supporter</h3>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Je suis fan du club, je veux suivre les actualités et événements
                  </p>
                </button>
              </div>
              </>
              )}

              {error && (
                <Alert variant="danger" className="mb-4">{error}</Alert>
              )}

              <Button
                variant="primary"
                onClick={handleRoleContinue}
                disabled={!roleLoaded || (!userType && !clubRole) || loading}
                className="w-full"
              >
                {loading ? 'Chargement...' : 'Continuer'}
              </Button>
            </div>
          )}

          {step === 'avs' && (
            <div>
              <Button
                variant="secondary"
                onClick={() => { setStep('role'); setError(''); setLookupDone(false); setChildFound(null); }}
                leftIcon={<ArrowLeft className="w-4 h-4" />}
                className="mb-6"
              >
                Retour
              </Button>

              <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                {userType === 'parent' ? "Numéro AVS de votre enfant" : "Votre numéro AVS"}
              </h2>
              <p className="mb-6 text-sm" style={{ color: 'var(--text-secondary)' }}>
                {userType === 'parent'
                  ? "Saisissez le numéro AVS de votre enfant pour le rattacher à votre compte."
                  : "Saisissez votre numéro AVS pour activer votre compte joueur."}
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Numéro AVS
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={16}
                  value={avsNumber}
                  onChange={(e) => handleAvsChange(e.target.value)}
                  placeholder="756.1234.5678.97"
                  className="w-full rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  autoFocus
                />
                {avsError && (
                  <p className="text-sm mt-1.5" style={{ color: 'var(--danger-text)' }}>{avsError}</p>
                )}
              </div>

              <Alert variant="info" className="mb-6">
                Le numéro AVS est utilisé uniquement pour l'annonce J+S et la vérification du dossier de membre. Il n'est jamais transmis à des tiers.
              </Alert>

              {!lookupDone && (
                <Button
                  variant="primary"
                  onClick={handleLookupAndClaim}
                  disabled={loading || !avsNumber}
                  className="w-full"
                >
                  {loading ? 'Vérification...' : 'Vérifier'}
                </Button>
              )}

              {lookupDone && !childFound && (
                <div className="rounded-lg p-6 mt-2" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-color)' }}>
                  <p className="font-medium mb-2" style={{ color: 'var(--text-primary)', fontSize: '15px' }}>
                    Nous n'avons pas pu vous rattacher automatiquement.
                  </p>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6 }}>
                    Décrivez votre situation au club ci-dessous : votre demande sera vérifiée puis validée par le comité.
                  </p>
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      Message au club *
                    </label>
                    <textarea
                      value={activationMessage}
                      onChange={(e) => { setActivationMessage(e.target.value); setError(''); }}
                      placeholder="Précisez votre situation (nom de l'enfant, équipe, etc.)"
                      rows={4}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-input)',
                        color: 'var(--text-primary)',
                        fontSize: '14px',
                        fontFamily: 'inherit',
                        resize: 'vertical',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <Button
                    variant="primary"
                    onClick={handleSendActivationRequest}
                    disabled={loading || !activationMessage.trim()}
                    leftIcon={<Send className="w-4 h-4" />}
                    className="w-full"
                  >
                    {loading ? 'Envoi...' : 'Envoyer ma demande au club'}
                  </Button>
                </div>
              )}

              {error && (
                <Alert variant="danger" className="mt-4">{error}</Alert>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-sm mt-6" style={{ color: 'var(--text-muted)' }}>
          Les comptes entraîneurs et comité sont créés manuellement par l'administrateur
        </p>
      </div>
    </div>
  );
}
