import { type ReactNode } from 'react';
import { Upload, Award, TriangleAlert as AlertTriangle } from 'lucide-react';
import { ZoomablePhoto } from './PhotoViewer';

export const ROLE_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  admin:           { label: 'Administrateur', bg: 'var(--danger-soft)',   color: 'var(--danger-text)' },
  committee:       { label: 'Comité',         bg: 'var(--danger-soft)',   color: 'var(--danger-text)' },
  coach:           { label: 'Entraîneur',     bg: 'var(--success-soft)',  color: 'var(--success-text)' },
  assistant_coach: { label: 'Ass. entraîneur',bg: 'var(--success-soft)',  color: 'var(--success-text)' },
  member:          { label: 'Joueur·se',      bg: 'var(--orange-soft)',   color: 'var(--orange-text)' },
  parent:          { label: 'Parent',         bg: 'var(--purple-soft)',   color: 'var(--purple-text)' },
  supporter:       { label: 'Supporter',      bg: 'var(--accent-soft)',   color: 'var(--accent-text)' },
};

const ICON_COLOR = 'var(--accent)';

interface ConfrerieBadgeData {
  is_member: boolean;
  label: string | null;
  member_since: string | null;
}

interface ProfileHeaderProps {
  initials: string;
  avatarUrl?: string | null;
  fullName: string;
  role: string;
  teamName?: string | null;
  badgeExtra?: string | null;
  extraBadges?: string[];
  confrerieBadge?: ConfrerieBadgeData | null;
  isEditing: boolean;
  saving: boolean;
  canEdit?: boolean;
  onEditToggle: () => void;
  onPhotoUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploadingPhoto?: boolean;
  photoSlot?: ReactNode;
}

export function ProfileHeader({
  initials, avatarUrl, fullName, role, teamName, badgeExtra, extraBadges, confrerieBadge,
  isEditing, saving, canEdit = true, onEditToggle, onPhotoUpload, uploadingPhoto, photoSlot
}: ProfileHeaderProps) {
  const badge = ROLE_BADGE[role];

  return (
    <div className="ph-root">
      <div className="ph-top">
        <div className="ph-avatar-wrap">
          {avatarUrl ? (
            <ZoomablePhoto
              src={avatarUrl}
              caption={fullName}
              alt={fullName}
              className="ph-avatar"
              style={{ border: '3px solid var(--border-color)' }}
            />
          ) : (
            <div
              className="ph-avatar ph-avatar--initials"
              style={{ background: 'var(--accent)', color: 'var(--text-primary)', border: '3px solid var(--border-color)' }}
            >
              {initials}
            </div>
          )}
          {isEditing && onPhotoUpload && (
            <label
              className="absolute bottom-0 right-0 p-1.5 rounded-full cursor-pointer transition-opacity hover:opacity-80"
              style={{ background: 'var(--bg-sidebar)', border: '2px solid var(--border-color)' }}
            >
              <Upload size={14} style={{ color: 'var(--text-primary)' }} />
              <input
                type="file"
                accept="image/*"
                onChange={onPhotoUpload}
                className="hidden"
                disabled={uploadingPhoto}
              />
            </label>
          )}
          {photoSlot}
        </div>

        <div className="ph-meta">
          <h1 className="ph-name">
            {fullName}
          </h1>
          <div className="ph-badges">
            {badge && (
              <span className="ph-badge" style={{ background: badge.bg, color: badge.color }}>
                {badge.label}
              </span>
            )}
            {teamName && (
              <span className="ph-badge ph-badge--team" style={{ background: 'var(--accent-soft)', color: ICON_COLOR }}>
                {teamName}
              </span>
            )}
            {badgeExtra && (
              <span className="ph-badge" style={{ background: 'var(--accent-soft)', color: 'var(--text-secondary)' }}>
                {badgeExtra}
              </span>
            )}
            {extraBadges?.map((b, i) => (
              <span
                key={`${b}-${i}`}
                className="ph-badge"
                style={{ background: 'var(--accent-soft)', color: 'var(--text-secondary)' }}
              >
                {b}
              </span>
            ))}
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

      {canEdit && (
        <button
          onClick={onEditToggle}
          disabled={saving}
          className="ph-edit-btn"
          style={{ background: 'var(--accent)', color: 'var(--text-primary)' }}
        >
          {saving ? 'Enregistrement...' : isEditing ? 'Enregistrer' : 'Modifier mon profil'}
        </button>
      )}
    </div>
  );
}

interface ProfileSectionProps {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}

export function ProfileSection({ icon, title, children }: ProfileSectionProps) {
  return (
    <div
      className="space-y-4 rounded-xl p-6"
      style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color)' }}
    >
      <h2
        className="text-sm font-semibold flex items-center gap-2 pb-3"
        style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)' }}
      >
        <span style={{ color: ICON_COLOR }}>{icon}</span>
        {title}
      </h2>
      {children}
    </div>
  );
}

interface FieldProps {
  label: string | ReactNode;
  value?: string | null;
  isEditing?: boolean;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  onChange?: (val: string) => void;
  children?: ReactNode;
}

export function ProfileField({
  label, value, isEditing = false, type = 'text', placeholder, disabled = false, onChange, children
}: FieldProps) {
  const readOnly = !isEditing || disabled;

  return (
    <div>
      <label
        className="block uppercase"
        style={{
          color: 'var(--text-muted)',
          fontSize: '11px',
          letterSpacing: '0.05em',
          fontWeight: 500,
          marginBottom: '6px',
        }}
      >
        {label}
      </label>
      {children ? (
        children
      ) : readOnly ? (
        <div
          className="w-full rounded-md text-sm"
          style={{
            background: 'var(--bg-card-hover)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            padding: '10px 14px',
            color: 'var(--text-secondary)',
          }}
        >
          {value || '—'}
        </div>
      ) : (
        <input
          type={type}
          value={value || ''}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          className="w-full text-sm transition-colors"
          style={{
            background: 'var(--bg-card-hover)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            padding: '10px 14px',
            color: 'var(--text-primary)',
            outline: 'none',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; }}
        />
      )}
    </div>
  );
}

interface ProfileCardProps {
  children: ReactNode;
}

export function ProfileCard({ children }: ProfileCardProps) {
  return (
    <div
      className="rounded-xl p-6"
      style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color)' }}
    >
      {children}
    </div>
  );
}

export function ProfileNotFound() {
  return (
    <div className="flex items-center justify-center h-64">
      <div
        className="rounded-xl text-center"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          padding: '40px 56px',
        }}
      >
        <AlertTriangle className="w-10 h-10 mx-auto mb-4" style={{ color: 'var(--warning)' }} />
        <div className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
          Profil introuvable
        </div>
        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Contactez l'administrateur du club.
        </div>
      </div>
    </div>
  );
}

export function ProfileLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Chargement...</div>
    </div>
  );
}

export function MinorBanner({ repName, repPhone }: { repName?: string; repPhone?: string }) {
  return (
    <div
      className="mb-6 p-4 rounded-lg flex items-start gap-3"
      style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)' }}
    >
      <div className="mt-0.5 flex-shrink-0 text-base" style={{ color: 'var(--info-text)' }}>ℹ️</div>
      <div>
        <p className="font-medium mb-1 text-sm" style={{ color: 'var(--accent)' }}>
          Modification par représentant légal uniquement
        </p>
        {repName && repPhone && (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Contact : {repName} — {repPhone}
          </p>
        )}
      </div>
    </div>
  );
}
