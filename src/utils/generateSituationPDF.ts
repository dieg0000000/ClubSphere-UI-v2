import { jsPDF } from 'jspdf'
import type { RowInput, Styles } from 'jspdf-autotable'
import * as autoTableNs from 'jspdf-autotable'

function resolveAutoTable(): ((doc: any, options: any) => any) | null {
  const m: any = autoTableNs
  const candidates = [m?.autoTable, m?.default?.default, m?.default?.autoTable, m?.default]
  for (const c of candidates) if (typeof c === 'function') return c
  return null
}

function callAutoTable(doc: jsPDF, opts: Record<string, unknown>): void {
  const fn = resolveAutoTable()
  if (fn) { fn(doc, opts); return }
  if (typeof (doc as any).autoTable === 'function') { (doc as any).autoTable(opts); return }
  throw new Error('jspdf-autotable introuvable dans ce build')
}

/* ── Public types (reused from AdminFinancesSituation) ── */

export interface SituationReportData {
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
  total?: { net_facture: number; encaisse: number; debiteurs: number }
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

export interface SnapshotData {
  season: { id: string; name: string; start_date: string; end_date: string; active: boolean }
  recettes: { type: string; label: string; nb_factures: number; facture: number; encaisse: number; impaye: number }[]
  recettes_total: { facture: number; encaisse: number; impaye: number }
  depenses: { payees: number; engagees: number; a_traiter: number }
  solde_tresorerie: number
}

export interface ExpenseGroupRow {
  compte: string
  account_number: string | null
  payees: number
  engagees: number
  total: number
}

export interface ExpenseSummary {
  rows: ExpenseGroupRow[]
  totalPayees: number
  totalEngagees: number
  totalAll: number
  nbSubmitted: number
}

export interface ClubInfo {
  club_name: string
  club_address: string
  club_city: string
  logo_url: string | null
  primary_color: string
  confrerie_label?: string
}

export interface TeamCotisationRow {
  team_name: string
  facture: number
  encaisse: number
}

export interface TeamExpenseRow {
  team_name: string
  amount: number
}

export interface SituationPDFInput {
  club: ClubInfo
  report: SituationReportData
  snapshot: SnapshotData | null
  expenses: ExpenseSummary | null
  teamCotisations: TeamCotisationRow[]
  teamExpenses: TeamExpenseRow[]
}

/* ── Helpers ── */

function chf(n: number): string {
  if (n === 0) return '-'
  const abs = Math.abs(n)
  const formatted = abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, '’')
  return n < 0 ? `-${formatted}` : formatted
}

