import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import { User, Phone, MapPin, GraduationCap, Landmark, Award } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';
import { ChangePasswordSection } from '../components/ChangePasswordSection';
import { TermsAcceptanceSection } from '../components/TermsAcceptanceSection';
import { DeleteAccountSection } from '../components/DeleteAccountSection';
import { MesValidations } from '../components/MesValidations';
import { CalendarSubscription } from '../components/CalendarSubscription';
import { EmailChangeModal } from '../components/EmailChangeModal';
import { updateUserEmail } from '../lib/updateEmail';
import {
  ProfileCard, ProfileSection, ProfileField,
  ProfileNotFound, ProfileLoading,
} from '../components/ProfileLayout';
import ProfilePhotoUpload from '../components/profile/ProfilePhotoUpload';
import ProfileTabsBar, { useProfileTab } from '../components/ProfileTabsBar';
import NotificationsPanel from '../components/NotificationsPanel';
import { formatPhone } from '../utils/phoneHelpers';
import PhoneInput from '../components/PhoneInput';
import { useConfrerieBadge } from '../hooks/useConfrerieBadge';
import { STAFF_ROLE_LABELS } from '../types';
import { ZoomablePhoto } from '../components/PhotoViewer';

interface CoachData {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  birth_date: string;
  address: string;
  postal_code: string;
  city: string;
  qualification_id: string | null;
  js_number: string | null;
  asf_licence_number: string | null;
  diploma_expiry_date: string | null;
  next_js_course_date: string | null;
  next_js_course_name: string | null;
  next_js_course_number: string | null;
  next_js_course_location: string | null;
  wants_js_renewal: boolean;
  team?: { id: string; name: string; role?: string } | null;
  teams?: { id: string; name: string; role: string; categoryName?: string }[];
}

interface Qualification {
  id: string;
  name: string;
  validity_years?: number | null;
}

function isDiplomaExpired(expiry?: string | null): boolean {
  if (!expiry) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(expiry) < today;
}

function ExpiredBadge() {
  return (
    <span
      style={{
        background: 'var(--danger-soft)',
        color: 'var(--danger-text)',
        border: '1px solid var(--danger)',
        borderRadius: '6px',
        padding: '1px 6px',
        fontSize: '10px',
        fontWeight: 700,
      }}
    >
      EXPIRÉ
    </span>
  );
}

