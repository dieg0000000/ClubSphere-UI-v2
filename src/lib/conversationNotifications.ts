import { supabase } from './supabase';

export interface ConversationNotificationSetting {
  conversation_id: string;
  type: string;
  name: string | null;
  team_id: string | null;
  team_name: string | null;
  team_category: string | null;
  role: string | null;
  can_write: boolean;
  enabled: boolean;
  lockable: boolean;
}

export async function fetchConversationNotificationSettings(): Promise<ConversationNotificationSetting[] | null> {
  const { data, error } = await supabase.rpc('get_my_conversation_notification_settings');
  if (error) {
    console.error('get_my_conversation_notification_settings failed:', error.message);
    return null;
  }
  if (!Array.isArray(data)) return [];
  return data.filter(
    (row): row is ConversationNotificationSetting =>
      !!row && typeof row.conversation_id === 'string' && typeof row.enabled === 'boolean'
  );
}

export async function setConversationNotifications(conversationId: string, enabled: boolean): Promise<boolean> {
  const { error } = await supabase.rpc('set_conversation_notifications', {
    p_conversation: conversationId,
    p_enabled: enabled,
  });
  if (error) {
    console.error('set_conversation_notifications failed:', error.code, error.message);
    return false;
  }
  return true;
}

export function conversationSettingLabel(setting: Pick<ConversationNotificationSetting, 'type' | 'name' | 'team_name'>): string {
  if (setting.type === 'team_full' && setting.team_name) return setting.team_name;
  if (setting.name) return setting.name;
  switch (setting.type) {
    case 'club_announcement': return 'Annonce Club';
    case 'committee': return 'Comité';
    case 'all_coaches': return 'Tous les entraîneurs';
    default: return setting.team_name || 'Conversation';
  }
}
