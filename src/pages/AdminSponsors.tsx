import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, CreditCard as Edit2, Trash2, X as CloseIcon, Upload, Eye, X, Pencil, Download, ChartBar as BarChart2, Handshake, TriangleAlert as AlertTriangle, Package, FileText, Save, CircleMinus, Wallet, Gift } from 'lucide-react';
import SearchInput from '../components/ui/SearchInput';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Cell } from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { useTheme } from '../context/ThemeContext';
import { useModuleAccess } from '../hooks/useModuleAccess';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import { SortableHeader } from '../components/SortableHeader';
import MemberLinkSelector from '../components/MemberLinkSelector';
import SponsorDetailSlideOver from '../components/SponsorDetailSlideOver';
import PhoneInput from '../components/PhoneInput';
import useEscapeKey from '../hooks/useEscapeKey';
import ConfirmModal from '../components/ConfirmModal';
import { Toggle } from '../components/Toggle';
import PageTitleCount from '../components/PageTitleCount';
import { Tabs } from '../components/ui/Tabs';
import Button from '../components/ui/Button';
import { ZoomablePhoto } from '../components/PhotoViewer';

interface Sponsor {
  id: string;
  company_name: string;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_member_id: string | null;
  email: string | null;
  phone: string | null;
  company_phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  sponsoring_type: string | null;
  sponsoring_amount: number | null;
  sponsoring_since: string | null;
  logo_url: string | null;
  website_url: string | null;
  notes: string | null;
  active: boolean;
  display_logo: boolean;
  display_boost: number;
  show_in_directory?: boolean;
  non_renewal_reason: string | null;
  status: string | null;
  latest_contract?: { amount: number | null }[];
  latest_contract_end?: string | null;
  latest_contract_amount?: number | null;
  latest_contract_prestation?: number | null;
  prestation_summary?: string;
  includes_club500?: boolean;
}

interface SponsorContract {
  id: string;
  sponsor_id: string;
  contract_number: number;
  start_date: string;
  end_date: string | null;
  duration_years: number | null;
  amount: number | null;
  prestation_value: number | null;
  tacit_renewal: boolean;
  contract_file_url: string | null;
  notes: string | null;
  created_at: string;
}

interface PrestationType {
  id: string;
  name: string;
  category: string;
  list_price: number | null;
  active: boolean;
}

interface PrestationLine {
  id?: string;
  prestation_type_id: string;
  quantity: number;
  value: number | null;
  detail: string;
  _typeName?: string;
  _typeCategory?: string;
}

const PREST_CAT_LABELS: Record<string, string> = {
  package: 'Package',
  club500: 'Club des 500',
  panneau: 'Panneau',
  livret: 'Livret',
  textile: 'Textile / équipement',
  invitation: 'Invitation',
  autre: 'Autre',
};

type PageTab = 'sponsors' | 'statistiques';

interface CarouselRow {
  id: string;
  company_name: string;
  logo_url: string | null;
  base_amount: number;
  display_boost: number;
  display_weight: number;
  display_share: number;
}

function DisplayBoostSlider({
  value,
  onChange,
  disabled,
  sponsorId,
  baseAmount,
  sponsorStatus,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
  sponsorId: string | null;
  baseAmount: number;
  sponsorStatus?: string | null;
}) {
  const [carouselData, setCarouselData] = useState<CarouselRow[]>([]);

  useEffect(() => {
    supabase.rpc('get_sponsor_carousel').then(({ data }) => {
      if (data) setCarouselData(data as CarouselRow[]);
    });
  }, []);

  const factor = Math.pow(3, value / 10);
  const factorStr = factor.toFixed(1);

  const estimatedShare = useMemo(() => {
    const myWeight = Math.max(500, baseAmount) * Math.pow(3, value / 10);
    let totalWeight = myWeight;
    for (const row of carouselData) {
      if (row.id === sponsorId) continue;
      totalWeight += row.display_weight;
    }
    if (!sponsorId && carouselData.length === 0) return 100;
    return totalWeight > 0 ? Math.round((myWeight / totalWeight) * 100) : 0;
  }, [carouselData, value, sponsorId, baseAmount]);

  return (
    <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
        Priorit&eacute; d'affichage
      </label>
      {disabled ? (
        <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
          Non affiché : logo masqué
        </p>
      ) : sponsorStatus && sponsorStatus !== 'actif' && sponsorStatus !== 'en_négociation' ? (
        <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
          Non affiché : statut &ne; actif
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={-10}
              max={10}
              step={1}
              value={value}
              onChange={(e) => onChange(Number(e.target.value))}
              className="flex-1"
              style={{ accentColor: 'var(--primary)' }}
            />
            <span
              style={{
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: '999px',
                fontSize: '12px',
                fontWeight: 700,
                background: value === 0 ? 'var(--bg-hover)' : value > 0 ? 'var(--success-soft)' : 'var(--warning-soft)',
                color: value === 0 ? 'var(--text-secondary)' : value > 0 ? 'var(--success-text)' : 'var(--warning-text)',
                minWidth: '36px',
                textAlign: 'center',
              }}
            >
              {value > 0 ? '+' : ''}{value}
            </span>
          </div>
          <div className="flex justify-between mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>Moins souvent</span>
            <span>Normal</span>
            <span>Plus souvent</span>
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
            Facteur &times;{factorStr} &mdash; part estim&eacute;e des affichages : {estimatedShare}&nbsp;%
          </p>
        </>
      )}
    </div>
  );
}

