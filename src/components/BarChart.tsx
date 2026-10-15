import { useState, useMemo } from 'react';

interface BarChartData {
  label: string;
  value: number;
}

interface BarChartProps {
  data: BarChartData[];
  width?: number;
  height?: number;
  color?: string; // defaults to var(--accent) resolved at render
  formatValue?: (value: number) => string;
}

const getCSSVar = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function BarChart({
  data,
  width = 400,
  height = 200,
  color,
  formatValue = (v) => v.toFixed(2)
}: BarChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const tokens = useMemo(() => ({
    bar: color || getCSSVar('--accent'),
    gridLine: getCSSVar('--border-color'),
    axisLine: getCSSVar('--border-strong'),
    label: getCSSVar('--text-muted'),
    tooltipBg: getCSSVar('--bg-card'),
    tooltipBorder: getCSSVar('--border-color'),
    tooltipText: getCSSVar('--text-primary'),
  }), [color]);

  const padding = { top: 40, right: 20, bottom: 40, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const maxValue = Math.max(...data.map(d => d.value), 0);
  const yAxisSteps = 5;
  const rawMax = Math.ceil(maxValue / 100) * 100 || 100;
  const yAxisMax = Math.ceil(rawMax * 1.1 / 100) * 100;
  const yAxisStep = yAxisMax / yAxisSteps;

  const barWidth = chartWidth / data.length * 0.7;
  const barSpacing = chartWidth / data.length;

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <g transform={`translate(${padding.left}, ${padding.top})`}>
        {Array.from({ length: yAxisSteps + 1 }).map((_, i) => {
          const y = chartHeight - (i / yAxisSteps) * chartHeight;
          const value = (i / yAxisSteps) * yAxisMax;
          return (
            <g key={i}>
              <line
                x1={0}
                y1={y}
                x2={chartWidth}
                y2={y}
                stroke={tokens.gridLine}
                strokeWidth={1}
                opacity={0.5}
              />
              <text
                x={-10}
                y={y}
                textAnchor="end"
                alignmentBaseline="middle"
                fill={tokens.label}
                fontSize={11}
              >
                {value.toFixed(0)}
              </text>
            </g>
          );
        })}

        {data.map((item, index) => {
          const barHeight = (item.value / yAxisMax) * chartHeight;
          const x = index * barSpacing + (barSpacing - barWidth) / 2;
          const y = chartHeight - barHeight;
          const isHovered = hoveredIndex === index;

          return (
            <g key={index}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                fill={tokens.bar}
                rx={4}
                ry={4}
                style={{
                  cursor: 'pointer',
                  opacity: hoveredIndex === null || isHovered ? 1 : 0.6,
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              />

              <text
                x={index * barSpacing + barSpacing / 2}
                y={chartHeight + 20}
                textAnchor="middle"
                fill={tokens.label}
                fontSize={11}
              >
                {item.label}
              </text>

              {isHovered && item.value > 0 && (() => {
                const labelAbove = y >= 40;
                const tooltipY = labelAbove ? y - 35 : y + 5;
                const textY = labelAbove ? y - 15 : y + 25;
                const textFill = labelAbove ? tokens.tooltipText : 'var(--text-inverse)';
                return (
                  <g>
                    {labelAbove && (
                      <rect
                        x={x + barWidth / 2 - 45}
                        y={tooltipY}
                        width={90}
                        height={30}
                        fill={tokens.tooltipBg}
                        stroke={tokens.tooltipBorder}
                        strokeWidth={1}
                        rx={6}
                      />
                    )}
                    <text
                      x={x + barWidth / 2}
                      y={textY}
                      textAnchor="middle"
                      fill={textFill}
                      fontSize={12}
                      fontWeight={700}
                    >
                      CHF {formatValue(item.value)}
                    </text>
                  </g>
                );
              })()}
            </g>
          );
        })}

        <line
          x1={0}
          y1={chartHeight}
          x2={chartWidth}
          y2={chartHeight}
          stroke={tokens.axisLine}
          strokeWidth={1}
        />
        <line
          x1={0}
          y1={0}
          x2={0}
          y2={chartHeight}
          stroke={tokens.axisLine}
          strokeWidth={1}
        />
      </g>
    </svg>
  );
}
