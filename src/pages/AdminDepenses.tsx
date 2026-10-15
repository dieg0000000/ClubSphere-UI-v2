import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useTenant } from '../context/TenantContext'
import { useToast } from '../hooks/useToast'
import { Toast } from '../components/Toast'
import { StandardModal } from '../components/StandardModal'
import { ConfirmModal } from '../components/ConfirmModal'
import { ExpenseFormModal } from '../components/ExpenseFormModal'
import { Tabs } from '../components/ui/Tabs'
import Button from '../components/ui/Button'
import DataTableShell from '../components/DataTableShell'
import SearchInput from '../components/ui/SearchInput'
import PageTitleCount from '../components/PageTitleCount'
import { Plus, Pencil, Trash2, ReceiptText, ExternalLink, ChevronUp, ChevronDown, Check, Circle as XCircle } from 'lucide-react'

/* ───────── shared types ───────── */

interface ExpenseGroup {
  id: string
  name: string
  account_number: string | null
  active: boolean
}

interface Supplier {
  id: string
  name: string
  note: string | null
  active: boolean
}

interface TeamOption {
  id: string
  name: string
}

interface EventOption {
  id: string
  title: string
  date: string
}

interface CoachOption {
  id: string
  first_name: string
  last_name: string
}

interface ExpenseRow {
  id: string
  expense_number: number
  expense_date: string
  group_id: string | null
  supplier_id: string | null
  description: string
  amount: number
  status: string
  receipt_path: string | null
  team_id: string | null
  event_id: string | null
  reimbursed_to_coach_id: string | null
  created_by: string | null
  created_at: string | null
  rejected_reason: string | null
  expense_groups: { name: string; account_number: string | null } | null
  suppliers: { name: string } | null
  teams: { name: string } | null
  events: { title: string } | null
  coaches: { first_name: string; last_name: string } | null
  creator_name: string | null
}

type TabKey = 'expenses' | 'groups' | 'suppliers'

import { Badge } from '../components/ui/Badge'
import { getExpenseStatus, getExpenseStatusEntries, getExpenseRowTint } from '../utils/expenseStatus'

function padNum(n: number) { return String(n).padStart(5, '0') }

function computeExercice(dateStr: string): string {
  const d = new Date(dateStr)
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const startYear = m >= 7 ? y : y - 1
  return `${startYear}-${startYear + 1}`
}

function currentExercice(): string {
  return computeExercice(new Date().toISOString().slice(0, 10))
}

/* ───────── expense sort ───────── */

type ExpSortKey = 'number' | 'date' | 'description' | 'amount' | 'compte' | 'soumis' | 'rattachement' | 'statut'

const EXP_COLUMNS: { label: string; sortKey?: ExpSortKey; align?: 'right' }[] = [
  { label: 'N°', sortKey: 'number' },
  { label: 'Date', sortKey: 'date' },
  { label: 'Description', sortKey: 'description' },
  { label: 'Compte', sortKey: 'compte' },
  { label: 'Fournisseur' },
  { label: 'Rattachement', sortKey: 'rattachement' },
  { label: 'Montant', sortKey: 'amount', align: 'right' },
  { label: 'Statut', sortKey: 'statut' },
  { label: '' },
]

function sortExpenses(rows: ExpenseRow[], key: ExpSortKey, dir: 'asc' | 'desc'): ExpenseRow[] {
  const m = dir === 'asc' ? 1 : -1
  const cmp = (a: ExpenseRow, b: ExpenseRow): number => {
    switch (key) {
      case 'number': return (a.expense_number - b.expense_number) * m
      case 'date': return a.expense_date.localeCompare(b.expense_date) * m
      case 'amount': return (a.amount - b.amount) * m
      case 'description': {
        const av = a.description || ''
        const bv = b.description || ''
        if (!av && bv) return 1
        if (av && !bv) return -1
        return av.localeCompare(bv, 'fr', { sensitivity: 'base' }) * m
      }
      case 'compte': {
        const av = a.expense_groups?.name || ''
        const bv = b.expense_groups?.name || ''
        if (!av && bv) return 1
        if (av && !bv) return -1
        return av.localeCompare(bv, 'fr', { sensitivity: 'base' }) * m
      }
      case 'soumis': {
        const av = a.creator_name || ''
        const bv = b.creator_name || ''
        if (!av && bv) return 1
        if (av && !bv) return -1
        return av.localeCompare(bv, 'fr', { sensitivity: 'base' }) * m
      }
      case 'rattachement': {
        const av = a.teams?.name || a.events?.title || ''
        const bv = b.teams?.name || b.events?.title || ''
        if (!av && bv) return 1
        if (av && !bv) return -1
        return av.localeCompare(bv, 'fr', { sensitivity: 'base' }) * m
      }
      case 'statut': {
        const av = getExpenseStatus(a.status).label
        const bv = getExpenseStatus(b.status).label
        return av.localeCompare(bv, 'fr', { sensitivity: 'base' }) * m
      }
      default: return 0
    }
  }
  return [...rows].sort(cmp)
}

