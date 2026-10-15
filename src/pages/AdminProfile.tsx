import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import { User, Mail, Phone, MapPin, Shield } from 'lucide-react';
import { ChangePasswordSection } from '../components/ChangePasswordSection';
import { TermsAcceptanceSection } from '../components/TermsAcceptanceSection';
import { CalendarSubscription } from '../components/CalendarSubscription';
import { DeleteAccountSection } from '../components/DeleteAccountSection';
import { MyInvoicesBlock } from '../components/MyInvoicesBlock';
import { useFinanceModuleEnabled } from '../hooks/useFinanceModuleEnabled';
import { MfaEnrollmentCard } from '../components/MfaEnrollmentCard';
import { useMfaStatus } from '../hooks/useMfaStatus';
import { EmailChangeModal } from '../components/EmailChangeModal';
import { updateUserEmail } from '../lib/updateEmail';
import {
  ProfileCard, ProfileHeader, ProfileSection, ProfileField,
  ProfileNotFound, ProfileLoading,
} from '../components/ProfileLayout';
import ProfilePhotoUpload from '../components/profile/ProfilePhotoUpload';
import ProfileTabsBar, { useProfileTab } from '../components/ProfileTabsBar';
import NotificationsPanel from '../components/NotificationsPanel';
import { formatPhone } from '../utils/phoneHelpers';
import PhoneInput from '../components/PhoneInput';
import { useConfrerieBadge } from '../hooks/useConfrerieBadge';

interface AdminProfileData {
  id: string;
  email: string;
  full_name: string;
  first_name: string;
  last_name: string;
  role: string;
  phone: string | null;
  address: string | null;
  npa: string | null;
  city: string | null;
}

interface MemberSnapshot {
  id: string;
  asf_licence_number: string | null;
  js_number: string | null;
  licence_status: string | null;
}

