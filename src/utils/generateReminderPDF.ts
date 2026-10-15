import { jsPDF } from 'jspdf';

export interface ReminderPDFData {
  reminder_type: 'R1' | 'R2';
  invoice_number: string;
  issue_date: string;
  due_date: string;
  total_amount: number;
  reminder_fee: number;
  currency: string;
  base_amount: number;
  fratrie_discount_amount: number;

  member_first_name: string;
  member_last_name: string;
  member_salutation?: string;
  member_address: string;
  member_street_number?: string;
  member_postal_code: string;
  member_city: string;
  member_birth_date?: string;
  issue_date_for_age?: string;

  category_name: string;
  season_name: string;

  club_name: string;
  club_address: string;
  club_street_number?: string;
  club_postal_code: string;
  club_city: string;
  club_email: string;
  club_phone?: string;
  logo_url?: string;

  qr_iban: string;
  bank_name: string;
  contact_name?: string;
  contact_phone?: string;
  payment_delay_days: number;

  is_sponsoring?: boolean;
  sponsor_company_name?: string;
  sponsor_contact_name?: string;
  sponsor_address?: string;
  sponsor_postal_code?: string;
  sponsor_city?: string;

  is_event?: boolean;
  event_title?: string;
  event_debtor_first_name?: string;
  event_debtor_last_name?: string;
  event_debtor_address?: string;
  event_debtor_postal_code?: string;
  event_debtor_city?: string;
  event_company?: string;

  is_confrerie?: boolean;
  confrerie_label?: string;
  confrerie_member_first_name?: string;
  confrerie_member_last_name?: string;
  confrerie_member_address?: string;
  confrerie_member_postal_code?: string;
  confrerie_member_city?: string;
  confrerie_member_salutation?: string;
  confrerie_member_company?: string;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function formatAmount(amount: number, currency: string): string {
  return `${currency} ${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}`;
}

function buildAddrLines(data: ReminderPDFData): string[] {
  if (data.is_sponsoring && data.sponsor_company_name) {
    return [
      data.sponsor_company_name,
      data.sponsor_contact_name ? `c/o ${data.sponsor_contact_name}` : '',
      data.sponsor_address || '',
      `${data.sponsor_postal_code || ''} ${data.sponsor_city || ''}`.trim(),
    ].filter(Boolean);
  }
  if (data.is_event) {
    const name = `${data.event_debtor_first_name || ''} ${data.event_debtor_last_name || ''}`.trim();
    if (data.event_company) {
      return [data.event_company, name ? `c/o ${name}` : '', data.event_debtor_address || '', `${data.event_debtor_postal_code || ''} ${data.event_debtor_city || ''}`.trim()].filter(Boolean);
    }
    return [name, data.event_debtor_address || '', `${data.event_debtor_postal_code || ''} ${data.event_debtor_city || ''}`.trim()].filter(Boolean);
  }
  if (data.is_confrerie) {
    const cFullName = [data.confrerie_member_salutation, data.confrerie_member_first_name, data.confrerie_member_last_name].filter(Boolean).join(' ');
    return [
      cFullName,
      ...(data.confrerie_member_company ? [data.confrerie_member_company] : []),
      data.confrerie_member_address || '',
      `${data.confrerie_member_postal_code || ''} ${data.confrerie_member_city || ''}`.trim(),
    ].filter(Boolean);
  }
  const isMinor = (() => {
    if (!data.member_birth_date || !data.issue_date_for_age) return false;
    const birth = new Date(data.member_birth_date);
    const issue = new Date(data.issue_date_for_age);
    let age = issue.getFullYear() - birth.getFullYear();
    const m = issue.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && issue.getDate() < birth.getDate())) age--;
    return age < 18;
  })();
  const salutation = data.member_salutation || '';
  const memberAddress = [data.member_address, data.member_street_number].filter(Boolean).join(' ');
  return [
    ...(isMinor ? ['Aux parents de'] : (salutation ? [salutation] : [])),
    `${data.member_first_name} ${data.member_last_name}`.trim(),
    memberAddress,
    `${data.member_postal_code} ${data.member_city}`.trim(),
  ].filter(Boolean);
}

