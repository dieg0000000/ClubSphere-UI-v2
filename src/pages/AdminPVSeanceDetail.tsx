import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Users, FileText, Vote, Paperclip, FileDown, Lock, CircleCheck as CheckCircle, Plus, CreditCard as Edit, Trash2, ChevronUp, ChevronDown, Upload, Calendar, MapPin, PenLine, TriangleAlert as AlertTriangle, User, Target, Pencil, Bell } from 'lucide-react';
import { Toast } from '../components/Toast';
import { useToast } from '../hooks/useToast';
import type { jsPDF as jsPDFType } from 'jspdf';
import { Tabs } from '../components/ui/Tabs';
import ConfirmModal from '../components/ConfirmModal';
import Button from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';

interface Meeting {
  id: string;
  type: string;
  title: string;
  date: string;
  location: string | null;
  status: 'brouillon' | 'finalise' | 'approuve';
  previous_meeting_id: string | null;
  previous_pv_approved: boolean;
  notes: string | null;
  secretary?: { first_name: string; last_name: string };
}

interface Attendee {
  id: string;
  meeting_id: string;
  committee_member_id: string;
  status: 'present' | 'absent' | 'excuse';
  notified_at: string | null;
  committee_member: {
    id: string;
    first_name: string;
    last_name: string;
    role: string | null;
    profile_photo_url: string | null;
  };
}

interface AgendaItem {
  id: string;
  meeting_id: string;
  order_number: number;
  title: string;
  description: string | null;
  brought_by_id: string | null;
  responsible_id: string | null;
  due_date: string | null;
  status: 'ouvert' | 'en_cours' | 'clos' | 'reporte';
  brought_by?: { first_name: string; last_name: string };
  responsible?: { first_name: string; last_name: string };
  decisions?: Decision[];
  documents?: Document[];
}

interface Decision {
  id: string;
  agenda_item_id: string;
  decision_text: string;
  votes_for: number;
  votes_against: number;
  votes_abstention: number;
  is_vote: boolean;
}

interface Document {
  id: string;
  meeting_id: string;
  agenda_item_id: string | null;
  name: string;
  file_url: string;
  uploaded_at: string;
  signed_url?: string | null;
}

