import { useState } from 'react';

interface PieChartData {
  name: string;
  value: number;
  color: string;
}

interface PieChartProps {
  data: PieChartData[];
  innerRadius?: number;
  outerRadius?: number;
  width?: number;
  height?: number;
  showLegend?: boolean;
}

export function PieChart({
  data,
  innerRadius = 0,
  outerRadius = 80,
  width = 300,
  height = 200,
  showLegend = true
}: PieChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const total = data.reduce((sum, d) => sum + d.value, 0);
  const centerX = width / 2;
  const centerY = showLegend ? height * 0.45 : height / 2;

  const createArc = (
    startAngle: number,
    endAngle: number,
    innerRad: number,
    outerRad: number
  ) => {
    const startInner = polarToCartesian(centerX, centerY, innerRad, endAngle);
    const endInner = polarToCartesian(centerX, centerY, innerRad, startAngle);
    const startOuter = polarToCartesian(centerX, centerY, outerRad, endAngle);
    const endOuter = polarToCartesian(centerX, centerY, outerRad, startAngle);

    const largeArc = endAngle - startAngle <= 180 ? '0' : '1';

    return [
      'M', startOuter.x, startOuter.y,
      'A', outerRad, outerRad, 0, largeArc, 0, endOuter.x, endOuter.y,
      'L', endInner.x, endInner.y,
      'A', innerRad, innerRad, 0, largeArc, 1, startInner.x, startInner.y,
      'Z'
    ].join(' ');
  };

  const polarToCartesian = (
    centerX: number,
    centerY: number,
    radius: number,
    angleInDegrees: number
  ) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians)
    };
  };

  let currentAngle = 0;
  const slices = data.map((item, index) => {
    const sliceAngle = (item.value / total) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + sliceAngle;
    currentAngle = endAngle;

    const isHovered = hoveredIndex === index;
    const radiusOffset = isHovered ? 5 : 0;

    return {
      ...item,
      startAngle,
      endAngle,
      path: createArc(
        startAngle,
        endAngle,
        innerRadius,
        outerRadius + radiusOffset
      ),
      percentage: ((item.value / total) * 100).toFixed(1)
    };
  });

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={width} height={height} style={{ overflow: 'visible' }}>
        <g>
          {slices.map((slice, index) => (
            <g key={index}>
              <path
                d={slice.path}
                fill={slice.color}
                stroke="var(--bg-card)"
                strokeWidth={2}
                style={{
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  opacity: hoveredIndex === null || hoveredIndex === index ? 1 : 0.6
                }}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
              {hoveredIndex === index && (
                <g>
                  <rect
                    x={centerX - 60}
                    y={centerY - 35}
                    width={120}
                    height={50}
                    fill="var(--bg-card)"
                    stroke="var(--border-color)"
                    strokeWidth={1}
                    rx={8}
                  />
                  <text
                    x={centerX}
                    y={centerY - 18}
                    textAnchor="middle"
                    fill="var(--text-primary)"
                    fontSize={12}
                    fontWeight={600}
                  >
                    {slice.name}
                  </text>
                  <text
                    x={centerX}
                    y={centerY - 2}
                    textAnchor="middle"
                    fill="var(--text-primary)"
                    fontSize={14}
                    fontWeight={700}
                  >
                    {slice.value}
                  </text>
                  <text
                    x={centerX}
                    y={centerY + 14}
                    textAnchor="middle"
                    fill="var(--text-muted)"
                    fontSize={11}
                  >
                    {slice.percentage}%
                  </text>
                </g>
              )}
            </g>
          ))}
        </g>
      </svg>

      {showLegend && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          justifyContent: 'center',
          marginTop: '12px',
          maxWidth: width
        }}>
          {data.map((item, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 8px',
                cursor: 'pointer',
                opacity: hoveredIndex === null || hoveredIndex === index ? 1 : 0.5,
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '2px',
                  backgroundColor: item.color
                }}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                {item.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
