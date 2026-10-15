import { useState, useRef, useEffect } from 'react';
import { X, CreditCard as Edit2, Download, Camera } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRefreshablePhoto, invalidateMemberPhoto } from '../hooks/useMemberPhotos';
import { processPassportPhoto } from '../lib/imageProcessing';
import { supabase } from '../lib/supabase';
import { ZoomablePhoto } from './PhotoViewer';

interface BaseProfileSlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  onEdit?: () => void;
  children: React.ReactNode;
}

export function ProfileSlideOver({ isOpen, onClose, onEdit, children }: BaseProfileSlideOverProps) {
  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 w-full sm:w-[480px] shadow-xl z-50 overflow-y-auto animate-slide-in" style={{ background: 'var(--bg-card)' }}>
        <div className="sticky top-0 px-6 py-4 flex items-center justify-between" style={{ background: 'var(--bg-modal-header)' }}>
          <h2 className="text-xl font-semibold" style={{ color: 'var(--text-modal-header)' }}>Profil complet</h2>
          <div className="flex gap-2">
            {onEdit && (
              <button
                onClick={onEdit}
                className="p-2 rounded-lg hover:opacity-80 transition-opacity"
                style={{ color: 'var(--text-modal-header)' }}
                aria-label="Modifier"
              >
                <Edit2 size={20} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:opacity-80 transition-opacity"
              style={{ color: 'var(--text-modal-header)' }}
              aria-label="Fermer"
            >
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </>
  );
}

interface FieldProps {
  label: string;
  value: string | null | undefined;
  type?: 'text' | 'email' | 'phone' | 'url';
}

export function ProfileField({ label, value, type = 'text' }: FieldProps) {
  if (!value) return null;

  const renderValue = () => {
    switch (type) {
      case 'email':
        return (
          <a href={`mailto:${value}`} style={{ color: 'var(--accent)' }} className="hover:opacity-80">
            {value}
          </a>
        );
      case 'phone':
        return (
          <a href={`tel:${value}`} style={{ color: 'var(--accent)' }} className="hover:opacity-80">
            {value}
          </a>
        );
      case 'url':
        return (
          <a href={value} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }} className="hover:opacity-80">
            {value}
          </a>
        );
      default:
        return <span style={{ color: 'var(--text-primary)' }}>{value}</span>;
    }
  };

  return (
    <div className="mb-4">
      <dt className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</dt>
      <dd className="text-base">{renderValue()}</dd>
    </div>
  );
}

export function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold mb-4 pb-2 border-b" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-color)' }}>
        {title}
      </h3>
      <dl>
        {children}
      </dl>
    </div>
  );
}

interface CommitteeMemberProfile {
  id: string;
  first_name: string;
  last_name: string;
  role: string | null;
  email: string | null;
  public_email: string | null;
  phone: string | null;
  hide_phone: boolean;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  avs_number: string | null;
  profile_photo_url: string | null;
  coach_id: string | null;
  qualification_name: string | null;
}

export function CommitteeProfileContent({ member }: { member: CommitteeMemberProfile }) {
  const { effectiveRole } = useAuth();
  const isAdmin = effectiveRole === 'admin';

  return (
    <>
      <div className="flex items-center gap-4 mb-6">
        {member.profile_photo_url ? (
          <ZoomablePhoto
            src={member.profile_photo_url}
            caption={`${member.first_name} ${member.last_name}`}
            alt=""
            className="w-20 h-20 rounded-full object-cover"
          />
        ) : (
          <div className="w-20 h-20 rounded-full flex items-center justify-center text-xl font-medium" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
            {member.first_name[0]}{member.last_name[0]}
          </div>
        )}
        <div>
          <h3 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {member.first_name} {member.last_name}
          </h3>
          {member.role && (
            <span className="inline-block mt-2 px-3 py-1 rounded-full text-sm font-medium bg-primary-500/20 text-primary-400">
              {member.role}
            </span>
          )}
        </div>
      </div>

      <ProfileSection title="Contact">
        <ProfileField label="Email" value={member.public_email || member.email} type="email" />
        {member.phone ? (
          <div className="flex items-center gap-2">
            <div className="flex-1"><ProfileField label="Mobile" value={member.phone} type="phone" /></div>
            {isAdmin && member.hide_phone && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium" style={{ background: 'var(--warning-soft, #fef3c7)', color: 'var(--warning-text, #92400e)', fontSize: '10px' }}>Numéro masqué</span>}
          </div>
        ) : null}
      </ProfileSection>

      {(member.address || member.postal_code || member.city) && (
        <ProfileSection title="Adresse">
          <ProfileField label="Rue" value={member.address} />
          <ProfileField label="Code postal" value={member.postal_code} />
          <ProfileField label="Ville" value={member.city} />
        </ProfileSection>
      )}

      {isAdmin && member.avs_number && (
        <ProfileSection title="Informations administratives">
          <ProfileField label="Numéro AVS" value={member.avs_number} />
        </ProfileSection>
      )}

      {member.qualification_name && (
        <ProfileSection title="Qualification entraîneur">
          <ProfileField label="Qualification" value={member.qualification_name} />
        </ProfileSection>
      )}
    </>
  );
}

interface RefereeProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  licence_level: string | null;
  active: boolean;
}

