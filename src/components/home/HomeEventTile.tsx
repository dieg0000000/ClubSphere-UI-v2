import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, ChevronRight, MapPin, User, Users } from 'lucide-react'
import Button from '../ui/Button'
import { Badge } from '../ui/Badge'
import AbsenceReasonSheet from '../AbsenceReasonSheet'
import { RainBadge } from '../RainBadge'
import { AttendancePill, genderLabel } from '../AttendanceButtons'
import { writeMatchResponse, writeTrainingResponse } from '../../lib/trainingAttendance'

export type TileAnswer = 'present' | 'absent' | null

export interface HomeTileEvent {
  key: string
  type: 'match' | 'training'
  id: string
  date: string
  time: string | null
  endTime: string | null
  teamName: string
  opponentName?: string
  isHome?: boolean
  location: string | null
  memberId: string
  memberFirstName: string
  memberFullName: string
  gender: string | null
  answer: TileAnswer
  cancelled?: boolean
  cancelledReason?: string | null
  locked?: boolean
  notConvoked?: boolean
  convocationRowId?: string | null
  unavailableText?: string | null
  rain_applied?: boolean
  rain_plan_defined?: boolean
  rain_note?: string | null
  base_terrain_name?: string | null
  base_start_time?: string | null
  base_end_time?: string | null
}

interface Props {
  event: HomeTileEvent
  userId: string
  onAnswered: (key: string, answer: Exclude<TileAnswer, null>) => void
}

const formatDate = (d: string) => {
  const str = new Date(`${d}T00:00:00`).toLocaleDateString('fr-CH', { weekday: 'short', day: 'numeric', month: 'short' })
  return str.charAt(0).toUpperCase() + str.slice(1)
}

const formatTime = (t: string | null) => {
  if (!t) return ''
  const [h, m] = t.split(':')
  return `${h}h${m}`
}

