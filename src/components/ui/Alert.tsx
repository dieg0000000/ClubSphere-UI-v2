import { ReactNode } from 'react';
import { CheckCircle, TriangleAlert, CircleAlert, Info, X, type LucideIcon } from 'lucide-react';

type AlertVariant = 'success' | 'warning' | 'danger' | 'info';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children?: ReactNode;
  onClose?: () => void;
  icon?: ReactNode;
  className?: string;
  action?: ReactNode;
}

const ICONS: Record<AlertVariant, LucideIcon> = {
  success: CheckCircle,
  warning: TriangleAlert,
  danger: CircleAlert,
  info: Info,
};

export function Alert({ variant = 'info', title, children, onClose, icon, className, action }: AlertProps) {
  const DefaultIcon = ICONS[variant];
  const soft = `var(--${variant}-soft)`;
  const text = `var(--${variant}-text)`;
  const base = `var(--${variant})`;

  return (
    <div
      role="alert"
      className={className}
      style={{
        display: 'flex',
        alignItems: action ? 'center' : 'flex-start',
        gap: '12px',
        padding: '14px 16px',
        borderRadius: '10px',
        background: soft,
        border: `1px solid ${base}`,
        color: text,
      }}
    >
      <span style={{ display: 'flex', flexShrink: 0, marginTop: action ? 0 : '1px', color: base }}>
        {icon ?? <DefaultIcon size={18} />}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        {title && (
          <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: children ? '2px' : 0 }}>
            {title}
          </div>
        )}
        {children && (
          <div style={{ fontSize: '13px', lineHeight: 1.5, opacity: 0.95 }}>{children}</div>
        )}
      </div>

      {action && (
        <div style={{ display: 'flex', flexShrink: 0, alignItems: 'center' }}>
          {action}
        </div>
      )}

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: text,
            opacity: 0.6,
            padding: '2px',
            display: 'flex',
            flexShrink: 0,
            borderRadius: '6px',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '0.6';
          }}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
