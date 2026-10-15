import { ReactNode, useState } from 'react';

export interface TabItem {
  key: string;
  label: string;
  icon?: ReactNode;
  count?: number;
}

interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}

export function Tabs({ items, value, onChange, className }: TabsProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div
      role="tablist"
      className={className}
      style={{
        display: 'flex',
        gap: '2px',
        borderBottom: '1px solid var(--border-color)',
        flexWrap: 'wrap',
      }}
    >
      {items.map((item) => {
        const active = item.key === value;
        const isHover = hovered === item.key && !active;

        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.key)}
            onMouseEnter={() => setHovered(item.key)}
            onMouseLeave={() => setHovered(null)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              padding: '10px 13px',
              fontSize: '13px',
              fontWeight: 500,
              lineHeight: 1,
              color: active
                ? 'var(--accent-text)'
                : isHover
                ? 'var(--text-secondary)'
                : 'var(--text-muted)',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
              marginBottom: '-1px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'color 0.15s, border-color 0.15s',
            }}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined && (
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 700,
                  padding: '1px 7px',
                  borderRadius: '999px',
                  background: active ? 'var(--accent-soft)' : 'var(--bg-hover)',
                  color: active ? 'var(--accent-text)' : 'var(--text-muted)',
                }}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