export default function HomeEventTile({ event, userId, onAnswered }: Props) {
  const [editing, setEditing] = useState(false)
  const [reasonOpen, setReasonOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const blocked = !!event.cancelled || !!event.notConvoked || !!event.unavailableText || !!event.locked
  const presentByDefault = event.type === 'training' && !blocked && event.answer === null && !editing
  const needsAnswer = !blocked && event.answer === null && event.type !== 'training'
  const showButtons = !blocked && !presentByDefault && (event.answer === null || editing)
  const to = event.type === 'match' ? `/matchs/${event.id}` : '/calendrier'

  const respond = async (answer: Exclude<TileAnswer, null>, reason?: string) => {
    setSubmitting(true)
    setError(null)
    const { error: writeError } = event.type === 'match'
      ? await writeMatchResponse({
          matchId: event.id,
          memberId: event.memberId,
          status: answer === 'present' ? 'confirmed' : 'absent_justified',
          respondedBy: userId,
          convocationRowId: event.convocationRowId,
          absenceReason: reason,
        })
      : await writeTrainingResponse({
          sessionId: event.id,
          memberId: event.memberId,
          intent: answer === 'present' ? 'present' : 'excused',
          userId,
          reason,
        })
    setSubmitting(false)
    if (writeError) {
      console.error('[HomeEventTile]', writeError)
      setError('Erreur, réessayez')
      return
    }
    setReasonOpen(false)
    setEditing(false)
    onAnswered(event.key, answer)
  }

  const timeStr = event.time
    ? ` · ${formatTime(event.time)}${event.endTime ? ` - ${formatTime(event.endTime)}` : ''}`
    : ''

  const metaStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5,
  }

  return (
    <div
      style={{
        background: needsAnswer ? 'var(--danger-soft)' : 'var(--bg-card)',
        border: `1px solid ${needsAnswer ? 'var(--danger)' : 'var(--border-color)'}`,
        borderRadius: '12px',
        overflow: 'hidden',
        transition: 'background 0.2s ease, border-color 0.2s ease',
      }}
    >
      <Link
        to={to}
        style={{ display: 'flex', gap: '8px', padding: '16px', textDecoration: 'none' }}
      >
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
            <Badge variant={event.type === 'match' ? 'blue' : 'sky'}>
              {event.type === 'match' ? 'Match' : 'Entraînement'}
            </Badge>
            {event.type === 'match' && event.isHome !== undefined && (
              <Badge variant={event.isHome ? 'green-outline' : 'neutral'}>
                {event.isHome ? 'Domicile' : 'Extérieur'}
              </Badge>
            )}
            {event.cancelled && <Badge variant="red">Annulé</Badge>}
          </div>

          {event.type === 'match' && event.opponentName && (
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              vs {event.opponentName}
            </span>
          )}

          <span style={metaStyle}>
            <Calendar size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
            {formatDate(event.date)}{timeStr}
          </span>
          {event.teamName && (
            <span style={metaStyle}>
              <Users size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
              {event.teamName}
            </span>
          )}
          {event.location && (
            <span style={metaStyle}>
              <MapPin size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
              {event.location}
            </span>
          )}
          <span style={{ ...metaStyle, color: 'var(--text-primary)', fontWeight: 600 }}>
            <User size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
            {event.memberFirstName}
          </span>

          {event.cancelled && event.cancelledReason && (
            <span style={{ fontSize: '12px', color: 'var(--danger-text)', lineHeight: 1.5 }}>{event.cancelledReason}</span>
          )}
          {event.type === 'training' && (
            <RainBadge
              rain_applied={!!event.rain_applied}
              rain_plan_defined={!!event.rain_plan_defined}
              rain_note={event.rain_note}
              base_terrain_name={event.base_terrain_name}
              base_start_time={event.base_start_time}
              base_end_time={event.base_end_time}
            />
          )}
        </div>
        <ChevronRight size={18} aria-hidden="true" style={{ color: 'var(--text-muted)', flexShrink: 0, alignSelf: 'center' }} />
      </Link>

      {!event.cancelled && (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {event.notConvoked ? (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Non retenu(e) pour ce match</span>
          ) : event.unavailableText ? (
            <div><Badge variant="yellow">{event.unavailableText}</Badge></div>
          ) : presentByDefault ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <AttendancePill variant="present">{genderLabel(event.gender, 'present')}</AttendancePill>
              <Button variant="ghost" size="sm" disabled={submitting} onClick={() => setReasonOpen(true)}>
                Signaler une absence
              </Button>
            </div>
          ) : showButtons ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                variant="primary"
                size="sm"
                style={{ flex: 1 }}
                disabled={submitting}
                onClick={() => respond('present')}
              >
                {genderLabel(event.gender, 'present')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                style={{ flex: 1 }}
                disabled={submitting}
                onClick={() => setReasonOpen(true)}
              >
                {genderLabel(event.gender, 'absent')}
              </Button>
            </div>
          ) : event.answer ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <Badge variant={event.answer === 'present' ? 'green' : 'neutral'}>
                {genderLabel(event.gender, event.answer === 'present' ? 'present' : 'absent')}
              </Badge>
              {!event.locked && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Modifier
                </button>
              )}
            </div>
          ) : (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Réponses closes</span>
          )}
          {editing && showButtons && (
            <button
              type="button"
              onClick={() => setEditing(false)}
              style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, color: 'var(--text-muted)', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}
            >
              Annuler
            </button>
          )}
          {error && <span style={{ fontSize: '12px', color: 'var(--danger-text)', fontWeight: 600 }}>{error}</span>}
        </div>
      )}

      {reasonOpen && (
        <AbsenceReasonSheet
          memberName={event.memberFullName}
          submitting={submitting}
          onCancel={() => setReasonOpen(false)}
          onConfirm={(reason) => respond('absent', reason)}
        />
      )}
    </div>
  )
}