export default function AdminProfile() {
  const { user } = useAuth();
  const { tab, setTab } = useProfileTab();
  const { enabled: financeEnabled } = useFinanceModuleEnabled();
  const confrerieBadge = useConfrerieBadge();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<AdminProfileData | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [originalEmail, setOriginalEmail] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberSnapshot[]>([]);
  const { toast, showToast } = useToast();
  const mfa = useMfaStatus();

  useEffect(() => { document.title = 'Mon Profil - ClubSphere' }, [])

  useEffect(() => {
    fetchProfile();
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { setNotFound(true); return; }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, phone, address, npa, city, avatar_url, first_name, last_name')
        .eq('id', authUser.id)
        .maybeSingle();

      if (error) throw error;
      if (!data) { setNotFound(true); return; }

      const { avatar_url, ...profileFields } = data;
      setProfile({
        ...profileFields,
        first_name: profileFields.first_name || '',
        last_name: profileFields.last_name || '',
      });
      setPhotoUrl(avatar_url || null);
      setOriginalEmail(data.email || '');

      const email = (data.email || '').trim().toLowerCase();
      if (email) {
        const { data: memberRows } = await supabase
          .from('members')
          .select('id, asf_licence_number, js_number, licence_status')
          .ilike('email', email)
          .neq('status', 'archive');
        setMembers(memberRows || []);
      }
    } catch (err) {
      console.error('Error fetching admin profile:', err);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const handleEditToggle = () => {
    if (isEditing) {
      if (profile && profile.email !== originalEmail) { setShowEmailModal(true); return; }
      doSave(profile?.email || originalEmail);
    } else {
      setIsEditing(true);
    }
  };

  const doSave = async (email: string) => {
    if (!profile) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: `${profile.first_name} ${profile.last_name}`.trim() || profile.full_name,
          first_name: profile.first_name,
          last_name: profile.last_name,
          email,
          phone: profile.phone,
          address: profile.address,
          npa: profile.npa,
          city: profile.city,
        })
        .eq('id', profile.id);
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
    if (!profile || !user) return;
    await updateUserEmail(user.id, newEmail, originalEmail);
    setShowEmailModal(false);
    await supabase.auth.signOut();
    window.location.href = '/login?message=email_changed';
  };

  const getInitials = (name: string) => {
    const parts = name?.trim().split(' ') || [];
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return (name || '?').slice(0, 2).toUpperCase();
  };

  if (loading) return <ProfileLoading />;
  if (notFound || !profile) return <ProfileNotFound />;

  return (
    <div className="space-y-5">
      <ProfileTabsBar value={tab} onChange={setTab} />

      {tab === 'notifications' ? (
        <NotificationsPanel />
      ) : (
        <>
      <ProfileCard>
        <ProfileHeader
          initials={getInitials(profile.full_name || profile.email)}
          avatarUrl={photoUrl}
          fullName={profile.full_name || profile.email}
          role={profile.role}
          confrerieBadge={confrerieBadge}
          isEditing={isEditing}
          saving={saving}
          onEditToggle={handleEditToggle}
          photoSlot={user?.id ? (
            <ProfilePhotoUpload
              variant="badge"
              memberId={user.id}
              userId={user.id}
              currentPhotoUrl={photoUrl}
              onPhotoUpdated={(url) => setPhotoUrl(url)}
            />
          ) : undefined}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ProfileSection icon={<User size={16} />} title="Identité">
            <ProfileField
              label="Prénom"
              value={profile.first_name}
              isEditing={isEditing}
              onChange={(v) => setProfile({ ...profile, first_name: v })}
            />
            <ProfileField
              label="Nom"
              value={profile.last_name}
              isEditing={isEditing}
              onChange={(v) => setProfile({ ...profile, last_name: v })}
            />
          </ProfileSection>

          <ProfileSection icon={<Mail size={16} />} title="Email">
            <ProfileField
              label="Email"
              value={profile.email}
              isEditing={isEditing}
              type="email"
              onChange={(v) => setProfile({ ...profile, email: v })}
            />
          </ProfileSection>

          <ProfileSection icon={<Phone size={16} />} title="Téléphone">
            <ProfileField
              label="Mobile"
              value={formatPhone(profile.phone || '')}
              isEditing={isEditing}
            >
              {isEditing ? (
                <PhoneInput
                  value={profile.phone || ''}
                  onChange={(v) => setProfile({ ...profile, phone: v })}
                />
              ) : undefined}
            </ProfileField>
          </ProfileSection>

          <ProfileSection icon={<MapPin size={16} />} title="Adresse">
            <ProfileField
              label="Rue"
              value={profile.address}
              isEditing={isEditing}
              onChange={(v) => setProfile({ ...profile, address: v })}
            />
            <div className="grid grid-cols-2 gap-3">
              <ProfileField
                label="NPA"
                value={profile.npa}
                isEditing={isEditing}
                onChange={(v) => setProfile({ ...profile, npa: v })}
              />
              <ProfileField
                label="Localité"
                value={profile.city}
                isEditing={isEditing}
                onChange={(v) => setProfile({ ...profile, city: v })}
              />
            </div>
          </ProfileSection>
        </div>
      </ProfileCard>

      {members.length > 0 && (
        <ProfileCard>
          <ProfileSection icon={<Shield size={16} />} title="Informations Football">
            {members.map((m) => (
              <div key={m.id}>
                <ProfileField label="Numéro ASF" value={m.asf_licence_number || '—'} />
                <ProfileField label="Numéro J+S" value={m.js_number || '—'} />
                <ProfileField label="Statut Licence">
                  <div
                    className="rounded-md text-sm"
                    style={{ background: 'var(--bg-card-hover)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '10px 14px' }}
                  >
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                      style={
                        m.licence_status === 'actif'
                          ? { background: 'var(--success-soft)', color: 'var(--success-text)' }
                          : { background: 'var(--bg-hover)', color: 'var(--text-muted)' }
                      }
                    >
                      {m.licence_status || '—'}
                    </span>
                  </div>
                </ProfileField>
              </div>
            ))}
          </ProfileSection>
        </ProfileCard>
      )}

      {financeEnabled && members.length > 0 && (
        <MyInvoicesBlock
          memberIds={members.map((m) => m.id)}
          showMemberColumn={members.length > 1}
          profileId={profile.id}
        />
      )}

      <CalendarSubscription />

      <ChangePasswordSection />

      <TermsAcceptanceSection />

      {mfa.isConcerned && (
        <div id="mfa-security-card">
          <MfaEnrollmentCard
            hasVerifiedFactor={mfa.hasVerifiedFactor}
            onEnrolled={() => mfa.refresh()}
          />
        </div>
      )}

      <DeleteAccountSection />
        </>
      )}

      <EmailChangeModal
        isOpen={showEmailModal}
        currentEmail={originalEmail}
        onConfirm={handleEmailChangeConfirm}
        onCancel={() => {
          setShowEmailModal(false);
          if (profile) setProfile({ ...profile, email: originalEmail });
        }}
      />
      <Toast toast={toast} />
      <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', marginTop: '24px', paddingBottom: '8px' }}>Version {__APP_VERSION__}</p>
    </div>
  );
}
