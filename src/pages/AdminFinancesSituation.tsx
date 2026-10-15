import { useState, useEffect } from 'react'
import { FileText, Download } from 'lucide-react'
import type ExcelJS from 'exceljs'
import { supabase } from '../lib/supabase'
import Button from '../components/ui/Button'
import DataTableShell from '../components/DataTableShell'
import type { TeamCotisationRow, TeamExpenseRow } from '../utils/generateSituationPDF'

interface Season {
  id: string
  name: string
  active: boolean
  start_date: string
  end_date: string
}

interface SnapshotRecetteRow {
  type: string
  label: string
  nb_factures: number
  facture: number
  encaisse: number
  impaye: number
}

interface SnapshotData {
  season: { id: string; name: string; start_date: string; end_date: string; active: boolean }
  recettes: SnapshotRecetteRow[]
  recettes_total: { facture: number; encaisse: number; impaye: number }
  depenses: { payees: number; engagees: number; a_traiter: number }
  solde_tresorerie: number
}

interface ExpenseGroupRow {
  compte: string
  account_number: string | null
  payees: number
  engagees: number
  total: number
}

interface ExpenseSummary {
  rows: ExpenseGroupRow[]
  totalPayees: number
  totalEngagees: number
  totalAll: number
  nbSubmitted: number
  error: string | null
}

interface ReportData {
  saison: { id: string; nom: string; debut: string; fin: string }
  arrete_au: string
  cotisations: {
    nb_emises: number
    nb_brouillons: number
    nb_annulees: number
    nb_payees: number
    nb_ouvertes: number
    nb_en_retard: number
    brut: number
    rabais_fratrie: number
    frais_rappel: number
    ajustements: number
    net_facture: number
    encaisse: number
    debiteurs: number
    debiteurs_retard: number
  }
  taux_encaissement: number
  sponsoring?: {
    nb_emises: number
    nb_brouillons: number
    nb_annulees: number
    nb_payees: number
    nb_ouvertes: number
    nb_en_retard: number
    frais_rappel: number
    net_facture: number
    encaisse: number
    debiteurs: number
    debiteurs_retard: number
    compte: string | null
  }
  total?: {
    net_facture: number
    encaisse: number
    debiteurs: number
  }
  taux_encaissement_global?: number
  par_categorie?: {
    compte: string | null
    categorie: string
    nb_emises: number
    net_facture: number
    encaisse: number
    debiteurs: number
  }[]
}

