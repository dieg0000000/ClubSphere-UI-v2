import { useState, useEffect, useCallback, useMemo } from 'react';
import { Users, Search, FileText, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import DataTableShell from '../components/DataTableShell';
import { SortableHeader } from '../components/SortableHeader';

interface ConfrerieMember {
  id: string;
  club_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  member_since: string | null;
  billing_mode: string;
  active: boolean;
  notes: string | null;
  company: string | null;
  sponsor_id: string | null;
  salutation: string | null;
  annual_amount: number | null;
  category: 'member' | 'supporter';
}

interface FinanceConfig {
  confrerie_compte: string | null;
  confrerie_amount: number;
  payment_delay_days: number;
  auto_send_invoices: boolean;
  invoice_number_prefix: string | null;
  qr_iban: string;
  bank_name: string;
  bank_street: string | null;
  bank_street_number: string | null;
  bank_postal_code: string | null;
  bank_city: string | null;
  contact_name: string | null;
  contact_phone: string | null;
}

export function ConfrerieBillingPanel(props: { canEdit?: boolean; showToast?: (msg: string, type: 'success' | 'error') => void }) {
  return <AdminFinancesConfrerie canEdit={props.canEdit} showToast={props.showToast} />;
}

export default function AdminFinancesConfrerie({ canEdit, showToast }: { canEdit?: boolean; showToast?: (msg: string, type: 'success' | 'error') => void } = {}) {
  const [members, setMembers] = useState<ConfrerieMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [clubId, setClubId] = useState('');
  const [confrerieLabel, setConfrerieLabel] = useState('Confrérie');
  const [confrerieCompte, setConfrerieCompte] = useState<string | null>(null);
  const [financeConfig, setFinanceConfig] = useState<FinanceConfig | null>(null);
  const [sponsors, setSponsors] = useState<{id: string; company_name: string}[]>([]);
  const [showPackageOnly, setShowPackageOnly] = useState(false);

  const [activeSeason, setActiveSeason] = useState<{ id: string; name: string; invoice_prefix: string; invoice_next_number: number } | null>(null);
  const [alreadyInvoicedIds, setAlreadyInvoicedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ sent: number; total: number } | null>(null);
  const [sortField, setSortField] = useState<string>('last_name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const toast = (msg: string, type: 'success' | 'error') => {
    if (showToast) showToast(msg, type);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: settings } = await supabase
      .from('club_settings')
      .select('id, club_id, confrerie_label')
      .limit(1)
      .single();

    if (settings) {
      setClubId(settings.club_id);
      if (settings.confrerie_label) setConfrerieLabel(settings.confrerie_label);
    }

    const { data: finConf } = await supabase
      .from('finance_config')
      .select('*')
      .limit(1)
      .maybeSingle();
    if (finConf) {
      setConfrerieCompte(finConf.confrerie_compte || null);
      setFinanceConfig(finConf as FinanceConfig);
    }

    const { data: seasonData } = await supabase
      .from('seasons')
      .select('id, name, invoice_prefix, invoice_next_number')
      .eq('active', true)
      .maybeSingle();
    if (seasonData) setActiveSeason(seasonData);

    const [{ data }, { data: sponsorData }] = await Promise.all([
      supabase.from('confrerie_members').select('*').eq('active', true).order('last_name'),
      supabase.from('sponsors').select('id, company_name').eq('active', true).order('company_name'),
    ]);

    if (data) setMembers(data as ConfrerieMember[]);
    if (sponsorData) setSponsors(sponsorData);

    if (seasonData && data) {
      const { data: existing } = await supabase
        .from('invoices')
        .select('confrerie_member_id')
        .eq('invoice_type', 'confrerie')
        .eq('season_id', seasonData.id)
        .neq('status', 'cancelled');
      setAlreadyInvoicedIds(new Set((existing || []).map(e => e.confrerie_member_id)));
    }

    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const billableMembers = members.filter(m => m.billing_mode !== 'package');
  const packageMembers = members.filter(m => m.billing_mode === 'package');
  const selectableMembers = billableMembers.filter(m => !alreadyInvoicedIds.has(m.id));

  const handleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const formatDateCH = (dateStr: string | null): string => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  };

  const filtered = useMemo(() => {
    const base = (showPackageOnly ? packageMembers : members).filter(m => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        m.last_name.toLowerCase().includes(q) ||
        m.first_name.toLowerCase().includes(q) ||
        (m.email || '').toLowerCase().includes(q) ||
        (m.company || '').toLowerCase().includes(q)
      );
    });
    return [...base].sort((a, b) => {
      const av = (a as any)[sortField] || '';
      const bv = (b as any)[sortField] || '';
      const cmp = String(av).localeCompare(String(bv), 'fr', { sensitivity: 'base' });
      if (cmp !== 0) return sortDir === 'asc' ? cmp : -cmp;
      const cmp2 = (a.first_name || '').localeCompare(b.first_name || '', 'fr', { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp2 : -cmp2;
    });
  }, [members, packageMembers, showPackageOnly, search, sortField, sortDir]);

  const getSponsorName = (id: string | null) => {
    if (!id) return '';
    return sponsors.find(s => s.id === id)?.company_name || '';
  };

  const billingPillStyle = (mode: string) => {
    if (mode === 'package') return { background: 'var(--warning-soft, #fffbeb)', color: 'var(--warning-text, #92400e)' };
    return { background: 'var(--bg-hover)', color: 'var(--text-secondary)' };
  };

  const billingLabel = (mode: string) => {
    if (mode === 'package') return 'Package';
    if (mode === 'print') return 'Courrier';
    return 'E-mail';
  };

  const toggleAll = () => {
    if (selectedIds.size === selectableMembers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableMembers.map(m => m.id)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const generateRFReference = (invoiceNumber: number): string => {
    const ref = String(invoiceNumber).padStart(21, '0');
    const checkString = ref + '271500';
    let remainder = 0;
    for (const char of checkString) {
      remainder = (remainder * 10 + parseInt(char)) % 97;
    }
    return 'RF' + String(98 - remainder).padStart(2, '0') + ref;
  };

  const generateInvoices = async () => {
    if (!activeSeason || !financeConfig || selectedIds.size === 0) return;
    setIsGenerating(true);
    try {

    const toGenerate = selectableMembers.filter(m => selectedIds.has(m.id));
    const clubAmount = financeConfig.confrerie_amount || 500;
    const autoSend = financeConfig.auto_send_invoices === true;
    const customPrefix = financeConfig.invoice_number_prefix || null;

    let successCount = 0;
    let errorCount = 0;
    const createdInvoiceIds: string[] = [];

    for (const member of toGenerate) {
      const { data: season } = await supabase
        .from('seasons')
        .select('invoice_next_number, invoice_prefix')
        .eq('id', activeSeason.id)
        .maybeSingle();

      if (!season) { errorCount++; continue; }

      const prefix = customPrefix || season.invoice_prefix;
      const invoiceNumber = `${prefix}-${String(season.invoice_next_number).padStart(4, '0')}`;
      const qrReference = generateRFReference(season.invoice_next_number);

      const issueDate = new Date();
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (financeConfig.payment_delay_days || 30));

      const effectiveAmount = member.annual_amount ?? clubAmount;
      const { data: insertedInvoice, error } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invoiceNumber,
          season_id: activeSeason.id,
          club_id: clubId,
          invoice_type: 'confrerie',
          confrerie_member_id: member.id,
          base_amount: effectiveAmount,
          total_amount: effectiveAmount,
          qr_reference: qrReference,
          status: 'draft',
          issue_date: issueDate.toISOString().split('T')[0],
          due_date: dueDate.toISOString().split('T')[0],
        })
        .select()
        .single();

      if (!error && insertedInvoice) {
        await supabase
          .from('seasons')
          .update({ invoice_next_number: season.invoice_next_number + 1 })
          .eq('id', activeSeason.id);

        if (autoSend) createdInvoiceIds.push(insertedInvoice.id);
        successCount++;
      } else {
        errorCount++;
      }
    }

    if (autoSend && createdInvoiceIds.length > 0) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Session expirée');

        const { data: club } = await supabase.from('club_settings').select('*').maybeSingle();
        const { data: finance } = await supabase.from('finance_config').select('*').maybeSingle();

        const { data: invoicesToSend } = await supabase
          .from('invoices')
          .select(`*, confrerie_member:confrerie_members(first_name, last_name, email, address, postal_code, city, salutation, company, category), season:seasons(id, name)`)
          .in('id', [...new Set(createdInvoiceIds)]);

        if (!invoicesToSend || invoicesToSend.length === 0) throw new Error('Impossible de charger les factures créées');

        const { generateInvoicePDF } = await import('../utils/generateInvoicePDF');
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invoice`;
        let sent = 0;
        const errors: string[] = [];
        const total = invoicesToSend.length;
        setSendProgress({ sent: 0, total });

        for (let i = 0; i < total; i++) {
          const invoice = invoicesToSend[i] as any;
          try {
            const cm = invoice.confrerie_member;
            const pdfBase64 = await generateInvoicePDF({
              invoice_number: invoice.invoice_number,
              issue_date: invoice.issue_date,
              due_date: invoice.due_date,
              qr_reference: invoice.qr_reference,
              notes: invoice.notes,
              member_first_name: '',
              member_last_name: '',
              member_address: '',
              member_postal_code: '',
              member_city: '',
              category_name: '',
              base_amount: invoice.base_amount,
              fratrie_discount_pct: 0,
              fratrie_discount_amount: 0,
              reminder_fee: 0,
              total_amount: invoice.total_amount,
              currency: invoice.currency || 'CHF',
              season_name: invoice.season?.name || '',
              club_name: club?.club_name || '',
              club_address: club?.club_address || '',
              club_street_number: club?.club_street_number,
              club_postal_code: club?.club_postal_code || '',
              club_city: club?.club_city || '',
              club_email: finance?.email_sender?.trim() || club?.club_email || '',
              club_phone: club?.club_phone,
              club_website: club?.club_website,
              logo_url: club?.logo_url,
              qr_iban: finance?.qr_iban || '',
              bank_name: finance?.bank_name || '',
              bank_street: finance?.bank_street,
              bank_street_number: finance?.bank_street_number,
              bank_postal_code: finance?.bank_postal_code,
              bank_city: finance?.bank_city,
              contact_name: finance?.contact_name,
              contact_phone: finance?.contact_phone,
              payment_delay_days: finance?.payment_delay_days || 30,
              is_confrerie: true,
              confrerie_label: confrerieLabel,
              confrerie_member_first_name: cm?.first_name,
              confrerie_member_last_name: cm?.last_name,
              confrerie_member_address: cm?.address,
              confrerie_member_postal_code: cm?.postal_code,
              confrerie_member_city: cm?.city,
              confrerie_member_salutation: cm?.salutation,
              confrerie_member_company: cm?.company,
              confrerie_is_supporter: cm?.category === 'supporter',
            }, true) as string;

            const response = await fetch(apiUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                invoice_id: invoice.id,
                pdf_base64: pdfBase64,
                filename: `Facture_${invoice.invoice_number}.pdf`,
              }),
            });

            if (!response.ok) {
              const result = await response.json().catch(() => ({}));
              throw new Error(result.error || `Erreur ${response.status}`);
            }
            sent++;
          } catch (err: any) {
            errors.push(`${invoice.invoice_number}: ${err.message}`);
          }
          setSendProgress({ sent, total });
          if (i < total - 1) await new Promise(r => setTimeout(r, 400));
        }

        if (errors.length > 0) {
          toast(sent > 0 ? `${sent} facture${sent > 1 ? 's' : ''} envoyée${sent > 1 ? 's' : ''}, ${errors.length} en erreur` : `Échec de l'envoi (${errors.length} erreur${errors.length > 1 ? 's' : ''})`, 'error');
        } else {
          toast(`${sent} facture${sent > 1 ? 's' : ''} envoyée${sent > 1 ? 's' : ''}`, 'success');
        }
      } catch (err: any) {
        toast(err.message || "Erreur lors de l'envoi groupé", 'error');
      } finally {
        setSendProgress(null);
      }
    } else if (!autoSend) {
      if (errorCount === 0) {
        toast(`${successCount} facture${successCount > 1 ? 's' : ''} générée${successCount > 1 ? 's' : ''} en brouillon.`, 'success');
      } else {
        toast(`${errorCount} erreur(s) sur ${toGenerate.length}`, 'error');
      }
    }

    setSelectedIds(new Set());
    loadData();
    } finally {
      setIsGenerating(false);
    }
  };

  const confrerieAmount = financeConfig?.confrerie_amount ?? 500;
  const canGenerate = !!confrerieCompte && !!activeSeason && !!canEdit;

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ background: 'var(--bg-table-header)', padding: '16px 24px', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <h2 style={{ color: 'var(--text-table-header)', fontSize: '18px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={18} />
            {confrerieLabel}
          </h2>
          {canGenerate && selectedIds.size > 0 && (
            <button
              onClick={generateInvoices}
              disabled={isGenerating}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                color: '#fff', background: 'var(--accent)', border: 'none', cursor: isGenerating ? 'wait' : 'pointer',
                opacity: isGenerating ? 0.6 : 1, transition: 'opacity 0.15s'
              }}
            >
              {isGenerating ? (
                sendProgress ? <><Send size={14} /> Envoi {sendProgress.sent}/{sendProgress.total}…</> : <><FileText size={14} /> Génération…</>
              ) : (
                <><FileText size={14} /> Générer {selectedIds.size} facture{selectedIds.size > 1 ? 's' : ''} (CHF {selectableMembers.filter(m => selectedIds.has(m.id)).reduce((sum, m) => sum + (m.annual_amount ?? confrerieAmount), 0).toFixed(2)})</>
              )}
            </button>
          )}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '6px' }}>
          {billableMembers.length} membre{billableMembers.length > 1 ? 's' : ''} à facturer
          {packageMembers.length > 0 && (
            <>
              {' · '}
              <button
                type="button"
                onClick={() => setShowPackageOnly(!showPackageOnly)}
                style={{ color: 'var(--warning-text, #92400e)', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px' }}
              >
                {packageMembers.length} compris dans un package (aucune facture)
              </button>
            </>
          )}
          {confrerieCompte ? (
            <span style={{ color: 'var(--text-muted)', marginLeft: '12px' }}>Compte : {confrerieCompte}</span>
          ) : (
            <span style={{ color: 'var(--text-muted)', marginLeft: '12px', fontStyle: 'italic', fontSize: '12px' }}>— à configurer dans Configuration financière, onglet {confrerieLabel}</span>
          )}
          {showPackageOnly && (
            <span style={{ marginLeft: '12px' }}>
              <button type="button" onClick={() => setShowPackageOnly(false)} style={{ color: 'var(--accent)', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px' }}>
                Afficher tous les membres
              </button>
            </span>
          )}
        </div>
      </div>

      <div style={{ padding: '16px 24px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px' }}>
        <div style={{ position: 'relative', flex: '1', maxWidth: '320px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher..."
            style={{
              width: '100%', paddingLeft: '36px', paddingRight: '12px', paddingTop: '8px', paddingBottom: '8px',
              borderRadius: '8px', fontSize: '13px', border: '1px solid var(--border-color)',
              background: 'var(--bg-primary)', color: 'var(--text-primary)'
            }}
          />
        </div>
        {canGenerate && !showPackageOnly && selectableMembers.length > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={selectedIds.size === selectableMembers.length && selectableMembers.length > 0}
              onChange={toggleAll}
              style={{ accentColor: 'var(--accent)' }}
            />
            Tout sélectionner ({selectableMembers.length})
          </label>
        )}
        {alreadyInvoicedIds.size > 0 && (
          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            {alreadyInvoicedIds.size} déjà facturé{alreadyInvoicedIds.size > 1 ? 's' : ''} cette saison
          </span>
        )}
      </div>

      <DataTableShell bare scrollable={false}>
        {loading ? (
          <div style={{ padding: '24px 48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Chargement...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '24px 48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Users size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
            <p>Aucun membre trouvé</p>
          </div>
        ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '700px' }}>
              <thead>
                <tr>
                  {canGenerate && !showPackageOnly && (
                    <th className="px-6 py-3 text-center" style={{ width: '40px' }} />
                  )}
                  <SortableHeader label="Nom" field="last_name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Prénom" field="first_name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Société</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider hidden md:table-cell" style={{ color: 'var(--text-secondary)' }}>Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider hidden lg:table-cell" style={{ color: 'var(--text-secondary)' }}>Localité</th>
                  <SortableHeader label="Depuis" field="member_since" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="hidden lg:table-cell" />
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Cotisation</th>
                  <SortableHeader label="Facturation" field="billing_mode" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => {
                  const isPackage = m.billing_mode === 'package';
                  const isInvoiced = alreadyInvoicedIds.has(m.id);
                  const isSelectable = !isPackage && !isInvoiced;
                  return (
                    <tr key={m.id} style={{ borderTop: '1px solid var(--border-color)', opacity: isInvoiced ? 0.55 : 1, transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {canGenerate && !showPackageOnly && (
                        <td className="px-6 py-3 text-center">
                          {isSelectable ? (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(m.id)}
                              onChange={() => toggleOne(m.id)}
                              style={{ accentColor: 'var(--accent)' }}
                            />
                          ) : isPackage ? (
                            <span title="Compris dans un package — pas de facture" style={{ color: 'var(--text-muted)', cursor: 'not-allowed' }}>—</span>
                          ) : (
                            <span title="Déjà facturé cette saison" style={{ color: 'var(--text-muted)', cursor: 'not-allowed', fontSize: '11px' }}>✓</span>
                          )}
                        </td>
                      )}
                      <td className="px-6 py-3 text-sm" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{m.last_name}</td>
                      <td className="px-6 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>{m.first_name}</td>
                      <td className="px-6 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{m.company || ''}</td>
                      <td className="px-6 py-3 text-sm hidden md:table-cell" style={{ color: 'var(--text-secondary)' }}>{m.email || '—'}</td>
                      <td className="px-6 py-3 text-sm hidden lg:table-cell" style={{ color: 'var(--text-secondary)' }}>{m.city || '—'}</td>
                      <td className="px-6 py-3 text-sm hidden lg:table-cell" style={{ color: 'var(--text-secondary)' }}>{formatDateCH(m.member_since)}</td>
                      <td className="px-6 py-3 text-right text-sm" style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                        CHF {(m.annual_amount ?? confrerieAmount).toFixed(2)}
                        {m.category === 'supporter' && (
                          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: 'var(--info-soft, #eff6ff)', color: 'var(--accent)' }}>Supporter</span>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, ...billingPillStyle(m.billing_mode) }}
                          title={isPackage ? getSponsorName(m.sponsor_id) : undefined}
                        >
                          {billingLabel(m.billing_mode)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        )}
      </DataTableShell>

    </div>
  );
}
