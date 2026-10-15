interface Props {
  total: number;
  filtered?: number;
  isFiltered?: boolean;
}

const fmt = (n: number) =>
  n.toLocaleString('de-CH');

export default function PageTitleCount({ total, filtered, isFiltered }: Props) {
  const showFiltered = isFiltered && filtered !== undefined && filtered !== total;

  return (
    <span className="text-lg font-normal" style={{ color: 'var(--text-muted)' }}>
      {showFiltered
        ? `– Filtrés ${fmt(filtered!)}`
        : `– ${fmt(total)}`}
    </span>
  );
}