function formatCHF(amount: number): string {
  return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'")
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function AdminFinancesSituation() {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('')
  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clubName, setClubName] = useState('')
  const [expenseSummary, setExpenseSummary] = useState<ExpenseSummary | null>(null)
  const [totalEncaissements, setTotalEncaissements] = useState<number | null>(null)
  const [encError, setEncError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null)
  const [snapError, setSnapError] = useState<string | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)

  useEffect(() => { document.title = 'Situation financière - ClubSphere' }, [])

  useEffect(() => {
    loadSeasons()
    loadClubName()
  }, [])

  useEffect(() => {
    if (selectedSeasonId) {
      loadReport(selectedSeasonId)
      loadSnapshot(selectedSeasonId)
      const season = seasons.find(s => s.id === selectedSeasonId)
      if (season) {
        loadExpenses(season.start_date, season.end_date)
        loadTotalEncaissements(selectedSeasonId)
      }
    }
  }, [selectedSeasonId, seasons])

  const loadClubName = async () => {
    const { data } = await supabase.from('club_settings').select('club_name').maybeSingle()
    if (data?.club_name) setClubName(data.club_name)
  }

  const loadSeasons = async () => {
    const { data } = await supabase
      .from('seasons')
      .select('id, name, active, start_date, end_date')
      .order('start_date', { ascending: false })
    if (data && data.length > 0) {
      setSeasons(data)
      const active = data.find(s => s.active)
      setSelectedSeasonId(active?.id || data[0].id)
    } else {
      setLoading(false)
    }
  }

  const loadSnapshot = async (seasonId: string) => {
    setSnapError(null)
    const { data, error: err } = await supabase.rpc('get_club_finance_snapshot', { p_season_id: seasonId })
    if (err) {
      setSnapError(err.message)
      setSnapshot(null)
    } else {
      setSnapshot(data as SnapshotData)
    }
  }

  const loadReport = async (seasonId: string) => {
    setLoading(true)
    setError(null)
    const { data, error: rpcErr } = await supabase.rpc('get_season_financial_report', { p_season_id: seasonId })
    if (rpcErr) {
      setError(rpcErr.message)
      setReport(null)
    } else {
      setReport(data as ReportData)
    }
    setLoading(false)
  }

  const loadExpenses = async (startDate: string, endDate: string) => {
    const [groupsRes, expensesRes] = await Promise.all([
      supabase.from('expense_groups').select('id, name, account_number, active').order('account_number', { ascending: true, nullsFirst: false }),
      supabase.from('expenses').select('amount, status, group_id').gte('expense_date', startDate).lte('expense_date', endDate),
    ])
    if (groupsRes.error) {
      setExpenseSummary({ rows: [], totalPayees: 0, totalEngagees: 0, totalAll: 0, nbSubmitted: 0, error: groupsRes.error.message })
      return
    }
    if (expensesRes.error) {
      setExpenseSummary({ rows: [], totalPayees: 0, totalEngagees: 0, totalAll: 0, nbSubmitted: 0, error: expensesRes.error.message })
      return
    }
    const allGroups = groupsRes.data || []
    const expenses = expensesRes.data || []

    const grouped = new Map<string, { compte: string; account_number: string | null; active: boolean; payees: number; engagees: number }>()
    for (const g of allGroups) {
      grouped.set(g.id, { compte: g.name, account_number: g.account_number, active: g.active !== false, payees: 0, engagees: 0 })
    }
    grouped.set('__none__', { compte: 'Sans compte', account_number: null, active: false, payees: 0, engagees: 0 })

    let nbSubmitted = 0
    for (const e of expenses) {
      const key = e.group_id || '__none__'
      if (!grouped.has(key)) grouped.set(key, { compte: key, account_number: null, active: false, payees: 0, engagees: 0 })
      const row = grouped.get(key)!
      if (e.status === 'reimbursed' || e.status === 'recorded') row.payees += e.amount
      else if (e.status === 'approved') row.engagees += e.amount
      else if (e.status === 'submitted') nbSubmitted++
    }

    const rows: ExpenseGroupRow[] = Array.from(grouped.entries())
      .filter(([key, r]) => {
        if (key === '__none__') return r.payees + r.engagees > 0
        if (r.active) return true
        return r.payees + r.engagees > 0
      })
      .map(([, r]) => ({ compte: r.compte, account_number: r.account_number, payees: r.payees, engagees: r.engagees, total: r.payees + r.engagees }))
      .sort((a, b) => (a.account_number || 'zzz').localeCompare(b.account_number || 'zzz'))
    const totalPayees = rows.reduce((s, r) => s + r.payees, 0)
    const totalEngagees = rows.reduce((s, r) => s + r.engagees, 0)
    setExpenseSummary({ rows, totalPayees, totalEngagees, totalAll: totalPayees + totalEngagees, nbSubmitted, error: null })
  }

  const loadTotalEncaissements = async (seasonId: string) => {
    setEncError(null)
    const { data, error: err } = await supabase
      .from('invoices')
      .select('id, payments(amount)')
      .eq('season_id', seasonId)
      .not('status', 'in', '("draft","cancelled")')
    if (err) {
      setEncError(err.message)
      setTotalEncaissements(null)
      return
    }
    let total = 0
    for (const inv of (data || [])) {
      const payments = inv.payments as { amount: number }[] | null
      if (payments) for (const p of payments) total += p.amount
    }
    setTotalEncaissements(total)
  }

  const exportExcel = async () => {
    if (!report) return
    try {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Situation financière')

    ws.columns = [
      { width: 18, key: 'A' },
      { width: 31, key: 'B' },
      { width: 11, key: 'C' },
      { width: 17, key: 'D' },
      { width: 17, key: 'E' },
      { width: 17, key: 'F' },
    ]

    const chfFmt = '#,##0.00;[Red]\\(#,##0.00\\);\\-'
    const pctFmt = '0.0%'
    const greyFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } }
    const hdrFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } }

    const sectionTitle = (text: string) => {
      const row = ws.addRow([text])
      const r = row.number
      ws.mergeCells(`A${r}:F${r}`)
      row.font = { bold: true, size: 11 }
      row.getCell(1).fill = greyFill
      return r
    }

    const hdrRow = (cells: string[]) => {
      const row = ws.addRow(cells)
      row.font = { bold: true }
      row.eachCell(c => { c.fill = hdrFill })
      return row.number
    }

    const chfCell = (row: number, col: number, value: number | object) => {
      const c = ws.getRow(row).getCell(col)
      c.value = value as ExcelJS.CellValue
      c.numFmt = chfFmt
    }

    /* ── Header ── */
    const r1 = ws.addRow([clubName])
    ws.mergeCells(`A${r1.number}:F${r1.number}`)
    r1.font = { bold: true, size: 12 }

    const r2 = ws.addRow([`Situation financière — Saison ${report.saison.nom}`])
    r2.font = { bold: true, size: 11 }

    ws.addRow([`Arrêtée au ${formatDate(report.arrete_au)}`])
    ws.addRow([])

    /* ── PRODUITS — Cotisations ── */
    sectionTitle('PRODUITS — Cotisations')
    const brutR = ws.addRow(['Cotisations brutes']).number
    chfCell(brutR, 4, report.cotisations.brut)
    const rabR = ws.addRow(['./. Rabais fratrie']).number
    chfCell(rabR, 4, -report.cotisations.rabais_fratrie)
    const fraisR = ws.addRow(['+ Frais de rappel']).number
    chfCell(fraisR, 4, report.cotisations.frais_rappel)
    const netR = ws.addRow(['= Net facturé']).number
    ws.getRow(netR).font = { bold: true }
    chfCell(netR, 4, { formula: `SUM(D${brutR}:D${fraisR})`, result: report.cotisations.net_facture })
    ws.addRow([])

    /* ── ENCAISSEMENTS ── */
    sectionTitle('ENCAISSEMENTS')
    const encR = ws.addRow(['Montant encaissé']).number
    chfCell(encR, 4, report.cotisations.encaisse)
    const tauxR = ws.addRow(['Taux d\'encaissement']).number
    const tauxCell = ws.getRow(tauxR).getCell(4)
    tauxCell.value = { formula: `IFERROR(D${encR}/D${netR},0)`, result: report.taux_encaissement } as ExcelJS.CellValue
    tauxCell.numFmt = pctFmt
    ws.addRow([])

    /* ── DÉBITEURS ── */
    sectionTitle('DÉBITEURS')
    const debR = ws.addRow(['Débiteurs ouverts']).number
    chfCell(debR, 4, { formula: `D${netR}-D${encR}`, result: report.cotisations.debiteurs })
    const retR = ws.addRow([`dont en retard (${report.cotisations.nb_en_retard})`]).number
    chfCell(retR, 4, report.cotisations.debiteurs_retard)
    ws.addRow([])

    /* ── RÉPARTITION PAR CATÉGORIE ── */
    const cats = report.par_categorie || []
    if (cats.length > 0) {
      sectionTitle('RÉPARTITION PAR CATÉGORIE')
      hdrRow(['Compte', 'Catégorie', 'Factures', 'Facturé (CHF)', 'Encaissé (CHF)', 'Débiteurs (CHF)'])
      const catFirstR = ws.lastRow!.number + 1
      for (const cat of cats) {
        const r = ws.addRow([]).number
        ws.getRow(r).getCell(1).value = cat.compte ? `'${cat.compte}` : '—'
        ws.getRow(r).getCell(2).value = cat.categorie
        ws.getRow(r).getCell(3).value = cat.nb_emises
        chfCell(r, 4, cat.net_facture)
        chfCell(r, 5, cat.encaisse)
        chfCell(r, 6, cat.debiteurs)
      }
      const catLastR = ws.lastRow!.number
      const catTotR = ws.addRow([]).number
      ws.getRow(catTotR).font = { bold: true }
      ws.getRow(catTotR).getCell(2).value = 'TOTAL'
      ws.getRow(catTotR).getCell(3).value = { formula: `SUM(C${catFirstR}:C${catLastR})`, result: cats.reduce((s, c) => s + c.nb_emises, 0) } as ExcelJS.CellValue
      chfCell(catTotR, 4, { formula: `SUM(D${catFirstR}:D${catLastR})`, result: cats.reduce((s, c) => s + c.net_facture, 0) })
      chfCell(catTotR, 5, { formula: `SUM(E${catFirstR}:E${catLastR})`, result: cats.reduce((s, c) => s + c.encaisse, 0) })
      chfCell(catTotR, 6, { formula: `SUM(F${catFirstR}:F${catLastR})`, result: cats.reduce((s, c) => s + c.debiteurs, 0) })
    }
    ws.addRow([])

    /* ── RECETTES PAR TYPE ── */
    let recEncTotRef = ''
    let recFactTotRef = ''
    if (snapshot) {
      sectionTitle('RECETTES PAR TYPE')
      hdrRow(['', 'Type', 'Factures', 'Facturé (CHF)', 'Encaissé (CHF)', 'Débiteurs (CHF)'])
      const recFirstR = ws.lastRow!.number + 1
      for (const rec of snapshot.recettes) {
        const r = ws.addRow([]).number
        ws.getRow(r).getCell(2).value = rec.label
        ws.getRow(r).getCell(3).value = rec.nb_factures
        chfCell(r, 4, rec.facture)
        chfCell(r, 5, rec.encaisse)
        chfCell(r, 6, rec.impaye)
      }
      const recLastR = ws.lastRow!.number
      const recTotR = ws.addRow([]).number
      ws.getRow(recTotR).font = { bold: true }
      ws.getRow(recTotR).getCell(2).value = 'TOTAL'
      ws.getRow(recTotR).getCell(3).value = { formula: `SUM(C${recFirstR}:C${recLastR})`, result: snapshot.recettes.reduce((s, r) => s + r.nb_factures, 0) } as ExcelJS.CellValue
      chfCell(recTotR, 4, { formula: `SUM(D${recFirstR}:D${recLastR})`, result: snapshot.recettes_total.facture })
      chfCell(recTotR, 5, { formula: `SUM(E${recFirstR}:E${recLastR})`, result: snapshot.recettes_total.encaisse })
      chfCell(recTotR, 6, { formula: `SUM(F${recFirstR}:F${recLastR})`, result: snapshot.recettes_total.impaye })
      recEncTotRef = `E${recTotR}`
      recFactTotRef = `D${recTotR}`
      ws.addRow([])
    }

    /* ── DÉPENSES ── */
    let depPayeesTotRef = ''
    let depEngTotRef = ''
    let depTotalTotRef = ''
    const expRows = expenseSummary?.rows || []
    if (expRows.length > 0) {
      sectionTitle('DÉPENSES')
      hdrRow(['N° de compte', 'Compte', '', 'Payées (CHF)', 'Engagées (CHF)', 'Total (CHF)'])
      const expFirstR = ws.lastRow!.number + 1
      for (const er of expRows) {
        const r = ws.addRow([]).number
        ws.getRow(r).getCell(1).value = er.account_number ? `'${er.account_number}` : '—'
        ws.getRow(r).getCell(2).value = er.compte
        chfCell(r, 4, er.payees)
        chfCell(r, 5, er.engagees)
        chfCell(r, 6, { formula: `D${r}+E${r}`, result: er.total })
      }
      const expLastR = ws.lastRow!.number
      const expTotR = ws.addRow([]).number
      ws.getRow(expTotR).font = { bold: true }
      ws.getRow(expTotR).getCell(2).value = 'TOTAL'
      chfCell(expTotR, 4, { formula: `SUM(D${expFirstR}:D${expLastR})`, result: expenseSummary!.totalPayees })
      chfCell(expTotR, 5, { formula: `SUM(E${expFirstR}:E${expLastR})`, result: expenseSummary!.totalEngagees })
      chfCell(expTotR, 6, { formula: `SUM(F${expFirstR}:F${expLastR})`, result: expenseSummary!.totalAll })
      depPayeesTotRef = `D${expTotR}`
      depEngTotRef = `E${expTotR}`
      depTotalTotRef = `F${expTotR}`
      if (expenseSummary!.nbSubmitted > 0) {
        const noteR = ws.addRow([`${expenseSummary!.nbSubmitted} note(s) de frais à traiter (non comptées)`]).number
        ws.mergeCells(`A${noteR}:F${noteR}`)
        ws.getRow(noteR).font = { italic: true, size: 9, color: { argb: 'FF888888' } }
      }
      ws.addRow([])
    }

    /* ── SOLDE DE TRÉSORERIE ── */
    if (snapshot && recEncTotRef) {
      sectionTitle('SOLDE DE TRÉSORERIE')
      const seR = ws.addRow(['Encaissements totaux (toutes recettes)']).number
      chfCell(seR, 4, depPayeesTotRef
        ? { formula: recEncTotRef, result: snapshot.recettes_total.encaisse }
        : snapshot.recettes_total.encaisse)
      const sdR = ws.addRow(['− Dépenses payées']).number
      chfCell(sdR, 4, depPayeesTotRef
        ? { formula: depPayeesTotRef, result: snapshot.depenses.payees }
        : snapshot.depenses.payees)
      const solR = ws.addRow(['= Solde de trésorerie']).number
      ws.getRow(solR).font = { bold: true }
      chfCell(solR, 4, { formula: `D${seR}-D${sdR}`, result: snapshot.solde_tresorerie })
      const engR = ws.addRow(['Dépenses engagées (approuvées, à venir)']).number
      chfCell(engR, 4, depEngTotRef
        ? { formula: depEngTotRef, result: snapshot.depenses.engagees }
        : snapshot.depenses.engagees)
      ws.addRow([])
    }

    /* ── SOLDE VIRTUEL / PRÉVISIONNEL ── */
    if (snapshot && recFactTotRef && depTotalTotRef) {
      sectionTitle('SOLDE VIRTUEL / PRÉVISIONNEL')
      const svR = ws.addRow(['= Solde virtuel']).number
      ws.getRow(svR).font = { bold: true }
      const svResult = snapshot.recettes_total.facture - (expenseSummary?.totalAll || 0)
      chfCell(svR, 4, { formula: `${recFactTotRef}-${depTotalTotRef}`, result: svResult })
      const hypR = ws.addRow(['Hypothèse : toutes les factures sont encaissées et toutes les dépenses payées/engagées sont déduites.']).number
      ws.mergeCells(`A${hypR}:F${hypR}`)
      ws.getRow(hypR).font = { italic: true, size: 9, color: { argb: 'FF888888' } }
    }

    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const slug = clubName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
    const saison = report.saison.nom.replace(/[^a-z0-9]/gi, '-')
    const yyyymmdd = report.arrete_au.slice(0, 10).replace(/-/g, '')
    a.download = `situation-financiere-${slug}-${saison}-${yyyymmdd}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    } catch (e) { console.error('Export failed', e); }
  }

  const exportPDF = async () => {
    if (!report) return
    setPdfBusy(true)
    try {
      const { data: settings } = await supabase
        .from('club_settings')
        .select('club_name, club_address, club_city, logo_url, primary_color, confrerie_label')
        .maybeSingle()

      const season = seasons.find(s => s.id === selectedSeasonId)
      let teamCotisations: TeamCotisationRow[] = []
      let teamExpenses: TeamExpenseRow[] = []

      if (season) {
        // Fetch invoices with team name for bar chart
        const { data: invData } = await supabase
          .from('invoices')
          .select('total_amount, status, team_id, teams(name), payments(amount)')
          .eq('season_id', selectedSeasonId)
          .eq('invoice_type', 'cotisation')
          .in('status', ['sent', 'partial', 'paid'])
          .not('team_id', 'is', null)
        if (invData) {
          const teamMap = new Map<string, { name: string; facture: number; encaisse: number }>()
          for (const inv of invData) {
            const tid = inv.team_id as string
            const teams = inv.teams as unknown as { name: string }[] | { name: string } | null
            const tname = (Array.isArray(teams) ? teams[0]?.name : teams?.name) || tid
            if (!teamMap.has(tid)) teamMap.set(tid, { name: tname, facture: 0, encaisse: 0 })
            const entry = teamMap.get(tid)!
            entry.facture += (inv as any).total_amount ?? 0
            const payments = inv.payments as { amount: number }[] | null
            if (payments) for (const p of payments) entry.encaisse += p.amount
          }
          teamCotisations = Array.from(teamMap.values()).map(v => ({
            team_name: v.name, facture: v.facture, encaisse: v.encaisse,
          }))
        }

        // Fetch expenses with team name for donut
        const { data: expData } = await supabase
          .from('expenses')
          .select('amount, status, team_id, event_id, teams(name)')
          .gte('expense_date', season.start_date)
          .lte('expense_date', season.end_date)
          .in('status', ['reimbursed', 'recorded', 'approved'])
        if (expData) {
          const teamMap = new Map<string, { name: string; amount: number }>()
          for (const e of expData) {
            let key: string
            let name: string
            if (e.event_id) {
              key = '__events__'
              name = 'Événements'
            } else if (e.team_id) {
              key = e.team_id as string
              const teams = e.teams as unknown as { name: string }[] | { name: string } | null
              name = (Array.isArray(teams) ? teams[0]?.name : teams?.name) || key
            } else {
              key = '__club__'
              name = 'Club (sans équipe)'
            }
            if (!teamMap.has(key)) teamMap.set(key, { name, amount: 0 })
            teamMap.get(key)!.amount += e.amount
          }
          teamExpenses = Array.from(teamMap.values()).map(v => ({
            team_name: v.name, amount: v.amount,
          }))
        }
      }

      const { generateSituationPDF } = await import('../utils/generateSituationPDF')
      await generateSituationPDF({
        club: {
          club_name: settings?.club_name || clubName || 'Club',
          club_address: settings?.club_address || '',
          club_city: settings?.club_city || '',
          logo_url: settings?.logo_url || null,
          primary_color: settings?.primary_color || '#CC0000',
          confrerie_label: settings?.confrerie_label || 'Club des 500',
        },
        report,
        snapshot,
        expenses: expenseSummary,
        teamCotisations,
        teamExpenses,
      })
    } catch (err: any) {
      console.error('PDF generation failed', err)
      alert(`Export PDF impossible : ${err?.message || 'erreur inconnue'}`)
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <div className="situation-financiere-page" style={{ padding: '24px 16px' }}>
      {/* Toolbar */}
      <div className="print-hide" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Situation financière
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <select
            value={selectedSeasonId}
            onChange={e => setSelectedSeasonId(e.target.value)}
            className="cs-input"
            style={{ minWidth: 180 }}
          >
            {seasons.map(s => (
              <option key={s.id} value={s.id}>{s.name}{s.active ? ' (active)' : ''}</option>
            ))}
          </select>
          <Button variant="secondary" size="sm" leftIcon={<Download size={15} />} onClick={exportExcel}>
            Exporter Excel
          </Button>
          <Button variant="secondary" size="sm" leftIcon={<FileText size={15} />} onClick={exportPDF} disabled={pdfBusy || !report}>
            {pdfBusy ? 'Génération…' : 'Exporter PDF'}
          </Button>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          Chargement…
        </div>
      )}

      {error && (
        <div style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 8, padding: 16, color: 'var(--danger-text)', fontSize: 14 }}>
          {error}
        </div>
      )}

      {!loading && !error && report && (
        <div className="situation-financiere-content">
          {/* Print header */}
          <div className="print-only" style={{ display: 'none', marginBottom: 24 }}>
            <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 600 }}>{clubName}</p>
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>
              Situation financière — Saison {report.saison.nom}
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
              Arrêtée au {formatDate(report.arrete_au)}
            </p>
          </div>

          {/* Document header (screen) */}
          <div className="print-hide" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '16px 20px', marginBottom: 24 }}>
            {clubName && <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginRight: 12 }}>{clubName}</span>}
            <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              Situation financière — Saison {report.saison.nom}
            </span>
            <span style={{ fontSize: 14, color: 'var(--text-muted)', marginLeft: 16 }}>
              Arrêtée au {formatDate(report.arrete_au)}
            </span>
          </div>

          {/* Three cards grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
            {/* PRODUITS */}
            <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '20px 24px' }}>
              <h2 className="situation-section-title">PRODUITS</h2>
              <table className="situation-table">
                <tbody>
                  <Row label="Cotisations brutes" amount={report.cotisations.brut} />
                  <Row label="./. Rabais fratrie" amount={-report.cotisations.rabais_fratrie} negative />
                  <Row label="+ Frais de rappel" amount={report.cotisations.frais_rappel} />
                  {report.cotisations.ajustements !== 0 && (
                    <Row
                      label={`± Ajustements (prorata, corrections)`}
                      amount={report.cotisations.ajustements}
                      negative={report.cotisations.ajustements < 0}
                    />
                  )}
                  <Row label="= Net facturé" amount={report.cotisations.net_facture} bold />
                </tbody>
              </table>
            </section>

            {/* ENCAISSEMENTS */}
            <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '20px 24px' }}>
              <h2 className="situation-section-title">ENCAISSEMENTS</h2>
              <table className="situation-table">
                <tbody>
                  <Row label="Montant encaissé" amount={report.cotisations.encaisse} />
                  <tr>
                    <td style={{ padding: '6px 0', color: 'var(--text-secondary)', fontSize: 14 }}>Taux d'encaissement</td>
                    <td style={{ padding: '6px 0', textAlign: 'right', fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                      {(report.taux_encaissement * 100).toFixed(1)} %
                    </td>
                  </tr>
                </tbody>
              </table>
              <div style={{ borderTop: '1px solid var(--border-color)', marginTop: 12, paddingTop: 12 }}>
                <table className="situation-table">
                  <tbody>
                    <tr>
                      <td style={{ padding: '6px 0', color: 'var(--text-muted)', fontSize: 13 }}>Factures payées</td>
                      <td style={{ padding: '6px 0', textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{report.cotisations.nb_payees}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '6px 0', color: 'var(--text-muted)', fontSize: 13 }}>Factures ouvertes</td>
                      <td style={{ padding: '6px 0', textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{report.cotisations.nb_ouvertes}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* DÉBITEURS */}
            <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '20px 24px' }}>
              <h2 className="situation-section-title">DÉBITEURS</h2>
              <table className="situation-table">
                <tbody>
                  <Row label="Débiteurs ouverts" amount={report.cotisations.debiteurs} />
                  <Row label={`dont en retard (${report.cotisations.nb_en_retard})`} amount={report.cotisations.debiteurs_retard} />
                </tbody>
              </table>
              <div style={{ borderTop: '1px solid var(--border-color)', marginTop: 12, paddingTop: 12 }}>
                <table className="situation-table">
                  <tbody>
                    <tr>
                      <td style={{ padding: '6px 0', color: 'var(--text-muted)', fontSize: 13 }}>Brouillons</td>
                      <td style={{ padding: '6px 0', textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{report.cotisations.nb_brouillons}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '6px 0', color: 'var(--text-muted)', fontSize: 13 }}>Annulées</td>
                      <td style={{ padding: '6px 0', textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{report.cotisations.nb_annulees}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* RÉPARTITION PAR CATÉGORIE */}
          {report.par_categorie && report.par_categorie.length > 0 && (
            <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
              <h2 className="situation-section-title">RÉPARTITION PAR CATÉGORIE</h2>
              <DataTableShell bare maxHeight="400px">
              <div style={{ overflowX: 'auto' }}>
                <table className="situation-table situation-cat-table">
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                      <th style={{ padding: '8px 10px 8px 0', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Compte</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Catégorie</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Factures</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Facturé</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Encaissé</th>
                      <th style={{ padding: '8px 0 8px 10px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Débiteurs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.par_categorie.map((cat, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '8px 10px 8px 0', fontSize: 13, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                          {cat.compte || '—'}
                        </td>
                        <td style={{ padding: '8px 10px', fontSize: 13, color: 'var(--text-primary)' }}>{cat.categorie}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{cat.nb_emises}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>CHF {formatCHF(cat.net_facture)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>CHF {formatCHF(cat.encaisse)}</td>
                        <td style={{ padding: '8px 0 8px 10px', textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>CHF {formatCHF(cat.debiteurs)}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: '2px solid var(--border-color)' }}>
                      <td style={{ padding: '10px 10px 8px 0' }}></td>
                      <td style={{ padding: '10px 10px 8px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>TOTAL</td>
                      <td style={{ padding: '10px 10px 8px', textAlign: 'right', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                        {report.par_categorie.reduce((s, c) => s + c.nb_emises, 0)}
                      </td>
                      <td style={{ padding: '10px 10px 8px', textAlign: 'right', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                        CHF {formatCHF(report.par_categorie.reduce((s, c) => s + c.net_facture, 0))}
                      </td>
                      <td style={{ padding: '10px 10px 8px', textAlign: 'right', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                        CHF {formatCHF(report.par_categorie.reduce((s, c) => s + c.encaisse, 0))}
                      </td>
                      <td style={{ padding: '10px 0 8px 10px', textAlign: 'right', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                        CHF {formatCHF(report.par_categorie.reduce((s, c) => s + c.debiteurs, 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              </DataTableShell>
            </section>
          )}

          {/* RECETTES PAR TYPE */}
          {snapshot && (
            <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
              <h2 className="situation-section-title">RECETTES PAR TYPE</h2>
              <DataTableShell bare maxHeight="400px">
              <div style={{ overflowX: 'auto' }}>
                <table className="situation-table situation-cat-table">
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                      <th style={{ padding: '8px 10px 8px 0', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Type</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Factures</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Facturé</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Encaissé</th>
                      <th style={{ padding: '8px 0 8px 10px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Débiteurs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.recettes.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '8px 10px 8px 0', fontSize: 13, color: 'var(--text-primary)' }}>{r.label}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{r.nb_factures}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>CHF {formatCHF(r.facture)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>CHF {formatCHF(r.encaisse)}</td>
                        <td style={{ padding: '8px 0 8px 10px', textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>CHF {formatCHF(r.impaye)}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: '2px solid var(--border-color)' }}>
                      <td style={{ padding: '10px 10px 8px 0', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>TOTAL</td>
                      <td style={{ padding: '10px 10px 8px', textAlign: 'right', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                        {snapshot.recettes.reduce((s, r) => s + r.nb_factures, 0)}
                      </td>
                      <td style={{ padding: '10px 10px 8px', textAlign: 'right', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                        CHF {formatCHF(snapshot.recettes_total.facture)}
                      </td>
                      <td style={{ padding: '10px 10px 8px', textAlign: 'right', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                        CHF {formatCHF(snapshot.recettes_total.encaisse)}
                      </td>
                      <td style={{ padding: '10px 0 8px 10px', textAlign: 'right', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                        CHF {formatCHF(snapshot.recettes_total.impaye)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              </DataTableShell>
            </section>
          )}

          {/* SPONSORING */}
          {report.sponsoring && report.sponsoring.nb_emises > 0 && (
            <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
              <h2 className="situation-section-title">SPONSORING</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <table className="situation-table">
                  <tbody>
                    <Row label="Net facturé" amount={report.sponsoring.net_facture} bold />
                    <Row label="Encaissé" amount={report.sponsoring.encaisse} />
                    <Row label="Débiteurs" amount={report.sponsoring.debiteurs} />
                    {report.sponsoring.frais_rappel > 0 && (
                      <Row label="Frais de rappel" amount={report.sponsoring.frais_rappel} />
                    )}
                  </tbody>
                </table>
                <div>
                  <table className="situation-table">
                    <tbody>
                      <tr>
                        <td style={{ padding: '6px 0', color: 'var(--text-muted)', fontSize: 13 }}>Factures émises</td>
                        <td style={{ padding: '6px 0', textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{report.sponsoring.nb_emises}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '6px 0', color: 'var(--text-muted)', fontSize: 13 }}>Payées</td>
                        <td style={{ padding: '6px 0', textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{report.sponsoring.nb_payees}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '6px 0', color: 'var(--text-muted)', fontSize: 13 }}>Ouvertes</td>
                        <td style={{ padding: '6px 0', textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{report.sponsoring.nb_ouvertes}</td>
                      </tr>
                      {report.sponsoring.nb_en_retard > 0 && (
                        <tr>
                          <td style={{ padding: '6px 0', color: 'var(--text-muted)', fontSize: 13 }}>En retard</td>
                          <td style={{ padding: '6px 0', textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{report.sponsoring.nb_en_retard}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {report.sponsoring.compte && (
                    <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>Compte : {report.sponsoring.compte}</p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* DÉPENSES */}
          {expenseSummary && expenseSummary.error && (
            <div style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 8, padding: 16, color: 'var(--danger-text)', fontSize: 14, marginBottom: 16 }}>
              Erreur chargement dépenses : {expenseSummary.error}
            </div>
          )}
          {expenseSummary && !expenseSummary.error && expenseSummary.rows.length > 0 && (
            <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
              <h2 className="situation-section-title">DÉPENSES</h2>
              <DataTableShell bare maxHeight="400px">
              <div style={{ overflowX: 'auto' }}>
                <table className="situation-table situation-cat-table">
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                      <th style={{ padding: '8px 10px 8px 0', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>N° de compte</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Compte</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Payées</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Engagées</th>
                      <th style={{ padding: '8px 0 8px 10px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenseSummary.rows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '8px 10px 8px 0', fontSize: 13, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{r.account_number || '—'}</td>
                        <td style={{ padding: '8px 10px', fontSize: 13, color: 'var(--text-primary)' }}>{r.compte}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>CHF {formatCHF(r.payees)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>CHF {formatCHF(r.engagees)}</td>
                        <td style={{ padding: '8px 0 8px 10px', textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>CHF {formatCHF(r.total)}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: '2px solid var(--border-color)' }}>
                      <td style={{ padding: '10px 10px 8px 0' }}></td>
                      <td style={{ padding: '10px 10px 8px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>TOTAL</td>
                      <td style={{ padding: '10px 10px 8px', textAlign: 'right', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>CHF {formatCHF(expenseSummary.totalPayees)}</td>
                      <td style={{ padding: '10px 10px 8px', textAlign: 'right', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>CHF {formatCHF(expenseSummary.totalEngagees)}</td>
                      <td style={{ padding: '10px 0 8px 10px', textAlign: 'right', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>CHF {formatCHF(expenseSummary.totalAll)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              </DataTableShell>
              {expenseSummary.nbSubmitted > 0 && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
                  {expenseSummary.nbSubmitted} note(s) de frais à traiter (non comptées)
                </p>
              )}
            </section>
          )}

          {/* TOTAUX GLOBAUX */}
          {snapshot && (
            <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
              <h2 className="situation-section-title">TOTAUX GLOBAUX (TOUTES RECETTES)</h2>
              <table className="situation-table">
                <tbody>
                  <Row label="Net facturé (global)" amount={snapshot.recettes_total.facture} bold />
                  <Row label="Encaissé (global)" amount={snapshot.recettes_total.encaisse} />
                  <Row label="Débiteurs (global)" amount={snapshot.recettes_total.impaye} />
                  {snapshot.recettes_total.facture > 0 && (
                    <tr>
                      <td style={{ padding: '6px 0', color: 'var(--text-secondary)', fontSize: 14 }}>Taux d'encaissement global</td>
                      <td style={{ padding: '6px 0', textAlign: 'right', fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                        {((snapshot.recettes_total.encaisse / snapshot.recettes_total.facture) * 100).toFixed(1)} %
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          )}

          {/* SOLDE DE TRÉSORERIE */}
          {snapError && (
            <div style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 8, padding: 16, color: 'var(--danger-text)', fontSize: 14, marginBottom: 16 }}>
              Erreur chargement snapshot : {snapError}
            </div>
          )}
          {snapshot && (
            <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
              <h2 className="situation-section-title">SOLDE DE TRÉSORERIE</h2>
              <table className="situation-table">
                <tbody>
                  <Row label="Encaissements totaux (toutes recettes)" amount={snapshot.recettes_total.encaisse} />
                  <Row label="− Dépenses payées" amount={snapshot.depenses.payees} negative />
                  <Row label="= Solde" amount={snapshot.solde_tresorerie} bold negative={snapshot.solde_tresorerie < 0} />
                </tbody>
              </table>
              {snapshot.depenses.engagees > 0 && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 10 }}>
                  Dépenses engagées (approuvées, à venir) : CHF {formatCHF(snapshot.depenses.engagees)}
                </p>
              )}
            </section>
          )}

          {/* Footer note */}
          <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 20 }}>
            Document établi à titre indicatif, à transmettre au comptable ou à la fiduciaire du club.
            Brouillons et factures annulées non inclus.
          </p>
        </div>
      )}
    </div>
  )
}

function Row({ label, amount, bold, negative, muted }: { label: string; amount: number; bold?: boolean; negative?: boolean; muted?: boolean }) {
  return (
    <tr>
      <td style={{ padding: '6px 0', color: muted ? 'var(--text-muted)' : 'var(--text-secondary)', fontSize: 14, fontWeight: bold ? 700 : 400 }}>
        {label}
      </td>
      <td style={{
        padding: '6px 0',
        textAlign: 'right',
        fontSize: 14,
        fontWeight: bold ? 700 : 400,
        fontVariantNumeric: 'tabular-nums',
        color: negative ? 'var(--danger-text)' : muted ? 'var(--text-muted)' : 'var(--text-primary)',
      }}>
        {negative && amount !== 0 ? '– ' : ''}CHF {formatCHF(Math.abs(amount))}
      </td>
    </tr>
  )
}

function formatCHFPlain(amount: number): string {
  return `CHF ${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}`
}
