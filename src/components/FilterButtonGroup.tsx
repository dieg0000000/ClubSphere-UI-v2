import type { ReactNode } from 'react';

interface FilterOption {
  id: string;
  label: ReactNode;
  count?: number;
}

interface FilterButtonGroupProps {
  options: FilterOption[];
  selectedId: string | string[];
  onChange: (id: string) => void;
  className?: string;
}

export function FilterButtonGroup({ options, selectedId, onChange, className }: FilterButtonGroupProps) {
  const isSelected = (id: string) =>
    Array.isArray(selectedId) ? selectedId.includes(id) : selectedId === id;

  return (
    <div className={`filter-btn-group ${className ?? ''}`}>
      {options.map(opt => {
        const selected = isSelected(opt.id);
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`filter-btn ${selected ? 'filter-btn-selected' : ''}`}
            aria-pressed={selected}
          >
            <span>{opt.label}</span>
            {opt.count !== undefined && (
              <span className="filter-btn-count">{opt.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
