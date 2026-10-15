const ALL_TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 15, 30, 45]) {
    ALL_TIME_OPTIONS.push(
      `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    );
  }
}
Object.freeze(ALL_TIME_OPTIONS);
export { ALL_TIME_OPTIONS };

export function computeGridTimeRange(
  slotStartTimes: string[],
  slotEndTimes: string[]
): string[] {
  const MIN_SPAN_HOURS = 4;

  if (slotStartTimes.length === 0) {
    return ALL_TIME_OPTIONS.filter(t => t >= '17:00' && t <= '21:30');
  }

  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const fromMin = (m: number) => {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  };

  const earliest = Math.min(...slotStartTimes.map(toMin));
  const latest = Math.max(...slotEndTimes.map(toMin));

  let startMin = Math.floor(earliest / 60) * 60;
  let endMin = Math.ceil(latest / 60) * 60;
  if (endMin === latest && latest % 60 !== 0) endMin += 60;

  if (endMin - startMin < MIN_SPAN_HOURS * 60) {
    const mid = Math.round((startMin + endMin) / 2);
    startMin = Math.max(0, mid - (MIN_SPAN_HOURS * 60) / 2);
    endMin = startMin + MIN_SPAN_HOURS * 60;
    if (endMin > 24 * 60) {
      endMin = 24 * 60;
      startMin = endMin - MIN_SPAN_HOURS * 60;
    }
  }

  startMin = Math.max(0, startMin);
  endMin = Math.min(24 * 60, endMin);

  return ALL_TIME_OPTIONS.filter(t => {
    const m = toMin(t);
    return m >= startMin && m < endMin;
  });
}
