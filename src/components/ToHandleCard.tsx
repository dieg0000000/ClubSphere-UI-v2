import { useEffect, useState, type ComponentType } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  TriangleAlert as AlertTriangle,
  ClipboardList,
  CreditCard,
  Heart,
  MessageSquare,
  ChevronRight,
} from 'lucide-react'
import { persistNavView } from '../hooks/useNavView'

interface HandleRow {
  key: string
  label: string
  icon: ComponentType<{ size?: number | string }>
  path: string
  count: number
}

async function countRows(
  table: string,
  column: string,
  value: string
): Promise<number> {
  const { count } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq(column, value)
  return count || 0
}

export default function ToHandleCard() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<HandleRow[] | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const [inscriptions, payments, volunteers, tickets] = await Promise.all([
        countRows('inscription_requests', 'status', 'pending'),
        countRows('camt_unmatched', 'status', 'pending'),
        countRows('event_volunteers', 'status', 'pending'),
        countRows('support_tickets', 'status', 'open'),
      ])

      if (cancelled) return

      const all: HandleRow[] = [
        { key: 'inscriptions', label: 'Inscriptions en attente de validation', icon: ClipboardList, path: '/admin/inscriptions', count: inscriptions },
        { key: 'payments', label: 'Paiements à rapprocher', icon: CreditCard, path: '/admin/finances/dashboard', count: payments },
        { key: 'volunteers', label: 'Bénévoles en attente de validation', icon: Heart, path: '/admin/benevoles', count: volunteers },
        { key: 'tickets', label: 'Tickets support ouverts', icon: MessageSquare, path: '/aide', count: tickets },
      ]

      setRows(all.filter((r) => r.count > 0))
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (!rows || rows.length === 0) return null

  const openAdmin = (path: string) => {
    persistNavView('admin')
    navigate(path)
  }

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '22px',
        boxShadow: 'var(--shadow-lg)',
        padding: '20px',
        marginBottom: '24px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '34px',
            height: '34px',
            borderRadius: '10px',
            background: 'var(--warning-soft)',
            color: 'var(--warning-text)',
          }}
        >
          <AlertTriangle size={18} />
        </span>
        <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          À traiter
        </h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {rows.map((row) => {
          const Icon = row.icon
          return (
            <button
              key={row.key}
              type="button"
              onClick={() => openAdmin(row.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                width: '100%',
                padding: '12px 14px',
                borderRadius: '14px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-hover)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <Icon size={18} />
              <span style={{ flex: 1, fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                {row.label}
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '26px',
                  height: '24px',
                  padding: '0 8px',
                  borderRadius: '999px',
                  background: 'var(--warning-soft)',
                  color: 'var(--warning-text)',
                  fontSize: '13px',
                  fontWeight: 700,
                }}
              >
                {row.count}
              </span>
              <ChevronRight size={16} color="var(--text-muted)" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
