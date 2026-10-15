import { useState, useEffect, useCallback } from 'react';
import { toLocalDatetimeValue } from '../utils/formatHelpers';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Plus, Eye, CreditCard as Edit, Trash2, X, PenLine, FileText, Lock, Check } from 'lucide-react';
import SearchInput from '../components/ui/SearchInput';
import { SortableHeader } from '../components/SortableHeader';
import ConfirmModal from '../components/ConfirmModal';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import Button from '../components/ui/Button';
import { Badge, type BadgeVariant } from '../components/ui/Badge';

interface MeetingType {
  id: string;
  name: string;
}

interface Meeting {
  id: string;
  type: string;
  title: string;
  date: string;
  location: string | null;
  status: 'brouillon' | 'finalise' | 'approuve';
  event_id: string | null;
  secretary_id: string | null;
  previous_meeting_id: string | null;
  previous_pv_approved: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  attendee_count?: number;
  secretary?: {
    first_name: string;
    last_name: string;
  };
}

interface MeetingFormData {
  type: string;
  title: string;
  date: string;
  location: string;
  event_id: string;
  secretary_id: string;
  previous_meeting_id: string;
  previous_pv_approved: boolean;
  notes: string;
}

const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const NUMBERED_TYPES = ['Séance de comité', 'Séance technique'];

