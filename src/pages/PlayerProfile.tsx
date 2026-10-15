import { useState, useEffect } from 'react';
import { reportLoadError } from '../utils/reportLoadError';
import { LoadError } from '../components/LoadError';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import { User, Phone, MapPin, Shield, Camera, X } from 'lucide-react';
import { ChangePasswordSection } from '../components/ChangePasswordSection';
import { TermsAcceptanceSection } from '../components/TermsAcceptanceSection';
import { DeleteAccountSection } from '../components/DeleteAccountSection';
import { MesValidations } from '../components/MesValidations';
import { CalendarSubscription } from '../components/CalendarSubscription';
import { MyInvoicesBlock } from '../components/MyInvoicesBlock';
import { useFinanceModuleEnabled } from '../hooks/useFinanceModuleEnabled';
import { useWebsiteModuleEnabled } from '../hooks/useWebsiteModuleEnabled';
import { EmailChangeModal } from '../components/EmailChangeModal';
import { updateUserEmail } from '../lib/updateEmail';
import {
  ProfileCard, ProfileHeader, ProfileSection, ProfileField,
  ProfileNotFound, ProfileLoading, MinorBanner,
} from '../components/ProfileLayout';
import ProfilePhotoUpload from '../components/profile/ProfilePhotoUpload';
import ProfileTabsBar, { useProfileTab } from '../components/ProfileTabsBar';
import NotificationsPanel from '../components/NotificationsPanel';
import { formatPhone } from '../utils/phoneHelpers';
import PhoneInput from '../components/PhoneInput';
import { useConfrerieBadge } from '../hooks/useConfrerieBadge';
import { availabilitySummary } from '../utils/availabilityHelpers';

interface PlayerData {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  birth_date: string;
  address: string;
  street_number: string;
  postal_code: string;
  city: string;
  canton: string;
  nationality: string;
  avs_number: string;
  asf_licence_number: string;
  js_number: string | null;
  licence_status: string;
  team_id: string;
  legal_rep1_firstname: string | null;
  legal_rep1_lastname: string | null;
  legal_rep1_phone: string | null;
  legal_rep1_email: string | null;
  avatar_url: string | null;
  photo_url: string | null;
  availability: string | null;
  availability_until: string | null;
  jersey_number: number | null;
}

interface Team {
  id: string;
  name: string;
}

