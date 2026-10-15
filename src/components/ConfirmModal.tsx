import { Trash2, TriangleAlert as AlertTriangle, Info } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmStyle?: 'danger' | 'warning' | 'primary';
  loading?: boolean;
  loadingLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

import Button from './ui/Button';

export const ConfirmModal = ({
  isOpen, title, message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  confirmStyle = 'danger',
  loading = false,
  loadingLabel,
  onConfirm, onCancel
}: ConfirmModalProps) => {
  if (!isOpen) return null;

  const confirmVariant: 'primary' | 'destructive' = confirmStyle === 'danger' ? 'destructive' : 'primary';

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.6)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        padding: '28px',
        width: '400px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
      }}>
        <div style={{
          fontSize: '36px', textAlign: 'center',
          marginBottom: '16px'
        }}>
          {confirmStyle === 'danger' ? <Trash2 className="w-9 h-9 mx-auto" style={{ color: 'var(--danger)' }} />
            : confirmStyle === 'warning' ? <AlertTriangle className="w-9 h-9 mx-auto" style={{ color: 'var(--warning)' }} /> : <Info className="w-9 h-9 mx-auto" style={{ color: 'var(--accent)' }} />}
        </div>
        <h3 style={{
          color: 'var(--text-primary)', textAlign: 'center',
          marginBottom: '8px', fontSize: '18px',
          fontWeight: '700'
        }}>
          {title}
        </h3>
        <div style={{
          color: 'var(--text-secondary)', textAlign: 'center',
          fontSize: '14px', marginBottom: '24px',
          lineHeight: '1.5'
        }}>
          {message}
        </div>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={confirmVariant} onClick={onConfirm} disabled={loading}>
            {loading && (
              <svg
                className="animate-spin"
                style={{ width: '16px', height: '16px', flexShrink: 0 }}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
            {loading ? (loadingLabel || confirmLabel) : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
