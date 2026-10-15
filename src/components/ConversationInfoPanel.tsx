import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, X, RefreshCw, UserMinus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { StandardModal } from './StandardModal';
import { ConfirmModal } from './ConfirmModal';
import Button from './ui/Button';
import { useToast } from '../hooks/useToast';
import { Toast } from './Toast';

import type { ContextLabels } from '../hooks/useConversationContextLabels';

const GROUP_TYPES = ['committee', 'confrerie', 'supporters', 'event_volunteers', 'custom'];
const SYNCABLE_TYPES = ['committee', 'confrerie', 'supporters', 'event_volunteers'];

interface Participant {
  user_id: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
  roles: string[];
  can_write: boolean;
  is_creator: boolean;
  participant_role: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  conversationType: string;
  conversationName: string;
  createdBy: string;
  onUpdated: () => void;
  contextLabels?: ContextLabels;
}

function roleBadgeLabel(r: string): string {
  switch (r) {
    case 'admin': return 'Admin';
    case 'committee': return 'Comité';
    case 'coach': return 'Entraîneur';
    case 'member': return 'Joueur';
    case 'parent': return 'Parent';
    case 'supporter': return 'Supporter';
    default: return r;
  }
}

export function ConversationInfoPanel({
  isOpen,
  onClose,
  conversationId,
  conversationType,
  conversationName,
  createdBy,
  onUpdated,
  contextLabels,
}: Props) {
  const { user, hasRole } = useAuth();
  const { clubId } = useTenant();
  const { toast, showToast } = useToast();

  const [editName, setEditName] = useState(conversationName);
  const [saving, setSaving] = useState(false);

  const [announceLoading, setAnnounceLoading] = useState(false);

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; label: string; roles: string[] }[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);

  const [syncing, setSyncing] = useState(false);

  const [removeTarget, setRemoveTarget] = useState<Participant | null>(null);
  const [removing, setRemoving] = useState(false);

  const isGroupType = GROUP_TYPES.includes(conversationType);
  const isSyncable = SYNCABLE_TYPES.includes(conversationType);

  const announce = useMemo(() => {
    if (!isGroupType || participants.length === 0) return false;
    return !participants.some(p => !p.is_creator && p.can_write);
  }, [participants, isGroupType]);

  useEffect(() => {
    if (isOpen) {
      setEditName(conversationName);
      loadParticipants();
    }
  }, [isOpen, conversationId]);

  const loadParticipants = async () => {
    setLoadingParticipants(true);
    const { data, error } = await supabase.rpc('get_conversation_participants', {
      p_conversation: conversationId,
    });
    if (error) {
      console.error('get_conversation_participants error:', error);
      setParticipants([]);
    } else {
      setParticipants((data as Participant[]) || []);
    }
    setLoadingParticipants(false);
  };

  const handleRename = async () => {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === conversationName) return;
    setSaving(true);
    const { error } = await supabase.rpc('rename_conversation', {
      p_conversation: conversationId,
      p_name: trimmed,
    });
    if (error) {
      showToast(error.message, 'error');
    } else {
      showToast('Nom mis à jour', 'success');
      onUpdated();
    }
    setSaving(false);
  };

  const handleToggleMode = async (newAnnounce: boolean) => {
    setAnnounceLoading(true);
    const { error } = await supabase.rpc('set_conversation_announce_mode', {
      p_conversation: conversationId,
      p_announce: newAnnounce,
    });
    if (error) {
      showToast(error.message, 'error');
    } else {
      showToast(newAnnounce ? 'Mode annonce activé' : 'Mode discussion activé', 'success');
      onUpdated();
      await loadParticipants();
    }
    setAnnounceLoading(false);
  };

  const searchAccounts = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const { data, error } = await supabase.rpc('search_club_accounts', {
      p_query: query,
      p_limit: 50,
    });
    if (error) {
      showToast(error.message, 'error');
      setSearching(false);
      return;
    }
    if (data) {
      const existingIds = new Set(participants.map(p => p.user_id));
      setSearchResults(
        (data as any[])
          .filter(p => !existingIds.has(p.id))
          .map(p => ({ id: p.id, label: p.full_name || p.email || p.id, roles: p.roles || [] }))
      );
    }
    setSearching(false);
  }, [participants]);

  const handleAddParticipant = async (userId: string) => {
    if (!clubId) return;
    setAdding(true);
    const { error } = await supabase
      .from('conversation_participants')
      .insert({
        conversation_id: conversationId,
        user_id: userId,
        role: 'member',
        can_write: !announce,
        club_id: clubId,
      });
    if (error) {
      showToast(error.code === '23505' ? 'Ce membre est déjà participant' : error.message, 'error');
    } else {
      showToast('Participant ajouté', 'success');
      setSearchQuery('');
      setSearchResults([]);
      await loadParticipants();
      onUpdated();
    }
    setAdding(false);
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    const { error } = await supabase
      .from('conversation_participants')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', removeTarget.user_id);
    if (error) {
      showToast(error.message, 'error');
    } else {
      showToast('Participant retiré', 'success');
      await loadParticipants();
      onUpdated();
    }
    setRemoving(false);
    setRemoveTarget(null);
  };

  const handleSync = async () => {
    setSyncing(true);
    const { data, error } = await supabase.rpc('sync_group_conversation', {
      p_conversation: conversationId,
    });
    if (error) {
      showToast(error.message, 'error');
    } else {
      const count = typeof data === 'number' ? data : 0;
      showToast(count > 0 ? `${count} personne(s) ajoutée(s)` : 'Le groupe est déjà à jour', 'success');
      await loadParticipants();
      onUpdated();
    }
    setSyncing(false);
  };

  return (
    <>
      <StandardModal
        isOpen={isOpen}
        onClose={onClose}
        title="Infos du groupe"
        width="520px"
        maxHeight="90vh"
      >
        <div className="space-y-6">
          {/* Rename */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              Renommer
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value.slice(0, 120))}
                className="flex-1 px-4 py-2 rounded-lg text-sm"
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                }}
                maxLength={120}
              />
              <Button
                variant="primary"
                onClick={handleRename}
                disabled={saving || !editName.trim() || editName.trim() === conversationName}
              >
                {saving ? '...' : 'Enregistrer'}
              </Button>
            </div>
          </div>

          {/* Mode toggle — group types only */}
          {isGroupType && (
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                Mode
              </label>
              <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
                <button
                  type="button"
                  onClick={() => !announceLoading && handleToggleMode(false)}
                  disabled={announceLoading}
                  className="flex-1 px-3 py-2 text-xs font-medium transition-colors disabled:opacity-60"
                  style={{
                    background: !announce ? 'var(--primary)' : 'var(--bg-input)',
                    color: !announce ? 'var(--accent-ink, var(--text-inverse))' : 'var(--text-secondary)',
                  }}
                >
                  Discussion — tout le monde peut écrire
                </button>
                <button
                  type="button"
                  onClick={() => !announceLoading && handleToggleMode(true)}
                  disabled={announceLoading}
                  className="flex-1 px-3 py-2 text-xs font-medium transition-colors disabled:opacity-60"
                  style={{
                    background: announce ? 'var(--primary)' : 'var(--bg-input)',
                    color: announce ? 'var(--accent-ink, var(--text-inverse))' : 'var(--text-secondary)',
                  }}
                >
                  Annonce — seul le créateur écrit
                </button>
              </div>
            </div>
          )}

          {/* Participants */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Participants ({participants.length})
              </label>
              {isSyncable && (
                <button
                  type="button"
                  onClick={handleSync}
                  disabled={syncing}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
                  style={{
                    background: 'var(--bg-sidebar)',
                    color: 'var(--primary)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
                  Mettre à jour depuis la liste
                </button>
              )}
            </div>

            {/* Add participant search */}
            <div className="relative mb-3">
              <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => searchAccounts(e.target.value)}
                placeholder="Ajouter un participant..."
                className="w-full pl-8 pr-4 py-2 rounded-lg text-sm"
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                }}
              />
              {searchResults.length > 0 && (
                <div
                  className="absolute left-0 right-0 top-full mt-1 rounded-lg max-h-40 overflow-y-auto z-10"
                  style={{ border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}
                >
                  {searchResults.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleAddParticipant(p.id)}
                      disabled={adding}
                      className="w-full text-left px-3 py-2 text-sm hover:opacity-80 disabled:opacity-50"
                      style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)' }}
                    >
                      <span>{p.label}</span>
                      {p.roles.length > 0 && (
                        <span className="ml-2">
                          {p.roles.map(r => (
                            <span
                              key={r}
                              className="inline-block ml-1 px-1.5 py-0 rounded text-[10px] font-medium"
                              style={{ background: 'var(--bg-sidebar)', color: 'var(--text-muted)' }}
                            >
                              {roleBadgeLabel(r)}
                            </span>
                          ))}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {searching && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-muted)' }}>...</span>
              )}
            </div>

            {/* Participant list */}
            {loadingParticipants ? (
              <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>Chargement…</p>
            ) : (
              <div
                className="rounded-lg overflow-y-auto"
                style={{ border: '1px solid var(--border-color)', maxHeight: '260px' }}
              >
                {participants.map(p => (
                  <div
                    key={p.user_id}
                    className="flex items-center gap-2 px-3 py-2.5 text-sm"
                    style={{ borderBottom: '1px solid var(--border-color)' }}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="truncate block" style={{ color: 'var(--text-primary)' }}>
                        {p.full_name}
                      </span>
                      <span className="flex flex-wrap gap-1 mt-0.5">
                        {p.is_creator && (
                          <span className="inline-block px-1.5 py-0 rounded text-[10px] font-medium" style={{ background: 'var(--primary-opacity-20)', color: 'var(--primary)' }}>
                            Créateur
                          </span>
                        )}
                        {p.roles.map(r => (
                          <span
                            key={r}
                            className="inline-block px-1.5 py-0 rounded text-[10px] font-medium"
                            style={{ background: 'var(--bg-sidebar)', color: 'var(--text-muted)' }}
                          >
                            {contextLabels?.[p.user_id] || roleBadgeLabel(r)}
                          </span>
                        ))}
                        {!p.can_write && (
                          <span
                            className="inline-block px-1.5 py-0 rounded text-[10px] font-medium"
                            style={{ background: 'var(--bg-sidebar)', color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}
                          >
                            lecture seule
                          </span>
                        )}
                      </span>
                    </span>
                    {!p.is_creator && (
                      <button
                        type="button"
                        onClick={() => setRemoveTarget(p)}
                        className="flex-shrink-0 p-1 rounded hover:opacity-70 transition-opacity"
                        style={{ color: 'var(--danger)' }}
                        title="Retirer"
                      >
                        <UserMinus size={14} />
                      </button>
                    )}
                  </div>
                ))}
                {participants.length === 0 && (
                  <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>Aucun participant</p>
                )}
              </div>
            )}
          </div>
        </div>
        <Toast toast={toast} />
      </StandardModal>

      <ConfirmModal
        isOpen={removeTarget !== null}
        title="Retirer un participant"
        message={`Retirer ${removeTarget?.full_name} du groupe ?`}
        confirmLabel="Retirer"
        cancelLabel="Annuler"
        confirmStyle="danger"
        loading={removing}
        loadingLabel="Retrait..."
        onConfirm={confirmRemove}
        onCancel={() => { if (!removing) setRemoveTarget(null); }}
      />
    </>
  );
}