export default function PlayerProfile() {
  const { user } = useAuth();
  const { tab, setTab } = useProfileTab();
  const { enabled: financeEnabled } = useFinanceModuleEnabled();
  const { enabled: websiteEnabled } = useWebsiteModuleEnabled()
  const confrerieBadge = useConfrerieBadge();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isMinor, setIsMinor] = useState(false);
  const [photoNudgeDismissed, setPhotoNudgeDismissed] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [originalEmail, setOriginalEmail] = useState('');
  const { toast, showToast } = useToast();

  useEffect(() => {
    fetchPlayerProfile();
  }, [user]);

  const fetchPlayerProfile = async () => {
    if (!user?.email) return;

    try {
      const { data: memberData, error } = await supabase
        .from('members')
        .select('*, teams(*)')
        .ilike('email', user.email.trim().toLowerCase())
        .neq('status', 'archive')
        .maybeSingle();

      if (error) throw error;
      if (memberData) {
        setPlayer(memberData);
        setOriginalEmail(memberData.email || '');
        if (memberData.teams) setTeam(memberData.teams);

        if (memberData.birth_date) {
          const age = Math.floor(
            (Date.now() - new Date(memberData.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
          );
          setIsMinor(age < 18);
        }
      }
    } catch (error) {
      reportLoadError('PlayerProfile', error);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (first: string, last: string) =>
    `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();

  const formatDate = (d: string) =>
    d ? new Date(d).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

  const calculateAge = (d: string) => {
    if (!d) return null;
    const today = new Date();
    const birth = new Date(d);
    let age = today.getFullYear() - birth.getFullYear();
    if (today.getMonth() - birth.getMonth() < 0 ||
        (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
    return age;
  };

  const handleEditToggle = () => {
    if (isEditing) {
      if (player && player.email !== originalEmail) { setShowEmailModal(true); return; }
      doSave(player?.email || originalEmail);
    } else {
      setIsEditing(true);
    }
  };

  const doSave = async (email: string) => {
    if (!player) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('members').update({
        email, phone: player.phone, address: player.address,
        street_number: player.street_number, postal_code: player.postal_code, city: player.city,
      }).eq('id', player.id);
      if (error) throw error;
      await supabase.from('profiles').update({ phone: player.phone }).ilike('email', email);
      setIsEditing(false);
    } catch (err) {
      console.error(err);
      showToast('Erreur lors de la sauvegarde', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEmailChangeConfirm = async (newEmail: string) => {
    if (!player || !user) return;
    await updateUserEmail(user.id, newEmail, originalEmail);
    setShowEmailModal(false);
    await supabase.auth.signOut();
    window.location.href = '/login?message=email_changed';
  };

  if (loading) return <ProfileLoading />;
  if (loadFailed) return <LoadError onRetry={fetchPlayerProfile} />;
  if (!player) return <ProfileNotFound />;

  const age = calculateAge(player.birth_date);

  return (
    <div className="space-y-5">
      <ProfileTabsBar value={tab} onChange={setTab} />

      {tab === 'notifications' ? (
        <NotificationsPanel />
      ) : (
        <>
      <ProfileCard>
        <ProfileHeader
          initials={getInitials(player.first_name, player.last_name)}
          avatarUrl={player.photo_url || player.avatar_url}
          fullName={`${player.first_name} ${player.last_name}`}
          role="member"
          teamName={team?.name}
          confrerieBadge={confrerieBadge}
          isEditing={isEditing}
          saving={saving}
          canEdit={!isMinor}
          onEditToggle={handleEditToggle}
          photoSlot={user?.id ? (
            <ProfilePhotoUpload
              variant="badge"
              memberId={player.id}
              userId={user.id}
              currentPhotoUrl={player.photo_url}
              onPhotoUpdated={(url) =>
                setPlayer((prev) => (prev ? { ...prev, photo_url: url } : prev))
              }
            />
          ) : undefined}
        />

        {!player.photo_url && !isMinor && !photoNudgeDismissed && (
          <div
            className="flex items-center gap-3 rounded-lg px-4 py-3 mb-4"
            style={{
              background: 'var(--info-soft, var(--accent-soft))',
              border: '1px solid var(--info, var(--accent))',
            }}
          >
            <Camera size={16} style={{ color: 'var(--info-text, var(--accent-text))', flexShrink: 0 }} />
            <p className="text-xs flex-1" style={{ color: 'var(--info-text, var(--accent-text))' }}>
              Ajoutez une photo pour compléter votre fiche
            </p>
            <button
              type="button"
              onClick={() => setPhotoNudgeDismissed(true)}
              className="p-0.5 rounded-full"
              style={{ color: 'var(--info-text, var(--accent-text))' }}
              aria-label="Masquer"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {player.availability && player.availability !== 'disponible' && (
          <div
            className="flex items-center gap-3 rounded-lg px-4 py-3 mb-4"
            style={{
              background: 'var(--warning-soft)',
              border: '1px solid var(--warning)',
            }}
          >
            <span className="text-sm font-medium" style={{ color: 'var(--warning-text)' }}>
              {availabilitySummary(player.availability, player.availability_until)}
            </span>
          </div>
        )}

        {isMinor && (
          <MinorBanner
            repName={player.legal_rep1_firstname && player.legal_rep1_lastname
              ? `${player.legal_rep1_firstname} ${player.legal_rep1_lastname}` : undefined}
            repPhone={player.legal_rep1_phone || undefined}
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ProfileSection icon={<User size={16} />} title="Identité">
            <ProfileField label="Prénom" value={player.first_name} />
            <ProfileField label="Nom" value={player.last_name} />
            <ProfileField
              label="Date de naissance"
              value={age !== null ? `${formatDate(player.birth_date)} (${age} ans)` : formatDate(player.birth_date)}
            />
            <ProfileField label="Nationalité" value={player.nationality} />
          </ProfileSection>

          <ProfileSection icon={<Phone size={16} />} title="Coordonnées">
            <ProfileField
              label="Email"
              value={player.email}
              isEditing={isEditing && !isMinor}
              type="email"
              onChange={(v) => setPlayer({ ...player, email: v })}
            />
            <ProfileField
              label="Téléphone"
              value={formatPhone(player.phone || '')}
              isEditing={isEditing && !isMinor}
            >
              {isEditing && !isMinor ? (
                <PhoneInput
                  value={player.phone || ''}
                  onChange={(v) => setPlayer({ ...player, phone: v })}
                />
              ) : undefined}
            </ProfileField>
          </ProfileSection>

          <ProfileSection icon={<MapPin size={16} />} title="Adresse">
            <div className="grid grid-cols-2 gap-3">
              <ProfileField
                label="Rue"
                value={player.address}
                isEditing={isEditing && !isMinor}
                onChange={(v) => setPlayer({ ...player, address: v })}
              />
              <ProfileField
                label="Numéro"
                value={player.street_number}
                isEditing={isEditing && !isMinor}
                onChange={(v) => setPlayer({ ...player, street_number: v })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ProfileField
                label="Code postal"
                value={player.postal_code}
                isEditing={isEditing && !isMinor}
                onChange={(v) => setPlayer({ ...player, postal_code: v })}
              />
              <ProfileField
                label="Ville"
                value={player.city}
                isEditing={isEditing && !isMinor}
                onChange={(v) => setPlayer({ ...player, city: v })}
              />
            </div>
          </ProfileSection>

          <ProfileSection icon={<Shield size={16} />} title="Informations Football">
            {player.jersey_number != null && <ProfileField label="N° maillot" value={`#${player.jersey_number}`} />}
            <ProfileField label="Numéro ASF" value={player.asf_licence_number} />
            <ProfileField label="Numéro J+S" value={player.js_number} />
            <ProfileField label="Statut Licence">
              <div
                className="rounded-md text-sm"
                style={{ background: 'var(--bg-card-hover)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '10px 14px' }}
              >
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                  style={
                    player.licence_status === 'actif'
                      ? { background: 'var(--success-soft)', color: 'var(--success-text)' }
                      : { background: 'var(--bg-hover)', color: 'var(--text-muted)' }
                  }
                >
                  {player.licence_status || '—'}
                </span>
              </div>
            </ProfileField>
            {websiteEnabled && (
            <ProfileField label="Visibilité site internet">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" checked={(player as any).hide_from_site === true} disabled style={{ cursor: 'default' }} />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Ne pas apparaître sur le site du club</span>
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Pour ne pas apparaître sur le site, contactez le club.</p>
            </ProfileField>
            )}
            <ProfileField label="Autorisation photo (site, réseaux sociaux)">
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                {(player as any).photo_consent === true ? 'Oui' : (player as any).photo_consent === false ? 'Non' : 'Pas de réponse'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Pour modifier cette autorisation, contactez le club.</p>
            </ProfileField>
          </ProfileSection>
        </div>

        {(player.legal_rep1_lastname || player.legal_rep1_email || player.legal_rep1_phone) && (
          <div className="mt-6 pt-6" style={{ borderTop: '1px solid var(--border-color)' }}>
            <ProfileSection icon={<User size={16} />} title="Représentant légal">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {player.legal_rep1_lastname && (
                  <ProfileField
                    label="Nom"
                    value={`${player.legal_rep1_firstname || ''} ${player.legal_rep1_lastname}`}
                  />
                )}
                {player.legal_rep1_email && (
                  <ProfileField label="Email" value={player.legal_rep1_email} />
                )}
                {player.legal_rep1_phone && (
                  <ProfileField label="Téléphone" value={player.legal_rep1_phone} />
                )}
              </div>
            </ProfileSection>
          </div>
        )}
      </ProfileCard>

      {financeEnabled && player?.id && (
        <MyInvoicesBlock
          memberIds={[player.id]}
          showMemberColumn={false}
        />
      )}

      <MesValidations />

      <CalendarSubscription />

      <ChangePasswordSection />

      <TermsAcceptanceSection />

      <DeleteAccountSection />
        </>
      )}

      <EmailChangeModal
        isOpen={showEmailModal}
        currentEmail={originalEmail}
        onConfirm={handleEmailChangeConfirm}
        onCancel={() => {
          setShowEmailModal(false);
          if (player) setPlayer({ ...player, email: originalEmail });
        }}
      />
      <Toast toast={toast} />
      <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', marginTop: '24px', paddingBottom: '8px' }}>Version {__APP_VERSION__}</p>
    </div>
  );
}
