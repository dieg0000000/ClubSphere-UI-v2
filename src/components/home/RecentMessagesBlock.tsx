import { Link } from 'react-router-dom'
import { ChevronRight, MessageSquare } from 'lucide-react'

export interface MessagePreview {
  id: string
  body: string
  created_at: string
  senderName: string
}

const timeAgo = (d: string) => {
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "à l'instant"
  if (mins < 60) return `il y a ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `il y a ${hrs}h`
  return new Date(d).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' })
}

export default function RecentMessagesBlock({ messages }: { messages: MessagePreview[] }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: '14px', padding: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MessageSquare size={16} style={{ color: 'var(--accent)' }} />
          <span style={{ color: 'var(--text-primary)', fontWeight: '700', fontSize: '14px' }}>Messages du groupe</span>
        </div>
        <Link to="/messages" style={{ color: 'var(--accent)', fontSize: '12px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '2px' }}>
          Voir tout <ChevronRight size={14} />
        </Link>
      </div>
      {messages.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {messages.slice(0, 3).map(m => (
            <Link key={m.id} to="/messages" style={{ textDecoration: 'none', display: 'block' }}>
              <div
                style={{
                  padding: '8px 10px', background: 'var(--bg-hover)',
                  borderRadius: '8px', border: '1px solid var(--border-color)',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-color)')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: '600' }}>{m.senderName}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{timeAgo(m.created_at)}</span>
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.body || '(pièce jointe)'}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '12px 0' }}>Aucun message récent</p>
      )}
    </div>
  )
}
