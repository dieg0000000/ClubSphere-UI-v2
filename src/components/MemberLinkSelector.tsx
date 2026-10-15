import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Link, Unlink } from 'lucide-react';
import SearchInput from './ui/SearchInput';

interface Member {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
}

interface MemberLinkSelectorProps {
  linkedMemberId: string | null;
  onLink: (member: Member) => void;
  onUnlink: () => void;
}

export default function MemberLinkSelector({ linkedMemberId, onLink, onUnlink }: MemberLinkSelectorProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [linkedMember, setLinkedMember] = useState<Member | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    fetchMembers();
  }, []);

  useEffect(() => {
    if (linkedMemberId) {
      fetchLinkedMember(linkedMemberId);
    } else {
      setLinkedMember(null);
    }
  }, [linkedMemberId]);

  const fetchMembers = async () => {
    const { data } = await supabase
      .from('members')
      .select('id, first_name, last_name, email, phone, address, postal_code, city')
      .order('last_name');

    if (data) setMembers(data);
  };

  const fetchLinkedMember = async (memberId: string) => {
    const { data } = await supabase
      .from('members')
      .select('id, first_name, last_name, email, phone, address, postal_code, city')
      .eq('id', memberId)
      .maybeSingle();

    if (data) setLinkedMember(data);
  };

  const filteredMembers = members.filter(member =>
    `${member.first_name} ${member.last_name}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectMember = (member: Member) => {
    onLink(member);
    setSearchQuery('');
    setShowDropdown(false);
  };

  if (linkedMember) {
    return (
      <div className="bg-[var(--info-soft)] border border-[var(--accent)] rounded-lg p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link size={20} className="text-[var(--accent-text)]" />
          <div>
            <p className="text-sm font-medium text-[var(--accent-text)]">
              Lié à {linkedMember.first_name} {linkedMember.last_name}
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Les coordonnées sont synchronisées
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onUnlink}
          className="flex items-center gap-2 px-3 py-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-inverse)] text-sm rounded-lg transition-colors"
        >
          <Unlink size={16} />
          Délier
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
        Lier à un joueur (optionnel)
      </label>
      <SearchInput
        value={searchQuery}
        onChange={(v) => { setSearchQuery(v); setShowDropdown(true); }}
        onFocus={() => setShowDropdown(true)}
        placeholder="Rechercher un joueur..."
      />

      {showDropdown && searchQuery && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
          <div className="absolute z-20 w-full mt-1 rounded-lg shadow-xl max-h-60 overflow-y-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            {filteredMembers.length > 0 ? (
              filteredMembers.slice(0, 10).map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => handleSelectMember(member)}
                  className="w-full px-4 py-3 text-left transition-colors border-b last:border-b-0"
                  style={{ borderColor: 'var(--border-color)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {member.first_name} {member.last_name}
                  </p>
                  {member.email && (
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{member.email}</p>
                  )}
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                Aucun joueur trouvé
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
