interface SortableHeaderProps {
  label: string;
  field: string;
  sortField: string | null;
  sortDir: 'asc' | 'desc';
  onSort: (field: string) => void;
  style?: React.CSSProperties;
  className?: string;
}

export function SortableHeader({ label, field, sortField, sortDir, onSort, style, className }: SortableHeaderProps) {
  return (
    <th
      onClick={() => onSort(field)}
      className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors${className ? ` ${className}` : ''}`}
      style={{ color: 'var(--text-secondary)', ...style }}
    >
      {label} {sortField === field ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
    </th>
  );
}
