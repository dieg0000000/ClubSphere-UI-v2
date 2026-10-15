import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTenant } from '../context/TenantContext'
import { ChevronLeft } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import type { BadgeVariant } from '../components/ui/Badge'

interface InscriptionRow {
  id: string
  first_name: string
  last_name: string
  birth_date: string
  status: string
  submitted_at: string
  address: string | null
  postal_code: string | null
  city: string | null
  passport_photo_path: string | null
}

const STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
  pending:      { label: 'À traiter',       variant: 'orange' },
  in_progress:  { label: 'En cours',        variant: 'blue' },
  waitlisted:   { label: "Liste d'attente", variant: 'yellow' },
}

const fmtDate = (d: string) => {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}.${m}.${y}`
}

const fmtDateTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch { return '—' }
}

const computeAge = (birthDate: string): number => {
  const today = new Date()
  const bd = new Date(birthDate)
  let age = today.getFullYear() - bd.getFullYear()
  const m = today.getMonth() - bd.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--
  return age
}

export default function CommitteeMobileInscriptions() {
  const { clubId } = useTenant()
  const navigate = useNavigate()
  const [rows, setRows] = useState<InscriptionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<InscriptionRow | null>(null)

  useEffect(() => {
    if (!clubId) { setLoading(false); return }
    setLoading(true)
    ;(async () => {
      const { data } = await supabase
        .from('inscription_requests')
        .select('id, first_name, last_name, birth_date, status, submitted_at, address, postal_code, city, passport_photo_path')
        .eq('club_id', clubId)
        .in('status', ['pending', 'in_progress', 'waitlisted'])
        .order('submitted_at', { ascending: false })
      setRows(data || [])
      setLoading(false)
    })()
  }, [clubId])

  return (
    <div style={{ maxWidth: 500, margin: '0 auto' }}>
      <button
        type="button"
        onClick={() => navigate('/dashboard')}
        style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, marginBottom: '8px', padding: 0 }}
      >
        <ChevronLeft size={16} /> Accueil
      </button>

      <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '14px' }}>
        Inscriptions en ligne
      </h1>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
          <div className="animate-spin" style={{ width: 24, height: 24, border: '2.5px solid var(--border-color)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} />
        </div>
      ) : rows.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', padding: '32px 0' }}>
          Aucune inscription en attente
        </p>
      ) : (
        <>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
            {rows.length} inscription{rows.length !== 1 ? 's' : ''}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            {rows.map(r => {
              const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.pending
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelected(r)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px 14px', background: 'var(--bg-card)',
                    border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
                  }}
                >
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%',
                    background: 'var(--accent-soft, rgba(0,100,200,0.08))',
                    color: 'var(--accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '13px', fontWeight: 700, flexShrink: 0,
                  }}>
                    {(r.first_name[0] || '').toUpperCase()}{(r.last_name[0] || '').toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.first_name} {r.last_name}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {fmtDate(r.birth_date)} &middot; Soumis le {fmtDateTime(r.submitted_at)}
                    </p>
                    <div style={{ marginTop: '4px' }}>
                      <Badge variant={cfg.variant}>{cfg.label}</Badge>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}

      {selected && (
        <DetailSheet
          row={selected}
          clubId={clubId!}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function DetailSheet({ row, clubId, onClose }: { row: InscriptionRow; clubId: string; onClose: () => void }) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState(false)
  const [categoryName, setCategoryName] = useState<string | null>(null)
  const [isFull, setIsFull] = useState(false)
  const [loadingCat, setLoadingCat] = useState(true)

  const loadData = useCallback(async () => {
    setPhotoUrl(null)
    setPhotoError(false)

    const photoPromise = row.passport_photo_path
      ? supabase.storage.from('inscription-id-cards').createSignedUrl(row.passport_photo_path, 3600)
      : Promise.resolve(null)

    const catPromise = supabase.rpc('check_inscription_capacity', {
      p_club_id: clubId,
      p_birth_date: row.birth_date,
    })

    const [photoRes, catRes] = await Promise.all([photoPromise, catPromise])

    if (photoRes && !photoRes.error && photoRes.data?.signedUrl) {
      setPhotoUrl(photoRes.data.signedUrl)
    }

    if (catRes.data) {
      setCategoryName(catRes.data.category_name || null)
      setIsFull(!!catRes.data.is_full)
    }
    setLoadingCat(false)
  }, [row, clubId])

  useEffect(() => { loadData() }, [loadData])

  const cfg = STATUS_CONFIG[row.status] || STATUS_CONFIG.pending
  const age = computeAge(row.birth_date)
  const address = [row.address, row.postal_code, row.city].filter(Boolean).join(', ')

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column' }}
      onClick={onClose}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
      <div
        style={{
          position: 'relative', marginTop: 'auto', background: 'var(--bg-card)',
          borderRadius: '16px 16px 0 0', padding: '20px', maxHeight: '85vh',
          overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-color)', margin: '0 auto 16px' }} />

        {/* Photo / initials */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          {photoUrl && !photoError ? (
            <img
              src={photoUrl}
              alt={`${row.first_name} ${row.last_name}`}
              onError={() => setPhotoError(true)}
              style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border-color)' }}
            />
          ) : (
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: 'var(--accent-soft, rgba(0,100,200,0.08))',
              color: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '24px', fontWeight: 700,
            }}>
              {(row.first_name[0] || '').toUpperCase()}{(row.last_name[0] || '').toUpperCase()}
            </div>
          )}
        </div>

        <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', marginBottom: '6px' }}>
          {row.first_name} {row.last_name}
        </h2>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <Badge variant={cfg.variant}>{cfg.label}</Badge>
        </div>

        <InfoRow label="Date de naissance" value={`${fmtDate(row.birth_date)} (${age} ans)`} />

        {loadingCat ? (
          <InfoRow label="Catégorie" value="Chargement..." />
        ) : (
          <InfoRow
            label="Catégorie"
            value={categoryName || 'Aucune catégorie correspondante'}
            warning={isFull ? 'Catégorie complète' : undefined}
          />
        )}

        {address && <InfoRow label="Adresse" value={address} />}

        {/* Desktop-only disclaimer */}
        <p style={{
          fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center',
          marginTop: '20px', padding: '12px', borderRadius: '8px',
          background: 'var(--bg-hover)',
          lineHeight: 1.5,
        }}>
          La validation, le refus et la liste d'attente se font depuis un ordinateur.
        </p>

        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: '12px', width: '100%', padding: '12px',
            background: 'var(--bg-hover)', color: 'var(--text-primary)',
            border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Fermer
        </button>
      </div>
    </div>
  )
}

function InfoRow({ label, value, warning }: { label: string; value: string; warning?: string }) {
  return (
    <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>
          {value}
        </span>
      </div>
      {warning && (
        <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--warning-text, var(--danger))', fontWeight: 600 }}>
          {warning}
        </p>
      )}
    </div>
  )
}
