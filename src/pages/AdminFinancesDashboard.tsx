import { useState, useEffect, useRef } from 'react';

import { unzipSync, strFromU8 } from 'fflate';
import { Loader as Loader2, ChevronUp, ChevronDown, ChevronsUpDown, X, CircleCheck as CheckCircle, TriangleAlert as AlertTriangle, Flag, Clock, Download, Mail, MailOpen, MailWarning, Trash2, Upload, FolderOpen, Wrench, Send, Printer, Wallet, FileText, Lightbulb, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { ReminderPDFData } from '../utils/generateReminderPDF';

const lazyInvoicePDF = (...args: Parameters<typeof import('../utils/generateInvoicePDF').generateInvoicePDF>) =>
  import('../utils/generateInvoicePDF').then(m => m.generateInvoicePDF(...args));
const lazyReminderPDF = (...args: Parameters<typeof import('../utils/generateReminderPDF').generateReminderPagePDF>) =>
  import('../utils/generateReminderPDF').then(m => m.generateReminderPagePDF(...args));
import { parseCamtXml } from '../utils/camtParser';
import { useModuleAccess } from '../hooks/useModuleAccess';
import { StandardModal } from '../components/StandardModal';
import { SponsorEmailModal } from '../components/SponsorEmailModal';
import SearchInput from '../components/ui/SearchInput';
import Button from '../components/ui/Button';
import DataTableShell from '../components/DataTableShell';
import { Badge, type BadgeVariant } from '../components/ui/Badge';
import { FilterButtonGroup } from '../components/FilterButtonGroup';

interface Invoice {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  total_amount: number;
  status: string;
  qr_reference: string;
  base_amount: number;
  fratrie_discount_pct: number;
  fratrie_discount_amount: number;
  reminder_fee: number;
  currency: string;
  notes?: string;
  cancelled_at?: string;
  cancelled_reason?: string;
  paid_amount?: number;
  balance?: number;
  reminder1_sent_at?: string;
  reminder2_sent_at?: string;
  invoice_type?: string;
  sponsor_id?: string;
  member: {
    first_name: string;
    last_name: string;
    salutation?: string;
    birth_date?: string;
    address?: string;
    street_number?: string;
    postal_code?: string;
    city?: string;
    asf_licence_number?: string;
    email?: string;
    legal_rep1_email?: string;
    legal_rep2_email?: string;
  } | null;
  sponsor: {
    company_name: string;
    contact_first_name?: string;
    contact_last_name?: string;
    address?: string;
    postal_code?: string;
    city?: string;
    email?: string;
  } | null;
  registration: {
    first_name: string;
    last_name: string;
    email?: string;
    phone?: string;
    address?: string;
    postal_code?: string;
    city?: string;
    company?: string;
    option_label?: string;
    quantity?: number;
    event?: { title: string; date: string } | null;
  } | null;
  confrerie_member: {
    first_name: string;
    last_name: string;
    email?: string;
    address?: string;
    postal_code?: string;
    city?: string;
    salutation?: string;
    company?: string;
  } | null;
  team: {
    name: string;
  } | null;
  category: {
    name: string;
    type?: string;
  } | null;
  season: {
    id: string;
    name: string;
  };
}

interface FileImportStats {
  filename: string;
  format: string;
  total: number;
  matched: number;
  unmatched: number;
  duplicates: number;
  reversals: number;
}

interface ImportReport {
  matched: number;
  unmatched: number;
  duplicates: number;
  reversals: number;
  fileStats: FileImportStats[];
  unmatchedList: Array<{
    debtorName: string;
    amount: number;
    ref: string;
    addInfo: string;
    paymentDate: string;
  }>;
}

export function AdminFinancesDashboard() {
  const { canView, canEdit, loading: moduleLoading } = useModuleAccess('finances');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showRevertModal, setShowRevertModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const [showImportReport, setShowImportReport] = useState(false);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const camtInputRef = useRef<HTMLInputElement>(null);
  const [showImportHistory, setShowImportHistory] = useState(false);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [camtImports, setCamtImports] = useState<any[]>([]);
  const [unmatchedTransactions, setUnmatchedTransactions] = useState<any[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [selectedMatches, setSelectedMatches] = useState<Record<string, string>>({});
  const [openInvoices, setOpenInvoices] = useState<any[]>([]);
  const [searchManual, setSearchManual] = useState<Record<string, string>>({});
  const [filterSeason, setFilterSeason] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [seasons, setSeasons] = useState<any[]>([]);
  const [amountWarning, setAmountWarning] = useState<any>({ show: false });
  const [sendingInvoice, setSendingInvoice] = useState<string | null>(null);
  const [sendingBulk, setSendingBulk] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);
  const [sendingReminderIds, setSendingReminderIds] = useState<Set<string>>(new Set());
  const [bulkReminderProgress, setBulkReminderProgress] = useState<{ type: 'R1' | 'R2'; total: number } | null>(null);
  const [bulkSendProgress, setBulkSendProgress] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  const [sortColumn, setSortColumn] = useState<string | null>('invoice_number');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>('desc');
  const [showReminderConfirm, setShowReminderConfirm] = useState<{ invoice: Invoice; type: 'R1' | 'R2' } | null>(null);
  const [showBulkReminderConfirm, setShowBulkReminderConfirm] = useState<'R1' | 'R2' | null>(null);
  const [sendingBulkReminders, setSendingBulkReminders] = useState(false);
  const [feeComptes, setFeeComptes] = useState<Record<string, string>>({});
  const [showCamtConfirm, setShowCamtConfirm] = useState<{ xmlFiles: Array<{ name: string; content: string }>; transactionCount: number } | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState<{ filename: string; importDate: string } | null>(null);
  const [reminderDays, setReminderDays] = useState<{ r1: number; r2: number }>({ r1: 30, r2: 60 });
  const [confrerieRemindersEnabled, setConfrerieRemindersEnabled] = useState(false);
  const [confrerieLabel, setConfrerieLabel] = useState('Confrérie');
  const [emailStatuses, setEmailStatuses] = useState<Record<string, { status: string; sent_at: string; send_type: string; email_status_at: string }>>({});
  const [sponsorEmailModal, setSponsorEmailModal] = useState<{ invoice: Invoice } | null>(null);
  const [showPrintReminderConfirm, setShowPrintReminderConfirm] = useState<{ invoice: Invoice; type: 'R1' | 'R2' } | null>(null);
  const [showBulkPrintReminderConfirm, setShowBulkPrintReminderConfirm] = useState<'R1' | 'R2' | null>(null);
  const [printingReminder, setPrintingReminder] = useState(false);

  const [showBatchPrintModal, setShowBatchPrintModal] = useState(false);
  const [batchPrintScope, setBatchPrintScope] = useState<'all' | 'teams' | 'events'>('all');
  const [batchPrintSelectedTeams, setBatchPrintSelectedTeams] = useState<string[]>([]);
  const [batchPrintSelectedEvents, setBatchPrintSelectedEvents] = useState<string[]>([]);
  const [batchPrintSeparators, setBatchPrintSeparators] = useState(true);
  const [batchPrintProgress, setBatchPrintProgress] = useState<{ current: number; total: number } | null>(null);
  const [batchPrintTeamSearch, setBatchPrintTeamSearch] = useState('');
  const [batchPrintEventSearch, setBatchPrintEventSearch] = useState('');

  useEffect(() => { document.title = 'Tableau des factures - ClubSphere' }, [])

  useEffect(() => {
    loadInvoices();
    fetchCamtImports();
    fetchUnmatched();
    refreshPendingCount();
    fetchOpenInvoices();
    fetchSeasons();
    loadFeeComptes();
    loadReminderConfig();
    supabase.from('club_settings').select('confrerie_label').maybeSingle().then(({ data }) => {
      if (data?.confrerie_label) setConfrerieLabel(data.confrerie_label);
    });
  }, []);

  useEffect(() => {
    setSelectedInvoiceIds(new Set());
  }, [filterStatus]);

  const loadReminderConfig = async () => {
    const { data } = await supabase
      .from('finance_config')
      .select('reminder1_days, reminder2_days')
      .maybeSingle();
    setReminderDays({
      r1: data?.reminder1_days ?? 30,
      r2: data?.reminder2_days ?? 60,
    });

    const { data: notifConfig } = await supabase
      .from('club_notification_config')
      .select('enabled')
      .eq('notification_type', 'confrerie_reminders')
      .maybeSingle();
    setConfrerieRemindersEnabled(notifConfig?.enabled ?? false);
  };

  const loadInvoices = async () => {
    const { data } = await supabase
      .from('invoices')
      .select(`
        *,
        member:members(
          first_name, last_name, salutation, email, birth_date,
          address, street_number, postal_code, city,
          asf_licence_number, legal_rep1_email, legal_rep2_email
        ),
        sponsor:sponsors(
          company_name, contact_first_name, contact_last_name,
          address, postal_code, city, email
        ),
        registration:event_public_registrations(
          first_name, last_name, email, phone, address, postal_code, city,
          company, option_label, quantity,
          event:events(title, date)
        ),
        confrerie_member:confrerie_members(
          first_name, last_name, email, address, postal_code, city, salutation, company
        ),
        team:teams(name),
        category:team_categories(name, type),
        season:seasons(id, name)
      `)
      .order('invoice_number', { ascending: false });

    setInvoices(data || []);
    setLoading(false);
    if (data && data.length > 0) {
      loadEmailStatuses(data.map(d => d.id));
    }
  };

  const loadEmailStatuses = async (ids: string[]) => {
    const { data } = await supabase
      .from('invoice_email_status')
      .select('invoice_id, send_type, sent_at, send_success, email_status, resend_email_id')
      .in('invoice_id', ids);
    if (!data) return;
    const map: Record<string, { status: string; sent_at: string; send_type: string; email_status_at: string }> = {};
    for (const row of data) {
      const prev = map[row.invoice_id];
      if (!prev || new Date(row.sent_at) > new Date(prev.sent_at)) {
        let status = 'unknown';
        const es = row.email_status as string | null;
        if (es === 'email.opened' || es === 'email.clicked') status = 'opened';
        else if (es === 'delivered' || es === 'email.delivered') status = 'delivered';
        else if (es === 'bounced' || es === 'email.bounced') status = 'bounced';
        else if (es === 'complained' || es === 'email.complained') status = 'bounced';
        else if (row.send_success === false) status = 'bounced';
        else if (es === 'email.sent' || es === 'email.delivery_delayed') status = 'sending';
        else if (row.send_success === true && !es && row.resend_email_id) status = 'sending';
        else if (row.send_success === true && es) status = 'delivered';
        else if (row.send_success === true) status = 'sending';
        if (status !== 'unknown') {
          map[row.invoice_id] = { status, sent_at: row.sent_at, send_type: row.send_type, email_status_at: row.sent_at };
        }
      }
    }
    setEmailStatuses(map);
  };

  const loadFeeComptes = async () => {
    const { data } = await supabase
      .from('fee_configs')
      .select('category_id, compte');
    const map: Record<string, string> = {};
    data?.forEach(f => {
      if (f.compte) map[f.category_id] = f.compte;
    });
    setFeeComptes(map);
  };

  const downloadInvoice = async (invoiceId: string) => {
    setDownloading(invoiceId);
    try {
      const invoice = invoices.find(inv => inv.id === invoiceId);
      if (!invoice) return;

      const { data: club } = await supabase
        .from('club_settings')
        .select('*')
        .maybeSingle();

      const { data: finance } = await supabase
        .from('finance_config')
        .select('*')
        .maybeSingle();

      if (!validateSponsorAddress(invoice)) return;

      await lazyInvoicePDF(buildPDFParams(invoice, club, finance));
    } catch (e) {
      console.error(e);
      showToast("Le PDF n'a pas pu être généré. Rechargez la page et réessayez.", 'error');
    } finally {
      setDownloading(null);
    }
  };

  const openCancelModal = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setCancelReason('');
    setShowCancelModal(true);
  };

  const openDeleteModal = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setShowDeleteModal(true);
  };

  const openRevertModal = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setShowRevertModal(true);
  };

  const confirmCancel = async () => {
    if (!cancelReason.trim() || !selectedInvoice) return;

    const { error } = await supabase
      .from('invoices')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_reason: cancelReason.trim(),
        updated_at: new Date().toISOString()
      })
      .eq('id', selectedInvoice.id);

    if (!error) {
      showToast(`Facture ${selectedInvoice.invoice_number} annulée`);
      setShowCancelModal(false);
      setCancelReason('');
      setSelectedInvoice(null);
      loadInvoices();
    } else {
      showToast('Erreur: ' + error.message, 'error');
    }
  };

  const confirmDelete = async () => {
    if (!selectedInvoice) return;

    if (selectedInvoice.status !== 'draft') {
      showToast(
        'Seules les factures en brouillon peuvent être supprimées',
        'error'
      );
      return;
    }

    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('id', selectedInvoice.id)
      .eq('status', 'draft');

    if (!error) {
      showToast(
        `Facture ${selectedInvoice.invoice_number} supprimée`
      );
      setShowDeleteModal(false);
      setSelectedInvoice(null);
      loadInvoices();
    } else {
      showToast('Erreur: ' + error.message, 'error');
    }
  };

  const confirmRevertPayment = async () => {
    if (!selectedInvoice) return;

    const { error: delErr } = await supabase
      .from('payments')
      .delete()
      .eq('invoice_id', selectedInvoice.id);
    if (delErr) { showToast('Erreur: ' + delErr.message, 'error'); return; }

    // Revert invoice status:
    const { error } = await supabase
      .from('invoices')
      .update({
        status: 'sent',
        paid_date: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', selectedInvoice.id);

    if (!error) {
      showToast('Paiement annulé — facture remise en envoyée');
      setShowRevertModal(false);
      setSelectedInvoice(null);
      loadInvoices();
    } else {
      showToast('Erreur: ' + error.message, 'error');
    }
  };

  const sendInvoiceEmail = async (invoiceId: string) => {
    setSendingInvoice(invoiceId);

    try {
      const invoice = invoices.find(inv => inv.id === invoiceId);
      if (!invoice) {
        console.error('Invoice not found:', invoiceId);
        throw new Error('Facture introuvable');
      }

      console.log('Starting invoice send for:', invoice.invoice_number);

      const { data: club } = await supabase
        .from('club_settings')
        .select('*')
        .maybeSingle();

      const { data: finance } = await supabase
        .from('finance_config')
        .select('*')
        .maybeSingle();

      console.log('Loaded club and finance config');

      if (!validateSponsorAddress(invoice)) return;

      console.log('Generating PDF...');
      const pdfBase64 = await generateInvoicePDFBase64(buildPDFParams(invoice, club, finance));

      console.log('PDF generated, size:', pdfBase64.length, 'chars');

      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        console.error('No access token available');
        throw new Error('Session expirée - veuillez vous reconnecter');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invoice`;

      console.log('Calling Edge Function:', apiUrl);
      console.log('Auth token present:', !!session?.access_token);
      console.log('Request payload:', {
        invoice_id: invoiceId,
        pdf_size: pdfBase64.length,
        filename: `Facture_${invoice.invoice_number}.pdf`
      });

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invoice_id: invoiceId,
          pdf_base64: pdfBase64,
          filename: `Facture_${invoice.invoice_number}.pdf`
        })
      });

      console.log('Edge Function response status:', response.status);

      let result;
      try {
        result = await response.json();
        console.log('Edge Function response body:', result);
      } catch (parseError) {
        console.error('Failed to parse response as JSON:', parseError);
        const text = await response.text();
        console.error('Response text:', text);
        throw new Error(`Erreur serveur (${response.status}): Impossible de lire la réponse`);
      }

      if (!response.ok) {
        console.error('Edge Function error:', result);
        throw new Error(result.error || `Erreur lors de l'envoi (${response.status})`);
      }

      console.log('Invoice sent successfully');

      if (result.simulated) {
        showToast(`Email simulé pour ${invoice.invoice_number} (mode développement)`);
      } else {
        showToast(`Facture ${invoice.invoice_number} envoyée par email`);
      }

      loadInvoices();
    } catch (error: any) {
      console.error('Full error details:', error);
      console.error('Error stack:', error.stack);
      showToast(`Erreur: ${error.message}`, 'error');
    } finally {
      setSendingInvoice(null);
    }
  };

  const sendBulkInvoices = async () => {
    setShowBulkConfirm(false);
    setSendingBulk(true);

    try {
      const pool = hasSelection ? selectedInvoices : invoices;
      const allDrafts = pool.filter(inv => inv.status === 'draft');
      const sponsoringExcluded = allDrafts.filter(inv => inv.invoice_type === 'sponsoring');
      const draftInvoices = allDrafts.filter(inv => inv.invoice_type !== 'sponsoring');

      if (sponsoringExcluded.length > 0) {
        showToast(`${sponsoringExcluded.length} facture${sponsoringExcluded.length > 1 ? 's' : ''} sponsor à envoyer individuellement via l'enveloppe`);
      }

      if (draftInvoices.length === 0) {
        showToast('Aucune facture en brouillon à envoyer', 'error');
        return;
      }

      const { data: club } = await supabase
        .from('club_settings')
        .select('*')
        .maybeSingle();

      const { data: finance } = await supabase
        .from('finance_config')
        .select('*')
        .maybeSingle();

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Session expirée - veuillez vous reconnecter');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invoice`;
      const total = draftInvoices.length;
      let sent = 0;
      let failed = 0;
      const errors: string[] = [];

      setBulkSendProgress({ sent: 0, failed: 0, total });

      for (let i = 0; i < total; i++) {
        const invoice = draftInvoices[i];
        try {
          const pdfBase64 = await generateInvoicePDFBase64(buildPDFParams(invoice, club, finance));

          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              invoice_id: invoice.id,
              pdf_base64: pdfBase64,
              filename: `Facture_${invoice.invoice_number}.pdf`
            })
          });

          if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.error || `Erreur ${response.status}`);
          }

          sent++;
        } catch (err: any) {
          failed++;
          errors.push(`${invoice.invoice_number}: ${err.message}`);
        }

        setBulkSendProgress({ sent, failed, total });

        if (i < total - 1) {
          await new Promise(resolve => setTimeout(resolve, 600));
        }
      }

      setBulkSendProgress(null);

      if (failed === 0) {
        showToast(`${sent} facture${sent > 1 ? 's' : ''} envoyée${sent > 1 ? 's' : ''} par email`);
      } else if (sent > 0) {
        showToast(`${sent} envoyée${sent > 1 ? 's' : ''}, ${failed} en erreur`, 'error');
      } else {
        showToast(`Echec de l'envoi (${failed} erreur${failed > 1 ? 's' : ''})`, 'error');
      }

      if (errors.length > 0) {
        console.error('Erreurs d\'envoi groupé:', errors);
      }

      setSelectedInvoiceIds(new Set());
      loadInvoices();
    } catch (error: any) {
      setBulkSendProgress(null);
      showToast(`Erreur: ${error.message}`, 'error');
    } finally {
      setSendingBulk(false);
    }
  };

  const generateInvoicePDFBase64 = async (params: any): Promise<string> => {
    const base64 = await lazyInvoicePDF(params, true);
    return base64 as string;
  };

  const buildPDFParams = (invoice: Invoice, club: any, finance: any) => {
    const isSponsoring = invoice.invoice_type === 'sponsoring';
    const isEvent = invoice.invoice_type === 'evenement';
    const sponsorContactName = invoice.sponsor
      ? [invoice.sponsor.contact_first_name, invoice.sponsor.contact_last_name].filter(Boolean).join(' ')
      : '';
    const reg = invoice.registration;
    return {
      invoice_number: invoice.invoice_number,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date,
      qr_reference: invoice.qr_reference,
      notes: invoice.notes,
      member_first_name: invoice.member?.first_name || '',
      member_last_name: invoice.member?.last_name || '',
      member_salutation: invoice.member?.salutation,
      member_address: invoice.member?.address || '',
      member_street_number: invoice.member?.street_number,
      member_postal_code: invoice.member?.postal_code || '',
      member_city: invoice.member?.city || '',
      member_asf_licence: invoice.member?.asf_licence_number,
      member_birth_date: invoice.member?.birth_date,
      base_amount: invoice.base_amount,
      fratrie_discount_pct: invoice.fratrie_discount_pct || 0,
      fratrie_discount_amount: invoice.fratrie_discount_amount || 0,
      reminder_fee: invoice.reminder_fee || 0,
      total_amount: invoice.total_amount,
      currency: invoice.currency || 'CHF',
      category_name: invoice.category?.name || '',
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
      is_sponsoring: isSponsoring,
      sponsor_company_name: isSponsoring ? invoice.sponsor?.company_name : undefined,
      sponsor_contact_name: isSponsoring ? sponsorContactName : undefined,
      sponsor_address: isSponsoring ? invoice.sponsor?.address : undefined,
      sponsor_postal_code: isSponsoring ? invoice.sponsor?.postal_code : undefined,
      sponsor_city: isSponsoring ? invoice.sponsor?.city : undefined,
      is_event: isEvent,
      event_title: isEvent ? reg?.event?.title : undefined,
      event_date: isEvent ? reg?.event?.date : undefined,
      event_option_label: isEvent ? reg?.option_label : undefined,
      event_quantity: isEvent ? reg?.quantity : undefined,
      event_company: isEvent ? reg?.company : undefined,
      event_debtor_first_name: isEvent ? reg?.first_name : undefined,
      event_debtor_last_name: isEvent ? reg?.last_name : undefined,
      event_debtor_address: isEvent ? reg?.address : undefined,
      event_debtor_postal_code: isEvent ? reg?.postal_code : undefined,
      event_debtor_city: isEvent ? reg?.city : undefined,
      is_confrerie: invoice.invoice_type === 'confrerie',
      confrerie_label: invoice.invoice_type === 'confrerie' ? (club?.confrerie_label || 'Confrérie') : undefined,
      confrerie_member_first_name: invoice.invoice_type === 'confrerie' ? invoice.confrerie_member?.first_name : undefined,
      confrerie_member_last_name: invoice.invoice_type === 'confrerie' ? invoice.confrerie_member?.last_name : undefined,
      confrerie_member_address: invoice.invoice_type === 'confrerie' ? invoice.confrerie_member?.address : undefined,
      confrerie_member_postal_code: invoice.invoice_type === 'confrerie' ? invoice.confrerie_member?.postal_code : undefined,
      confrerie_member_city: invoice.invoice_type === 'confrerie' ? invoice.confrerie_member?.city : undefined,
      confrerie_member_salutation: invoice.invoice_type === 'confrerie' ? invoice.confrerie_member?.salutation : undefined,
      confrerie_member_company: invoice.invoice_type === 'confrerie' ? invoice.confrerie_member?.company : undefined,
    };
  };

  const validateSponsorAddress = (invoice: Invoice): boolean => {
    if (invoice.invoice_type !== 'sponsoring') return true;
    const s = invoice.sponsor;
    if (!s || !s.address || !s.postal_code || !s.city) {
      showToast('Adresse du sponsor incomplète — complétez la fiche sponsor', 'error');
      return false;
    }
    return true;
  };

  const resolveSponsoringPlaceholders = (template: string, invoice: Invoice, clubName: string, seasonName: string): string => {
    const formatAmount = (amount: number) => 'CHF ' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
    const formatDate = (iso: string) => {
      if (!iso) return '';
      const d = new Date(iso);
      return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
    };
    return template
      .replace(/\{numero\}/g, invoice.invoice_number)
      .replace(/\{sponsor\}/g, invoice.sponsor?.company_name || '')
      .replace(/\{montant\}/g, formatAmount(invoice.total_amount))
      .replace(/\{echeance\}/g, formatDate(invoice.due_date))
      .replace(/\{saison\}/g, seasonName)
      .replace(/\{club\}/g, clubName);
  };

  const handleSponsorEmailSend = async (invoice: Invoice, subject: string, message: string) => {
    if (!validateSponsorAddress(invoice)) return;

    const { data: club } = await supabase
      .from('club_settings')
      .select('*')
      .maybeSingle();

    const { data: finance } = await supabase
      .from('finance_config')
      .select('*')
      .maybeSingle();

    const pdfBase64 = await generateInvoicePDFBase64(buildPDFParams(invoice, club, finance));

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Session expirée');

    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invoice`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        invoice_id: invoice.id,
        pdf_base64: pdfBase64,
        filename: `Facture_${invoice.invoice_number}_${invoice.sponsor?.company_name || 'Sponsor'}.pdf`,
        custom_subject: subject,
        custom_message: message
      })
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Erreur lors de l\'envoi');

    if (result.simulated) {
      showToast(`Email simulé pour ${invoice.invoice_number} (mode développement)`);
    } else {
      showToast(`Facture ${invoice.invoice_number} envoyée à ${invoice.sponsor?.email || 'sponsor'}`);
    }

    loadInvoices();
  };

  const getDaysOverdue = (dueDate: string): number => {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = today.getTime() - due.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const daysSince = (iso: string): number => {
    const diff = new Date().getTime() - new Date(iso).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const isEligibleForR1 = (invoice: Invoice): boolean => {
    if (invoice.status === 'paid' || invoice.status === 'cancelled') return false;
    if (invoice.reminder1_sent_at) return false;
    if (invoice.invoice_type === 'confrerie' && !confrerieRemindersEnabled) return false;
    return getDaysOverdue(invoice.due_date) >= reminderDays.r1;
  };

  const isEligibleForR2 = (invoice: Invoice): boolean => {
    if (invoice.status === 'paid' || invoice.status === 'cancelled') return false;
    if (!invoice.reminder1_sent_at) return false;
    if (invoice.reminder2_sent_at) return false;
    if (invoice.invoice_type === 'confrerie' && !confrerieRemindersEnabled) return false;
    return daysSince(invoice.reminder1_sent_at) >= reminderDays.r2;
  };

  const formatDate = (iso: string): string => {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  };

  const getInvoiceRecipientEmail = (invoice: Invoice): string | undefined => {
    if (invoice.invoice_type === 'sponsoring') return invoice.sponsor?.email;
    if (invoice.invoice_type === 'evenement') return invoice.registration?.email;
    if (invoice.invoice_type === 'confrerie') return invoice.confrerie_member?.email;
    return invoice.member?.email;
  };

  const r1DisabledReason = (invoice: Invoice): string | null => {
    if (invoice.status === 'paid') return 'Facture payée';
    if (invoice.status === 'cancelled') return 'Facture annulée';
    if (invoice.reminder1_sent_at) return `R1 déjà envoyé le ${formatDate(invoice.reminder1_sent_at)}`;
    const daysOverdue = getDaysOverdue(invoice.due_date);
    if (daysOverdue < reminderDays.r1) {
      return `R1 disponible dans ${reminderDays.r1 - daysOverdue} jour(s)`;
    }
    return null;
  };

  const r2DisabledReason = (invoice: Invoice): string | null => {
    if (invoice.status === 'paid') return 'Facture payée';
    if (invoice.status === 'cancelled') return 'Facture annulée';
    if (!invoice.reminder1_sent_at) return 'R1 doit être envoyé en premier';
    if (invoice.reminder2_sent_at) return `R2 déjà envoyé le ${formatDate(invoice.reminder2_sent_at)}`;
    const daysSinceR1 = daysSince(invoice.reminder1_sent_at);
    if (daysSinceR1 < reminderDays.r2) {
      return `R2 disponible dans ${reminderDays.r2 - daysSinceR1} jour(s)`;
    }
    return null;
  };

  const sendReminder = async (invoiceId: string, reminderType: 'R1' | 'R2') => {
    setSendingReminder(invoiceId);
    setSendingReminderIds(prev => {
      const next = new Set(prev);
      next.add(invoiceId);
      return next;
    });
    setShowReminderConfirm(null);

    try {
      let invoice: Invoice | undefined = invoices.find(inv => inv.id === invoiceId);
      if (!invoice) throw new Error('Facture introuvable');

      if (reminderType === 'R2' && invoice.invoice_type !== 'sponsoring' && invoice.invoice_type !== 'confrerie') {
        const { error: rpcError } = await supabase.rpc('apply_reminder2_fee', { p_invoice_id: invoiceId });
        if (rpcError) throw new Error(`Erreur frais R2: ${rpcError.message}`);

        const { data: fresh, error: fetchError } = await supabase
          .from('invoices')
          .select(`
            *,
            member:members(
              first_name, last_name, salutation, email, birth_date,
              address, street_number, postal_code, city,
              asf_licence_number, legal_rep1_email, legal_rep2_email
            ),
            sponsor:sponsors(
              company_name, contact_first_name, contact_last_name,
              address, postal_code, city, email
            ),
            team:teams(name),
            category:team_categories(name, type),
            season:seasons(id, name)
          `)
          .eq('id', invoiceId)
          .single();
        if (fetchError || !fresh) throw new Error('Impossible de recharger la facture après application des frais');
        invoice = fresh as Invoice;
      }

      const { data: club } = await supabase
        .from('club_settings')
        .select('*')
        .maybeSingle();

      const { data: finance } = await supabase
        .from('finance_config')
        .select('*')
        .maybeSingle();

      if (!validateSponsorAddress(invoice)) return;

      const pdfBase64 = await generateInvoicePDFBase64(buildPDFParams(invoice, club, finance));

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Session expirée');

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invoice`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invoice_id: invoiceId,
          pdf_base64: pdfBase64,
          filename: `Facture_${invoice.invoice_number}.pdf`,
          reminder_type: reminderType
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erreur lors de l\'envoi');

      const m = invoice.member as any;
      const recipient = m?.email || m?.legal_rep1_email || m?.legal_rep2_email || 'destinataire';

      if (result.simulated) {
        showToast(`Rappel ${reminderType} simulé pour ${invoice.invoice_number}`);
      } else {
        showToast(`Rappel ${reminderType} envoyé à ${recipient}`);
      }

      loadInvoices();
    } catch (error: any) {
      showToast(`Erreur lors de l'envoi: ${error.message}`, 'error');
    } finally {
      setSendingReminder(null);
      setSendingReminderIds(prev => {
        const next = new Set(prev);
        next.delete(invoiceId);
        return next;
      });
    }
  };

  const sendBulkReminders = async (reminderType: 'R1' | 'R2') => {
    setShowBulkReminderConfirm(null);
    setSendingBulkReminders(true);

    try {
      const pool = hasSelection ? selectedInvoices : invoices;
      const eligibleInvoices = pool.filter(inv =>
        reminderType === 'R1' ? isEligibleForR1(inv) : isEligibleForR2(inv)
      );

      if (eligibleInvoices.length === 0) {
        showToast(`Aucune facture éligible pour ${reminderType}`, 'error');
        return;
      }

      const total = eligibleInvoices.length;
      setBulkReminderProgress({ type: reminderType, total });
      setBulkSendProgress({ sent: 0, failed: 0, total });

      const { data: club } = await supabase
        .from('club_settings')
        .select('*')
        .maybeSingle();

      const { data: finance } = await supabase
        .from('finance_config')
        .select('*')
        .maybeSingle();

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Session expirée - veuillez vous reconnecter');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invoice`;
      let sent = 0;
      let failed = 0;
      const errors: string[] = [];

      for (let i = 0; i < total; i++) {
        let invoice: Invoice = eligibleInvoices[i];
        try {
          if (reminderType === 'R2' && invoice.invoice_type !== 'sponsoring' && invoice.invoice_type !== 'confrerie') {
            const { error: rpcError } = await supabase.rpc('apply_reminder2_fee', { p_invoice_id: invoice.id });
            if (rpcError) throw new Error(`Erreur frais R2: ${rpcError.message}`);

            const { data: fresh, error: fetchError } = await supabase
              .from('invoices')
              .select(`
                *,
                member:members(
                  first_name, last_name, salutation, email, birth_date,
                  address, street_number, postal_code, city,
                  asf_licence_number, legal_rep1_email, legal_rep2_email
                ),
                sponsor:sponsors(
                  company_name, contact_first_name, contact_last_name,
                  address, postal_code, city, email
                ),
                team:teams(name),
                category:team_categories(name, type),
                season:seasons(id, name)
              `)
              .eq('id', invoice.id)
              .single();
            if (fetchError || !fresh) throw new Error('Impossible de recharger la facture après application des frais');
            invoice = fresh as Invoice;
          }

          if (!validateSponsorAddress(invoice)) {
            failed++;
            errors.push(`${invoice.invoice_number}: Adresse sponsor incomplète`);
            setBulkSendProgress({ sent, failed, total });
            continue;
          }

          const pdfBase64 = await generateInvoicePDFBase64(buildPDFParams(invoice, club, finance));

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
              reminder_type: reminderType
            })
          });

          if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.error || `Erreur ${response.status}`);
          }

          sent++;
        } catch (err: any) {
          failed++;
          errors.push(`${invoice.invoice_number}: ${err.message}`);
        }

        setBulkSendProgress({ sent, failed, total });

        if (i < total - 1) {
          await new Promise(resolve => setTimeout(resolve, 600));
        }
      }

      setBulkSendProgress(null);

      const suffix = failed > 0 ? ` (${failed} échec${failed > 1 ? 's' : ''})` : '';
      if (failed === 0) {
        showToast(`${sent} rappel${sent > 1 ? 's' : ''} ${reminderType} envoyé${sent > 1 ? 's' : ''} avec succès`);
      } else if (sent > 0) {
        showToast(`${sent} rappel${sent > 1 ? 's' : ''} envoyé${sent > 1 ? 's' : ''}${suffix}`, 'error');
      } else {
        showToast(`Echec de l'envoi des rappels ${reminderType}${suffix}`, 'error');
      }

      if (errors.length > 0) {
        console.error('Erreurs d\'envoi rappels:', errors);
      }

      setSelectedInvoiceIds(new Set());
      loadInvoices();
    } catch (error: any) {
      setBulkSendProgress(null);
      showToast(`Erreur lors de l'envoi: ${error.message}`, 'error');
    } finally {
      setSendingBulkReminders(false);
      setBulkReminderProgress(null);
    }
  };

  const buildReminderPDFData = (invoice: Invoice, club: any, finance: any, reminderType: 'R1' | 'R2'): ReminderPDFData => {
    const isSponsoring = invoice.invoice_type === 'sponsoring';
    const isEvent = invoice.invoice_type === 'evenement';
    const reg = invoice.registration;
    const sponsorContactName = invoice.sponsor
      ? [invoice.sponsor.contact_first_name, invoice.sponsor.contact_last_name].filter(Boolean).join(' ')
      : '';
    return {
      reminder_type: reminderType,
      invoice_number: invoice.invoice_number,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date,
      total_amount: invoice.total_amount,
      reminder_fee: invoice.reminder_fee || 0,
      currency: invoice.currency || 'CHF',
      base_amount: invoice.base_amount,
      fratrie_discount_amount: invoice.fratrie_discount_amount || 0,
      member_first_name: invoice.member?.first_name || '',
      member_last_name: invoice.member?.last_name || '',
      member_salutation: invoice.member?.salutation,
      member_address: invoice.member?.address || '',
      member_street_number: invoice.member?.street_number,
      member_postal_code: invoice.member?.postal_code || '',
      member_city: invoice.member?.city || '',
      member_birth_date: invoice.member?.birth_date,
      issue_date_for_age: invoice.issue_date,
      category_name: invoice.category?.name || '',
      season_name: invoice.season?.name || '',
      club_name: club?.club_name || '',
      club_address: club?.club_address || '',
      club_street_number: club?.club_street_number,
      club_postal_code: club?.club_postal_code || '',
      club_city: club?.club_city || '',
      club_email: finance?.email_sender?.trim() || club?.club_email || '',
      club_phone: club?.club_phone,
      logo_url: club?.logo_url,
      qr_iban: finance?.qr_iban || '',
      bank_name: finance?.bank_name || '',
      contact_name: finance?.contact_name,
      contact_phone: finance?.contact_phone,
      payment_delay_days: finance?.payment_delay_days || 30,
      is_sponsoring: isSponsoring,
      sponsor_company_name: isSponsoring ? invoice.sponsor?.company_name : undefined,
      sponsor_contact_name: isSponsoring ? sponsorContactName : undefined,
      sponsor_address: isSponsoring ? invoice.sponsor?.address : undefined,
      sponsor_postal_code: isSponsoring ? invoice.sponsor?.postal_code : undefined,
      sponsor_city: isSponsoring ? invoice.sponsor?.city : undefined,
      is_event: isEvent,
      event_title: isEvent ? reg?.event?.title : undefined,
      event_debtor_first_name: isEvent ? reg?.first_name : undefined,
      event_debtor_last_name: isEvent ? reg?.last_name : undefined,
      event_debtor_address: isEvent ? reg?.address : undefined,
      event_debtor_postal_code: isEvent ? reg?.postal_code : undefined,
      event_debtor_city: isEvent ? reg?.city : undefined,
      event_company: isEvent ? reg?.company : undefined,
      is_confrerie: invoice.invoice_type === 'confrerie',
      confrerie_label: invoice.invoice_type === 'confrerie' ? (club?.confrerie_label || 'Confrérie') : undefined,
      confrerie_member_first_name: invoice.invoice_type === 'confrerie' ? invoice.confrerie_member?.first_name : undefined,
      confrerie_member_last_name: invoice.invoice_type === 'confrerie' ? invoice.confrerie_member?.last_name : undefined,
      confrerie_member_address: invoice.invoice_type === 'confrerie' ? invoice.confrerie_member?.address : undefined,
      confrerie_member_postal_code: invoice.invoice_type === 'confrerie' ? invoice.confrerie_member?.postal_code : undefined,
      confrerie_member_city: invoice.invoice_type === 'confrerie' ? invoice.confrerie_member?.city : undefined,
      confrerie_member_salutation: invoice.invoice_type === 'confrerie' ? invoice.confrerie_member?.salutation : undefined,
      confrerie_member_company: invoice.invoice_type === 'confrerie' ? invoice.confrerie_member?.company : undefined,
    };
  };

  const applyR2FeeAndRefresh = async (invoice: Invoice): Promise<Invoice> => {
    if (invoice.invoice_type === 'sponsoring' || invoice.invoice_type === 'confrerie') return invoice;
    const { error: rpcError } = await supabase.rpc('apply_reminder2_fee', { p_invoice_id: invoice.id });
    if (rpcError) throw new Error(`Erreur frais R2: ${rpcError.message}`);
    const { data: fresh, error: fetchError } = await supabase
      .from('invoices')
      .select(`
        *,
        member:members(
          first_name, last_name, salutation, email, birth_date,
          address, street_number, postal_code, city,
          asf_licence_number, legal_rep1_email, legal_rep2_email
        ),
        sponsor:sponsors(
          company_name, contact_first_name, contact_last_name,
          address, postal_code, city, email
        ),
        confrerie_member:confrerie_members(
          first_name, last_name, email, address, postal_code, city, salutation, company
        ),
        team:teams(name),
        category:team_categories(name, type),
        season:seasons(id, name)
      `)
      .eq('id', invoice.id)
      .single();
    if (fetchError || !fresh) throw new Error('Impossible de recharger la facture après application des frais');
    return fresh as Invoice;
  };

  const markReminderSent = async (invoiceId: string, reminderType: 'R1' | 'R2') => {
    const col = reminderType === 'R1' ? 'reminder1_sent_at' : 'reminder2_sent_at';
    const { error } = await supabase.from('invoices').update({ [col]: new Date().toISOString() }).eq('id', invoiceId);
    if (error) throw new Error(`Erreur marquage ${reminderType}: ${error.message}`);
  };

  const appendReminderWithQR = async (
    mergedPdf: any,
    PDFDocument: any,
    invoice: Invoice,
    club: any,
    finance: any,
    reminderType: 'R1' | 'R2',
  ) => {
    const letterBase64 = await lazyReminderPDF(buildReminderPDFData(invoice, club, finance, reminderType));
    const letterBytes = Uint8Array.from(atob(letterBase64), c => c.charCodeAt(0));
    const letterDoc = await PDFDocument.load(letterBytes);
    const letterPages = await mergedPdf.copyPages(letterDoc, letterDoc.getPageIndices());
    for (const p of letterPages) mergedPdf.addPage(p);

    const qrBase64 = await generateInvoicePDFBase64(buildPDFParams(invoice, club, finance));
    const qrBytes = Uint8Array.from(atob(qrBase64), c => c.charCodeAt(0));
    const qrDoc = await PDFDocument.load(qrBytes);
    const qrPages = await mergedPdf.copyPages(qrDoc, qrDoc.getPageIndices());
    for (const p of qrPages) mergedPdf.addPage(p);
  };

  const printSingleReminder = async (invoiceId: string, reminderType: 'R1' | 'R2') => {
    setPrintingReminder(true);
    setShowPrintReminderConfirm(null);
    try {
      let invoice = invoices.find(inv => inv.id === invoiceId);
      if (!invoice) throw new Error('Facture introuvable');

      if (reminderType === 'R2') {
        invoice = await applyR2FeeAndRefresh(invoice);
      }

      const { data: club } = await supabase.from('club_settings').select('*').maybeSingle();
      const { data: finance } = await supabase.from('finance_config').select('*').maybeSingle();

      const { PDFDocument } = await import('pdf-lib');
      const mergedPdf = await PDFDocument.create();

      await appendReminderWithQR(mergedPdf, PDFDocument, invoice, club, finance, reminderType);

      const mergedBytes = await mergedPdf.save();
      const blob = new Blob([mergedBytes as unknown as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Rappel_${reminderType}_${invoice.invoice_number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      await markReminderSent(invoice.id, reminderType);
      showToast(`Rappel ${reminderType} imprimé et marqué comme envoyé pour ${invoice.invoice_number}`);
      loadInvoices();
    } catch (error: any) {
      showToast(`Erreur: ${error.message}`, 'error');
    } finally {
      setPrintingReminder(false);
    }
  };

  const printBulkReminders = async (reminderType: 'R1' | 'R2') => {
    setShowBulkPrintReminderConfirm(null);
    setPrintingReminder(true);

    try {
      const pool = hasSelection ? selectedInvoices : invoices;
      const eligible = pool.filter(inv =>
        reminderType === 'R1' ? isEligibleForR1(inv) : isEligibleForR2(inv)
      );

      if (eligible.length === 0) {
        showToast(`Aucune facture éligible pour ${reminderType}`, 'error');
        return;
      }

      const { data: club } = await supabase.from('club_settings').select('*').maybeSingle();
      const { data: finance } = await supabase.from('finance_config').select('*').maybeSingle();

      const { PDFDocument } = await import('pdf-lib');
      const mergedPdf = await PDFDocument.create();
      const failed: string[] = [];
      const succeeded: Invoice[] = [];

      setBulkSendProgress({ sent: 0, failed: 0, total: eligible.length });

      for (let i = 0; i < eligible.length; i++) {
        let invoice = eligible[i];
        try {
          if (reminderType === 'R2') {
            invoice = await applyR2FeeAndRefresh(invoice);
          }

          await appendReminderWithQR(mergedPdf, PDFDocument, invoice, club, finance, reminderType);
          succeeded.push(invoice);
        } catch (err: any) {
          failed.push(invoice.invoice_number);
        }
        setBulkSendProgress({ sent: succeeded.length, failed: failed.length, total: eligible.length });
      }

      if (succeeded.length === 0) {
        showToast('Aucun rappel généré', 'error');
        return;
      }

      const mergedBytes = await mergedPdf.save();
      const blob = new Blob([mergedBytes as unknown as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      a.download = `Rappels_${reminderType}_${dateStr}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      for (const inv of succeeded) {
        try {
          await markReminderSent(inv.id, reminderType);
        } catch (err) {
          console.error(`Erreur marquage ${inv.invoice_number}:`, err);
        }
      }

      const suffix = failed.length > 0 ? ` (${failed.length} erreur${failed.length > 1 ? 's' : ''})` : '';
      showToast(`${succeeded.length} rappel${succeeded.length > 1 ? 's' : ''} ${reminderType} imprimé${succeeded.length > 1 ? 's' : ''}${suffix}`);

      setSelectedInvoiceIds(new Set());
      loadInvoices();
    } catch (error: any) {
      showToast(`Erreur: ${error.message}`, 'error');
    } finally {
      setPrintingReminder(false);
      setBulkSendProgress(null);
    }
  };

  const fetchCamtImports = async () => {
    const { data } = await supabase
      .from('camt_imports')
      .select('*')
      .order('imported_at', { ascending: false });
    setCamtImports(data || []);
  };

  const fetchUnmatched = async () => {
    const { data } = await supabase
      .from('camt_unmatched')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    setUnmatchedTransactions(data || []);
  };

  const refreshPendingCount = async () => {
    const { count } = await supabase
      .from('camt_unmatched')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    setPendingCount(count || 0);
  };

  const fetchOpenInvoices = async () => {
    const { data } = await supabase
      .from('invoices')
      .select(`
        id, invoice_number, total_amount,
        member:members(first_name, last_name),
        team:teams(name)
      `)
      .in('status', ['draft', 'sent', 'reminder1_sent', 'reminder2_sent'])
      .order('invoice_number');
    setOpenInvoices(data || []);
  };

  const fetchSeasons = async () => {
    const { data } = await supabase
      .from('seasons')
      .select('id, name')
      .order('start_date', { ascending: false });
    setSeasons(data || []);
  };

  const setManualMatch = (txId: string, invoiceId: string) => {
    setSelectedMatches(prev => ({
      ...prev, [txId]: invoiceId
    }));
  };

  const doManualMatch = async (
    tx: any,
    invoice: any,
    status: string,
    balance: number,
    paidAmount: number
  ) => {
    const today = new Date().toISOString().split('T')[0];

    const { error: invErr } = await supabase
      .from('invoices')
      .update({
        status,
        paid_date: status === 'paid' ? tx.paymentDate : null,
        paid_amount: paidAmount,
        balance,
        updated_at: new Date().toISOString()
      })
      .eq('id', invoice.id);
    if (invErr) { showToast('Erreur: ' + invErr.message, 'error'); return; }

    const { error: payErr } = await supabase.from('payments').insert({
      invoice_id: invoice.id,
      amount: paidAmount,
      payment_date: tx.paymentDate || today,
      qr_reference: tx.qr_reference || null,
      debtor_name: tx.debtor_name,
      camt_import_id: tx.camt_import_id,
      matched_automatically: false
    });
    if (payErr) { showToast('Erreur paiement: ' + payErr.message, 'error'); return; }

    await supabase
      .from('camt_unmatched')
      .update({
        status: 'matched_manually',
        matched_invoice_id: invoice.id,
        notes: `Rapprochement manuel: CHF ${paidAmount} / CHF ${invoice.total_amount}`
      })
      .eq('id', tx.id);

    showToast(
      status === 'partial'
        ? `Facture ${invoice.invoice_number} partiellement payée`
        : `Facture ${invoice.invoice_number} matchée et payée`
    );

    setAmountWarning({ show: false });
    fetchUnmatched();
    loadInvoices();
    refreshPendingCount();
  };

  const applyManualMatch = async (tx: any) => {
    const invoiceId = selectedMatches[tx.id];
    if (!invoiceId) return;

    const invoice = openInvoices.find(i => i.id === invoiceId);
    if (!invoice) return;

    const paidAmount = parseFloat(tx.amount);
    const invoiceAmount = parseFloat(invoice.total_amount);
    const diff = paidAmount - invoiceAmount;
    const tolerance = 0.01;

    let newStatus = 'paid';
    let balance = 0;
    let warningMsg = '';

    if (diff < -tolerance) {
      newStatus = 'partial';
      balance = Math.abs(diff);
      warningMsg = `Paiement partiel — CHF ${paidAmount.toFixed(2)} reçu sur CHF ${invoiceAmount.toFixed(2)}. Solde restant: CHF ${balance.toFixed(2)}. Voulez-vous continuer ?`;
    } else if (diff > tolerance) {
      newStatus = 'paid';
      balance = -diff;
      warningMsg = `Trop-perçu — CHF ${paidAmount.toFixed(2)} reçu pour CHF ${invoiceAmount.toFixed(2)}. Trop-perçu: CHF ${diff.toFixed(2)}. Voulez-vous continuer ?`;
    }

    if (warningMsg) {
      setAmountWarning({
        show: true,
        message: warningMsg,
        tx,
        invoice,
        newStatus,
        balance,
        paidAmount
      });
      return;
    }

    await doManualMatch(tx, invoice, 'paid', 0, paidAmount);
  };

  const forceValidate = async (tx: any) => {
    const { error: invErr } = await supabase
      .from('invoices')
      .update({
        status: 'paid',
        paid_date: tx.paymentDate,
        updated_at: new Date().toISOString()
      })
      .eq('id', tx.invoiceId);
    if (invErr) { showToast('Erreur: ' + invErr.message, 'error'); return; }

    await supabase
      .from('camt_unmatched')
      .update({
        status: 'matched_manually',
        matched_invoice_id: tx.invoiceId,
        notes: `Paiement partiel accepté: CHF ${tx.amount} / CHF ${tx.invoiceAmount}`
      })
      .eq('id', tx.id);

    showToast('Facture validée malgré paiement partiel');
    fetchUnmatched();
    loadInvoices();
    refreshPendingCount();
  };

  const ignoreUnmatched = async (tx: any) => {
    const { error } = await supabase
      .from('camt_unmatched')
      .update({ status: 'ignored' })
      .eq('id', tx.id);
    if (error) { showToast('Erreur: ' + error.message, 'error'); return; }

    showToast('Transaction ignorée');
    fetchUnmatched();
    refreshPendingCount();
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const STATUS_BADGES: Record<string, { label: string; variant: BadgeVariant }> = {
    draft: { label: 'Brouillon', variant: 'neutral' },
    sent: { label: 'Envoyée', variant: 'blue' },
    overdue: { label: 'En retard', variant: 'red' },
    reminder1_sent: { label: 'R1 envoyé', variant: 'orange' },
    reminder2_sent: { label: 'R2 envoyé', variant: 'orange' },
    partial: { label: 'Partiellement payée', variant: 'yellow' },
    paid: { label: 'Payée', variant: 'green' },
    cancelled: { label: 'Annulée', variant: 'neutral' },
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'var(--success-text)';
      case 'overdue': return 'var(--danger)';
      case 'sent': return 'var(--info-text)';
      case 'cancelled': return 'var(--text-muted)';
      default: return 'var(--text-muted)';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'paid': return 'Payée';
      case 'overdue': return 'En retard';
      case 'sent': return 'Envoyée';
      case 'draft': return 'Brouillon';
      case 'cancelled': return 'Annulée';
      default: return status;
    }
  };

  const isOverdue = (invoice: Invoice) => {
    if (invoice.status === 'paid' || invoice.status === 'cancelled') return false;
    if (!invoice.due_date) return false;
    return new Date(invoice.due_date) < new Date();
  };

  const filteredInvoices = invoices.filter(inv => {
    // Season filter:
    if (filterSeason && inv.season?.id !== filterSeason)
      return false;

    // Type filter:
    if (filterType === 'sponsoring') {
      if (inv.invoice_type !== 'sponsoring') return false;
    } else if (filterType === 'evenement') {
      if (inv.invoice_type !== 'evenement') return false;
    } else if (filterType === 'junior') {
      if (inv.invoice_type === 'sponsoring' || inv.invoice_type === 'evenement') return false;
      if (inv.category?.type !== 'junior') return false;
    } else if (filterType === 'active') {
      if (inv.invoice_type === 'sponsoring' || inv.invoice_type === 'evenement') return false;
      if (inv.category?.type !== 'active') return false;
    } else if (filterType === 'confrerie') {
      if (inv.invoice_type !== 'confrerie') return false;
    }

    // Status filter:
    if (filterStatus === 'overdue') {
      if (!isOverdue(inv)) return false;
    } else if (filterStatus) {
      if (inv.status !== filterStatus) return false;
    }

    // Search:
    if (search) {
      const s = search.toLowerCase();
      return (
        inv.invoice_number?.toLowerCase().includes(s) ||
        inv.member?.first_name?.toLowerCase().includes(s) ||
        inv.member?.last_name?.toLowerCase().includes(s) ||
        Boolean(inv.member?.email && inv.member.email.toLowerCase().includes(s)) ||
        Boolean(inv.member?.legal_rep1_email && inv.member.legal_rep1_email.toLowerCase().includes(s)) ||
        Boolean(inv.member?.legal_rep2_email && inv.member.legal_rep2_email.toLowerCase().includes(s)) ||
        Boolean(inv.sponsor?.company_name && inv.sponsor.company_name.toLowerCase().includes(s)) ||
        Boolean(inv.sponsor?.email && inv.sponsor.email.toLowerCase().includes(s)) ||
        Boolean(inv.registration?.first_name && inv.registration.first_name.toLowerCase().includes(s)) ||
        Boolean(inv.registration?.last_name && inv.registration.last_name.toLowerCase().includes(s))
      );
    }

    return true;
  });

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortValue = (inv: Invoice, column: string): string | number | null => {
    switch (column) {
      case 'invoice_number': {
        const num = inv.invoice_number || '';
        const m = num.match(/(\d+)(?!.*\d)/);
        return m ? parseInt(m[1], 10) : null;
      }
      case 'member': {
        if (inv.invoice_type === 'sponsoring') {
          return inv.sponsor?.company_name?.trim().toLowerCase() || null;
        }
        if (inv.invoice_type === 'evenement') {
          const eln = inv.registration?.last_name?.trim() || '';
          const efn = inv.registration?.first_name?.trim() || '';
          if (!eln && !efn) return null;
          return `${eln.toLowerCase()} ${efn.toLowerCase()}`;
        }
        const ln = inv.member?.last_name?.trim() || '';
        const fn = inv.member?.first_name?.trim() || '';
        if (!ln && !fn) return null;
        return `${ln.toLowerCase()} ${fn.toLowerCase()}`;
      }
      case 'team':
        return inv.team?.name?.trim().toLowerCase() || null;
      case 'total_amount':
        return typeof inv.total_amount === 'number' ? inv.total_amount : null;
      default:
        return null;
    }
  };

  const sortedFilteredInvoices = sortColumn && sortDirection
    ? [...filteredInvoices].sort((a, b) => {
        const av = getSortValue(a, sortColumn);
        const bv = getSortValue(b, sortColumn);
        const aNull = av === null || av === '';
        const bNull = bv === null || bv === '';
        if (aNull && bNull) return 0;
        if (aNull) return 1;
        if (bNull) return -1;
        let cmp: number;
        if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
        else cmp = String(av).localeCompare(String(bv), 'fr');
        return sortDirection === 'asc' ? cmp : -cmp;
      })
    : filteredInvoices;

  const renderSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return <ChevronsUpDown size={13} style={{ opacity: 0.4, marginLeft: '4px', verticalAlign: 'middle' }} />;
    }
    return sortDirection === 'asc'
      ? <ChevronUp size={13} style={{ marginLeft: '4px', verticalAlign: 'middle' }} />
      : <ChevronDown size={13} style={{ marginLeft: '4px', verticalAlign: 'middle' }} />;
  };

  const getCount = (status: string) => {
    if (status === 'overdue')
      return invoices.filter(isOverdue).length;
    return invoices.filter(i => i.status === status).length;
  };

  const isSelected = (id: string) => selectedInvoiceIds.has(id);
  const toggleSelection = (id: string) => {
    setSelectedInvoiceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAllVisible = () => {
    setSelectedInvoiceIds(new Set(filteredInvoices.map(inv => inv.id)));
  };
  const deselectAll = () => setSelectedInvoiceIds(new Set());

  const visibleIds = filteredInvoices.map(inv => inv.id);
  const visibleSelectedCount = visibleIds.filter(id => selectedInvoiceIds.has(id)).length;
  const selectAllChecked = visibleIds.length > 0 && visibleSelectedCount === visibleIds.length;
  const selectAllIndeterminate = visibleSelectedCount > 0 && !selectAllChecked;

  const selectedInvoices = invoices.filter(inv => selectedInvoiceIds.has(inv.id));
  const hasSelection = selectedInvoiceIds.size > 0;

  const draftAllCount = invoices.filter(inv => inv.status === 'draft').length;
  const draftSelectedCount = selectedInvoices.filter(inv => inv.status === 'draft').length;
  const r1AllCount = invoices.filter(isEligibleForR1).length;
  const r1SelectedCount = selectedInvoices.filter(isEligibleForR1).length;
  const r2AllCount = invoices.filter(isEligibleForR2).length;
  const r2SelectedCount = selectedInvoices.filter(isEligibleForR2).length;

  const draftActionCount = hasSelection ? draftSelectedCount : draftAllCount;
  const r1ActionCount = hasSelection ? r1SelectedCount : r1AllCount;
  const r2ActionCount = hasSelection ? r2SelectedCount : r2AllCount;

  const exportExcel = async () => {
    try {
    const invoicesData = filteredInvoices.map(inv => {
      const categoryId = (inv as any).category_id;
      const compte = categoryId ? (feeComptes[categoryId] || '') : '';
      const adresse = inv.invoice_type === 'sponsoring'
        ? [inv.sponsor?.address, inv.sponsor?.postal_code, inv.sponsor?.city].filter(Boolean).join(' ')
        : [inv.member?.address, inv.member?.street_number, inv.member?.postal_code, inv.member?.city].filter(Boolean).join(' ');
      return {
        'N° Facture': inv.invoice_number,
        'Date facture': inv.issue_date,
        'Statut': inv.status,
        'Nom': inv.invoice_type === 'sponsoring' ? inv.sponsor?.company_name || '' : inv.invoice_type === 'evenement' ? inv.registration?.last_name || '' : inv.member?.last_name || '',
        'Prénom': inv.invoice_type === 'sponsoring' ? '' : inv.invoice_type === 'evenement' ? inv.registration?.first_name || '' : inv.member?.first_name || '',
        'Adresse complète': adresse,
        'Équipe': inv.team?.name || '',
        'Catégorie': inv.category?.name || '',
        'Compte': compte,
        'Montant': inv.total_amount
      };
    });

    const teamMap: Record<string, { facture: number; encaisse: number; retard: number; annule: number }> = {};
    filteredInvoices.forEach(inv => {
      const team = inv.team?.name || 'Sans équipe';
      if (!teamMap[team]) teamMap[team] = { facture: 0, encaisse: 0, retard: 0, annule: 0 };
      const amt = inv.total_amount || 0;
      if (inv.status === 'cancelled') {
        teamMap[team].annule += amt;
      } else {
        teamMap[team].facture += amt;
        if (inv.status === 'paid') teamMap[team].encaisse += amt;
        else if (isOverdue(inv)) teamMap[team].retard += amt;
      }
    });

    const teamSummary = Object.entries(teamMap).map(([equipe, vals]) => ({
      'Équipe': equipe,
      'Montant facturé': vals.facture,
      'Montant encaissé': vals.encaisse,
      'Montant en retard': vals.retard,
      'Montant annulé': vals.annule
    }));

    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(invoicesData);
    XLSX.utils.book_append_sheet(wb, ws1, 'Factures');
    const ws2 = XLSX.utils.json_to_sheet(teamSummary);
    XLSX.utils.book_append_sheet(wb, ws2, 'Par équipe');
    XLSX.writeFile(wb, `factures-${new Date().getFullYear()}.xlsx`);
    } catch (e) {
      console.error(e);
      showToast("L'export n'a pas pu être généré. Rechargez la page et réessayez.", 'error');
    }
  };

  const batchPrintInvoices = async () => {
    try {
    const { PDFDocument, rgb } = await import('pdf-lib');

    let scopeInvoices = [...filteredInvoices];
    if (batchPrintScope === 'teams' && batchPrintSelectedTeams.length > 0) {
      scopeInvoices = scopeInvoices.filter(inv => {
        const teamName = inv.team?.name || '';
        return batchPrintSelectedTeams.includes(teamName);
      });
    }
    if (batchPrintScope === 'events' && batchPrintSelectedEvents.length > 0) {
      scopeInvoices = scopeInvoices.filter(inv => {
        if (inv.invoice_type !== 'evenement' || !inv.registration?.event) return false;
        const eventKey = `${inv.registration.event.title}|||${inv.registration.event.date}`;
        return batchPrintSelectedEvents.includes(eventKey);
      });
    }

    const teamGroups = new Map<string, Invoice[]>();
    const eventGroups = new Map<string, Invoice[]>();
    const noTeam: Invoice[] = [];
    const sponsors: Invoice[] = [];

    for (const inv of scopeInvoices) {
      if (inv.invoice_type === 'sponsoring') {
        sponsors.push(inv);
      } else if (inv.invoice_type === 'evenement') {
        if (batchPrintScope === 'events' && inv.registration?.event) {
          const eventKey = inv.registration.event.title;
          if (!eventGroups.has(eventKey)) eventGroups.set(eventKey, []);
          eventGroups.get(eventKey)!.push(inv);
        } else {
          noTeam.push(inv);
        }
      } else if (!inv.team?.name) {
        noTeam.push(inv);
      } else {
        const t = inv.team.name;
        if (!teamGroups.has(t)) teamGroups.set(t, []);
        teamGroups.get(t)!.push(inv);
      }
    }

    const sortedTeams = [...teamGroups.keys()].sort((a, b) => a.localeCompare(b, 'fr'));
    const sortedEvents = [...eventGroups.keys()].sort((a, b) => a.localeCompare(b, 'fr'));
    const sortByName = (a: Invoice, b: Invoice) => {
      const getName = (inv: Invoice) => {
        if (inv.invoice_type === 'sponsoring') return inv.sponsor?.company_name || '';
        if (inv.invoice_type === 'evenement') return inv.registration?.last_name || inv.registration?.company || '';
        return inv.member?.last_name || '';
      };
      return getName(a).localeCompare(getName(b), 'fr');
    };

    const orderedGroups: { label: string; invoices: Invoice[] }[] = [];
    for (const team of sortedTeams) {
      const invs = teamGroups.get(team)!;
      invs.sort(sortByName);
      orderedGroups.push({ label: team, invoices: invs });
    }
    if (noTeam.length > 0) {
      noTeam.sort(sortByName);
      orderedGroups.push({ label: 'Sans équipe', invoices: noTeam });
    }
    if (sponsors.length > 0) {
      sponsors.sort(sortByName);
      orderedGroups.push({ label: 'Sponsors', invoices: sponsors });
    }
    for (const eventTitle of sortedEvents) {
      const invs = eventGroups.get(eventTitle)!;
      invs.sort(sortByName);
      orderedGroups.push({ label: eventTitle, invoices: invs });
    }

    const totalCount = orderedGroups.reduce((s, g) => s + g.invoices.length, 0);
    if (totalCount === 0) {
      showToast('Aucune facture à imprimer dans cette sélection', 'error');
      return;
    }

    setBatchPrintProgress({ current: 0, total: totalCount });

    const { data: club } = await supabase.from('club_settings').select('*').maybeSingle();
    const { data: finance } = await supabase.from('finance_config').select('*').maybeSingle();

    const mergedPdf = await PDFDocument.create();
    const failed: string[] = [];
    let processed = 0;
    const seasonLabel = scopeInvoices[0]?.season?.name || '';

    for (const group of orderedGroups) {
      if (batchPrintSeparators) {
        const sepPage = mergedPdf.addPage();
        const { width, height } = sepPage.getSize();
        const font = await mergedPdf.embedFont('Helvetica-Bold' as any);
        const fontNormal = await mergedPdf.embedFont('Helvetica' as any);

        const maxWidth = width * 0.85;
        const wrapText = (text: string, f: any, maxSize: number, maxLines: number): { lines: string[]; fontSize: number } => {
          let fontSize = maxSize;
          while (fontSize >= 10) {
            const words = text.split(' ');
            const lines: string[] = [];
            let current = '';
            for (const word of words) {
              const test = current ? `${current} ${word}` : word;
              if (f.widthOfTextAtSize(test, fontSize) <= maxWidth) {
                current = test;
              } else {
                if (current) lines.push(current);
                current = word;
              }
            }
            if (current) lines.push(current);
            if (lines.length <= maxLines) {
              const allFit = lines.every(l => f.widthOfTextAtSize(l, fontSize) <= maxWidth);
              if (allFit) return { lines, fontSize };
            }
            fontSize -= 1;
          }
          const words = text.split(' ');
          const lines: string[] = [];
          let current = '';
          for (const word of words) {
            const test = current ? `${current} ${word}` : word;
            if (f.widthOfTextAtSize(test, 10) <= maxWidth) {
              current = test;
            } else {
              if (current) lines.push(current);
              current = word;
            }
          }
          if (current) lines.push(current);
          return { lines: lines.slice(0, maxLines), fontSize: 10 };
        };

        const { lines: titleLines, fontSize: titleSize } = wrapText(group.label, font, 28, 3);
        const lineHeight = titleSize * 1.3;
        const titleBlockHeight = titleLines.length * lineHeight;
        let yPos = height / 2 + titleBlockHeight / 2 + 20;

        for (const line of titleLines) {
          const lw = font.widthOfTextAtSize(line, titleSize);
          sepPage.drawText(line, {
            x: width / 2 - lw / 2,
            y: yPos,
            size: titleSize,
            font,
            color: rgb(0.15, 0.15, 0.15),
          });
          yPos -= lineHeight;
        }

        yPos -= 12;
        const countLine = `${group.invoices.length} facture${group.invoices.length > 1 ? 's' : ''}`;
        sepPage.drawText(countLine, {
          x: width / 2 - fontNormal.widthOfTextAtSize(countLine, 16) / 2,
          y: yPos,
          size: 16,
          font: fontNormal,
          color: rgb(0.4, 0.4, 0.4),
        });
        if (seasonLabel) {
          yPos -= 30;
          sepPage.drawText(seasonLabel, {
            x: width / 2 - fontNormal.widthOfTextAtSize(seasonLabel, 14) / 2,
            y: yPos,
            size: 14,
            font: fontNormal,
            color: rgb(0.5, 0.5, 0.5),
          });
        }
      }

      for (const invoice of group.invoices) {
        processed++;
        setBatchPrintProgress({ current: processed, total: totalCount });
        try {
          const base64 = await generateInvoicePDFBase64(buildPDFParams(invoice, club, finance));
          const pdfBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
          const srcDoc = await PDFDocument.load(pdfBytes);
          const pages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices());
          for (const page of pages) mergedPdf.addPage(page);
        } catch (err) {
          failed.push(invoice.invoice_number);
        }
      }
    }

    const mergedBytes = await mergedPdf.save();
    const blob = new Blob([mergedBytes as unknown as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    const saison = seasonLabel.replace(/\s+/g, '-') || 'all';
    a.download = `Factures_${saison}_${dateStr}.pdf`;
    a.click();
    URL.revokeObjectURL(url);

    if (failed.length > 0) {
      showToast(`Erreur pour ${failed.length} facture(s) : ${failed.join(', ')}`, 'error');
    } else {
      showToast(`PDF généré avec succès (${totalCount} factures)`);
    }
    } catch (e) {
      console.error(e);
      showToast("Le PDF n'a pas pu être généré. Rechargez la page et réessayez.", 'error');
    } finally {
      setBatchPrintProgress(null);
      setShowBatchPrintModal(false);
    }
  };

  const batchPrintTeams = (() => {
    const teams = new Set<string>();
    for (const inv of filteredInvoices) {
      if (inv.team?.name) teams.add(inv.team.name);
    }
    return [...teams].sort((a, b) => a.localeCompare(b, 'fr'));
  })();

  const batchPrintEvents = (() => {
    const evts = new Map<string, string>();
    for (const inv of filteredInvoices) {
      if (inv.invoice_type === 'evenement' && inv.registration?.event) {
        const key = `${inv.registration.event.title}|||${inv.registration.event.date}`;
        if (!evts.has(key)) {
          const d = inv.registration.event.date
            ? new Date(inv.registration.event.date).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : '';
          evts.set(key, `${inv.registration.event.title}${d ? ` (${d})` : ''}`);
        }
      }
    }
    return [...evts.entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr'));
  })();

  const batchPrintCount = (() => {
    if (batchPrintScope === 'all') return filteredInvoices.length;
    if (batchPrintScope === 'events') {
      if (batchPrintSelectedEvents.length === 0) return 0;
      return filteredInvoices.filter(inv => {
        if (inv.invoice_type !== 'evenement' || !inv.registration?.event) return false;
        const eventKey = `${inv.registration.event.title}|||${inv.registration.event.date}`;
        return batchPrintSelectedEvents.includes(eventKey);
      }).length;
    }
    if (batchPrintSelectedTeams.length === 0) return 0;
    return filteredInvoices.filter(inv => batchPrintSelectedTeams.includes(inv.team?.name || '')).length;
  })();

  const handleCamtImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const xmlFiles: Array<{ name: string; content: string }> = [];

    for (const file of files) {
      if (file.name.toLowerCase().endsWith('.zip')) {
        const buf = new Uint8Array(await file.arrayBuffer());
        const unzipped = unzipSync(buf);
        for (const [path, data] of Object.entries(unzipped)) {
          if (path.toLowerCase().endsWith('.xml') && !path.startsWith('__MACOSX')) {
            const xmlContent = strFromU8(data);
            xmlFiles.push({ name: `${file.name} → ${path.split('/').pop()}`, content: xmlContent });
          }
        }
      } else {
        const text = await file.text();
        xmlFiles.push({ name: file.name, content: text });
      }
    }

    if (xmlFiles.length === 0) return;

    // Duplicate detection by filename:
    for (const xf of xmlFiles) {
      const { data: rows } = await supabase
        .from('camt_imports')
        .select('id, imported_at, filename')
        .eq('filename', xf.name)
        .limit(1);

      if (rows && rows.length > 0) {
        const importedDate = new Date(rows[0].imported_at).toLocaleDateString('fr-CH', {
          day: '2-digit', month: '2-digit', year: 'numeric'
        });
        setShowDuplicateModal({ filename: xf.name, importDate: importedDate });
        e.target.value = '';
        return;
      }
    }

    // Pre-parse to get transaction count:
    let transactionCount = 0;
    for (const xf of xmlFiles) {
      const result = parseCamtXml(xf.content);
      transactionCount += result.transactions.length;
    }

    setShowCamtConfirm({ xmlFiles, transactionCount });
    e.target.value = '';
  };

  const executeCamtImport = async (xmlFiles: Array<{ name: string; content: string }>) => {
    setShowCamtConfirm(null);
    setImporting(true);
    let totalMatched = 0;
    let totalUnmatched = 0;
    let totalDuplicates = 0;
    let totalReversals = 0;
    const fileStats: FileImportStats[] = [];
    const unmatchedList: Array<{
      debtorName: string;
      amount: number;
      ref: string;
      addInfo: string;
      paymentDate: string;
    }> = [];

    const { data: user } = await supabase.auth.getUser();

    for (const xf of xmlFiles) {
      const { data: importRecord } = await supabase
        .from('camt_imports')
        .insert({
          filename: xf.name,
          imported_by: user.user?.id,
          total_transactions: 0,
          matched_count: 0,
          unmatched_count: 0
        })
        .select('id')
        .single();

      const parsed = parseCamtXml(xf.content);
      let fileMatched = 0;
      let fileUnmatched = 0;
      let fileDuplicates = 0;
      const fileReversals = parsed.skippedReversals;

      for (const tx of parsed.transactions) {
        const { amount, debtorName, ref, addInfo, paymentDate, transactionId } = tx;

        // Deduplication: check if this transaction was already imported
        if (transactionId) {
          const { data: existing } = await supabase
            .from('payments')
            .select('id')
            .eq('camt_transaction_id', transactionId)
            .limit(1);
          if (existing && existing.length > 0) {
            fileDuplicates++;
            continue;
          }
        }

        // Try to match invoice:
        let matchedInvoice: any = null;

        // Match 1: by RF/QRR reference:
        if (ref.startsWith('RF') || ref.length >= 20) {
          const { data } = await supabase
            .from('invoices')
            .select('id, invoice_number, total_amount, status')
            .eq('qr_reference', ref)
            .maybeSingle();
          if (data) matchedInvoice = data;
        }

        // Match 2: by invoice number in addInfo:
        if (!matchedInvoice) {
          const invoiceNumMatch = addInfo.match(/FA\d{4}-\d{4}/);
          if (invoiceNumMatch) {
            const { data } = await supabase
              .from('invoices')
              .select('id, invoice_number, total_amount, status')
              .eq('invoice_number', invoiceNumMatch[0])
              .maybeSingle();
            if (data) matchedInvoice = data;
          }
        }

        // Match 3: by amount + debtor name:
        if (!matchedInvoice && amount > 0) {
          const { data: candidates } = await supabase
            .from('invoices')
            .select(`
              id, invoice_number, total_amount, status,
              member:members(first_name, last_name)
            `)
            .eq('total_amount', amount)
            .in('status', ['sent', 'draft', 'reminder1_sent', 'reminder2_sent']);

          if (candidates?.length === 1) {
            matchedInvoice = candidates[0];
          }
        }

        if (matchedInvoice) {
          if (matchedInvoice.status !== 'paid') {
            const invoiceAmount = parseFloat(matchedInvoice.total_amount);
            const paidAmount = parseFloat(amount.toString());
            const diff = paidAmount - invoiceAmount;
            const tolerance = 0.01;

            const paymentRow = {
              invoice_id: matchedInvoice.id,
              amount: paidAmount,
              payment_date: paymentDate,
              qr_reference: ref || null,
              debtor_name: debtorName,
              import_batch: xf.name,
              camt_import_id: importRecord?.id,
              camt_transaction_id: transactionId || null,
              matched_automatically: Math.abs(diff) <= tolerance
            };

            if (Math.abs(diff) <= tolerance) {
              const { error: e1 } = await supabase
                .from('invoices')
                .update({
                  status: 'paid',
                  paid_date: paymentDate,
                  paid_amount: paidAmount,
                  balance: 0,
                  updated_at: new Date().toISOString()
                })
                .eq('id', matchedInvoice.id);

              const { error: e2 } = await supabase.from('payments').insert(paymentRow);

              if (e2 && (e2 as any).code === '23505') {
                fileDuplicates++;
              } else if (e1 || e2) {
                fileUnmatched++;
              } else {
                fileMatched++;
              }

            } else if (diff < 0) {
              const { error: e1 } = await supabase
                .from('invoices')
                .update({
                  status: 'partial',
                  paid_amount: paidAmount,
                  balance: Math.abs(diff),
                  updated_at: new Date().toISOString()
                })
                .eq('id', matchedInvoice.id);

              const { error: e2 } = await supabase.from('payments').insert(paymentRow);

              if (e2 && (e2 as any).code === '23505') {
                fileDuplicates++;
              } else {
                if (e1 || e2) console.error('CAMT partial payment error:', e1 || e2);
                fileUnmatched++;
                unmatchedList.push({
                  debtorName,
                  amount: paidAmount,
                  ref,
                  addInfo,
                  paymentDate,
                  type: 'partial',
                  invoiceNumber: matchedInvoice.invoice_number,
                  invoiceAmount,
                  diff: Math.abs(diff),
                  invoiceId: matchedInvoice.id
                } as any);
              }

            } else {
              const { error: e1 } = await supabase
                .from('invoices')
                .update({
                  status: 'paid',
                  paid_date: paymentDate,
                  paid_amount: paidAmount,
                  balance: -diff,
                  updated_at: new Date().toISOString()
                })
                .eq('id', matchedInvoice.id);

              const { error: e2 } = await supabase.from('payments').insert(paymentRow);

              if (e2 && (e2 as any).code === '23505') {
                fileDuplicates++;
              } else {
                if (e1 || e2) console.error('CAMT overpayment error:', e1 || e2);
                fileUnmatched++;
                unmatchedList.push({
                  debtorName,
                  amount: paidAmount,
                  ref,
                  addInfo,
                  paymentDate,
                  type: 'overpaid',
                  invoiceNumber: matchedInvoice.invoice_number,
                  invoiceAmount,
                  diff,
                  invoiceId: matchedInvoice.id
                } as any);
              }
            }
          }
        } else {
          fileUnmatched++;
          unmatchedList.push({
            debtorName,
            amount,
            ref,
            addInfo,
            paymentDate
          });
        }
      }

      totalMatched += fileMatched;
      totalUnmatched += fileUnmatched;
      totalDuplicates += fileDuplicates;
      totalReversals += fileReversals;

      fileStats.push({
        filename: xf.name,
        format: parsed.format,
        total: parsed.transactions.length + fileReversals,
        matched: fileMatched,
        unmatched: fileUnmatched,
        duplicates: fileDuplicates,
        reversals: fileReversals
      });

      if (importRecord?.id) {
        await supabase
          .from('camt_imports')
          .update({
            total_transactions: parsed.transactions.length + fileReversals,
            matched_count: fileMatched,
            unmatched_count: fileUnmatched
          })
          .eq('id', importRecord.id);
      }

      // Store unmatched for this file in DB
      if (importRecord?.id) {
        const fileUnmatchedItems = unmatchedList.slice(
          unmatchedList.length - fileUnmatched
        );
        for (const unmatched of fileUnmatchedItems) {
          await supabase
            .from('camt_unmatched')
            .insert({
              camt_import_id: importRecord.id,
              debtor_name: unmatched.debtorName,
              amount: unmatched.amount,
              payment_date: unmatched.paymentDate,
              qr_reference: unmatched.ref || null,
              additional_info: unmatched.addInfo || null,
              status: 'pending'
            });
        }
      }
    }

    setImporting(false);

    setImportReport({
      matched: totalMatched,
      unmatched: totalUnmatched,
      duplicates: totalDuplicates,
      reversals: totalReversals,
      fileStats,
      unmatchedList
    });
    setShowImportReport(true);

    loadInvoices();
    fetchCamtImports();
    fetchUnmatched();
    refreshPendingCount();
  };

  const thStyle = {
    padding: '12px 16px',
    color: 'var(--text-muted)',
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    textAlign: 'left' as const
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const badge = STATUS_BADGES[status];
    if (!badge) return <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{status}</span>;

    return <Badge variant={badge.variant}>{badge.label}</Badge>;
  };

  if (moduleLoading) {
    return <div style={{ color: 'var(--text-primary)', padding: '32px' }}>Chargement...</div>;
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
      {showDuplicateModal && (
        <StandardModal
          isOpen={!!showDuplicateModal}
          onClose={() => setShowDuplicateModal(null)}
          title="Fichier déjà importé"
          width="440px"
        >
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
              Le fichier <strong style={{ color: 'var(--text-primary)' }}>{showDuplicateModal.filename}</strong> a déjà été importé le {showDuplicateModal.importDate}.
            </p>
            <Button onClick={() => setShowDuplicateModal(null)} style={{ width: '100%' }}>
              OK
            </Button>
        </StandardModal>
      )}

      <div style={{ marginBottom: '20px' }}>
        <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
          <Wallet size={22} aria-hidden="true" style={{ color: 'var(--accent)' }} />
          Finances
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>Facturation et paiements</p>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        marginBottom: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 style={{
            color: 'var(--text-primary)', margin: 0,
            fontSize: '18px', whiteSpace: 'nowrap'
          }}>
            Factures
          </h2>

          <div style={{ width: '400px' }}>
            <SearchInput
              value={search}
              onChange={setSearch}
              inputSize="lg"
              placeholder="Rechercher par nom, prénom ou n° facture..."
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Download size={14} />}
            onClick={exportExcel}
          >
            Exporter Excel
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Printer size={14} />}
            onClick={() => setShowBatchPrintModal(true)}
          >
            Imprimer PDF
          </Button>
        </div>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '16px',
        flexWrap: 'wrap'
      }}>
        {!moduleLoading && canEdit && (
          <>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Upload size={14} />}
              onClick={() => camtInputRef.current?.click()}
              disabled={importing}
              loading={importing}
            >
              Importer CAMT
            </Button>
            <input
              ref={camtInputRef}
              type="file"
              accept=".xml,.zip"
              multiple
              style={{ display: 'none' }}
              onChange={handleCamtImport}
            />

            <Button
              variant="secondary"
              size="sm"
              leftIcon={<FolderOpen size={14} />}
              onClick={() => setShowImportHistory(true)}
            >
              Fichiers importés
            </Button>

            <Button
              variant={pendingCount > 0 ? 'danger' : 'secondary'}
              size="sm"
              leftIcon={<Wrench size={14} />}
              onClick={() => setShowUnmatched(true)}
            >
              Traitements manuels
              {pendingCount > 0 && (
                <span style={{
                  background: 'var(--warning)', color: 'black',
                  borderRadius: '99px', padding: '1px 7px',
                  fontSize: '11px', fontWeight: '900',
                  marginLeft: '6px'
                }}>
                  {pendingCount}
                </span>
              )}
            </Button>
          </>
        )}

        {canEdit && (() => {
          const disabled = sendingBulk || draftActionCount === 0;
          const ineligibleSelection = hasSelection && draftActionCount === 0;
          return (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Send size={14} />}
              onClick={() => setShowBulkConfirm(true)}
              disabled={disabled}
              loading={sendingBulk}
              title={ineligibleSelection ? "Aucune facture sélectionnée n'est éligible" : undefined}
            >
              Envoyer factures{hasSelection ? ` (${draftActionCount})` : ''}
            </Button>
          );
        })()}

        {canEdit && (() => {
          const disabled = sendingBulkReminders || r1ActionCount === 0;
          const ineligibleSelection = hasSelection && r1ActionCount === 0;
          return (
            <Button
              variant="danger"
              size="sm"
              leftIcon={<AlertTriangle size={14} />}
              onClick={() => setShowBulkReminderConfirm('R1')}
              disabled={disabled}
              title={ineligibleSelection ? "Aucune facture sélectionnée n'est éligible" : undefined}
            >
              Rappels R1 ({r1ActionCount})
            </Button>
          );
        })()}

        {canEdit && (() => {
          const disabled = sendingBulkReminders || r2ActionCount === 0;
          const ineligibleSelection = hasSelection && r2ActionCount === 0;
          return (
            <Button
              variant="danger"
              size="sm"
              leftIcon={<Flag size={14} />}
              onClick={() => setShowBulkReminderConfirm('R2')}
              disabled={disabled}
              title={ineligibleSelection ? "Aucune facture sélectionnée n'est éligible" : undefined}
            >
              Rappels R2 ({r2ActionCount})
            </Button>
          );
        })()}

        {canEdit && (() => {
          const r1Count = (hasSelection ? selectedInvoices : invoices).filter(isEligibleForR1).length;
          const r2Count = (hasSelection ? selectedInvoices : invoices).filter(isEligibleForR2).length;
          const totalCount = r1Count + r2Count;
          const disabled = printingReminder || totalCount === 0;
          return (
            <>
              {r1Count > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Printer size={14} />}
                  onClick={() => setShowBulkPrintReminderConfirm('R1')}
                  disabled={disabled}
                  title="Imprimer les rappels R1 (PDF)"
                >
                  Imprimer R1 ({r1Count})
                </Button>
              )}
              {r2Count > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Printer size={14} />}
                  onClick={() => setShowBulkPrintReminderConfirm('R2')}
                  disabled={disabled}
                  title="Imprimer les rappels R2 (PDF)"
                >
                  Imprimer R2 ({r2Count})
                </Button>
              )}
            </>
          );
        })()}
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <select
            value={filterSeason}
            onChange={e => setFilterSeason(e.target.value)}
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '8px 12px',
              color: 'var(--text-primary)',
              fontSize: '14px',
              minWidth: '150px'
            }}>
            <option value="">Toutes les saisons</option>
            {seasons.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '8px 12px',
              color: 'var(--text-primary)',
              fontSize: '14px',
              minWidth: '150px'
            }}>
            <option value="">Tous les types</option>
            <option value="junior">Juniors</option>
            <option value="active">Actifs</option>
            <option value="sponsoring">Sponsors</option>
            <option value="evenement">Événements</option>
            <option value="confrerie">{confrerieLabel}</option>
          </select>
        </div>

        <FilterButtonGroup
          options={[
            { id: '', label: 'Toutes' },
            { id: 'draft', label: 'Brouillons', count: getCount('draft') },
            { id: 'sent', label: 'Envoyées', count: getCount('sent') },
            { id: 'partial', label: 'Partielles', count: getCount('partial') },
            { id: 'overdue', label: 'En retard', count: getCount('overdue') },
            { id: 'paid', label: 'Payées', count: getCount('paid') },
            { id: 'cancelled', label: 'Annulées', count: getCount('cancelled') },
          ]}
          selectedId={filterStatus}
          onChange={setFilterStatus}
        />
      </div>

      <div style={{
        width: '100%',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-lg)'
      }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            Chargement...
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            {search ? 'Aucune facture trouvée' : 'Aucune facture'}
          </div>
        ) : (
          <DataTableShell bare maxHeight="calc(100vh - 320px)">
          <table style={{
            width: '100%',
            borderCollapse: 'collapse'
          }}>
            <thead style={{ background: 'var(--table-header-bg)' }}>
              <tr style={{
                borderBottom: '1px solid var(--border-color)'
              }}>
                <th style={{ ...thStyle, width: '36px', padding: '12px 8px' }}>
                  <input
                    type="checkbox"
                    checked={selectAllChecked}
                    ref={el => { if (el) el.indeterminate = selectAllIndeterminate; }}
                    onChange={() => {
                      if (selectAllChecked || selectAllIndeterminate) deselectAll();
                      else selectAllVisible();
                    }}
                    aria-label="Tout sélectionner"
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th
                  style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('invoice_number')}
                >
                  N° Facture{renderSortIcon('invoice_number')}
                </th>
                <th style={{ ...thStyle, whiteSpace: 'nowrap' }}>Échéance</th>
                <th
                  style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('member')}
                >
                  Destinataire{renderSortIcon('member')}
                </th>
                <th
                  style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('team')}
                >
                  Équipe{renderSortIcon('team')}
                </th>
                <th
                  style={{ ...thStyle, textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('total_amount')}
                >
                  Montant{renderSortIcon('total_amount')}
                </th>
                <th style={{ ...thStyle, textAlign: 'center' }}>
                  Statut
                </th>
                <th style={{ ...thStyle, textAlign: 'center' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedFilteredInvoices.map(invoice => (
                <>
                  <tr key={invoice.id} style={{
                    background: invoice.status === 'cancelled'
                      ? 'var(--danger-soft)'
                      : isOverdue(invoice)
                      ? 'var(--danger-soft)'
                      : 'transparent',
                    borderLeft: invoice.status === 'cancelled'
                      ? '3px solid var(--danger)'
                      : 'none',
                    borderBottom: `1px solid ${isOverdue(invoice)
                      ? 'var(--danger-soft)'
                      : 'var(--border-color)'}`,
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={e => {
                    if (invoice.status !== 'cancelled' && !isOverdue(invoice))
                      e.currentTarget.style.background = 'var(--bg-hover)';
                  }}
                  onMouseLeave={e => {
                    if (invoice.status !== 'cancelled' && !isOverdue(invoice))
                      e.currentTarget.style.background = 'transparent';
                  }}>
                    <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected(invoice.id)}
                        onChange={() => toggleSelection(invoice.id)}
                        aria-label={`Sélectionner ${invoice.invoice_number}`}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{
                      padding: '12px 16px',
                      color: 'var(--text-primary)', fontWeight: '700',
                      fontSize: '13px', whiteSpace: 'nowrap'
                    }}>
                      {invoice.invoice_number}
                    </td>
                    <td style={{
                      padding: '12px 16px',
                      fontSize: '13px',
                      whiteSpace: 'nowrap',
                      color: (invoice.status === 'sent' && invoice.due_date && new Date(invoice.due_date) < new Date(new Date().toDateString()))
                        ? 'var(--danger)'
                        : 'var(--text-muted)',
                      fontWeight: (invoice.status === 'sent' && invoice.due_date && new Date(invoice.due_date) < new Date(new Date().toDateString())) ? '600' : 'normal'
                    }}>
                      {invoice.due_date
                        ? new Date(invoice.due_date).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
                        : '—'}
                    </td>
                    <td style={{ padding: '12px 16px',
                      color: 'var(--text-primary)', fontSize: '14px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        {invoice.invoice_type === 'sponsoring'
                          ? invoice.sponsor?.company_name || '—'
                          : invoice.invoice_type === 'evenement'
                            ? (invoice.registration?.company || `${invoice.registration?.first_name || ''} ${invoice.registration?.last_name || ''}`.trim()) || '—'
                            : invoice.invoice_type === 'confrerie'
                              ? `${invoice.confrerie_member?.first_name || ''} ${invoice.confrerie_member?.last_name || ''}`.trim() || '—'
                              : `${invoice.member?.first_name || ''} ${invoice.member?.last_name || ''}`}
                        {invoice.invoice_type === 'sponsoring' && (
                          <Badge variant="blue">Sponsor</Badge>
                        )}
                        {invoice.invoice_type === 'evenement' && (
                          <Badge variant="violet">Événement</Badge>
                        )}
                        {invoice.invoice_type === 'confrerie' && (
                          <Badge variant="green">{confrerieLabel}</Badge>
                        )}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px',
                      color: 'var(--text-muted)', fontSize: '12px',
                      maxWidth: '200px' }}>
                      {invoice.team?.name || '—'}
                    </td>
                    <td style={{ padding: '12px 16px',
                      color: 'var(--text-primary)', fontWeight: '700',
                      textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div>
                        CHF {invoice.total_amount?.toFixed(2)}
                      </div>
                      {(invoice.paid_amount &&
                        invoice.paid_amount !== invoice.total_amount) && (
                        <div style={{
                          fontSize: '11px',
                          color: invoice.balance && invoice.balance > 0 ? 'var(--danger)' : 'var(--accent)',
                          marginTop: '2px'
                        }}>
                          {invoice.balance && invoice.balance > 0
                            ? `Solde: CHF ${invoice.balance?.toFixed(2)}`
                            : `Trop-perçu: CHF ${Math.abs(invoice.balance || 0)?.toFixed(2)}`
                          }
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px',
                      textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <StatusBadge status={
                          isOverdue(invoice) ? 'overdue' : invoice.status
                        } />
                        {(() => {
                          const es = emailStatuses[invoice.id];
                          if (!es && invoice.status === 'draft') {
                            return <span style={{ width: '20px', height: '20px', display: 'inline-block', flexShrink: 0 }} />;
                          }
                          if (!es) {
                            return <span style={{ width: '20px', height: '20px', display: 'inline-block', flexShrink: 0 }} />;
                          }
                          const dateStr = new Date(es.email_status_at).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
                          let Icon = Clock;
                          let color = 'var(--text-muted)';
                          let title = `Envoi en cours`;
                          if (es.status === 'opened') {
                            Icon = MailOpen;
                            color = 'var(--success)';
                            title = `Email ouvert le ${dateStr}`;
                          } else if (es.status === 'delivered') {
                            Icon = Mail;
                            color = 'var(--warning)';
                            title = `Email reçu, pas encore ouvert`;
                          } else if (es.status === 'bounced') {
                            Icon = MailWarning;
                            color = 'var(--danger)';
                            title = `Adresse email invalide — vérifier le destinataire`;
                          }
                          return (
                            <span title={title} style={{ display: 'inline-flex', width: '20px', height: '20px', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Icon size={16} color={color} />
                            </span>
                          );
                        })()}
                      </div>
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        {/* Slot 1: Download PDF - always visible */}
                        <button
                          onClick={() => downloadInvoice(invoice.id)}
                          disabled={downloading === invoice.id}
                          title="Télécharger PDF"
                          style={{
                            width: '30px', height: '30px',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: 'var(--bg-hover)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            cursor: downloading === invoice.id ? 'wait' : 'pointer',
                            opacity: downloading === invoice.id ? 0.5 : 1
                          }}>
                          {downloading === invoice.id
                            ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-muted)' }} />
                            : <Download size={14} color="var(--text-muted)" />}
                        </button>

                        {/* Slot 2: Send email */}
                        {canEdit && (invoice.status === 'draft' || invoice.status === 'sent') ? (
                          (() => {
                            const recipientEmail = getInvoiceRecipientEmail(invoice);
                            const noEmail = !recipientEmail;
                            const isDisabledSend = noEmail || sendingInvoice === invoice.id;
                            return (
                              <button
                                onClick={() => {
                                  if (invoice.invoice_type === 'sponsoring') {
                                    setSponsorEmailModal({ invoice });
                                  } else {
                                    sendInvoiceEmail(invoice.id);
                                  }
                                }}
                                disabled={isDisabledSend}
                                title={noEmail ? 'Aucune adresse email — utiliser l’impression' : (invoice.invoice_type === 'sponsoring' ? 'Email au sponsor' : 'Envoyer par email')}
                                style={{
                                  width: '30px', height: '30px',
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  background: noEmail ? 'var(--bg-hover)' : 'var(--success-soft)',
                                  border: `1px solid ${noEmail ? 'var(--border-color)' : 'var(--success)'}`,
                                  borderRadius: '6px',
                                  cursor: isDisabledSend ? 'not-allowed' : 'pointer',
                                  opacity: isDisabledSend ? 0.5 : 1
                                }}>
                                {sendingInvoice === invoice.id
                                  ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: 'var(--success-text)' }} />
                                  : <Mail size={14} color={noEmail ? 'var(--text-muted)' : 'var(--success-text)'} />}
                              </button>
                            );
                          })()
                        ) : <span style={{ width: '30px', height: '30px', display: 'inline-block' }} />}

                        {/* Slot 3: R1 reminder */}
                        {canEdit && invoice.status !== 'paid' && invoice.status !== 'cancelled' ? (() => {
                          const isSending = sendingReminderIds.has(invoice.id);
                          const noEmail = !getInvoiceRecipientEmail(invoice);
                          const disabledReason = noEmail ? 'Aucune adresse email — utiliser l’impression' : r1DisabledReason(invoice);
                          const isDisabled = disabledReason !== null || isSending;
                          const tooltip = isSending
                            ? 'Envoi en cours…'
                            : disabledReason ?? `Envoyer rappel R1 (${getDaysOverdue(invoice.due_date)} jours de retard)`;
                          return (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => setShowReminderConfirm({ invoice, type: 'R1' })}
                              disabled={isDisabled}
                              title={tooltip}
                              style={{ width: '36px', height: '30px', padding: 0, fontSize: '12px' }}>
                              {isSending ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : 'R1'}
                            </Button>
                          );
                        })() : <span style={{ width: '36px', height: '30px', display: 'inline-block' }} />}

                        {/* Slot 4: R2 reminder */}
                        {canEdit && invoice.status !== 'paid' && invoice.status !== 'cancelled' ? (() => {
                          const isSending = sendingReminderIds.has(invoice.id);
                          const noEmail = !getInvoiceRecipientEmail(invoice);
                          const disabledReason = noEmail ? 'Aucune adresse email — utiliser l’impression' : r2DisabledReason(invoice);
                          const isDisabled = disabledReason !== null || isSending;
                          const tooltip = isSending
                            ? 'Envoi en cours…'
                            : disabledReason ?? `Envoyer rappel R2 (${getDaysOverdue(invoice.due_date)} jours de retard)`;
                          return (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => setShowReminderConfirm({ invoice, type: 'R2' })}
                              disabled={isDisabled}
                              title={tooltip}
                              style={{ width: '36px', height: '30px', padding: 0, fontSize: '12px' }}>
                              {isSending ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : 'R2'}
                            </Button>
                          );
                        })() : <span style={{ width: '36px', height: '30px', display: 'inline-block' }} />}

                        {/* Slot 4b: Print reminder */}
                        {canEdit && invoice.status !== 'paid' && invoice.status !== 'cancelled' ? (() => {
                          const canR1 = r1DisabledReason(invoice) === null;
                          const canR2 = r2DisabledReason(invoice) === null;
                          if (!canR1 && !canR2) return <span style={{ width: '30px', height: '30px', display: 'inline-block' }} />;
                          const type = canR1 ? 'R1' as const : 'R2' as const;
                          return (
                            <button
                              type="button"
                              onClick={() => setShowPrintReminderConfirm({ invoice, type })}
                              disabled={printingReminder}
                              title={`Imprimer rappel ${type}`}
                              style={{
                                width: '30px', height: '30px',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                background: 'var(--input-bg)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '6px',
                                cursor: printingReminder ? 'wait' : 'pointer',
                                opacity: printingReminder ? 0.5 : 1,
                              }}>
                              <Printer size={13} color="var(--text-secondary)" />
                            </button>
                          );
                        })() : <span style={{ width: '30px', height: '30px', display: 'inline-block' }} />}

                        {/* Slot 5: Revert payment / Cancel invoice */}
                        {canEdit && invoice.status === 'paid' ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openRevertModal(invoice)}
                            title="Annuler le paiement"
                            style={{ width: '30px', height: '30px', padding: 0 }}>
                            <X size={14} />
                          </Button>
                        ) : canEdit && invoice.status !== 'cancelled' && invoice.status !== 'paid' ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openCancelModal(invoice)}
                            title="Annuler la facture"
                            style={{ width: '30px', height: '30px', padding: 0 }}>
                            <X size={14} />
                          </Button>
                        ) : <span style={{ width: '30px', height: '30px', display: 'inline-block' }} />}

                        {/* Slot 6: Delete draft */}
                        {canEdit && invoice.status === 'draft' ? (
                          <button
                            onClick={() => openDeleteModal(invoice)}
                            title="Supprimer (brouillon uniquement)"
                            style={{
                              width: '30px', height: '30px',
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              background: 'var(--danger-soft)',
                              border: '1px solid var(--danger)',
                              borderRadius: '6px',
                              cursor: 'pointer'
                            }}>
                            <Trash2 size={14} color="var(--danger)" />
                          </button>
                        ) : <span style={{ width: '30px', height: '30px', display: 'inline-block' }} />}
                      </div>
                    </td>
                    </tr>
                    {invoice.status === 'cancelled' && invoice.cancelled_reason && (
                      <tr key={`${invoice.id}-cancelled`} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td colSpan={9} style={{
                          color: 'var(--text-muted)',
                          fontSize: '12px',
                          fontStyle: 'italic',
                          padding: '4px 12px',
                          background: 'var(--bg-hover)'
                        }}>
                          Annulée: {invoice.cancelled_reason}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
            </tbody>
          </table>
          </DataTableShell>
        )}

        <div style={{
          display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap',
          marginTop: '10px', padding: '8px 12px',
          fontSize: '12px', color: 'var(--text-muted)'
        }}>
          <span style={{ fontWeight: 500 }}>Statut email :</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <MailOpen size={14} color="var(--success)" /> Ouvert
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <Mail size={14} color="var(--warning)" /> Reçu (non ouvert)
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <MailWarning size={14} color="var(--danger)" /> Adresse invalide
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <Clock size={14} color="var(--text-muted)" /> En cours d'envoi
          </span>
        </div>
      </div>

      {toast && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          background: toast.type === 'success' ? 'var(--success-soft)' : 'var(--danger-soft)',
          color: toast.type === 'success' ? 'var(--success-text)' : 'var(--danger)',
          border: `1px solid ${toast.type === 'success' ? 'var(--success)' : 'var(--danger)'}`,
          borderRadius: '8px',
          padding: '12px 16px',
          zIndex: 2000,
          fontWeight: '600',
          fontSize: '14px'
        }}>
          {toast.message}
        </div>
      )}

      {showCancelModal && selectedInvoice && (
        <StandardModal
          isOpen={true}
          onClose={() => { setShowCancelModal(false); setCancelReason(''); }}
          title="Annuler la facture"
          subtitle={`${selectedInvoice.invoice_number} — ${selectedInvoice.invoice_type === 'sponsoring' ? selectedInvoice.sponsor?.company_name || '' : selectedInvoice.invoice_type === 'evenement' ? `${selectedInvoice.registration?.first_name || ''} ${selectedInvoice.registration?.last_name || ''}`.trim() : selectedInvoice.invoice_type === 'confrerie' ? `${selectedInvoice.confrerie_member?.first_name || ''} ${selectedInvoice.confrerie_member?.last_name || ''}`.trim() : `${selectedInvoice.member?.first_name} ${selectedInvoice.member?.last_name}`}`}
          width="480px"
        >

            <div style={{
              background: 'var(--warning-soft)',
              border: '1px solid var(--warning)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '20px',
              color: 'var(--warning-text)',
              fontSize: '13px'
            }}>
              <AlertTriangle size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />La facture sera archivée avec le statut "Annulée". Le numéro de facture <strong>{selectedInvoice.invoice_number}</strong> sera conservé pour la traçabilité comptable.
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{
                color: 'var(--text-muted)',
                fontSize: '12px',
                display: 'block',
                marginBottom: '6px'
              }}>
                Raison de l&apos;annulation *
              </label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="Ex: Joueur blessé longue durée, joueur parti en cours de saison..."
                rows={3}
                style={{
                  width: '100%',
                  background: 'var(--bg-input)',
                  border: `1px solid ${cancelReason ? 'var(--border-color)' : 'var(--danger)'}`,
                  borderRadius: '8px',
                  padding: '10px',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  resize: 'vertical',
                  boxSizing: 'border-box'
                }}
              />
              {!cancelReason && (
                <div style={{
                  color: 'var(--danger)',
                  fontSize: '11px',
                  marginTop: '4px'
                }}>
                  La raison est obligatoire
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowCancelModal(false);
                  setCancelReason('');
                }}
                style={{ flex: 1 }}>
                Non
              </Button>
              <button
                onClick={confirmCancel}
                disabled={!cancelReason.trim()}
                style={{
                  flex: 2,
                  background: cancelReason.trim() ? 'var(--warning-soft)' : 'var(--bg-hover)',
                  color: cancelReason.trim() ? 'var(--warning-text)' : 'var(--text-muted)',
                  border: `1px solid ${cancelReason.trim() ? 'var(--warning)' : 'var(--border-color)'}`,
                  borderRadius: '8px',
                  padding: '10px',
                  cursor: cancelReason.trim() ? 'pointer' : 'not-allowed',
                  fontWeight: '700',
                  fontSize: '14px'
                }}>
                Oui, annuler la facture
              </button>
            </div>
        </StandardModal>
      )}

      {showDeleteModal && selectedInvoice && (
        <StandardModal
          isOpen={true}
          onClose={() => setShowDeleteModal(false)}
          title="Supprimer la facture"
          subtitle={`${selectedInvoice.invoice_number} — ${selectedInvoice.invoice_type === 'sponsoring' ? selectedInvoice.sponsor?.company_name || '' : selectedInvoice.invoice_type === 'evenement' ? `${selectedInvoice.registration?.first_name || ''} ${selectedInvoice.registration?.last_name || ''}`.trim() : selectedInvoice.invoice_type === 'confrerie' ? `${selectedInvoice.confrerie_member?.first_name || ''} ${selectedInvoice.confrerie_member?.last_name || ''}`.trim() : `${selectedInvoice.member?.first_name} ${selectedInvoice.member?.last_name}`}`}
          width="440px"
        >

            <div style={{
              background: 'var(--danger-soft)',
              border: '1px solid var(--danger)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '20px',
              color: 'var(--danger)',
              fontSize: '13px',
              textAlign: 'center'
            }}>
              <AlertTriangle size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Cette action est irréversible.<br />
              Le numéro <strong>{selectedInvoice.invoice_number}</strong> sera définitivement libéré.
            </div>

            <div style={{
              color: 'var(--text-muted)',
              fontSize: '12px',
              textAlign: 'center',
              marginBottom: '20px'
            }}>
              Seules les factures en brouillon peuvent être supprimées.
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <Button
                variant="secondary"
                onClick={() => setShowDeleteModal(false)}
                style={{ flex: 1 }}>
                Non
              </Button>
              <Button
                variant="danger"
                onClick={confirmDelete}
                style={{ flex: 2 }}>
                Oui, supprimer définitivement
              </Button>
            </div>
        </StandardModal>
      )}

      {showRevertModal && selectedInvoice && (
        <StandardModal
          isOpen={showRevertModal && !!selectedInvoice}
          onClose={() => { setShowRevertModal(false); setSelectedInvoice(null); }}
          title="Annuler le paiement"
          subtitle={`Facture ${selectedInvoice.invoice_number} — ${selectedInvoice.invoice_type === 'sponsoring' ? selectedInvoice.sponsor?.company_name || '' : selectedInvoice.invoice_type === 'evenement' ? `${selectedInvoice.registration?.first_name || ''} ${selectedInvoice.registration?.last_name || ''}`.trim() : selectedInvoice.invoice_type === 'confrerie' ? `${selectedInvoice.confrerie_member?.first_name || ''} ${selectedInvoice.confrerie_member?.last_name || ''}`.trim() : `${selectedInvoice.member?.first_name} ${selectedInvoice.member?.last_name}`}`}
          width="480px"
        >
            <div style={{
              background: 'var(--warning-soft)',
              border: '1px solid var(--warning)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '20px',
              color: 'var(--warning-text)',
              fontSize: '13px'
            }}>
              Cette action va remettre la facture en statut <strong>"Envoyée"</strong> et supprimer tous les enregistrements de paiement associés.
            </div>

            <div style={{
              color: 'var(--text-muted)',
              fontSize: '12px',
              marginBottom: '20px'
            }}>
              Utilisez cette fonction pour corriger un paiement matché par erreur lors de l&apos;import camt.054.
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowRevertModal(false);
                  setSelectedInvoice(null);
                }}
                style={{ flex: 1 }}>
                Non
              </Button>
              <button
                onClick={confirmRevertPayment}
                style={{
                  flex: 2,
                  background: 'var(--warning-soft)',
                  color: 'var(--warning-text)',
                  border: '1px solid var(--warning)',
                  borderRadius: '8px',
                  padding: '10px',
                  cursor: 'pointer',
                  fontWeight: '700',
                  fontSize: '14px'
                }}>
                Oui, annuler le paiement
              </button>
            </div>
        </StandardModal>
      )}

      {showImportHistory && (
        <StandardModal
          isOpen={showImportHistory}
          onClose={() => setShowImportHistory(false)}
          title="Fichiers importés"
          subtitle="Historique des imports camt.054"
          width="700px"
          maxHeight="80vh"
        >
            {camtImports.length === 0 ? (
              <div style={{
                color: 'var(--text-muted)',
                textAlign: 'center',
                padding: '40px',
                fontSize: '14px'
              }}>
                Aucun fichier importé
              </div>
            ) : (
              <DataTableShell bare maxHeight="500px">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'var(--table-header-bg)' }}>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ textAlign: 'left', padding: '10px',
                        color: 'var(--text-muted)', fontSize: '12px' }}>Fichier</th>
                      <th style={{ textAlign: 'center', padding: '10px',
                        color: 'var(--text-muted)', fontSize: '12px' }}>Date</th>
                      <th style={{ textAlign: 'center', padding: '10px',
                        color: 'var(--text-muted)', fontSize: '12px' }}>Total</th>
                      <th style={{ textAlign: 'center', padding: '10px',
                        color: 'var(--success-text)', fontSize: '12px' }}>Matchées</th>
                      <th style={{ textAlign: 'center', padding: '10px',
                        color: 'var(--warning-text)', fontSize: '12px' }}>Non matchées</th>
                    </tr>
                  </thead>
                  <tbody>
                    {camtImports.map(imp => (
                      <tr key={imp.id} style={{
                        borderBottom: '1px solid var(--border-color)'
                      }}>
                        <td style={{ padding: '10px', color: 'var(--text-primary)',
                          fontSize: '13px' }}>
                          <FileText size={13} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />{imp.filename}
                        </td>
                        <td style={{ padding: '10px', color: 'var(--text-muted)',
                          fontSize: '12px', textAlign: 'center' }}>
                          {new Date(imp.imported_at)
                            .toLocaleDateString('fr-CH', {
                              day: '2-digit', month: '2-digit',
                              year: 'numeric', hour: '2-digit',
                              minute: '2-digit'
                            })}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center',
                          color: 'var(--text-primary)', fontWeight: '600' }}>
                          {imp.total_transactions}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center',
                          color: 'var(--success-text)', fontWeight: '700' }}>
                          {imp.matched_count}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          {imp.unmatched_count > 0 ? (
                            <span style={{ color: 'var(--warning-text)', fontWeight: '700' }}>
                              {imp.unmatched_count}
                            </span>
                          ) : (
                            <CheckCircle size={14} aria-hidden="true" style={{ color: 'var(--success-text)' }} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTableShell>
            )}

        </StandardModal>
      )}

      {showUnmatched && (
        <StandardModal
          isOpen={showUnmatched}
          onClose={() => setShowUnmatched(false)}
          title="Traitements manuels"
          subtitle="Transactions non matchées automatiquement"
          width="750px"
          maxHeight="80vh"
        >
            {unmatchedTransactions.filter(
              t => t.status === 'pending'
            ).length === 0 ? (
              <div style={{
                color: 'var(--success-text)', textAlign: 'center',
                padding: '40px', fontSize: '16px'
              }}>
                <CheckCircle size={16} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '6px' }} />Aucun traitement manuel en attente !
              </div>
            ) : (
              unmatchedTransactions
                .filter(t => t.status === 'pending')
                .map(tx => (
                  <div key={tx.id} style={{
                    background: 'var(--warning-soft)',
                    border: '1px solid var(--warning)',
                    borderRadius: '12px',
                    padding: '20px',
                    marginBottom: '16px'
                  }}>
                    {tx.type === 'partial' && (
                      <div style={{
                        background: 'var(--orange-soft)',
                        border: '1px solid var(--warning)',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        marginBottom: '12px'
                      }}>
                        <div style={{
                          color: 'var(--warning-text)', fontWeight: '700',
                          fontSize: '13px', marginBottom: '4px'
                        }}>
                          <AlertTriangle size={13} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Paiement partiel — Facture {tx.invoiceNumber}
                        </div>
                        <div style={{
                          display: 'flex', gap: '16px',
                          fontSize: '13px'
                        }}>
                          <span style={{ color: 'var(--text-muted)' }}>
                            Montant facture:
                            <strong style={{ color: 'var(--text-primary)' }}>
                              {' '}CHF {tx.invoiceAmount?.toFixed(2)}
                            </strong>
                          </span>
                          <span style={{ color: 'var(--text-muted)' }}>
                            Reçu:
                            <strong style={{ color: 'var(--warning-text)' }}>
                              {' '}CHF {tx.amount?.toFixed(2)}
                            </strong>
                          </span>
                          <span style={{ color: 'var(--text-muted)' }}>
                            Solde restant:
                            <strong style={{ color: 'var(--danger)' }}>
                              {' '}CHF {tx.diff?.toFixed(2)}
                            </strong>
                          </span>
                        </div>
                        <div style={{
                          color: 'var(--text-muted)', fontSize: '12px',
                          marginTop: '6px'
                        }}>
                          <Lightbulb size={13} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />La facture est marquée "Partiellement payée".
                          Vous pouvez forcer la validation ci-dessous
                          ou attendre le solde.
                        </div>
                      </div>
                    )}

                    {tx.type === 'overpaid' && (
                      <div style={{
                        background: 'var(--accent-soft)',
                        border: '1px solid var(--accent)',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        marginBottom: '12px'
                      }}>
                        <div style={{
                          color: 'var(--accent)', fontWeight: '700',
                          fontSize: '13px', marginBottom: '4px'
                        }}>
                          <Wallet size={13} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Trop-perçu — Facture {tx.invoiceNumber}
                        </div>
                        <div style={{
                          display: 'flex', gap: '16px',
                          fontSize: '13px'
                        }}>
                          <span style={{ color: 'var(--text-muted)' }}>
                            Montant facture:
                            <strong style={{ color: 'var(--text-primary)' }}>
                              {' '}CHF {tx.invoiceAmount?.toFixed(2)}
                            </strong>
                          </span>
                          <span style={{ color: 'var(--text-muted)' }}>
                            Reçu:
                            <strong style={{ color: 'var(--success-text)' }}>
                              {' '}CHF {tx.amount?.toFixed(2)}
                            </strong>
                          </span>
                          <span style={{ color: 'var(--text-muted)' }}>
                            Trop-perçu:
                            <strong style={{ color: 'var(--accent)' }}>
                              {' '}CHF {tx.diff?.toFixed(2)}
                            </strong>
                          </span>
                        </div>
                        <div style={{
                          color: 'var(--text-muted)', fontSize: '12px',
                          marginTop: '6px'
                        }}>
                          <Lightbulb size={13} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />La facture est marquée "Payée".
                          Décidez si vous remboursez le trop-perçu
                          ou le créditez sur la prochaine facture.
                        </div>
                      </div>
                    )}

                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '10px'
                    }}>
                      <div>
                        <div style={{
                          color: 'var(--text-primary)', fontWeight: '700'
                        }}>
                          {tx.debtor_name || 'Inconnu'}
                        </div>
                        <div style={{
                          color: 'var(--text-muted)', fontSize: '12px'
                        }}>
                          {tx.payment_date} | Ref: {tx.qr_reference || '—'}
                        </div>
                        {tx.additional_info && (
                          <div style={{
                            color: 'var(--accent)', fontSize: '12px'
                          }}>
                            {tx.additional_info}
                          </div>
                        )}
                      </div>
                      <div style={{
                        color: 'var(--warning-text)', fontWeight: '900',
                        fontSize: '18px'
                      }}>
                        CHF {tx.amount?.toFixed(2)}
                      </div>
                    </div>

                    <div style={{ marginBottom: '10px' }}>
                      <SearchInput
                        value={searchManual[tx.id] || ''}
                        onChange={(v) => setSearchManual(prev => ({ ...prev, [tx.id]: v }))}
                        placeholder="Rechercher par prénom ou nom..."
                      />
                    </div>

                    {searchManual[tx.id]?.length >= 2 && (
                      <div style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        marginBottom: '10px'
                      }}>
                        {openInvoices
                          .filter(inv => {
                            const s = searchManual[tx.id].toLowerCase();
                            return (
                              inv.member?.first_name?.toLowerCase().includes(s) ||
                              inv.member?.last_name?.toLowerCase().includes(s) ||
                              inv.invoice_number?.toLowerCase().includes(s) ||
                              Boolean(inv.registration?.first_name?.toLowerCase().includes(s)) ||
                              Boolean(inv.registration?.last_name?.toLowerCase().includes(s))
                            );
                          })
                          .map(inv => (
                            <div
                              key={inv.id}
                              onClick={() => {
                                setSelectedMatches(prev => ({
                                  ...prev, [tx.id]: inv.id
                                }));
                                setSearchManual(prev => ({
                                  ...prev,
                                  [tx.id]: `${inv.invoice_number} — ${inv.invoice_type === 'evenement' ? `${inv.registration?.first_name || ''} ${inv.registration?.last_name || ''}`.trim() : inv.invoice_type === 'confrerie' ? `${inv.confrerie_member?.first_name || ''} ${inv.confrerie_member?.last_name || ''}`.trim() : `${inv.member?.first_name} ${inv.member?.last_name}`}`
                                }));
                              }}
                              style={{
                                padding: '10px 14px',
                                cursor: 'pointer',
                                borderBottom: '1px solid var(--border-color)',
                                background: selectedMatches[tx.id] === inv.id
                                  ? 'var(--accent-soft)' : 'transparent',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                transition: 'background 0.15s'
                              }}
                              onMouseEnter={e => {
                                if (selectedMatches[tx.id] !== inv.id)
                                  e.currentTarget.style.background = 'var(--bg-hover)';
                              }}
                              onMouseLeave={e => {
                                if (selectedMatches[tx.id] !== inv.id)
                                  e.currentTarget.style.background = 'transparent';
                              }}
                            >
                              <div>
                                <div style={{
                                  color: 'var(--text-primary)', fontWeight: '600',
                                  fontSize: '14px'
                                }}>
                                  {inv.invoice_type === 'evenement' ? `${inv.registration?.first_name || ''} ${inv.registration?.last_name || ''}`.trim() : `${inv.member?.first_name} ${inv.member?.last_name}`}
                                </div>
                                <div style={{
                                  color: 'var(--text-muted)', fontSize: '12px',
                                  marginTop: '2px'
                                }}>
                                  {inv.invoice_number}
                                  {inv.team?.name ? ` — ${inv.team.name}` : ''}
                                </div>
                              </div>
                              <div style={{
                                color: 'var(--accent)', fontWeight: '700',
                                fontSize: '15px', flexShrink: 0
                              }}>
                                CHF {inv.total_amount?.toFixed(2)}
                              </div>
                            </div>
                          ))}
                        {openInvoices.filter(inv => {
                          const s = searchManual[tx.id]?.toLowerCase();
                          return inv.member?.first_name?.toLowerCase().includes(s) ||
                            inv.member?.last_name?.toLowerCase().includes(s) ||
                            inv.invoice_number?.toLowerCase().includes(s) ||
                            Boolean(inv.registration?.first_name?.toLowerCase().includes(s)) ||
                            Boolean(inv.registration?.last_name?.toLowerCase().includes(s));
                        }).length === 0 && (
                          <div style={{
                            padding: '16px', color: 'var(--text-muted)',
                            textAlign: 'center', fontSize: '13px'
                          }}>
                            Aucune facture trouvée
                          </div>
                        )}
                      </div>
                    )}

                    {selectedMatches[tx.id] && (
                      <div style={{
                        background: 'var(--accent-soft)',
                        border: '1px solid var(--accent)',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        marginBottom: '10px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <div style={{ color: 'var(--accent)', fontSize: '13px' }}>
                          <Check size={13} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Facture sélectionnée
                        </div>
                        <button
                          onClick={() => {
                            setSelectedMatches(prev => {
                              const n = {...prev};
                              delete n[tx.id];
                              return n;
                            });
                            setSearchManual(prev => ({
                              ...prev, [tx.id]: ''
                            }));
                          }}
                          style={{
                            background: 'transparent',
                            color: 'var(--text-muted)', border: 'none',
                            cursor: 'pointer', fontSize: '12px'
                          }}>
                          <X size={12} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />Changer
                        </button>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {tx.type === 'partial' && (
                        <button
                          onClick={() => forceValidate(tx)}
                          style={{
                            background: 'var(--success-soft)',
                            color: 'var(--success-text)',
                            border: '1px solid var(--success)',
                            borderRadius: '8px',
                            padding: '8px 16px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '13px',
                            whiteSpace: 'nowrap'
                          }}>
                          <Check size={13} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Forcer validation (accepter paiement partiel)
                        </button>
                      )}
                      <button
                        onClick={() => applyManualMatch(tx)}
                        disabled={!selectedMatches[tx.id]}
                        style={{
                          flex: 2,
                          background: selectedMatches[tx.id]
                            ? 'var(--success-soft)'
                            : 'var(--bg-hover)',
                          color: selectedMatches[tx.id]
                            ? 'var(--success-text)' : 'var(--text-muted)',
                          border: `1px solid ${selectedMatches[tx.id]
                            ? 'var(--success)'
                            : 'var(--border-color)'}`,
                          borderRadius: '8px',
                          padding: '10px',
                          cursor: selectedMatches[tx.id]
                            ? 'pointer' : 'not-allowed',
                          fontWeight: '700', fontSize: '14px'
                        }}>
                        <Check size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Matcher cette facture
                      </button>

                      <button
                        onClick={() => ignoreUnmatched(tx)}
                        style={{
                          flex: 1,
                          background: 'var(--bg-hover)',
                          color: 'var(--text-muted)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          padding: '10px',
                          cursor: 'pointer',
                          fontWeight: '600', fontSize: '14px'
                        }}>
                        Ignorer
                      </button>
                    </div>
                  </div>
                ))
            )}

        </StandardModal>
      )}

      {showCamtConfirm && (
        <StandardModal
          isOpen={!!showCamtConfirm}
          onClose={() => setShowCamtConfirm(null)}
          title="Confirmer l'import"
          width="480px"
        >
            <p style={{ margin: '0 0 8px 0', color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6' }}>
              Vous êtes sur le point d'importer :
            </p>
            <ul style={{ margin: '0 0 16px 0', padding: '0 0 0 20px', color: 'var(--text-primary)', fontSize: '14px', lineHeight: '1.8' }}>
              {showCamtConfirm.xmlFiles.map(f => (
                <li key={f.name}><strong>{f.name}</strong></li>
              ))}
            </ul>
            <p style={{ margin: '0 0 24px 0', color: 'var(--text-secondary)', fontSize: '14px' }}>
              Fichier(s) contenant <strong style={{ color: 'var(--text-primary)' }}>{showCamtConfirm.transactionCount} transaction{showCamtConfirm.transactionCount !== 1 ? 's' : ''}</strong>. Confirmer ?
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <Button
                variant="secondary"
                onClick={() => setShowCamtConfirm(null)}
              >
                Annuler
              </Button>
              <Button
                onClick={() => executeCamtImport(showCamtConfirm.xmlFiles)}
              >
                Importer
              </Button>
            </div>
        </StandardModal>
      )}

      {showImportReport && importReport && (
        <StandardModal
          isOpen={showImportReport}
          onClose={() => setShowImportReport(false)}
          title="Résultat de l'import CAMT"
          width="620px"
          maxHeight="80vh"
        >
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr 1fr',
              gap: '10px',
              marginBottom: '20px'
            }}>
              <div style={{
                background: 'var(--success-soft)',
                border: '1px solid var(--success)',
                borderRadius: '10px',
                padding: '14px 10px',
                textAlign: 'center'
              }}>
                <div style={{ color: 'var(--success-text)', fontSize: '28px', fontWeight: '900' }}>
                  {importReport.matched}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                  Matchées
                </div>
              </div>
              <div style={{
                background: importReport.unmatched > 0 ? 'var(--warning-soft)' : 'var(--bg-hover)',
                border: `1px solid ${importReport.unmatched > 0 ? 'var(--warning)' : 'var(--border-color)'}`,
                borderRadius: '10px',
                padding: '14px 10px',
                textAlign: 'center'
              }}>
                <div style={{
                  color: importReport.unmatched > 0 ? 'var(--warning-text)' : 'var(--text-muted)',
                  fontSize: '28px', fontWeight: '900'
                }}>
                  {importReport.unmatched}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                  Non matchées
                </div>
              </div>
              <div style={{
                background: importReport.duplicates > 0 ? 'var(--info-soft)' : 'var(--bg-hover)',
                border: `1px solid ${importReport.duplicates > 0 ? 'var(--info)' : 'var(--border-color)'}`,
                borderRadius: '10px',
                padding: '14px 10px',
                textAlign: 'center'
              }}>
                <div style={{
                  color: importReport.duplicates > 0 ? 'var(--info-text)' : 'var(--text-muted)',
                  fontSize: '28px', fontWeight: '900'
                }}>
                  {importReport.duplicates}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                  Déjà importées
                </div>
              </div>
              <div style={{
                background: 'var(--bg-hover)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '14px 10px',
                textAlign: 'center'
              }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '28px', fontWeight: '900' }}>
                  {importReport.reversals}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                  Rejets ignorés
                </div>
              </div>
            </div>

            {importReport.fileStats.length > 1 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ color: 'var(--text-secondary)', fontWeight: '600', fontSize: '13px', marginBottom: '8px' }}>
                  Détail par fichier
                </div>
                <DataTableShell bare maxHeight="200px">
                <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: '600' }}>Fichier</th>
                      <th style={{ textAlign: 'center', padding: '6px 4px', color: 'var(--text-muted)', fontWeight: '600' }}>Format</th>
                      <th style={{ textAlign: 'center', padding: '6px 4px', color: 'var(--text-muted)', fontWeight: '600' }}>Total</th>
                      <th style={{ textAlign: 'center', padding: '6px 4px', color: 'var(--success-text)', fontWeight: '600' }}>OK</th>
                      <th style={{ textAlign: 'center', padding: '6px 4px', color: 'var(--warning-text)', fontWeight: '600' }}>?</th>
                      <th style={{ textAlign: 'center', padding: '6px 4px', color: 'var(--info-text)', fontWeight: '600' }}>Dup.</th>
                      <th style={{ textAlign: 'center', padding: '6px 4px', color: 'var(--text-muted)', fontWeight: '600' }}>Rej.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importReport.fileStats.map((fs, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '6px 8px', color: 'var(--text-primary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={fs.filename}>{fs.filename}</td>
                        <td style={{ textAlign: 'center', padding: '6px 4px', color: 'var(--text-muted)' }}>{fs.format === 'camt.053' ? '053' : '054'}</td>
                        <td style={{ textAlign: 'center', padding: '6px 4px', color: 'var(--text-primary)' }}>{fs.total}</td>
                        <td style={{ textAlign: 'center', padding: '6px 4px', color: 'var(--success-text)', fontWeight: '600' }}>{fs.matched}</td>
                        <td style={{ textAlign: 'center', padding: '6px 4px', color: 'var(--warning-text)', fontWeight: '600' }}>{fs.unmatched}</td>
                        <td style={{ textAlign: 'center', padding: '6px 4px', color: 'var(--info-text)' }}>{fs.duplicates}</td>
                        <td style={{ textAlign: 'center', padding: '6px 4px', color: 'var(--text-muted)' }}>{fs.reversals}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </DataTableShell>
              </div>
            )}

            {importReport.fileStats.length === 1 && importReport.fileStats[0] && (
              <div style={{ marginBottom: '16px', color: 'var(--text-muted)', fontSize: '12px' }}>
                Format détecté : <strong style={{ color: 'var(--text-secondary)' }}>{importReport.fileStats[0].format}</strong>
                {' — '}{importReport.fileStats[0].total} transactions traitées
              </div>
            )}

            {importReport.unmatchedList.length > 0 && (
              <div>
                <div style={{
                  color: 'var(--warning-text)',
                  fontWeight: '700',
                  marginBottom: '10px',
                  fontSize: '14px'
                }}>
                  Transactions à traiter manuellement :
                </div>
                {importReport.unmatchedList.map((t, i) => (
                  <div key={i} style={{
                    background: 'var(--warning-soft)',
                    border: '1px solid var(--warning)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    marginBottom: '8px'
                  }}>
                    <div style={{
                      color: 'var(--text-primary)',
                      fontWeight: '600',
                      fontSize: '13px'
                    }}>
                      {t.debtorName} — CHF {t.amount.toFixed(2)}
                    </div>
                    <div style={{
                      color: 'var(--text-secondary)',
                      fontSize: '11px',
                      marginTop: '2px'
                    }}>
                      {t.paymentDate} | Ref: {t.ref || '—'} | {t.addInfo || '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </StandardModal>
      )}

      {amountWarning.show && (
        <div style={{ position: 'relative', zIndex: 2000 }}>
        <StandardModal
          isOpen={amountWarning.show}
          onClose={() => setAmountWarning({ show: false })}
          title="Montant différent"
          width="460px"
        >
            <div style={{
              background: 'var(--warning-soft)',
              border: '1px solid var(--warning)',
              borderRadius: '8px',
              padding: '14px',
              marginBottom: '20px'
            }}>
              <div style={{
                display: 'grid', gap: '8px',
                fontSize: '14px'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between'
                }}>
                  <span style={{ color: 'var(--text-muted)' }}>
                    Montant reçu:
                  </span>
                  <span style={{
                    color: 'var(--text-primary)', fontWeight: '700'
                  }}>
                    CHF {parseFloat(amountWarning.paidAmount)
                      ?.toFixed(2)}
                  </span>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between'
                }}>
                  <span style={{ color: 'var(--text-muted)' }}>
                    Montant facture:
                  </span>
                  <span style={{
                    color: 'var(--text-primary)', fontWeight: '700'
                  }}>
                    CHF {parseFloat(
                      amountWarning.invoice?.total_amount
                    )?.toFixed(2)}
                  </span>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderTop: '1px solid var(--border-color)',
                  paddingTop: '8px'
                }}>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {amountWarning.balance > 0
                      ? 'Solde restant:'
                      : 'Trop-perçu:'}
                  </span>
                  <span style={{
                    color: amountWarning.balance > 0
                      ? 'var(--danger)' : 'var(--accent)',
                    fontWeight: '700'
                  }}>
                    CHF {Math.abs(amountWarning.balance)
                      ?.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <Button
                variant="secondary"
                onClick={() => setAmountWarning({ show: false })}
                style={{ flex: 1 }}>
                Non, annuler
              </Button>
              <button
                onClick={() => doManualMatch(
                  amountWarning.tx,
                  amountWarning.invoice,
                  amountWarning.newStatus,
                  amountWarning.balance,
                  amountWarning.paidAmount
                )}
                style={{
                  flex: 2,
                  background: 'var(--warning-soft)',
                  color: 'var(--warning-text)',
                  border: '1px solid var(--warning)',
                  borderRadius: '8px', padding: '10px',
                  cursor: 'pointer', fontWeight: '700',
                  fontSize: '14px'
                }}>
                Oui, confirmer quand même
              </button>
            </div>
        </StandardModal>
        </div>
      )}

      {showBulkConfirm && (
        <StandardModal
          isOpen={showBulkConfirm}
          onClose={() => setShowBulkConfirm(false)}
          title={hasSelection ? 'Envoyer les factures sélectionnées' : 'Envoyer toutes les factures'}
          width="480px"
        >
            <div style={{
              color: 'var(--text-muted)',
              textAlign: 'center',
              fontSize: '14px',
              marginBottom: '20px'
            }}>
              Vous allez envoyer <strong style={{ color: 'var(--text-primary)' }}>
                {draftActionCount} factures
              </strong> {hasSelection ? 'parmi la sélection' : 'en brouillon'} par email.
            </div>

            <div style={{
              background: 'var(--accent-soft)',
              border: '1px solid var(--accent)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '20px',
              color: 'var(--accent)',
              fontSize: '13px',
              textAlign: 'center'
            }}>
              Les factures seront marquees comme "Envoyees" et les PDF QR seront joints automatiquement.
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <Button
                variant="secondary"
                onClick={() => setShowBulkConfirm(false)}
                style={{ flex: 1 }}>
                Annuler
              </Button>
              <button
                onClick={sendBulkInvoices}
                style={{
                  flex: 2,
                  background: 'var(--success-soft)',
                  color: 'var(--success-text)',
                  border: '1px solid var(--success)',
                  borderRadius: '8px',
                  padding: '10px',
                  cursor: 'pointer',
                  fontWeight: '700',
                  fontSize: '14px'
                }}>
                Oui, envoyer toutes les factures
              </button>
            </div>
        </StandardModal>
      )}

      {showReminderConfirm && (
        <StandardModal
          isOpen={!!showReminderConfirm}
          onClose={() => setShowReminderConfirm(null)}
          title={`Envoyer le rappel ${showReminderConfirm.type}`}
          subtitle={`${showReminderConfirm.invoice.invoice_type === 'evenement' ? `${showReminderConfirm.invoice.registration?.first_name || ''} ${showReminderConfirm.invoice.registration?.last_name || ''}`.trim() : `${showReminderConfirm.invoice.member?.first_name} ${showReminderConfirm.invoice.member?.last_name}`} — ${showReminderConfirm.invoice.invoice_number}`}
          width="480px"
        >
            <div style={{
              color: 'var(--text-muted)',
              textAlign: 'center',
              fontSize: '14px',
              marginBottom: '20px'
            }}>
              Vous allez envoyer un rappel {showReminderConfirm.type} a <strong style={{ color: 'var(--text-primary)' }}>
                {showReminderConfirm.invoice.invoice_type === 'evenement' ? `${showReminderConfirm.invoice.registration?.first_name || ''} ${showReminderConfirm.invoice.registration?.last_name || ''}`.trim() : `${showReminderConfirm.invoice.member?.first_name} ${showReminderConfirm.invoice.member?.last_name}`}
              </strong> pour la facture <strong style={{ color: 'var(--text-primary)' }}>
                {showReminderConfirm.invoice.invoice_number}
              </strong>.
              <div style={{ marginTop: '8px', color: 'var(--danger)', fontSize: '13px' }}>
                Retard: {getDaysOverdue(showReminderConfirm.invoice.due_date)} jours
              </div>
            </div>

            <div style={{
              background: 'var(--danger-soft)',
              border: '1px solid var(--danger)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '20px',
              color: showReminderConfirm.type === 'R1' ? 'var(--danger)' : 'var(--danger)',
              fontSize: '13px',
              textAlign: 'center'
            }}>
              {showReminderConfirm.type === 'R1'
                ? 'Premier rappel poli - invitation à régulariser la situation'
                : 'Second rappel ferme - action requise sous 7 jours'}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <Button
                variant="secondary"
                onClick={() => setShowReminderConfirm(null)}
                style={{ flex: 1 }}>
                Annuler
              </Button>
              <Button
                variant="danger"
                onClick={() => sendReminder(showReminderConfirm.invoice.id, showReminderConfirm.type)}
                style={{ flex: 2 }}>
                Oui, envoyer le {showReminderConfirm.type}
              </Button>
            </div>
        </StandardModal>
      )}

      {showBulkReminderConfirm && (
        <StandardModal
          isOpen={!!showBulkReminderConfirm}
          onClose={() => setShowBulkReminderConfirm(null)}
          title={hasSelection
            ? `Envoyer les rappels ${showBulkReminderConfirm} aux factures sélectionnées`
            : `Envoyer tous les rappels ${showBulkReminderConfirm}`}
          width="480px"
        >
            <div style={{
              color: 'var(--text-muted)',
              textAlign: 'center',
              fontSize: '14px',
              marginBottom: '20px'
            }}>
              Vous allez envoyer <strong style={{ color: 'var(--text-primary)' }}>
                {((hasSelection ? selectedInvoices : invoices).filter(inv =>
                  showBulkReminderConfirm === 'R1' ? isEligibleForR1(inv) : isEligibleForR2(inv)
                ).length)} rappels {showBulkReminderConfirm}
              </strong> {hasSelection ? 'aux factures sélectionnées' : 'à toutes les factures éligibles'} par email.
            </div>

            <div style={{
              background: 'var(--danger-soft)',
              border: '1px solid var(--danger)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '20px',
              color: showBulkReminderConfirm === 'R1' ? 'var(--danger)' : 'var(--danger)',
              fontSize: '13px',
              textAlign: 'center'
            }}>
              {showBulkReminderConfirm === 'R1'
                ? `Premiers rappels pour factures en retard de plus de ${reminderDays.r1} jour(s)`
                : `Seconds rappels envoyés ${reminderDays.r2} jour(s) après le R1`}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <Button
                variant="secondary"
                onClick={() => setShowBulkReminderConfirm(null)}
                style={{ flex: 1 }}>
                Annuler
              </Button>
              <Button
                variant="danger"
                onClick={() => sendBulkReminders(showBulkReminderConfirm)}
                style={{ flex: 2 }}>
                Oui, envoyer tous les {showBulkReminderConfirm}
              </Button>
            </div>
        </StandardModal>
      )}

      {showPrintReminderConfirm && (
        <StandardModal
          isOpen={!!showPrintReminderConfirm}
          onClose={() => setShowPrintReminderConfirm(null)}
          title={`Imprimer le rappel ${showPrintReminderConfirm.type}`}
          subtitle={`${showPrintReminderConfirm.invoice.invoice_type === 'confrerie' ? (showPrintReminderConfirm.invoice.confrerie_member?.first_name || '') : (showPrintReminderConfirm.invoice.member?.first_name || '')} ${showPrintReminderConfirm.invoice.invoice_type === 'confrerie' ? (showPrintReminderConfirm.invoice.confrerie_member?.last_name || '') : (showPrintReminderConfirm.invoice.member?.last_name || '')} — ${showPrintReminderConfirm.invoice.invoice_number}`}
          width="480px"
        >
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: '14px', marginBottom: '20px' }}>
              Ces rappels seront marqués comme envoyés (l'impression vaut envoi). Continuer ?
              <div style={{ marginTop: '8px', color: 'var(--danger)', fontSize: '13px' }}>
                Retard: {getDaysOverdue(showPrintReminderConfirm.invoice.due_date)} jours
              </div>
            </div>
            {showPrintReminderConfirm.type === 'R2' && showPrintReminderConfirm.invoice.invoice_type !== 'sponsoring' && showPrintReminderConfirm.invoice.invoice_type !== 'confrerie' && (
              <div style={{
                background: 'var(--warning-soft)', border: '1px solid var(--warning)',
                borderRadius: '8px', padding: '12px', marginBottom: '20px',
                color: 'var(--warning-text)', fontSize: '13px', textAlign: 'center'
              }}>
                Des frais de rappel de CHF 30.- seront appliqués (cotisations uniquement).
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <Button variant="secondary" onClick={() => setShowPrintReminderConfirm(null)} style={{ flex: 1 }}>
                Annuler
              </Button>
              <Button
                variant="danger"
                onClick={() => printSingleReminder(showPrintReminderConfirm.invoice.id, showPrintReminderConfirm.type)}
                loading={printingReminder}
                style={{ flex: 2 }}>
                Oui, imprimer le {showPrintReminderConfirm.type}
              </Button>
            </div>
        </StandardModal>
      )}

      {showBulkPrintReminderConfirm && (
        <StandardModal
          isOpen={!!showBulkPrintReminderConfirm}
          onClose={() => setShowBulkPrintReminderConfirm(null)}
          title={hasSelection
            ? `Imprimer les rappels ${showBulkPrintReminderConfirm} (sélection)`
            : `Imprimer tous les rappels ${showBulkPrintReminderConfirm}`}
          width="480px"
        >
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: '14px', marginBottom: '20px' }}>
              <strong style={{ color: 'var(--text-primary)' }}>
                {(hasSelection ? selectedInvoices : invoices).filter(inv =>
                  showBulkPrintReminderConfirm === 'R1' ? isEligibleForR1(inv) : isEligibleForR2(inv)
                ).length} rappels {showBulkPrintReminderConfirm}
              </strong> seront générés en un seul PDF.
              <div style={{ marginTop: '10px', color: 'var(--danger)', fontSize: '13px', fontWeight: 600 }}>
                Ces rappels seront marqués comme envoyés (l'impression vaut envoi).
              </div>
            </div>

            {showBulkPrintReminderConfirm === 'R2' && (
              <div style={{
                background: 'var(--warning-soft)', border: '1px solid var(--warning)',
                borderRadius: '8px', padding: '12px', marginBottom: '20px',
                color: 'var(--warning-text)', fontSize: '13px', textAlign: 'center'
              }}>
                Les frais de rappel (CHF 30.-) seront appliqués aux cotisations éligibles.
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <Button variant="secondary" onClick={() => setShowBulkPrintReminderConfirm(null)} style={{ flex: 1 }}>
                Annuler
              </Button>
              <Button
                variant="danger"
                onClick={() => printBulkReminders(showBulkPrintReminderConfirm)}
                loading={printingReminder}
                style={{ flex: 2 }}>
                Oui, imprimer les {showBulkPrintReminderConfirm}
              </Button>
            </div>
        </StandardModal>
      )}

      {bulkSendProgress && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.75)',
          zIndex: 1100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '32px 36px',
            width: '440px',
            textAlign: 'center'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: '20px',
              color: 'var(--accent)'
            }}>
              <Loader2 size={44} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
            <h3 style={{ color: 'var(--text-primary)', margin: '0 0 8px 0', fontSize: '18px' }}>
              {bulkReminderProgress
                ? `Envoi des rappels ${bulkReminderProgress.type} en cours…`
                : 'Envoi des factures en cours…'}
            </h3>
            <div style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '20px' }}>
              <strong style={{ color: 'var(--text-primary)' }}>{bulkSendProgress.sent + bulkSendProgress.failed}/{bulkSendProgress.total}</strong> envoyée{bulkSendProgress.total > 1 ? 's' : ''}
              {bulkSendProgress.failed > 0 && (
                <span style={{ color: 'var(--danger)' }}> ({bulkSendProgress.failed} erreur{bulkSendProgress.failed > 1 ? 's' : ''})</span>
              )}
            </div>
            <div style={{
              height: '6px',
              background: 'var(--border-color)',
              borderRadius: '3px',
              overflow: 'hidden',
              position: 'relative'
            }}>
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                bottom: 0,
                width: `${((bulkSendProgress.sent + bulkSendProgress.failed) / bulkSendProgress.total) * 100}%`,
                background: bulkSendProgress.failed > 0 ? 'var(--warning)' : 'var(--accent)',
                borderRadius: '3px',
                transition: 'width 0.3s ease'
              }} />
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '14px' }}>
              Ne fermez pas cette fenêtre.
            </div>
          </div>
        </div>
      )}

      {sponsorEmailModal && (
        <SponsorEmailModalWrapper
          invoice={sponsorEmailModal.invoice}
          onClose={() => setSponsorEmailModal(null)}
          onSend={handleSponsorEmailSend}
          resolvePlaceholders={resolveSponsoringPlaceholders}
        />
      )}

      <StandardModal
        isOpen={showBatchPrintModal}
        onClose={() => { if (!batchPrintProgress) setShowBatchPrintModal(false); }}
        title="Imprimer les factures en PDF"
        subtitle="Générer un fichier PDF regroupant les factures"
        width="520px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: 'var(--text-primary)' }}>
              <input type="radio" name="batchScope" checked={batchPrintScope === 'all'} onChange={() => setBatchPrintScope('all')} />
              Toutes les factures
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: 'var(--text-primary)', marginTop: 8 }}>
              <input type="radio" name="batchScope" checked={batchPrintScope === 'teams'} onChange={() => setBatchPrintScope('teams')} />
              Par équipe
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: 'var(--text-primary)', marginTop: 8 }}>
              <input type="radio" name="batchScope" checked={batchPrintScope === 'events'} onChange={() => setBatchPrintScope('events')} />
              Par événement
            </label>
          </div>

          {batchPrintScope === 'teams' && (
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: 10, maxHeight: 180, overflowY: 'auto' }}>
              <input
                type="text"
                placeholder="Filtrer les équipes…"
                value={batchPrintTeamSearch}
                onChange={e => setBatchPrintTeamSearch(e.target.value)}
                className="cs-input"
                style={{ marginBottom: 8, width: '100%', fontSize: 13 }}
              />
              {batchPrintTeams
                .filter(t => t.toLowerCase().includes(batchPrintTeamSearch.toLowerCase()))
                .map(t => (
                <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', padding: '3px 0', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={batchPrintSelectedTeams.includes(t)}
                    onChange={e => {
                      if (e.target.checked) setBatchPrintSelectedTeams(prev => [...prev, t]);
                      else setBatchPrintSelectedTeams(prev => prev.filter(x => x !== t));
                    }}
                  />
                  {t}
                </label>
              ))}
              {batchPrintTeams.filter(t => t.toLowerCase().includes(batchPrintTeamSearch.toLowerCase())).length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aucune équipe trouvée</p>
              )}
            </div>
          )}

          {batchPrintScope === 'events' && (
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: 10, maxHeight: 180, overflowY: 'auto' }}>
              <input
                type="text"
                placeholder="Filtrer les événements…"
                value={batchPrintEventSearch}
                onChange={e => setBatchPrintEventSearch(e.target.value)}
                className="cs-input"
                style={{ marginBottom: 8, width: '100%', fontSize: 13 }}
              />
              {batchPrintEvents
                .filter(([, label]) => label.toLowerCase().includes(batchPrintEventSearch.toLowerCase()))
                .map(([key, label]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', padding: '3px 0', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={batchPrintSelectedEvents.includes(key)}
                    onChange={e => {
                      if (e.target.checked) setBatchPrintSelectedEvents(prev => [...prev, key]);
                      else setBatchPrintSelectedEvents(prev => prev.filter(x => x !== key));
                    }}
                  />
                  {label}
                </label>
              ))}
              {batchPrintEvents.filter(([, label]) => label.toLowerCase().includes(batchPrintEventSearch.toLowerCase())).length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aucun événement trouvé</p>
              )}
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-primary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={batchPrintSeparators} onChange={e => setBatchPrintSeparators(e.target.checked)} />
            Insérer une page de séparation entre les groupes
          </label>

          <p style={{ fontSize: 13, color: 'var(--text-secondary)', background: 'var(--bg-hover)', borderRadius: 8, padding: '8px 12px' }}>
            {batchPrintCount} facture{batchPrintCount !== 1 ? 's' : ''} seront incluses dans le PDF.
          </p>

          {batchPrintProgress ? (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                Génération {batchPrintProgress.current}/{batchPrintProgress.total}…
              </p>
              <div style={{ marginTop: 8, height: 4, background: 'var(--bg-hover)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(batchPrintProgress.current / batchPrintProgress.total) * 100}%`, background: 'var(--accent)', borderRadius: 4, transition: 'width 0.2s' }} />
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowBatchPrintModal(false)}
                style={{ padding: '8px 16px', fontSize: 13, background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 8, cursor: 'pointer' }}
              >
                Annuler
              </button>
              <button
                onClick={batchPrintInvoices}
                disabled={batchPrintCount === 0}
                style={{
                  padding: '8px 16px', fontSize: 13, fontWeight: 500,
                  background: batchPrintCount === 0 ? 'var(--bg-hover)' : 'var(--accent)',
                  color: batchPrintCount === 0 ? 'var(--text-muted)' : 'white',
                  border: 'none', borderRadius: 8,
                  cursor: batchPrintCount === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                Générer le PDF
              </button>
            </div>
          )}
        </div>
      </StandardModal>

    </div>
  );
}

function SponsorEmailModalWrapper({
  invoice,
  onClose,
  onSend,
  resolvePlaceholders
}: {
  invoice: Invoice;
  onClose: () => void;
  onSend: (invoice: Invoice, subject: string, message: string) => Promise<void>;
  resolvePlaceholders: (template: string, invoice: Invoice, clubName: string, seasonName: string) => string;
}) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: finance } = await supabase
        .from('finance_config')
        .select('sponsoring_email_subject, sponsoring_email_message')
        .maybeSingle();

      const { data: club } = await supabase
        .from('club_settings')
        .select('club_name')
        .maybeSingle();

      const clubName = club?.club_name || '';
      const seasonName = invoice.season?.name || '';

      const defaultSubject = 'Facture de sponsoring {numero} — {club}';
      const defaultMessage = `Madame, Monsieur,\n\nNous vous remercions chaleureusement de votre soutien à notre club. Vous trouverez en annexe la facture {numero} relative à votre partenariat, d'un montant de {montant}, payable jusqu'au {echeance}.\n\nAvec nos salutations sportives,\n{club}`;

      const rawSubject = finance?.sponsoring_email_subject || defaultSubject;
      const rawMessage = finance?.sponsoring_email_message || defaultMessage;

      setSubject(resolvePlaceholders(rawSubject, invoice, clubName, seasonName));
      setMessage(resolvePlaceholders(rawMessage, invoice, clubName, seasonName));
      setLoaded(true);
    })();
  }, []);

  if (!loaded) return null;

  return (
    <SponsorEmailModal
      isOpen={true}
      onClose={onClose}
      recipientEmail={invoice.sponsor?.email || '—'}
      defaultSubject={subject}
      defaultMessage={message}
      onSend={async (s, m) => {
        await onSend(invoice, s, m);
      }}
    />
  );
}
