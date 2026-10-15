import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Link, Unlink, User, Users, Dumbbell } from 'lucide-react';

type SourceType = 'profile' | 'member' | 'coach';

interface PersonResult {
  id: string;
  first_name: string;
  last_name: string;
  label: string;
  source: SourceType;
}

interface PersonLinkSelectorProps {
  linkedProfileId: string | null;
  linkedMemberId: string | null;
  linkedCoachId?: string | null;
  onLink: (person: { id: string; first_name: string; last_name: string; source: SourceType }) => void;
  onUnlink: () => void;
}

export default function PersonLinkSelector({ linkedProfileId, linkedMemberId, linkedCoachId, onLink, onUnlink }: PersonLinkSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<PersonResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [linkedName, setLinkedName] = useState<string | null>(null);
  const [linkedSource, setLinkedSource] = useState<SourceType | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (linkedProfileId) {
      supabase.from('profiles').select('full_name').eq('id', linkedProfileId).maybeSingle()
        .then(({ data }) => { setLinkedName(data?.full_name || linkedProfileId); setLinkedSource('profile'); });
    } else if (linkedMemberId) {
      supabase.from('members').select('first_name, last_name').eq('id', linkedMemberId).maybeSingle()
        .then(({ data }) => { setLinkedName(data ? `${data.first_name} ${data.last_name}` : linkedMemberId); setLinkedSource('member'); });
    } else if (linkedCoachId) {
      supabase.from('coaches').select('first_name, last_name').eq('id', linkedCoachId).maybeSingle()
        .then(({ data }) => { setLinkedName(data ? `${data.first_name} ${data.last_name}` : linkedCoachId); setLinkedSource('coach'); });
    } else {
      setLinkedName(null);
      setLinkedSource(null);
    }
  }, [linkedProfileId, linkedMemberId, linkedCoachId]);

  useEffect(() => {
    if (searchQuery.length < 2) { setResults([]); return; }
    const q = searchQuery.trim().toLowerCase();
    const timer = setTimeout(async () => {
      const [{ data: profiles }, { data: members }, { data: coaches }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email').ilike('full_name', `%${q}%`).limit(8),
        supabase.from('members').select('id, first_name, last_name, email').or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`).limit(8),
        supabase.from('coaches').select('id, first_name, last_name, email').or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`).limit(8),
      ]);
      const merged: PersonResult[] = [];
      if (profiles) {
        for (const p of profiles) {
          const nameParts = (p.full_name || '').trim().split(' ');
          merged.push({
            id: p.id,
            first_name: nameParts.slice(0, -1).join(' ') || nameParts[0] || '',
            last_name: nameParts.length > 1 ? nameParts[nameParts.length - 1] : '',
            label: `${p.full_name || ''}${p.email ? ` (${p.email})` : ''} — Compte`,
            source: 'profile',
          });
        }
      }
      if (members) {
        for (const m of members) {
          merged.push({
            id: m.id,
            first_name: m.first_name,
            last_name: m.last_name,
            label: `${m.first_name} ${m.last_name}${m.email ? ` (${m.email})` : ''} — Membre`,
            source: 'member',
          });
        }
      }
      if (coaches) {
        for (const c of coaches) {
          merged.push({
            id: c.id,
            first_name: c.first_name,
            last_name: c.last_name,
            label: `${c.first_name} ${c.last_name}${c.email ? ` (${c.email})` : ''} — Entraîneur`,
            source: 'coach',
          });
        }
      }
      setResults(merged);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const sourceLabel = linkedSource === 'profile' ? 'Compte utilisateur' : linkedSource === 'coach' ? 'Entraîneur' : 'Fiche membre';

  if (linkedName) {
    return (
      <div className="rounded-lg p-4 flex items-center justify-between" style={{ background: 'var(--info-soft)', border: '1px solid var(--accent)' }}>
        <div className="flex items-center gap-3">
          <Link size={18} style={{ color: 'var(--accent-text)' }} />
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--accent-text)' }}>
              Lié à {linkedName}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {sourceLabel}
            </p>
          </div>
        </div>
        <button type="button" onClick={onUnlink} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ color: 'var(--danger)', background: 'var(--danger-soft)' }}>
          <Unlink size={14} /> Délier
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
        Rechercher une personne existante
      </label>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setShowDropdown(true); }}
          onFocus={() => { if (results.length) setShowDropdown(true); }}
          placeholder="Nom, prénom ou email..."
          className="w-full pl-9 pr-3 py-2 rounded-lg text-sm"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
        />
      </div>
      <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
        Optionnel. Si lié, les email/tél/photo non renseignés ici seront repris automatiquement du compte ou de la fiche membre dans l'annuaire public.
      </p>
      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg shadow-lg overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', maxHeight: '240px', overflowY: 'auto' }}>
          {results.map((r) => (
            <button
              key={`${r.source}-${r.id}`}
              type="button"
              onClick={() => { onLink({ id: r.id, first_name: r.first_name, last_name: r.last_name, source: r.source }); setSearchQuery(''); setShowDropdown(false); }}
              className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors"
              style={{ color: 'var(--text-primary)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {r.source === 'profile' ? <User size={14} style={{ color: 'var(--accent)' }} /> : r.source === 'coach' ? <Dumbbell size={14} style={{ color: 'var(--warning)' }} /> : <Users size={14} style={{ color: 'var(--text-muted)' }} />}
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