export async function generateReminderPagePDF(data: ReminderPDFData): Promise<string> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const margin = 20;
  const contentW = pageW - 2 * margin;

  doc.setFont('helvetica');

  // --- Club header (top bar, same as invoice) ---
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(data.club_name, margin, 8);

  doc.setFont('helvetica', 'normal');
  const fullClubAddr = [data.club_address, data.club_street_number].filter(Boolean).join(' ')
    + ', ' + data.club_postal_code + ' ' + data.club_city;
  doc.text(fullClubAddr, pageW / 2, 8, { align: 'center' });
  doc.text(data.club_email || '', pageW - margin, 8, { align: 'right' });
  doc.text(data.contact_phone || '', pageW - margin, 13, { align: 'right' });

  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(margin, 16, pageW - margin, 16);

  // --- Logo ---
  if (data.logo_url) {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = data.logo_url!;
      });
      const MAX_LONG_SIDE = 800;
      let cw = img.naturalWidth;
      let ch = img.naturalHeight;
      const longest = Math.max(cw, ch);
      if (longest > MAX_LONG_SIDE) {
        const scale = MAX_LONG_SIDE / longest;
        cw = Math.round(cw * scale);
        ch = Math.round(ch * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, cw, ch);
      const pixels = ctx.getImageData(0, 0, cw, ch).data;
      let hasAlpha = false;
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] < 250) { hasAlpha = true; break; }
      }
      let logoDataUrl: string;
      let logoFormat: 'JPEG' | 'PNG';
      if (!hasAlpha) {
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, cw, ch);
        logoDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        logoFormat = 'JPEG';
      } else {
        logoDataUrl = canvas.toDataURL('image/png');
        logoFormat = 'PNG';
      }
      const logoMaxW = 40;
      const logoMaxH = 22;
      const logoAspect = cw / ch;
      let logoW = logoMaxW;
      let logoH = logoW / logoAspect;
      if (logoH > logoMaxH) {
        logoH = logoMaxH;
        logoW = logoH * logoAspect;
      }
      doc.addImage(logoDataUrl, logoFormat, margin, 20, logoW, logoH, 'club-logo', logoFormat === 'PNG' ? 'FAST' : undefined);
    } catch { /* skip logo */ }
  }

  // --- Recipient address (RIGHT side, same position as invoice: x=125, y=40, spacing 6mm) ---
  const addrX = 125;
  const addrY = 46;
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  const addrLines = buildAddrLines(data);
  addrLines.forEach((line, i) => {
    doc.text(line, addrX, addrY + i * 6);
  });

  // --- Date & location (left-aligned with recipient address) ---
  let y = 75;
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`${data.club_city}, le ${formatDate(new Date().toISOString())}`, addrX, y);
  y += 14;

  // --- Title ---
  const isR2 = data.reminder_type === 'R2';
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(isR2 ? 180 : 200, 50, 50);
  const title = isR2 ? '2e RAPPEL DE PAIEMENT' : 'RAPPEL DE PAIEMENT';
  doc.text(title, margin, y);
  y += 12;

  // --- Separator ---
  doc.setDrawColor(200);
  doc.setLineWidth(0.3);
  doc.line(margin, y, margin + contentW, y);
  y += 10;

  // --- Body text ---
  doc.setFontSize(11);
  doc.setTextColor(40, 40, 40);
  doc.setFont('helvetica', 'normal');

  const lineH = 5.5;
  const indent = 8;
  const invoiceNum = data.invoice_number;
  const amount = formatAmount(data.total_amount, data.currency);
  const issueDate = formatDate(data.issue_date);

  if (isR2) {
    // R2 body
    doc.text('Bonjour,', margin, y); y += lineH * 2;
    doc.text('Malgré notre premier rappel, nous constatons que :', margin, y); y += lineH * 1.5;
    doc.text(`la facture numéro ${invoiceNum},`, margin + indent, y); y += lineH;
    doc.text(`de ${amount}`, margin + indent, y); y += lineH;
    doc.text(`en date du ${issueDate}`, margin + indent, y); y += lineH * 1.5;
    doc.text("n'a toujours pas été réglée.", margin, y); y += lineH * 2;

    if (data.reminder_fee > 0) {
      const feeText = `Conformément à nos conditions, des frais de rappel de ${formatAmount(data.reminder_fee, data.currency)} ont été ajoutés au montant dû,`;
      doc.text(feeText, margin, y); y += lineH;
      doc.text('comme indiqué sur le bulletin de versement ci-joint.', margin, y); y += lineH;
    }

    doc.text("Il est possible que ce paiement ait été effectué entre-temps. Si tel est le cas, nous vous prions", margin, y); y += lineH;
    doc.text("de ne pas tenir compte du présent rappel. Dans le cas contraire, nous vous prions de régulariser", margin, y); y += lineH;
    doc.text("votre situation dans les meilleurs délais.", margin, y); y += lineH;
  } else {
    // R1 body
    doc.text('Bonjour,', margin, y); y += lineH * 2;
    doc.text('Nous nous permettons de vous signaler que :', margin, y); y += lineH * 1.5;
    doc.text(`la facture numéro ${invoiceNum},`, margin + indent, y); y += lineH;
    doc.text(`de ${amount}`, margin + indent, y); y += lineH;
    doc.text(`en date du ${issueDate}`, margin + indent, y); y += lineH * 1.5;
    doc.text("n'a pas encore été réglée.", margin, y); y += lineH * 2;
    doc.text("Il est possible que ce paiement ait été effectué entre-temps. Si tel est le cas, nous vous prions", margin, y); y += lineH;
    doc.text("de ne pas tenir compte du présent rappel. Dans le cas contraire, nous vous serions reconnaissants", margin, y); y += lineH;
    doc.text("de bien vouloir régulariser votre situation dans les meilleurs délais.", margin, y); y += lineH;
  }

  // --- Closing ---
  y += lineH * 2;
  doc.text('Nous vous remercions de votre compréhension et vous adressons', margin, y); y += lineH;
  doc.text('nos salutations distinguées.', margin, y); y += lineH * 3;

  doc.setFont('helvetica', 'bold');
  doc.text(data.club_name, margin, y); y += lineH;
  if (data.contact_name) {
    doc.setFont('helvetica', 'normal');
    doc.text(data.contact_name, margin, y); y += lineH;
  }

  return doc.output('datauristring').split(',')[1];
}
