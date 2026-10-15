import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Download, Check } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';

interface DepartingMember {
  id: string;
  first_name: string;
  last_name: string;
  departure_date: string | null;
  departure_note: string | null;
  teams?: { name: string } | null;
}

export default function AdminDeclarationPartants() {
  const [members, setMembers] = useState<DepartingMember[]>([]);
  const [loading, setLoading] = useState(true);

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    confirmLabel: string;
    cancelLabel: string;
    confirmStyle: 'danger' | 'warning' | 'primary';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Confirmer',
    cancelLabel: 'Annuler',
    confirmStyle: 'danger',
    onConfirm: () => {}
  });

  const showConfirm = (config: Partial<typeof confirmState>) => {
    setConfirmState(prev => ({ ...prev, ...config, isOpen: true }));
  };

  const hideConfirm = () => {
    setConfirmState(prev => ({ ...prev, isOpen: false }));
  };

  useEffect(() => { document.title = 'Déclaration partants - ClubSphere' }, [])

  useEffect(() => {
    fetchDepartingMembers();
  }, []);

  const fetchDepartingMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('members')
        .select('id, first_name, last_name, departure_date, departure_note, teams(name)')
        .eq('licence_status', 'a_declarer_partant')
        .order('last_name');

      if (error) {
        console.error('Error fetching departing members:', error);
      } else if (data) {
        setMembers(data as unknown as DepartingMember[]);
      }
    } catch (err) {
      console.error('Unexpected error fetching departing members:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsDeclared = async (memberId: string) => {
    const { error } = await supabase
      .from('members')
      .update({ licence_status: 'declare_partant' })
      .eq('id', memberId);

    if (!error) {
      fetchDepartingMembers();
    }
  };

  const exportToCSV = () => {
    const headers = ['Nom', 'Prénom', 'Équipe', 'Date départ', 'Raison'];
    const rows = members.map(m => [
      m.last_name,
      m.first_name,
      m.teams?.name || '',
      m.departure_date ? new Date(m.departure_date).toLocaleDateString('fr-FR') : '',
      m.departure_note || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `declaration-partants-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  if (loading) {
    return <div className="p-8" style={{ color: 'var(--text-primary)' }}>Chargement...</div>;
  }

  return (
    <div className="p-4 lg:p-8 w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Déclaration partants</h1>
          <div
            className="px-4 py-2 rounded-lg inline-block"
            style={{
              background: 'var(--warning-soft)',
              border: '1px solid var(--warning)',
              color: 'var(--warning-text)',
            }}
          >
            <p className="text-sm" style={{ color: 'var(--warning-text)' }}>
              Période de déclaration: 1 - 31 décembre
            </p>
          </div>
        </div>
        {members.length > 0 && (
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors" style={{ background: 'var(--success)', color: 'var(--text-inverse)' }}
          >
            <Download size={20} />
            Exporter CSV
          </button>
        )}
      </div>

      {members.length === 0 ? (
        <div className="rounded-lg p-8 text-center" style={{ background: 'var(--bg-card)' }}>
          <p style={{ color: 'var(--text-muted)' }}>Aucun joueur à déclarer partant</p>
        </div>
      ) : (
        <div className="rounded-lg shadow-xl overflow-hidden" style={{ background: 'var(--bg-card)' }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead style={{ background: 'var(--table-header-bg)' }}>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Nom
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Prénom
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Équipe
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Date départ
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Raison
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                {members.map((member) => (
                  <tr key={member.id} className="hover:bg-[var(--bg-hover)]">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {member.last_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: 'var(--text-primary)' }}>
                      {member.first_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {member.teams?.name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {member.departure_date
                        ? new Date(member.departure_date).toLocaleDateString('fr-FR')
                        : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm max-w-md" style={{ color: 'var(--text-secondary)' }}>
                      <div className="truncate" title={member.departure_note || ''}>
                        {member.departure_note || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => {
                          showConfirm({
                            title: 'Marquer comme déclaré',
                            message: 'Marquer ce joueur comme déclaré dans ClubCorner ? Son statut passera à « Déclaré partant ». L\'archivage se fait séparément depuis sa fiche.',
                            confirmLabel: 'Oui, marquer',
                            cancelLabel: 'Non',
                            confirmStyle: 'primary',
                            onConfirm: () => {
                              hideConfirm();
                              handleMarkAsDeclared(member.id);
                            }
                          });
                        }}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded transition-colors" style={{ background: 'var(--success)', color: 'var(--text-inverse)' }}
                      >
                        <Check size={16} />
                        Marquer comme déclaré
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-6 p-4 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Information</h3>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Les joueurs avec le statut « À déclarer partant » doivent être déclarés auprès de l'ACVF (via ClubCorner) entre le 1er et le 31 décembre. Une fois la déclaration effectuée dans ClubCorner, utilisez le bouton « Marquer comme déclaré » : le joueur passe au statut « Déclaré partant ». L'archivage du joueur se fait ensuite séparément depuis sa fiche.
        </p>
      </div>

      <ConfirmModal
        {...confirmState}
        onCancel={hideConfirm}
      />
    </div>
  );
}
