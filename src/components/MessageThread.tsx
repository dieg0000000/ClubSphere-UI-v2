import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Send, Users, Paperclip, Film, X, Trash2, MoreHorizontal, CornerUpLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { uniqueChannelName } from '../lib/realtime';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import { ConfirmModal } from './ConfirmModal';
import Button from './ui/Button';
import { pushSupported } from '../lib/pushSubscription';

import type { ContextLabels } from '../hooks/useConversationContextLabels';

interface QuotedMessage {
  id: string;
  body: string | null;
  sender_id: string;
  attachment_type?: 'image' | 'video' | null;
  deleted_at?: string | null;
}

interface Message {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender: {
    full_name: string | null;
    role: string;
  } | null;
  read_by: string[];
  attachment_url?: string | null;
  attachment_type?: 'image' | 'video' | null;
  attachment_name?: string | null;
  deleted_at?: string | null;
  reply_to_id?: string | null;
  reply_to?: QuotedMessage | QuotedMessage[] | null;
}

interface MessageThreadProps {
  conversationId: string;
  conversationName?: string;
  conversationType?: string;
  messages: Message[];
  initialHasOlder: boolean;
  onLoadOlder: (before: string) => Promise<{ messages: Message[]; hasMore: boolean } | null>;
  canWrite: boolean;
  isParticipant?: boolean;
  onSendMessage: (body: string, attachmentData?: {
    url: string;
    type: 'image' | 'video';
    name: string;
  }, replyToId?: string) => Promise<void>;
  onMarkAsRead: (messageIds: string[]) => Promise<void>;
  onNewMessage?: (message: Message) => void;
  contextLabels?: ContextLabels;
}

const ATTACHMENT_BUCKET = 'message-attachments';
const TOP_LOAD_THRESHOLD = 64;
const BOTTOM_STICK_THRESHOLD = 80;
const HIGHLIGHT_MS = 1500;
const MAX_JUMP_PAGES = 10;
const LONG_PRESS_MS = 500;
const SWIPE_MAX = 72;
const SWIPE_TRIGGER = 56;

export const MESSAGE_SELECT =
  'id, sender_id, body, created_at, read_by, attachment_url, attachment_type, attachment_name, deleted_at, reply_to_id, reply_to:conversation_messages!reply_to_id(id, body, sender_id, attachment_type, deleted_at)';

function normalizeQuoted(value: Message['reply_to']): QuotedMessage | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function quotePreview(message: { body?: string | null; attachment_type?: string | null }): string {
  if (message.body?.trim()) return message.body;
  if (message.attachment_type === 'image') return '📷 Photo';
  return '📎 Pièce jointe';
}

function toAttachmentPath(value: string): string {
  const marker = `/${ATTACHMENT_BUCKET}/`;
  const idx = value.indexOf(marker);
  if (idx === -1) return value;
  return decodeURIComponent(value.slice(idx + marker.length).split('?')[0]);
}