export function RefereeProfileContent({ referee }: { referee: RefereeProfile }) {
  return (
    <>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-20 h-20 rounded-full flex items-center justify-center text-xl font-medium" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
          {referee.first_name[0]}{referee.last_name[0]}
        </div>
        <div>
          <h3 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {referee.first_name} {referee.last_name}
          </h3>
          <span className={`inline-block mt-2 px-3 py-1 rounded-full text-sm font-medium`}
            style={{ background: referee.active ? 'var(--success-soft)' : 'var(--bg-hover)', color: referee.active ? 'var(--success-text)' : 'var(--text-muted)' }}>
            {referee.active ? 'Actif' : 'Inactif'}
          </span>
        </div>
      </div>

      <ProfileSection title="Contact">
        <ProfileField label="Email" value={referee.email} type="email" />
        <ProfileField label="Mobile" value={referee.phone} type="phone" />
      </ProfileSection>

      <ProfileSection title="Licence">
        <ProfileField label="Niveau licence" value={referee.licence_level} />
      </ProfileSection>
    </>
  );
}

interface SponsorProfile {
  id: string;
  company_name: string;
  contact_first_name: string | null;
  contact_last_name: string | null;
  email: string | null;
  phone: string | null;
  company_phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  sponsoring_type: string | null;
  sponsoring_amount: number | null;
  sponsoring_since: string | null;
  logo_url: string | null;
  website_url: string | null;
  notes: string | null;
}

export function SponsorProfileContent({ sponsor }: { sponsor: SponsorProfile }) {
  const { effectiveRole } = useAuth();
  const isLeader = effectiveRole === 'admin' || effectiveRole === 'committee';

  return (
    <>
      <div className="flex items-center gap-4 mb-6">
        {sponsor.logo_url ? (
          <ZoomablePhoto
            src={sponsor.logo_url}
            caption={sponsor.company_name}
            alt={sponsor.company_name}
            className="w-20 h-20 object-contain rounded"
          />
        ) : (
          <div className="w-20 h-20 rounded flex items-center justify-center text-xs" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
            Logo
          </div>
        )}
        <div>
          <h3 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {sponsor.company_name}
          </h3>
        </div>
      </div>

      {sponsor.website_url && (
        <ProfileSection title="Site web">
          <ProfileField label="Site web" value={sponsor.website_url} type="url" />
        </ProfileSection>
      )}

      {isLeader && (
        <ProfileSection title="Contact">
          {(sponsor.contact_first_name || sponsor.contact_last_name) && (
            <ProfileField
              label="Personne de contact"
              value={`${sponsor.contact_first_name || ''} ${sponsor.contact_last_name || ''}`.trim()}
            />
          )}
          <ProfileField label="Email" value={sponsor.email} type="email" />
          <ProfileField label="Tél. société" value={sponsor.company_phone} type="phone" />
          <ProfileField label="Mobile" value={sponsor.phone} type="phone" />
        </ProfileSection>
      )}

      {isLeader && (
        <ProfileSection title="Adresse">
          <ProfileField label="Rue" value={sponsor.address} />
          <ProfileField label="Code postal" value={sponsor.postal_code} />
          <ProfileField label="Ville" value={sponsor.city} />
        </ProfileSection>
      )}

      {isLeader && (
        <ProfileSection title="Sponsoring">
          <ProfileField label="Type" value={sponsor.sponsoring_type} />
          <ProfileField
            label="Montant"
            value={sponsor.sponsoring_amount ? `CHF ${sponsor.sponsoring_amount}` : null}
          />
          <ProfileField
            label="Depuis"
            value={sponsor.sponsoring_since ? new Date(sponsor.sponsoring_since).toLocaleDateString('fr-CH') : null}
          />
        </ProfileSection>
      )}

      {isLeader && sponsor.notes && (
        <ProfileSection title="Notes">
          <div className="whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>{sponsor.notes}</div>
        </ProfileSection>
      )}
    </>
  );
}