function chfAlways(n: number): string {
  const abs = Math.abs(n)
  const formatted = abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, '’')
  return n < 0 ? `-${formatted}` : formatted
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getFullYear()}`
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)]
}

function shortTeamLabel(name: string): string {
  const dashIdx = name.indexOf(' - ')
  if (dashIdx < 0) return name
  const before = name.substring(0, dashIdx)
  const after = name.substring(dashIdx + 3)
  const romanMatch = before.match(/\s+(I{1,3}|IV|V)\s*(?:\(|$)/)
  if (romanMatch) return `${after} (${romanMatch[1]})`
  return after
}

function tintRgb(rgb: [number, number, number], factor: number): [number, number, number] {
  return [
    Math.round(rgb[0] + (255 - rgb[0]) * factor),
    Math.round(rgb[1] + (255 - rgb[1]) * factor),
    Math.round(rgb[2] + (255 - rgb[2]) * factor),
  ]
}

const PAGE_W = 210
const PAGE_H = 297
const M = 15 // margin
const CONTENT_W = PAGE_W - 2 * M

async function loadLogoAsDataUrl(url: string): Promise<{ dataUrl: string; format: 'JPEG' | 'PNG' } | null> {
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = reject
      img.src = url
    })
    const MAX = 800
    let cw = img.naturalWidth
    let ch = img.naturalHeight
    const longest = Math.max(cw, ch)
    if (longest > MAX) {
      const s = MAX / longest
      cw = Math.round(cw * s)
      ch = Math.round(ch * s)
    }
    const canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, cw, ch)
    const pixels = ctx.getImageData(0, 0, cw, ch).data
    let hasAlpha = false
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] < 250) { hasAlpha = true; break }
    }
    if (!hasAlpha) {
      ctx.globalCompositeOperation = 'destination-over'
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, cw, ch)
      return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), format: 'JPEG' }
    }
    return { dataUrl: canvas.toDataURL('image/png'), format: 'PNG' }
  } catch {
    return null
  }
}

/* ── Main export ── */

export async function generateSituationPDF(input: SituationPDFInput): Promise<void> {
  const { club, report, snapshot, expenses, teamCotisations, teamExpenses } = input
  const pc = hexToRgb(club.primary_color || '#CC0000')
  const pcTint = tintRgb(pc, 0.85)

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const grey50: [number, number, number] = [240, 240, 240]
  const grey600: [number, number, number] = [100, 100, 100]
  const black: [number, number, number] = [30, 30, 30]

  let logoData: { dataUrl: string; format: 'JPEG' | 'PNG' } | null = null
  if (club.logo_url) {
    logoData = await loadLogoAsDataUrl(club.logo_url)
  }

  const seasonName = report.saison.nom
  const dateStr = fmtDate(report.arrete_au)
  const footerLeft = `${club.club_name} · Situation financière ${seasonName} · arrêtée au ${dateStr}`

  /* ── Footer on every page ── */
  const addFooter = () => {
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...grey600)
      doc.text(footerLeft, M, PAGE_H - 8)
      doc.text(`Page ${i}`, PAGE_W - M, PAGE_H - 8, { align: 'right' })
      doc.setFontSize(6.5)
      doc.text(
        'Document établi à titre indicatif, à transmettre au comptable ou à la fiduciaire du club. Brouillons et factures annulées non inclus. Généré par ClubSphere.',
        PAGE_W / 2, PAGE_H - 4, { align: 'center', maxWidth: CONTENT_W }
      )
    }
  }

  /* ── Section title helper ── */
  const sectionTitle = (y: number, num: string, title: string): number => {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...pc)
    doc.text(`${num}. ${title}`, M, y)
    return y + 6
  }

  /* ── Footnote helper ── */
  const footnote = (y: number, text: string): number => {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(...grey600)
    const lines = doc.splitTextToSize(text, CONTENT_W)
    doc.text(lines, M, y)
    return y + lines.length * 3 + 2
  }

  /* ── Ensure space for a table ── */
  const ensureSpace = (y: number, needed: number): number => {
    if (y + needed > PAGE_H - 20) {
      doc.addPage()
      return M + 5
    }
    return y
  }

  /* ── autoTable style helpers ── */
  const baseStyles: Partial<Styles> = {
    font: 'helvetica',
    fontSize: 8.5,
    cellPadding: { top: 2.2, bottom: 2.2, left: 2, right: 2 },
    textColor: black,
    lineWidth: 0.15,
    lineColor: [210, 210, 210],
  }

  const headerStyles: Partial<Styles> = {
    fillColor: grey50,
    textColor: [60, 60, 60],
    fontStyle: 'bold',
    fontSize: 8,
  }

  /* ── Reusable header drawing ── */
  const logoBoxH = 22

  const drawHeader = (full: boolean): number => {
    let hy = M
    const headerTextX = logoData ? M + logoBoxH + 6 : M

    if (logoData) {
      try {
        doc.addImage(logoData.dataUrl, logoData.format, M, hy, logoBoxH, logoBoxH, 'club-logo', logoData.format === 'PNG' ? 'FAST' : undefined)
      } catch { /* skip logo on error */ }
    }

    doc.setFontSize(full ? 13 : 10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...black)
    doc.text(club.club_name, headerTextX, hy + 5)

    if (full) {
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...grey600)
      if (club.club_address) doc.text(club.club_address, headerTextX, hy + 10)
      if (club.club_city) doc.text(club.club_city, headerTextX, hy + 14)
    }

    doc.setFontSize(full ? 14 : 10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...pc)
    doc.text('SITUATION FINANCIÈRE', PAGE_W - M, hy + 5, { align: 'right' })
    doc.setFontSize(full ? 9 : 8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...grey600)
    doc.text(`Saison ${seasonName} · arrêtée au ${dateStr}`, PAGE_W - M, hy + (full ? 11 : 9), { align: 'right' })

    hy += full ? Math.max(logoBoxH, 16) + 3 : (logoData ? logoBoxH + 3 : 14)

    doc.setDrawColor(...pc)
    doc.setLineWidth(0.45)
    doc.line(M, hy, PAGE_W - M, hy)
    hy += 6
    return hy
  }

  /* ══════════════════════════════════════════════════════
     PAGE 1 — Header
     ══════════════════════════════════════════════════════ */
  let y = drawHeader(true)

  /* ══════════════════════════════════════════════════════
     1. PRODUITS
     ══════════════════════════════════════════════════════ */
  y = sectionTitle(y, '1', 'PRODUITS')

  // Build PRODUITS body
  const cats = report.par_categorie || []
  const cotBoldStyle: Partial<Styles> = { fontStyle: 'bold' }
  const cotDetailStyle: Partial<Styles> = { fontStyle: 'italic', textColor: grey600, fontSize: 8 }

  const produitsBody: RowInput[] = []

  // Cotisations header row
  const cotCompte = cats.length > 0 ? (cats[0].compte || '') : ''
  produitsBody.push([
    { content: 'Cotisations', styles: cotBoldStyle },
    { content: String(report.cotisations.nb_emises), styles: cotBoldStyle },
    { content: chfAlways(report.cotisations.net_facture), styles: cotBoldStyle },
    { content: chfAlways(report.cotisations.encaisse), styles: cotBoldStyle },
    { content: chfAlways(report.cotisations.debiteurs), styles: cotBoldStyle },
  ])

  // Detail lines (italic grey, Facturé column only)
  produitsBody.push([
    { content: '    Cotisations brutes', styles: cotDetailStyle },
    { content: '', styles: cotDetailStyle },
    { content: chf(report.cotisations.brut), styles: cotDetailStyle },
    { content: '', styles: cotDetailStyle },
    { content: '', styles: cotDetailStyle },
  ])
  if (report.cotisations.rabais_fratrie !== 0) {
    produitsBody.push([
      { content: '    ./. Rabais fratrie', styles: cotDetailStyle },
      { content: '', styles: cotDetailStyle },
      { content: `-${chfAlways(report.cotisations.rabais_fratrie)}`, styles: cotDetailStyle },
      { content: '', styles: cotDetailStyle },
      { content: '', styles: cotDetailStyle },
    ])
  }
  if (report.cotisations.frais_rappel !== 0) {
    produitsBody.push([
      { content: '    + Frais de rappel', styles: cotDetailStyle },
      { content: '', styles: cotDetailStyle },
      { content: chf(report.cotisations.frais_rappel), styles: cotDetailStyle },
      { content: '', styles: cotDetailStyle },
      { content: '', styles: cotDetailStyle },
    ])
  }

  // Per-category lines
  for (const cat of cats) {
    produitsBody.push([
      { content: `    ${cat.compte || '—'}  ${cat.categorie}`, styles: { fontSize: 8 } },
      { content: String(cat.nb_emises), styles: { fontSize: 8 } },
      { content: chf(cat.net_facture), styles: { fontSize: 8 } },
      { content: chf(cat.encaisse), styles: { fontSize: 8 } },
      { content: chf(cat.debiteurs), styles: { fontSize: 8 } },
    ])
  }

  // Confrérie row (from snapshot)
  const confrerieRec = snapshot?.recettes.find(r => r.type === 'confrerie' || r.label.toLowerCase().includes('confrérie'))
  if (confrerieRec && confrerieRec.facture > 0) {
    produitsBody.push([
      { content: club.confrerie_label || 'Club des 500', styles: cotBoldStyle },
      { content: String(confrerieRec.nb_factures), styles: cotBoldStyle },
      { content: chfAlways(confrerieRec.facture), styles: cotBoldStyle },
      { content: chfAlways(confrerieRec.encaisse), styles: cotBoldStyle },
      { content: chfAlways(confrerieRec.impaye), styles: cotBoldStyle },
    ])
  }

  // Événements row
  const eventsRec = snapshot?.recettes.find(r => r.type === 'events' || r.label.toLowerCase().includes('événement'))
  if (eventsRec && eventsRec.facture > 0) {
    produitsBody.push([
      { content: 'Événements', styles: cotBoldStyle },
      { content: String(eventsRec.nb_factures), styles: cotBoldStyle },
      { content: chfAlways(eventsRec.facture), styles: cotBoldStyle },
      { content: chfAlways(eventsRec.encaisse), styles: cotBoldStyle },
      { content: chfAlways(eventsRec.impaye), styles: cotBoldStyle },
    ])
  }

  // Sponsoring
  if (report.sponsoring && report.sponsoring.nb_emises > 0) {
    produitsBody.push([
      { content: `Sponsoring${report.sponsoring.compte ? ` (${report.sponsoring.compte})` : ''}`, styles: cotBoldStyle },
      { content: String(report.sponsoring.nb_emises), styles: cotBoldStyle },
      { content: chfAlways(report.sponsoring.net_facture), styles: cotBoldStyle },
      { content: chfAlways(report.sponsoring.encaisse), styles: cotBoldStyle },
      { content: chfAlways(report.sponsoring.debiteurs), styles: cotBoldStyle },
    ])
  }

  // TOTAL DES PRODUITS
  const totalFacture = snapshot?.recettes_total.facture ?? report.cotisations.net_facture
  const totalEncaisse = snapshot?.recettes_total.encaisse ?? report.cotisations.encaisse
  const totalDebiteurs = snapshot?.recettes_total.impaye ?? report.cotisations.debiteurs
  const totalNbFactures = snapshot?.recettes.reduce((s, r) => s + r.nb_factures, 0) ?? report.cotisations.nb_emises

  const totalRowStyle: Partial<Styles> = { fontStyle: 'bold', fillColor: grey50 }
  produitsBody.push([
    { content: 'TOTAL DES PRODUITS', styles: totalRowStyle },
    { content: String(totalNbFactures), styles: totalRowStyle },
    { content: chfAlways(totalFacture), styles: totalRowStyle },
    { content: chfAlways(totalEncaisse), styles: totalRowStyle },
    { content: chfAlways(totalDebiteurs), styles: totalRowStyle },
  ])

  callAutoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['Produits', 'Factures', 'Facturé', 'Encaissé', 'Débiteurs']],
    body: produitsBody,
    styles: { ...baseStyles, halign: 'right' },
    headStyles: headerStyles,
    columnStyles: {
      0: { halign: 'left', cellWidth: 80 },
      1: { cellWidth: 20 },
    },
    theme: 'grid',
    tableLineColor: [210, 210, 210],
    tableLineWidth: 0.15,
    didParseCell: (data: any) => {
      if (data.section === 'head') {
        if (data.column.index === 0) data.cell.styles.halign = 'left'
      }
    },
  })

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2
  y = footnote(y, 'Facturé = factures émises (envoyées, partielles, payées). Encaissé = paiements rattachés. Débiteurs = facturé - encaissé.')

  /* ══════════════════════════════════════════════════════
     2. CHARGES
     ══════════════════════════════════════════════════════ */
  y += 3
  y = ensureSpace(y, 40)
  y = sectionTitle(y, '2', 'CHARGES')

  const expRows = expenses?.rows || []
  const chargesBody: RowInput[] = []

  for (const er of expRows) {
    chargesBody.push([
      er.account_number || '—',
      er.compte,
      chf(er.payees),
      chf(er.engagees),
      chf(er.total),
    ])
  }

  const expTotalPayees = expenses?.totalPayees ?? 0
  const expTotalEngagees = expenses?.totalEngagees ?? 0
  const expTotalAll = expenses?.totalAll ?? 0

  chargesBody.push([
    { content: '', styles: totalRowStyle },
    { content: 'TOTAL DES CHARGES', styles: totalRowStyle },
    { content: chfAlways(expTotalPayees), styles: totalRowStyle },
    { content: chfAlways(expTotalEngagees), styles: totalRowStyle },
    { content: chfAlways(expTotalAll), styles: totalRowStyle },
  ])

  callAutoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['Compte', 'Charges (dépenses)', 'Payées', 'Engagées', 'Total']],
    body: chargesBody,
    styles: { ...baseStyles, halign: 'right' },
    headStyles: headerStyles,
    columnStyles: {
      0: { halign: 'left', cellWidth: 25 },
      1: { halign: 'left', cellWidth: 55 },
    },
    theme: 'grid',
    tableLineColor: [210, 210, 210],
    tableLineWidth: 0.15,
    didParseCell: (data: any) => {
      if (data.section === 'head' && data.column.index <= 1) {
        data.cell.styles.halign = 'left'
      }
    },
  })

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2
  y = footnote(y, 'Payées = remboursées et comptabilisées. Engagées = approuvées, en attente de paiement.')

  /* ══════════════════════════════════════════════════════
     PAGE 2 — 3. RÉSULTAT
     ══════════════════════════════════════════════════════ */
  doc.addPage()
  y = drawHeader(false)
  y = sectionTitle(y, '3', 'RÉSULTAT')

  const encTotal = snapshot?.recettes_total.encaisse ?? totalEncaisse
  const depPayees = snapshot?.depenses.payees ?? expTotalPayees
  const soldeTreso = encTotal - depPayees

  const soldePrev = totalFacture - expTotalAll

  const tauxGlobal = totalFacture > 0 ? (totalEncaisse / totalFacture * 100) : 0

  const soldeTresoColor: [number, number, number] = soldeTreso < 0 ? pc : black
  const resultatBody: RowInput[] = [
    [{ content: 'RÉSULTAT DE TRÉSORERIE (réalisé)', colSpan: 2, styles: { fontStyle: 'bold', fontSize: 8.5, textColor: pc } }],
    ['Encaissements totaux toutes recettes', chfAlways(encTotal)],
    ['./. Dépenses payées', `-${chfAlways(depPayees)}`],
    [
      { content: '= SOLDE DE TRÉSORERIE', styles: { fontStyle: 'bold', fillColor: grey50 } },
      { content: chfAlways(soldeTreso), styles: { fontStyle: 'bold', fillColor: grey50, textColor: soldeTresoColor } },
    ],
    [{ content: '', colSpan: 2, styles: { cellPadding: 1 } }],
    [{ content: 'RÉSULTAT PRÉVISIONNEL (si tout est encaissé et payé)', colSpan: 2, styles: { fontStyle: 'bold', fontSize: 8.5, textColor: pc } }],
    ['Total des produits facturés', chfAlways(totalFacture)],
    [`./. Total des charges (payées + engagées)`, `-${chfAlways(expTotalAll)}`],
    [
      { content: '= SOLDE VIRTUEL', styles: { fontStyle: 'bold', fillColor: grey50 } },
      { content: chfAlways(soldePrev), styles: { fontStyle: 'bold', fillColor: grey50 } },
    ],
    [{ content: '', colSpan: 2, styles: { cellPadding: 1 } }],
    [
      { content: `Taux d'encaissement global`, styles: { fillColor: grey50, textColor: grey600 } },
      { content: `${tauxGlobal.toFixed(1)} %`, styles: { fillColor: grey50, textColor: grey600 } },
    ],
    [
      { content: 'Débiteurs ouverts (toutes recettes)', styles: { fillColor: grey50, textColor: grey600 } },
      { content: chfAlways(totalDebiteurs), styles: { fillColor: grey50, textColor: grey600 } },
    ],
    [
      { content: 'Dépenses engagées à venir', styles: { fillColor: grey50, textColor: grey600 } },
      { content: chfAlways(expTotalEngagees), styles: { fillColor: grey50, textColor: grey600 } },
    ],
  ]

  callAutoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    body: resultatBody,
    styles: { ...baseStyles, halign: 'right' },
    columnStyles: {
      0: { halign: 'left', cellWidth: 110 },
    },
    theme: 'grid',
    tableLineColor: [210, 210, 210],
    tableLineWidth: 0.15,
    showHead: false,
  })

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6

  /* ══════════════════════════════════════════════════════
     4. VISA
     ══════════════════════════════════════════════════════ */
  y = ensureSpace(y, 35)
  y = sectionTitle(y, '4', 'VISA')
  y += 2

  const sigW = CONTENT_W / 3 - 4
  const sigLabels = ['Le/la trésorier·ère', 'Le/la président·e', 'Lieu et date']
  doc.setDrawColor(160, 160, 160)
  doc.setLineWidth(0.25)
  for (let i = 0; i < 3; i++) {
    const x = M + i * (sigW + 6)
    doc.line(x, y + 15, x + sigW, y + 15)
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...grey600)
    doc.text(sigLabels[i], x + sigW / 2, y + 19, { align: 'center' })
  }
  y += 25

  /* ══════════════════════════════════════════════════════
     PAGE 3 — 5. GRAPHIQUES
     ══════════════════════════════════════════════════════ */
  doc.addPage()
  y = drawHeader(false)
  y = sectionTitle(y, '5', 'GRAPHIQUES')
  y += 2

  // 5a) Horizontal bar chart: Cotisations par équipe
  if (teamCotisations.length > 0) {
    y = drawCotisationBarChart(doc, y, teamCotisations, pc, pcTint, M, CONTENT_W)
    y += 2
    y = footnote(y, 'Cotisations : factures émises de la saison, par équipe du joueur au moment de la facturation.')
    y += 4
  }

  // 5b) Pie: Dépenses par équipe
  y = ensureSpace(y, 70)
  const totalDepChart = teamExpenses.reduce((s, r) => s + r.amount, 0)
  if (totalDepChart > 0) {
    y = drawExpensePie(doc, y, teamExpenses, pc, M, CONTENT_W)
    y += 2
    y = footnote(y, 'Dépenses : notes de frais et dépenses payées ou engagées, par équipe (« Club » = dépenses sans équipe).')
  } else {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(...grey600)
    doc.text('Aucune dépense pour la saison', M, y)
    y += 6
    y = footnote(y, 'Dépenses : notes de frais et dépenses payées ou engagées, par équipe (« Club » = dépenses sans équipe).')
  }

  /* ── Finalize ── */
  addFooter()

  const slug = club.club_name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
  const saison = seasonName.replace(/[^a-z0-9]/gi, '-')
  const yyyymmdd = report.arrete_au.slice(0, 10).replace(/-/g, '')
  doc.save(`situation-financiere-${slug}-${saison}-${yyyymmdd}.pdf`)
}

