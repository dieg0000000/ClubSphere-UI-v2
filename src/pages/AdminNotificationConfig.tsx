import { useState, useEffect } from 'react';
import { Bell, Plus, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useModuleAccess } from '../hooks/useModuleAccess';
import Button from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

interface NotificationConfig {
  id: string;
  notification_type: string;
  enabled: boolean;
  description: string;
  reminder_days: number;
  reminder_days_array: number[] | null;
}

const REMINDER_TYPES = ['match_reminder', 'training_reminder', 'event_reminder'];

const MAX_DAY = 30;
const MIN_DAY = 1;

export default function AdminNotificationConfig() {
  const { canEdit, loading: accessLoading } = useModuleAccess('notifications');
  const [configs, setConfigs] = useState<NotificationConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState<Record<string, string>>({});
  const [confrerieLabel, setConfrerieLabel] = useState('Confrérie');

  useEffect(() => { document.title = 'Notifications - ClubSphere' }, [])

  useEffect(() => {
    loadConfigs();
    supabase.from('club_settings').select('confrerie_label').limit(1).single().then(({ data }) => {
      if (data?.confrerie_label) setConfrerieLabel(data.confrerie_label);
    });
  }, []);

  const loadConfigs = async () => {
    const { data } = await supabase
      .from('club_notification_config')
      .select('*')
      .order('notification_type');

    if (data) setConfigs(data as NotificationConfig[]);
    setLoading(false);
  };

  const toggleEnabled = async (config: NotificationConfig) => {
    if (!canEdit) return;
    setSaving(config.id);

    const { error } = await supabase
      .from('club_notification_config')
      .update({ enabled: !config.enabled })
      .eq('id', config.id);

    if (!error) {
      setConfigs(prev =>
        prev.map(c => c.id === config.id ? { ...c, enabled: !c.enabled } : c)
      );
    }
    setSaving(null);
  };

  const persistDays = async (config: NotificationConfig, days: number[]) => {
    if (!canEdit) return;
    setSaving(config.id);
    const sorted = [...new Set(days)].sort((a, b) => a - b);
    const { error } = await supabase
      .from('club_notification_config')
      .update({ reminder_days_array: sorted })
      .eq('id', config.id);

    if (!error) {
      setConfigs(prev =>
        prev.map(c => c.id === config.id ? { ...c, reminder_days_array: sorted } : c)
      );
    }
    setSaving(null);
  };

  const addDay = async (config: NotificationConfig, raw: string) => {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n) || n < MIN_DAY || n > MAX_DAY) return;
    const current = config.reminder_days_array || [];
    if (current.includes(n)) return;
    await persistDays(config, [...current, n]);
    setDraftValue(prev => ({ ...prev, [config.id]: '' }));
  };

  const removeDay = async (config: NotificationConfig, day: number) => {
    const current = config.reminder_days_array || [];
    await persistDays(config, current.filter(d => d !== day));
  };

  if (loading || accessLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{ borderColor: 'var(--accent)' }}></div>
          <p style={{ color: 'var(--text-secondary)' }}>Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
            <Bell size={22} />
            Notifications
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Configuration des alertes club
          </p>
        </div>
      </div>

      {!canEdit && (
        <div className="rounded-lg px-4 py-3 text-sm mb-6" style={{ background: 'var(--warning-soft)', border: '1px solid var(--warning)', color: 'var(--warning-text)' }}>
          Vous n'avez pas les droits pour modifier la configuration des notifications
        </div>
      )}

      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: 'var(--bg-card)',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: 'var(--border-color)',
        }}
      >
        <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            Types de notifications
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Activez ou désactivez chaque type de notification pour l'ensemble du club
          </p>
        </div>

        <div className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
          {configs.length === 0 ? (
            <div className="px-6 py-12 text-center" style={{ color: 'var(--text-secondary)' }}>
              <Bell size={48} className="mx-auto mb-4 opacity-30" />
              <p>Aucune configuration trouvée</p>
            </div>
          ) : (
            configs.map((config) => {
              const isReminderType = REMINDER_TYPES.includes(config.notification_type);
              const days = config.reminder_days_array || [];
              const draft = draftValue[config.id] || '';

              return (
                <div
                  key={config.id}
                  className="flex items-start justify-between px-6 py-4 gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                      {(config.description || config.notification_type).replace(/Confrérie/gi, confrerieLabel)}
                    </p>

                    {isReminderType && config.enabled && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          Envoyer des rappels :
                        </span>
                        {days.length === 0 && (
                          <span className="text-xs italic" style={{ color: 'var(--text-secondary)' }}>
                            Aucun rappel configuré
                          </span>
                        )}
                        {days.map((d) => (
                          <Badge key={d} variant="blue">
                            J-{d}
                            {canEdit && (
                              <button
                                onClick={() => removeDay(config, d)}
                                disabled={saving === config.id}
                                className="hover:opacity-70 transition-opacity"
                                aria-label={`Retirer J-${d}`}
                                style={{ display: 'inline-flex', alignItems: 'center' }}
                              >
                                <X size={12} />
                              </button>
                            )}
                          </Badge>
                        ))}

                        {canEdit && (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={MIN_DAY}
                              max={MAX_DAY}
                              value={draft}
                              onChange={(e) => setDraftValue(prev => ({ ...prev, [config.id]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  addDay(config, draft);
                                }
                              }}
                              placeholder="J-?"
                              className="focus:outline-none"
                              style={{
                                background: 'var(--bg-input)',
                                border: '1px solid var(--border-color)',
                                color: 'var(--text-primary)',
                                padding: '6px 12px',
                                borderRadius: '8px',
                                fontSize: '13px',
                                width: '64px',
                              }}
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => addDay(config, draft)}
                              disabled={saving === config.id || !draft}
                              leftIcon={<Plus size={12} />}
                            >
                              Ajouter
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                    <div
                      onClick={() => toggleEnabled(config)}
                      style={{
                        width: '48px',
                        height: '26px',
                        background: config.enabled ? 'var(--success)' : 'var(--border-color)',
                        borderRadius: '99px',
                        cursor: canEdit && saving !== config.id ? 'pointer' : 'not-allowed',
                        opacity: canEdit ? 1 : 0.5,
                        position: 'relative',
                        transition: 'background 0.2s',
                        flexShrink: 0,
                      }}
                    >
                      <div style={{
                        position: 'absolute',
                        top: '3px',
                        left: config.enabled ? '25px' : '3px',
                        width: '20px',
                        height: '20px',
                        background: 'var(--text-inverse)',
                        borderRadius: '50%',
                        transition: 'left 0.2s',
                        boxShadow: 'var(--shadow-sm)'
                      }} />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
