import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useModuleAccess } from '../hooks/useModuleAccess';
import { ChartBar as BarChart3, TriangleAlert as AlertTriangle } from 'lucide-react';
import DataTableShell from '../components/DataTableShell';
import { PieChart } from '../components/PieChart';
import { DonutChart } from '../components/DonutChart';
import { BarChart } from '../components/BarChart';

interface Invoice {
  id: string;
  invoice_number: string;
  total_amount: number;
  paid_amount?: number;
  status: string;
  due_date: string;
  issue_date: string;
  paid_date?: string;
  season_id: string;
  season: {
    name: string;
  };
  member: {
    first_name: string;
    last_name: string;
  };
}

interface Season {
  id: string;
  name: string;
  active: boolean;
}

export function AdminFinancesDashboardCharts() {
  const { canView, loading: moduleLoading } = useModuleAccess('finances');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [loading, setLoading] = useState(true);

  const chartColors = {
    paid: 'var(--success-text)',
    sent: 'var(--info-text)',
    overdue: 'var(--danger)',
    partial: 'var(--warning-text)',
    draft: 'var(--text-muted)',
    cancelled: 'var(--text-muted)',
    bar: 'var(--accent)'
  };

  useEffect(() => { document.title = 'Tableau de bord finances - ClubSphere' }, [])

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const { data: invoicesData } = await supabase
      .from('invoices')
      .select(`
        id, invoice_number, total_amount, paid_amount,
        status, due_date, issue_date, paid_date,
        season_id, season:seasons(name),
        member:members(first_name, last_name)
      `);

    const { data: activeSeasonData } = await supabase
      .from('seasons')
      .select('*')
      .eq('active', true)
      .maybeSingle();

    setInvoices((invoicesData || []) as any);
    setActiveSeason(activeSeasonData);
    setLoading(false);
  };

  const today = new Date().toISOString().split('T')[0];

  const currentInvoices = invoices?.filter(
    i => i.season_id === activeSeason?.id
  ) || [];

  const stats = {
    total: currentInvoices.length,
    totalAmount: currentInvoices
      .filter(i => i.status !== 'cancelled')
      .reduce((sum, i) => sum + parseFloat(String(i.total_amount || 0)), 0),
    paidAmount: currentInvoices
      .filter(i => i.status === 'paid')
      .reduce((sum, i) => sum + parseFloat(String(i.paid_amount || i.total_amount || 0)), 0),
    openAmount: currentInvoices
      .filter(i => !['paid', 'cancelled'].includes(i.status))
      .reduce((sum, i) => sum + parseFloat(String(i.total_amount || 0)), 0),
    overdueAmount: currentInvoices
      .filter(i => !['paid', 'cancelled'].includes(i.status) && i.due_date < today)
      .reduce((sum, i) => sum + parseFloat(String(i.total_amount || 0)), 0),
    countByStatus: {
      draft: currentInvoices.filter(i => i.status === 'draft').length,
      sent: currentInvoices.filter(i => i.status === 'sent').length,
      paid: currentInvoices.filter(i => i.status === 'paid').length,
      partial: currentInvoices.filter(i => i.status === 'partial').length,
      overdue: currentInvoices.filter(i =>
        !['paid', 'cancelled'].includes(i.status) &&
        i.due_date < today).length,
      cancelled: currentInvoices.filter(i =>
        i.status === 'cancelled').length,
    }
  };

  const collectionRate = stats.totalAmount > 0
    ? Math.round(stats.paidAmount / stats.totalAmount * 100)
    : 0;

  const monthlyData = (() => {
    const months: Record<string, number> = {};
    const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

    currentInvoices
      .filter(i => i.status === 'paid' && i.paid_date)
      .forEach(i => {
        const d = new Date(i.paid_date!);
        const key = monthNames[d.getMonth()];
        months[key] = (months[key] || 0) + parseFloat(String(i.paid_amount || i.total_amount || 0));
      });

    return monthNames
      .filter(m => months[m])
      .map(m => ({ label: m, value: months[m] }));
  })();

  const statusData = [
    { name: 'Payées', value: stats.countByStatus.paid, color: chartColors.paid },
    { name: 'Envoyées', value: stats.countByStatus.sent, color: chartColors.sent },
    { name: 'En retard', value: stats.countByStatus.overdue, color: chartColors.overdue },
    { name: 'Brouillons', value: stats.countByStatus.draft, color: chartColors.draft },
    { name: 'Partielles', value: stats.countByStatus.partial, color: chartColors.partial },
  ].filter(d => d.value > 0);

  if (moduleLoading || loading) {
    return (
      <div style={{ padding: '24px 32px' }}>
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          Chargement...
        </div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: '32px', textAlign: 'center' }}>
        Accès non autorisé
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 32px' }}>
      <h1 style={{ color: 'var(--text-primary)', marginBottom: '4px', fontSize: '28px', fontWeight: '700' }}>
        <BarChart3 size={20} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '8px', color: 'var(--accent)' }} />Tableau de bord Finances
      </h1>
      <div style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
        Saison active: {activeSeason?.name || 'Aucune'}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '16px',
        marginBottom: '28px'
      }}>
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <div style={{
            color: 'var(--text-muted)',
            fontSize: '12px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '8px'
          }}>
            Total facturé
          </div>
          <div style={{ color: 'var(--text-primary)', fontWeight: '900', fontSize: '24px' }}>
            CHF {stats.totalAmount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
            {stats.total} factures
          </div>
        </div>

        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--success)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <div style={{
            color: 'var(--text-muted)',
            fontSize: '12px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '8px'
          }}>
            Encaissé
          </div>
          <div style={{ color: 'var(--success-text)', fontWeight: '900', fontSize: '24px' }}>
            CHF {stats.paidAmount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
            {stats.countByStatus.paid} factures payées
          </div>
        </div>

        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--warning)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <div style={{
            color: 'var(--text-muted)',
            fontSize: '12px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '8px'
          }}>
            Ouvert
          </div>
          <div style={{ color: 'var(--warning-text)', fontWeight: '900', fontSize: '24px' }}>
            CHF {stats.openAmount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
            {stats.countByStatus.sent + stats.countByStatus.draft} factures
          </div>
        </div>

        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--danger)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <div style={{
            color: 'var(--text-muted)',
            fontSize: '12px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '8px'
          }}>
            En retard
          </div>
          <div style={{ color: 'var(--danger)', fontWeight: '900', fontSize: '24px' }}>
            CHF {stats.overdueAmount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
            {stats.countByStatus.overdue} factures en retard
          </div>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: '20px',
        marginBottom: '28px'
      }}>
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: '14px', marginBottom: '16px', fontWeight: '600' }}>
            Répartition par statut
          </h3>
          <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {statusData.length > 0 ? (
              <PieChart
                data={statusData}
                innerRadius={50}
                outerRadius={70}
                width={300}
                height={240}
                showLegend={true}
              />
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center' }}>
                Aucune donnée
              </div>
            )}
          </div>
        </div>

        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <h3 style={{
            color: 'var(--text-primary)',
            fontSize: '14px',
            marginBottom: '16px',
            fontWeight: '600',
            alignSelf: 'flex-start'
          }}>
            Taux de recouvrement
          </h3>
          <div style={{ position: 'relative', width: 180, height: 180 }}>
            <DonutChart
              percentage={collectionRate}
              size={180}
              strokeWidth={20}
            />
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              pointerEvents: 'none'
            }}>
              <div style={{
                color: 'var(--text-primary)',
                fontWeight: '900',
                fontSize: '28px',
                lineHeight: 1
              }}>
                {collectionRate}%
              </div>
              <div style={{
                color: 'var(--text-muted)',
                fontSize: '11px',
                marginTop: '4px'
              }}>
                encaissé
              </div>
            </div>
          </div>
        </div>

        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: '14px', marginBottom: '16px', fontWeight: '600' }}>
            Encaissements par mois
          </h3>
          <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {monthlyData.length > 0 ? (
              <BarChart
                data={monthlyData}
                width={340}
                height={200}
                color={chartColors.bar}
                formatValue={(v) => v.toFixed(2)}
              />
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center' }}>
                Aucune donnée
              </div>
            )}
          </div>
        </div>
      </div>

      {stats.countByStatus.overdue > 0 && (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--danger)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <h3 style={{ color: 'var(--danger)', fontSize: '14px', marginBottom: '16px', fontWeight: '700' }}>
            <AlertTriangle size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Factures en retard
          </h3>
          <DataTableShell bare maxHeight="300px">
          <table style={{
            width: '100%',
            borderCollapse: 'collapse'
          }}>
            <thead>
              <tr>
                {['N° Facture', 'Joueur', 'Échéance', 'Jours retard', 'Montant'].map(h => (
                  <th key={h} style={{
                    padding: '8px 12px',
                    color: 'var(--text-muted)',
                    fontSize: '11px',
                    textAlign: 'left',
                    textTransform: 'uppercase',
                    borderBottom: '1px solid var(--border-color)'
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {currentInvoices
                .filter(i =>
                  !['paid', 'cancelled'].includes(i.status) &&
                  i.due_date < today
                )
                .sort((a, b) => a.due_date.localeCompare(b.due_date))
                .slice(0, 10)
                .map(inv => {
                  const daysLate = Math.floor(
                    (new Date().getTime() - new Date(inv.due_date).getTime()) /
                    (1000 * 60 * 60 * 24)
                  );
                  return (
                    <tr key={inv.id} style={{
                      borderBottom: '1px solid var(--border-color)'
                    }}>
                      <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontWeight: '700', fontSize: '13px' }}>
                        {inv.invoice_number}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontSize: '14px' }}>
                        {inv.member?.first_name} {inv.member?.last_name}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--danger)', fontSize: '13px' }}>
                        {new Date(inv.due_date).toLocaleDateString('fr-CH')}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          background: 'var(--danger-soft)',
                          color: 'var(--danger)',
                          borderRadius: '99px',
                          padding: '2px 10px',
                          fontSize: '12px',
                          fontWeight: '700'
                        }}>
                          {daysLate}j
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontWeight: '700' }}>
                        CHF {parseFloat(String(inv.total_amount)).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          </DataTableShell>
        </div>
      )}
    </div>
  );
}