/* ══════════════════════════════════════════════════════
   Chart: Horizontal grouped bar — Cotisations par équipe
   ══════════════════════════════════════════════════════ */
function drawCotisationBarChart(
  doc: jsPDF,
  startY: number,
  data: TeamCotisationRow[],
  pc: [number, number, number],
  pcTint: [number, number, number],
  marginLeft: number,
  contentW: number,
): number {
  const sorted = [...data].sort((a, b) => b.facture - a.facture).slice(0, 20)
  const maxVal = Math.max(...sorted.map(r => Math.max(r.facture, r.encaisse)), 1)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)
  doc.text('Cotisations par équipe — facturé vs encaissé (CHF)', marginLeft, startY)
  let y = startY + 5

  // Legend
  const legendX = marginLeft
  doc.setFillColor(...pcTint)
  doc.rect(legendX, y - 2.5, 8, 3, 'F')
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text('Facturé', legendX + 10, y)

  doc.setFillColor(...pc)
  doc.rect(legendX + 30, y - 2.5, 8, 3, 'F')
  doc.text('Encaissé', legendX + 40, y)
  y += 5

  const labelW = 55
  const chartX = marginLeft + labelW
  const chartW = contentW - labelW - 20
  const barH = 2.8
  const baseRowH = 8

  // Gridlines — draw after computing row heights
  // First pass: compute label line counts and row heights
  const rowHeights: number[] = []
  for (const row of sorted) {
    const label = shortTeamLabel(row.team_name)
    doc.setFontSize(8)
    const lines = doc.splitTextToSize(label, labelW - 3)
    const linesH = lines.length * 3.5
    rowHeights.push(Math.max(baseRowH, linesH + 2))
  }

  const totalChartH = rowHeights.reduce((s, h) => s + h, 0)

  // Gridlines
  doc.setDrawColor(230, 230, 230)
  doc.setLineWidth(0.1)
  for (let g = 0; g <= 4; g++) {
    const gx = chartX + (chartW * g / 4)
    doc.line(gx, y, gx, y + totalChartH)
    doc.setFontSize(6)
    doc.setTextColor(160, 160, 160)
    const gval = (maxVal * g / 4)
    doc.text(chfAlways(gval), gx, y - 1, { align: 'center' })
  }

  let rowY = y
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i]
    const rH = rowHeights[i]

    // Team label — multi-line, no truncation
    const label = shortTeamLabel(row.team_name)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60, 60, 60)
    const lines: string[] = doc.splitTextToSize(label, labelW - 3)
    const textStartY = rowY + (rH / 2) - ((lines.length - 1) * 1.75)
    for (let l = 0; l < lines.length; l++) {
      doc.text(lines[l], chartX - 2, textStartY + l * 3.5, { align: 'right' })
    }

    // Bars centered vertically in row
    const barsTopY = rowY + (rH - barH * 2 - 0.4) / 2

    // Facturé bar (tint)
    const bwFact = (row.facture / maxVal) * chartW
    doc.setFillColor(...pcTint)
    doc.rect(chartX, barsTopY, Math.max(bwFact, 0.5), barH, 'F')

    // Encaissé bar (primary)
    const bwEnc = (row.encaisse / maxVal) * chartW
    doc.setFillColor(...pc)
    doc.rect(chartX, barsTopY + barH + 0.4, Math.max(bwEnc, 0.5), barH, 'F')

    // Value labels
    doc.setFontSize(6)
    doc.setTextColor(80, 80, 80)
    if (row.facture > 0) doc.text(chfAlways(row.facture), chartX + bwFact + 1, barsTopY + barH - 0.3)
    if (row.encaisse > 0) doc.text(chfAlways(row.encaisse), chartX + bwEnc + 1, barsTopY + barH + 0.4 + barH - 0.3)

    rowY += rH
  }

  return rowY + 3
}

