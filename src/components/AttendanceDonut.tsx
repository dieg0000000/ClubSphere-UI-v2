interface Segment {
  value: number;
  color: string;
}

interface Props {
  presentReal: number;
  absentJustified: number;
  absentUnjustified: number;
  centerLabel: string;
  size?: number;
  strokeWidth?: number;
  empty?: boolean;
}

const POLAR = (cx: number, cy: number, r: number, angleDeg: number) => {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};

const arcPath = (cx: number, cy: number, r: number, startAngle: number, endAngle: number): string => {
  const start = POLAR(cx, cy, r, endAngle);
  const end = POLAR(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
};

export function AttendanceDonut({
  presentReal,
  absentJustified,
  absentUnjustified,
  centerLabel,
  size = 140,
  strokeWidth = 18,
  empty = false,
}: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - strokeWidth) / 2;

  const segments: Segment[] = empty
    ? []
    : [
        { value: presentReal, color: 'var(--success)' },
        { value: absentJustified, color: 'var(--warning)' },
        { value: absentUnjustified, color: 'var(--danger)' },
      ];

  const total = segments.reduce((a, s) => a + s.value, 0);

  let cursor = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--accent-soft)" strokeWidth={strokeWidth} />
      {total > 0 && segments.map((s, i) => {
        if (s.value <= 0) return null;
        const startAngle = (cursor / total) * 360;
        cursor += s.value;
        const endAngle = (cursor / total) * 360;
        if (endAngle - startAngle >= 359.999) {
          return (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={strokeWidth}
            />
          );
        }
        return (
          <path
            key={i}
            d={arcPath(cx, cy, r, startAngle, endAngle)}
            fill="none"
            stroke={s.color}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
          />
        );
      })}
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fill={empty || total === 0 ? 'var(--text-muted)' : 'var(--text-primary)'}
        fontSize={empty || total === 0 ? 13 : 22}
        fontWeight={700}
      >
        {centerLabel}
      </text>
    </svg>
  );
}
