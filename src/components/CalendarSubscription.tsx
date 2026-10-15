import { useState, useEffect } from 'react';
import { Calendar, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { ConfirmModal } from './ConfirmModal';
import CopyIconButton from './CopyIconButton';
import Button from './ui/Button';

const FEED_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar-feed`;

export function CalendarSubscription() {
  const { user } = useAuth();
  const { clubId } = useTenant();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showRegen, setShowRegen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const feedUrl = token ? `${FEED_BASE}?token=${token}` : '';

  const fetchToken = async () => {
    if (!user?.id || !clubId) return;
    const { data } = await supabase
      .from('calendar_feed_tokens')
      .select('token')
      .eq('user_id', user.id)
      .eq('club_id', clubId)
      .maybeSingle();
    if (data?.token) setToken(data.token);
  };

  useEffect(() => {
    fetchToken();
  }, [user?.id, clubId]);

  const handleSubscribe = async () => {
    if (!user?.id || !clubId) return;
    setLoading(true);
    try {
      const { data: existing } = await supabase
        .from('calendar_feed_tokens')
        .select('token')
        .eq('user_id', user.id)
        .eq('club_id', clubId)
        .maybeSingle();

      if (existing?.token) {
        setToken(existing.token);
        return;
      }

      await supabase
        .from('calendar_feed_tokens')
        .insert({ user_id: user.id, club_id: clubId });

      const { data: row } = await supabase
        .from('calendar_feed_tokens')
        .select('token')
        .eq('user_id', user.id)
        .eq('club_id', clubId)
        .maybeSingle();

      if (row?.token) setToken(row.token);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (!user?.id || !clubId) return;
    setRegenerating(true);
    try {
      await supabase
        .from('calendar_feed_tokens')
        .delete()
        .eq('user_id', user.id)
        .eq('club_id', clubId);

      await supabase
        .from('calendar_feed_tokens')
        .insert({ user_id: user.id, club_id: clubId });

      const { data: row } = await supabase
        .from('calendar_feed_tokens')
        .select('token')
        .eq('user_id', user.id)
        .eq('club_id', clubId)
        .maybeSingle();

      if (row?.token) setToken(row.token);
    } finally {
      setRegenerating(false);
      setShowRegen(false);
    }
  };

  return (
    <div className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
      <div className="px-6 py-4 flex items-center gap-3">
        <Calendar className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Calendrier personnel</span>
      </div>

      <div className="px-6 pb-6" style={{ borderTop: '1px solid var(--border-color)' }}>
        {!token ? (
          <div className="pt-4">
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Abonnez-vous à votre calendrier pour synchroniser automatiquement vos matchs, entraînements et événements avec Google Calendar ou Apple Calendar.
            </p>
            <Button onClick={handleSubscribe} loading={loading}>
              S'abonner au calendrier
            </Button>
          </div>
        ) : (
          <div className="pt-4 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href={feedUrl.replace(/^https?:\/\//, 'webcal://')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '40px',
                  padding: '10px 18px',
                  fontSize: '14px',
                  borderRadius: '10px',
                  background: 'var(--grad)',
                  color: 'var(--text-inverse)',
                  fontWeight: 600,
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  transition: 'transform 0.15s ease, filter 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.filter = 'brightness(1.08)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.filter = ''; }}
              >
                Ajouter à Apple Calendar
              </a>
              <a
                href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feedUrl.replace(/^https?:\/\//, 'webcal://'))}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '40px',
                  padding: '10px 18px',
                  fontSize: '14px',
                  borderRadius: '10px',
                  background: 'var(--bg-app)',
                  color: 'var(--text-primary)',
                  fontWeight: 500,
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  border: '1px solid var(--border-color)',
                  flex: 1,
                  transition: 'border-color 0.15s ease, background 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.background = 'var(--bg-app)'; }}
              >
                Ajouter à Google Calendar
              </a>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Autres agendas (Outlook, etc.) : copiez ce lien
              </label>
              <div
                className="flex items-center gap-2 rounded-md"
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  padding: '6px 10px',
                }}
              >
                <span
                  className="text-xs flex-1 break-all"
                  style={{ color: 'var(--text-primary)', fontFamily: 'monospace', lineHeight: 1.4 }}
                >
                  {feedUrl}
                </span>
                <CopyIconButton value={feedUrl} label="le lien du calendrier" size={14} />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowRegen(true)}
              className="inline-flex items-center gap-1.5 text-xs"
              style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
            >
              <RefreshCw size={12} />
              Régénérer le lien
            </button>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={showRegen}
        title="Régénérer le lien"
        message="L'ancien lien ne fonctionnera plus. Continuer ?"
        confirmLabel="Régénérer"
        cancelLabel="Annuler"
        confirmStyle="warning"
        loading={regenerating}
        onConfirm={handleRegenerate}
        onCancel={() => setShowRegen(false)}
      />
    </div>
  );
}
