import { useEffect, useState } from 'react'
import { X, Check, Clock, ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Button from './ui/Button'
import { Alert } from './ui/Alert'

interface EventVolunteerPost {
  id: string
  name: string
  description: string
  start_time: string
  end_time: string
  required_count: number
  assigned_count?: number
}

interface VolunteerModalEvent {
  id: string
  title: string
  date: string
  start_time?: string
  end_time?: string
}

interface VolunteerModalProps {
  event: VolunteerModalEvent
  onClose: () => void
  onSuccess: () => void
}

export function VolunteerModal({ event, onClose, onSuccess }: VolunteerModalProps) {
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const [posts, setPosts] = useState<EventVolunteerPost[]>([])
  const [saving, setSaving] = useState(false)
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [form, setForm] = useState({
    availability_start: event.start_time?.substring(0, 5) || '08:00',
    availability_end: event.end_time?.substring(0, 5) || '18:00',
    preferred_posts: [] as string[],
    notes: ''
  })

  useEffect(() => {
    if (!user) return
    ;(async () => {
      let firstName = ''
      let lastName = ''
      let email = user.email || ''

      const { data: parentLink } = await supabase
        .from('parent_members')
        .select('members(legal_rep1_firstname, legal_rep1_lastname, legal_rep1_email)')
        .eq('parent_user_id', user.id)
        .maybeSingle()
      if ((parentLink?.members as any)?.legal_rep1_firstname) {
        firstName = (parentLink!.members as any).legal_rep1_firstname || ''
        lastName = (parentLink!.members as any).legal_rep1_lastname || ''
      }

      if (!firstName) {
        const { data: member } = await supabase
          .from('members')
          .select('first_name, last_name')
          .ilike('email', user.email ?? '')
          .maybeSingle()
        if (member) { firstName = member.first_name; lastName = member.last_name }
      }

      if (!firstName) {
        const { data: coach } = await supabase
          .from('coaches')
          .select('first_name, last_name')
          .ilike('email', user.email ?? '')
          .maybeSingle()
        if (coach) { firstName = coach.first_name; lastName = coach.last_name }
      }

      if (!firstName) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', user.id)
          .maybeSingle()
        if (profile?.full_name && !profile.full_name.includes('@')) {
          const parts = profile.full_name.trim().split(' ')
          firstName = parts[0]
          lastName = parts.slice(1).join(' ')
        }
        if (profile?.email) email = profile.email
      }

      const name = [firstName, lastName].filter(Boolean).join(' ')
      setUserName(name)
      setUserEmail(email)
    })()
  }, [user])

  useEffect(() => {
    supabase
      .from('event_volunteer_posts')
      .select('*')
      .eq('event_id', event.id)
      .order('start_time')
      .then(async ({ data: postsData }) => {
        if (!postsData || postsData.length === 0) { setPosts([]); return }
        const enriched = await Promise.all(postsData.map(async (post) => {
          const { count } = await supabase
            .from('event_volunteers')
            .select('id', { count: 'exact', head: true })
            .eq('event_id', event.id)
            .contains('preferred_posts', [post.name])
          return { ...post, assigned_count: count || 0 }
        }))
        setPosts(enriched)
      })
  }, [event.id])

  const togglePost = (postName: string) => {
    setForm(f => ({
      ...f,
      preferred_posts: f.preferred_posts.includes(postName)
        ? f.preferred_posts.filter(p => p !== postName)
        : [...f.preferred_posts, postName]
    }))
  }

  const handleSubmit = async () => {
    if (!user) return
    setSaving(true)
    try {
      let firstName = ''
      let lastName = ''
      let email = user.email || ''
      let phone = ''

      const { data: parentLink } = await supabase
        .from('parent_members')
        .select('members(legal_rep1_firstname, legal_rep1_lastname, legal_rep1_email)')
        .eq('parent_user_id', user.id)
        .maybeSingle()
      if ((parentLink?.members as any)?.legal_rep1_firstname) {
        firstName = (parentLink!.members as any).legal_rep1_firstname || ''
        lastName = (parentLink!.members as any).legal_rep1_lastname || ''
      }

      if (!firstName) {
        const { data: member } = await supabase
          .from('members')
          .select('first_name, last_name, phone_mobile')
          .ilike('email', user.email ?? '')
          .maybeSingle()
        if (member) {
          firstName = member.first_name
          lastName = member.last_name
          phone = member.phone_mobile || ''
        }
      }

      if (!firstName) {
        const { data: coach } = await supabase
          .from('coaches')
          .select('first_name, last_name, phone_mobile')
          .ilike('email', user.email ?? '')
          .maybeSingle()
        if (coach) {
          firstName = coach.first_name
          lastName = coach.last_name
          phone = coach.phone_mobile || ''
        }
      }

      if (!firstName) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', user.id)
          .maybeSingle()
        if (profile?.full_name && !profile.full_name.includes('@')) {
          const parts = profile.full_name.trim().split(' ')
          firstName = parts[0]
          lastName = parts.slice(1).join(' ')
        }
        if (profile?.email) email = profile.email
      }

      const { data: inserted, error } = await supabase
        .from('event_volunteers')
        .insert({
          event_id: event.id,
          user_id: user.id,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          availability_start: form.availability_start,
          availability_end: form.availability_end,
          preferred_posts: form.preferred_posts,
          notes: form.notes,
          status: 'pending'
        })
        .select()
        .single()

      if (error) throw error

      if (inserted) {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const { data: { session } } = await supabase.auth.getSession()
        await fetch(`${supabaseUrl}/functions/v1/volunteer-thankyou`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ volunteer_id: inserted.id })
        }).catch(() => {})
      }

      onSuccess()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })

  const stepTitles = ['Vos disponibilités', 'Dans quoi souhaitez-vous aider ?', 'Récapitulatif']

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
    }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        borderRadius: '16px', width: '100%', maxWidth: '560px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)', overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 24px', background: 'var(--bg-modal-header)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderRadius: '16px 16px 0 0'
        }}>
          <div>
            <h2 style={{ color: 'var(--text-modal-header)', margin: 0, fontSize: '18px', fontWeight: 700 }}>
              Je me porte bénévole
            </h2>
            <p style={{ color: 'var(--text-modal-header)', opacity: 0.8, margin: '4px 0 0', fontSize: '13px' }}>
              {event.title} — {formatDate(event.date)}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-modal-header)', cursor: 'pointer', padding: '4px' }} className="hover:opacity-80">
            <X size={20} />
          </button>
        </div>

        {/* Step indicator */}
        <div style={{ padding: '16px 24px 0', display: 'flex', alignItems: 'center', gap: '0' }}>
          {[1, 2, 3].map((s, i) => (
            <div key={s} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flex: 'none' }}>
                <div style={{
                  width: '30px', height: '30px', borderRadius: '50%',
                  background: step >= s ? 'var(--primary)' : 'var(--bg-main)',
                  color: step >= s ? 'var(--text-inverse)' : 'var(--text-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '13px', fontWeight: '700', transition: 'all 0.2s',
                  border: step === s ? '2px solid var(--primary)' : step > s ? '2px solid var(--primary)' : '2px solid var(--border-color)'
                }}>
                  {step > s ? <Check size={14} /> : s}
                </div>
              </div>
              {i < 2 && (
                <div style={{
                  flex: 1, height: '2px', margin: '0 6px',
                  background: step > s ? 'var(--primary)' : 'var(--border-color)',
                  borderRadius: '2px', transition: 'all 0.2s'
                }} />
              )}
            </div>
          ))}
        </div>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', margin: '6px 0 0', paddingBottom: '4px' }}>
          Étape {step}/3
        </p>

        {/* Body */}
        <div style={{ padding: '16px 24px' }}>
          <h3 style={{ color: 'var(--text-primary)', margin: '0 0 14px', fontSize: '16px', fontWeight: '700' }}>
            {stepTitles[step - 1]}
          </h3>

          {step === 1 && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Disponible à partir de
                  </label>
                  <input
                    type="time"
                    value={form.availability_start}
                    onChange={e => setForm(f => ({ ...f, availability_start: e.target.value }))}
                    style={{
                      width: '100%', background: 'var(--bg-main)', border: '1px solid var(--border-color)',
                      borderRadius: '8px', padding: '10px 12px', color: 'var(--text-primary)', fontSize: '15px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Disponible jusqu'à
                  </label>
                  <input
                    type="time"
                    value={form.availability_end}
                    onChange={e => setForm(f => ({ ...f, availability_end: e.target.value }))}
                    style={{
                      width: '100%', background: 'var(--bg-main)', border: '1px solid var(--border-color)',
                      borderRadius: '8px', padding: '10px 12px', color: 'var(--text-primary)', fontSize: '15px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>
              <Alert variant="success">
                <span style={{ fontStyle: 'italic' }}>
                  Plus vous restez longtemps, plus vous nous aidez ! Chaque heure compte et fait une vraie différence pour nos joueurs.
                </span>
              </Alert>
            </div>
          )}

          {step === 2 && (
            <div>
              {posts.length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center' }}>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Aucun poste défini pour cet événement.</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '6px' }}>Vous pouvez continuer sans sélectionner de poste.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '260px', overflowY: 'auto', marginBottom: '14px', paddingRight: '2px' }}>
                  {posts.map(post => {
                    const selected = form.preferred_posts.includes(post.name)
                    const remaining = Math.max(0, post.required_count - (post.assigned_count || 0))
                    return (
                      <button
                        key={post.id}
                        onClick={() => togglePost(post.name)}
                        style={{
                          background: selected ? 'rgba(var(--primary-rgb),0.1)' : 'var(--bg-main)',
                          border: `1px solid ${selected ? 'var(--primary)' : 'var(--border-color)'}`,
                          borderRadius: '10px', padding: '12px 14px',
                          cursor: 'pointer', textAlign: 'left',
                          display: 'flex', alignItems: 'center', gap: '12px', transition: 'all 0.15s'
                        }}
                      >
                        <div style={{
                          width: '20px', height: '20px', borderRadius: '4px', flexShrink: 0,
                          background: selected ? 'var(--primary)' : 'transparent',
                          border: `2px solid ${selected ? 'var(--primary)' : 'var(--border-color)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s'
                        }}>
                          {selected && <Check size={12} style={{ color: 'var(--text-inverse)' }} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '700' }}>{post.name}</div>
                          {post.description && (
                            <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.description}</div>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                          <div style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <Clock size={11} /> {post.start_time.substring(0, 5)} – {post.end_time.substring(0, 5)}
                          </div>
                          <div style={{
                            fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px',
                            color: remaining === 0 ? 'var(--danger-text)' : remaining <= 2 ? 'var(--warning-text)' : 'var(--success-text)',
                            fontWeight: '600'
                          }}>
                            <Users size={10} />
                            {remaining === 0 ? 'Complet' : `${remaining} place${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}`}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
              <Alert variant="warning">
                <span style={{ fontStyle: 'italic' }}>
                  Vos souhaits seront pris en compte dans la mesure du possible. L'attribution finale est faite par le responsable en fonction des besoins.
                </span>
              </Alert>
            </div>
          )}

          {step === 3 && (
            <div>
              <div style={{
                background: 'var(--bg-main)', border: '1px solid var(--border-color)',
                borderRadius: '10px', padding: '16px', marginBottom: '16px',
                display: 'flex', flexDirection: 'column', gap: '12px'
              }}>
                {userName && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Bénévole</span>
                    <span style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>{userName}</span>
                  </div>
                )}
                <div style={{ borderTop: userName ? '1px solid var(--border-color)' : 'none', paddingTop: userName ? '12px' : 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Disponibilités</span>
                  <span style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>
                    {form.availability_start} – {form.availability_end}
                  </span>
                </div>
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '13px', display: 'block', marginBottom: '8px' }}>Souhaits de postes</span>
                  {form.preferred_posts.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {form.preferred_posts.map(p => (
                        <span key={p} style={{
                          background: 'rgba(var(--primary-rgb),0.1)',
                          color: 'var(--primary)', border: '1px solid rgba(var(--primary-rgb),0.3)',
                          borderRadius: '6px', padding: '3px 10px', fontSize: '12px', fontWeight: '600'
                        }}>{p}</span>
                      ))}
                    </div>
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>Aucun souhait spécifique</span>
                  )}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Remarques (optionnel)
                </label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Informations complémentaires..."
                  rows={3}
                  style={{
                    width: '100%', background: 'var(--bg-main)', border: '1px solid var(--border-color)',
                    borderRadius: '8px', padding: '10px 12px', color: 'var(--text-primary)', fontSize: '14px',
                    resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit'
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px', borderTop: '1px solid var(--border-color)',
          display: 'flex', gap: '12px', justifyContent: 'flex-end'
        }}>
          {step > 1 ? (
            <Button variant="secondary" onClick={() => setStep(s => s - 1)}>
              <ChevronLeft size={16} /> Retour
            </Button>
          ) : (
            <Button variant="secondary" onClick={onClose}>
              Annuler
            </Button>
          )}
          {step < 3 ? (
            <Button variant="primary" onClick={() => setStep(s => s + 1)}>
              Suivant <ChevronRight size={16} />
            </Button>
          ) : (
            <Button variant="primary" onClick={handleSubmit} disabled={saving}>
              {saving ? 'Inscription en cours...' : "S'inscrire comme bénévole"}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
