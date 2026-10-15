interface GroupementBadgeProps {
  status: string | null | undefined;
  groupementId?: string | null;
  groupementName?: string | null;
}

export default function GroupementBadge({
  status,
  groupementId,
  groupementName,
}: GroupementBadgeProps) {
  const isGroupement = status === 'groupement' || !!groupementId;
  if (!isGroupement) return null;

  return (
    <span
      title={groupementName ? `Groupement : ${groupementName}` : 'Groupement'}
      className="badge badge-green"
      style={{
        borderRadius: 6,
        padding: '1px 6px',
        fontSize: 10,
        fontWeight: 700,
        marginLeft: 6,
        flexShrink: 0,
      }}
    >
      GRP
    </span>
  );
}
