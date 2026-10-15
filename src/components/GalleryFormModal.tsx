import { useEffect, useState, type CSSProperties } from 'react';
import { supabase } from '../lib/supabase';
import { StandardModal } from './StandardModal';
import Button from './ui/Button';
import { Alert } from './ui/Alert';
import { GALLERY_COLUMNS, type Gallery } from '../lib/galleries';

interface Option { id: string; name: string }

interface GalleryFormModalProps {
  isOpen: boolean;
  clubId: string;
  gallery?: Gallery | null;
  onClose: () => void;
  onSaved: (gallery: Gallery) => void;
}

const labelStyle: CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4,
};
const inputStyle: CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)',
  background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 14,
};

export default function GalleryFormModal({ isOpen, clubId, gallery, onClose, onSaved }: GalleryFormModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [takenOn, setTakenOn] = useState('');
  const [teamId, setTeamId] = useState('');
  const [eventId, setEventId] = useState('');
  const [seasonId, setSeasonId] = useState('');
  const [teams, setTeams] = useState<Option[]>([]);
  const [events, setEvents] = useState<Option[]>([]);
  const [seasons, setSeasons] = useState<(Option & { active: boolean })[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(gallery?.title ?? '');
    setDescription(gallery?.description ?? '');
    setTakenOn(gallery?.taken_on ?? '');
    setTeamId(gallery?.team_id ?? '');
    setEventId(gallery?.event_id ?? '');
    setSeasonId(gallery?.season_id ?? '');
    setError(null);

    let cancelled = false;
    (async () => {
      const [teamsRes, eventsRes, seasonsRes] = await Promise.all([
        supabase.from('teams').select('id,name').eq('club_id', clubId).eq('active', true).order('name'),
        supabase.from('events').select('id,title,date').eq('club_id', clubId).order('date', { ascending: false }).limit(200),
        supabase.from('seasons').select('id,name,active').eq('club_id', clubId).order('start_date', { ascending: false }),
      ]);
      if (cancelled) return;
      if (teamsRes.error || eventsRes.error || seasonsRes.error) {
        setError('Impossible de charger les équipes, événements ou saisons.');
      }
      setTeams((teamsRes.data ?? []) as Option[]);
      setEvents((eventsRes.data ?? []).map((e: { id: string; title: string; date: string | null }) => ({
        id: e.id,
        name: e.date ? `${e.title} (${new Date(e.date).toLocaleDateString('fr-CH')})` : e.title,
      })));
      const seasonRows = (seasonsRes.data ?? []) as (Option & { active: boolean })[];
      setSeasons(seasonRows);
      if (!gallery) {
        const active = seasonRows.find((s) => s.active);
        if (active) setSeasonId(active.id);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, gallery, clubId]);

  const handleSave = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Le titre est obligatoire.');
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      title: trimmed,
      description: description.trim() || null,
      taken_on: takenOn || null,
      team_id: teamId || null,
      event_id: eventId || null,
      season_id: seasonId || null,
    };
    const { data: userData } = await supabase.auth.getUser();
    const query = gallery
      ? supabase.from('galleries').update(payload).eq('id', gallery.id).select(GALLERY_COLUMNS).maybeSingle()
      : supabase.from('galleries')
          .insert({ ...payload, club_id: clubId, created_by: userData.user?.id ?? null })
          .select(GALLERY_COLUMNS).maybeSingle();
    const { data, error: saveError } = await query;
    setSaving(false);
    if (saveError || !data) {
      setError("L'album n'a pas pu être enregistré. Vérifiez vos droits et réessayez.");
      return;
    }
    onSaved(data as Gallery);
  };

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={onClose}
      title={gallery ? "Modifier l'album" : 'Nouvel album'}
      width="560px"
      maxHeight="90vh"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && <Alert variant="danger" onClose={() => setError(null)}>{error}</Alert>}
        <div>
          <label style={labelStyle} htmlFor="gallery-title">Titre *</label>
          <input id="gallery-title" style={inputStyle} value={title} maxLength={200}
            onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div>
          <label style={labelStyle} htmlFor="gallery-description">Description</label>
          <textarea id="gallery-description" style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
            value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label style={labelStyle} htmlFor="gallery-date">Date</label>
            <input id="gallery-date" type="date" style={inputStyle} value={takenOn}
              onChange={(e) => setTakenOn(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle} htmlFor="gallery-season">Saison</label>
            <select id="gallery-season" style={inputStyle} value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
              <option value="">Aucune</option>
              {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label style={labelStyle} htmlFor="gallery-team">Équipe liée</label>
            <select id="gallery-team" style={inputStyle} value={teamId}
              onChange={(e) => { setTeamId(e.target.value); if (e.target.value) setEventId(''); }}>
              <option value="">Aucune</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle} htmlFor="gallery-event">Événement lié</label>
            <select id="gallery-event" style={inputStyle} value={eventId}
              onChange={(e) => { setEventId(e.target.value); if (e.target.value) setTeamId(''); }}>
              <option value="">Aucun</option>
              {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Annuler</Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>Enregistrer</Button>
        </div>
      </div>
    </StandardModal>
  );
}
