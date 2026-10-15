import { useEffect, useState } from 'react';
import { Receipt, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ProfileCard } from './ProfileLayout';
import DataTableShell from './DataTableShell';

interface InvoiceRow {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  total_amount: number;
  currency: string;
  status: string;
  label: string;
}

interface Props {
  memberIds: string[];
  showMemberColumn: boolean;
  title?: string;
  profileId?: string;
}

const fmtDate = (d: string) => {
  if (!d) return '—';
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return d;
  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const year = parsed.getFullYear();
  return `${day}.${month}.${year}`;
};

const fmtAmount = (amount: number, currency: string) =>
  `${currency || 'CHF'} ${Number(amount).toFixed(2)}`;

const isOverdue = (row: InvoiceRow): boolean => {
  if (row.status === 'paid' || row.status === 'cancelled') return false;
  if (!row.due_date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(row.due_date);
  return due < today;
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  sent: 'Envoyée',
  reminder: 'Rappelée',
  reminder_2: '2e rappel',
  partial: 'Partiellement payée',
  paid: 'Payée',
  cancelled: 'Annulée',
};

const sortInvoices = (rows: InvoiceRow[]): InvoiceRow[] => {
  const rank = (r: InvoiceRow) => {
    if (isOverdue(r)) return 0;
    if (r.status === 'paid') return 2;
    return 1;
  };
  return [...rows].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return (a.due_date || '').localeCompare(b.due_date || '');
  });
};

export function MyInvoicesBlock({ memberIds, showMemberColumn, title = 'Mes factures', profileId }: Props) {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    const noChildren = memberIds.length === 0;
    const noProfile = !profileId;
    if (noChildren && noProfile) {
      setLoading(false);
      setInvoices([]);
      return;
    }

    let active = true;
    (async () => {
      const childrenPromise = memberIds.length > 0
        ? supabase
            .from('invoices')
            .select(`
              id, invoice_number, issue_date, due_date, total_amount, currency, status,
              member:members(first_name, last_name)
            `)
            .in('member_id', memberIds)
            .neq('status', 'cancelled')
        : Promise.resolve({ data: [] as any[] });

      const eventPromise = profileId
        ? supabase
            .from('invoices')
            .select(`
              id, invoice_number, issue_date, due_date, total_amount, currency, status,
              registration:event_public_registrations!inner(profile_id, event_id, event:events(title, date))
            `)
            .not('event_registration_id', 'is', null)
            .eq('registration.profile_id', profileId)
            .neq('status', 'draft')
            .neq('status', 'cancelled')
        : Promise.resolve({ data: [] as any[] });

      const [childRes, eventRes] = await Promise.all([childrenPromise, eventPromise]);

      if (!active) return;

      const childRows: InvoiceRow[] = (childRes.data || []).map((d: any) => ({
        id: d.id,
        invoice_number: d.invoice_number,
        issue_date: d.issue_date,
        due_date: d.due_date,
        total_amount: d.total_amount,
        currency: d.currency,
        status: d.status,
        label: d.member
          ? `${d.member.first_name?.charAt(0) || ''}. ${d.member.last_name || ''}`
          : '',
      }));

      const eventRows: InvoiceRow[] = (eventRes.data || []).map((d: any) => {
        const evt = d.registration?.event;
        const evtTitle = evt?.title || 'Événement';
        const evtDate = evt?.date ? fmtDate(evt.date) : '';
        return {
          id: d.id,
          invoice_number: d.invoice_number,
          issue_date: d.issue_date,
          due_date: d.due_date,
          total_amount: d.total_amount,
          currency: d.currency,
          status: d.status,
          label: evtDate ? `${evtTitle} — ${evtDate}` : evtTitle,
        };
      });

      const seen = new Set<string>();
      const merged: InvoiceRow[] = [];
      for (const row of [...childRows, ...eventRows]) {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          merged.push(row);
        }
      }

      setInvoices(sortInvoices(merged));
      setLoading(false);
    })();
    return () => { active = false; };
  }, [memberIds.join('|'), profileId]);

  const handleDownload = async (id: string) => {
    setDownloadingId(id);
    try {
      const { downloadInvoiceById } = await import('../utils/invoiceDownload');
      await downloadInvoiceById(id);
    } catch (e) {
      console.error(e);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <ProfileCard>
      <h2
        className="text-base font-semibold flex items-center gap-2 mb-4 pb-2"
        style={{
          color: 'var(--text-primary)',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <span style={{ color: 'var(--accent)' }}><Receipt size={16} /></span>
        {title}
      </h2>

      {loading ? (
        <p className="text-sm text-center py-4" style={{ color: 'var(--text-secondary)' }}>
          Chargement…
        </p>
      ) : invoices.length === 0 ? (
        <p className="text-sm text-center py-4" style={{ color: 'var(--text-secondary)' }}>
          Aucune facture à ce jour.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <DataTableShell bare maxHeight="300px">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ color: 'var(--text-secondary)', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>N°</th>
                {showMemberColumn && <th style={{ padding: '8px 10px', fontWeight: 600 }}>Objet</th>}
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Émission</th>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Échéance</th>
                <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>Montant</th>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Statut</th>
                <th style={{ padding: '8px 10px', width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const overdue = isOverdue(inv);
                const paid = inv.status === 'paid';
                const rowBg = paid ? 'var(--success-soft)' : overdue ? 'var(--danger-soft)' : 'var(--bg-input)';
                const rowColor = paid ? 'var(--success-text)' : overdue ? 'var(--danger-text)' : 'var(--text-primary)';
                const statusLabel = overdue ? 'En retard' : (STATUS_LABELS[inv.status] || inv.status);
                return (
                  <tr key={inv.id} style={{ background: rowBg, color: rowColor, borderTop: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '10px', fontWeight: 600 }}>{inv.invoice_number}</td>
                    {showMemberColumn && (
                      <td style={{ padding: '10px' }}>
                        {inv.label}
                      </td>
                    )}
                    <td style={{ padding: '10px' }}>{fmtDate(inv.issue_date)}</td>
                    <td style={{
                      padding: '10px',
                      color: overdue ? 'var(--danger)' : undefined,
                      fontWeight: overdue ? 700 : 400,
                    }}>
                      {fmtDate(inv.due_date)}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 600 }}>
                      {fmtAmount(inv.total_amount, inv.currency)}
                    </td>
                    <td style={{ padding: '10px', fontSize: '12px', fontWeight: 500 }}>
                      {statusLabel}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleDownload(inv.id)}
                        disabled={downloadingId === inv.id}
                        title="Télécharger le PDF"
                        aria-label="Télécharger le PDF"
                        style={{
                          background: 'transparent', border: 'none',
                          cursor: downloadingId === inv.id ? 'wait' : 'pointer',
                          color: rowColor, padding: 4,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Download size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </DataTableShell>
        </div>
      )}
    </ProfileCard>
  );
}