/* ══════════════════════════════════════════════════════
   Chart: Pie — Dépenses par équipe
   ══════════════════════════════════════════════════════ */
function drawExpensePie(
  doc: jsPDF,
  startY: number,
  data: TeamExpenseRow[],
  pc: [number, number, number],
  marginLeft: number,
  contentW: number,
): number {
  const sorted = [...data].sort((a, b) => b.amount - a.amount)
  const total = sorted.reduce((s, r) => s + r.amount, 0)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)
  doc.text('Dépenses par équipe — payées + engagées', marginLeft, startY)
  let y = startY + 6

  const cx = marginLeft + 30
  const cy = y + 25
  const radius = 22

  const colors: [number, number, number][] = [
    pc,
    [120, 120, 120],
    [160, 160, 160],
    [190, 190, 190],
    [210, 210, 210],
    [225, 225, 225],
    tintRgb(pc, 0.5),
    tintRgb(pc, 0.7),
  ]

  const drawSector = (
    sDoc: jsPDF, sCx: number, sCy: number, r: number,
    startDeg: number, endDeg: number, rgb: [number, number, number],
  ) => {
    const pts: [number, number][] = [[sCx, sCy]]
    const step = 2
    for (let a = startDeg; a < endDeg; a += step) {
      const t = (a * Math.PI) / 180
      pts.push([sCx + r * Math.cos(t), sCy + r * Math.sin(t)])
    }
    const tEnd = (endDeg * Math.PI) / 180
    pts.push([sCx + r * Math.cos(tEnd), sCy + r * Math.sin(tEnd)])

    const rel: [number, number][] = []
    for (let p = 1; p < pts.length; p++) {
      rel.push([pts[p][0] - pts[p - 1][0], pts[p][1] - pts[p - 1][1]])
    }

    sDoc.setFillColor(rgb[0], rgb[1], rgb[2])
    sDoc.setDrawColor(255, 255, 255)
    sDoc.setLineWidth(0.5)
    sDoc.lines(rel, pts[0][0], pts[0][1], [1, 1], 'FD', true)

    if (import.meta.env.DEV) {
      for (const pt of pts) {
        const d = Math.sqrt((pt[0] - sCx) ** 2 + (pt[1] - sCy) ** 2)
        console.assert(d <= r + 0.01, `Pie point outside radius: d=${d}, r=${r}`)
      }
    }
  }

  let angleDeg = -90
  for (let i = 0; i < sorted.length; i++) {
    const frac = sorted[i].amount / total
    const sliceDeg = frac * 360
    if (frac < 0.01) { angleDeg += sliceDeg; continue }
    const color = colors[i % colors.length]
    drawSector(doc, cx, cy, radius, angleDeg, angleDeg + sliceDeg, color)
    angleDeg += sliceDeg
  }

  // Total label centered BELOW the pie
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)
  doc.text(`Total CHF ${chfAlways(total)}`, cx, cy + radius + 5, { align: 'center' })

  // Legend on the right
  const legX = cx + radius + 12
  const maxLegW = contentW - (legX - marginLeft) - 2
  let legY = y + 2
  for (let i = 0; i < sorted.length; i++) {
    const color = colors[i % colors.length]
    const row = sorted[i]
    const pct = ((row.amount / total) * 100).toFixed(1)
    const label = shortTeamLabel(row.team_name)
    const amountStr = `CHF ${chfAlways(row.amount)} (${pct} %)`

    doc.setFillColor(...color)
    doc.rect(legX, legY - 2, 4, 3, 'F')
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60, 60, 60)

    const fullLine = `${label} — ${amountStr}`
    if (doc.getTextWidth(fullLine) <= maxLegW - 8) {
      doc.text(fullLine, legX + 6, legY)
      legY += 5
    } else {
      doc.text(label, legX + 6, legY)
      legY += 3.5
      doc.setTextColor(100, 100, 100)
      doc.text(amountStr, legX + 6, legY)
      legY += 5
    }
  }

  return Math.max(cy + radius + 8, legY + 2)
}