export default function AdminPVSeanceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [activeTab, setActiveTab] = useState<'participants' | 'agenda' | 'decisions' | 'documents' | 'export'>('participants');
  const [loading, setLoading] = useState(true);

  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [committeeMembers, setCommitteeMembers] = useState<any[]>([]);
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [clubSettings, setClubSettings] = useState<any>(null);
  const [notifying, setNotifying] = useState(false);
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const { toast, showToast } = useToast();

  const [showAgendaModal, setShowAgendaModal] = useState(false);
  const [editingAgendaItem, setEditingAgendaItem] = useState<AgendaItem | null>(null);
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [editingDecision, setEditingDecision] = useState<Decision | null>(null);
  const [currentAgendaItemId, setCurrentAgendaItemId] = useState<string | null>(null);

  const [agendaFormData, setAgendaFormData] = useState<{
    order_number: number;
    title: string;
    description: string;
    brought_by_id: string;
    responsible_id: string;
    due_date: string;
    status: 'ouvert' | 'en_cours' | 'clos' | 'reporte';
  }>({
    order_number: 1,
    title: '',
    description: '',
    brought_by_id: '',
    responsible_id: '',
    due_date: '',
    status: 'ouvert'
  });

  const [decisionFormData, setDecisionFormData] = useState({
    decision_text: '',
    is_vote: false,
    votes_for: 0,
    votes_against: 0,
    votes_abstention: 0
  });

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

  useEffect(() => { document.title = 'Séances - ClubSphere' }, [])

  useEffect(() => {
    if (id) {
      fetchMeeting();
      fetchAttendees();
      fetchCommitteeMembers();
      fetchAgendaItems();
      fetchDocuments();
      fetchClubSettings();
    }
  }, [id]);

  const fetchMeeting = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('meetings')
        .select('*, secretary:committee_members!secretary_id(first_name, last_name)')
        .eq('id', id)
        .single();

      if (error) throw error;
      setMeeting(data);
    } catch (err) {
      console.error('Error fetching meeting:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAttendees = async () => {
    const { data } = await supabase
      .from('meeting_attendees')
      .select('*, committee_member:committee_members(*)')
      .eq('meeting_id', id);
    setAttendees((data || []).map(a => ({ ...a, notified_at: a.notified_at ?? null })));
  };

  const fetchCommitteeMembers = async () => {
    const { data } = await supabase
      .from('committee_members')
      .select('*')
      .order('last_name');
    setCommitteeMembers(data || []);
  };

  const fetchAgendaItems = async () => {
    const { data } = await supabase
      .from('meeting_agenda_items')
      .select(`
        *,
        brought_by:committee_members!brought_by_id(first_name, last_name),
        responsible:committee_members!responsible_id(first_name, last_name)
      `)
      .eq('meeting_id', id)
      .order('order_number');

    if (data) {
      const itemsWithDetails = await Promise.all(
        data.map(async (item) => {
          const { data: decisions } = await supabase
            .from('meeting_decisions')
            .select('*')
            .eq('agenda_item_id', item.id);

          const { data: docs } = await supabase
            .from('meeting_documents')
            .select('*')
            .eq('agenda_item_id', item.id);

          return {
            ...item,
            decisions: decisions || [],
            documents: docs || []
          };
        })
      );
      setAgendaItems(itemsWithDetails);
    }
  };

  const fetchDocuments = async () => {
    const { data } = await supabase
      .from('meeting_documents')
      .select('*')
      .eq('meeting_id', id)
      .is('agenda_item_id', null);
    const docs = data || [];
    // Le bucket 'documents' est privé : file_url stocke le chemin → URL signée à l'affichage.
    const withUrls = await Promise.all(
      docs.map(async (d: Document) => {
        if (d.file_url.startsWith('http')) return d;
        const { data: signed } = await supabase.storage
          .from('documents')
          .createSignedUrl(d.file_url, 3600);
        return { ...d, signed_url: signed?.signedUrl ?? null };
      })
    );
    setDocuments(withUrls);
  };

  const handleUploadDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setUploadingDoc(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `meetings/${id}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(path, file);
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from('meeting_documents').insert({
        meeting_id: id,
        agenda_item_id: null,
        name: file.name,
        file_url: path,
      });
      if (insErr) throw insErr;

      await fetchDocuments();
    } catch (err) {
      console.error('Upload document séance:', err);
      alert("Erreur lors de l'ajout du document.");
    } finally {
      setUploadingDoc(false);
      e.target.value = '';
    }
  };

  const handleDeleteDocument = async (doc: Document) => {
    if (!confirm(`Supprimer le document « ${doc.name} » ?`)) return;
    try {
      if (!doc.file_url.startsWith('http')) {
        await supabase.storage.from('documents').remove([doc.file_url]);
      }
      await supabase.from('meeting_documents').delete().eq('id', doc.id);
      await fetchDocuments();
    } catch (err) {
      console.error('Suppression document séance:', err);
    }
  };

  const fetchClubSettings = async () => {
    const { data } = await supabase
      .from('club_settings')
      .select('*')
      .single();
    setClubSettings(data);
  };

  const exportPDF = async () => {
    try {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - margin * 2;
    let y = 20;

    const clean = (text: string) =>
      String(text || '').replace(/^[!'→\s•\-]+/, '').trim();

    const clubName = clubSettings?.club_name || clubSettings?.name || '';
    const typeLabel = meeting!.type === 'comite'
      ? 'Procès-verbal de séance de Comité'
      : meeting!.type === 'ag'
      ? "Procès-verbal d'Assemblée Générale"
      : 'Procès-verbal de Commission Technique';
    const meetingDateStr = new Date(meeting!.date)
      .toLocaleDateString('fr-CH', {
        weekday: 'long', day: 'numeric',
        month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });

    const addText = (text: string, x: number, fontSize: number, style: string, colorR?: number, colorG?: number, colorB?: number) => {
      doc.setFontSize(fontSize);
      doc.setFont('helvetica', style || 'normal');
      doc.setTextColor(colorR ?? 0, colorG ?? 0, colorB ?? 0);
      const lines = doc.splitTextToSize(clean(text), contentWidth - (x - margin));

      const neededH = lines.length * (fontSize * 0.4) + 2;
      if (y + neededH > pageHeight - 15) {
        doc.addPage();
        y = 20;
      }

      doc.text(lines, x, y);
      y += neededH;
      return neededH;
    };

    const addSpace = (mm = 3) => {
      y += mm;
      if (y > pageHeight - 15) {
        doc.addPage();
        y = 20;
      }
    };

    const addHRule = (r = 200, g = 200, b = 200) => {
      if (y > pageHeight - 15) {
        doc.addPage();
        y = 20;
      }
      doc.setDrawColor(r, g, b);
      doc.line(margin, y, pageWidth - margin, y);
      y += 5;
    };

    const addSectionTitle = (title: string) => {
      addSpace(4);
      doc.setFillColor(180, 0, 0);
      doc.rect(margin, y - 3, 3, 9, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(180, 0, 0);
      const safeTitle = title
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase();
      doc.text(safeTitle, margin + 6, y + 4);
      y += 9;
      addHRule(220, 220, 220);
    };

    doc.setFillColor(180, 0, 0);
    doc.rect(0, 0, pageWidth, 30, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text(clubName, margin, 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(typeLabel, margin, 22);

    y = 38;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    doc.text('Date :', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(meetingDateStr, margin + 14, y);
    y += 6;

    if (meeting!.location) {
      doc.setFont('helvetica', 'bold');
      doc.text('Lieu :', margin, y);
      doc.setFont('helvetica', 'normal');
      doc.text(meeting!.location, margin + 14, y);
      y += 6;
    }
    addHRule();

    addSectionTitle('PARTICIPANTS');

    const present = attendees.filter(a => a.status === 'present');
    const excused = attendees.filter(a => a.status === 'excuse');
    const absent = attendees.filter(a => a.status === 'absent');

    const getName = (a: Attendee) =>
      `${a.committee_member?.first_name || ''} ${a.committee_member?.last_name || ''}`.trim() +
      (a.committee_member?.role ? ` (${a.committee_member.role})` : '');

    if (present.length > 0) {
      addText('Presents :', margin, 10, 'bold', 40, 40, 40);
      present.forEach(a => addText('- ' + getName(a), margin + 5, 10, 'normal', 60, 60, 60));
      addSpace(2);
    }
    if (excused.length > 0) {
      addText('Excuses :', margin, 10, 'bold', 40, 40, 40);
      excused.forEach(a => addText('- ' + getName(a), margin + 5, 10, 'normal', 60, 60, 60));
      addSpace(2);
    }
    if (absent.length > 0) {
      addText('Absents :', margin, 10, 'bold', 40, 40, 40);
      absent.forEach(a => addText('- ' + getName(a), margin + 5, 10, 'normal', 60, 60, 60));
      addSpace(2);
    }

    addText(
      `${present.length} present(s)  |  ${excused.length} excuse(s)  |  ${absent.length} absent(s)`,
      margin, 9, 'italic', 130, 130, 130
    );

    if (meeting!.previous_meeting_id) {
      addSectionTitle('PV PRÉCÉDENT');
      const pvText = meeting!.previous_pv_approved
        ? 'Le procès-verbal de la séance précédente est approuvé.'
        : 'Le procès-verbal de la séance précédente n\'est pas encore approuvé.';
      addText(pvText, margin, 10, 'normal',
        meeting!.previous_pv_approved ? 34 : 180,
        meeting!.previous_pv_approved ? 140 : 0,
        meeting!.previous_pv_approved ? 34 : 0
      );
    }

    addSectionTitle('ORDRE DU JOUR');

    agendaItems.forEach((item, index) => {
      addSpace(2);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(180, 0, 0);
      const pointLabel = `${item.order_number}.  ${item.title}`;
      const titleLines = doc.splitTextToSize(pointLabel, contentWidth);
      if (y + titleLines.length * 5 > pageHeight - 15) {
        doc.addPage();
        y = 20;
      }
      doc.text(titleLines, margin, y);
      y += titleLines.length * 5 + 2;

      if (item.description) {
        addText(item.description, margin + 3, 10, 'normal', 50, 50, 50);
        addSpace(2);
      }

      const meta = [];
      if (item.brought_by?.first_name)
        meta.push(`Amene par : ${item.brought_by.first_name} ${item.brought_by.last_name}`);
      if (item.responsible?.first_name)
        meta.push(`Responsable : ${item.responsible.first_name} ${item.responsible.last_name}`);
      if (item.due_date)
        meta.push(`Echeance : ${new Date(item.due_date).toLocaleDateString('fr-CH')}`);

      if (meta.length > 0) {
        addText(meta.join('   |   '), margin + 3, 9, 'normal', 100, 100, 100);
        addSpace(2);
      }

      if (item.decisions && item.decisions.length > 0) {
        item.decisions.forEach(decision => {
          addSpace(1);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(180, 0, 0);
          if (y + 4 > pageHeight - 15) {
            doc.addPage();
            y = 20;
          }
          doc.text('>> DECISION :', margin + 3, y);
          y += 5;

          addText(clean(decision.decision_text), margin + 3, 10, 'normal', 30, 30, 30);

          if (decision.is_vote) {
            addSpace(1);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            if (y + 5 > pageHeight - 15) {
              doc.addPage();
              y = 20;
            }
            doc.setTextColor(34, 140, 34);
            doc.text(`Pour : ${decision.votes_for}`, margin + 3, y);
            doc.setTextColor(180, 0, 0);
            doc.text(`Contre : ${decision.votes_against}`, margin + 28, y);
            doc.setTextColor(180, 120, 0);
            doc.text(`Abstention : ${decision.votes_abstention}`, margin + 55, y);
            y += 5;
          }
          addSpace(2);
        });
      }

      const statusLabels: Record<string, string> = {
        ouvert: 'Ouvert',
        en_cours: 'En cours',
        clos: 'Clos',
        reporte: 'Reporté'
      };
      addText(
        `Statut : ${statusLabels[item.status] || item.status}`,
        margin + 3, 9, 'italic', 120, 120, 120
      );

      if (index < agendaItems.length - 1) {
        addSpace(3);
        doc.setDrawColor(220, 220, 220);
        doc.line(margin + 10, y, pageWidth - margin, y);
        addSpace(3);
      }
    });

    addSpace(8);
    addSectionTitle('SIGNATURES');
    addSpace(15);

    const sigW = (contentWidth / 2) - 10;
    doc.setDrawColor(150, 150, 150);
    doc.line(margin, y, margin + sigW, y);
    doc.line(margin + sigW + 20, y, pageWidth - margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text('Président(e)', margin + sigW / 2, y, { align: 'center' });
    doc.text(
      'Secrétaire de séance',
      margin + sigW + 20 + sigW / 2, y,
      { align: 'center' }
    );

    const totalPages = doc.internal.pages.length - 1;
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
      doc.setFontSize(8);
      doc.setTextColor(160, 160, 160);
      doc.text(`${clubName} — ${typeLabel}`, margin, pageHeight - 7);
      doc.text(
        `Page ${i} / ${totalPages}`,
        pageWidth - margin, pageHeight - 7,
        { align: 'right' }
      );
    }

    doc.save(`PV_${meeting!.type}_${
      new Date(meeting!.date).toLocaleDateString('fr-CH')
        .replace(/\./g, '-')
    }.pdf`);
    } catch (e) { console.error('Export failed', e); }
  };

  const setAttendance = async (memberId: string, status: 'present' | 'absent' | 'excuse') => {
    const existing = attendees.find(a => a.committee_member_id === memberId);

    if (existing) {
      const { error } = await supabase
        .from('meeting_attendees')
        .update({ status })
        .eq('id', existing.id);
      if (error) { console.error('Attendance update error:', error); return; }
    } else {
      const { error } = await supabase
        .from('meeting_attendees')
        .insert([{
          meeting_id: id,
          committee_member_id: memberId,
          status
        }]);
      if (error) { console.error('Attendance insert error:', error); return; }
    }

    fetchAttendees();
  };

  const handleSaveAgendaItem = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const itemData = {
        meeting_id: id,
        order_number: agendaFormData.order_number,
        title: agendaFormData.title,
        description: agendaFormData.description || null,
        brought_by_id: agendaFormData.brought_by_id || null,
        responsible_id: agendaFormData.responsible_id || null,
        due_date: agendaFormData.due_date || null,
        status: agendaFormData.status
      };

      if (editingAgendaItem) {
        const { error } = await supabase
          .from('meeting_agenda_items')
          .update(itemData)
          .eq('id', editingAgendaItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('meeting_agenda_items')
          .insert([itemData]);
        if (error) throw error;
      }

      setShowAgendaModal(false);
      setEditingAgendaItem(null);
      fetchAgendaItems();
    } catch (err) {
      console.error('Error saving agenda item:', err);
    }
  };

  const handleDeleteAgendaItem = async (itemId: string) => {
    showConfirm({
      title: 'Supprimer le point',
      message: 'Êtes-vous sûr de vouloir supprimer ce point de l\'ordre du jour ?',
      confirmLabel: 'Oui, supprimer',
      cancelLabel: 'Non',
      confirmStyle: 'danger',
      onConfirm: async () => {
        hideConfirm();
        const { error } = await supabase.from('meeting_agenda_items').delete().eq('id', itemId);
        if (error) { console.error('Delete agenda item error:', error); return; }
        fetchAgendaItems();
      }
    });
  };

  const handleReorderAgendaItem = async (itemId: string, direction: 'up' | 'down') => {
    const item = agendaItems.find(i => i.id === itemId);
    if (!item) return;

    const newOrder = direction === 'up' ? item.order_number - 1 : item.order_number + 1;
    const swapItem = agendaItems.find(i => i.order_number === newOrder);

    if (swapItem) {
      const { error: e1 } = await supabase.from('meeting_agenda_items').update({ order_number: item.order_number }).eq('id', swapItem.id);
      const { error: e2 } = await supabase.from('meeting_agenda_items').update({ order_number: newOrder }).eq('id', itemId);
      if (e1 || e2) { console.error('Reorder error:', e1 || e2); return; }
      fetchAgendaItems();
    }
  };

  const handleSaveDecision = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const decisionData = {
        agenda_item_id: currentAgendaItemId,
        decision_text: decisionFormData.decision_text,
        is_vote: decisionFormData.is_vote,
        votes_for: decisionFormData.is_vote ? decisionFormData.votes_for : 0,
        votes_against: decisionFormData.is_vote ? decisionFormData.votes_against : 0,
        votes_abstention: decisionFormData.is_vote ? decisionFormData.votes_abstention : 0
      };

      if (editingDecision) {
        const { error } = await supabase
          .from('meeting_decisions')
          .update(decisionData)
          .eq('id', editingDecision.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('meeting_decisions')
          .insert([decisionData]);
        if (error) throw error;
      }

      setShowDecisionModal(false);
      setEditingDecision(null);
      setCurrentAgendaItemId(null);
      fetchAgendaItems();
    } catch (err) {
      console.error('Error saving decision:', err);
    }
  };

  const handleDeleteDecision = async (decisionId: string) => {
    showConfirm({
      title: 'Supprimer la décision',
      message: 'Êtes-vous sûr de vouloir supprimer cette décision ?',
      confirmLabel: 'Oui, supprimer',
      cancelLabel: 'Non',
      confirmStyle: 'danger',
      onConfirm: async () => {
        hideConfirm();
        const { error } = await supabase.from('meeting_decisions').delete().eq('id', decisionId);
        if (error) { console.error('Delete decision error:', error); return; }
        fetchAgendaItems();
      }
    });
  };

  const handleFinalizeMeeting = async () => {
    showConfirm({
      title: 'Finaliser le PV',
      message: 'Une fois finalisé, le PV sera en lecture seule. Confirmer ?',
      confirmLabel: 'Oui, finaliser',
      cancelLabel: 'Non',
      confirmStyle: 'warning',
      onConfirm: async () => {
        hideConfirm();
        const { error } = await supabase
          .from('meetings')
          .update({ status: 'finalise', updated_at: new Date().toISOString() })
          .eq('id', id);
        if (error) { console.error('Finalize error:', error); return; }

        fetchMeeting();
      }
    });
  };

  const handleApproveMeeting = async () => {
    showConfirm({
      title: 'Approuver le PV',
      message: 'Êtes-vous sûr de vouloir approuver ce PV ?',
      confirmLabel: 'Oui, approuver',
      cancelLabel: 'Non',
      confirmStyle: 'primary',
      onConfirm: async () => {
        hideConfirm();
        const { error } = await supabase
          .from('meetings')
          .update({ status: 'approuve', updated_at: new Date().toISOString() })
          .eq('id', id);
        if (error) { console.error('Approve error:', error); return; }

        if (meeting?.previous_meeting_id) {
          await supabase
            .from('meetings')
            .update({ previous_pv_approved: true })
            .eq('id', meeting.previous_meeting_id);
        }

        fetchMeeting();
      }
    });
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      ouvert: { label: 'Ouvert', bg: 'var(--info-soft)', color: 'var(--info-text)' },
      en_cours: { label: 'En cours', bg: 'var(--warning-soft)', color: 'var(--warning-text)' },
      clos: { label: 'Clos', bg: 'var(--success-soft)', color: 'var(--success-text)' },
      reporte: { label: 'Reporté', bg: 'var(--bg-hover)', color: 'var(--text-secondary)' }
    };
    const badge = badges[status as keyof typeof badges] || badges.ouvert;
    return (
      <span style={{
        background: badge.bg,
        color: badge.color,
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: '600'
      }}>
        {badge.label}
      </span>
    );
  };

  if (loading) {
    return <div className="p-8" style={{ color: 'var(--text-primary)' }}>Chargement...</div>;
  }

  if (!meeting) {
    return <div className="p-8" style={{ color: 'var(--text-primary)' }}>Séance introuvable</div>;
  }

  const isReadOnly = meeting.status !== 'brouillon';

  const unnotifiedCount = attendees.filter(a => !a.notified_at).length;
  const totalAttendees = attendees.length;
  const notifyButtonDisabled = notifying || totalAttendees === 0;

  const sendNotify = async (mode: 'new' | 'all') => {
    setShowNotifyModal(false);
    setNotifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('notify-meeting', {
        body: { meeting_id: id, mode },
      });
      if (error) throw error;
      if (data?.error) {
        showToast(data.error, 'error');
      } else {
        showToast(data?.message || 'Notification envoyée.', 'success');
      }
    } catch (err: any) {
      console.error('[Séances] notify-meeting error:', err);
      showToast(err?.message || 'Erreur lors de la notification.', 'error');
    } finally {
      setNotifying(false);
      await fetchAttendees();
    }
  };

  const presentCount = attendees.filter(a => a.status === 'present').length;
  const excusedCount = attendees.filter(a => a.status === 'excuse').length;
  const absentCount = attendees.filter(a => a.status === 'absent').length;
  const totalMembers = committeeMembers.length;

  const comiteMembers = committeeMembers.filter(m => m.is_committee !== false);
  const operationnelMembers = committeeMembers.filter(m => m.is_committee === false);

  const setGroupAttendance = async (members: any[], status: 'present' | 'absent' | 'excuse') => {
    for (const member of members) {
      const existing = attendees.find(a => a.committee_member_id === member.id);
      if (existing?.status === status) continue;
      await setAttendance(member.id, status);
    }
  };

  const isGroupAllPresent = (members: any[]) =>
    members.length > 0 && members.every(m => attendees.find(a => a.committee_member_id === m.id)?.status === 'present');

  const renderMemberRow = (member: any) => {
    const attendance = attendees.find(a => a.committee_member_id === member.id);
    return (
      <div
        key={member.id}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 0',
          borderBottom: '1px solid var(--border-color)'
        }}
      >
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {member.profile_photo_url && (
            <img
              src={member.profile_photo_url}
              alt=""
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                objectFit: 'cover'
              }}
            />
          )}
          <div>
            <div className="font-medium" style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {member.first_name} {member.last_name}
              {member.is_committee === false && <Badge variant="neutral">Opérationnel</Badge>}
            </div>
            {member.role && (
              <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{member.role}</div>
            )}
            {attendance?.notified_at && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Prévenu le {new Date(attendance.notified_at).toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' })}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setAttendance(member.id, 'present')}
            disabled={isReadOnly}
            style={{
              background: attendance?.status === 'present' ? 'var(--success)' : 'transparent',
              border: '1px solid var(--success)',
              color: attendance?.status === 'present' ? 'var(--text-inverse)' : 'var(--success-text)',
              borderRadius: '6px',
              padding: '4px 12px',
              cursor: isReadOnly ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              opacity: isReadOnly ? 0.5 : 1
            }}
          >
            ✓ Présent
          </button>
          <button
            onClick={() => setAttendance(member.id, 'excuse')}
            disabled={isReadOnly}
            style={{
              background: attendance?.status === 'excuse' ? 'var(--warning)' : 'transparent',
              border: '1px solid var(--warning)',
              color: attendance?.status === 'excuse' ? 'var(--text-inverse)' : 'var(--warning-text)',
              borderRadius: '6px',
              padding: '4px 12px',
              cursor: isReadOnly ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              opacity: isReadOnly ? 0.5 : 1
            }}
          >
            ~ Excusé
          </button>
          <button
            onClick={() => setAttendance(member.id, 'absent')}
            disabled={isReadOnly}
            style={{
              background: attendance?.status === 'absent' ? 'var(--danger)' : 'transparent',
              border: '1px solid var(--danger)',
              color: attendance?.status === 'absent' ? 'var(--text-inverse)' : 'var(--danger-text)',
              borderRadius: '6px',
              padding: '4px 12px',
              cursor: isReadOnly ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              opacity: isReadOnly ? 0.5 : 1
            }}
          >
            ✗ Absent
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="p-8">
      <Button
        variant="secondary"
        onClick={() => navigate('/admin/pv-seances')}
        leftIcon={<ArrowLeft size={20} />}
        className="mb-6"
      >
        Retour
      </Button>

      <div className="rounded-lg p-6 mb-6" style={{ background: 'var(--bg-card)' }}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{meeting.title}</h1>
            <div className="flex gap-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <span><Calendar className="w-4 h-4 inline mr-1" />{new Date(meeting.date).toLocaleDateString('fr-CH', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}</span>
              {meeting.location && <span><MapPin className="w-4 h-4 inline mr-1" />{meeting.location}</span>}
              {meeting.secretary && (
                <span><PenLine className="w-4 h-4 inline mr-1" />Secrétaire: {meeting.secretary.first_name} {meeting.secretary.last_name}</span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {meeting.status === 'brouillon' && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => setShowNotifyModal(true)}
                  leftIcon={<Bell size={16} />}
                  disabled={notifyButtonDisabled}
                  loading={notifying}
                >
                  Notifier les participants
                </Button>
                <Button
                  variant="primary"
                  onClick={handleFinalizeMeeting}
                  leftIcon={<Lock size={16} />}
                >
                  Finaliser
                </Button>
              </>
            )}
            {meeting.status === 'finalise' && (
              <button
                onClick={handleApproveMeeting}
                className="px-4 py-2 rounded-lg flex items-center gap-2 hover:opacity-90"
                style={{ background: 'var(--success)', color: 'var(--text-inverse)' }}
              >
                <CheckCircle size={16} />
                Approuver
              </button>
            )}
          </div>
        </div>

        {meeting.previous_pv_approved ? (
          <div className="text-sm" style={{ color: 'var(--success)' }}><CheckCircle className="w-4 h-4 inline mr-1" />PV précédent approuvé</div>
        ) : (
          <div className="text-sm text-[var(--warning-text)]"><AlertTriangle className="w-4 h-4 inline mr-1" />PV précédent non approuvé</div>
        )}
      </div>

      {meeting.status === 'brouillon' && (
        <div style={{ marginBottom: '16px' }}>
          <Alert variant="warning">Brouillon — Vous pouvez modifier ce PV jusqu'à ce qu'il soit finalisé.</Alert>
        </div>
      )}

      {meeting.status === 'finalise' && (
        <div style={{ marginBottom: '16px' }}>
          <Alert variant="info"><Lock className="w-4 h-4 inline mr-1" />Finalisé — Ce PV est en lecture seule.</Alert>
        </div>
      )}

      {meeting.status === 'approuve' && (
        <div style={{ marginBottom: '16px' }}>
          <Alert variant="success"><CheckCircle className="w-4 h-4 inline mr-1" />Approuvé — Ce PV a été approuvé officiellement.</Alert>
        </div>
      )}

      <div className="rounded-lg mb-6" style={{ background: 'var(--bg-card)' }}>
        <div className="p-4">
          <Tabs
            items={[
              { key: 'participants', label: 'Participants', icon: <Users size={16} /> },
              { key: 'agenda', label: 'Ordre du jour', icon: <FileText size={16} /> },
              { key: 'decisions', label: 'Décisions & Votes', icon: <Vote size={16} /> },
              { key: 'documents', label: 'Documents', icon: <Paperclip size={16} /> },
              { key: 'export', label: 'Export', icon: <FileDown size={16} /> },
            ]}
            value={activeTab}
            onChange={(id) => setActiveTab(id as typeof activeTab)}
          />
        </div>

        <div className="p-6">
          {activeTab === 'participants' && (
            <div>
              <div className="mb-6 p-4 rounded-lg" style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
                <strong>{presentCount}</strong> présent{presentCount > 1 ? 's' : ''}, <strong>{excusedCount}</strong> excusé{excusedCount > 1 ? 's' : ''}, <strong>{absentCount}</strong> absent{absentCount > 1 ? 's' : ''} sur <strong>{totalMembers}</strong> membres
              </div>

              {comiteMembers.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Comité</h3>
                      <Badge variant="blue">Comité</Badge>
                      <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>({comiteMembers.length})</span>
                    </div>
                    {!isReadOnly && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        <input
                          type="checkbox"
                          checked={isGroupAllPresent(comiteMembers)}
                          onChange={(e) => setGroupAttendance(comiteMembers, e.target.checked ? 'present' : 'absent')}
                          style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }}
                        />
                        Tout sélectionner
                      </label>
                    )}
                  </div>
                  <div className="space-y-0">
                    {comiteMembers.map(renderMemberRow)}
                  </div>
                </div>
              )}

              {operationnelMembers.length > 0 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Opérationnel</h3>
                      <Badge variant="neutral">Opérationnel</Badge>
                      <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>({operationnelMembers.length})</span>
                    </div>
                    {!isReadOnly && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        <input
                          type="checkbox"
                          checked={isGroupAllPresent(operationnelMembers)}
                          onChange={(e) => setGroupAttendance(operationnelMembers, e.target.checked ? 'present' : 'absent')}
                          style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }}
                        />
                        Tout sélectionner
                      </label>
                    )}
                  </div>
                  <div className="space-y-0">
                    {operationnelMembers.map(renderMemberRow)}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'agenda' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {meeting.previous_pv_approved ? (
                    <span style={{ color: 'var(--success)' }}><CheckCircle className="w-4 h-4 inline mr-1" />PV précédent approuvé</span>
                  ) : (
                    <span className="text-[var(--warning-text)]"><AlertTriangle className="w-4 h-4 inline mr-1" />PV précédent non approuvé</span>
                  )}
                </div>
                {!isReadOnly && (
                  <Button
                    variant="primary"
                    onClick={() => {
                      setEditingAgendaItem(null);
                      setAgendaFormData({
                        order_number: agendaItems.length + 1,
                        title: '',
                        description: '',
                        brought_by_id: '',
                        responsible_id: '',
                        due_date: '',
                        status: 'ouvert'
                      });
                      setShowAgendaModal(true);
                    }}
                    leftIcon={<Plus size={16} />}
                  >
                    Ajouter un point
                  </Button>
                )}
              </div>

              <div className="space-y-4">
                {agendaItems.map(item => (
                  <div
                    key={item.id}
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '10px',
                      padding: '16px'
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '10px'
                    }}>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <span style={{
                          color: 'var(--accent)',
                          fontWeight: '800',
                          fontSize: '18px'
                        }}>
                          {item.order_number}.
                        </span>
                        <span style={{ color: 'var(--text-primary)', fontWeight: '700' }}>
                          {item.title}
                        </span>
                        {getStatusBadge(item.status)}
                      </div>
                      {!isReadOnly && (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => handleReorderAgendaItem(item.id, 'up')}
                            className="p-1 hover:opacity-75" style={{ color: 'var(--text-muted)' }}
                            disabled={item.order_number === 1}
                          >
                            <ChevronUp size={18} />
                          </button>
                          <button
                            onClick={() => handleReorderAgendaItem(item.id, 'down')}
                            className="p-1 hover:opacity-75" style={{ color: 'var(--text-muted)' }}
                            disabled={item.order_number === agendaItems.length}
                          >
                            <ChevronDown size={18} />
                          </button>
                          <button
                            onClick={() => {
                              setEditingAgendaItem(item);
                              setAgendaFormData({
                                order_number: item.order_number,
                                title: item.title,
                                description: item.description || '',
                                brought_by_id: item.brought_by_id || '',
                                responsible_id: item.responsible_id || '',
                                due_date: item.due_date || '',
                                status: item.status
                              });
                              setShowAgendaModal(true);
                            }}
                            className="p-1 hover:opacity-75" style={{ color: 'var(--text-muted)' }}
                          >
                            <Edit size={18} />
                          </button>
                          <button
                            onClick={() => handleDeleteAgendaItem(item.id)}
                            className="p-1 hover:opacity-75" style={{ color: 'var(--danger)' }}
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      )}
                    </div>

                    {item.description && (
                      <p style={{
                        color: 'var(--text-muted)',
                        fontSize: '14px',
                        marginBottom: '10px'
                      }}>
                        {item.description}
                      </p>
                    )}

                    <div style={{
                      display: 'flex',
                      gap: '16px',
                      flexWrap: 'wrap',
                      fontSize: '13px',
                      color: 'var(--text-muted)',
                      marginBottom: '10px'
                    }}>
                      {item.brought_by && (
                        <span><User className="w-4 h-4 inline mr-1" />Amené par: {item.brought_by.first_name} {item.brought_by.last_name}</span>
                      )}
                      {item.responsible && (
                        <span><Target className="w-4 h-4 inline mr-1" />Responsable: {item.responsible.first_name} {item.responsible.last_name}</span>
                      )}
                      {item.due_date && (
                        <span><Calendar className="w-4 h-4 inline mr-1" />Échéance: {new Date(item.due_date).toLocaleDateString('fr-CH')}</span>
                      )}
                    </div>

                    <div style={{
                      borderTop: '1px solid var(--border-color)',
                      paddingTop: '10px'
                    }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '8px'
                      }}>
                        <span style={{
                          color: 'var(--text-muted)',
                          fontSize: '12px',
                          textTransform: 'uppercase',
                          fontWeight: '600'
                        }}>
                          Décisions
                        </span>
                        {!isReadOnly && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setCurrentAgendaItemId(item.id);
                              setEditingDecision(null);
                              setDecisionFormData({
                                decision_text: '',
                                is_vote: false,
                                votes_for: 0,
                                votes_against: 0,
                                votes_abstention: 0
                              });
                              setShowDecisionModal(true);
                            }}
                          >
                            + Décision
                          </Button>
                        )}
                      </div>

                      {item.decisions && item.decisions.length > 0 ? (
                        item.decisions.map(decision => (
                          <div
                            key={decision.id}
                            style={{
                              background: 'var(--bg-hover)',
                              borderRadius: '6px',
                              padding: '10px',
                              marginBottom: '6px'
                            }}
                          >
                            <p style={{
                              color: 'var(--text-primary)',
                              fontSize: '14px',
                              margin: 0
                            }}>
                              {decision.decision_text}
                            </p>
                            {decision.is_vote && (
                              <div style={{
                                display: 'flex',
                                gap: '12px',
                                marginTop: '6px'
                              }}>
                                <span style={{
                                  color: 'var(--success-text)',
                                  fontSize: '13px'
                                }}>
                                  ✓ Pour: {decision.votes_for}
                                </span>
                                <span style={{
                                  color: 'var(--danger-text)',
                                  fontSize: '13px'
                                }}>
                                  ✗ Contre: {decision.votes_against}
                                </span>
                                <span style={{
                                  color: 'var(--warning-text)',
                                  fontSize: '13px'
                                }}>
                                  ~ Abstention: {decision.votes_abstention}
                                </span>
                              </div>
                            )}
                            {!isReadOnly && (
                              <div style={{
                                display: 'flex',
                                gap: '6px',
                                marginTop: '6px'
                              }}>
                                <button
                                  onClick={() => {
                                    setCurrentAgendaItemId(item.id);
                                    setEditingDecision(decision);
                                    setDecisionFormData({
                                      decision_text: decision.decision_text,
                                      is_vote: decision.is_vote,
                                      votes_for: decision.votes_for,
                                      votes_against: decision.votes_against,
                                      votes_abstention: decision.votes_abstention
                                    });
                                    setShowDecisionModal(true);
                                  }}
                                  className="text-sm hover:opacity-75" style={{ color: 'var(--text-muted)' }}
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteDecision(decision.id)}
                                  className="text-sm hover:opacity-75" style={{ color: 'var(--danger)' }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Aucune décision</p>
                      )}
                    </div>

                    <div style={{
                      borderTop: '1px solid var(--border-color)',
                      paddingTop: '8px',
                      marginTop: '8px'
                    }}>
                      {item.documents && item.documents.length > 0 && (
                        <div className="space-y-2 mb-2">
                          {item.documents.map(doc => (
                            <a
                              key={doc.id}
                              href={doc.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: 'var(--accent)',
                                fontSize: '13px',
                                display: 'block'
                              }}
                            >
                              <FileText className="w-3 h-3 inline mr-1" />{doc.name}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'decisions' && (
            <div>
              <h3 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Toutes les décisions</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead style={{ background: 'var(--table-header-bg)' }}>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Point</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Décision</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Vote</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Responsable</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Échéance</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                    {agendaItems.flatMap(item =>
                      (item.decisions || []).map(decision => (
                        <tr key={decision.id} className="hover:bg-[var(--bg-hover)]">
                          <td className="px-4 py-3" style={{ color: 'var(--text-primary)' }}>{item.order_number}. {item.title}</td>
                          <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{decision.decision_text}</td>
                          <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                            {decision.is_vote ? (
                              <div className="text-xs">
                                <div style={{ color: 'var(--success)' }}>✓ {decision.votes_for}</div>
                                <div style={{ color: 'var(--danger)' }}>✗ {decision.votes_against}</div>
                                <div className="text-[var(--warning-text)]">~ {decision.votes_abstention}</div>
                              </div>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                            {item.responsible ? `${item.responsible.first_name} ${item.responsible.last_name}` : '-'}
                          </td>
                          <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                            {item.due_date ? new Date(item.due_date).toLocaleDateString('fr-CH') : '-'}
                          </td>
                          <td className="px-4 py-3">{getStatusBadge(item.status)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'documents' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Documents de la séance</h3>
                {meeting.status === 'brouillon' && (
                  <label>
                    <input
                      type="file"
                      onChange={handleUploadDocument}
                      disabled={uploadingDoc}
                      style={{ display: 'none' }}
                    />
                    <span
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer text-sm font-semibold hover:opacity-90"
                      style={{ background: 'var(--accent)', color: 'var(--text-inverse)', opacity: uploadingDoc ? 0.6 : 1 }}
                    >
                      <Upload size={16} />
                      {uploadingDoc ? 'Envoi...' : 'Ajouter un document'}
                    </span>
                  </label>
                )}
              </div>
              {documents.length > 0 ? (
                <div className="space-y-2">
                  {documents.map(doc => (
                    <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
                      <a
                        href={doc.signed_url ?? doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:opacity-75" style={{ color: 'var(--accent)' }}
                      >
                        <FileText className="w-3 h-3 inline mr-1" />{doc.name}
                      </a>
                      <div className="flex items-center gap-3">
                        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                          {new Date(doc.uploaded_at).toLocaleDateString('fr-CH')}
                        </span>
                        {meeting.status === 'brouillon' && (
                          <button
                            onClick={() => handleDeleteDocument(doc)}
                            className="p-1 hover:opacity-75"
                            style={{ color: 'var(--danger)' }}
                            title="Supprimer"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)' }}>Aucun document</p>
              )}
            </div>
          )}

          {activeTab === 'export' && (
            <div>
              <h3 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Export & Finalisation</h3>

              <div className="space-y-4">
                <div className="p-4 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
                  <h4 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Statut actuel</h4>
                  <div className="flex items-center gap-3">
                    {meeting.status === 'brouillon' && (
                      <>
                        <span style={{ color: 'var(--text-muted)' }}><FileText className="w-4 h-4 inline mr-1" />Brouillon</span>
                        <Button
                          variant="primary"
                          onClick={handleFinalizeMeeting}
                        >
                          <Lock className="w-4 h-4 inline mr-1" />Finaliser le PV
                        </Button>
                      </>
                    )}
                    {meeting.status === 'finalise' && (
                      <>
                        <span style={{ color: 'var(--accent)' }}><Lock className="w-4 h-4 inline mr-1" />Finalisé</span>
                        <button
                          onClick={handleApproveMeeting}
                          className="px-4 py-2 rounded-lg hover:opacity-90"
                          style={{ background: 'var(--success)', color: 'var(--text-inverse)' }}
                        >
                          <CheckCircle className="w-4 h-4 inline mr-1" />Approuver le PV
                        </button>
                      </>
                    )}
                    {meeting.status === 'approuve' && (
                      <span style={{ color: 'var(--success)' }}><CheckCircle className="w-4 h-4 inline mr-1" />Approuvé</span>
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
                  <h4 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Export PDF</h4>
                  <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
                    Générer un PDF formaté du procès-verbal complet
                  </p>
                  <Button
                    variant="primary"
                    onClick={exportPDF}
                    leftIcon={<FileDown size={16} />}
                  >
                    Télécharger PDF
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showAgendaModal && (
        <div onClick={() => setShowAgendaModal(false)} className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div onClick={e => e.stopPropagation()} className="rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-card)' }}>
            <div className="px-6 py-4 rounded-t-xl" style={{ background: 'var(--bg-modal-header)' }}>
              <h3 className="text-xl font-bold" style={{ color: 'var(--text-modal-header)' }}>
                {editingAgendaItem ? 'Modifier le point' : 'Nouveau point'}
              </h3>
            </div>
            <form onSubmit={handleSaveAgendaItem} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Numéro
                  </label>
                  <input
                    type="number"
                    value={agendaFormData.order_number}
                    onChange={(e) => setAgendaFormData({
                      ...agendaFormData,
                      order_number: parseInt(e.target.value)
                    })}
                    className="w-full px-4 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Statut
                  </label>
                  <select
                    value={agendaFormData.status}
                    onChange={(e) => setAgendaFormData({
                      ...agendaFormData,
                      status: e.target.value as any
                    })}
                    className="w-full px-4 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  >
                    <option value="ouvert">Ouvert</option>
                    <option value="en_cours">En cours</option>
                    <option value="clos">Clos</option>
                    <option value="reporte">Reporté</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Titre du point *
                </label>
                <input
                  type="text"
                  value={agendaFormData.title}
                  onChange={(e) => setAgendaFormData({
                    ...agendaFormData,
                    title: e.target.value
                  })}
                  className="w-full px-4 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Description
                </label>
                <textarea
                  value={agendaFormData.description}
                  onChange={(e) => setAgendaFormData({
                    ...agendaFormData,
                    description: e.target.value
                  })}
                  rows={3}
                  className="w-full px-4 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Amené par
                  </label>
                  <select
                    value={agendaFormData.brought_by_id}
                    onChange={(e) => setAgendaFormData({
                      ...agendaFormData,
                      brought_by_id: e.target.value
                    })}
                    className="w-full px-4 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  >
                    <option value="">Aucun</option>
                    {committeeMembers.map(member => (
                      <option key={member.id} value={member.id}>
                        {member.first_name} {member.last_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Responsable du suivi
                  </label>
                  <select
                    value={agendaFormData.responsible_id}
                    onChange={(e) => setAgendaFormData({
                      ...agendaFormData,
                      responsible_id: e.target.value
                    })}
                    className="w-full px-4 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  >
                    <option value="">Aucun</option>
                    {committeeMembers.map(member => (
                      <option key={member.id} value={member.id}>
                        {member.first_name} {member.last_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Échéance
                </label>
                <input
                  type="date"
                  value={agendaFormData.due_date}
                  onChange={(e) => setAgendaFormData({
                    ...agendaFormData,
                    due_date: e.target.value
                  })}
                  className="w-full px-4 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    setShowAgendaModal(false);
                    setEditingAgendaItem(null);
                  }}
                >
                  Annuler
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                >
                  {editingAgendaItem ? 'Mettre à jour' : 'Ajouter'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDecisionModal && (
        <div onClick={() => setShowDecisionModal(false)} className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div onClick={e => e.stopPropagation()} className="rounded-lg max-w-xl w-full" style={{ background: 'var(--bg-card)' }}>
            <div className="px-6 py-4 rounded-t-xl" style={{ background: 'var(--bg-modal-header)' }}>
              <h3 className="text-xl font-bold" style={{ color: 'var(--text-modal-header)' }}>
                {editingDecision ? 'Modifier la décision' : 'Nouvelle décision'}
              </h3>
            </div>
            <form onSubmit={handleSaveDecision} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Décision *
                </label>
                <textarea
                  value={decisionFormData.decision_text}
                  onChange={(e) => setDecisionFormData({
                    ...decisionFormData,
                    decision_text: e.target.value
                  })}
                  rows={3}
                  className="w-full px-4 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  required
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_vote"
                  checked={decisionFormData.is_vote}
                  onChange={(e) => setDecisionFormData({
                    ...decisionFormData,
                    is_vote: e.target.checked
                  })}
                  className="w-4 h-4"
                />
                <label htmlFor="is_vote" className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Cette décision est un vote
                </label>
              </div>

              {decisionFormData.is_vote && (
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Pour
                    </label>
                    <input
                      type="number"
                      value={decisionFormData.votes_for}
                      onChange={(e) => setDecisionFormData({
                        ...decisionFormData,
                        votes_for: parseInt(e.target.value) || 0
                      })}
                      className="w-full px-4 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Contre
                    </label>
                    <input
                      type="number"
                      value={decisionFormData.votes_against}
                      onChange={(e) => setDecisionFormData({
                        ...decisionFormData,
                        votes_against: parseInt(e.target.value) || 0
                      })}
                      className="w-full px-4 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Abstention
                    </label>
                    <input
                      type="number"
                      value={decisionFormData.votes_abstention}
                      onChange={(e) => setDecisionFormData({
                        ...decisionFormData,
                        votes_abstention: parseInt(e.target.value) || 0
                      })}
                      className="w-full px-4 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      min="0"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3 justify-end pt-4">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    setShowDecisionModal(false);
                    setEditingDecision(null);
                    setCurrentAgendaItemId(null);
                  }}
                >
                  Annuler
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                >
                  {editingDecision ? 'Mettre à jour' : 'Ajouter'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showNotifyModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.6)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '28px',
            width: '440px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <Bell size={36} style={{ color: 'var(--accent)', margin: '0 auto' }} />
            </div>
            <h3 style={{
              color: 'var(--text-primary)', textAlign: 'center',
              marginBottom: '8px', fontSize: '18px', fontWeight: '700',
            }}>
              Notifier les participants
            </h3>

            {unnotifiedCount === totalAttendees ? (
              <>
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', fontSize: '14px', marginBottom: '20px' }}>
                  Envoyer une notification et un e-mail (avec l'ordre du jour) aux {totalAttendees} participant(s) ?
                </p>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <Button variant="ghost" onClick={() => setShowNotifyModal(false)}>Annuler</Button>
                  <Button variant="primary" onClick={() => sendNotify('new')}>Envoyer</Button>
                </div>
              </>
            ) : unnotifiedCount === 0 ? (
              <>
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', fontSize: '14px', marginBottom: '20px' }}>
                  Tout le monde a déjà été prévenu. Renvoyer une notification et un e-mail (« Séance mise à jour ») aux {totalAttendees} participant(s) ?
                </p>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <Button variant="ghost" onClick={() => setShowNotifyModal(false)}>Annuler</Button>
                  <Button variant="primary" onClick={() => sendNotify('all')}>Renvoyer à tout le monde ({totalAttendees})</Button>
                </div>
              </>
            ) : (
              <>
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', fontSize: '14px', marginBottom: '12px' }}>
                  {unnotifiedCount} participant(s) n'ont pas encore été prévenus.
                </p>
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: '12px', marginBottom: '20px', fontStyle: 'italic' }}>
                  « Tout le monde » : à utiliser si l'ordre du jour, la date ou le lieu ont changé.
                </p>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <Button variant="ghost" onClick={() => setShowNotifyModal(false)}>Annuler</Button>
                  <Button variant="primary" onClick={() => sendNotify('new')}>Seulement les nouveaux ({unnotifiedCount})</Button>
                  <Button variant="primary" onClick={() => sendNotify('all')}>Tout le monde ({totalAttendees})</Button>
                </div>
              </>
            )}
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
