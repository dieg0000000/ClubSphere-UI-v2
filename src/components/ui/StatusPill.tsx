import { ReactNode } from 'react';

type StatusVariant =
  | 'blue'
  | 'green'
  | 'orange'
  | 'yellow'
  | 'red'
  | 'neutral'
  | 'violet'
  | 'sky';

interface StatusPillProps {
  variant?: StatusVariant;
  children: ReactNode;
  className?: string;
}

const DOT_COLORS: Record<StatusVariant, string> = {
  blue: 'var(--info)',
  green: 'var(--success)',
  orange: 'var(--orange-text)',
  yellow: 'var(--warning)',
  red: 'var(--danger)',
  neutral: 'var(--text-muted)',
  violet: 'var(--purple-text)',
  sky: 'var(--sky-text)',
};

export function StatusPill({ variant = 'neutral', children, className }: StatusPillProps) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 10px',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: 600,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        color: 'var(--text-primary)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: DOT_COLORS[variant],
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
      {children}
    </span>
  );
}
