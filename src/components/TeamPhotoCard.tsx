import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { safeUUID } from '../lib/ids'
import { useAuth } from '../context/AuthContext'
import { useTenant } from '../context/TenantContext'
import { useWebsiteModuleEnabled } from '../hooks/useWebsiteModuleEnabled'
import { resizeTeamPhoto } from '../lib/imageProcessing'
import Button from './ui/Button'
import { Badge } from './ui/Badge'
import { Camera, Trash2, Upload } from 'lucide-react'
import { useToast } from '../hooks/useToast'
import { Toast } from './Toast'
import { ZoomablePhoto } from './PhotoViewer'

interface TeamPhoto {
  id: string
  storage_path: string
  caption: string | null
  uploaded_at: string
  publish_on_site: boolean
}

interface Season {
  id: string
  name: string
  active: boolean
}

export default function TeamPhotoCard({ teamId, readOnly = false }: { teamId: string; readOnly?: boolean }) {
  const { user, hasRole } = useAuth()
  const { clubId } = useTenant()
  const { enabled: websiteEnabled } = useWebsiteModuleEnabled()
  const { toast, showToast } = useToast()

  const [seasons, setSeasons] = useState<Season[]>([])
  const [selectedSeason, setSelectedSeason] = useState('')
  const [photo, setPhoto] = useState<TeamPhoto | null>(null)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [caption, setCaption] = useState('')
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isHeadCoach, setIsHeadCoach] = useState(false)
  const [photoKey, setPhotoKey] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const isAdminOrCommittee = hasRole('admin') || hasRole('responsable_technique')
  const canManage = !readOnly && (isAdminOrCommittee || isHeadCoach)

  useEffect(() => {
    if (!clubId) return
    supabase
      .from('seasons')
      .select('id, name, active')
      .eq('club_id', clubId)
      .order('start_date', { ascending: false })
      .then(({ data }) => {
        const s = (data || []) as Season[]
        setSeasons(s)
        const active = s.find(x => x.active)
        if (active) setSelectedSeason(active.id)
        else if (s.length > 0) setSelectedSeason(s[0].id)
      })
  }, [clubId])

  useEffect(() => {
    if (!user?.id || !teamId) return
    supabase
      .from('coaches')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data: coach }) => {
        if (!coach) { setIsHeadCoach(false); return }
        supabase
          .from('team_staff')
          .select('id')
          .eq('team_id', teamId)
          .eq('coach_id', coach.id)
          .eq('role', 'principal')
          .maybeSingle()
          .then(({ data: row }) => setIsHeadCoach(!!row))
      })
  }, [user?.id, teamId])

  useEffect(() => {
    if (!teamId || !selectedSeason) { setPhoto(null); setSignedUrl(null); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const { data } = await supabase
        .from('team_photos')
        .select('id, storage_path, caption, uploaded_at, publish_on_site')
        .eq('team_id', teamId)
        .eq('season_id', selectedSeason)
        .maybeSingle()
      if (cancelled) return
      setPhoto(data)
      if (data?.storage_path) {
        const { data: urlData } = await supabase.storage
          .from('team-photos')
          .createSignedUrl(data.storage_path, 3600)
        if (!cancelled) setSignedUrl(urlData?.signedUrl || null)
      } else {
        setSignedUrl(null)
      }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [teamId, selectedSeason, photoKey])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (fileRef.current) fileRef.current.value = ''
    if (photo?.publish_on_site) {
      setSelectedFile(f)
      setConfirmReplace(true)
    } else {
      setSelectedFile(f)
      setPreviewUrl(URL.createObjectURL(f))
      setShowUploadForm(true)
    }
  }

  const proceedReplace = () => {
    setConfirmReplace(false)
    if (selectedFile) {
      setPreviewUrl(URL.createObjectURL(selectedFile))
      setShowUploadForm(true)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile || !clubId || !selectedSeason) return
    setUploading(true)
    try {
      const blob = await resizeTeamPhoto(selectedFile)
      if (blob.size > 5 * 1024 * 1024) {
        showToast('Photo trop lourde (5 Mo au maximum).', 'error')
        setUploading(false)
        return
      }
      const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg'
      const storagePath = `${clubId}/${teamId}/${selectedSeason}/${safeUUID()}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('team-photos')
        .upload(storagePath, blob, { upsert: false, contentType: blob.type })
      if (uploadErr) { showToast(uploadErr.message, 'error'); setUploading(false); return }

      const { data: rpcData, error: rpcErr } = await supabase.rpc('set_team_photo', {
        p_team_id: teamId,
        p_season_id: selectedSeason,
        p_storage_path: storagePath,
        p_caption: caption.trim() || null,
      })

      if (rpcErr) {
        await supabase.storage.from('team-photos').remove([storagePath])
        showToast(rpcErr.message, 'error')
        setUploading(false)
        return
      }

      if (rpcData?.previous_path) {
        await supabase.storage.from('team-photos').remove([rpcData.previous_path]).catch(() => {})
      }

      showToast('Photo enregistrée')
      cancelUpload()
      setPhotoKey(k => k + 1)
    } catch (err: any) {
      showToast(err?.message || 'Erreur', 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async () => {
    if (!photo) return
    setDeleting(true)
    const { data, error } = await supabase.rpc('delete_team_photo', { p_photo_id: photo.id })
    if (error) {
      showToast(error.message, 'error')
      setDeleting(false)
      setConfirmDelete(false)
      return
    }
    if (data?.storage_path) {
      await supabase.storage.from('team-photos').remove([data.storage_path]).catch(() => {})
    }
    showToast('Photo supprimée')
    setConfirmDelete(false)
    setDeleting(false)
    setPhotoKey(k => k + 1)
  }

  const cancelUpload = () => {
    setShowUploadForm(false)
    setSelectedFile(null)
    setCaption('')
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
  }

  const canDelete = isAdminOrCommittee || (isHeadCoach && !photo?.publish_on_site)

  if (seasons.length === 0 && loading) return null
  const hasActiveSeason = seasons.some(x => x.active)

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: 14, padding: 20, marginBottom: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Camera size={18} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Photo d&apos;équipe</span>
          {websiteEnabled && photo?.publish_on_site && <Badge variant="green">Publiée sur le site</Badge>}
        </div>
        {hasActiveSeason && seasons.length > 1 && (
          <select
            value={selectedSeason}
            onChange={e => setSelectedSeason(e.target.value)}
            style={{
              padding: '6px 10px', borderRadius: 8, fontSize: 13,
              background: 'var(--bg-input)', border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
            }}
          >
            {seasons.map(s => (
              <option key={s.id} value={s.id}>Saison {s.name}</option>
            ))}
          </select>
        )}
      </div>

      {!hasActiveSeason ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--warning-text, #b45309)', fontSize: 14, background: 'var(--bg-hover)', borderRadius: 12 }}>
          Aucune saison active : définissez la saison en cours dans les paramètres du club.
        </div>
      ) : loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>Chargement...</div>
      ) : !photo || !signedUrl ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, background: 'var(--bg-hover)', borderRadius: 12 }}>
          Pas encore de photo pour cette saison
        </div>
      ) : (
        <div>
          <ZoomablePhoto
            src={signedUrl}
            caption={photo.caption || "Photo d'équipe"}
            alt="Photo d'équipe"
            style={{ width: '100%', borderRadius: 12, display: 'block' }}
          />
          {photo.caption && (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', marginTop: 8 }}>
              {photo.caption}
            </p>
          )}
        </div>
      )}

      {showUploadForm && (
        <div style={{ marginTop: 16, padding: 16, background: 'var(--bg-hover)', borderRadius: 12 }}>
          {previewUrl && (
            <img src={previewUrl} alt="Aperçu" style={{ width: '100%', borderRadius: 8, marginBottom: 12, display: 'block' }} />
          )}
          <input
            type="text"
            value={caption}
            onChange={e => { if (e.target.value.length <= 200) setCaption(e.target.value) }}
            placeholder="Légende (facultatif)"
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
              background: 'var(--bg-input)', border: '1px solid var(--border-color)',
              color: 'var(--text-primary)', marginBottom: 12, boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" size="sm" onClick={cancelUpload} disabled={uploading}>Annuler</Button>
            <Button variant="primary" size="sm" onClick={handleUpload} disabled={uploading}>
              {uploading ? 'Envoi...' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      )}

      {canManage && !showUploadForm && !loading && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <Button variant="secondary" size="sm" leftIcon={<Upload size={14} />} onClick={() => fileRef.current?.click()}>
            {photo ? 'Remplacer la photo' : 'Ajouter la photo'}
          </Button>

          {photo && canDelete && (
            <Button variant="secondary" size="sm" leftIcon={<Trash2 size={14} />} onClick={() => setConfirmDelete(true)} style={{ color: 'var(--danger)' }}>
              Supprimer la photo
            </Button>
          )}

          {websiteEnabled && photo && isHeadCoach && !isAdminOrCommittee && photo.publish_on_site && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Publiée sur le site : seul le comité peut la retirer.
            </p>
          )}
        </div>
      )}

      {confirmReplace && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.5)', padding: 16,
        }} onClick={e => { if (e.target === e.currentTarget) { setConfirmReplace(false); setSelectedFile(null) } }}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: 16, padding: 24,
            width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <p style={{ fontSize: 14, color: 'var(--text-primary)', marginBottom: 16, lineHeight: 1.5 }}>
              La nouvelle photo sera retirée du site jusqu&apos;à ce que le comité la publie à nouveau.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" size="sm" onClick={() => { setConfirmReplace(false); setSelectedFile(null) }}>Annuler</Button>
              <Button variant="primary" size="sm" onClick={proceedReplace}>Continuer</Button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.5)', padding: 16,
        }} onClick={e => { if (e.target === e.currentTarget) setConfirmDelete(false) }}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: 16, padding: 24,
            width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>
              Supprimer la photo d&apos;équipe ?
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)} disabled={deleting}>Annuler</Button>
              <Button variant="primary" size="sm" onClick={handleDelete} disabled={deleting} style={{ background: 'var(--danger)' }}>
                {deleting ? 'Suppression...' : 'Supprimer'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </div>
  )
}