export default function AdminSponsors() {
  const { user, effectiveRole } = useAuth();
  const { clubId } = useTenant();
  const { canEdit, loading: accessLoading } = useModuleAccess('sponsors');
  const [loading, setLoading] = useState(true);
  const [pageTab, setPageTab] = useState<PageTab>('sponsors');

  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [selectedSponsor, setSelectedSponsor] = useState<Sponsor | null>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [showModal, setShowModal] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  const [sortField, setSortField] = useState<string>('company_name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [searchQuery, setSearchQuery] = useState<string>('');

  const [uploadingContract, setUploadingContract] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showContractForm, setShowContractForm] = useState(false);
  const [contracts, setContracts] = useState<any[]>([]);
  const [allContractsRaw, setAllContractsRaw] = useState<any[]>([]);
  const [allTotalsRaw, setAllTotalsRaw] = useState<any[]>([]);
  const [contractFormData, setContractFormData] = useState({
    start_date: '',
    duration_years: 1,
    amount: 0,
    prestation_value: 0,
    notes: '',
    contract_file_url: ''
  });
  const [editingContractId, setEditingContractId] = useState<string | null>(null);
  const [contractTacitRenewal, setContractTacitRenewal] = useState(false);
  const [prestationTypes, setPrestationTypes] = useState<PrestationType[]>([]);
  const [prestationLines, setPrestationLines] = useState<PrestationLine[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { toast, showToast } = useToast();

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

  useEffect(() => { document.title = 'Sponsors - ClubSphere' }, [])

  useEffect(() => {
    fetchSponsors();
    loadPrestationTypes();
  }, []);

  const handleCloseSponsorDetail = useCallback(() => {
    setSelectedSponsor(null);
  }, []);

  const handleCloseModal = useCallback(() => {
    setShowModal(false);
  }, []);

  useEscapeKey(handleCloseSponsorDetail);
  useEscapeKey(handleCloseModal);

  const fetchSponsors = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('sponsors')
        .select(`
          *,
          latest_contract:sponsor_contracts(amount)
        `)
        .order('start_date', { foreignTable: 'sponsor_contracts', ascending: false })
        .limit(1, { foreignTable: 'sponsor_contracts' })
        .order('company_name');

      const { data: contracts } = await supabase
        .from('sponsor_contracts')
        .select('sponsor_id, end_date, amount, prestation_value, start_date, contract_number, id')
        .order('start_date', { ascending: false });
      setAllContractsRaw(contracts || []);

      const { data: totalsData } = await supabase
        .from('v_sponsor_contract_totals')
        .select('contract_id, theoretical_value, prestation_count, includes_club500');
      setAllTotalsRaw(totalsData || []);

      const { data: allPrestLines } = await supabase
        .from('sponsor_contract_prestations')
        .select('contract_id, quantity, value, detail, prestation_type_id, type:sponsor_prestation_types(name, category)')
        .order('created_at');
      const mappedPrestLines = (allPrestLines || []).map((p: any) => ({
        contract_id: p.contract_id,
        quantity: Number(p.quantity),
        value: p.value != null ? Number(p.value) : null,
        detail: p.detail,
        type_name: p.type?.name || '',
        type_category: p.type?.category || '',
      }));

      if (error) {
        console.error('Error fetching sponsors:', error);
      } else if (data) {
        const today = new Date().toISOString().split('T')[0];
        const sponsorsWithContracts = data.map(s => {
          const sponsorContracts = contracts?.filter(
            c => c.sponsor_id === s.id
          ) || [];
          const currentContract = sponsorContracts.find(
            c => c.start_date <= today && c.end_date && c.end_date >= today
          );
          const bestContract = currentContract
            || sponsorContracts.reduce<typeof sponsorContracts[0] | null>(
              (best, c) => (!best || (c.contract_number || 0) > (best.contract_number || 0)) ? c : best,
              null
            );
          const totals = bestContract ? totalsData?.find(t => t.contract_id === bestContract.id) : null;
          let prestSummary = '';
          if (totals && totals.prestation_count > 0 && bestContract) {
            const lines = mappedPrestLines?.filter(p => p.contract_id === bestContract.id) || [];
            prestSummary = lines.map(l => {
              let s = l.type_name || '';
              if (l.quantity > 1) s += ` ×${l.quantity}`;
              if (l.detail) s += ` ${l.detail}`;
              return s;
            }).join(' · ');
          }
          return {
            ...s,
            latest_contract_end: bestContract?.end_date || null,
            latest_contract_amount: bestContract?.amount ||
              s.sponsoring_amount || 0,
            latest_contract_prestation: bestContract?.prestation_value || 0,
            prestation_summary: prestSummary,
            includes_club500: totals?.includes_club500 || false,
          };
        });
        setSponsors(sponsorsWithContracts);
      }
    } catch (err) {
      console.error('Unexpected error fetching sponsors:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchContracts = async (sponsorId: string) => {
    const { data } = await supabase
      .from('sponsor_contracts')
      .select('*')
      .eq('sponsor_id', sponsorId)
      .order('start_date', { ascending: false });
    if (data) setContracts(data);
  };

  const loadPrestationTypes = async () => {
    const { data } = await supabase
      .from('sponsor_prestation_types')
      .select('id, name, category, list_price, active')
      .order('display_order');
    if (data) setPrestationTypes(data);
  };

  const loadPrestationLines = async (contractId: string) => {
    const { data } = await supabase
      .from('sponsor_contract_prestations')
      .select('id, prestation_type_id, quantity, value, detail')
      .eq('contract_id', contractId);
    if (data) {
      setPrestationLines(data.map(l => ({
        ...l,
        quantity: Number(l.quantity),
        value: l.value != null ? Number(l.value) : null,
        _typeName: prestationTypes.find(t => t.id === l.prestation_type_id)?.name || '',
        _typeCategory: prestationTypes.find(t => t.id === l.prestation_type_id)?.category || '',
      })));
    } else {
      setPrestationLines([]);
    }
  };

  const savePrestationLines = async (contractId: string) => {
    await supabase.from('sponsor_contract_prestations').delete().eq('contract_id', contractId);
    if (prestationLines.length === 0) return;
    const rows = prestationLines.map(l => ({
      contract_id: contractId,
      prestation_type_id: l.prestation_type_id,
      quantity: l.quantity,
      value: l.value,
      detail: l.detail || null,
    }));
    await supabase.from('sponsor_contract_prestations').insert(rows);
  };

  const addPrestationLine = () => {
    setPrestationLines(prev => [...prev, { prestation_type_id: '', quantity: 1, value: null, detail: '' }]);
  };

  const updatePrestationLine = (idx: number, patch: Partial<PrestationLine>) => {
    setPrestationLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  };

  const removePrestationLine = (idx: number) => {
    setPrestationLines(prev => prev.filter((_, i) => i !== idx));
  };

  const theoreticalValue = prestationLines.reduce((sum, l) => sum + (l.value || 0) * l.quantity, 0);

  // === STATS STATE ===
  interface ImpressionRow { sponsor_id: string; date: string; count: number; }
  const [impressionsData, setImpressionsData] = useState<ImpressionRow[]>([]);
  const [allImpressionsData, setAllImpressionsData] = useState<{ sponsor_id: string; count: number }[]>([]);
  const [carouselRows, setCarouselRows] = useState<CarouselRow[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsSortField, setStatsSortField] = useState<string>('lifetime');
  const [statsSortDir, setStatsSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (pageTab === 'statistiques') {
      loadStatsData();
    }
  }, [pageTab]);

  const loadStatsData = async () => {
    setStatsLoading(true);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    const [recentRes, allRes, carouselRes] = await Promise.all([
      supabase
        .from('sponsor_impressions')
        .select('sponsor_id, date, count')
        .gte('date', thirtyDaysAgoStr)
        .order('date', { ascending: true }),
      supabase
        .from('sponsor_impressions')
        .select('sponsor_id, count'),
      supabase.rpc('get_sponsor_carousel'),
    ]);

    setImpressionsData(recentRes.data || []);
    setAllImpressionsData(allRes.data || []);
    setCarouselRows((carouselRes.data || []) as CarouselRow[]);
    setStatsLoading(false);
  };

  const statsAggregated = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const firstOfMonth = new Date();
    firstOfMonth.setDate(1);
    const firstOfMonthStr = firstOfMonth.toISOString().split('T')[0];
    const todayStr = today;

    // Lifetime totals per sponsor
    const lifetimeMap = new Map<string, number>();
    for (const row of allImpressionsData) {
      lifetimeMap.set(row.sponsor_id, (lifetimeMap.get(row.sponsor_id) || 0) + row.count);
    }

    // Monthly and today per sponsor (from 30-day data)
    const monthMap = new Map<string, number>();
    const todayMap = new Map<string, number>();
    for (const row of impressionsData) {
      if (row.date >= firstOfMonthStr) {
        monthMap.set(row.sponsor_id, (monthMap.get(row.sponsor_id) || 0) + row.count);
      }
      if (row.date === todayStr) {
        todayMap.set(row.sponsor_id, (todayMap.get(row.sponsor_id) || 0) + row.count);
      }
    }

    const activeSponsors = sponsors.filter(s => s.status === 'actif');
    const carouselMap = new Map(carouselRows.map(c => [c.id, c]));

    const rows = activeSponsors.map(s => {
      const lifetime = lifetimeMap.get(s.id) || 0;
      const month = monthMap.get(s.id) || 0;
      const todayCount = todayMap.get(s.id) || 0;
      const contractCash = s.latest_contract_amount || 0;
      const contractPrestation = s.latest_contract_prestation || 0;
      const contractAmount = contractCash + contractPrestation;
      const cr = carouselMap.get(s.id);
      return {
        id: s.id,
        company_name: s.company_name,
        logo_url: s.logo_url,
        contractAmount,
        contractCash,
        contractPrestation,
        lifetime,
        month,
        today: todayCount,
        displayShare: cr?.display_share ?? null as number | null,
      };
    });

    const rowsWithPercent = rows;

    // Totals
    const totalLifetime = [...lifetimeMap.values()].reduce((a, b) => a + b, 0);
    const totalMonth = [...monthMap.values()].reduce((a, b) => a + b, 0);
    const totalToday = [...todayMap.values()].reduce((a, b) => a + b, 0);

    // Daily totals for line chart
    const dailyMap = new Map<string, number>();
    for (const row of impressionsData) {
      dailyMap.set(row.date, (dailyMap.get(row.date) || 0) + row.count);
    }
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dailyChart: { date: string; impressions: number }[] = [];
    const cursor = new Date(thirtyDaysAgo);
    const endDate = new Date(todayStr);
    while (cursor <= endDate) {
      const d = cursor.toISOString().split('T')[0];
      dailyChart.push({ date: d, impressions: dailyMap.get(d) || 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    // Top 10 for bar chart
    const top10 = [...rowsWithPercent]
      .sort((a, b) => b.lifetime - a.lifetime)
      .slice(0, 10);

    // 30-day sum per sponsor for bar chart
    const thirtyDaySumMap = new Map<string, number>();
    for (const row of impressionsData) {
      thirtyDaySumMap.set(row.sponsor_id, (thirtyDaySumMap.get(row.sponsor_id) || 0) + row.count);
    }
    const top10Bar = top10.map(r => ({
      name: r.company_name.length > 20 ? r.company_name.slice(0, 18) + '...' : r.company_name,
      fullName: r.company_name,
      impressions: thirtyDaySumMap.get(r.id) || 0,
    }));

    return { rows: rowsWithPercent, totalLifetime, totalMonth, totalToday, dailyChart, top10Bar };
  }, [sponsors, impressionsData, allImpressionsData, carouselRows]);

  const sortedStatsRows = useMemo(() => {
    const rows = [...statsAggregated.rows];
    rows.sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0;
      switch (statsSortField) {
        case 'name': av = a.company_name.toLowerCase(); bv = b.company_name.toLowerCase(); break;
        case 'contract': av = a.contractAmount; bv = b.contractAmount; break;
        case 'lifetime': av = a.lifetime; bv = b.lifetime; break;
        case 'month': av = a.month; bv = b.month; break;
        case 'today': av = a.today; bv = b.today; break;
        case 'weight': av = a.displayShare ?? -1; bv = b.displayShare ?? -1; break;
        default: av = a.lifetime; bv = b.lifetime;
      }
      if (av < bv) return statsSortDir === 'asc' ? -1 : 1;
      if (av > bv) return statsSortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return rows;
  }, [statsAggregated.rows, statsSortField, statsSortDir]);

  const handleStatsSort = (field: string) => {
    if (statsSortField === field) {
      setStatsSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setStatsSortField(field);
      setStatsSortDir('desc');
    }
  };

  const handleOpenModal = (sponsor: any = null) => {
    if (sponsor) {
      setEditingItem(sponsor);
      setFormData(sponsor);
      if (sponsor.id) {
        fetchContracts(sponsor.id);
      }
    } else {
      setEditingItem(null);
      setContracts([]);
      setFormData({ active: true, status: 'actif', display_logo: true, display_boost: 0, show_in_directory: true });
    }
    setLogoFile(null);
    setLogoPreview(null);
    setLogoError(null);
    setLogoUploading(false);
    setPrestationLines([]);
    setContractTacitRenewal(false);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let dataToSubmit = { ...formData };
    const { sponsoring_amount, ...sponsorData } = dataToSubmit;
    dataToSubmit = sponsorData;

    if (editingItem) {
      const { error } = await supabase
        .from('sponsors')
        .update(dataToSubmit)
        .eq('id', editingItem.id);

      if (!error) {
        await fetchSponsors();
        setShowModal(false);
      } else {
        showToast('Erreur: ' + error.message, 'error');
      }
    } else {
      const { error } = await supabase
        .from('sponsors')
        .insert([dataToSubmit]);

      if (!error) {
        await fetchSponsors();
        setShowModal(false);
      } else {
        showToast('Erreur: ' + error.message, 'error');
      }
    }
  };

  const uploadLogoToStorage = async (sponsorId: string, file: File): Promise<string | null> => {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const path = `${clubId}/${sponsorId}.${ext}`;
    const { error } = await supabase.storage.from('sponsor-logos').upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from('sponsor-logos').getPublicUrl(path);
    return `${urlData.publicUrl}?v=${Date.now()}`;
  };

  const handleRemoveLogo = async () => {
    const currentUrl = formData.logo_url || '';
    if (currentUrl.includes('/sponsor-logos/') && formData.id && clubId) {
      const ext = currentUrl.split('.').pop()?.split('?')[0] || 'png';
      await supabase.storage.from('sponsor-logos').remove([`${clubId}/${formData.id}.${ext}`]);
    }
    setFormData({ ...formData, logo_url: null });
    setLogoFile(null);
    setLogoPreview(null);
    setLogoError(null);
  };

  const handleLogoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLogoError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (!ALLOWED.includes(file.type)) {
      setLogoError('Format non pris en charge');
      e.target.value = '';
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError('Fichier trop volumineux (max 2 Mo)');
      e.target.value = '';
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleSaveSponsor = async () => {
    const sponsorData = {
      company_name: formData.company_name,
      contact_first_name: formData.contact_first_name || null,
      contact_last_name: formData.contact_last_name || null,
      email: formData.email || null,
      phone: formData.phone || null,
      company_phone: formData.company_phone || null,
      address: formData.address || null,
      postal_code: formData.postal_code || null,
      city: formData.city || null,
      sponsoring_type: formData.sponsoring_type || null,
      sponsoring_since: formData.sponsoring_since || null,
      status: formData.status || 'actif',
      logo_url: formData.logo_url || null,
      website_url: formData.website_url || null,
      notes: formData.notes || null,
      display_logo: formData.display_logo !== false,
      display_boost: formData.display_boost ?? 0,
      show_in_directory: formData.show_in_directory !== false,
      active: formData.status === 'actif' ||
              formData.status === 'en_négociation',
    };

    let sponsorId = formData.id;

    if (sponsorId) {
      const { error } = await supabase
        .from('sponsors')
        .update(sponsorData)
        .eq('id', sponsorId);
      if (error) {
        setError('Erreur: ' + error.message + (error.hint ? ' | ' + error.hint : ''));
        return;
      }
    } else {
      const { data: inserted, error } = await supabase
        .from('sponsors')
        .insert([sponsorData])
        .select('id')
        .single();
      if (error || !inserted) {
        setError('Erreur: ' + (error?.message || 'Impossible de créer le sponsor') + (error?.hint ? ' | ' + error.hint : ''));
        return;
      }
      sponsorId = inserted.id;
    }

    if (logoFile && clubId) {
      setLogoUploading(true);
      try {
        const publicUrl = await uploadLogoToStorage(sponsorId, logoFile);
        if (publicUrl) {
          await supabase.from('sponsors').update({ logo_url: publicUrl }).eq('id', sponsorId);
        }
      } catch (err: any) {
        setLogoUploading(false);
        setLogoError(`Échec du téléversement : ${err.message}`);
        fetchSponsors();
        return;
      }
      setLogoUploading(false);
    }

    fetchSponsors();
    setShowModal(false);
    setFormData({});
    setLogoFile(null);
    setLogoPreview(null);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('sponsors')
      .delete()
      .eq('id', id);

    if (!error) {
      await fetchSponsors();
    } else {
      showToast('Erreur suppression: ' + error.message, 'error');
    }
  };

  const handleToggleDisplayLogo = async (sponsorId: string, currentValue: boolean) => {
    const newValue = !currentValue;
    const { error } = await supabase
      .from('sponsors')
      .update({ display_logo: newValue })
      .eq('id', sponsorId);

    if (!error) {
      setSponsors(prev => prev.map(s => s.id === sponsorId ? { ...s, display_logo: newValue } : s));
      if (selectedSponsor?.id === sponsorId) {
        setSelectedSponsor(prev => prev ? { ...prev, display_logo: newValue } : null);
      }
    } else {
      showToast('Erreur: ' + error.message, 'error');
    }
  };

  const handleExportExcel = async () => {
    try {
    const XLSX = await import('xlsx');

    const { data: allSponsors } = await supabase
      .from('sponsors')
      .select('*')
      .order('company_name');

    const { data: allContracts } = await supabase
      .from('sponsor_contracts')
      .select('*')
      .order('start_date', { ascending: true });

    if (!allSponsors) return;

    const formatDate = (d: string | null) => {
      if (!d) return '';
      const date = new Date(d);
      return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
    };

    const rows = allSponsors.map(s => {
      const sponsorContracts = allContracts?.filter(c => c.sponsor_id === s.id) || [];
      const types = sponsorContracts.length > 0
        ? [...new Set(sponsorContracts.map(c => c.notes || s.sponsoring_type).filter(Boolean))].join(', ') || s.sponsoring_type || '—'
        : s.sponsoring_type || '—';
      const totalAmount = sponsorContracts.length > 0
        ? sponsorContracts.reduce((sum, c) => sum + (c.amount || 0), 0)
        : s.sponsoring_amount || 0;
      const firstStart = sponsorContracts[0]?.start_date || s.sponsoring_since || null;
      const lastEnd = sponsorContracts.length > 0
        ? sponsorContracts[sponsorContracts.length - 1]?.end_date
        : null;
      const statusLabel = s.status === 'actif' ? 'Actif'
        : s.status === 'non_renouvelé' ? 'Non renouvelé'
        : s.status === 'expiré' ? 'Expiré'
        : s.status === 'en_négociation' ? 'En négociation'
        : s.active ? 'Actif' : 'Inactif';

      return {
        'Nom entreprise': s.company_name || '',
        'Type(s) de sponsoring': types,
        'Montant sponsoring (CHF)': totalAmount,
        'Statut': statusLabel,
        'Affichage logo': s.display_logo ? 'Oui' : 'Non',
        'Priorité d\'affichage': s.display_boost ?? 0,
        'Prénom contact': s.contact_first_name || '',
        'Nom contact': s.contact_last_name || '',
        'Email': s.email || '',
        'Téléphone société': s.company_phone || '',
        'Mobile contact': s.phone || '',
        'Site web': s.website_url || '',
        'Logo URL': s.logo_url || '',
        'Adresse': s.address || '',
        'Code postal': s.postal_code || '',
        'Ville': s.city || '',
        'Date début': formatDate(firstStart),
        'Date fin': formatDate(lastEnd),
        'Nombre de contrats': sponsorContracts.length,
        'Notes': s.notes || '',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 30 }, { wch: 20 }, { wch: 18 }, { wch: 14 }, { wch: 14 },
      { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 30 }, { wch: 18 },
      { wch: 18 }, { wch: 30 }, { wch: 40 }, { wch: 30 }, { wch: 10 },
      { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 40 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sponsors');

    const today = new Date().toISOString().slice(0, 10);
    const filename = `sponsors-export-${today}.xlsx`;

    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`${rows.length} sponsors exportés`, 'success');
    } catch (e) { console.error('Export failed', e); showToast("L'export n'a pas pu être généré. Rechargez la page et réessayez.", 'error'); }
  };

  const handleContractFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      showToast('Veuillez sélectionner un fichier PDF', 'warning');
      return;
    }

    setUploadingContract(true);
    setUploadProgress(0);

    try {
      const sponsorId = editingItem?.id;
      if (!sponsorId) {
        showToast('Veuillez d\'abord enregistrer le sponsor', 'warning');
        setUploadingContract(false);
        return;
      }

      const fileName = `${Date.now()}_${file.name}`;
      const filePath = `sponsors/${sponsorId}/${fileName}`;

      const { data, error } = await supabase.storage
        .from('contracts')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.error('Upload error:', error);
        showToast('Erreur lors du téléchargement du contrat', 'error');
        setUploadingContract(false);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('contracts')
        .getPublicUrl(filePath);

      setContractFormData({ ...contractFormData, contract_file_url: publicUrl });
      setUploadProgress(100);
    } catch (err) {
      console.error('Upload error:', err);
      showToast('Erreur lors du téléchargement', 'error');
    } finally {
      setTimeout(() => {
        setUploadingContract(false);
        setUploadProgress(0);
      }, 500);
    }
  };

  const handleSaveContract = async () => {
    console.log('Button clicked!');
    console.log('Button state:', {
      hasEditingItem: !!editingItem?.id,
      hasDate: !!contractFormData.start_date,
      hasAmount: contractFormData.amount > 0,
      contractFormData
    });

    if (!editingItem?.id) {
      showToast('Veuillez d\'abord enregistrer le sponsor', 'warning');
      return;
    }

    if (!contractFormData.start_date || contractFormData.amount <= 0) {
      showToast('Veuillez remplir les champs obligatoires (date et montant > 0)', 'warning');
      return;
    }

    const endDate = new Date(contractFormData.start_date);
    endDate.setFullYear(endDate.getFullYear() + contractFormData.duration_years);
    endDate.setDate(endDate.getDate() - 1);

    const contractPayload = {
      start_date: contractFormData.start_date,
      end_date: endDate.toISOString().split('T')[0],
      amount: contractFormData.amount,
      prestation_value: contractFormData.prestation_value || 0,
      tacit_renewal: contractTacitRenewal,
      notes: contractFormData.notes || null,
      contract_file_url: contractFormData.contract_file_url || null
    };

    let saveError;
    let savedId = editingContractId;
    if (editingContractId) {
      const { error } = await supabase
        .from('sponsor_contracts')
        .update(contractPayload)
        .eq('id', editingContractId);
      saveError = error;
    } else {
      const { data: inserted, error } = await supabase
        .from('sponsor_contracts')
        .insert([{ sponsor_id: editingItem.id, ...contractPayload }])
        .select('id')
        .single();
      saveError = error;
      if (inserted) savedId = inserted.id;
    }

    if (saveError) {
      console.error('Save contract error:', saveError);
      showToast(`Erreur lors de l'enregistrement: ${saveError.message}`, 'error');
      return;
    }

    if (savedId) {
      await savePrestationLines(savedId);
    }

    fetchContracts(editingItem.id);
    fetchSponsors();
    setShowContractForm(false);
    setEditingContractId(null);
    setPrestationLines([]);
    setContractTacitRenewal(false);
    setContractFormData({
      start_date: '',
      duration_years: 1,
      amount: 0,
      prestation_value: 0,
      notes: '',
      contract_file_url: ''
    });
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const formatCHF = (amount: number) =>
    new Intl.NumberFormat('fr-CH', {
      style: 'currency',
      currency: 'CHF',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);

  const SponsorTimeline = ({ sponsors }: { sponsors: Sponsor[] }) => {
    const { resolvedMode } = useTheme();
    const sponsorsWithDates = sponsors.filter(s => s.sponsoring_since);

    if (sponsorsWithDates.length === 0) {
      return null;
    }

    const allDates = sponsorsWithDates.flatMap(s => [
      new Date(s.sponsoring_since!),
      s.latest_contract_end
        ? new Date(s.latest_contract_end)
        : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    ]);

    const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));

    minDate.setMonth(minDate.getMonth() - 3);
    maxDate.setMonth(maxDate.getMonth() + 3);

    const totalMs = maxDate.getTime() - minDate.getTime();

    const getPosition = (date: string | Date | null) => {
      if (!date) return 0;
      return ((new Date(date).getTime() - minDate.getTime()) / totalMs) * 100;
    };

    const getWidth = (startDate: string, endDate: string | null) => {
      const start = new Date(startDate).getTime();
      const end = endDate
        ? new Date(endDate).getTime()
        : Date.now() + 365 * 24 * 60 * 60 * 1000;
      return ((end - start) / totalMs) * 100;
    };

    const years = [];
    for (let y = minDate.getFullYear(); y <= maxDate.getFullYear(); y++) {
      const pos = getPosition(new Date(y, 0, 1));
      if (pos >= 0 && pos <= 100) years.push({ year: y, pos });
    }

    const todayPos = getPosition(new Date());

    const sortedSponsors = [...sponsorsWithDates].sort((a, b) =>
      new Date(a.sponsoring_since!).getTime() - new Date(b.sponsoring_since!).getTime()
    );

    return (
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '24px'
      }}>
        <h3 style={{
          color: 'var(--text-primary)',
          fontSize: '15px',
          fontWeight: '700',
          marginBottom: '16px',
          position: 'sticky',
          top: 0,
          zIndex: 3,
          background: 'var(--bg-card)',
          paddingBottom: '4px',
        }}>
          <BarChart2 className="w-4 h-4 inline mr-1" />Timeline des sponsorings
        </h3>

        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: '600px' }}>

            <div style={{
              position: 'relative',
              height: '24px',
              marginLeft: '160px',
              marginBottom: '8px',
              borderBottom: '2px solid var(--border-strong)'
            }}>
              {years.map(({ year, pos }) => (
                <div key={year} style={{
                  position: 'absolute',
                  left: `${pos}%`,
                  transform: 'translateX(-50%)',
                  color: 'var(--text-muted)',
                  fontSize: '11px',
                  fontWeight: '600'
                }}>
                  {year}
                </div>
              ))}
            </div>

            {sortedSponsors.map(sponsor => {
              const startPos = getPosition(sponsor.sponsoring_since!);
              const barWidth = getWidth(
                sponsor.sponsoring_since!,
                sponsor.latest_contract_end || null
              );

              const isExpired = sponsor.status === 'expiré' ||
                sponsor.status === 'non_renouvelé';
              const isExpiringSoon = sponsor.latest_contract_end &&
                new Date(sponsor.latest_contract_end) <
                new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

              const typeColor = sponsor.sponsoring_type === 'Matériel'
                ? 'var(--warning-text)'
                : 'var(--info-text)';

              const barColor = isExpired
                ? 'var(--text-muted)'
                : isExpiringSoon
                ? 'var(--warning-text)'
                : typeColor;

              return (
                <div key={sponsor.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  minHeight: '36px',
                  paddingTop: '6px',
                  paddingBottom: '6px',
                  borderBottom: '1px solid var(--border-color)'
                }}>
                  <div style={{
                    width: '155px',
                    flexShrink: 0,
                    paddingRight: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    {sponsor.logo_url && (
                      <img
                        src={sponsor.logo_url}
                        alt=""
                        style={{
                          width: '20px',
                          height: '20px',
                          objectFit: 'contain',
                          borderRadius: '3px'
                        }}
                      />
                    )}
                    <span style={{
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                      fontWeight: '600',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {sponsor.company_name}
                    </span>
                  </div>

                  <div style={{
                    flex: 1,
                    position: 'relative',
                    height: '28px',
                    background: 'var(--bg-hover)',
                    borderRadius: '4px'
                  }}>
                    <div
                      title={`${sponsor.company_name}: ${
                        new Date(sponsor.sponsoring_since!)
                          .toLocaleDateString('fr-CH')
                      } → ${
                        sponsor.latest_contract_end
                          ? new Date(sponsor.latest_contract_end)
                              .toLocaleDateString('fr-CH')
                          : 'En cours'
                      }`}
                      style={{
                        position: 'absolute',
                        left: `${Math.max(0, startPos)}%`,
                        width: `${Math.min(100 - startPos, barWidth)}%`,
                        height: '100%',
                        background: barColor,
                        borderRadius: '4px',
                        opacity: isExpired ? 0.5 : 0.85,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        paddingLeft: '8px',
                        transition: 'opacity 0.2s'
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.opacity = '1')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.opacity =
                          isExpired ? '0.5' : '0.85')
                      }
                    >
                      {barWidth > 8 && (
                        <span style={{
                          color: 'var(--text-inverse)',
                          fontSize: '10px',
                          fontWeight: '600',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {sponsor.sponsoring_type}
                          {isExpiringSoon && !isExpired && <AlertTriangle className="w-3 h-3 inline ml-1" style={{ color: 'var(--warning)' }} />}
                        </span>
                      )}
                    </div>

                    <div style={{
                      position: 'absolute',
                      left: `${todayPos}%`,
                      top: 0,
                      bottom: 0,
                      width: '2px',
                      background: 'var(--success)',
                      zIndex: 2
                    }} />
                  </div>
                </div>
              );
            })}

            <div style={{
              position: 'relative',
              marginLeft: '160px',
              height: '16px',
              marginTop: '4px'
            }}>
              <div style={{
                position: 'absolute',
                left: `${todayPos}%`,
                transform: 'translateX(-50%)',
                color: 'var(--success)',
                fontSize: '10px',
                fontWeight: '600',
                whiteSpace: 'nowrap'
              }}>
                ● Aujourd'hui
              </div>
            </div>

          </div>
        </div>

        <div style={{
          display: 'flex',
          gap: '16px',
          marginTop: '16px',
          flexWrap: 'wrap'
        }}>
          <span style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--text-muted)',
            fontSize: '12px'
          }}>
            <span style={{
              width: '12px',
              height: '12px',
              background: 'var(--info-text)',
              borderRadius: '2px',
              display: 'inline-block'
            }} />
            Financier
          </span>
          <span style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--text-muted)',
            fontSize: '12px'
          }}>
            <span style={{
              width: '12px',
              height: '12px',
              background: 'var(--warning-text)',
              borderRadius: '2px',
              display: 'inline-block'
            }} />
            Matériel
          </span>
          <span style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--text-muted)',
            fontSize: '12px'
          }}>
            <span style={{
              width: '12px',
              height: '12px',
              background: 'var(--warning)',
              borderRadius: '2px',
              display: 'inline-block'
            }} />
            Expire dans 60 jours
          </span>
          <span style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--text-muted)',
            fontSize: '12px'
          }}>
            <span style={{
              width: '12px',
              height: '12px',
              background: 'var(--text-muted)',
              opacity: 0.5,
              borderRadius: '2px',
              display: 'inline-block'
            }} />
            Expiré / Non renouvelé
          </span>
          <span style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--success)',
            fontSize: '12px'
          }}>
            ● Aujourd'hui
          </span>
        </div>
      </div>
    );
  };

  const SponsorSummaryBand = ({ contractsData, totalsData }: { contractsData: any[]; totalsData: any[] }) => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const seasonStartYear = currentMonth >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    const seasonStart = `${seasonStartYear}-07-01`;
    const seasonEnd = `${seasonStartYear + 1}-06-30`;
    const seasonLabel = `${seasonStartYear}-${seasonStartYear + 1}`;

    const seasonContracts = contractsData.filter(c =>
      c.start_date && c.end_date &&
      c.start_date <= seasonEnd && c.end_date >= seasonStart
    );

    const totalAmount = seasonContracts.reduce((sum: number, c: any) => sum + (c.amount || 0), 0);
    const prestContracts = seasonContracts.filter((c: any) => (c.prestation_value || 0) > 0);
    const totalPrestation = prestContracts.reduce((sum: number, c: any) => sum + (c.prestation_value || 0), 0);

    const seasonContractIds = new Set(seasonContracts.map((c: any) => c.id));
    const seasonTotals = totalsData.filter(t => seasonContractIds.has(t.contract_id));
    const totalContreparties = seasonTotals.reduce((sum: number, t: any) => sum + (t.theoretical_value || 0), 0);
    const contrepartiesCount = seasonTotals.filter((t: any) => (t.theoretical_value || 0) > 0).length;

    const Card = ({
      icon, title, count, total, countLabel, amountPrefix,
    }: {
      icon: React.ReactNode; title: string; count: number; total: number;
      countLabel: string; amountPrefix?: string;
    }) => (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        background: 'rgba(var(--primary-rgb), 0.1)',
        border: '1px solid rgba(var(--primary-rgb), 0.3)',
        borderRadius: '10px',
        padding: '16px 20px',
        flex: 1,
        minWidth: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          <span style={{
            width: 44, height: 44, borderRadius: '50%',
            background: 'rgba(var(--primary-rgb), 0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, color: 'var(--primary)',
          }}>{icon}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{
              color: 'var(--text-muted)', fontSize: '12px',
              textTransform: 'uppercase',
              fontWeight: '600', letterSpacing: '0.05em'
            }}>
              {title}
            </div>
            <div style={{ color: 'var(--text-primary)', fontSize: '11px', marginTop: '2px' }}>
              {countLabel}
            </div>
          </div>
        </div>
        <div style={{
          color: 'var(--text-primary)',
          fontSize: '28px',
          fontWeight: '800',
          letterSpacing: '-0.02em',
          textAlign: 'right',
          whiteSpace: 'nowrap',
        }}>
          {amountPrefix && (
            <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em' }}>
              {amountPrefix}
            </span>
          )}
          {formatCHF(total)}
        </div>
      </div>
    );

    return (
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginTop: '16px',
      }}>
        <Card
          icon={<Wallet size={28} />}
          title={`Somme garantie pour la saison ${seasonLabel}`}
          count={seasonContracts.length}
          total={totalAmount}
          countLabel={`Basé sur ${seasonContracts.length} contrat(s) en cours pour la saison ${seasonLabel}`}
        />
        <Card
          icon={<Package size={28} />}
          title={`Sponsoring en nature garanti pour la saison ${seasonLabel}`}
          count={prestContracts.length}
          total={totalPrestation}
          countLabel={`Basé sur ${prestContracts.length} contrat(s) avec prestations en nature`}
          amountPrefix="valeur estimée"
        />
        <Card
          icon={<Gift size={28} />}
          title={`Valeur catalogue des prestations vendues pour la saison ${seasonLabel}`}
          count={contrepartiesCount}
          total={totalContreparties}
          countLabel={`Tarif de la grille pour les packages, panneaux, livret… accordés aux sponsors`}
          amountPrefix="valeur estimée"
        />
      </div>
    );
  };

  const getFilteredSponsors = () => {
    if (searchQuery.length < 2) return sponsors;

    const query = searchQuery.trim().toLowerCase();
    const parts = query.split(' ').filter(Boolean);

    return sponsors.filter(sponsor => {
      if (parts.length === 1) {
        return (
          sponsor.company_name?.toLowerCase().includes(query) ||
          sponsor.contact_first_name?.toLowerCase().includes(query) ||
          sponsor.contact_last_name?.toLowerCase().includes(query) ||
          sponsor.city?.toLowerCase().includes(query) ||
          sponsor.email?.toLowerCase().includes(query)
        );
      } else {
        const fullName1 = `${sponsor.contact_first_name} ${sponsor.contact_last_name}`.toLowerCase();
        const fullName2 = `${sponsor.contact_last_name} ${sponsor.contact_first_name}`.toLowerCase();
        return (
          sponsor.company_name?.toLowerCase().includes(query) ||
          fullName1.includes(query) ||
          fullName2.includes(query) ||
          sponsor.city?.toLowerCase().includes(query) ||
          sponsor.email?.toLowerCase().includes(query)
        );
      }
    });
  };

  const renderSponsorsTable = () => {
    const filteredSponsors = getFilteredSponsors();
    const sorted = [...filteredSponsors].sort((a, b) => {
      const aVal = a[sortField as keyof Sponsor];
      const bVal = b[sortField as keyof Sponsor];
      if (!aVal) return 1;
      if (!bVal) return -1;
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });

    const canViewAmount = effectiveRole === 'admin' || effectiveRole === 'committee';

    return (
      <div
        className="overflow-x-auto"
        style={{ maxHeight: 'calc(100vh - 240px)', overflowY: 'auto', overflowX: 'auto' }}
      >
        <style>{`
          .sponsors-sticky-head thead th { position: relative; }
          .sponsors-sticky-head thead th::after {
            content: '';
            position: absolute;
            left: 0; right: 0; bottom: -8px;
            height: 8px;
            pointer-events: none;
            background: linear-gradient(to bottom, var(--shadow-sm), transparent);
          }
        `}</style>
        <table className="std-table sponsors-sticky-head" style={{ minWidth: '900px', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ width: '80px', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                Logo
              </th>
              <SortableHeader label="Entreprise" field="company_name" sortField={sortField} sortDir={sortDir} onSort={handleSort} style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }} />
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                Contact
              </th>
              <SortableHeader label="Type" field="sponsoring_type" sortField={sortField} sortDir={sortDir} onSort={handleSort} style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }} />
              {canViewAmount && (
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                  Total
                </th>
              )}
              <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider" style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                Affichage
              </th>
              <SortableHeader label="Statut" field="status" sortField={sortField} sortDir={sortDir} onSort={handleSort} style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }} />
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ width: '100px', minWidth: '100px', position: 'sticky', top: 0, zIndex: 2, background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((sponsor) => (
              <tr key={sponsor.id} className="cursor-pointer" onClick={() => setSelectedSponsor(sponsor)}>
                <td className="px-6 py-4">
                  {sponsor.logo_url ? (
                    <ZoomablePhoto src={sponsor.logo_url} caption={sponsor.company_name} alt="" className="w-10 h-10 object-contain" />
                  ) : (
                    <div className="w-10 h-10 rounded flex items-center justify-center text-xs" style={{ color: 'var(--text-muted)' }} >
                      Logo
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 text-sm font-medium" style={{ maxWidth: '200px' }}>
                  <div className="flex items-center gap-2">
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sponsor.company_name}>
                      {sponsor.company_name}
                    </span>
                    {(() => {
                      if (!sponsor.latest_contract_end) return null;
                      const endDate = new Date(sponsor.latest_contract_end);
                      const days = (endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
                      if (days <= 60 && days > 0) {
                        return <span title="Contrat expire bientôt"><AlertTriangle className="w-4 h-4" style={{ color: 'var(--warning)' }} /></span>;
                      }
                      return null;
                    })()}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {sponsor.contact_first_name && sponsor.contact_last_name
                    ? `${sponsor.contact_first_name} ${sponsor.contact_last_name}`
                    : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {sponsor.sponsoring_type || '-'}
                </td>
                {canViewAmount && (
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {(() => {
                      const cash = sponsor.latest_contract?.[0]?.amount || sponsor.sponsoring_amount || 0;
                      const prest = sponsor.latest_contract_prestation || 0;
                      const total = cash + prest;
                      if (!total) return '-';
                      return (
                        <span title={sponsor.prestation_summary || (prest ? `Sponsoring: CHF ${cash.toLocaleString('fr-CH')} + Prestations: CHF ${prest.toLocaleString('fr-CH')}` : '')}>
                          CHF {total.toLocaleString('fr-CH')}
                          {prest > 0 && (
                            <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
                              dont {prest.toLocaleString('fr-CH')} en nature
                            </span>
                          )}
                          {sponsor.prestation_summary && (
                            <span className="block text-xs truncate" style={{ color: 'var(--text-muted)', maxWidth: '200px' }}>
                              {sponsor.prestation_summary}
                            </span>
                          )}
                        </span>
                      );
                    })()}
                  </td>
                )}
                <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-center">
                    <div style={{ width: '36px', flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                      <Toggle
                        checked={sponsor.display_logo}
                        onChange={() => handleToggleDisplayLogo(sponsor.id, sponsor.display_logo)}
                        disabled={accessLoading || !canEdit}
                        size="sm"
                      />
                    </div>
                    <div style={{ width: '44px', flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                      {sponsor.display_boost !== 0 && (
                        <span
                          title="Priorité d'affichage"
                          style={{
                            display: 'inline-block',
                            padding: '1px 6px',
                            borderRadius: '999px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: 'var(--bg-hover)',
                            color: 'var(--text-secondary)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {sponsor.display_boost > 0 ? '+' : ''}{sponsor.display_boost}
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <div className="flex items-center gap-2 flex-wrap">
                  {sponsor.includes_club500 && (
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, background: 'var(--info-soft)', color: 'var(--info-text)', whiteSpace: 'nowrap' }}>Club des 500</span>
                  )}
                  {sponsor.show_in_directory === false && (
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, background: 'var(--bg-hover)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Confidentiel</span>
                  )}
                  <span className={`px-2 py-1 text-xs font-medium rounded`} style={{
                    background: sponsor.status === 'actif' ? 'var(--success-soft)' :
                      sponsor.status === 'en_négociation' ? 'var(--info-soft)' :
                      sponsor.status === 'non_renouvelé' ? 'var(--danger-soft)' :
                      'var(--bg-hover)',
                    color: sponsor.status === 'actif' ? 'var(--success-text)' :
                      sponsor.status === 'en_négociation' ? 'var(--info-text)' :
                      sponsor.status === 'non_renouvelé' ? 'var(--danger-text)' :
                      'var(--text-muted)'
                  }}>
                    {sponsor.status === 'actif' ? 'Actif' :
                     sponsor.status === 'en_négociation' ? 'En négociation' :
                     sponsor.status === 'non_renouvelé' ? 'Non renouvelé' :
                     sponsor.status === 'expiré' ? 'Expiré' : sponsor.status || '-'}
                  </span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium" style={{ minWidth: '120px' }} onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-2">
                    {!accessLoading && canEdit && (
                      <>
                        <button
                          onClick={() => handleOpenModal(sponsor)}
                          style={{ color: 'var(--accent)' }}
                          title="Modifier"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => {
                            showConfirm({
                              title: 'Supprimer le sponsor',
                              message: 'Êtes-vous sûr de vouloir supprimer ce sponsor ?',
                              confirmLabel: 'Oui, supprimer',
                              cancelLabel: 'Non',
                              confirmStyle: 'danger',
                              onConfirm: () => {
                                hideConfirm();
                                handleDelete(sponsor.id);
                              }
                            });
                          }}
                          style={{ color: 'var(--danger-text)' }}
                          title="Supprimer"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={canViewAmount ? 9 : 8} className="px-6 py-12 text-center" style={{ color: 'var(--text-muted)' }}>
                  Aucun sponsor
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const renderSponsorModal = () => {
    return (
      <form onSubmit={(e) => { e.preventDefault(); handleSaveSponsor(); }} className="p-6 space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-4">1. Entreprise</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-2">Nom entreprise *</label>
              <input
                type="text"
                required
                value={formData.company_name || ''}
                onChange={(e) => setFormData({...formData, company_name: e.target.value})}
                className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Téléphone société</label>
              <PhoneInput
                value={formData.company_phone || ''}
                onChange={(v) => setFormData({ ...formData, company_phone: v })}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-2">Logo</label>
              <div className="flex items-start gap-4">
                <div
                  className="flex-shrink-0 flex items-center justify-center rounded-lg overflow-hidden"
                  style={{ width: 80, height: 80, background: 'var(--bg-hover)', border: '1px solid var(--border-color)' }}
                >
                  {(logoPreview || formData.logo_url) ? (
                    <img src={logoPreview || formData.logo_url} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Aucun logo</span>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <div>
                    <label
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer transition-colors ${logoUploading ? 'opacity-50 pointer-events-none' : ''}`}
                      style={{ background: 'var(--accent)', color: '#fff' }}
                    >
                      {logoUploading ? (
                        <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg> Téléversement…</>
                      ) : (
                        <><Upload size={14} /> Téléverser un logo</>
                      )}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={handleLogoFileSelect}
                        disabled={logoUploading}
                      />
                    </label>
                    {logoFile && <span className="ml-2 text-xs" style={{ color: 'var(--text-secondary)' }}>{logoFile.name}</span>}
                  </div>
                  {logoError && (
                    <p className="text-xs font-medium" style={{ color: 'var(--danger)' }}>{logoError}</p>
                  )}
                  {(formData.logo_url || logoPreview) && (
                    <button type="button" onClick={handleRemoveLogo} className="text-xs underline" style={{ color: 'var(--danger)' }}>
                      Retirer le logo
                    </button>
                  )}
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>… ou lien vers un logo en ligne</label>
                    <input
                      type="text"
                      value={formData.logo_url || ''}
                      onChange={(e) => { setFormData({...formData, logo_url: e.target.value}); setLogoFile(null); setLogoPreview(null); setLogoError(null); }}
                      placeholder="https://…"
                      className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Site web</label>
              <input
                type="url"
                value={formData.website_url || ''}
                onChange={(e) => setFormData({...formData, website_url: e.target.value})}
                className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between py-3 border-t mt-4 pt-4" style={{ borderColor: 'var(--border-color)' }}>
            <div>
              <label className="font-medium" style={{ color: 'var(--text-primary)' }}>
                Afficher le logo dans l'application
              </label>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Le logo sera visible dans le carrousel "Nos Sponsors" sur les tableaux de bord
              </p>
            </div>
            <Toggle
              checked={formData.display_logo !== false}
              onChange={(c) => setFormData({ ...formData, display_logo: c })}
            />
          </div>
          <DisplayBoostSlider
            value={formData.display_boost ?? 0}
            onChange={(v) => setFormData({ ...formData, display_boost: v })}
            disabled={formData.display_logo === false}
            sponsorId={editingItem?.id || null}
            baseAmount={editingItem?.latest_contract_amount ? (editingItem.latest_contract_amount + (editingItem.latest_contract_prestation || 0)) : 500}
            sponsorStatus={formData.status}
          />
          <div className="flex items-center justify-between py-3 border-t mt-4 pt-4" style={{ borderColor: 'var(--border-color)' }}>
            <div>
              <label className="font-medium" style={{ color: 'var(--text-primary)' }}>
                Afficher dans l'annuaire
              </label>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Décochez pour un sponsor discret : il n'apparaît ni dans l'annuaire des membres ni dans le carrousel. Le comité continue de le voir et de le gérer.
              </p>
            </div>
            <Toggle
              checked={formData.show_in_directory !== false}
              onChange={(c) => setFormData({ ...formData, show_in_directory: c })}
            />
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4">2. Contact</h3>
          <MemberLinkSelector
            linkedMemberId={formData.contact_member_id || null}
            onLink={(member) => setFormData({
              ...formData,
              contact_member_id: member.id,
              contact_first_name: member.first_name,
              contact_last_name: member.last_name,
              email: member.email,
              phone: member.phone,
              address: member.address,
              postal_code: member.postal_code,
              city: member.city
            })}
            onUnlink={() => setFormData({...formData, contact_member_id: null})}
          />
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium mb-2">Prénom contact</label>
              <input
                type="text"
                value={formData.contact_first_name || ''}
                onChange={(e) => setFormData({...formData, contact_first_name: e.target.value})}
                className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Nom contact</label>
              <input
                type="text"
                value={formData.contact_last_name || ''}
                onChange={(e) => setFormData({...formData, contact_last_name: e.target.value})}
                className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <input
                type="email"
                value={formData.email || ''}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Mobile</label>
              <PhoneInput
                value={formData.phone || ''}
                onChange={(v) => setFormData({ ...formData, phone: v })}
              />
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4">3. Adresse</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-2">Adresse</label>
              <input
                type="text"
                value={formData.address || ''}
                onChange={(e) => setFormData({...formData, address: e.target.value})}
                className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Code postal</label>
              <input
                type="text"
                value={formData.postal_code || ''}
                onChange={(e) => setFormData({...formData, postal_code: e.target.value})}
                className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Ville</label>
              <input
                type="text"
                value={formData.city || ''}
                onChange={(e) => setFormData({...formData, city: e.target.value})}
                className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4">4. Sponsoring</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Type</label>
              <select
                value={formData.sponsoring_type || ''}
                onChange={(e) => setFormData({...formData, sponsoring_type: e.target.value})}
                className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              >
                <option value="">Sélectionner</option>
                <option value="Maillots">Maillots</option>
                <option value="Financier">Financier</option>
                <option value="Matériel">Matériel</option>
                <option value="Autre">Autre</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Statut</label>
              <select
                value={formData.status || 'actif'}
                onChange={(e) => setFormData({...formData, status: e.target.value})}
                className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              >
                <option value="actif">Actif</option>
                <option value="en_négociation">En négociation</option>
                <option value="non_renouvelé">Non renouvelé</option>
                <option value="expiré">Expiré</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Depuis</label>
              <input
                type="date"
                value={formData.sponsoring_since || ''}
                onChange={(e) => setFormData({...formData, sponsoring_since: e.target.value})}
                className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-2">Notes</label>
              <textarea
                value={formData.notes || ''}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                rows={3}
                className="w-full px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>
        </div>

        {editingItem && (
          <div>
            <h3 className="text-lg font-semibold mb-4">5. Contrats</h3>
            {contracts.length > 0 && (
              <div className="mb-4 overflow-x-auto">
                <table className="std-table text-sm">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium">N°</th>
                      <th className="px-3 py-2 text-left text-xs font-medium">Début</th>
                      <th className="px-3 py-2 text-left text-xs font-medium">Fin</th>
                      <th className="px-3 py-2 text-left text-xs font-medium">Montant</th>
                      <th className="px-3 py-2 text-left text-xs font-medium">PDF</th>
                      <th className="px-3 py-2 text-right text-xs font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {contracts.map((contract, idx) => (
                      <tr key={contract.id}>
                        <td className="px-3 py-2">{idx + 1}</td>
                        <td className="px-3 py-2">
                          {new Date(contract.start_date).toLocaleDateString('fr-CH')}
                        </td>
                        <td className="px-3 py-2">
                          {new Date(contract.end_date).toLocaleDateString('fr-CH')}
                        </td>
                        <td className="px-3 py-2">
                          <span>CHF {((contract.amount || 0) + (contract.prestation_value || 0)).toLocaleString('fr-CH')}</span>
                          {contract.prestation_value > 0 && (
                            <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>dont {contract.prestation_value.toLocaleString('fr-CH')} en nature</span>
                          )}
                          {contract.tacit_renewal && (
                            <span className="block text-xs font-medium" style={{ color: 'var(--info-text)' }}>Reconduction tacite</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {contract.contract_file_url ? (
                            <a
                              href={contract.contract_file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs" style={{ color: 'var(--accent)' }}
                            >
                              <FileText className="w-3 h-3 inline mr-1" />Télécharger
                            </a>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {!accessLoading && canEdit && (
                            <button
                              type="button"
                              title="Modifier ce contrat"
                              style={{ color: 'var(--accent)' }}
                              onClick={() => {
                                const start = new Date(contract.start_date);
                                const end = new Date(contract.end_date);
                                const diffYears = Math.round(
                                  (end.getTime() - start.getTime()) /
                                  (365.25 * 24 * 60 * 60 * 1000)
                                );
                                setEditingContractId(contract.id);
                                setContractFormData({
                                  start_date: contract.start_date,
                                  duration_years: diffYears || 1,
                                  amount: contract.amount || 0,
                                  prestation_value: contract.prestation_value || 0,
                                  notes: contract.notes || '',
                                  contract_file_url: contract.contract_file_url || ''
                                });
                                setContractTacitRenewal(contract.tacit_renewal || false);
                                loadPrestationLines(contract.id);
                                setShowContractForm(true);
                              }}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!showContractForm && (
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => setShowContractForm(true)}
              >
                <FileText className="w-4 h-4 inline mr-1" />Ajouter un contrat
              </Button>
            )}

            {showContractForm && (
              <div className="mt-4 p-4 rounded-lg space-y-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Date début *</label>
                    <input
                      type="date"
                      value={contractFormData.start_date}
                      onChange={(e) => setContractFormData({...contractFormData, start_date: e.target.value})}
                      className="w-full px-2 py-1.5 text-sm rounded" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Durée *</label>
                    <select
                      value={contractFormData.duration_years}
                      onChange={(e) => setContractFormData({...contractFormData, duration_years: parseInt(e.target.value)})}
                      className="w-full px-2 py-1.5 text-sm rounded" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    >
                      <option value="1">1 an</option>
                      <option value="2">2 ans</option>
                      <option value="3">3 ans</option>
                      <option value="4">4 ans</option>
                      <option value="5">5 ans</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Montant CHF *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={contractFormData.amount || ''}
                      onChange={(e) => setContractFormData({...contractFormData, amount: parseFloat(e.target.value) || 0})}
                      className="w-full px-2 py-1.5 text-sm rounded" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Prestations (CHF)</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={contractFormData.prestation_value || ''}
                      onChange={(e) => setContractFormData({...contractFormData, prestation_value: parseFloat(e.target.value) || 0})}
                      className="w-full px-2 py-1.5 text-sm rounded" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                    <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Valeur des prestations en nature (s'ajoute au montant du contrat)</p>
                  </div>
                  {/* Tacit renewal */}
                  <div className="col-span-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={contractTacitRenewal}
                        onChange={(e) => setContractTacitRenewal(e.target.checked)}
                        className="w-4 h-4 rounded"
                      />
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Reconduction tacite</span>
                    </label>
                    <p className="text-xs mt-1 ml-6" style={{ color: 'var(--text-muted)' }}>Contrat échu mais maintenu aux mêmes conditions (roll-over).</p>
                  </div>

                  {/* Prestations incluses */}
                  <div className="col-span-2">
                    <label className="block text-xs font-medium mb-2">Prestations incluses</label>
                    {prestationLines.map((line, idx) => (
                      <div key={idx} className="flex gap-2 mb-2 items-start">
                        <select
                          value={line.prestation_type_id}
                          onChange={(e) => {
                            const t = prestationTypes.find(pt => pt.id === e.target.value);
                            updatePrestationLine(idx, {
                              prestation_type_id: e.target.value,
                              value: t?.list_price ?? line.value,
                              _typeName: t?.name || '',
                              _typeCategory: t?.category || '',
                            });
                          }}
                          className="flex-1 px-2 py-1.5 text-sm rounded" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', minWidth: 0 }}
                        >
                          <option value="">— Choisir —</option>
                          {Object.entries(
                            prestationTypes.reduce<Record<string, PrestationType[]>>((acc, t) => {
                              const cat = PREST_CAT_LABELS[t.category] || t.category;
                              (acc[cat] = acc[cat] || []).push(t);
                              return acc;
                            }, {})
                          ).map(([cat, types]) => (
                            <optgroup key={cat} label={cat}>
                              {types.map(t => (
                                <option key={t.id} value={t.id} disabled={!t.active}>
                                  {t.name}{!t.active ? ' (inactif)' : ''}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="1"
                          value={line.quantity}
                          onChange={(e) => updatePrestationLine(idx, { quantity: parseInt(e.target.value) || 1 })}
                          className="w-16 px-2 py-1.5 text-sm rounded text-center"
                          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                          title="Quantité"
                          placeholder="Qté"
                        />
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={line.value ?? ''}
                          onChange={(e) => updatePrestationLine(idx, { value: e.target.value ? parseFloat(e.target.value) : null })}
                          className="w-24 px-2 py-1.5 text-sm rounded"
                          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                          title="Valeur CHF"
                          placeholder="CHF"
                        />
                        <input
                          type="text"
                          value={line.detail}
                          onChange={(e) => updatePrestationLine(idx, { detail: e.target.value })}
                          className="flex-1 px-2 py-1.5 text-sm rounded"
                          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', minWidth: 0 }}
                          placeholder="Précision..."
                        />
                        <button type="button" onClick={() => removePrestationLine(idx)} title="Retirer" style={{ color: 'var(--danger)', padding: '6px' }}>
                          <CircleMinus className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={addPrestationLine} className="text-xs font-medium px-2 py-1 rounded" style={{ color: 'var(--accent)' }}>
                      + Ajouter une prestation
                    </button>
                    {prestationLines.length > 0 && (
                      <div className="mt-2 flex items-center gap-4">
                        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                          Valeur théorique : CHF {theoreticalValue.toLocaleString('fr-CH')}
                        </span>
                        {contractFormData.amount > 0 && theoreticalValue > 0 && contractFormData.amount !== theoreticalValue && (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            écart CHF {contractFormData.amount > theoreticalValue ? '+' : ''}{(contractFormData.amount - theoreticalValue).toLocaleString('fr-CH')} (négociation / contre-prestation)
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="col-span-2">
                    <label className="block text-xs font-medium mb-1">Upload PDF</label>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={handleContractFileUpload}
                      disabled={uploadingContract}
                      className="w-full px-2 py-1.5 text-sm rounded file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                    {uploadingContract && (
                      <div className="mt-2">
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border-color)' }}>
                          <div
                            className="h-full transition-all duration-300"
                            style={{ background: 'var(--accent)', width: `${uploadProgress}%` }}
                          />
                        </div>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Téléchargement en cours...</p>
                      </div>
                    )}
                    {contractFormData.contract_file_url && (
                      <p className="text-xs mt-1" style={{ color: 'var(--success-text)' }}>✓ Fichier téléchargé</p>
                    )}
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium mb-1">Notes (optionnel)</label>
                    <textarea
                      value={contractFormData.notes}
                      onChange={(e) => setContractFormData({...contractFormData, notes: e.target.value})}
                      rows={2}
                      className="w-full px-2 py-1.5 text-sm rounded" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    onClick={() => {
                      setShowContractForm(false);
                      setEditingContractId(null);
                      setPrestationLines([]);
                      setContractTacitRenewal(false);
                      setContractFormData({
                        start_date: '',
                        duration_years: 1,
                        amount: 0,
                        prestation_value: 0,
                        notes: '',
                        contract_file_url: ''
                      });
                    }}
                  >
                    Annuler
                  </Button>
                  <button
                    type="button"
                    onClick={handleSaveContract}
                    className="px-3 py-1.5 text-sm rounded transition-colors"
                    style={{ pointerEvents: 'auto', zIndex: 999, position: 'relative', background: 'var(--success)', color: 'var(--text-inverse)' }}
                  >
                    {editingContractId ? 'Mettre à jour' : 'Enregistrer ce contrat'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-4 justify-end pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
          <Button
            variant="secondary"
            type="button"
            onClick={() => setShowModal(false)}
          >
            Annuler
          </Button>
          <Button type="submit">
            {editingItem ? 'Enregistrer' : 'Créer'}
          </Button>
        </div>
      </form>
    );
  };

  if (loading) {
    return <div className="p-8">Chargement...</div>;
  }

  const renderStatsTab = () => {
    if (statsLoading) {
      return <div className="py-12 text-center" style={{ color: 'var(--text-secondary)' }}>Chargement des statistiques...</div>;
    }

    if (statsAggregated.totalLifetime === 0) {
      return (
        <div className="text-center py-16 px-4 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <Eye size={40} style={{ color: 'var(--text-secondary)', margin: '0 auto 12px' }} />
          <p className="font-medium text-lg" style={{ color: 'var(--text-primary)' }}>Aucune impression enregistrée</p>
          <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)', maxWidth: 400, margin: '8px auto 0' }}>
            Les statistiques apparaitront une fois que des utilisateurs visualiseront les logos dans le carrousel.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* KPI cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Total impressions (tous sponsors)</p>
            <p className="text-3xl font-bold mt-2" style={{ color: 'var(--text-primary)' }}>
              {statsAggregated.totalLifetime.toLocaleString('fr-CH')}
            </p>
          </div>
          <div className="p-5 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Ce mois</p>
            <p className="text-3xl font-bold mt-2" style={{ color: 'var(--text-primary)' }}>
              {statsAggregated.totalMonth.toLocaleString('fr-CH')}
            </p>
          </div>
          <div className="p-5 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Aujourd'hui</p>
            <p className="text-3xl font-bold mt-2" style={{ color: 'var(--text-primary)' }}>
              {statsAggregated.totalToday.toLocaleString('fr-CH')}
            </p>
          </div>
        </div>

        {/* Sortable table */}
        <div className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--table-header-bg)' }}>
                  <th className="px-4 py-3 text-left text-xs font-medium cursor-pointer select-none" style={{ color: 'var(--text-secondary)' }} onClick={() => handleStatsSort('name')}>
                    Sponsor {statsSortField === 'name' && (statsSortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium cursor-pointer select-none" style={{ color: 'var(--text-secondary)' }} onClick={() => handleStatsSort('contract')}>
                    Montant CHF {statsSortField === 'contract' && (statsSortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium cursor-pointer select-none" style={{ color: 'var(--text-secondary)' }} onClick={() => handleStatsSort('lifetime')}>
                    Total {statsSortField === 'lifetime' && (statsSortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium cursor-pointer select-none" style={{ color: 'var(--text-secondary)' }} onClick={() => handleStatsSort('month')}>
                    Ce mois {statsSortField === 'month' && (statsSortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium cursor-pointer select-none" style={{ color: 'var(--text-secondary)' }} onClick={() => handleStatsSort('today')}>
                    Aujourd'hui {statsSortField === 'today' && (statsSortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium cursor-pointer select-none" style={{ color: 'var(--text-secondary)' }} onClick={() => handleStatsSort('weight')}>
                    Part d'affichage {statsSortField === 'weight' && (statsSortDir === 'asc' ? '↑' : '↓')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedStatsRows.map(row => (
                  <tr key={row.id} className="border-t" style={{ borderColor: 'var(--border-color)' }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {row.logo_url ? (
                          <ZoomablePhoto src={row.logo_url} caption={row.company_name} alt="" className="w-8 h-8 object-contain rounded" />
                        ) : (
                          <div className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold" style={{ background: 'var(--bg-app)', color: 'var(--text-secondary)' }}>
                            {row.company_name.charAt(0)}
                          </div>
                        )}
                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{row.company_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right" style={{ color: 'var(--text-primary)' }}>
                      {row.contractAmount > 0 ? (
                        <>
                          CHF {row.contractAmount.toLocaleString('fr-CH')}
                          {row.contractPrestation > 0 && (
                            <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                              dont {row.contractPrestation.toLocaleString('fr-CH')} en nature
                            </div>
                          )}
                        </>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {row.lifetime.toLocaleString('fr-CH')}
                    </td>
                    <td className="px-4 py-3 text-right" style={{ color: 'var(--text-primary)' }}>
                      {row.month.toLocaleString('fr-CH')}
                    </td>
                    <td className="px-4 py-3 text-right" style={{ color: 'var(--text-primary)' }}>
                      {row.today.toLocaleString('fr-CH')}
                    </td>
                    <td className="px-4 py-3 text-right" style={{ color: 'var(--text-primary)' }}>
                      {row.displayShare != null ? `${row.displayShare.toFixed(1)} %` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top 10 bar chart */}
        {statsAggregated.top10Bar.length > 0 && (
          <div className="rounded-lg p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Top 10 sponsors par impressions (30 derniers jours)</h3>
            <ResponsiveContainer width="100%" height={Math.max(200, statsAggregated.top10Bar.length * 40)}>
              <BarChart data={statsAggregated.top10Bar} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} stroke="var(--border-color)" allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} stroke="var(--border-color)" width={95} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: 12 }}
                  formatter={(value) => [`${value} impressions`, '']}
                  labelFormatter={(label) => label}
                />
                <Bar dataKey="impressions" radius={[0, 4, 4, 0]} fill="var(--primary)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Daily line chart */}
        <div className="rounded-lg p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Evolution globale (30 jours)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={statsAggregated.dailyChart} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                tickFormatter={(val) => {
                  const d = new Date(val);
                  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
                }}
                interval={Math.max(0, Math.floor(statsAggregated.dailyChart.length / 7) - 1)}
                stroke="var(--border-color)"
              />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} allowDecimals={false} stroke="var(--border-color)" />
              <Tooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: 12 }}
                labelFormatter={(val) => {
                  const d = new Date(String(val));
                  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
                }}
                formatter={(value) => [`${value} impressions`, '']}
              />
              <Line type="monotone" dataKey="impressions" stroke="var(--primary)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-center mt-3" style={{ color: 'var(--text-secondary)' }}>
            1 impression = 1 affichage du logo dans le carrousel
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 lg:p-8 w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Handshake className="w-5 h-5" style={{ color: 'var(--primary)' }} />
            Sponsors
              <PageTitleCount total={sponsors.length} filtered={getFilteredSponsors().length} isFiltered={searchQuery.length >= 2} />
          </h1>
          <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>Gestion des sponsors</p>
        </div>
        <div className="flex items-center gap-2">
          {pageTab === 'sponsors' && (
            <>
              <Button
                variant="secondary"
                onClick={handleExportExcel}
                leftIcon={<Download size={18} />}
              >
                Exporter Excel
              </Button>
              {!accessLoading && canEdit && (
                <Button
                  onClick={() => handleOpenModal()}
                  leftIcon={<Plus size={20} />}
                >
                  Nouveau Sponsor
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <Tabs
        value={pageTab}
        onChange={(id) => setPageTab(id as PageTab)}
        items={[
          { key: 'sponsors', label: 'Sponsors' },
          { key: 'statistiques', label: 'Statistiques' },
        ]}
        className="mb-6"
      />

      {pageTab === 'sponsors' ? (
        <>
          <div className="mb-6" style={{ maxHeight: 'min(800px, 60vh)', overflowY: 'auto', borderRadius: '12px' }}>
            <SponsorTimeline sponsors={sponsors} />
          </div>
          <div className="mb-6">
            <SponsorSummaryBand contractsData={allContractsRaw} totalsData={allTotalsRaw} />
          </div>

          <div className="mb-4">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              inputSize="lg"
              placeholder="Rechercher un sponsor..."
            />
          </div>

          <div className="std-table-wrap">
            {renderSponsorsTable()}
          </div>
        </>
      ) : (
        renderStatsTab()
      )}

      {showModal && (
        <div onClick={() => setShowModal(false)} className="fixed inset-0 flex items-center justify-center p-4 z-50 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div onClick={e => e.stopPropagation()} className="rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="sticky top-0 z-20 flex items-center justify-between px-6 py-4 rounded-t-xl" style={{ background: 'var(--bg-modal-header)' }}>
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-modal-header)' }}>
                {editingItem ? 'Modifier le sponsor' : 'Nouveau sponsor'}
              </h2>
              <button onClick={() => setShowModal(false)} className="hover:opacity-80" style={{ color: 'var(--text-modal-header)' }}>
                <CloseIcon size={24} />
              </button>
            </div>
            {renderSponsorModal()}
          </div>
        </div>
      )}

      <SponsorDetailSlideOver
        sponsor={selectedSponsor}
        onClose={() => setSelectedSponsor(null)}
        onUpdate={() => {
          fetchSponsors();
          setSelectedSponsor(null);
        }}
        canEdit={canEdit}
        onEdit={(sponsor) => {
          setSelectedSponsor(null);
          handleOpenModal(sponsor);
        }}
      />

      <ConfirmModal
        {...confirmState}
        onCancel={hideConfirm}
      />

      <Toast toast={toast} />
    </div>
  );
}
