import { useCallback } from 'react';
import { Ban, Mail, Smartphone, Calendar, Tag, Users, GraduationCap, TriangleAlert as AlertTriangle, Link2 } from 'lucide-react';
import useEscapeKey from '../hooks/useEscapeKey';

interface DuplicateInfo {
  type: 'avs' | 'js' | 'asf';
  person: {
    id: string;
    first_name: string;
    last_name: string;
    email?: string | null;
    phone?: string | null;
    birth_date?: string | null;
    table: 'Joueur' | 'Entraîneur' | 'Comité';
    team_name?: string | null;
    role?: string | null;
    qualification_name?: string | null;
  };
  crossTable?: boolean;
}

interface Props {
  duplicateInfo: DuplicateInfo | null;
  onClose: () => void;
  onLink?: () => void;
  linking?: boolean;
  currentEmail?: string | null;
}

export default function DuplicatePersonModal({ duplicateInfo, onClose, onLink, linking, currentEmail }: Props) {
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEscapeKey(handleClose);

  if (!duplicateInfo) return null;

  const { type, person, crossTable } = duplicateInfo;

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const getInitials = () => {
    return `${person.first_name[0]}${person.last_name[0]}`;
  };

  const accentColor = crossTable ? 'var(--accent)' : 'var(--danger)';
  const softColor = crossTable ? 'var(--accent-soft)' : 'var(--danger-soft)';
  const textColor = crossTable ? 'var(--accent-text)' : 'var(--danger-text)';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}
    >
      <div
        style={{
          background: 'var(--bg-modal)',
          border: `2px solid ${accentColor}`,
          borderRadius: '22px',
          padding: '28px',
          width: '440px',
          maxWidth: '90vw',
          boxShadow: 'var(--shadow-lg)'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '20px',
            paddingBottom: '16px',
            borderBottom: `1px solid ${accentColor}`
          }}
        >
          <div
            style={{
              background: accentColor,
              borderRadius: '50%',
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              flexShrink: 0
            }}
          >
            {crossTable
              ? <Link2 className="w-5 h-5 text-white" />
              : <Ban className="w-5 h-5 text-white" />}
          </div>
          <div>
            <h2
              style={{
                color: accentColor,
                margin: 0,
                fontSize: '18px',
                fontWeight: '700'
              }}
            >
              {crossTable
                ? `Cette personne existe déjà comme ${person.table === 'Joueur' ? 'joueur' : person.table === 'Entraîneur' ? 'entraîneur' : 'membre du comité'}`
                : `Numéro ${type === 'avs' ? 'AVS' : type === 'js' ? 'J+S' : 'Licence ASF'} déjà utilisé`}
            </h2>
            <p
              style={{
                color: textColor,
                margin: 0,
                fontSize: '13px'
              }}
            >
              {crossTable
                ? `Même numéro ${type === 'avs' ? 'AVS' : type === 'js' ? 'J+S' : 'Licence ASF'} — S'agit-il de la même personne ?`
                : 'Ce numéro est déjà attribué à une autre personne'}
            </p>
          </div>
        </div>

        <div
          style={{
            background: softColor,
            border: `1px solid ${accentColor}`,
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '20px'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              marginBottom: '14px'
            }}
          >
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                background: accentColor,
                border: `2px solid ${accentColor}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-inverse)',
                fontWeight: '800',
                fontSize: '18px',
                flexShrink: 0
              }}
            >
              {getInitials()}
            </div>
            <div>
              <div
                style={{
                  color: textColor,
                  fontWeight: '700',
                  fontSize: '17px'
                }}
              >
                {person.first_name} {person.last_name}
              </div>
              <span
                style={{
                  background: accentColor,
                  color: 'var(--text-inverse)',
                  fontSize: '11px',
                  fontWeight: '600',
                  padding: '2px 10px',
                  borderRadius: '99px',
                  marginTop: '4px',
                  display: 'inline-block'
                }}
              >
                {person.table}
              </span>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              paddingTop: '10px',
              borderTop: `1px solid ${accentColor}`
            }}
          >
            {person.email && (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', color: textColor, fontSize: '14px' }}>
                <Mail className="w-4 h-4" style={{ flexShrink: 0 }} />
                <span>{person.email}</span>
              </div>
            )}
            {person.phone && (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', color: textColor, fontSize: '14px' }}>
                <Smartphone className="w-4 h-4" style={{ flexShrink: 0 }} />
                <span>{person.phone}</span>
              </div>
            )}
            {person.birth_date && (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', color: textColor, fontSize: '14px' }}>
                <Calendar className="w-4 h-4" style={{ flexShrink: 0 }} />
                <span>{formatDate(person.birth_date)}</span>
              </div>
            )}
            {person.role && (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', color: textColor, fontSize: '14px' }}>
                <Tag className="w-4 h-4" style={{ flexShrink: 0 }} />
                <span>Rôle : <strong>{person.role}</strong></span>
              </div>
            )}
            {person.team_name && (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', color: textColor, fontSize: '14px' }}>
                <Users className="w-4 h-4" style={{ flexShrink: 0 }} />
                <span>Équipe : <strong>{person.team_name}</strong></span>
              </div>
            )}
            {person.qualification_name && (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', color: textColor, fontSize: '14px' }}>
                <GraduationCap className="w-4 h-4" style={{ flexShrink: 0 }} />
                <span>Qualification : <strong>{person.qualification_name}</strong></span>
              </div>
            )}
          </div>
        </div>

        {!crossTable && (
          <>
            <div
              style={{
                background: softColor,
                border: `1px solid ${accentColor}`,
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '20px',
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start'
              }}
            >
              <AlertTriangle className="w-4 h-4" style={{ flexShrink: 0, color: accentColor }} />
              <p style={{ color: textColor, margin: 0, fontSize: '13px', lineHeight: '1.5' }}>
                Veuillez vérifier s'il s'agit de la même personne avant de continuer. La sauvegarde a été bloquée pour éviter un doublon.
              </p>
            </div>

            <button
              onClick={onClose}
              style={{
                width: '100%',
                background: 'var(--danger)',
                color: 'var(--text-inverse)',
                border: 'none',
                borderRadius: '8px',
                padding: '13px',
                fontSize: '15px',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
            >
              Compris — Corriger le numéro
            </button>
          </>
        )}

        {crossTable && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {currentEmail && person.email && currentEmail.toLowerCase() !== person.email.toLowerCase() && (
              <div
                style={{
                  background: 'var(--warning-soft)',
                  border: '1px solid var(--warning)',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'flex-start'
                }}
              >
                <AlertTriangle className="w-4 h-4" style={{ flexShrink: 0, color: 'var(--warning)', marginTop: '2px' }} />
                <p style={{ color: 'var(--warning-text)', margin: 0, fontSize: '13px', lineHeight: '1.5' }}>
                  Les deux fiches ont des e-mails différents (« {currentEmail} » / « {person.email} »). Pour que cette personne n’ait qu’un seul compte, utilisez le même e-mail sur les deux fiches.
                </p>
              </div>
            )}
            <button
              onClick={onLink}
              disabled={linking}
              style={{
                width: '100%',
                background: accentColor,
                color: 'var(--text-inverse)',
                border: 'none',
                borderRadius: '8px',
                padding: '13px',
                fontSize: '15px',
                fontWeight: '700',
                cursor: linking ? 'wait' : 'pointer',
                opacity: linking ? 0.7 : 1,
                transition: 'opacity 0.2s'
              }}
            >
              {linking ? 'Liaison en cours…' : 'Oui, c’est la même personne — relier les fiches'}
            </button>
            <button
              onClick={onClose}
              disabled={linking}
              style={{
                width: '100%',
                background: 'transparent',
                color: textColor,
                border: `1px solid ${accentColor}`,
                borderRadius: '8px',
                padding: '13px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
            >
              Non, corriger le numéro
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