export function MessageThread({
  conversationId,
  conversationName,
  conversationType,
  messages,
  initialHasOlder,
  onLoadOlder,
  canWrite,
  isParticipant = true,
  onSendMessage,
  onMarkAsRead,
  onNewMessage,
  contextLabels,
}: MessageThreadProps) {
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [localMessages, setLocalMessages] = useState<Message[]>(messages);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [composerFocused, setComposerFocused] = useState(false);

  useEffect(() => {
    if (!selectedFile || !selectedFile.type.startsWith('image/')) {
      setFilePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setFilePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingMessage, setDeletingMessage] = useState(false);
  const [profileMap, setProfileMap] = useState<Record<string, { full_name: string; role: string }>>({});
  const { toast, showToast } = useToast();
  const listRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pendingInitialScrollRef = useRef(true);
  const prependAnchorRef = useRef<{ height: number; top: number } | null>(null);
  const atBottomRef = useRef(true);
  const [hasOlder, setHasOlder] = useState(initialHasOlder);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadingOlderRef = useRef(false);
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { user } = useAuth();
  const [readStats, setReadStats] = useState<Record<string, { read_count: number; unread_count: number }>>({});
  const markedReadRef = useRef<Set<string>>(new Set());
  const [userReadIds, setUserReadIds] = useState<Set<string>>(new Set());

  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [menu, setMenu] = useState<{ id: string; above: boolean } | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [swipe, setSwipe] = useState<{ id: string; dx: number } | null>(null);
  const localMessagesRef = useRef(localMessages);
  localMessagesRef.current = localMessages;
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pendingScrollToRef = useRef<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const touchStartRef = useRef<{ id: string; x: number; y: number; swiping: boolean } | null>(null);

  useEffect(() => {
    pendingInitialScrollRef.current = true;
    prependAnchorRef.current = null;
    pendingScrollToRef.current = null;
    atBottomRef.current = true;
    setLocalMessages(messages);
  }, [messages]);

  useEffect(() => {
    setReplyTo(null);
    setMenu(null);
    setHighlightId(null);
  }, [conversationId]);

  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  useEffect(() => () => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  }, []);

  const scrollToMessage = (id: string) => {
    const list = listRef.current;
    const el = messageRefs.current.get(id);
    if (!list || !el) return;
    const listRect = list.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    list.scrollTop += elRect.top - listRect.top - Math.max(0, (list.clientHeight - elRect.height) / 2);
    atBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < BOTTOM_STICK_THRESHOLD;
    setHighlightId(id);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
  };

  useEffect(() => {
    setHasOlder(initialHasOlder);
  }, [initialHasOlder, messages]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (pendingInitialScrollRef.current) {
      list.scrollTop = list.scrollHeight;
      atBottomRef.current = true;
      if (localMessages.length > 0) pendingInitialScrollRef.current = false;
    } else if (pendingScrollToRef.current) {
      const target = pendingScrollToRef.current;
      pendingScrollToRef.current = null;
      prependAnchorRef.current = null;
      scrollToMessage(target);
    } else if (prependAnchorRef.current) {
      const { height, top } = prependAnchorRef.current;
      list.scrollTop = list.scrollHeight - height + top;
      prependAnchorRef.current = null;
    } else if (atBottomRef.current) {
      list.scrollTop = list.scrollHeight;
    }
  }, [localMessages]);

  useEffect(() => {
    const content = contentRef.current;
    const list = listRef.current;
    if (!content || !list || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (atBottomRef.current) list.scrollTop = list.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const loadOlder = async () => {
    const list = listRef.current;
    const oldest = localMessages[0];
    if (!list || !oldest || !hasOlder || loadingOlderRef.current) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    const requestedFor = conversationId;
    const result = await onLoadOlder(oldest.created_at);
    loadingOlderRef.current = false;
    setLoadingOlder(false);
    if (!result || requestedFor !== conversationIdRef.current) return;
    setHasOlder(result.hasMore);
    if (result.messages.length === 0) return;
    prependAnchorRef.current = { height: list.scrollHeight, top: list.scrollTop };
    setLocalMessages((prev) => {
      const known = new Set(prev.map((m) => m.id));
      return [...result.messages.filter((m) => !known.has(m.id)), ...prev];
    });
  };

  const jumpToMessage = async (id: string) => {
    if (localMessages.some((m) => m.id === id)) {
      scrollToMessage(id);
      return;
    }
    if (!hasOlder || loadingOlderRef.current) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    const requestedFor = conversationId;
    let list = localMessages;
    let more: boolean = hasOlder;
    let pages = 0;
    let found = false;
    while (more && pages < MAX_JUMP_PAGES && list.length > 0) {
      const result = await onLoadOlder(list[0].created_at);
      if (!result || requestedFor !== conversationIdRef.current) break;
      pages += 1;
      more = result.hasMore;
      const known = new Set(list.map((m) => m.id));
      list = [...result.messages.filter((m) => !known.has(m.id)), ...list];
      if (list.some((m) => m.id === id)) {
        found = true;
        break;
      }
    }
    loadingOlderRef.current = false;
    setLoadingOlder(false);
    if (!found || requestedFor !== conversationIdRef.current) return;
    const loaded = list;
    setHasOlder(more);
    pendingScrollToRef.current = id;
    setLocalMessages((prev) => {
      const known = new Set(prev.map((m) => m.id));
      return [...loaded.filter((m) => !known.has(m.id)), ...prev];
    });
  };

  const getQuoted = (message: Message): QuotedMessage | null => {
    if (!message.reply_to_id) return null;
    const loaded = localMessages.find((m) => m.id === message.reply_to_id);
    if (loaded) {
      return {
        id: loaded.id,
        body: loaded.body,
        sender_id: loaded.sender_id,
        attachment_type: loaded.attachment_type,
        deleted_at: loaded.deleted_at,
      };
    }
    return normalizeQuoted(message.reply_to);
  };

  const startReply = (message: Message) => {
    setMenu(null);
    setReplyTo(message);
  };

  const openMenu = (id: string, anchor: HTMLElement) => {
    const list = listRef.current;
    let above = false;
    if (list) {
      const listRect = list.getBoundingClientRect();
      above = anchor.getBoundingClientRect().top - listRect.top > listRect.height / 2;
    }
    setMenu({ id, above });
  };

  const clearLongPress = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };

  const handleBubbleTouchStart = (e: React.TouchEvent<HTMLDivElement>, message: Message) => {
    const touch = e.touches[0];
    if (!touch || e.touches.length > 1) return;
    const anchor = e.currentTarget;
    longPressFiredRef.current = false;
    touchStartRef.current = { id: message.id, x: touch.clientX, y: touch.clientY, swiping: true };
    clearLongPress();
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      touchStartRef.current = null;
      setSwipe(null);
      openMenu(message.id, anchor);
    }, LONG_PRESS_MS);
  };

  const handleBubbleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    const touch = e.touches[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearLongPress();
    if (!start.swiping) return;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
      start.swiping = false;
      setSwipe(null);
      return;
    }
    if (dx > 8 && dx > Math.abs(dy) * 1.5) {
      setSwipe({ id: start.id, dx: Math.min(dx, SWIPE_MAX) });
    }
  };

  const handleBubbleTouchEnd = (e: React.TouchEvent<HTMLDivElement>, message: Message) => {
    clearLongPress();
    if (longPressFiredRef.current) {
      e.preventDefault();
      longPressFiredRef.current = false;
    }
    if (swipe && swipe.id === message.id && swipe.dx >= SWIPE_TRIGGER) startReply(message);
    setSwipe(null);
    touchStartRef.current = null;
  };

  const handleListScroll = () => {
    const list = listRef.current;
    if (!list) return;
    atBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < BOTTOM_STICK_THRESHOLD;
    if (list.scrollTop < TOP_LOAD_THRESHOLD) loadOlder();
  };

  useEffect(() => {
    const list = listRef.current;
    if (!list || loadingOlder || !hasOlder || localMessages.length === 0) return;
    if (list.scrollHeight <= list.clientHeight) loadOlder();
  }, [localMessages, hasOlder, loadingOlder]);

  useEffect(() => {
    const pending = Array.from(new Set(
      localMessages
        .map((m) => m.attachment_url)
        .filter((v): v is string => !!v && !(v in signedUrls))
    ));
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.all(pending.map(async (raw) => {
        const { data, error } = await supabase.storage
          .from(ATTACHMENT_BUCKET)
          .createSignedUrl(toAttachmentPath(raw), 3600);
        if (error || !data?.signedUrl) {
          console.error('Attachment signing failed:', error);
          return [raw, ''] as const;
        }
        return [raw, data.signedUrl] as const;
      }));
      if (cancelled) return;
      setSignedUrls((prev) => {
        const next = { ...prev };
        for (const [raw, url] of results) next[raw] = url;
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [localMessages, signedUrls]);

  useEffect(() => {
    if (!user?.id || localMessages.length === 0) return;
    const msgIds = localMessages.map(m => m.id);
    supabase
      .from('message_reads')
      .select('message_id')
      .eq('user_id', user.id)
      .in('message_id', msgIds)
      .then(({ data }) => {
        setUserReadIds(new Set((data || []).map(r => r.message_id)));
      });
  }, [localMessages, user?.id]);

  useEffect(() => {
    const fetchProfiles = async () => {
      if (localMessages.length === 0) return;

      const senderIds = [...new Set(localMessages.flatMap((m) => {
        const quoted = normalizeQuoted(m.reply_to);
        return quoted ? [m.sender_id, quoted.sender_id] : [m.sender_id];
      }))].filter(Boolean);

      const { data: senderData, error } = await supabase.rpc('get_sender_display_names', {
        user_ids: senderIds
      });

      console.log('RPC get_sender_display_names:', { senderIds, senderData, error });

      if (error) {
        console.error('Error fetching sender names:', error);
        return;
      }

      if (senderData) {
        const map = Object.fromEntries(
          senderData.map((s: any) => [s.id, { full_name: s.full_name, role: s.role }])
        );
        setProfileMap(map);
        console.log('Profile map updated:', map);
      }
    };

    fetchProfiles();
  }, [localMessages]);

  useEffect(() => {
    const unreadMessages = localMessages.filter(
      (m) => m.sender_id !== user?.id && !userReadIds.has(m.id) && !markedReadRef.current.has(m.id)
    );

    if (unreadMessages.length > 0) {
      onMarkAsRead(unreadMessages.map((m) => m.id));

      if (user?.id) {
        const toMark = unreadMessages.filter(m => !markedReadRef.current.has(m.id));
        if (toMark.length > 0) {
          toMark.forEach(m => markedReadRef.current.add(m.id));
          (async () => {
            const { data: convData } = await supabase.from('conversations').select('club_id').eq('id', conversationId).maybeSingle();
            const clubId = convData?.club_id;
            if (!clubId) return;
            const rows = toMark.map(msg => ({
              message_id: msg.id,
              user_id: user.id,
              club_id: clubId,
            }));
            const { error } = await supabase
              .from('message_reads')
              .upsert(rows, { onConflict: 'message_id,user_id', ignoreDuplicates: true });
            if (error) {
              console.warn('[ClubSphere] message_reads upsert error:', error.message);
            }
            setUserReadIds(prev => {
              const next = new Set(prev);
              toMark.forEach(m => next.add(m.id));
              return next;
            });
          })();
        }
      }
    }
  }, [localMessages, user?.id, conversationType, userReadIds]);

  useEffect(() => {
    if (conversationType !== 'club_announcement') return;
    if (!canWrite) return;

    const fetchStats = async () => {
      const stats: Record<string, { read_count: number; unread_count: number }> = {};
      for (const msg of localMessages) {
        const { data, error } = await supabase.rpc('get_message_read_stats', { p_message_id: msg.id });
        if (!error && data) {
          const row = Array.isArray(data) ? data[0] : data;
          if (row) stats[msg.id] = { read_count: row.read_count, unread_count: row.unread_count };
        }
      }
      setReadStats(stats);
    };
    fetchStats();
  }, [localMessages, conversationType, canWrite]);

  useEffect(() => {
    const channel = supabase
      .channel(uniqueChannelName(`messages:${conversationId}`))
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversation_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as any;

          // Fetch sender profile and update state asynchronously
          (async () => {
            const { data: senderData, error } = await supabase.rpc('get_sender_display_names', {
              user_ids: [newMsg.sender_id]
            });

            console.log('Realtime RPC get_sender_display_names:', {
              senderId: newMsg.sender_id,
              senderData,
              error
            });

            if (error) {
              console.error('Error fetching sender name (realtime):', error);
            }

            const sender = senderData?.[0];

            if (sender) {
              setProfileMap(prev => ({
                ...prev,
                [sender.id]: {
                  full_name: sender.full_name,
                  role: sender.role
                }
              }));
              console.log('Profile map updated (realtime):', sender);
            }

            let quoted: QuotedMessage | null = null;
            if (newMsg.reply_to_id && !localMessagesRef.current.some((m) => m.id === newMsg.reply_to_id)) {
              const { data: full, error: replyError } = await supabase
                .from('conversation_messages')
                .select(MESSAGE_SELECT)
                .eq('id', newMsg.id)
                .maybeSingle();
              if (replyError) console.error('Error fetching quoted message (realtime):', replyError);
              quoted = normalizeQuoted((full as Message | null)?.reply_to);
            }

            const messageWithSender: Message = {
              id: newMsg.id,
              sender_id: newMsg.sender_id,
              body: newMsg.body || '',
              created_at: newMsg.created_at,
              read_by: newMsg.read_by || [],
              sender: sender ? { full_name: sender.full_name, role: sender.role } : null,
              attachment_url: newMsg.attachment_url || null,
              attachment_type: newMsg.attachment_type || null,
              attachment_name: newMsg.attachment_name || null,
              deleted_at: newMsg.deleted_at || null,
              reply_to_id: newMsg.reply_to_id || null,
              reply_to: quoted,
            };

            setLocalMessages((prev) => {
              if (prev.some(m => m.id === messageWithSender.id)) {
                return prev;
              }
              return [...prev, messageWithSender];
            });

            // Show browser notification if conditions are met
            if (
              pushSupported() &&
              Notification.permission === 'granted' &&
              document.hidden &&
              newMsg.sender_id !== user?.id
            ) {
              const senderName = sender?.full_name || 'Un membre';
              const messageBody = newMsg.body?.substring(0, 60) || 'Nouvelle pièce jointe';

              // Fetch conversation with team name
              const { data: conv } = await supabase
                .from('conversations')
                .select('name, team_id, teams(name)')
                .eq('id', conversationId)
                .maybeSingle();

              const teamName = conv?.teams && !Array.isArray(conv.teams) ? (conv.teams as any).name : null;
              const conversationLabel = teamName && conv
                ? `${teamName} · ${conv.name}`
                : conversationName || conv?.name || 'Message';

              const notificationBody = `${conversationLabel} — ${messageBody}`;

              const notification = new Notification(senderName, {
                body: notificationBody,
                icon: '/logo.png',
                tag: `message-${conversationId}`,
                silent: false
              });

              notification.onclick = () => {
                window.focus();
                notification.close();
              };

              setTimeout(() => notification.close(), 5000);
            }

            if (onNewMessage) {
              onNewMessage(messageWithSender);
            }
          })();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as any;
          setLocalMessages((prev) =>
            prev.map((m) =>
              m.id === updated.id
                ? {
                    ...m,
                    body: updated.body || '',
                    deleted_at: updated.deleted_at || null,
                    read_by: updated.read_by || m.read_by,
                  }
                : m
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, onNewMessage]);

  const acceptAttachment = (file: File) => {
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    if (!isImage && !isVideo) {
      showToast('Veuillez sélectionner une image ou une vidéo', 'warning');
      return;
    }

    const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      showToast(`La taille maximale est de ${isVideo ? '50MB' : '10MB'}`, 'warning');
      return;
    }

    setSelectedFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    acceptAttachment(file);
  };

  const firstImageFile = (files: FileList | null | undefined, items?: DataTransferItemList): File | null => {
    const candidates: File[] = files ? Array.from(files) : [];
    if (candidates.length === 0 && items) {
      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          const f = item.getAsFile();
          if (f) candidates.push(f);
        }
      }
    }
    const image = candidates.find((f) => f.type.startsWith('image/'));
    if (!image) return null;
    if (image.name.includes('.')) return image;
    const ext = image.type.split('/')[1]?.split('+')[0] || 'png';
    return new File([image], `image-${Date.now()}.${ext}`, { type: image.type });
  };

  const handleComposerPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (sending) return;
    const image = firstImageFile(e.clipboardData.files, e.clipboardData.items);
    if (!image) return;
    if (!e.clipboardData.getData('text/plain')) e.preventDefault();
    acceptAttachment(image);
  };

  const hasDraggedFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

  const handleComposerDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(e) || sending) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!dragActive) setDragActive(true);
  };

  const handleComposerDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragActive(false);
  };

  const handleComposerDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    setDragActive(false);
    if (sending) return;
    const image = firstImageFile(e.dataTransfer.files);
    if (image) acceptAttachment(image);
  };

  const handleUploadAndSend = async () => {
    if (!selectedFile) return;

    setSending(true);
    setUploadProgress(50);

    try {
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${user?.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('message-attachments')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      setUploadProgress(80);

      const attachmentType = selectedFile.type.startsWith('image/') ? 'image' : 'video';

      await onSendMessage(newMessage.trim() || '', {
        url: filePath,
        type: attachmentType,
        name: selectedFile.name,
      }, replyTo?.id);

      setUploadProgress(100);
      setNewMessage('');
      setReplyTo(null);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      setSelectedFile(null);
      setUploadProgress(null);
    } catch (error) {
      console.error('Error uploading file:', error);
      showToast('Erreur lors de l\'envoi du fichier', 'error');
    } finally {
      setSending(false);
      setUploadProgress(null);
    }
  };

  const handleSend = async () => {
    if (selectedFile) {
      await handleUploadAndSend();
      return;
    }

    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      await onSendMessage(newMessage.trim(), undefined, replyTo?.id);
      setNewMessage('');
      setReplyTo(null);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } catch (error) {
      console.error('Error sending message:', error);
      showToast('Erreur lors de l\'envoi du message', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    if (e.key === 'Enter' && !e.shiftKey && !isTouch) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDeleteMessage = (messageId: string) => {
    setPendingDeleteId(messageId);
  };

  const confirmDeleteMessage = async () => {
    if (!pendingDeleteId) return;

    setDeletingMessage(true);
    const { error } = await supabase.rpc('soft_delete_message', { p_message_id: pendingDeleteId });

    if (error) {
      console.error('Error deleting message:', error);
      showToast('Erreur lors de la suppression du message', 'error');
      setDeletingMessage(false);
      return;
    }

    setLocalMessages((prev) =>
      prev.map((m) =>
        m.id === pendingDeleteId ? { ...m, deleted_at: new Date().toISOString() } : m
      )
    );
    setDeletingMessage(false);
    setPendingDeleteId(null);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays === 0) {
      return date.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Hier à ' + date.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays < 7) {
      return date.toLocaleDateString('fr-CH', { weekday: 'short' }) + ' à ' +
        date.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit' }) + ' à ' +
        date.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
    }
  };

  const getContextBadgeStyle = (type: string | undefined) => {
    if (type === 'committee' || type === 'event_committee') {
      return 'border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger-text)]';
    }
    return 'border-[var(--success)] bg-[var(--success-soft)] text-[var(--success-text)]';
  };

  const getRoleBadgeStyle = (role: string) => {
    switch (role) {
      case 'admin':
      case 'president':
      case 'vice_president':
      case 'committee':
        return 'border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger-text)]';
      case 'responsable_technique':
        return 'border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning-text)]';
      case 'coach':
        return 'border-[var(--success)] bg-[var(--success-soft)] text-[var(--success-text)]';
      case 'assistant_coach':
        return 'border-[var(--info)] bg-[var(--info-soft)] text-[var(--info-text)]';
      case 'parent':
        return 'border-[var(--pink-soft)] bg-[var(--pink-soft)] text-[var(--pink-text)]';
      case 'member':
      case 'joueur':
      case 'joueuse':
        return 'border-[var(--orange-soft)] bg-[var(--orange-soft)] text-[var(--orange-text)]';
      default:
        return 'border-[var(--border-color)] bg-[var(--bg-app)] text-[var(--text-secondary)]';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin':
      case 'president':
      case 'vice_president':
      case 'committee':
        return 'Comité';
      case 'responsable_technique':
        return 'Resp. Technique';
      case 'coach':
        return 'Entraîneur';
      case 'assistant_coach':
        return 'Adjoint';
      case 'parent':
        return 'Parent';
      case 'member':
        // For members, we'll need to check gender from the members table
        // For now, default to 'Joueur' - we can enhance this later
        return 'Joueur';
      case 'joueur':
        return 'Joueur';
      case 'joueuse':
        return 'Joueuse';
      default:
        return 'Membre';
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div ref={listRef} onScroll={handleListScroll} className="flex-1 min-h-0 overflow-y-auto p-4">
        <div ref={contentRef} className="space-y-4">
        {localMessages.length > 0 && loadingOlder && (
          <p className="text-center text-xs text-[var(--text-muted)]">Chargement des messages précédents…</p>
        )}
        {localMessages.length > 0 && !loadingOlder && !hasOlder && (
          <p className="text-center text-xs text-[var(--text-muted)]">Début de la conversation</p>
        )}
        {localMessages.length === 0 ? (
          <div className="text-center py-12 text-[var(--text-muted)]">
            <Users size={48} className="mx-auto mb-4 opacity-30" />
            <p>Aucun message pour le moment</p>
            <p className="text-sm mt-2">Soyez le premier à écrire un message</p>
          </div>
        ) : (
          localMessages.map((message) => {
            const isOwn = message.sender_id === user?.id;
            const isDeleted = !!message.deleted_at;
            const actionable = canWrite && !isDeleted;
            const quoted = getQuoted(message);
            const quotedDeleted = !quoted || !!quoted.deleted_at;
            const swipeDx = swipe?.id === message.id ? swipe.dx : 0;
            const actionButton = actionable && (
              <button
                type="button"
                onClick={(e) => openMenu(message.id, e.currentTarget)}
                className="flex-shrink-0 p-1 rounded-full opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:bg-[var(--bg-sidebar)] [@media(hover:none)]:hidden"
                style={{ color: 'var(--text-muted)' }}
                title="Actions"
                aria-label="Actions du message"
                aria-haspopup="menu"
                aria-expanded={menu?.id === message.id}
              >
                <MoreHorizontal size={16} />
              </button>
            );
            return (
              <div
                key={message.id}
                ref={(el) => {
                  if (el) messageRefs.current.set(message.id, el);
                  else messageRefs.current.delete(message.id);
                }}
                className={`flex items-center gap-1 group relative rounded-lg transition-colors duration-300 ${isOwn ? 'justify-end' : 'justify-start'}`}
                style={{ background: highlightId === message.id ? 'var(--accent-soft)' : 'transparent' }}
              >
                {isOwn && actionButton}
                <div
                  className="max-w-[70%] rounded-lg p-3 relative"
                  style={{
                    background: isOwn ? 'var(--primary)' : 'var(--bg-card)',
                    color: isOwn ? 'white' : 'var(--text-primary)',
                    transform: swipeDx ? `translateX(${swipeDx}px)` : undefined,
                    transition: swipeDx ? 'none' : 'transform 150ms ease-out',
                    touchAction: 'pan-y',
                  }}
                  onTouchStart={actionable ? (e) => handleBubbleTouchStart(e, message) : undefined}
                  onTouchMove={actionable ? handleBubbleTouchMove : undefined}
                  onTouchEnd={actionable ? (e) => handleBubbleTouchEnd(e, message) : undefined}
                  onTouchCancel={actionable ? (e) => handleBubbleTouchEnd(e, message) : undefined}
                  onContextMenu={actionable ? (e) => {
                    if (window.matchMedia('(pointer: coarse)').matches) e.preventDefault();
                  } : undefined}
                >
                  {!isOwn && (
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">
                        {profileMap[message.sender_id]?.full_name ?? 'Inconnu'}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border ${contextLabels?.[message.sender_id]
                          ? getContextBadgeStyle(conversationType)
                          : getRoleBadgeStyle(profileMap[message.sender_id]?.role ?? 'member')
                        }`}
                      >
                        {contextLabels?.[message.sender_id]
                          ? contextLabels[message.sender_id]
                          : getRoleLabel(profileMap[message.sender_id]?.role ?? 'member')}
                      </span>
                    </div>
                  )}

                  {isDeleted ? (
                    <p
                      className="italic whitespace-pre-wrap break-words"
                      style={{ opacity: 0.6 }}
                    >
                      Ce message a été supprimé
                    </p>
                  ) : (
                    <>
                      {message.reply_to_id && (
                        <button
                          type="button"
                          onClick={() => { if (quoted) jumpToMessage(quoted.id); }}
                          aria-disabled={!quoted}
                          className={`block w-full min-w-0 text-left mb-2 rounded-md px-2 py-1.5 ${quoted ? 'cursor-pointer' : 'cursor-default'}`}
                          style={{
                            borderLeft: `3px solid ${isOwn ? 'rgba(255, 255, 255, 0.85)' : 'var(--primary)'}`,
                            background: isOwn ? 'rgba(255, 255, 255, 0.18)' : 'var(--bg-app)',
                            color: 'inherit',
                          }}
                          title={quoted ? 'Voir le message d’origine' : undefined}
                        >
                          {quotedDeleted || !quoted ? (
                            <span className="block text-sm italic" style={{ opacity: 0.75 }}>Message supprimé</span>
                          ) : (
                            <>
                              <span className="block text-xs font-semibold truncate">
                                {profileMap[quoted.sender_id]?.full_name ?? 'Inconnu'}
                              </span>
                              <span className="block text-sm line-clamp-2 break-words" style={{ opacity: 0.85 }}>
                                {quotePreview(quoted)}
                              </span>
                            </>
                          )}
                        </button>
                      )}

                      {message.attachment_url && message.attachment_url in signedUrls && !signedUrls[message.attachment_url] && (
                        <p className="mb-2 text-xs italic" style={{ opacity: 0.7 }}>Pièce jointe indisponible</p>
                      )}

                      {message.attachment_url && signedUrls[message.attachment_url] && message.attachment_type === 'image' && (
                        <div className="mb-2">
                          <img
                            src={signedUrls[message.attachment_url]}
                            alt={message.attachment_name || 'Image'}
                            className="rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                            style={{ maxWidth: '300px', maxHeight: '300px', objectFit: 'cover' }}
                            onClick={() => setLightboxImage(signedUrls[message.attachment_url!])}
                          />
                        </div>
                      )}

                      {message.attachment_url && signedUrls[message.attachment_url] && message.attachment_type === 'video' && (
                        <div className="mb-2">
                          <video
                            src={signedUrls[message.attachment_url]}
                            controls
                            className="rounded-lg"
                            style={{ maxWidth: '300px' }}
                          >
                            Votre navigateur ne supporte pas la lecture de vidéos.
                          </video>
                        </div>
                      )}

                      {message.body && (
                        <p className="whitespace-pre-wrap break-words">{message.body}</p>
                      )}
                    </>
                  )}

                  <div
                    className="text-xs mt-1 flex items-center justify-between gap-2"
                    style={{ opacity: 0.7 }}
                  >
                    <span>{formatTime(message.created_at)}</span>
                    {isOwn && !isDeleted && (
                      <button
                        type="button"
                        onClick={() => handleDeleteMessage(message.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-black/10"
                        title="Supprimer ce message"
                        aria-label="Supprimer ce message"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  {conversationType === 'club_announcement' && canWrite && readStats[message.id] && (
                    <div className="text-xs mt-1" style={{ opacity: 0.6 }}>
                      Lu : {readStats[message.id].read_count} · Non lus : {readStats[message.id].unread_count}
                    </div>
                  )}
                </div>
                {!isOwn && actionButton}
                {menu?.id === message.id && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setMenu(null)} aria-hidden="true" />
                    <div
                      role="menu"
                      className={`absolute z-30 ${menu.above ? 'bottom-full mb-1' : 'top-full mt-1'} ${isOwn ? 'right-0' : 'left-0'} min-w-[160px] rounded-lg border py-1 shadow-lg`}
                      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => startReply(message)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors hover:bg-[var(--bg-sidebar)]"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <CornerUpLeft size={16} />
                        Répondre
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
        </div>
      </div>

      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0, 0, 0, 0.9)' }}
          onClick={() => setLightboxImage(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            onClick={() => setLightboxImage(null)}
          >
            <X size={24} color="white" />
          </button>
          <img
            src={lightboxImage}
            alt="Image en grand"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {canWrite && (
        <div
          className="flex-shrink-0 border-t p-2"
          style={{ borderColor: 'var(--border-color)', background: 'var(--bg-app)' }}
          onDragOver={handleComposerDragOver}
          onDragLeave={handleComposerDragLeave}
          onDrop={handleComposerDrop}
        >
          {replyTo && (
            <div
              className="flex items-center gap-2 mb-2 rounded-lg py-1.5 pl-3 pr-1"
              style={{ borderLeft: '3px solid var(--primary)', background: 'var(--bg-input)' }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                  Réponse à {profileMap[replyTo.sender_id]?.full_name ?? 'Inconnu'}
                </p>
                <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
                  {quotePreview(replyTo)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="flex-shrink-0 p-1.5 rounded-full transition-colors hover:bg-[var(--bg-sidebar)]"
                style={{ color: 'var(--text-muted)' }}
                aria-label="Annuler la réponse"
                title="Annuler la réponse"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {selectedFile && (
            <div className="flex gap-2 mb-2 overflow-x-auto">
              <div
                className="relative flex-shrink-0 rounded-lg overflow-hidden flex items-center justify-center"
                style={{ width: '64px', height: '64px', border: '1px solid var(--border-color)', background: 'var(--bg-input)' }}
                title={selectedFile.name}
              >
                {filePreviewUrl ? (
                  <img src={filePreviewUrl} alt={selectedFile.name} className="w-full h-full object-cover" />
                ) : (
                  <Film size={24} style={{ color: 'var(--text-muted)' }} />
                )}
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  disabled={sending}
                  className="absolute top-1 right-1 flex items-center justify-center rounded-full disabled:opacity-50"
                  style={{ width: '20px', height: '20px', background: 'rgba(0, 0, 0, 0.6)', color: 'white' }}
                  aria-label="Retirer la pièce jointe"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          )}

          {uploadProgress !== null && (
            <div className="w-full h-1 rounded-full overflow-hidden mb-2" style={{ background: 'var(--bg-sidebar)' }}>
              <div
                className="h-full transition-all duration-300"
                style={{ width: `${uploadProgress}%`, background: 'var(--accent)' }}
              />
            </div>
          )}

          <div className="flex gap-2 items-end">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/x-msvideo"
              onChange={handleFileSelect}
              className="hidden"
            />
            <div
              className="flex-1 min-w-0 flex items-end transition-colors"
              style={{
                minHeight: '44px',
                borderRadius: '22px',
                border: `1px solid ${composerFocused || dragActive ? 'var(--accent)' : 'var(--border-color)'}`,
                background: dragActive ? 'var(--accent-soft)' : 'var(--bg-input)',
              }}
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || !!selectedFile}
                className="flex-shrink-0 flex items-center justify-center rounded-full transition-opacity hover:opacity-70 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ width: '42px', height: '42px', color: 'var(--text-muted)' }}
                title="Ajouter une image ou vidéo"
                aria-label="Ajouter une image ou vidéo"
              >
                <Paperclip size={20} />
              </button>
              <textarea
                ref={textareaRef}
                value={newMessage}
                onChange={(e) => {
                  setNewMessage(e.target.value);
                  const ta = e.target;
                  ta.style.height = 'auto';
                  ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
                }}
                onKeyDown={handleKeyDown}
                onPaste={handleComposerPaste}
                onFocus={() => setComposerFocused(true)}
                onBlur={() => setComposerFocused(false)}
                placeholder="Message"
                rows={1}
                className="flex-1 min-w-0 bg-transparent border-0 outline-none focus:outline-none focus:ring-0"
                style={{
                  color: 'var(--text-primary)',
                  resize: 'none',
                  overflowY: 'auto',
                  padding: '10px 16px 10px 0',
                  lineHeight: '24px',
                  fontSize: '15px',
                  height: '44px',
                  maxHeight: '140px',
                  boxShadow: 'none',
                }}
                disabled={sending}
              />
            </div>
            <Button
              variant="primary"
              onClick={handleSend}
              disabled={(!newMessage.trim() && !selectedFile) || sending}
              aria-label="Envoyer"
              title="Envoyer"
              style={{ width: '44px', height: '44px', padding: 0, borderRadius: '9999px', flexShrink: 0 }}
            >
              <Send size={18} color="white" />
            </Button>
          </div>
        </div>
      )}

      {!canWrite && (
        <div className="border-t p-4 text-center" style={{ borderColor: 'var(--border-color)' }}>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            {!isParticipant
              ? 'Lecture seule — vous n’êtes pas participant de ce canal'
              : 'Vous ne pouvez pas écrire dans cette conversation'}
          </p>
        </div>
      )}
      <Toast toast={toast} />
      <ConfirmModal
        isOpen={pendingDeleteId !== null}
        title="Supprimer ce message ?"
        message="Cette action est définitive et le contenu du message ne sera plus visible."
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        confirmStyle="danger"
        loading={deletingMessage}
        loadingLabel="Suppression..."
        onConfirm={confirmDeleteMessage}
        onCancel={() => {
          if (!deletingMessage) setPendingDeleteId(null);
        }}
      />
    </div>
  );
}
