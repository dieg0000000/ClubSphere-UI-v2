import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface StandardModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: string;
  maxHeight?: string;
  children: ReactNode;
}

export function StandardModal({
  isOpen,
  onClose,
  title,
  subtitle,
  width = '480px',
  maxHeight,
  children
}: StandardModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg-modal)',
        border: '1px solid var(--border-color)',
        borderRadius: '22px',
        width,
        maxWidth: '100%',
        maxHeight: maxHeight || undefined,
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 24px',
          background: 'var(--bg-modal-header)',
          borderBottom: '1px solid var(--border-color)',
          flexShrink: 0,
        }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-modal-header)', margin: 0 }}>
              {title}
            </h3>
            {subtitle && (
              <div style={{ fontSize: '12px', color: 'var(--text-modal-header)', opacity: 0.75, marginTop: '2px' }}>
                {subtitle}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-modal-header)', padding: '6px',
              borderRadius: '8px', display: 'flex', flexShrink: 0,
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          >
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>
        <div style={{
          padding: '24px',
          overflowY: maxHeight ? 'auto' : undefined,
          flex: maxHeight ? 1 : undefined,
        }}>
          {children}
        </div>
      </div>
    </div>
  );
}
