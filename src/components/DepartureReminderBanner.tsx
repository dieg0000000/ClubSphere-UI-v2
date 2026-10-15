import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Alert } from './ui/Alert';
import Button from './ui/Button';

interface DepartureReminderBannerProps {
  simulateDecember?: boolean;
  onDisableTest?: () => void;
  onViewDepartures?: () => void;
}

export function DepartureReminderBanner({ simulateDecember = false, onDisableTest, onViewDepartures }: DepartureReminderBannerProps = {}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [departurePendingCount, setDeparturePendingCount] = useState(0);
  const [isDismissed, setIsDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchDeparturePendingCount();
    } else {
      setLoading(false);
    }
  }, [user]);

  const fetchDeparturePendingCount = async () => {
    const { count, error } = await supabase
      .from('members')
      .select('*', { count: 'exact', head: true })
      .eq('licence_status', 'a_declarer_partant');

    if (!error && count !== null) {
      setDeparturePendingCount(count);
    }
    setLoading(false);
  };

  const isDécembre = () => {
    const month = new Date().getMonth();
    return month === 11;
  };

  const showBanner =
    !loading &&
    (isDécembre() || simulateDecember) &&
    user?.role === 'admin' &&
    departurePendingCount > 0 &&
    !isDismissed;

  if (!showBanner) {
    return null;
  }

  return (
    <>
      <div className="mb-6">
        <Alert
          variant="warning"
          title="Déclaration des joueurs partants"
          onClose={() => setIsDismissed(true)}
          action={
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button
                variant="primary"
                size="sm"
                onClick={() => { onViewDepartures ? onViewDepartures() : navigate('/admin/declaration-partants'); }}
              >
                Voir {departurePendingCount > 1 ? 'les ' + departurePendingCount + ' joueurs' : 'le joueur'}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setIsDismissed(true)}>
                Plus tard
              </Button>
            </div>
          }
        >
          <span style={{ fontWeight: 700 }}>{departurePendingCount}</span> joueur{departurePendingCount > 1 ? 's' : ''} à déclarer partant{departurePendingCount > 1 ? 's' : ''} dans ClubCorner avant le <span style={{ fontWeight: 600 }}>31 décembre</span>. Sans cette déclaration, le club paiera à nouveau leur licence l'année prochaine.
        </Alert>
      </div>
      {simulateDecember && onDisableTest && (
        <div className="mb-4">
          <button
            onClick={onDisableTest}
            className="text-sm text-[var(--text-muted)] hover:opacity-80 underline"
          >
            Désactiver le test
          </button>
        </div>
      )}
    </>
  );
}
