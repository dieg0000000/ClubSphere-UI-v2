import { useState, useEffect, useCallback } from 'react';
import { X, RefreshCw, Pencil, CircleMinus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ZoomablePhoto } from './PhotoViewer';
import { useAuth } from '../context/AuthContext';
import useEscapeKey from '../hooks/useEscapeKey';
import { Toggle } from './Toggle';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import DataTableShell from './DataTableShell';

interface Sponsor {
  id: string;
  company_name: string;
  contact_first_name: string | null;
  contact_last_name: string | null;
  email: string | null;
  phone: string | null;
  company_phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  sponsoring_type: string | null;
  sponsoring_amount: number | null;
  non_renewal_reason: string | null;
  status: string | null;
  logo_url: string | null;
  website_url: string | null;
  notes: string | null;
  active: boolean;
  display_logo: boolean;
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

interface Props {
  sponsor: Sponsor | null;
  onClose: () => void;
  onUpdate: () => void;
  canEdit?: boolean;
  onEdit?: (sponsor: Sponsor) => void;
}

function getStatusBadge(status: string | null): { bg: string; color: string; label: string } {
  switch (status) {
    case 'actif': return { bg: 'var(--success-soft)', color: 'var(--success-text)', label: 'Actif' };
    case 'en_négociation': return { bg: 'var(--warning-soft)', color: 'var(--warning-text)', label: 'En négociation' };
    case 'non_renouvelé': return { bg: 'var(--danger-soft)', color: 'var(--danger-text)', label: 'Non renouvelé' };
    case 'expiré': return { bg: 'var(--orange-soft)', color: 'var(--orange-text)', label: 'Expiré' };
    default: return { bg: 'var(--bg-hover)', color: 'var(--text-secondary)', label: status || '—' };
  }
}

export default function SponsorDetailSlideOver({ sponsor, onClose, onUpdate, canEdit, onEdit }: Props) {
  const { user } = useAuth();
  const [contracts, setContracts] = useState<SponsorContract[]>([]);
  const [confrerieMembers, setConfrerieMembers] = useState<{id: string; first_name: string; last_name: string}[]>([]);
  const [confrerieLabel, setConfrerieLabel] = useState('');
  const [showAddContract, setShowAddContract] = useState(false);
  const [showRenewalModal, setShowRenewalModal] = useState(false);
  const [renewalDecision, setRenewalDecision] = useState<'yes' | 'no' | null>(null);
  const [uploading, setUploading] = useState(false);
  const { toast, showToast } = useToast();
  const [contractForm, setContractForm] = useState({
    start_date: '',
    duration_years: 1,
    amount: 0,
    prestation_value: 0,
    notes: '',
    file: null as File | null,
  });
  const [renewalForm, setRenewalForm] = useState({
    duration_years: 1,
    amount: 0,
    prestation_value: 0,
    start_date: new Date().toISOString().split('T')[0],
    notes: '',
    file: null as File | null,
    non_renewal_reason: '',
  });

  const canViewAmount = user?.role === 'admin' || user?.role === 'committee';
  const isMember = user?.role === 'member';

  const [prestationTypes, setPrestationTypes] = useState<PrestationType[]>([]);
  const [addPrestLines, setAddPrestLines] = useState<PrestationLine[]>([]);
  const [addTacitRenewal, setAddTacitRenewal] = useState(false);
  const [contractPrestSummaries, setContractPrestSummaries] = useState<Record<string, { summary: string; theoretical: number }>>({});

  const addTheoreticalValue = addPrestLines.reduce((s, l) => s + (l.value || 0) * l.quantity, 0);

  useEffect(() => {
    supabase.from('sponsor_prestation_types').select('id, name, category, list_price, active').order('display_order').then(({ data }) => {
      if (data) setPrestationTypes(data);
    });
  }, []);

  useEffect(() => {
    if (sponsor) {
      loadContracts();
      supabase.from('confrerie_members').select('id, first_name, last_name').eq('sponsor_id', sponsor.id).eq('active', true).order('last_name').then(({ data }) => {
        setConfrerieMembers(data || []);
      });
      supabase.from('club_settings').select('confrerie_label').limit(1).single().then(({ data }) => {
        if (data?.confrerie_label) setConfrerieLabel(data.confrerie_label);
      });
    }
  }, [sponsor]);

  useEffect(() => {
    if (contracts.length > 0) {
      setRenewalForm(prev => ({
        ...prev,
        amount: contracts[0].amount || 0,
        prestation_value: contracts[0].prestation_value || 0,
      }));
    }
  }, [contracts]);

  const loadContracts = async () => {
    if (!sponsor) return;
    const { data } = await supabase
      .from('sponsor_contracts')
      .select('*')
      .eq('sponsor_id', sponsor.id)
      .order('start_date', { ascending: false });
    if (data) {
      setContracts(data);
      const ids = data.map(c => c.id);
      if (ids.length > 0) {
        const { data: lines } = await supabase
          .from('sponsor_contract_prestations')
          .select('contract_id, quantity, value, detail, type:sponsor_prestation_types(name, category)')
          .in('contract_id', ids);
        const summaries: Record<string, { summary: string; theoretical: number }> = {};
        for (const cid of ids) {
          const cLines = (lines || []).filter((l: any) => l.contract_id === cid);
          const theoretical = cLines.reduce((s: number, l: any) => s + (Number(l.value) || 0) * Number(l.quantity), 0);
          const summary = cLines.map((l: any) => {
            let s = l.type?.name || '';
            if (Number(l.quantity) > 1) s += ` ×${l.quantity}`;
            if (l.detail) s += ` ${l.detail}`;
            return s;
          }).join(' · ');
          if (cLines.length > 0) summaries[cid] = { summary, theoretical };
        }
        setContractPrestSummaries(summaries);
      }
    }
  };

  const calculateEndDate = (startDate: string, years: number): string => {
    const date = new Date(startDate);
    date.setFullYear(date.getFullYear() + years);
    date.setDate(date.getDate() - 1);
    return date.toLocaleDateString('fr-CH');
  };

  const isExpiringSoon = (sponsor: Sponsor): boolean => {
    if (contracts.length === 0 || !contracts[0].end_date) return false;
    const endDate = new Date(contracts[0].end_date);
    const days = (endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return days <= 60 && days > 0;
  };

  const getCurrentContractEndDate = (): string | null => {
    if (contracts.length === 0 || !contracts[0].end_date) return null;
    return new Date(contracts[0].end_date).toLocaleDateString('fr-CH');
  };

  const handleFileUpload = async (file: File): Promise<string | null> => {
    const fileName = `${Date.now()}_${file.name}`;
    const filePath = `sponsors/${sponsor?.id}/${fileName}`;

    const { data, error } = await supabase.storage
      .from('contracts')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Upload error:', error);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('contracts')
      .getPublicUrl(filePath);

    return publicUrl;
  };

  const handleAddContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sponsor) return;

    setUploading(true);
    try {
      let fileUrl = null;
      if (contractForm.file) {
        fileUrl = await handleFileUpload(contractForm.file);
      }

      const endDate = new Date(contractForm.start_date);
      endDate.setFullYear(endDate.getFullYear() + contractForm.duration_years);
      endDate.setDate(endDate.getDate() - 1);

      const nextNumber = contracts.length + 1;

      const { data: inserted, error } = await supabase
        .from('sponsor_contracts')
        .insert({
          sponsor_id: sponsor.id,
          contract_number: nextNumber,
          start_date: contractForm.start_date,
          end_date: endDate.toISOString().split('T')[0],
          duration_years: contractForm.duration_years,
          amount: contractForm.amount,
          prestation_value: contractForm.prestation_value || 0,
          tacit_renewal: addTacitRenewal,
          contract_file_url: fileUrl,
          notes: contractForm.notes,
        })
        .select('id')
        .single();

      if (!error && inserted) {
        if (addPrestLines.length > 0) {
          await supabase.from('sponsor_contract_prestations').insert(
            addPrestLines.filter(l => l.prestation_type_id).map(l => ({
              contract_id: inserted.id,
              prestation_type_id: l.prestation_type_id,
              quantity: l.quantity,
              value: l.value,
              detail: l.detail || null,
            }))
          );
        }
        await loadContracts();
        setShowAddContract(false);
        setAddPrestLines([]);
        setAddTacitRenewal(false);
        setContractForm({
          start_date: '',
          duration_years: 1,
          amount: 0,
          prestation_value: 0,
          notes: '',
          file: null,
        });
        showToast('Contrat ajouté avec succès', 'success');
      }
    } catch (error) {
      console.error('Error adding contract:', error);
      showToast('Erreur lors de l\'ajout du contrat', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleRenewal = async () => {
    if (!sponsor || !renewalDecision) return;

    setUploading(true);
    try {
      if (renewalDecision === 'yes') {
        let fileUrl = null;
        if (renewalForm.file) {
          fileUrl = await handleFileUpload(renewalForm.file);
        }

        const endDate = new Date(renewalForm.start_date);
        endDate.setFullYear(endDate.getFullYear() + renewalForm.duration_years);
        endDate.setDate(endDate.getDate() - 1);

        const nextNumber = contracts.length + 1;

        await supabase.from('sponsor_contracts').insert({
          sponsor_id: sponsor.id,
          contract_number: nextNumber,
          start_date: renewalForm.start_date,
          end_date: endDate.toISOString().split('T')[0],
          duration_years: renewalForm.duration_years,
          amount: renewalForm.amount,
          prestation_value: renewalForm.prestation_value || 0,
          contract_file_url: fileUrl,
          notes: renewalForm.notes,
        });

        await supabase
          .from('sponsors')
          .update({
            status: 'actif',
            non_renewal_reason: null,
          })
          .eq('id', sponsor.id);

        const newEndDate = calculateEndDate(renewalForm.start_date, renewalForm.duration_years);
        showToast(`Contrat renouvelé jusqu'au ${newEndDate}`, 'success');
      } else {
        await supabase
          .from('sponsors')
          .update({
            non_renewal_reason: renewalForm.non_renewal_reason,
            status: 'non_renouvelé',
            active: false,
          })
          .eq('id', sponsor.id);

        showToast('Statut de non-renouvellement enregistré', 'success');
      }

      await loadContracts();
      onUpdate();
      setShowRenewalModal(false);
      setRenewalDecision(null);
    } catch (error) {
      console.error('Error during renewal:', error);
      showToast('Erreur lors du renouvellement', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEscapeKey(handleClose);

  if (!sponsor) return null;

  const statusBadge = getStatusBadge(sponsor.status);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full z-50 overflow-y-auto" style={{ width: '600px', background: 'var(--bg-card)', borderLeft: '1px solid var(--border-color)' }}>
        <div className="sticky top-0 z-10 px-6 py-4 flex items-center justify-between" style={{ background: 'var(--bg-modal-header)' }}>
          <div className="flex items-center gap-4">
            {sponsor.logo_url && (
              <ZoomablePhoto src={sponsor.logo_url} caption={sponsor.company_name} alt="" className="w-16 h-16 object-contain rounded" />
            )}
            <div>
              <h2 className="text-2xl font-bold" style={{ color: 'var(--text-modal-header)' }}>{sponsor.company_name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className="px-2 py-1 text-xs font-medium rounded"
                  style={{ background: statusBadge.bg, color: statusBadge.color }}
                >
                  {statusBadge.label}
                </span>
                {isExpiringSoon(sponsor) && (
                  <span
                    className="px-2 py-1 text-xs font-medium rounded"
                    style={{ background: 'var(--orange-soft)', color: 'var(--orange-text)' }}
                  >
                    Expire bientôt
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && onEdit && (
              <button
                onClick={() => onEdit(sponsor!)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={{ background: 'var(--accent)', color: 'var(--text-inverse)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
              >
                <Pencil size={16} />
                Modifier
              </button>
            )}
            <button onClick={onClose} className="hover:opacity-80 transition-opacity" style={{ color: 'var(--text-modal-header)' }} aria-label="Fermer">
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between py-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
            <div>
              <p className="font-medium" style={{ color: 'var(--text-primary)' }}>Affichage dans l'application</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {sponsor.display_logo
                  ? 'Logo visible dans le carrousel'
                  : 'Logo masque dans le carrousel'}
              </p>
            </div>
            <Toggle
              checked={sponsor.display_logo}
              onChange={async () => {
                const newValue = !sponsor.display_logo;
                const { error } = await supabase
                  .from('sponsors')
                  .update({ display_logo: newValue })
                  .eq('id', sponsor.id);
                if (!error) onUpdate();
              }}
              disabled={!canEdit}
            />
          </div>

          {sponsor.non_renewal_reason && (
            <div className="p-4 rounded-lg" style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger)' }}>
              <div className="flex items-start gap-2">
                <span className="font-semibold" style={{ color: 'var(--danger-text)' }}>Non renouvelé</span>
              </div>
              <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>{sponsor.non_renewal_reason}</p>
            </div>
          )}

          <div>
            <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Informations</h3>
            <div className="space-y-2 text-sm">
              {sponsor.contact_first_name && sponsor.contact_last_name && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-secondary)' }}>Contact</span>
                  <span style={{ color: 'var(--text-primary)' }}>{sponsor.contact_first_name} {sponsor.contact_last_name}</span>
                </div>
              )}
              {sponsor.email && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-secondary)' }}>Email</span>
                  <span style={{ color: 'var(--text-primary)' }}>{sponsor.email}</span>
                </div>
              )}
              {sponsor.company_phone && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-secondary)' }}>Tél. société</span>
                  <span style={{ color: 'var(--text-primary)' }}>{sponsor.company_phone}</span>
                </div>
              )}
              {!isMember && sponsor.phone && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-secondary)' }}>Mobile</span>
                  <span style={{ color: 'var(--text-primary)' }}>{sponsor.phone}</span>
                </div>
              )}
              {sponsor.address && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-secondary)' }}>Adresse</span>
                  <span style={{ color: 'var(--text-primary)' }}>{sponsor.address}, {sponsor.postal_code} {sponsor.city}</span>
                </div>
              )}
              {!isMember && sponsor.sponsoring_type && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-secondary)' }}>Type</span>
                  <span style={{ color: 'var(--text-primary)' }}>{sponsor.sponsoring_type}</span>
                </div>
              )}
              {canViewAmount && contracts[0]?.amount && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-secondary)' }}>Total contrat actuel</span>
                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    CHF {((contracts[0].amount || 0) + (contracts[0].prestation_value || 0)).toLocaleString('fr-CH')}
                    {(contracts[0].prestation_value || 0) > 0 && (
                      <span className="block text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
                        dont {(contracts[0].prestation_value || 0).toLocaleString('fr-CH')} en nature
                      </span>
                    )}
                  </span>
                </div>
              )}
              {contracts.length > 0 && contracts[0].start_date && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-secondary)' }}>Début contrat</span>
                  <span style={{ color: 'var(--text-primary)' }}>{new Date(contracts[0].start_date).toLocaleDateString('fr-CH')}</span>
                </div>
              )}
              {getCurrentContractEndDate() && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-secondary)' }}>Fin contrat</span>
                  <span style={{ color: 'var(--text-primary)' }}>{getCurrentContractEndDate()}</span>
                </div>
              )}
            </div>
          </div>

          {user?.role === 'admin' && (
            <div>
              <button
                onClick={() => setShowRenewalModal(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors"
                style={{ background: 'var(--grad)', color: 'var(--text-inverse)' }}
              >
                <RefreshCw size={20} />
                Renouveler le contrat
              </button>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Contrats</h3>
              {user?.role === 'admin' && (
                <button
                  onClick={() => setShowAddContract(!showAddContract)}
                  className="text-sm px-3 py-1 rounded-lg font-medium transition-colors"
                  style={{ background: 'var(--accent)', color: 'var(--text-inverse)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
                >
                  {showAddContract ? 'Annuler' : 'Ajouter un contrat'}
                </button>
              )}
            </div>

            {showAddContract && (
              <form onSubmit={handleAddContract} className="mb-4 p-4 rounded-lg space-y-3" style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color)' }}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Date début</label>
                    <input
                      type="date"
                      required
                      value={contractForm.start_date}
                      onChange={(e) => setContractForm({ ...contractForm, start_date: e.target.value })}
                      className="w-full px-2 py-1 text-sm rounded"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Durée</label>
                    <select
                      value={contractForm.duration_years}
                      onChange={(e) => setContractForm({ ...contractForm, duration_years: parseInt(e.target.value) })}
                      className="w-full px-2 py-1 text-sm rounded"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    >
                      <option value="1">1 an</option>
                      <option value="2">2 ans</option>
                      <option value="3">3 ans</option>
                      <option value="4">4 ans</option>
                      <option value="5">5 ans</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Montant CHF</label>
                    <input
                      type="number"
                      step="0.01"
                      value={contractForm.amount}
                      onChange={(e) => setContractForm({ ...contractForm, amount: parseFloat(e.target.value) })}
                      className="w-full px-2 py-1 text-sm rounded"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Prestations (CHF)</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={contractForm.prestation_value || ''}
                      onChange={(e) => setContractForm({ ...contractForm, prestation_value: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1 text-sm rounded"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                    <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Valeur des prestations en nature (s'ajoute au montant du contrat)</p>
                  </div>
                  {/* Tacit renewal */}
                  <div className="col-span-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={addTacitRenewal} onChange={(e) => setAddTacitRenewal(e.target.checked)} className="w-4 h-4 rounded" />
                      <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Reconduction tacite</span>
                    </label>
                    <p className="text-xs mt-1 ml-6" style={{ color: 'var(--text-muted)' }}>Contrat échu mais maintenu aux mêmes conditions (roll-over).</p>
                  </div>

                  {/* Prestations incluses */}
                  <div className="col-span-2">
                    <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Prestations incluses</label>
                    {addPrestLines.map((line, idx) => (
                      <div key={idx} className="flex gap-2 mb-2 items-start">
                        <select value={line.prestation_type_id} onChange={(e) => { const t = prestationTypes.find(pt => pt.id === e.target.value); setAddPrestLines(prev => prev.map((l, i) => i === idx ? { ...l, prestation_type_id: e.target.value, value: t?.list_price ?? l.value } : l)); }} className="flex-1 px-2 py-1 text-sm rounded" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', minWidth: 0 }}>
                          <option value="">— Choisir —</option>
                          {Object.entries(prestationTypes.reduce<Record<string, PrestationType[]>>((acc, t) => { const cat = PREST_CAT_LABELS[t.category] || t.category; (acc[cat] = acc[cat] || []).push(t); return acc; }, {})).map(([cat, types]) => (<optgroup key={cat} label={cat}>{types.map(t => (<option key={t.id} value={t.id} disabled={!t.active}>{t.name}{!t.active ? ' (inactif)' : ''}</option>))}</optgroup>))}
                        </select>
                        <input type="number" min="1" value={line.quantity} onChange={(e) => setAddPrestLines(prev => prev.map((l, i) => i === idx ? { ...l, quantity: parseInt(e.target.value) || 1 } : l))} className="w-14 px-2 py-1 text-sm rounded text-center" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} title="Quantité" />
                        <input type="number" min="0" step="1" value={line.value ?? ''} onChange={(e) => setAddPrestLines(prev => prev.map((l, i) => i === idx ? { ...l, value: e.target.value ? parseFloat(e.target.value) : null } : l))} className="w-20 px-2 py-1 text-sm rounded" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} title="Valeur CHF" placeholder="CHF" />
                        <input type="text" value={line.detail} onChange={(e) => setAddPrestLines(prev => prev.map((l, i) => i === idx ? { ...l, detail: e.target.value } : l))} className="flex-1 px-2 py-1 text-sm rounded" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', minWidth: 0 }} placeholder="Précision..." />
                        <button type="button" onClick={() => setAddPrestLines(prev => prev.filter((_, i) => i !== idx))} style={{ color: 'var(--danger)', padding: '4px' }}><CircleMinus size={16} /></button>
                      </div>
                    ))}
                    <button type="button" onClick={() => setAddPrestLines(prev => [...prev, { prestation_type_id: '', quantity: 1, value: null, detail: '' }])} className="text-xs font-medium" style={{ color: 'var(--accent)' }}>+ Ajouter une prestation</button>
                    {addPrestLines.length > 0 && (
                      <div className="mt-2 flex items-center gap-3">
                        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Valeur théorique : CHF {addTheoreticalValue.toLocaleString('fr-CH')}</span>
                        {contractForm.amount > 0 && addTheoreticalValue > 0 && contractForm.amount !== addTheoreticalValue && (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>écart CHF {contractForm.amount > addTheoreticalValue ? '+' : ''}{(contractForm.amount - addTheoreticalValue).toLocaleString('fr-CH')} (négociation / contre-prestation)</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="col-span-2">
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Contrat PDF</label>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => setContractForm({ ...contractForm, file: e.target.files?.[0] || null })}
                      className="w-full px-2 py-1 text-sm rounded"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Notes</label>
                    <textarea
                      value={contractForm.notes}
                      onChange={(e) => setContractForm({ ...contractForm, notes: e.target.value })}
                      rows={2}
                      className="w-full px-2 py-1 text-sm rounded"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={uploading}
                  className="w-full px-3 py-2 rounded font-medium text-sm transition-colors disabled:opacity-50"
                  style={{ background: 'var(--success)', color: 'var(--text-inverse)' }}
                >
                  {uploading ? 'Ajout en cours...' : 'Ajouter le contrat'}
                </button>
              </form>
            )}

            {contracts.length === 0 ? (
              <p className="text-sm text-center py-4" style={{ color: 'var(--text-secondary)' }}>Aucun contrat enregistré</p>
            ) : (
              <div className="overflow-x-auto">
                <DataTableShell bare maxHeight="300px">
                <table className="w-full text-sm">
                  <thead style={{ background: 'var(--table-header-bg)' }}>
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>N°</th>
                      <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Début</th>
                      <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Fin</th>
                      {canViewAmount && (
                        <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Montant</th>
                      )}
                      <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>PDF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...contracts].reverse().map((contract, idx) => (
                      <tr
                        key={contract.id}
                        className="border-t"
                        style={{ borderColor: 'var(--border-color)' }}
                      >
                        <td className="px-3 py-2" style={{ color: 'var(--text-primary)' }}>
                          {contract.contract_number}
                          {idx === contracts.length - 1 && sponsor.status === 'actif' && (
                            <span className="ml-1 text-xs" style={{ color: 'var(--success-text)' }}>●</span>
                          )}
                        </td>
                        <td className="px-3 py-2" style={{ color: 'var(--text-primary)' }}>
                          {new Date(contract.start_date).toLocaleDateString('fr-CH')}
                        </td>
                        <td className="px-3 py-2" style={{ color: 'var(--text-primary)' }}>
                          {contract.end_date ? new Date(contract.end_date).toLocaleDateString('fr-CH') : '—'}
                        </td>
                        {canViewAmount && (
                          <td className="px-3 py-2 font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {contract.amount ? (
                              <span>
                                CHF {((contract.amount || 0) + (contract.prestation_value || 0)).toLocaleString('fr-CH')}
                                {(contract.prestation_value || 0) > 0 && (
                                  <span className="block text-xs font-normal" style={{ color: 'var(--text-muted)' }}>dont {(contract.prestation_value || 0).toLocaleString('fr-CH')} en nature</span>
                                )}
                                {contract.tacit_renewal && (
                                  <span className="block text-xs font-normal" style={{ color: 'var(--info-text)' }}>Reconduction tacite</span>
                                )}
                                {contractPrestSummaries[contract.id]?.summary && (
                                  <span className="block text-xs font-normal truncate" style={{ color: 'var(--text-muted)', maxWidth: '180px' }}>{contractPrestSummaries[contract.id].summary}</span>
                                )}
                              </span>
                            ) : '—'}
                          </td>
                        )}
                        <td className="px-3 py-2">
                          {contract.contract_file_url ? (
                            <a
                              href={contract.contract_file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs"
                              style={{ color: 'var(--accent)' }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-hover)')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--accent)')}
                            >
                              Télécharger
                            </a>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)' }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </DataTableShell>
              </div>
            )}
          </div>

          {confrerieMembers.length > 0 && confrerieLabel && (
            <div>
              <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>{confrerieLabel}</h3>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Ce package comprend {confrerieMembers.length} membre{confrerieMembers.length > 1 ? 's' : ''} :
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-primary)' }}>
                {confrerieMembers.map((m, i) => (
                  <span key={m.id}>
                    {i > 0 && ', '}
                    {m.first_name} {m.last_name}
                  </span>
                ))}
              </p>
            </div>
          )}

          {sponsor.notes && (
            <div>
              <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Notes</h3>
              <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>{sponsor.notes}</p>
            </div>
          )}
        </div>
      </div>

      {showRenewalModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-[60] p-4">
          <div className="rounded-xl max-w-lg w-full p-6" style={{ background: 'var(--bg-modal)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-lg)' }}>
            <h3 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Renouvellement — {sponsor.company_name}
            </h3>

            {!renewalDecision ? (
              <div className="space-y-4">
                <p style={{ color: 'var(--text-secondary)' }}>Souhaitez-vous renouveler ce contrat ?</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setRenewalDecision('yes')}
                    className="flex-1 px-4 py-3 rounded-lg font-medium transition-colors"
                    style={{ background: 'var(--success)', color: 'var(--text-inverse)' }}
                  >
                    Oui, renouveler
                  </button>
                  <button
                    onClick={() => setRenewalDecision('no')}
                    className="flex-1 px-4 py-3 rounded-lg font-medium transition-colors"
                    style={{ background: 'var(--danger)', color: 'var(--text-inverse)' }}
                  >
                    Non, ne pas renouveler
                  </button>
                </div>
                <button
                  onClick={() => setShowRenewalModal(false)}
                  className="w-full px-4 py-2 rounded-lg transition-colors"
                  style={{ background: 'var(--bg-app)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
                >
                  Annuler
                </button>
              </div>
            ) : renewalDecision === 'yes' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Nombre d'années</label>
                    <select
                      value={renewalForm.duration_years}
                      onChange={(e) => setRenewalForm({ ...renewalForm, duration_years: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 rounded-lg"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    >
                      <option value="1">1 an</option>
                      <option value="2">2 ans</option>
                      <option value="3">3 ans</option>
                      <option value="4">4 ans</option>
                      <option value="5">5 ans</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Nouveau montant CHF</label>
                    <input
                      type="number"
                      step="0.01"
                      value={renewalForm.amount}
                      onChange={(e) => setRenewalForm({ ...renewalForm, amount: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 rounded-lg"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Prestations (CHF)</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={renewalForm.prestation_value || ''}
                      onChange={(e) => setRenewalForm({ ...renewalForm, prestation_value: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 rounded-lg"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Date de renouvellement</label>
                    <input
                      type="date"
                      value={renewalForm.start_date}
                      onChange={(e) => setRenewalForm({ ...renewalForm, start_date: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Upload contrat PDF (optionnel)</label>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => setRenewalForm({ ...renewalForm, file: e.target.files?.[0] || null })}
                      className="w-full px-3 py-2 rounded-lg"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Notes</label>
                    <textarea
                      value={renewalForm.notes}
                      onChange={(e) => setRenewalForm({ ...renewalForm, notes: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleRenewal}
                    disabled={uploading}
                    className="flex-1 px-4 py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
                    style={{ background: 'var(--success)', color: 'var(--text-inverse)' }}
                  >
                    {uploading ? 'En cours...' : 'Confirmer le renouvellement'}
                  </button>
                  <button
                    onClick={() => {
                      setShowRenewalModal(false);
                      setRenewalDecision(null);
                    }}
                    className="px-4 py-3 rounded-lg transition-colors"
                    style={{ background: 'var(--bg-app)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Raison du non-renouvellement *
                  </label>
                  <textarea
                    required
                    value={renewalForm.non_renewal_reason}
                    onChange={(e) => setRenewalForm({ ...renewalForm, non_renewal_reason: e.target.value })}
                    rows={4}
                    className="w-full px-3 py-2 rounded-lg"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    placeholder="Expliquez pourquoi le contrat n'est pas renouvelé..."
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleRenewal}
                    disabled={!renewalForm.non_renewal_reason.trim() || uploading}
                    className="flex-1 px-4 py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
                    style={{ background: 'var(--danger)', color: 'var(--text-inverse)' }}
                  >
                    Confirmer
                  </button>
                  <button
                    onClick={() => {
                      setShowRenewalModal(false);
                      setRenewalDecision(null);
                    }}
                    className="px-4 py-3 rounded-lg transition-colors"
                    style={{ background: 'var(--bg-app)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <Toast toast={toast} />
    </>
  );
}