export default function AdminPVSeances() {
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<string>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [meetingTypes, setMeetingTypes] = useState<MeetingType[]>([]);
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

  const [formData, setFormData] = useState<MeetingFormData>({
    type: '',
    title: '',
    date: '',
    location: '',
    event_id: '',
    secretary_id: '',
    previous_meeting_id: '',
    previous_pv_approved: false,
    notes: ''
  });

  const [events, setEvents] = useState<any[]>([]);
  const [committeeMembers, setCommitteeMembers] = useState<any[]>([]);
  const [pastMeetings, setPastMeetings] = useState<Meeting[]>([]);

  useEffect(() => { document.title = 'Séances - ClubSphere' }, [])

  useEffect(() => {
    fetchMeetings();
    fetchEvents();
    fetchCommitteeMembers();
    fetchMeetingTypes();
  }, []);

  const fetchMeetings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('meetings')
        .select(`
          *,
          secretary:committee_members!secretary_id(first_name, last_name)
        `)
        .order('date', { ascending: false });

      if (error) throw error;

      const { data: attendees } = await supabase
        .from('meeting_attendees')
        .select('meeting_id, status');

      const meetingsWithCounts = (data || []).map(meeting => ({
        ...meeting,
        attendee_count: attendees?.filter(a => a.meeting_id === meeting.id && a.status === 'present').length || 0
      }));

      setMeetings(meetingsWithCounts);
      setPastMeetings(meetingsWithCounts);
    } catch (err) {
      console.error('Error fetching meetings:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEvents = async () => {
    const { data } = await supabase
      .from('events')
      .select('id, title, date')
      .order('date', { ascending: false });
    console.log('Events for linking:', data);
    setEvents(data || []);
  };

  const fetchCommitteeMembers = async () => {
    const { data } = await supabase
      .from('committee_members')
      .select('id, first_name, last_name, role, is_committee')
      .order('last_name');
    setCommitteeMembers(data || []);
  };

  const fetchMeetingTypes = async () => {
    const { data } = await supabase
      .from('meeting_types')
      .select('id, name')
      .order('name');
    setMeetingTypes(data || []);
  };

  const generateAutoTitle = (typeName: string, existingMeetings: Meeting[] = meetings): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = MONTH_NAMES[now.getMonth()];

    if (NUMBERED_TYPES.includes(typeName)) {
      const sameTypeThisYear = existingMeetings.filter(m =>
        m.type === typeName && new Date(m.date).getFullYear() === year
      );
      const n = sameTypeThisYear.length + 1;
      return `${typeName} #${n} - ${month} ${year}`;
    }
    return `${typeName} - ${month} ${year}`;
  };

  useEscapeKey(() => {
    setShowModal(false);
    setEditingMeeting(null);
  });

  const handleSort = useCallback((field: string) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }, [sortField, sortDir]);

  const getFilteredAndSortedMeetings = () => {
    let filtered = meetings;

    if (searchQuery.length >= 2) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(m =>
        m.title.toLowerCase().includes(query) ||
        m.location?.toLowerCase().includes(query)
      );
    }

    if (typeFilter !== 'all') {
      filtered = filtered.filter(m => m.type === typeFilter);
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(m => m.status === statusFilter);
    }

    if (yearFilter !== 'all') {
      filtered = filtered.filter(m =>
        new Date(m.date).getFullYear().toString() === yearFilter
      );
    }

    const sorted = [...filtered].sort((a, b) => {
      let aVal: any = a[sortField as keyof Meeting];
      let bVal: any = b[sortField as keyof Meeting];

      if (sortField === 'date') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  };

  const TYPE_COLORS: Record<string, string> = {
    'Séance de comité': 'var(--purple-text)',
    'Assemblée générale': 'var(--text-muted)',
    'Séance technique': 'var(--accent)',
    'Séance extraordinaire': 'var(--orange-text)'
  };

  const getTypeBadge = (type: string) => {
    const color = TYPE_COLORS[type] || 'var(--text-muted)';
    const label = type.length > 20 ? type.substring(0, 18) + '…' : type;
    return (
      <span style={{
        background: color,
        color: 'var(--text-inverse)',
        padding: '3px 10px',
        borderRadius: '6px',
        fontSize: '12px',
        fontWeight: '600',
        whiteSpace: 'nowrap'
      }}>
        {label}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { label: string; variant: BadgeVariant }> = {
      brouillon: { label: 'Brouillon', variant: 'yellow' },
      finalise: { label: 'Finalisé', variant: 'blue' },
      approuve: { label: 'Approuvé', variant: 'green' }
    };
    const badge = badges[status] || badges.brouillon;
    return <Badge variant={badge.variant}>{badge.label}</Badge>;
  };

  const formatEventDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('fr-CH', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const handleOpenModal = (meeting?: Meeting) => {
    if (meeting) {
      setEditingMeeting(meeting);
      setFormData({
        type: meeting.type,
        title: meeting.title,
        date: toLocalDatetimeValue(meeting.date),
        location: meeting.location || '',
        event_id: meeting.event_id || '',
        secretary_id: meeting.secretary_id || '',
        previous_meeting_id: meeting.previous_meeting_id || '',
        previous_pv_approved: meeting.previous_pv_approved,
        notes: meeting.notes || ''
      });
    } else {
      setEditingMeeting(null);
      const defaultType = meetingTypes.find(t => t.name === 'Séance de comité')?.name
        || meetingTypes[0]?.name
        || 'Séance de comité';
      setFormData({
        type: defaultType,
        title: generateAutoTitle(defaultType),
        date: '',
        location: '',
        event_id: '',
        secretary_id: '',
        previous_meeting_id: '',
        previous_pv_approved: false,
        notes: ''
      });
    }
    setShowModal(true);
  };

  const handleTypeChange = (newType: string) => {
    setFormData(prev => ({
      ...prev,
      type: newType,
      title: generateAutoTitle(newType)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const meetingData = {
        type: formData.type,
        title: formData.title,
        date: new Date(formData.date).toISOString(),
        location: formData.location || null,
        event_id: formData.event_id || null,
        secretary_id: formData.secretary_id || null,
        previous_meeting_id: formData.previous_meeting_id || null,
        previous_pv_approved: formData.previous_pv_approved,
        notes: formData.notes || null,
        status: 'brouillon',
        created_by: user?.id || null,
        updated_at: new Date().toISOString()
      };

      if (editingMeeting) {
        const { error } = await supabase
          .from('meetings')
          .update(meetingData)
          .eq('id', editingMeeting.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('meetings')
          .insert([meetingData])
          .select()
          .single();
        if (error) throw error;

        if (data) {
          navigate(`/admin/pv-seances/${data.id}`);
          return;
        }
      }

      setShowModal(false);
      fetchMeetings();
    } catch (err) {
      console.error('Error saving meeting:', err);
      showToast('Erreur lors de la sauvegarde', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    showConfirm({
      title: 'Supprimer la séance',
      message: 'Êtes-vous sûr de vouloir supprimer cette séance ?',
      confirmLabel: 'Oui, supprimer',
      cancelLabel: 'Non',
      confirmStyle: 'danger',
      onConfirm: async () => {
        hideConfirm();
        try {
          const { error } = await supabase
            .from('meetings')
            .delete()
            .eq('id', id);
          if (error) throw error;
          fetchMeetings();
        } catch (err) {
          console.error('Error deleting meeting:', err);
        }
      }
    });
  };

  const years = [...new Set(meetings.map(m => new Date(m.date).getFullYear()))].sort((a, b) => b - a);

  if (loading) {
    return <div className="p-8" style={{ color: 'var(--text-primary)' }}>Chargement...</div>;
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
            <FileText className="w-5 h-5" />
            Séances
          </h1>
          <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>Procès-verbaux des séances</p>
        </div>
        <Button onClick={() => handleOpenModal()} leftIcon={<Plus size={20} />}>
          Nouvelle séance
        </Button>
      </div>

      <div className="mb-6 flex gap-4 flex-wrap items-end">
        <div className="flex-1 min-w-[300px]">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            inputSize="lg"
            placeholder="Rechercher..."
          />
        </div>

        <div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-4 py-3 border rounded-lg focus:outline-none"
            style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          >
            <option value="all">Tous les types</option>
            {meetingTypes.map(mt => (
              <option key={mt.id} value={mt.name}>{mt.name}</option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-3 border rounded-lg focus:outline-none"
            style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          >
            <option value="all">Tous les statuts</option>
            <option value="brouillon">Brouillon</option>
            <option value="finalise">Finalisé</option>
            <option value="approuve">Approuvé</option>
          </select>
        </div>

        <div>
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="px-4 py-3 border rounded-lg focus:outline-none"
            style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          >
            <option value="all">Toutes les années</option>
            {years.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-lg shadow-xl overflow-hidden" style={{ background: 'var(--bg-card)' }}>
        <style>{`
          .seances-stickhead thead th {
            position: sticky; top: 0; z-index: 2;
            background: var(--table-header-bg);
            border-bottom: 1px solid var(--border-color);
          }
          .seances-stickhead thead th::after {
            content: ''; position: absolute; left: 0; right: 0; bottom: -8px; height: 8px;
            pointer-events: none;
            background: linear-gradient(to bottom, rgba(0,0,0,0.28), rgba(0,0,0,0));
          }
        `}</style>
        <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
          <table className="seances-stickhead w-full">
            <thead style={{ background: 'var(--table-header-bg)' }}>
              <tr>
                <SortableHeader
                  label="Type"
                  field="type"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Titre"
                  field="title"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Date"
                  field="date"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Lieu
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Participants
                </th>
                <SortableHeader
                  label="Statut"
                  field="status"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
              {getFilteredAndSortedMeetings().map((meeting) => (
                <tr
                  key={meeting.id}
                  className="hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                  onClick={() => navigate(`/admin/pv-seances/${meeting.id}`)}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getTypeBadge(meeting.type)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{meeting.title}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                    {new Date(meeting.date).toLocaleDateString('fr-CH', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </td>
                  <td className="px-6 py-4" style={{ color: 'var(--text-secondary)' }}>
                    {meeting.location || '-'}
                  </td>
                  <td className="px-6 py-4" style={{ color: 'var(--text-secondary)' }}>
                    {meeting.attendee_count || 0} présent{(meeting.attendee_count || 0) > 1 ? 's' : ''}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(meeting.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/admin/pv-seances/${meeting.id}`); }}
                        className="p-1 hover:opacity-75" style={{ color: 'var(--accent)' }}
                        title={meeting.status === 'brouillon' ? 'Rédiger le PV' : 'Consulter'}
                      >
                        {meeting.status === 'brouillon' ? <PenLine size={18} /> : <Eye size={18} />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleOpenModal(meeting); }}
                        className="p-1 hover:opacity-75" style={{ color: 'var(--text-muted)' }}
                        title="Modifier les informations générales"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(meeting.id); }}
                        className="p-1 hover:opacity-75" style={{ color: 'var(--danger)' }}
                        title="Supprimer"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="sticky top-0 flex items-center justify-between px-6 py-4 rounded-t-xl" style={{ background: 'var(--bg-modal-header)' }}>
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-modal-header)' }}>
                {editingMeeting ? 'Modifier la séance' : 'Nouvelle séance'}
              </h2>
              <button onClick={() => setShowModal(false)} className="hover:opacity-80" style={{ color: 'var(--text-modal-header)' }}>
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Section 1 — Séance</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Type *
                    </label>
                    <select
                      value={formData.type}
                      onChange={(e) => handleTypeChange(e.target.value)}
                      className="w-full px-4 py-2 border rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                      required
                    >
                      {meetingTypes.map(mt => (
                        <option key={mt.id} value={mt.name}>{mt.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Titre *
                    </label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Date et heure *
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Lieu
                    </label>
                    <input
                      type="text"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                      placeholder="Salle du club..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Lier à un événement
                    </label>
                    <select
                      value={formData.event_id}
                      onChange={(e) => setFormData({ ...formData, event_id: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                    >
                      <option value="">Aucun</option>
                      {events.map(event => (
                        <option key={event.id} value={event.id}>
                          {event.title} — {formatEventDate(event.date)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Secrétaire de séance
                    </label>
                    <select
                      value={formData.secretary_id}
                      onChange={(e) => setFormData({ ...formData, secretary_id: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                    >
                      <option value="">Aucun</option>
                      {committeeMembers.map(member => (
                        <option key={member.id} value={member.id}>
                          {member.first_name} {member.last_name} {member.role ? `(${member.role})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Section 2 — PV précédent</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Séance précédente
                    </label>
                    <select
                      value={formData.previous_meeting_id}
                      onChange={(e) => setFormData({ ...formData, previous_meeting_id: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                    >
                      <option value="">Aucune</option>
                      {pastMeetings
                        .filter(m => m.id !== editingMeeting?.id)
                        .map(meeting => (
                          <option key={meeting.id} value={meeting.id}>
                            {meeting.title} - {new Date(meeting.date).toLocaleDateString('fr-CH')}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="previous_pv_approved"
                      checked={formData.previous_pv_approved}
                      onChange={(e) => setFormData({ ...formData, previous_pv_approved: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <label htmlFor="previous_pv_approved" className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      PV précédent approuvé
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Notes générales
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  placeholder="Notes supplémentaires..."
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
                  Annuler
                </Button>
                <Button type="submit">
                  {editingMeeting ? 'Enregistrer' : 'Créer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        {...confirmState}
        onCancel={hideConfirm}
      />
      <Toast toast={toast} />
    </div>
  );
}
