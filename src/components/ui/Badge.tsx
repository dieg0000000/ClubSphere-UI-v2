import { ReactNode } from 'react';

export type BadgeVariant =
  | 'blue'
  | 'green'
  | 'green-outline'
  | 'orange'
  | 'yellow'
  | 'red'
  | 'neutral'
  | 'violet'
  | 'sky'
  | 'pink';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function Badge({ variant = 'neutral', children, icon, className }: BadgeProps) {
  return (
    <span className={`badge badge-${variant} ${className ?? ''}`}>
      {icon && <span className="badge-icon">{icon}</span>}
      {children}
    </span>
  );
}