interface SupporterProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  member_since: string | null;
  members?: { first_name: string; last_name: string } | null;
}

export function SupporterProfileContent({ supporter }: { supporter: SupporterProfile }) {
  return (
    <>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-20 h-20 rounded-full flex items-center justify-center text-xl font-medium" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
          {supporter.first_name[0]}{supporter.last_name[0]}
        </div>
        <div>
          <h3 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {supporter.first_name} {supporter.last_name}
          </h3>
        </div>
      </div>

      <ProfileSection title="Contact">
        <ProfileField label="Email" value={supporter.email} type="email" />
        <ProfileField label="Mobile" value={supporter.phone} type="phone" />
      </ProfileSection>

      <ProfileSection title="Adresse">
        <ProfileField label="Rue" value={supporter.address} />
        <ProfileField label="Code postal" value={supporter.postal_code} />
        <ProfileField label="Ville" value={supporter.city} />
      </ProfileSection>

      <ProfileSection title="Membre">
        <ProfileField
          label="Membre depuis"
          value={supporter.member_since ? new Date(supporter.member_since).toLocaleDateString('fr-CH') : null}
        />
        {supporter.members && (
          <ProfileField
            label="Lien joueur"
            value={`${supporter.members.first_name} ${supporter.members.last_name}`}
          />
        )}
      </ProfileSection>
    </>
  );
}

interface MemberProfile {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  nationality: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  canton: string | null;
  js_number: string | null;
  licence_status: string;
  avs_number: string | null;
  asf_licence_number: string | null;
  photo_path: string | null;
  club_id: string | null;
  teams?: { name: string } | null;
  legal_rep1_firstname: string | null;
  legal_rep1_lastname: string | null;
  legal_rep1_phone: string | null;
  legal_rep1_email: string | null;
  legal_rep2_firstname: string | null;
  legal_rep2_lastname: string | null;
  legal_rep2_phone: string | null;
  legal_rep2_email: string | null;
  notes: string | null;
}

