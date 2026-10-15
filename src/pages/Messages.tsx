import { useState, useEffect, useRef } from 'react';
import { reportLoadError } from '../utils/reportLoadError';
import { LoadError } from '../components/LoadError';
import { Plus, ArrowLeft, Trash2, MoreHorizontal, Bell, BellOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { uniqueChannelName } from '../lib/realtime';
import { useAuth } from '../context/AuthContext';
import { useActiveNavView } from '../hooks/useNavView';
import { useTenant } from '../context/TenantContext';
import { useConversationContextLabels } from '../hooks/useConversationContextLabels';
import { ConversationList } from '../components/ConversationList';
import { MessageThread, MESSAGE_SELECT } from '../components/MessageThread';
import { NewConversationModal } from '../components/NewConversationModal';
import { StandardModal } from '../components/StandardModal';
import { ConversationInfoPanel } from '../components/ConversationInfoPanel';
import Button from '../components/ui/Button';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import { fetchConversationNotificationSettings, setConversationNotifications } from '../lib/conversationNotifications';

const MESSAGES_PAGE_SIZE = 30;

function getConversationTypeLabel(type: string | undefined): string {
  switch (type) {
    case 'team_full': return 'Équipe complète';
    case 'staff_only': return 'Staff uniquement';
    case 'parent_coach': return 'Parent-Entraîneur';
    case 'club_announcement': return 'Annonce club';
    case 'event_committee': return 'Comité';
    case 'all_coaches': return 'Tous les entraîneurs';
    case 'committee': return 'Comité';
    case 'confrerie': return 'Confrérie';
    case 'supporters': return 'Supporters';
    case 'event_volunteers': return 'Bénévoles';
    case 'custom': return 'Groupe';
    default: return 'Conversation';
  }
}

export default function Messages() {
  const { user, hasRole } = useAuth();
  const activeNavView = useActiveNavView();
  const { clubId } = useTenant();
  const { toast, showToast } = useToast();
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const currentConversationRef = useRef<string | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showMobileThread, setShowMobileThread] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [selectedCreatedBy, setSelectedCreatedBy] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [convNotif, setConvNotif] = useState<{ conversationId: string; enabled: boolean } | null>(null);
  const [savingConvNotif, setSavingConvNotif] = useState(false);

  const scope = activeNavView === 'admin' ? 'admin' : activeNavView === 'member' ? 'member' : undefined;

  useEffect(() => {
    setSelectedConversationId(null);
    setMessages([]);
    setHasOlderMessages(false);
    setShowMobileThread(false);
    setSelectedCreatedBy(null);
    setShowInfoPanel(false);
    setLoading(true);
    if (user?.id) {
      loadConversations();
    }
  }, [user?.id, activeNavView]);

  const ensureMyParticipation = async (conversationId: string) => {
    if (!user?.id || !clubId) return;

    const isAdminInAdminView = (hasRole('admin') || hasRole('committee')) && activeNavView === 'admin';
    if (!isAdminInAdminView) return;

    const { data: existing } = await supabase
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) return;

    const { error } = await supabase
      .from('conversation_participants')
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: 'admin',
        can_write: true,
        club_id: clubId,
      });

    if (error && error.code !== '23505') {
      reportLoadError('Messages', error);
      showToast('Erreur lors de la participation à la conversation', 'error');
    }
  };

  useEffect(() => {
    if (selectedConversationId) {
      const conv = conversations.find(c => c.id === selectedConversationId);
      const isParticipant = conv?.is_participant !== false;
      (async () => {
        if (isParticipant) {
          await ensureMyParticipation(selectedConversationId);
        }
        loadMessages(selectedConversationId);
        setCanWrite(isParticipant ? (conv?.can_write ?? true) : false);
      })();
      setShowMobileThread(true);
    }
  }, [selectedConversationId]);

  useEffect(() => {
    setConvNotif(null);
    if (!selectedConversationId) return;
    let cancelled = false;
    fetchConversationNotificationSettings().then((rows) => {
      if (cancelled || !rows) return;
      const row = rows.find((r) => r.conversation_id === selectedConversationId);
      if (row && row.lockable && row.type !== 'club_announcement') {
        setConvNotif({ conversationId: row.conversation_id, enabled: row.enabled });
      }
    });
    return () => { cancelled = true; };
  }, [selectedConversationId]);

  const handleToggleConvNotif = async () => {
    if (!convNotif || savingConvNotif) return;
    const { conversationId, enabled } = convNotif;
    setConvNotif({ conversationId, enabled: !enabled });
    setSavingConvNotif(true);
    const ok = await setConversationNotifications(conversationId, !enabled);
    setSavingConvNotif(false);
    if (!ok) {
      setConvNotif((prev) => (prev?.conversationId === conversationId ? { conversationId, enabled } : prev));
      showToast('Impossible de modifier ce réglage.', 'error');
    }
  };

  useEffect(() => {
    if (!user?.id) return;

    const conversationsChannel = supabase
      .channel(uniqueChannelName('conversations-updates'))
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversations',
        },
        () => {
          loadConversations();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversation_participants',
        },
        () => {
          loadConversations();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversation_messages',
        },
        () => {
          loadConversations();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_messages',
        },
        () => {
          loadConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(conversationsChannel);
    };
  }, [user?.id]);

  const loadConversations = async () => {
    if (!user?.id) return;

    const rpcArgs = scope ? { p_scope: scope } : {};
    const { data: bundle, error } = await supabase.rpc('get_conversations_bundle', rpcArgs);

    if (error) {
      reportLoadError('Messages', error);
      setLoadFailed(true);
      setConversations([]);
      setLoading(false);
      return;
    }

    const rows = (bundle?.conversations ?? []).map((conv: any) => ({
      id: conv.id,
      type: conv.type,
      name: conv.name,
      team_id: conv.team_id,
      created_by: conv.created_by || null,
      created_at: conv.created_at,
      team_name: conv.team?.name || null,
      team_category: conv.team?.category || null,
      last_message: conv.last_message
        ? {
            body: conv.last_message.body,
            created_at: conv.last_message.created_at,
            sender_name: conv.last_message.sender_name || 'Inconnu',
            attachment_type: conv.last_message.attachment_type || null,
          }
        : null,
      unread_count: conv.unread_count ?? 0,
      is_participant: conv.is_participant ?? true,
      can_write: conv.can_write ?? true,
    }));


    setConversations(rows);
    setLoading(false);
  };

  const fetchMessagesPage = async (conversationId: string, before?: string) => {
    let query = supabase
      .from('conversation_messages')
      .select(MESSAGE_SELECT)
      .eq('conversation_id', conversationId);
    if (before) query = query.lt('created_at', before);
    const { data: messagesData, error } = await query
      .order('created_at', { ascending: false })
      .limit(MESSAGES_PAGE_SIZE);

    if (error) {
      reportLoadError('Messages', error);
      return null;
    }

    const page: any[] = (messagesData || []).slice().reverse();
    const hasMore = page.length === MESSAGES_PAGE_SIZE;
    if (page.length === 0) return { messages: [], hasMore };

    const senderIds = [...new Set(page.map(m => m.sender_id))];
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .in('id', senderIds);

    const profilesMap = new Map(
      (profilesData || []).map(p => [p.id, { full_name: p.full_name, role: p.role }])
    );

    return {
      messages: page.map((msg: any) => ({
        ...msg,
        sender: profilesMap.get(msg.sender_id) || null,
      })),
      hasMore,
    };
  };

  const loadMessages = async (conversationId: string) => {
    currentConversationRef.current = conversationId;
    const result = await fetchMessagesPage(conversationId);
    if (!result || currentConversationRef.current !== conversationId) return;
    setMessages(result.messages);
    setHasOlderMessages(result.hasMore);
  };

  const handleLoadOlderMessages = async (before: string) => {
    if (!selectedConversationId) return null;
    return fetchMessagesPage(selectedConversationId, before);
  };

  const handleSendMessage = async (body: string, attachmentData?: {
    url: string;
    type: 'image' | 'video';
    name: string;
  }, replyToId?: string) => {
    if (!selectedConversationId || !user?.id) return;

    const messageData: any = {
      conversation_id: selectedConversationId,
      sender_id: user.id,
      body: body || '',
    };
    if (replyToId) messageData.reply_to_id = replyToId;

    if (attachmentData) {
      messageData.attachment_url = attachmentData.url;
      messageData.attachment_type = attachmentData.type;
      messageData.attachment_name = attachmentData.name;
    }

    const { error } = await supabase.from('conversation_messages').insert(messageData);

    if (error) {
      throw error;
    }
  };

  const handleMarkAsRead = async (messageIds: string[]) => {
    if (!user?.id || messageIds.length === 0) return;

    for (const messageId of messageIds) {
      const { data: message } = await supabase
        .from('conversation_messages')
        .select('read_by')
        .eq('id', messageId)
        .maybeSingle();

      if (message && !message.read_by.includes(user.id)) {
        await supabase
          .from('conversation_messages')
          .update({ read_by: [...message.read_by, user.id] })
          .eq('id', messageId);
      }
    }

    await loadConversations();
  };

  const handleCreateGroup = async (data: {
    type: string;
    name: string | null;
    event_id: string | null;
    participants: string[] | null;
    announce: boolean;
  }) => {
    if (!user?.id) return;
    const { data: newId, error } = await supabase.rpc('create_group_conversation', {
      p_type: data.type,
      p_name: data.name,
      p_event_id: data.event_id,
      p_participants: data.participants,
      p_announce: data.announce,
    });
    if (error) {
      console.error('Error creating group conversation:', error);
      throw new Error(error.message);
    }
    const existingConv = conversations.find(c => c.id === newId);
    await loadConversations();
    setSelectedConversationId(newId);
    if (existingConv) {
      showToast('Ce groupe existe déjà — il a été mis à jour', 'warning');
    }
  };

  const handleCreateConversation = async (data: {
    type: string;
    team_id: string | null;
    name: string | null;
    participant_ids: string[];
  }) => {
    if (!user?.id) return;

    console.log('Creating conversation with data:', {
      type: data.type,
      team_id: data.team_id,
      name: data.name,
      created_by: user.id,
    });

    const participants: any[] = [{ user_id: user.id, role: 'creator', can_write: true }];

    const { data: adminProfiles } = await supabase
      .from('profiles')
      .select('id')
      .in('role', ['admin', 'president', 'vice_president', 'responsable_technique', 'committee']);

    if (adminProfiles) {
      adminProfiles.forEach((profile) => {
        if (profile.id !== user.id) {
          participants.push({
            user_id: profile.id,
            role: 'admin',
            can_write: true
          });
        }
      });
    }

    if (data.type === 'team_full' || data.type === 'staff_only') {
      const { data: teamData } = await supabase
        .from('teams')
        .select('coach_id, assistant_coach_id')
        .eq('id', data.team_id)
        .maybeSingle();

      if (teamData?.coach_id) {
        const { data: coachUser } = await supabase
          .from('coaches')
          .select('user_id')
          .eq('id', teamData.coach_id)
          .maybeSingle();

        if (coachUser?.user_id && coachUser.user_id !== user.id) {
          participants.push({ user_id: coachUser.user_id, role: 'coach', can_write: true });
        }
      }

      if (data.type === 'team_full') {
        const { data: teamMembers } = await supabase
          .from('members')
          .select('id, email')
          .eq('team_id', data.team_id);

        if (teamMembers) {
          const memberIds = teamMembers.map((m) => m.id);
          const memberEmails = teamMembers
            .map((m) => m.email)
            .filter((e): e is string => !!e && e.trim() !== '');

          if (memberEmails.length > 0) {
            const { data: memberProfiles, error: memberLookupError } = await supabase
              .rpc('get_user_ids_by_emails', { emails: memberEmails });

            if (memberLookupError) {
              console.error('member email lookup failed:', memberLookupError);
            }

            if (memberProfiles) {
              memberProfiles.forEach((profile: { id: string; email: string }) => {
                if (profile.id !== user.id) {
                  participants.push({ user_id: profile.id, role: 'member', can_write: true });
                }
              });
            }
          }

          if (memberIds.length > 0) {
            const { data: parentLinks } = await supabase
              .from('parent_members')
              .select('parent_user_id')
              .in('member_id', memberIds);

            if (parentLinks) {
              parentLinks.forEach((link) => {
                if (link.parent_user_id && link.parent_user_id !== user.id) {
                  participants.push({ user_id: link.parent_user_id, role: 'parent', can_write: true });
                }
              });
            }
          }
        }
      }
    }

    if (data.type === 'parent_coach' && data.participant_ids.length > 0) {
      const { data: parentLinks } = await supabase
        .from('parent_members')
        .select('parent_user_id')
        .in('member_id', data.participant_ids);

      if (parentLinks) {
        parentLinks.forEach((link) => {
          if (link.parent_user_id !== user.id) {
            participants.push({ user_id: link.parent_user_id, role: 'parent', can_write: true });
          }
        });
      }
    }

    const dedupedParticipants = Array.from(
      new Map(participants.map((p) => [p.user_id, p])).values()
    );

    console.log('Creating conversation via RPC with participants:', dedupedParticipants);

    const { data: newConversationId, error } = await supabase.rpc('create_conversation_with_participants', {
      p_type: data.type,
      p_team_id: data.team_id,
      p_name: data.name,
      p_participants: dedupedParticipants,
    });

    if (error) {
      console.error('Error creating conversation:', error);
      throw error;
    }

    await loadConversations();
    setSelectedConversationId(newConversationId);
  };

  const canCreateConversation = activeNavView === 'admin' || (hasRole('coach') && activeNavView === 'coach');
  const canDeleteConversation = activeNavView === 'admin';
  const isAdminOrCommittee = hasRole('admin') || hasRole('president') || hasRole('vice_president') || hasRole('responsable_technique') || hasRole('committee');

  const selectedConversation = conversations.find((c) => c.id === selectedConversationId);
  const contextLabels = useConversationContextLabels(
    selectedConversationId,
    selectedConversation?.type,
    selectedConversation?.team_id,
  );
  const selectedIsParticipant = selectedConversation?.is_participant !== false;

  const handleDeleteConversation = async () => {
    if (!selectedConversationId || deleteConfirmText !== 'EFFACER') return;
    setDeleting(true);
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', selectedConversationId);
    if (error) {
      console.error('Error deleting conversation:', error);
      showToast('Erreur lors de la suppression de la conversation', 'error');
      setDeleting(false);
      return;
    }
    setShowDeleteModal(false);
    setDeleteConfirmText('');
    setSelectedConversationId(null);
    setShowMobileThread(false);
    setMessages([]);
    await loadConversations();
    setDeleting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{ borderColor: 'var(--primary)' }}></div>
          <p style={{ color: 'var(--text-secondary)' }}>Chargement...</p>
        </div>
      </div>
    );
  }

  if (loadFailed) {
    return <LoadError onRetry={loadConversations} />;
  }

  return (
    <div>
      <div className={`flex items-center justify-between mb-6 ${showMobileThread ? 'max-lg:hidden' : ''}`}>
        <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Messages
        </h1>
        {canCreateConversation && (
          <Button
            variant="primary"
            leftIcon={<Plus size={20} />}
            onClick={() => setShowNewModal(true)}
          >
            Nouvelle conversation
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" style={{ height: 'calc(100dvh - 120px)' }}>
        <div
          className={`lg:col-span-1 overflow-y-auto ${showMobileThread ? 'hidden lg:block' : 'block'}`}
          style={{
            background: 'var(--bg-card)',
            borderRadius: '8px',
            padding: '16px',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: 'var(--border-color)',
          }}
        >
          <ConversationList
            conversations={conversations}
            selectedId={selectedConversationId || undefined}
            onSelect={(id) => {
              setSelectedConversationId(id);
            }}
          />
        </div>

        <div
          className={`lg:col-span-2 ${!showMobileThread ? 'hidden lg:flex' : 'flex'} flex-col max-lg:fixed max-lg:inset-x-0 max-lg:top-0 max-lg:z-30 bg-[var(--bg-page)] lg:bg-[var(--bg-card)] lg:rounded-lg lg:border`}
          style={{
            borderColor: 'var(--border-color)',
            bottom: 'var(--app-bottom-nav-space, 0px)',
            overflow: 'hidden',
            minHeight: 0,
          }}
        >
          {selectedConversationId ? (
            <>
              <div
                className="px-4 py-3 lg:p-4 border-b flex items-center gap-3 flex-shrink-0"
                style={{ borderColor: 'var(--border-color)', paddingTop: 'max(12px, env(safe-area-inset-top, 0px))' }}
              >
                <button
                  onClick={() => {
                    setShowMobileThread(false);
                    setSelectedConversationId(null);
                  }}
                  className="lg:hidden p-2 rounded-lg"
                  style={{ background: 'var(--bg-sidebar)' }}
                  aria-label="Retour"
                >
                  <ArrowLeft size={20} />
                </button>
                <h2
                  className="font-semibold flex-1 truncate"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {selectedConversation?.name
                    || (selectedConversation?.team_name
                      ? `${selectedConversation.team_name} — ${getConversationTypeLabel(selectedConversation.type)}`
                      : getConversationTypeLabel(selectedConversation?.type))
                  }
                </h2>
                {convNotif && convNotif.conversationId === selectedConversationId && selectedConversation?.type !== 'club_announcement' && (
                  <button
                    onClick={handleToggleConvNotif}
                    className="p-2 rounded-lg flex items-center justify-center transition-colors"
                    style={{
                      background: 'transparent',
                      color: convNotif.enabled ? 'var(--text-secondary)' : 'var(--text-muted)',
                      border: '1px solid var(--border-color)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--bg-sidebar)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                    aria-pressed={convNotif.enabled}
                    aria-label={convNotif.enabled ? 'Désactiver les notifications de cette conversation' : 'Activer les notifications de cette conversation'}
                    title={convNotif.enabled ? 'Notifications activées' : 'Notifications désactivées'}
                  >
                    {convNotif.enabled ? <Bell size={18} /> : <BellOff size={18} />}
                  </button>
                )}
                {(selectedConversation?.created_by === user?.id || isAdminOrCommittee) && (
                  <button
                    onClick={async () => {
                      if (!selectedCreatedBy && selectedConversationId) {
                        const { data: convRow } = await supabase
                          .from('conversations')
                          .select('created_by')
                          .eq('id', selectedConversationId)
                          .maybeSingle();
                        setSelectedCreatedBy(convRow?.created_by || null);
                      }
                      setShowInfoPanel(true);
                    }}
                    className="p-2 rounded-lg flex items-center justify-center transition-colors"
                    style={{
                      background: 'transparent',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border-color)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--bg-sidebar)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                    aria-label="Infos du groupe"
                    title="Infos du groupe"
                  >
                    <MoreHorizontal size={18} />
                  </button>
                )}
                {canDeleteConversation && selectedConversation?.type !== 'all_coaches' && (
                  <button
                    onClick={() => {
                      setShowDeleteModal(true);
                      setDeleteConfirmText('');
                    }}
                    className="p-2 rounded-lg flex items-center justify-center transition-colors"
                    style={{
                      background: 'transparent',
                      color: 'var(--danger)',
                      border: '1px solid var(--danger-soft)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--danger-soft)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                    aria-label="Supprimer la conversation"
                    title="Supprimer la conversation"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
              <div className="flex-1 min-h-0">
                <MessageThread
                  conversationId={selectedConversationId}
                  conversationName={selectedConversation?.name}
                  conversationType={selectedConversation?.type}
                  messages={messages}
                  initialHasOlder={hasOlderMessages}
                  onLoadOlder={handleLoadOlderMessages}
                  canWrite={canWrite}
                  isParticipant={selectedIsParticipant}
                  onSendMessage={handleSendMessage}
                  onMarkAsRead={handleMarkAsRead}
                  contextLabels={contextLabels}
                />
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-[var(--text-muted)]">
                <p>Sélectionnez une conversation pour commencer</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <NewConversationModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreate={handleCreateConversation}
        onCreateGroup={handleCreateGroup}
      />

      <StandardModal
        isOpen={showDeleteModal}
        onClose={() => {
          if (deleting) return;
          setShowDeleteModal(false);
          setDeleteConfirmText('');
        }}
        title="Supprimer la conversation"
        width="460px"
      >
        <p
          style={{
            margin: 0,
            marginBottom: '16px',
            fontSize: '14px',
            lineHeight: 1.55,
            color: 'var(--text-primary)',
          }}
        >
          Cette action est définitive et irréversible. Tous les messages de cette
          conversation seront supprimés pour tous les participants.
        </p>
        <label
          htmlFor="delete-confirm-input"
          style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: '8px',
          }}
        >
          Pour confirmer, tapez EFFACER ci-dessous :
        </label>
        <input
          id="delete-confirm-input"
          type="text"
          value={deleteConfirmText}
          onChange={(e) => setDeleteConfirmText(e.target.value)}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          disabled={deleting}
          placeholder="EFFACER"
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: '14px',
            background: 'var(--bg-input)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            outline: 'none',
            boxSizing: 'border-box',
            marginBottom: '20px',
          }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
          }}
        >
          <Button
            variant="secondary"
            type="button"
            disabled={deleting}
            onClick={() => {
              setShowDeleteModal(false);
              setDeleteConfirmText('');
            }}
          >
            Annuler
          </Button>
          <Button
            variant="danger"
            type="button"
            disabled={deleteConfirmText !== 'EFFACER' || deleting}
            onClick={handleDeleteConversation}
          >
            {deleting ? 'Suppression...' : 'Effacer'}
          </Button>
        </div>
      </StandardModal>

      {showInfoPanel && selectedConversationId && selectedConversation && (
        <ConversationInfoPanel
          isOpen={showInfoPanel}
          onClose={() => setShowInfoPanel(false)}
          conversationId={selectedConversationId}
          conversationType={selectedConversation.type}
          contextLabels={contextLabels}
          conversationName={
            selectedConversation.name
            || (selectedConversation.team_name
              ? `${selectedConversation.team_name} — ${getConversationTypeLabel(selectedConversation.type)}`
              : getConversationTypeLabel(selectedConversation.type))
          }
          createdBy={selectedCreatedBy || selectedConversation.created_by || ''}
          onUpdated={() => {
            loadConversations();
          }}
        />
      )}

      <Toast toast={toast} />
    </div>
  );
}
