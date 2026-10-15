import { useSearchParams } from 'react-router-dom';
import { User, Bell } from 'lucide-react';
import { Tabs } from './ui/Tabs';

export type ProfileTab = 'profil' | 'notifications';

export function useProfileTab(): { tab: ProfileTab; setTab: (t: ProfileTab) => void } {
  const [params, setParams] = useSearchParams();
  const tab: ProfileTab = params.get('tab') === 'notifications' ? 'notifications' : 'profil';

  const setTab = (t: ProfileTab) => {
    const next = new URLSearchParams(params);
    if (t === 'notifications') next.set('tab', 'notifications');
    else next.delete('tab');
    setParams(next, { replace: true });
  };

  return { tab, setTab };
}

interface ProfileTabsBarProps {
  value: ProfileTab;
  onChange: (t: ProfileTab) => void;
}

export default function ProfileTabsBar({ value, onChange }: ProfileTabsBarProps) {
  return (
    <Tabs
      items={[
        { key: 'profil', label: 'Profil', icon: <User size={15} /> },
        { key: 'notifications', label: 'Notifications', icon: <Bell size={15} /> },
      ]}
      value={value}
      onChange={(k) => onChange(k as ProfileTab)}
      className="mb-5"
    />
  );
}