export function MemberProfileContent({ member }: { member: MemberProfile }) {
  const { effectiveRole } = useAuth();
  const canViewAvs = effectiveRole === 'admin' || effectiveRole === 'committee';
  const canManagePhoto = effectiveRole === 'admin' || effectiveRole === 'committee';
  const [photoPath, setPhotoPath] = useState(member.photo_path);
  const { signedUrl: photoUrl, refresh: refreshPhoto } = useRefreshablePhoto(photoPath);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const [repNameMap, setRepNameMap] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    const emails = [member.legal_rep1_email, member.legal_rep2_email].filter(Boolean) as string[];
    if (emails.length === 0) { setRepNameMap({}); return; }
    (async () => {
      const { data: links } = await supabase
        .from('parent_members')
        .select('parent_user_id')
        .eq('member_id', member.id);
      if (cancelled || !links?.length) return;
      const { data: profiles } = await supabase
        .from('profiles')
        .select('email, full_name')
        .in('id', links.map(l => l.parent_user_id));
      if (cancelled) return;
      const map: Record<string, string> = {};
      for (const p of profiles || []) {
        if (p.email && p.full_name) map[p.email.toLowerCase()] = p.full_name;
      }
      setRepNameMap(map);
    })();
    return () => { cancelled = true; };
  }, [member.id, member.legal_rep1_email, member.legal_rep2_email]);

  const handleUploadPhoto = async (file: File) => {
    if (!member.id) return;
    setUploading(true);
    try {
      const blob = await processPassportPhoto(file);
      const path = photoPath || `${member.club_id}/${member.id}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('member-photos')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;
      if (!photoPath) {
        const { error: dbError } = await supabase.from('members').update({ photo_path: path }).eq('id', member.id);
        if (dbError) throw dbError;
        invalidateMemberPhoto(path);
        setPhotoPath(path);
      } else {
        invalidateMemberPhoto(path);
        refreshPhoto();
      }
    } catch (err) {
      console.error('Error uploading photo:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadPhoto = () => {
    if (!photoUrl) return;
    const a = document.createElement('a');
    a.href = photoUrl;
    a.download = `${member.first_name}_${member.last_name}.jpg`;
    a.target = '_blank';
    a.click();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'actif':
        return { background: 'var(--success-soft)', color: 'var(--success-text)' };
      case 'inactif':
        return { background: 'var(--danger-soft)', color: 'var(--danger-text)' };
      default:
        return { background: 'var(--warning-soft)', color: 'var(--warning-text)' };
    }
  };

  return (
    <>
      <div className="flex items-start gap-4 mb-6">
        <div className="relative flex-shrink-0">
          {photoUrl ? (
            <ZoomablePhoto
              src={photoUrl}
              caption={`${member.first_name} ${member.last_name}`}
              alt=""
              className="rounded-lg object-cover"
              style={{ width: 120, height: 154, border: '1px solid var(--border-color)' }}
            />
          ) : (
            <div className="rounded-lg flex flex-col items-center justify-center" style={{ width: 120, height: 154, background: 'var(--bg-hover)', border: '1px dashed var(--border-color)' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', marginBottom: 4 }}>
                <circle cx="12" cy="8" r="4" />
                <path d="M20 21a8 8 0 0 0-16 0" />
              </svg>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Pas de photo</span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 pt-1">
          <div>
            <h3 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {member.first_name} {member.last_name}
            </h3>
            <span className={`inline-block mt-2 px-3 py-1 rounded-full text-sm font-medium`}
              style={getStatusColor(member.licence_status)}>
              {member.licence_status}
            </span>
          </div>
          {canManagePhoto && (
            <div className="flex flex-col gap-1.5 mt-2">
              {photoUrl ? (
                <>
                  <button
                    onClick={handleDownloadPhoto}
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
                    style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
                  >
                    <Download size={14} />
                    Télécharger la photo
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
                    style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
                  >
                    <Camera size={14} />
                    {uploading ? 'Remplacement...' : 'Remplacer la photo'}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
                  style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
                >
                  <Camera size={14} />
                  {uploading ? 'Ajout en cours...' : 'Ajouter une photo'}
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUploadPhoto(f);
                  e.target.value = '';
                }}
              />
            </div>
          )}
        </div>
      </div>

      <ProfileSection title="Informations générales">
        {member.teams && (
          <ProfileField label="Équipe" value={member.teams.name} />
        )}
        <ProfileField
          label="Date de naissance"
          value={member.birth_date ? new Date(member.birth_date).toLocaleDateString('fr-CH') : null}
        />
        <ProfileField label="Nationalité" value={member.nationality} />
        <ProfileField label="Numéro J+S" value={member.js_number} />
      </ProfileSection>

      <ProfileSection title="Contact">
        <ProfileField label="Email" value={member.email} type="email" />
        <ProfileField label="Mobile" value={member.phone} type="phone" />
      </ProfileSection>

      <ProfileSection title="Adresse">
        <ProfileField label="Rue" value={member.address} />
        <ProfileField label="Code postal" value={member.postal_code} />
        <ProfileField label="Ville" value={member.city} />
        <ProfileField label="Canton" value={member.canton} />
      </ProfileSection>

      {(member.avs_number || member.asf_licence_number) && (
        <ProfileSection title="Documents administratifs">
          {canViewAvs && <ProfileField label="Numéro AVS" value={member.avs_number} />}
          <ProfileField label="Numéro de licence ASF" value={member.asf_licence_number} />
        </ProfileSection>
      )}

      {(member.legal_rep1_firstname || member.legal_rep1_lastname || member.legal_rep1_email || member.legal_rep1_phone) && (
        <ProfileSection title="Représentant légal 1">
          <ProfileField
            label="Nom"
            value={(member.legal_rep1_firstname || member.legal_rep1_lastname) ? `${member.legal_rep1_firstname || ''} ${member.legal_rep1_lastname || ''}`.trim() : (member.legal_rep1_email && repNameMap[member.legal_rep1_email.toLowerCase()]) || member.legal_rep1_email}
          />
          <ProfileField label="Email" value={member.legal_rep1_email} type="email" />
          <ProfileField label="Mobile" value={member.legal_rep1_phone} type="phone" />
        </ProfileSection>
      )}

      {(member.legal_rep2_firstname || member.legal_rep2_lastname || member.legal_rep2_email || member.legal_rep2_phone) && (
        <ProfileSection title="Représentant légal 2">
          <ProfileField
            label="Nom"
            value={(member.legal_rep2_firstname || member.legal_rep2_lastname) ? `${member.legal_rep2_firstname || ''} ${member.legal_rep2_lastname || ''}`.trim() : (member.legal_rep2_email && repNameMap[member.legal_rep2_email.toLowerCase()]) || member.legal_rep2_email}
          />
          <ProfileField label="Email" value={member.legal_rep2_email} type="email" />
          <ProfileField label="Mobile" value={member.legal_rep2_phone} type="phone" />
        </ProfileSection>
      )}

      {member.notes && (
        <ProfileSection title="Notes">
          <div className="whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>{member.notes}</div>
        </ProfileSection>
      )}
    </>
  );
}
