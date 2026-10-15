import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, ChevronRight, ImageIcon, Images } from 'lucide-react'
import { useTenant } from '../../context/TenantContext'
import { fetchMemberGalleries, formatGalleryDate, signGalleryPaths, type GalleryListRow } from '../../lib/galleries'

export default function LatestAlbumBlock() {
  const { clubId } = useTenant()
  const [album, setAlbum] = useState<GalleryListRow | null>(null)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!clubId) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await fetchMemberGalleries(clubId, 1)
      if (cancelled || error || !data || data.length === 0) return
      const latest = data[0]
      setAlbum(latest)
      const path = latest.cover?.thumb_path
      if (!path) return
      const urls = await signGalleryPaths([path])
      if (!cancelled) setCoverUrl(urls[path] ?? null)
    })()
    return () => { cancelled = true }
  }, [clubId])

  if (!album) return null
  const date = formatGalleryDate(album.taken_on)

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: '14px', padding: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Images size={16} style={{ color: 'var(--accent)' }} />
          <span style={{ color: 'var(--text-primary)', fontWeight: '700', fontSize: '14px' }}>Dernier album</span>
        </div>
        <Link to="/galerie" style={{ color: 'var(--accent)', fontSize: '12px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '2px' }}>
          Voir tout <ChevronRight size={14} />
        </Link>
      </div>
      <Link to={`/galerie/${album.id}`} style={{ textDecoration: 'none' }}>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '10px',
            background: 'var(--bg-hover)',
            borderRadius: '10px',
            border: '1px solid var(--border-color)',
            transition: 'border-color 0.2s',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-color)')}
        >
          <div style={{
            width: 64, height: 64, borderRadius: '8px', overflow: 'hidden', flexShrink: 0,
            background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {coverUrl ? (
              <img src={coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
            ) : (
              <ImageIcon size={24} style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>
              {album.title}
            </div>
            {date && (
              <span style={{ color: 'var(--text-secondary)', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Calendar size={12} aria-hidden="true" /> {date}
              </span>
            )}
          </div>
        </div>
      </Link>
    </div>
  )
}
