import { MessageCircle, Users, CircleUser as UserCircle, Megaphone, Image as ImageIcon, Video, UsersRound } from 'lucide-react';

interface Conversation {
  id: string;
  type: string;
  name: string | null;
  team_id: string | null;
  created_at: string;
  team_name?: string;
  team_category?: string;
  unread_count?: number;
  is_participant?: boolean;
  can_write?: boolean;
  last_message?: {
    body: string;
    created_at: string;
    sender_name: string;
    attachment_type?: 'image' | 'video' | null;
  };
}

interface ConversationListProps {
  conversations: Conversation[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

function conversationTypeLabel(type: string, name: string | null): string {
  switch (type) {
    case 'team_full':
      return 'Équipe complète';
    case 'staff_only':
      return 'Staff uniquement';
    case 'parent_coach':
      return 'Parent-Entraîneur';
    case 'club_announcement':
      return 'Annonce club';
    case 'event_committee':
      return 'Comité';
    case 'all_coaches':
      return 'Tous les entraîneurs';
    case 'committee':
      return 'Comité';
    case 'confrerie':
      return name || 'Confrérie';
    case 'supporters':
      return 'Supporters';
    case 'event_volunteers':
      return 'Bénévoles';
    case 'custom':
      return 'Groupe';
    default:
      return type;
  }
}

export function ConversationTypeBadge({ type, name }: { type: string; name: string | null }) {
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-medium"
      style={{
        background: 'var(--primary-opacity-20)',
        color: 'var(--primary)'
      }}
    >
      {conversationTypeLabel(type, name)}
    </span>
  );
}

export function ConversationList({ conversations, selectedId, onSelect }: ConversationListProps) {
  const getIcon = (type: string) => {
    switch (type) {
      case 'team_full':
        return <Users size={20} />;
      case 'staff_only':
        return <UserCircle size={20} />;
      case 'parent_coach':
        return <MessageCircle size={20} />;
      case 'club_announcement':
        return <Megaphone size={20} />;
      case 'all_coaches':
        return <UsersRound size={20} />;
      case 'committee':
      case 'confrerie':
      case 'supporters':
      case 'event_volunteers':
      case 'custom':
        return <UsersRound size={20} />;
      default:
        return <MessageCircle size={20} />;
    }
  };

  const getTypeLabel = (conv: Conversation) => conversationTypeLabel(conv.type, conv.name);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'À l\'instant';
    if (diffMins < 60) return `${diffMins}min`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}j`;
    return date.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit' });
  };

  return (
    <div className="space-y-2">
      {conversations.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-muted)]">
          <MessageCircle size={48} className="mx-auto mb-4 opacity-30" />
          <p>Aucune conversation</p>
        </div>
      ) : (
        conversations.map((conversation) => (
          <button
            key={conversation.id}
            onClick={() => onSelect(conversation.id)}
            className="w-full text-left p-4 rounded-lg transition-all"
            style={{
              background: selectedId === conversation.id ? 'var(--bg-card-hover)' : 'var(--bg-card)',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: selectedId === conversation.id ? 'var(--primary)' : 'var(--border-color)',
            }}
          >
            <div className="flex items-start gap-3">
              <div
                className="p-2 rounded-lg flex-shrink-0"
                style={{ background: 'var(--bg-sidebar)' }}
              >
                {getIcon(conversation.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                    {conversation.team_name || conversation.name || getTypeLabel(conversation)}
                  </h3>
                  {conversation.last_message && (
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                      {formatDate(conversation.last_message.created_at)}
                    </span>
                  )}
                </div>
                {conversation.team_category && (
                  <div className="text-xs mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                    {conversation.team_category}
                  </div>
                )}
                <div className="mb-2 flex items-center gap-2 flex-wrap">
                  <ConversationTypeBadge type={conversation.type} name={conversation.name} />
                  {conversation.can_write === false && (
                    <span
                      className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                      style={{
                        background: 'var(--bg-sidebar)',
                        color: 'var(--text-muted)',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      Annonce
                    </span>
                  )}
                  {conversation.is_participant === false && conversation.type !== 'club_announcement' && conversation.can_write !== false && (
                    <span
                      className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                      style={{
                        background: 'var(--bg-sidebar)',
                        color: 'var(--text-muted)',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      Lecture seule
                    </span>
                  )}
                </div>
                {conversation.last_message && (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      {conversation.last_message.attachment_type && (
                        <span className="flex-shrink-0" style={{ color: 'var(--primary)' }}>
                          {conversation.last_message.attachment_type === 'image' ? (
                            <ImageIcon size={16} />
                          ) : (
                            <Video size={16} />
                          )}
                        </span>
                      )}
                      <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
                        <span className="font-medium">{conversation.last_message.sender_name}:</span>{' '}
                        {conversation.last_message.attachment_type
                          ? (conversation.last_message.attachment_type === 'image' ? 'Image' : 'Vidéo')
                          : conversation.last_message.body}
                      </p>
                    </div>
                    {(conversation.unread_count ?? 0) > 0 && (
                      <span
                        className="flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{ background: 'var(--primary)', color: 'var(--accent-ink, var(--text-inverse))' }}
                      >
                        {conversation.unread_count}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </button>
        ))
      )}
    </div>
  );
}