export default function CoachProfile() {
  const { user, effectiveRole } = useAuth();
  const { tab, setTab } = useProfileTab();
  const confrerieBadge = useConfrerieBadge();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [coach, setCoach] = useState<CoachData | null>(null);
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [originalEmail, setOriginalEmail] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [showRenewalConfirm, setShowRenewalConfirm] = useState(false);
  const [savingRenewal, setSavingRenewal] = useState(false);
  const [bankDetails, setBankDetails] = useState<{ iban: string; account_holder: string; bank_name: string }>({ iban: '', account_holder: '', bank_name: '' });
  const [bankError, setBankError] = useState('');
  const [savingBank, setSavingBank] = useState(false);
  const { toast, showToast } = useToast();

  const isAdmin = effectiveRole === 'admin';

  useEffect(() => {
    fetchCoachProfile();
    fetchQualifications();
  }, [user]);

  const fetchCoachProfile = async () => {
    if (!user) return;
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser?.email) { setNotFound(true); return; }

      const { data, error } = await supabase
        .from('coaches')
        .select('id, first_name, last_name, email, phone, birth_date, address, postal_code, city, qualification_id, js_number, asf_licence_number, diploma_expiry_date, next_js_course_date, next_js_course_name, next_js_course_number, next_js_course_location, wants_js_renewal')
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (error) throw error;
      if (!data) { setNotFound(true); return; }

      const { data: staffRows } = await supabase
        .from('team_staff')
        .select('role, teams(id, name, team_categories(name))')
        .eq('coach_id', data.id)
        .order('sort_order')
        .limit(10);
      const myTeams = (staffRows || []).filter((r: any) => r.teams).map((r: any) => ({
        ...r.teams,
        role: r.role,
        categoryName: (r.teams as any)?.team_categories?.name || undefined,
      }));

      setCoach({ ...data, wants_js_renewal: data.wants_js_renewal !== false, team: myTeams[0] || null, teams: myTeams });
      const { data: bankRow } = await supabase
        .from('coach_bank_details')
        .select('iban, account_holder, bank_name')
        .eq('coach_id', data.id)
        .maybeSingle();
      if (bankRow) setBankDetails({ iban: bankRow.iban || '', account_holder: bankRow.account_holder || '', bank_name: bankRow.bank_name || '' });
      setOriginalEmail(data.email || '');

      const { data: profileRow } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', authUser.id)
        .maybeSingle();
      setPhotoUrl(profileRow?.avatar_url || null);
    } catch (err) {
      console.error('Error fetching coach profile:', err);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const fetchQualifications = async () => {
    try {
      const { data } = await supabase.from('coaching_qualifications').select('id, name, validity_years').order('name');
      if (data) setQualifications(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleEditToggle = () => {
    if (isEditing) {
      if (coach && coach.email !== originalEmail) { setShowEmailModal(true); return; }
      doSave();
    } else {
      setIsEditing(true);
    }
  };

  const doSave = async () => {
    if (!coach) return;
    setSaving(true);
    try {
      const update: any = { email: coach.email, phone: coach.phone, address: coach.address, postal_code: coach.postal_code, city: coach.city };
      if (isAdmin) {
        Object.assign(update, {
          first_name: coach.first_name, last_name: coach.last_name,
          birth_date: coach.birth_date, qualification_id: coach.qualification_id,
          js_number: coach.js_number, asf_licence_number: coach.asf_licence_number,
        });
      }
      const { error } = await supabase.from('coaches').update(update).eq('id', coach.id);
      if (error) throw error;
      setIsEditing(false);
    } catch (err) {
      console.error(err);
      showToast('Erreur lors de la sauvegarde', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEmailChangeConfirm = async (newEmail: string) => {
    if (!coach || !user) return;
    await updateUserEmail(user.id, newEmail, originalEmail);
    setShowEmailModal(false);
    await supabase.auth.signOut();
    window.location.href = '/login?message=email_changed';
  };

  const getQualificationName = (id: string | null) => {
    if (!id) return null;
    return qualifications.find(q => q.id === id)?.name || null;
  };

  const currentQualification = coach ? qualifications.find(q => q.id === coach.qualification_id) : undefined;
  const showJsSection = !!currentQualification && currentQualification.validity_years != null;

  const persistRenewal = async (value: boolean) => {
    if (!coach) return;
    setSavingRenewal(true);
    try {
      const { error } = await supabase
        .from('coaches')
        .update({ wants_js_renewal: value })
        .eq('id', coach.id);
      if (error) throw error;
      setCoach({ ...coach, wants_js_renewal: value });
    } catch (err) {
      console.error(err);
      showToast('Erreur lors de la sauvegarde', 'error');
    } finally {
      setSavingRenewal(false);
    }
  };

  const saveBankDetails = async () => {
    if (!coach) return;
    setSavingBank(true);
    setBankError('');
    try {
      if (bankDetails.iban.trim()) {
        const { error } = await supabase
          .from('coach_bank_details')
          .upsert({
            coach_id: coach.id,
            iban: bankDetails.iban.trim(),
            account_holder: bankDetails.account_holder.trim() || null,
            bank_name: bankDetails.bank_name.trim() || null,
          }, { onConflict: 'coach_id' });
        if (error) { setBankError(error.message); return; }
      } else {
        await supabase.from('coach_bank_details').delete().eq('coach_id', coach.id);
      }
      showToast('Coordonnées bancaires enregistrées', 'success');
    } catch (err) {
      console.error(err);
      setBankError('Erreur lors de la sauvegarde');
    } finally {
      setSavingBank(false);
    }
  };

  const handleRenewalToggle = () => {
    if (!coach) return;
    if (coach.wants_js_renewal) {
      setShowRenewalConfirm(true);
    } else {
      persistRenewal(true);
    }
  };

  const getInitials = (first: string, last: string) =>
    `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();

  const formatDate = (d: string) =>
    d ? new Date(d).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

  if (loading) return <ProfileLoading />;
  if (notFound || !coach) return <ProfileNotFound />;

  return (
    <div className="space-y-5">
      <ProfileTabsBar value={tab} onChange={setTab} />

      {tab === 'notifications' ? (
        <NotificationsPanel />
      ) : (
        <>
      <ProfileCard>
        {/* ---- Custom coach header ---- */}
        <div className="ph-root" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          {/* Identity block */}
          <div className="ph-top">
            <div className="ph-avatar-wrap">
              {photoUrl ? (
                <ZoomablePhoto src={photoUrl} caption={`${coach.first_name} ${coach.last_name}`} alt={`${coach.first_name} ${coach.last_name}`} className="ph-avatar" style={{ border: '3px solid var(--border-color)' }} />
              ) : (
                <div className="ph-avatar ph-avatar--initials" style={{ background: 'var(--accent)', color: 'var(--text-primary)', border: '3px solid var(--border-color)' }}>
                  {getInitials(coach.first_name, coach.last_name)}
                </div>
              )}
              {user?.id && (
                <ProfilePhotoUpload
                  variant="badge"
                  memberId={user.id}
                  userId={user.id}
                  currentPhotoUrl={photoUrl}
                  onPhotoUpdated={(url) => setPhotoUrl(url)}
                />
              )}
            </div>

            <div className="ph-meta">
              <h1 className="ph-name">{coach.first_name} {coach.last_name}</h1>
              <div className="ph-badges" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                <span className="ph-badge" style={{ background: 'var(--success-soft)', color: 'var(--success-text)' }}>
                  {user?.role === 'assistant_coach' ? 'Ass. entraîneur' : 'Entraîneur'}
                </span>
                {getQualificationName(coach.qualification_id) && (
                  <span className="ph-badge" style={{ background: 'var(--accent-soft)', color: 'var(--text-secondary)' }}>
                    {getQualificationName(coach.qualification_id)}
                  </span>
                )}
                {confrerieBadge?.is_member && confrerieBadge.label && (
                  <span
                    className="ph-badge"
                    style={{ background: '#fef3c7', color: '#92400e', fontWeight: 600 }}
                    title={confrerieBadge.member_since ? `Membre depuis ${confrerieBadge.member_since}` : undefined}
                  >
                    <Award size={13} style={{ flexShrink: 0 }} />
                    {confrerieBadge.label}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Assignments block */}
          {coach.teams && coach.teams.length > 0 && (
            <div
              style={{
                borderTop: '1px solid var(--border-color)',
                paddingTop: '12px',
                marginTop: '4px',
                display: 'flex',
                flexDirection: 'column',
                gap: '0',
              }}
            >
              {coach.teams.map((t, idx) => (
                <div
                  key={`${t.id}-${t.role}`}
                  style={{
                    padding: '8px 0',
                    borderTop: idx > 0 ? '1px solid var(--border-color)' : undefined,
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
                    {STAFF_ROLE_LABELS[t.role] || t.role}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '1px' }}>
                    {t.name}
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleEditToggle}
            disabled={saving}
            className="ph-edit-btn"
            style={{ background: 'var(--accent)', color: 'var(--text-primary)' }}
          >
            {saving ? 'Enregistrement...' : isEditing ? 'Enregistrer' : 'Modifier mon profil'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ProfileSection icon={<User size={16} />} title="Identité">
            <ProfileField
              label="Prénom"
              value={coach.first_name}
              isEditing={isEditing && isAdmin}
              onChange={(v) => setCoach({ ...coach, first_name: v })}
            />
            <ProfileField
              label="Nom"
              value={coach.last_name}
              isEditing={isEditing && isAdmin}
              onChange={(v) => setCoach({ ...coach, last_name: v })}
            />
            <ProfileField
              label="Date de naissance"
              value={isEditing && isAdmin ? coach.birth_date : formatDate(coach.birth_date)}
              isEditing={isEditing && isAdmin}
              type="date"
              onChange={(v) => setCoach({ ...coach, birth_date: v })}
            />
          </ProfileSection>

          <ProfileSection icon={<Phone size={16} />} title="Coordonnées">
            <ProfileField
              label="Email"
              value={coach.email}
              isEditing={isEditing}
              type="email"
              onChange={(v) => setCoach({ ...coach, email: v })}
            />
            <ProfileField
              label="Mobile"
              value={formatPhone(coach.phone || '')}
              isEditing={isEditing}
            >
              {isEditing ? (
                <PhoneInput
                  value={coach.phone || ''}
                  onChange={(v) => setCoach({ ...coach, phone: v })}
                />
              ) : undefined}
            </ProfileField>
          </ProfileSection>

          <ProfileSection icon={<MapPin size={16} />} title="Adresse">
            <ProfileField
              label="Adresse"
              value={coach.address}
              isEditing={isEditing}
              onChange={(v) => setCoach({ ...coach, address: v })}
            />
            <div className="grid grid-cols-2 gap-3">
              <ProfileField
                label="Code postal"
                value={coach.postal_code}
                isEditing={isEditing}
                onChange={(v) => setCoach({ ...coach, postal_code: v })}
              />
              <ProfileField
                label="Ville"
                value={coach.city}
                isEditing={isEditing}
                onChange={(v) => setCoach({ ...coach, city: v })}
              />
            </div>
          </ProfileSection>

          <ProfileSection icon={<Award size={16} />} title="Formation & Licences">
            <ProfileField label="Qualification / Diplôme">
              {isEditing && isAdmin ? (
                <select
                  value={coach.qualification_id || ''}
                  onChange={(e) => setCoach({ ...coach, qualification_id: e.target.value || null })}
                  className="w-full text-sm"
                  style={{
                    background: 'var(--bg-input)', border: '1px solid var(--border-color)',
                    borderRadius: '6px', padding: '10px 14px', color: 'var(--text-primary)', outline: 'none',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                >
                  <option value="">Aucune qualification</option>
                  {qualifications.map((q) => (
                    <option key={q.id} value={q.id}>{q.name}</option>
                  ))}
                </select>
              ) : (
                <div
                  className="rounded-md text-sm"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '10px 14px', color: 'var(--text-secondary)' }}
                >
                  {getQualificationName(coach.qualification_id) || '—'}
                </div>
              )}
            </ProfileField>
            <ProfileField
              label="Numéro JS"
              value={coach.js_number}
              isEditing={isEditing && isAdmin}
              onChange={(v) => setCoach({ ...coach, js_number: v })}
            />
            <ProfileField
              label="Numéro ASF"
              value={coach.asf_licence_number}
              isEditing={isEditing && isAdmin}
              onChange={(v) => setCoach({ ...coach, asf_licence_number: v })}
            />
          </ProfileSection>
        </div>

        {showJsSection && coach && (
          <div className="mt-6">
            <ProfileSection icon={<GraduationCap size={16} />} title="Formation J+S">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' }}>Diplôme actuel</div>
                  <div
                    className="rounded-md text-sm"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '10px 14px', color: 'var(--text-primary)' }}
                  >
                    {currentQualification?.name || '—'}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' }}>
                    <span className="inline-flex items-center gap-2">
                      Date d'expiration
                      {isDiplomaExpired(coach.diploma_expiry_date) && <ExpiredBadge />}
                    </span>
                  </div>
                  <div
                    className="rounded-md text-sm"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '10px 14px', color: 'var(--text-primary)' }}
                  >
                    {formatDate(coach.diploma_expiry_date || '')}
                  </div>
                </div>
              </div>

              {coach.next_js_course_date && (
                <div className="mt-4 rounded-lg p-4" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px', fontWeight: 600 }}>
                    Prochain cours J+S
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>Date du cours</div>
                      <div style={{ color: 'var(--text-primary)' }}>{formatDate(coach.next_js_course_date)}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>Numéro du cours</div>
                      <div style={{ color: 'var(--text-primary)' }}>{coach.next_js_course_number || '—'}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>Nom du cours</div>
                      <div style={{ color: 'var(--text-primary)' }}>{coach.next_js_course_name || '—'}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>Lieu du cours</div>
                      <div style={{ color: 'var(--text-primary)' }}>{coach.next_js_course_location || '—'}</div>
                    </div>
                  </div>
                </div>
              )}

              <div
                className="mt-4"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  padding: '16px',
                }}
              >
                <div>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>
                    Je désire renouveler mon diplôme J+S
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                    Si désactivé, votre qualification sera retirée à l'expiration du diplôme.
                  </div>
                </div>
                <div
                  onClick={() => !savingRenewal && handleRenewalToggle()}
                  style={{
                    width: '48px',
                    height: '26px',
                    background: coach.wants_js_renewal ? 'var(--success)' : 'var(--border-strong)',
                    borderRadius: '99px',
                    cursor: savingRenewal ? 'not-allowed' : 'pointer',
                    opacity: savingRenewal ? 0.5 : 1,
                    position: 'relative',
                    transition: 'background 0.2s',
                    flexShrink: 0,
                    marginLeft: '20px',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: '3px',
                      left: coach.wants_js_renewal ? '25px' : '3px',
                      width: '20px',
                      height: '20px',
                      background: 'var(--text-inverse)',
                      borderRadius: '50%',
                      transition: 'left 0.2s',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  />
                </div>
              </div>
            </ProfileSection>
          </div>
        )}
      </ProfileCard>

      <ProfileCard>
        <ProfileSection icon={<Landmark size={16} />} title="Coordonnées bancaires">
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            Utilisé par le club pour le remboursement de vos notes de frais.
          </p>
          <div className="space-y-3">
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' }}>IBAN</div>
              <input
                type="text"
                value={bankDetails.iban}
                onChange={(e) => { setBankDetails({ ...bankDetails, iban: e.target.value }); setBankError(''); }}
                className="w-full text-sm font-mono"
                style={{
                  background: 'var(--bg-input)', border: `1px solid ${bankError ? 'var(--danger)' : 'var(--border-color)'}`,
                  borderRadius: '6px', padding: '10px 14px', color: 'var(--text-primary)', outline: 'none',
                }}
                placeholder="CH00 0000 0000 0000 0000 0"
              />
              {bankError && <p className="mt-1 text-xs" style={{ color: 'var(--danger-text)' }}>{bankError}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' }}>Titulaire du compte</div>
                <input
                  type="text"
                  value={bankDetails.account_holder}
                  onChange={(e) => setBankDetails({ ...bankDetails, account_holder: e.target.value })}
                  className="w-full text-sm"
                  style={{
                    background: 'var(--bg-input)', border: '1px solid var(--border-color)',
                    borderRadius: '6px', padding: '10px 14px', color: 'var(--text-primary)', outline: 'none',
                  }}
                />
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' }}>Banque</div>
                <input
                  type="text"
                  value={bankDetails.bank_name}
                  onChange={(e) => setBankDetails({ ...bankDetails, bank_name: e.target.value })}
                  className="w-full text-sm"
                  style={{
                    background: 'var(--bg-input)', border: '1px solid var(--border-color)',
                    borderRadius: '6px', padding: '10px 14px', color: 'var(--text-primary)', outline: 'none',
                  }}
                />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={saveBankDetails}
                disabled={savingBank}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{
                  background: 'var(--accent)', color: 'white',
                  opacity: savingBank ? 0.6 : 1, cursor: savingBank ? 'not-allowed' : 'pointer',
                }}
              >
                {savingBank ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </ProfileSection>
      </ProfileCard>

      <MesValidations />

      <CalendarSubscription />

      <ChangePasswordSection />

      <TermsAcceptanceSection />

      <DeleteAccountSection />
        </>
      )}

      <ConfirmModal
        isOpen={showRenewalConfirm}
        title="Confirmer l'arrêt du renouvellement J+S"
        message="Si vous ne renouvelez pas votre diplôme J+S, votre qualification sera retirée à son expiration. Le club ne pourra plus toucher d'indemnités J+S pour les juniors que vous entraînez. Êtes-vous sûr de vouloir continuer ?"
        confirmLabel="Confirmer"
        cancelLabel="Annuler"
        confirmStyle="danger"
        loading={savingRenewal}
        onConfirm={async () => {
          await persistRenewal(false);
          setShowRenewalConfirm(false);
        }}
        onCancel={() => setShowRenewalConfirm(false)}
      />

      <EmailChangeModal
        isOpen={showEmailModal}
        currentEmail={originalEmail}
        onConfirm={handleEmailChangeConfirm}
        onCancel={() => {
          setShowEmailModal(false);
          if (coach) setCoach({ ...coach, email: originalEmail });
        }}
      />
      <Toast toast={toast} />
      <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', marginTop: '24px', paddingBottom: '8px' }}>Version {__APP_VERSION__}</p>
    </div>
  );
}
