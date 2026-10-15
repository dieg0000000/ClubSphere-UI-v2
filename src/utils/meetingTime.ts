function formatHhMm(totalMinutes: number): string {
  const m = ((totalMinutes % 1440) + 1440) % 1440
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

function parseMatchTime(matchTime: string | null | undefined): number | null {
  if (!matchTime) return null
  const match = /^(\d{1,2}):(\d{2})/.exec(matchTime)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

export function meetingTimeLine(matchTime: string | null | undefined, minutesBefore: number): string | null {
  const kickoff = parseMatchTime(matchTime)
  if (kickoff === null) return null
  return `Rendez-vous sur place à ${formatHhMm(kickoff - minutesBefore)}, match à ${formatHhMm(kickoff)}`
}