/* ───────── main component ───────── */

export function AdminDepenses() {
  const { clubId } = useTenant()
  const { toast, showToast } = useToast()
  const [tab, setTab] = useState<TabKey>('expenses')

  /* shared data */
  const [groups, setGroups] = useState<ExpenseGroup[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [loadingSuppliers, setLoadingSuppliers] = useState(true)

  /* reference data for expenses */
  const [teams, setTeams] = useState<TeamOption[]>([])
  const [events, setEvents] = useState<EventOption[]>([])
  const [coaches, setCoaches] = useState<CoachOption[]>([])

  /* expenses tab state */
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [loadingExpenses, setLoadingExpenses] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterGroup, setFilterGroup] = useState('')
  const [filterTeam, setFilterTeam] = useState('')
  const [filterExercice, setFilterExercice] = useState(currentExercice())
  const [expenseModal, setExpenseModal] = useState<{ open: boolean; item: ExpenseRow | null }>({ open: false, item: null })
  const [expSort, setExpSort] = useState<{ key: ExpSortKey; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' })

  /* groups tab state */
  const [groupModal, setGroupModal] = useState<{ open: boolean; item: ExpenseGroup | null }>({ open: false, item: null })
  const [groupForm, setGroupForm] = useState({ name: '', account_number: '' })
  const [groupSearch, setGroupSearch] = useState('')
  const [groupSort, setGroupSort] = useState<{ key: 'name' | 'account_number'; dir: 'asc' | 'desc' }>({ key: 'account_number', dir: 'asc' })

  /* suppliers tab state */
  const [supplierModal, setSupplierModal] = useState<{ open: boolean; item: Supplier | null }>({ open: false, item: null })
  const [supplierForm, setSupplierForm] = useState({ name: '', note: '' })

  /* shared form state */
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'group' | 'supplier'; id: string; name: string } | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  /* ───── loaders ───── */

  const loadGroups = useCallback(async () => {
    if (!clubId) return
    setLoadingGroups(true)
    const { data, error } = await supabase
      .from('expense_groups')
      .select('id, name, account_number, active')
      .eq('club_id', clubId)
      .order('name')
    if (error) showToast('Erreur lors du chargement des comptes', 'error')
    else setGroups(data || [])
    setLoadingGroups(false)
  }, [clubId])

  const loadSuppliers = useCallback(async () => {
    if (!clubId) return
    setLoadingSuppliers(true)
    const { data, error } = await supabase
      .from('suppliers')
      .select('id, name, note, active')
      .eq('club_id', clubId)
      .order('name')
    if (error) showToast('Erreur lors du chargement des fournisseurs', 'error')
    else setSuppliers(data || [])
    setLoadingSuppliers(false)
  }, [clubId])

  const loadExpenses = useCallback(async () => {
    if (!clubId) return
    setLoadingExpenses(true)
    const { data, error } = await supabase
      .from('expenses')
      .select('id, expense_number, expense_date, group_id, supplier_id, description, amount, status, receipt_path, team_id, event_id, reimbursed_to_coach_id, created_by, created_at, rejected_reason, creator_name, expense_groups(name, account_number), suppliers(name), teams(name), events(title), coaches!expenses_reimbursed_to_coach_id_fkey(first_name, last_name)')
      .eq('club_id', clubId)
      .order('expense_date', { ascending: false })
      .order('expense_number', { ascending: false })
    if (error) {
      console.error('[AdminDepenses] expenses query error:', error)
      showToast('Erreur lors du chargement des dépenses', 'error')
    }
    else setExpenses((data as unknown as ExpenseRow[]) || [])
    setLoadingExpenses(false)
  }, [clubId])

  const loadTeams = useCallback(async () => {
    if (!clubId) return
    const { data } = await supabase
      .from('teams')
      .select('id, name')
      .eq('club_id', clubId)
      .eq('active', true)
      .order('name')
    setTeams((data as TeamOption[]) || [])
  }, [clubId])

  const loadEvents = useCallback(async () => {
    if (!clubId) return
    const { data } = await supabase
      .from('events')
      .select('id, title, date')
      .eq('club_id', clubId)
      .order('date', { ascending: false })
      .limit(200)
    setEvents((data as EventOption[]) || [])
  }, [clubId])

  const loadCoaches = useCallback(async () => {
    if (!clubId) return
    const { data } = await supabase
      .from('coaches')
      .select('id, first_name, last_name')
      .eq('club_id', clubId)
      .is('self_deleted_at', null)
      .order('last_name')
    setCoaches((data as CoachOption[]) || [])
  }, [clubId])

  useEffect(() => { document.title = 'Dépenses - ClubSphere' }, [])
  useEffect(() => { loadGroups() }, [loadGroups])
  useEffect(() => { loadSuppliers() }, [loadSuppliers])
  useEffect(() => { loadExpenses() }, [loadExpenses])
  useEffect(() => { loadTeams() }, [loadTeams])
  useEffect(() => { loadEvents() }, [loadEvents])
  useEffect(() => { loadCoaches() }, [loadCoaches])

  /* ───── exercice list ───── */

  const exerciceOptions = useMemo(() => {
    const set = new Set<string>()
    set.add(currentExercice())
    for (const e of expenses) {
      set.add(computeExercice(e.expense_date))
    }
    return Array.from(set).sort().reverse()
  }, [expenses])

  /* ───── filtered & sorted expenses ───── */

  const filteredExpenses = useMemo(() => {
    const filtered = expenses.filter(e => {
      if (filterStatus && e.status !== filterStatus) return false
      if (filterGroup && e.group_id !== filterGroup) return false
      if (filterTeam && e.team_id !== filterTeam) return false
      if (filterExercice && computeExercice(e.expense_date) !== filterExercice) return false
      return true
    })
    return sortExpenses(filtered, expSort.key, expSort.dir)
  }, [expenses, filterStatus, filterGroup, filterTeam, filterExercice, expSort])

  function toggleExpSort(key: ExpSortKey) {
    setExpSort(prev => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' })
  }

  /* ───── receipt signed URL ───── */

  async function handleQuickApprove(exp: ExpenseRow) {
    if (!exp.group_id) {
      setExpenseModal({ open: true, item: exp })
      return
    }
    const { error } = await supabase
      .from('expenses')
      .update({ status: 'approved', rejected_reason: null })
      .eq('id', exp.id)
    if (error) { showToast(`Erreur : ${error.message}`, 'error'); return }
    showToast('Dépense approuvée.', 'success')
    loadExpenses()
  }

  async function openReceipt(path: string) {
    const { data, error } = await supabase.storage
      .from('expense-receipts')
      .createSignedUrl(path, 300)
    if (error || !data?.signedUrl) {
      showToast('Impossible d\'ouvrir le justificatif.', 'error')
      return
    }
    window.open(data.signedUrl, '_blank')
  }

  /* ───── group CRUD ───── */

  function openGroupModal(item: ExpenseGroup | null) {
    setGroupForm(item ? { name: item.name, account_number: item.account_number || '' } : { name: '', account_number: '' })
    setFormError(null)
    setGroupModal({ open: true, item })
  }

  async function saveGroup() {
    if (!groupForm.name.trim()) { setFormError('Le nom est obligatoire.'); return }
    setSaving(true); setFormError(null)
    const payload = { name: groupForm.name.trim(), account_number: groupForm.account_number.trim() || null }
    let error
    if (groupModal.item) {
      ;({ error } = await supabase.from('expense_groups').update(payload).eq('id', groupModal.item.id))
    } else {
      ;({ error } = await supabase.from('expense_groups').insert(payload))
    }
    setSaving(false)
    if (error) { setFormError(error.message); return }
    setGroupModal({ open: false, item: null })
    loadGroups()
  }

  /* ───── supplier CRUD ───── */

  function openSupplierModal(item: Supplier | null) {
    setSupplierForm(item ? { name: item.name, note: item.note || '' } : { name: '', note: '' })
    setFormError(null)
    setSupplierModal({ open: true, item })
  }

  async function saveSupplier() {
    if (!supplierForm.name.trim()) { setFormError('Le nom est obligatoire.'); return }
    setSaving(true); setFormError(null)
    const payload = { name: supplierForm.name.trim(), note: supplierForm.note.trim() || null }
    let error
    if (supplierModal.item) {
      ;({ error } = await supabase.from('suppliers').update(payload).eq('id', supplierModal.item.id))
    } else {
      ;({ error } = await supabase.from('suppliers').insert(payload))
    }
    setSaving(false)
    if (error) { setFormError(error.message); return }
    setSupplierModal({ open: false, item: null })
    loadSuppliers()
  }

  /* ───── delete / deactivate ───── */

  function openDelete(type: 'group' | 'supplier', id: string, name: string) {
    setDeleteError(null)
    setDeleteTarget({ type, id, name })
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true); setDeleteError(null)
    const table = deleteTarget.type === 'group' ? 'expense_groups' : 'suppliers'
    const { error } = await supabase.from(table).delete().eq('id', deleteTarget.id)
    setDeleting(false)
    if (error) {
      setDeleteError(
        error.code === '23503'
          ? (deleteTarget.type === 'group'
            ? 'Ce compte est utilisé par des dépenses existantes. Vous pouvez le désactiver à la place.'
            : 'Ce fournisseur est utilisé par des dépenses existantes. Vous pouvez le désactiver à la place.')
          : error.message
      )
      return
    }
    setDeleteTarget(null)
    if (deleteTarget.type === 'group') loadGroups(); else loadSuppliers()
  }

  async function deactivateDeleteTarget() {
    if (!deleteTarget) return
    setDeleting(true)
    const table = deleteTarget.type === 'group' ? 'expense_groups' : 'suppliers'
    const { error } = await supabase.from(table).update({ active: false }).eq('id', deleteTarget.id)
    setDeleting(false)
    if (error) { setDeleteError(error.message); return }
    setDeleteTarget(null)
    if (deleteTarget.type === 'group') loadGroups(); else loadSuppliers()
  }

  /* ───── styles ───── */

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    border: '1px solid var(--border-color)', background: 'var(--bg-hover)',
    color: 'var(--text-primary)', fontSize: '14px',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '13px',
    color: 'var(--text-muted)', marginBottom: '6px',
  }
  const submittedCount = useMemo(
    () => expenses.filter(e => e.status === 'submitted').length,
    [expenses]
  )

  const tabItems = [
    { key: 'expenses', label: 'Dépenses', count: submittedCount || undefined },
    { key: 'groups', label: 'Comptes' },
    { key: 'suppliers', label: 'Fournisseurs' },
  ]

  return (
    <div className="p-4 lg:p-8 w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
          <ReceiptText className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          Dépenses
          <PageTitleCount total={expenses.length} filtered={filteredExpenses.length} isFiltered={!!filterStatus || !!filterGroup || !!filterTeam} />
        </h1>
        {tab === 'expenses' && (
          <Button onClick={() => setExpenseModal({ open: true, item: null })} leftIcon={<Plus size={20} />}>
            Nouvelle dépense
          </Button>
        )}
      </div>

      <Tabs items={tabItems} value={tab} onChange={(k) => setTab(k as TabKey)} />

      <div style={{ marginTop: '20px' }}>

        {/* ═══════ EXPENSES TAB ═══════ */}
        {tab === 'expenses' && (
          <>
            {/* Filters */}
            <div className="mb-4 flex flex-wrap gap-3">
              <select className="px-4 py-2 bg-[var(--bg-input,var(--bg-card))] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm" value={filterExercice} onChange={(e) => setFilterExercice(e.target.value)}>
                <option value="">Tous les exercices</option>
                {exerciceOptions.map(ex => <option key={ex} value={ex}>{ex}</option>)}
              </select>
              <select className="px-4 py-2 bg-[var(--bg-input,var(--bg-card))] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">Tous les statuts</option>
                {getExpenseStatusEntries().map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select className="px-4 py-2 bg-[var(--bg-input,var(--bg-card))] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm" value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}>
                <option value="">Tous les comptes</option>
                {[...groups].sort((a, b) => (a.account_number || '').localeCompare(b.account_number || '')).map(g => <option key={g.id} value={g.id}>{g.name}{g.account_number ? ` — ${g.account_number}` : ''}</option>)}
              </select>
              <select className="px-4 py-2 bg-[var(--bg-input,var(--bg-card))] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm" value={filterTeam} onChange={(e) => setFilterTeam(e.target.value)}>
                <option value="">Toutes les équipes</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            {loadingExpenses ? (
              <div style={{ color: 'var(--text-primary)' }}>Chargement...</div>
            ) : filteredExpenses.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', padding: '32px', textAlign: 'center' }}>Aucune dépense pour ces filtres.</div>
            ) : (
              <div className="std-table-wrap">
                <style>{`
                  .expenses-sticky-head thead th { position: relative; }
                  .expenses-sticky-head thead th::after {
                    content: '';
                    position: absolute;
                    left: 0; right: 0; bottom: -8px;
                    height: 8px;
                    pointer-events: none;
                    background: linear-gradient(to bottom, rgba(0,0,0,0.28), rgba(0,0,0,0));
                  }
                `}</style>
                <div style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto', overflowX: 'auto' }}>
                  <table className="std-table expenses-sticky-head" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '68px' }} />
                      <col style={{ width: '88px' }} />
                      <col style={{ width: '22%' }} />{/* Description - capped */}
                      <col style={{ width: '13%' }} />{/* Compte */}
                      <col style={{ width: '11%' }} />{/* Fournisseur */}
                      <col style={{ width: '13%' }} />{/* Rattachement */}
                      <col style={{ width: '96px' }} />
                      <col style={{ width: '120px' }} />{/* Statut - fits "Comptabilisée" */}
                      <col style={{ width: '80px' }} />
                    </colgroup>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                      <tr>
                        {EXP_COLUMNS.map((col) => {
                          const active = col.sortKey === expSort.key
                          const SortChevron = active ? (expSort.dir === 'asc' ? ChevronUp : ChevronDown) : null
                          return (
                            <th key={col.sortKey || col.label}
                              className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider"
                              style={{
                                textAlign: col.align || 'left',
                                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                                background: 'var(--table-header-bg)',
                                borderBottom: '1px solid var(--border-color)',
                                position: 'sticky', top: 0, zIndex: 2,
                                cursor: col.sortKey ? 'pointer' : undefined,
                                userSelect: col.sortKey ? 'none' : undefined,
                              }}
                              onClick={col.sortKey ? () => toggleExpSort(col.sortKey!) : undefined}
                            >
                              {col.label}
                              {SortChevron && <SortChevron size={13} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '2px' }} />}
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <caption style={{ captionSide: 'top', textAlign: 'left', padding: '0 12px 8px', fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.01em' }}>
                      Bleu = approuvée &middot; Vert pâle = remboursée &middot; Vert = comptabilisée &middot; Rouge = refusée
                    </caption>
                    <tbody>
                      {filteredExpenses.map(exp => {
                        const st = getExpenseStatus(exp.status)
                        const rowTint = getExpenseRowTint(exp.status)
                        const rattachement = exp.teams?.name || exp.events?.title || ''
                        return (
                          <tr
                            key={exp.id}
                            onClick={() => setExpenseModal({ open: true, item: exp })}
                            style={{
                              borderBottom: '1px solid var(--border-color)',
                              cursor: 'pointer', transition: 'background 0.15s',
                              background: rowTint,
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = rowTint }}
                          >
                            <td className="px-3 py-2.5" style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                              {padNum(exp.expense_number)}
                            </td>
                            <td className="px-3 py-2.5" style={{ fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                              {new Date(exp.expense_date).toLocaleDateString('fr-CH')}
                            </td>
                            <td className="px-3 py-2.5" style={{ fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={exp.description}>
                              {exp.description}
                              {exp.creator_name && ['submitted', 'approved', 'reimbursed', 'rejected'].includes(exp.status) && (
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Soumis par {exp.creator_name}</div>
                              )}
                            </td>
                            <td className="px-3 py-2.5" style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={exp.expense_groups ? `${exp.expense_groups.name}${exp.expense_groups.account_number ? ` (${exp.expense_groups.account_number})` : ''}` : undefined}>
                              {exp.expense_groups
                                ? `${exp.expense_groups.name}${exp.expense_groups.account_number ? ` (${exp.expense_groups.account_number})` : ''}`
                                : '—'}
                            </td>
                            <td className="px-3 py-2.5" style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={exp.suppliers?.name || undefined}>
                              {exp.suppliers?.name || '—'}
                            </td>
                            <td className="px-3 py-2.5" style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={rattachement || undefined}>
                              {rattachement || '—'}
                            </td>
                            <td className="px-3 py-2.5" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                              {exp.amount.toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-3 py-2.5" style={{ whiteSpace: 'nowrap' }}>
                              <Badge variant={st.variant}>{st.label}</Badge>
                            </td>
                            <td className="px-3 py-2.5">
                              <div style={{ display: 'flex', gap: '4px', alignItems: 'center', justifyContent: 'flex-end' }}>
                                {exp.status === 'submitted' && (
                                  <>
                                    <button
                                      title={exp.group_id ? 'Approuver' : 'Ouvrir pour assigner un compte puis approuver'}
                                      onClick={(e) => { e.stopPropagation(); handleQuickApprove(exp) }}
                                      style={{
                                        background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                                        color: 'var(--success-text)', display: 'flex', borderRadius: '6px',
                                      }}
                                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                                      onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                                    >
                                      <Check size={15} />
                                    </button>
                                    <button
                                      title="Refuser"
                                      onClick={(e) => { e.stopPropagation(); setExpenseModal({ open: true, item: exp }) }}
                                      style={{
                                        background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                                        color: 'var(--danger)', display: 'flex', borderRadius: '6px',
                                      }}
                                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                                      onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                                    >
                                      <XCircle size={15} />
                                    </button>
                                  </>
                                )}
                                {exp.receipt_path && (
                                  <button
                                    title="Ouvrir le justificatif"
                                    onClick={(e) => { e.stopPropagation(); openReceipt(exp.receipt_path!) }}
                                    style={{
                                      background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                                      color: 'var(--accent)', display: 'flex', borderRadius: '6px',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                                  >
                                    <ExternalLink size={15} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* ═══════ COMPTES TAB ═══════ */}
        {tab === 'groups' && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <SearchInput
                  value={groupSearch}
                  onChange={setGroupSearch}
                  placeholder="Rechercher par nom ou n° de compte…"
                  inputSize="md"
                />
              </div>
              <Button onClick={() => openGroupModal(null)} leftIcon={<Plus size={20} />}>
                Nouveau compte
              </Button>
            </div>
            {loadingGroups ? (
              <div style={{ color: 'var(--text-primary)' }}>Chargement...</div>
            ) : groups.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', padding: '32px', textAlign: 'center' }}>Aucun compte.</div>
            ) : (() => {
              const q = groupSearch.toLowerCase().trim()
              const filtered = q
                ? groups.filter(g =>
                    g.name.toLowerCase().includes(q) ||
                    (g.account_number && g.account_number.toLowerCase().includes(q))
                  )
                : groups

              const sorted = [...filtered].sort((a, b) => {
                const dir = groupSort.dir === 'asc' ? 1 : -1
                const aVal = a[groupSort.key] ?? ''
                const bVal = b[groupSort.key] ?? ''
                if (!aVal && bVal) return 1
                if (aVal && !bVal) return -1
                return aVal.localeCompare(bVal, 'fr', { numeric: true }) * dir
              })

              function toggleSort(key: 'name' | 'account_number') {
                setGroupSort(prev =>
                  prev.key === key
                    ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
                    : { key, dir: 'asc' }
                )
              }

              const SortIcon = ({ col }: { col: 'name' | 'account_number' }) => {
                if (groupSort.key !== col) return null
                const Icon = groupSort.dir === 'asc' ? ChevronUp : ChevronDown
                return <Icon size={14} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '2px' }} />
              }

              const thSortable: React.CSSProperties = {
                textAlign: 'left', padding: '8px 16px', color: 'var(--text-muted)',
                fontSize: '12px', fontWeight: '600', cursor: 'pointer', userSelect: 'none',
              }

              if (filtered.length === 0) {
                return <div style={{ color: 'var(--text-muted)', padding: '32px', textAlign: 'center' }}>Aucun résultat.</div>
              }

              return (
                <DataTableShell bare>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <th style={thSortable} onClick={() => toggleSort('name')}>
                          Nom <SortIcon col="name" />
                        </th>
                        <th style={{ ...thSortable, width: '160px' }} onClick={() => toggleSort('account_number')}>
                          N° de compte <SortIcon col="account_number" />
                        </th>
                        <th style={{ textAlign: 'left', padding: '8px 16px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600', width: '120px' }}>Statut</th>
                        <th style={{ width: '100px', padding: '8px 16px' }} />
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map(g => (
                        <tr
                          key={g.id}
                          style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.15s' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                        >
                          <td style={{ padding: '10px 16px', color: 'var(--text-primary)', fontSize: '14px', fontWeight: 500 }}>{g.name}</td>
                          <td style={{ padding: '10px 16px', color: 'var(--text-muted)', fontSize: '13px', fontFamily: 'monospace' }}>{g.account_number || '—'}</td>
                          <td style={{ padding: '10px 16px' }}>
                            <span style={{
                              background: g.active ? 'var(--success-soft)' : 'var(--bg-hover)',
                              color: g.active ? 'var(--success-text)' : 'var(--text-muted)',
                              border: `1px solid ${g.active ? 'var(--success)' : 'var(--border-color)'}`,
                              borderRadius: '99px', padding: '2px 10px', fontSize: '12px', fontWeight: '700',
                            }}>{g.active ? 'Actif' : 'Inactif'}</span>
                          </td>
                          <td style={{ padding: '10px 16px' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              <IconBtn title="Modifier" onClick={() => openGroupModal(g)}><Pencil size={14} /></IconBtn>
                              <IconBtn title="Supprimer" onClick={() => openDelete('group', g.id, g.name)} danger><Trash2 size={14} /></IconBtn>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </DataTableShell>
              )
            })()}
          </>
        )}

        {/* ═══════ SUPPLIERS TAB ═══════ */}
        {tab === 'suppliers' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
              <Button onClick={() => openSupplierModal(null)} leftIcon={<Plus size={20} />}>
                Nouveau fournisseur
              </Button>
            </div>
            {loadingSuppliers ? (
              <div style={{ color: 'var(--text-primary)' }}>Chargement...</div>
            ) : suppliers.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', padding: '32px', textAlign: 'center' }}>Aucun fournisseur.</div>
            ) : (
              <DataTableShell bare>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ textAlign: 'left', padding: '8px 16px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>Nom</th>
                      <th style={{ textAlign: 'left', padding: '8px 16px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>Note</th>
                      <th style={{ textAlign: 'left', padding: '8px 16px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600', width: '120px' }}>Statut</th>
                      <th style={{ width: '100px', padding: '8px 16px' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map(s => (
                      <tr
                        key={s.id}
                        style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                      >
                        <td style={{ padding: '10px 16px', color: 'var(--text-primary)', fontSize: '14px', fontWeight: 500 }}>{s.name}</td>
                        <td style={{ padding: '10px 16px', color: 'var(--text-muted)', fontSize: '13px' }}>{s.note || '—'}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{
                            background: s.active ? 'var(--success-soft)' : 'var(--bg-hover)',
                            color: s.active ? 'var(--success-text)' : 'var(--text-muted)',
                            border: `1px solid ${s.active ? 'var(--success)' : 'var(--border-color)'}`,
                            borderRadius: '99px', padding: '2px 10px', fontSize: '12px', fontWeight: '700',
                          }}>{s.active ? 'Actif' : 'Inactif'}</span>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <IconBtn title="Modifier" onClick={() => openSupplierModal(s)}><Pencil size={14} /></IconBtn>
                            <IconBtn title="Supprimer" onClick={() => openDelete('supplier', s.id, s.name)} danger><Trash2 size={14} /></IconBtn>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTableShell>
            )}
          </>
        )}
      </div>

      {/* ═══════ EXPENSE FORM MODAL ═══════ */}
      <ExpenseFormModal
        isOpen={expenseModal.open}
        expense={expenseModal.item ? {
          id: expenseModal.item.id,
          expense_number: expenseModal.item.expense_number,
          expense_date: expenseModal.item.expense_date,
          group_id: expenseModal.item.group_id,
          supplier_id: expenseModal.item.supplier_id,
          description: expenseModal.item.description,
          amount: expenseModal.item.amount,
          status: expenseModal.item.status,
          receipt_path: expenseModal.item.receipt_path,
          team_id: expenseModal.item.team_id,
          event_id: expenseModal.item.event_id,
          reimbursed_to_coach_id: expenseModal.item.reimbursed_to_coach_id,
          created_by: expenseModal.item.created_by,
          rejected_reason: expenseModal.item.rejected_reason,
        } : null}
        groups={groups}
        suppliers={suppliers}
        teams={teams}
        events={events}
        coaches={coaches}
        createdByName={expenseModal.item?.creator_name || null}
        createdAt={expenseModal.item?.created_at || null}
        coachName={expenseModal.item?.coaches ? `${expenseModal.item.coaches.first_name} ${expenseModal.item.coaches.last_name}`.trim() : null}
        onClose={() => setExpenseModal({ open: false, item: null })}
        onSaved={() => {
          setExpenseModal({ open: false, item: null })
          loadExpenses()
          showToast('Dépense enregistrée.', 'success')
        }}
        onStatusChanged={() => {
          setExpenseModal({ open: false, item: null })
          loadExpenses()
        }}
        onDeleted={() => {
          setExpenseModal({ open: false, item: null })
          loadExpenses()
        }}
        onSuppliersChanged={loadSuppliers}
        showToast={showToast}
      />

      {/* ═══════ GROUP MODAL ═══════ */}
      <StandardModal
        isOpen={groupModal.open}
        onClose={() => setGroupModal({ open: false, item: null })}
        title={groupModal.item ? 'Modifier le compte' : 'Nouveau compte'}
        width="500px"
      >
        <div style={{ display: 'grid', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Nom</label>
            <input style={inputStyle} value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} placeholder="Ex: Matériel sportif" autoFocus />
          </div>
          <div>
            <label style={labelStyle}>N° de compte</label>
            <input style={inputStyle} value={groupForm.account_number} onChange={(e) => setGroupForm({ ...groupForm, account_number: e.target.value })} placeholder="Ex: 4200" />
          </div>
          {formError && <p style={{ color: 'var(--danger)', fontSize: '13px', margin: 0 }}>{formError}</p>}
        </div>
        <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
          <Button variant="secondary" onClick={() => setGroupModal({ open: false, item: null })} className="flex-1">Annuler</Button>
          <Button onClick={saveGroup} disabled={saving} className="flex-1">{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
        </div>
      </StandardModal>

      {/* ═══════ SUPPLIER MODAL ═══════ */}
      <StandardModal
        isOpen={supplierModal.open}
        onClose={() => setSupplierModal({ open: false, item: null })}
        title={supplierModal.item ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}
        width="500px"
      >
        <div style={{ display: 'grid', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Nom</label>
            <input style={inputStyle} value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} placeholder="Ex: Sport Direct SA" autoFocus />
          </div>
          <div>
            <label style={labelStyle}>Note</label>
            <input style={inputStyle} value={supplierForm.note} onChange={(e) => setSupplierForm({ ...supplierForm, note: e.target.value })} placeholder="Remarque facultative" />
          </div>
          {formError && <p style={{ color: 'var(--danger)', fontSize: '13px', margin: 0 }}>{formError}</p>}
        </div>
        <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
          <Button variant="secondary" onClick={() => setSupplierModal({ open: false, item: null })} className="flex-1">Annuler</Button>
          <Button onClick={saveSupplier} disabled={saving} className="flex-1">{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
        </div>
      </StandardModal>

      {/* ═══════ DELETE CONFIRM ═══════ */}
      {deleteTarget && !deleteError && (
        <ConfirmModal
          isOpen
          title={`Supprimer « ${deleteTarget.name} » ?`}
          message="Cette action est irréversible."
          confirmLabel="Supprimer"
          confirmStyle="danger"
          loading={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {deleteTarget && deleteError && (
        <StandardModal isOpen onClose={() => { setDeleteTarget(null); setDeleteError(null) }} title="Suppression impossible">
          <p style={{ color: 'var(--danger)', fontSize: '14px', lineHeight: 1.5, margin: '0 0 20px' }}>{deleteError}</p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => { setDeleteTarget(null); setDeleteError(null) }}>Fermer</Button>
            <Button onClick={deactivateDeleteTarget} disabled={deleting}>{deleting ? 'Désactivation…' : 'Désactiver'}</Button>
          </div>
        </StandardModal>
      )}

      <Toast toast={toast} />
    </div>
  )
}

function IconBtn({ children, title, onClick, danger }: {
  children: React.ReactNode; title: string; onClick: () => void; danger?: boolean
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: '6px',
        borderRadius: '8px', color: danger ? 'var(--danger)' : 'var(--text-secondary)',
        display: 'flex', alignItems: 'center',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
    >
      {children}
    </button>
  )
}

