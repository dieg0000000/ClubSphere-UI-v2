import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

interface InvoiceData {
  invoice_number: string;
  issue_date: string;
  due_date: string;
  qr_reference: string;
  notes?: string;

  member_first_name: string;
  member_last_name: string;
  member_salutation?: string;
  member_address: string;
  member_street_number?: string;
  member_postal_code: string;
  member_city: string;
  member_asf_licence?: string;
  member_birth_date?: string;

  base_amount: number;
  fratrie_discount_pct: number;
  fratrie_discount_amount: number;
  reminder_fee: number;
  total_amount: number;
  currency: string;

  category_name: string;
  season_name: string;

  club_name: string;
  club_address: string;
  club_street_number?: string;
  club_postal_code: string;
  club_city: string;
  club_email: string;
  club_phone?: string;
  club_website?: string;
  logo_url?: string;

  qr_iban: string;
  bank_name: string;
  bank_street?: string;
  bank_street_number?: string;
  bank_postal_code?: string;
  bank_city?: string;

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
  event_date?: string;
  event_option_label?: string;
  event_quantity?: number;
  event_company?: string;
  event_debtor_first_name?: string;
  event_debtor_last_name?: string;
  event_debtor_address?: string;
  event_debtor_postal_code?: string;
  event_debtor_city?: string;

  is_confrerie?: boolean;
  confrerie_label?: string;
  confrerie_member_first_name?: string;
  confrerie_member_last_name?: string;
  confrerie_member_address?: string;
  confrerie_member_postal_code?: string;
  confrerie_member_city?: string;
  confrerie_member_salutation?: string;
  confrerie_member_company?: string;
  confrerie_is_supporter?: boolean;
}

function buildEventDebtorLines(invoice: InvoiceData): string[] {
  const fullName = `${invoice.event_debtor_first_name || ''} ${invoice.event_debtor_last_name || ''}`.trim();
  if (invoice.event_company) {
    return [
      invoice.event_company,
      fullName ? `c/o ${fullName}` : '',
      invoice.event_debtor_address || '',
      `${invoice.event_debtor_postal_code || ''} ${invoice.event_debtor_city || ''}`.trim()
    ].filter(Boolean);
  }
  return [
    fullName,
    invoice.event_debtor_address || '',
    `${invoice.event_debtor_postal_code || ''} ${invoice.event_debtor_city || ''}`.trim()
  ].filter(Boolean);
}

export const generateInvoicePDF = async (
  invoice: InvoiceData,
  returnBase64: boolean = false
): Promise<void | string> => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageW = 210;
  const pageH = 297;
  const margin = 20;
  const contentW = pageW - 2 * margin;

  doc.setFont('helvetica');

  const BLACK = [0, 0, 0] as [number, number, number];
  const GRAY = [100, 100, 100] as [number, number, number];
  const LIGHT_GRAY = [200, 200, 200] as [number, number, number];

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-CH', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  };

  const formatAmount = (amount: number) => {
    return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  };

  // Wrap a string to fit within maxWidth (mm) at the current font/size.
  // Splits on spaces and breaks any single word wider than the column.
  const wrapTextToWidth = (text: string, maxWidth: number): string[] => {
    const words = (text || '').split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';
    const flush = () => { if (current) { lines.push(current); current = ''; } };
    for (const word of words) {
      if (doc.getTextWidth(word) > maxWidth) {
        flush();
        let chunk = '';
        for (const ch of word) {
          if (doc.getTextWidth(chunk + ch) <= maxWidth) {
            chunk += ch;
          } else {
            if (chunk) lines.push(chunk);
            chunk = ch;
          }
        }
        current = chunk;
        continue;
      }
      const attempt = current ? current + ' ' + word : word;
      if (doc.getTextWidth(attempt) <= maxWidth) {
        current = attempt;
      } else {
        flush();
        current = word;
      }
    }
    flush();
    return lines.length ? lines : [''];
  };

  // Cap wrapped lines to maxLines, appending an ellipsis that still fits.
  const capLinesWithEllipsis = (lines: string[], maxLines: number, maxWidth: number): string[] => {
    if (lines.length <= maxLines) return lines;
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 0 && doc.getTextWidth(last + '…') > maxWidth) {
      last = last.slice(0, -1);
    }
    kept[maxLines - 1] = last.replace(/\s+$/, '') + '…';
    return kept;
  };

  const generateRFReference = (invoiceNumber: number): string => {
    // Build base reference (max 21 chars):
    const ref = String(invoiceNumber).padStart(21, '0');

    // ISO 11649: append 'RF00' + ref, convert letters to numbers
    // R=27, F=15
    const checkString = ref + '271500';

    // Calculate mod 97:
    let remainder = 0;
    for (const char of checkString) {
      remainder = (remainder * 10 + parseInt(char)) % 97;
    }

    const checkDigits = String(98 - remainder).padStart(2, '0');

    // Format: RF + checkDigits + reference
    const rfRef = 'RF' + checkDigits + ref;

    return rfRef; // return unformatted for QR data
  };

  const formatRFReference = (rfRef: string): string => {
    return rfRef.match(/.{1,4}/g)?.join(' ') || rfRef;
  };

  const loadHighResLogo = async (logoUrl: string):
    Promise<{ dataUrl: string; w: number; h: number; format: 'JPEG' | 'PNG' } | null> => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = logoUrl;
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
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(img, 0, 0, cw, ch);
      const pixels = ctx.getImageData(0, 0, cw, ch).data;
      let hasAlpha = false;
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] < 250) { hasAlpha = true; break; }
      }

      if (!hasAlpha) {
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, cw, ch);
        return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), w: cw, h: ch, format: 'JPEG' };
      }
      return { dataUrl: canvas.toDataURL('image/png'), w: cw, h: ch, format: 'PNG' };
    } catch (e) {
      console.error('Logo error:', e);
      return null;
    }
  };

  let logoInfo: { dataUrl: string; w: number; h: number; format: 'JPEG' | 'PNG' } | null = null;
  if (invoice.logo_url) {
    logoInfo = await loadHighResLogo(invoice.logo_url);
  }

  doc.setFontSize(8);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLACK);
  doc.text(invoice.club_name, margin, 8);

  doc.setFont('helvetica', 'normal');
  const fullAddress = [
    invoice.club_address,
    invoice.club_street_number
  ].filter(Boolean).join(' ') +
  ', ' + invoice.club_postal_code +
  ' ' + invoice.club_city;

  doc.text(fullAddress, pageW / 2, 8, { align: 'center' });

  doc.text(
    invoice.club_email || '',
    pageW - margin, 8,
    { align: 'right' }
  );

  doc.text(
    invoice.club_website || '',
    margin, 13
  );

  doc.text(
    invoice.contact_phone || '',
    pageW - margin, 13,
    { align: 'right' }
  );

  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(margin, 16, pageW - margin, 16);

  if (logoInfo) {
    const logoMaxW = 40;
    const logoMaxH = 22;
    const logoAspect = logoInfo.w / logoInfo.h;
    let logoW = logoMaxW;
    let logoH = logoW / logoAspect;
    if (logoH > logoMaxH) {
      logoH = logoMaxH;
      logoW = logoH * logoAspect;
    }
    doc.addImage(logoInfo.dataUrl, logoInfo.format, margin, 20, logoW, logoH, 'club-logo', logoInfo.format === 'PNG' ? 'FAST' : undefined);
  }

  const addrX = 125;
  const addrY = 46;

  doc.setFontSize(10);
  doc.setTextColor(...BLACK);
  doc.setFont('helvetica', 'normal');

  const salutation = invoice.member_salutation || '';

  const isMinorMember = !invoice.is_event && !invoice.is_sponsoring && !invoice.is_confrerie && (() => {
    if (!invoice.member_birth_date || !invoice.issue_date) return false;
    const birth = new Date(invoice.member_birth_date);
    const issue = new Date(invoice.issue_date);
    let age = issue.getFullYear() - birth.getFullYear();
    const m = issue.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && issue.getDate() < birth.getDate())) age--;
    return age < 18;
  })();

  let addrLines: string[];
  if (invoice.is_event) {
    const fullName = `${invoice.event_debtor_first_name || ''} ${invoice.event_debtor_last_name || ''}`.trim();
    if (invoice.event_company) {
      addrLines = [
        invoice.event_company,
        fullName ? `c/o ${fullName}` : '',
        invoice.event_debtor_address || '',
        `${invoice.event_debtor_postal_code || ''} ${invoice.event_debtor_city || ''}`.trim()
      ].filter(Boolean);
    } else {
      addrLines = [
        fullName,
        invoice.event_debtor_address || '',
        `${invoice.event_debtor_postal_code || ''} ${invoice.event_debtor_city || ''}`.trim()
      ].filter(Boolean);
    }
  } else if (invoice.is_sponsoring) {
    addrLines = [
      invoice.sponsor_company_name || '',
      invoice.sponsor_contact_name ? `c/o ${invoice.sponsor_contact_name}` : '',
      invoice.sponsor_address || '',
      `${invoice.sponsor_postal_code || ''} ${invoice.sponsor_city || ''}`.trim()
    ].filter(Boolean);
  } else if (invoice.is_confrerie) {
    const cFullName = [invoice.confrerie_member_salutation, invoice.confrerie_member_first_name, invoice.confrerie_member_last_name].filter(Boolean).join(' ');
    addrLines = [
      cFullName,
      ...(invoice.confrerie_member_company ? [invoice.confrerie_member_company] : []),
      invoice.confrerie_member_address || '',
      `${invoice.confrerie_member_postal_code || ''} ${invoice.confrerie_member_city || ''}`.trim()
    ].filter(Boolean);
  } else {
    const memberAddress = [
      invoice.member_address,
      invoice.member_street_number
    ].filter(Boolean).join(' ');

    addrLines = [
      ...(isMinorMember ? ['Aux parents de'] : [salutation]),
      `${invoice.member_first_name} ${invoice.member_last_name}`,
      memberAddress,
      `${invoice.member_postal_code} ${invoice.member_city}`
    ].filter(Boolean);
  }

  addrLines.forEach((line, i) => {
    doc.text(line, addrX, addrY + i * 6);
  });

  const MAX_CONTENT_Y = 180;
  let y = 88;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLACK);
  doc.text(`Facture ${invoice.invoice_number}`, margin, y);

  y += 3;
  doc.setDrawColor(...LIGHT_GRAY);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY);
  doc.text(`Date:`, margin, y);
  doc.setTextColor(...BLACK);
  doc.text(formatDate(invoice.issue_date), margin + 20, y);
  doc.setTextColor(...GRAY);
  doc.text('Payable au:', pageW - margin - 40, y);
  doc.setTextColor(...BLACK);
  doc.text(
    formatDate(invoice.due_date),
    pageW - margin, y,
    { align: 'right' }
  );
  y += 3;

  doc.setDrawColor(...LIGHT_GRAY);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLACK);
  let docTitle: string;
  if (invoice.is_event) {
    docTitle = invoice.event_title ? `Événement — ${invoice.event_title}` : 'Événement';
  } else if (invoice.is_sponsoring) {
    docTitle = `Sponsoring ${invoice.season_name}`;
  } else if (invoice.is_confrerie) {
    const label = invoice.confrerie_is_supporter ? 'Cotisation supporter' : (invoice.confrerie_label || 'Confrérie');
    docTitle = `${label} ${invoice.season_name}`;
  } else {
    docTitle = invoice.category_name
      ? `Cotisation annuelle ${invoice.season_name} — ${invoice.category_name}`
      : `Cotisation annuelle ${invoice.season_name}`;
  }
  doc.text(docTitle, margin, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...BLACK);
  let greeting: string;
  if (invoice.is_event) {
    const eName = `${invoice.event_debtor_first_name || ''} ${invoice.event_debtor_last_name || ''}`.trim();
    greeting = eName ? `Bonjour ${eName},` : 'Madame, Monsieur,';
  } else if (invoice.is_sponsoring) {
    greeting = 'Madame, Monsieur,';
  } else if (invoice.is_confrerie) {
    const cFullGreeting = [invoice.confrerie_member_salutation, invoice.confrerie_member_first_name, invoice.confrerie_member_last_name].filter(Boolean).join(' ');
    greeting = cFullGreeting ? `Bonjour ${cFullGreeting},` : 'Madame, Monsieur,';
  } else {
    greeting = `Bonjour ${invoice.member_first_name} ${invoice.member_last_name},`;
  }
  doc.text(greeting, margin, y);
  y += 5;
  let introText: string;
  if (invoice.is_event) {
    introText = 'Veuillez trouver votre facture ci-dessous:';
  } else if (invoice.is_sponsoring) {
    introText = 'Veuillez trouver votre facture de sponsoring ci-dessous:';
  } else {
    introText = 'Veuillez trouver votre facture ci-dessous:';
  }
  doc.text(introText, margin, y);
  y += 10;

  const colPos = margin + 2;
  const colDesc = margin + 15;
  const colQty = 125;
  const colPrix = 160;
  const colTotal = pageW - margin;

  doc.setFillColor(240, 240, 240);
  doc.rect(margin, y - 5, contentW, 8, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLACK);
  doc.text('pos.', colPos, y);
  doc.text('Description', colDesc, y);
  doc.text('Quantité', colQty, y, { align: 'right' });
  doc.text('Prix unitaire', colPrix, y, { align: 'right' });
  doc.text('Total CHF', colTotal, y, { align: 'right' });
  y += 4;

  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 7;

  // Normalize base_amount: DB may return null for manual-amount invoices.
  const baseAmount = invoice.base_amount ?? 0;

  // Precompute line-item adjustments to detect manual-amount invoices.
  const secondTourDiscount = invoice.total_amount < baseAmount
    && invoice.fratrie_discount_pct === 0
    && invoice.reminder_fee === 0;
  const secondTourAmount = baseAmount - invoice.total_amount;

  const lineSum = baseAmount
    - (secondTourDiscount && secondTourAmount > 0 ? secondTourAmount : 0)
    - invoice.fratrie_discount_amount
    + invoice.reminder_fee;

  // If base_amount is zero or the item lines don't sum to total_amount (manual
  // amount, missing pricing), fall back to a single line = total_amount.
  const useFallbackLine = baseAmount === 0 || Math.abs(lineSum - invoice.total_amount) > 0.005;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('1', colPos, y);
  let lineItemDesc: string;
  let lineItemQty: number;
  let lineItemUnitPrice: number;
  if (invoice.is_event) {
    if (invoice.notes) {
      lineItemDesc = invoice.notes;
    } else {
      lineItemDesc = [invoice.event_option_label, invoice.event_title].filter(Boolean).join(' — ');
    }
    lineItemQty = invoice.event_quantity || 1;
    lineItemUnitPrice = lineItemQty > 0 ? baseAmount / lineItemQty : baseAmount;
  } else if (invoice.is_sponsoring) {
    lineItemDesc = invoice.season_name
      ? `Partenariat sponsoring — saison ${invoice.season_name}`
      : 'Partenariat sponsoring';
    lineItemQty = 1;
    lineItemUnitPrice = baseAmount;
  } else if (invoice.is_confrerie) {
    const label = invoice.confrerie_is_supporter ? 'Cotisation supporter' : (invoice.confrerie_label || 'Confrérie');
    lineItemDesc = invoice.season_name
      ? `${label} — saison ${invoice.season_name}`
      : label;
    lineItemQty = 1;
    lineItemUnitPrice = baseAmount;
  } else {
    lineItemDesc = invoice.category_name
      ? `Cotisation — ${invoice.category_name}`
      : 'Cotisation';
    lineItemQty = 1;
    lineItemUnitPrice = baseAmount;
  }

  if (useFallbackLine) {
    lineItemQty = invoice.is_event ? (invoice.event_quantity || 1) : 1;
    lineItemUnitPrice = lineItemQty > 0
      ? invoice.total_amount / lineItemQty
      : invoice.total_amount;
  }

  const lineItemTotal = useFallbackLine ? invoice.total_amount : baseAmount;

  const descMaxWidth = colQty - 8 - colDesc;
  const descLineHeight = 4.5;
  const descLines = capLinesWithEllipsis(wrapTextToWidth(lineItemDesc, descMaxWidth), 3, descMaxWidth);
  descLines.forEach((line, i) => {
    doc.text(line, colDesc, y + i * descLineHeight);
  });
  doc.text(lineItemQty.toString(), colQty, y, { align: 'right' });
  doc.text(formatAmount(lineItemUnitPrice), colPrix, y, { align: 'right' });
  doc.text(formatAmount(lineItemTotal), colTotal, y, { align: 'right' });
  y += 7 + (descLines.length - 1) * descLineHeight;

  // Discount/fee lines only when the itemised sum is valid (not a fallback).
  if (!useFallbackLine && secondTourDiscount && secondTourAmount > 0) {
    const pos = '2';
    doc.text(pos, colPos, y);
    doc.text('Arrivée au 2ème tour (-50%)', colDesc, y);
    doc.text('1', colQty, y, { align: 'right' });
    doc.setTextColor(180, 0, 0);
    doc.text(
      `- ${formatAmount(secondTourAmount)}`,
      colPrix, y,
      { align: 'right' }
    );
    doc.text(
      `- ${formatAmount(secondTourAmount)}`,
      colTotal, y,
      { align: 'right' }
    );
    doc.setTextColor(...BLACK);
    y += 7;
  }

  if (!useFallbackLine && invoice.fratrie_discount_pct > 0) {
    const pos = secondTourDiscount ? '3' : '2';
    doc.text(pos, colPos, y);
    doc.text(
      `Rabais fratrie (${invoice.fratrie_discount_pct}%)`,
      colDesc, y
    );
    doc.text('1', colQty, y, { align: 'right' });
    doc.setTextColor(180, 0, 0);
    doc.text(
      `- ${formatAmount(invoice.fratrie_discount_amount)}`,
      colPrix, y,
      { align: 'right' }
    );
    doc.text(
      `- ${formatAmount(invoice.fratrie_discount_amount)}`,
      colTotal, y,
      { align: 'right' }
    );
    doc.setTextColor(...BLACK);
    y += 7;
  }

  if (!useFallbackLine && invoice.reminder_fee > 0) {
    let posNum = 2;
    if (secondTourDiscount) posNum++;
    if (invoice.fratrie_discount_pct > 0) posNum++;
    const pos = posNum.toString();
    doc.text(pos, colPos, y);
    doc.text('Frais de rappel', colDesc, y);
    doc.text('1', colQty, y, { align: 'right' });
    doc.text(formatAmount(invoice.reminder_fee), colPrix, y, { align: 'right' });
    doc.text(formatAmount(invoice.reminder_fee), colTotal, y, { align: 'right' });
    y += 7;
  }

  y += 2;
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Montant de la facture', margin + 2, y);
  doc.setFontSize(12);
  doc.text(
    'CHF ' + formatAmount(invoice.total_amount),
    colTotal, y,
    { align: 'right' }
  );
  y += 3;

  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(
    'Conditions de paiement à ' +
    invoice.payment_delay_days + ' jours',
    margin, y
  );
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.text(
    "Si vous avez des remarques ou questions, n'hésitez pas à nous contacter!",
    margin, y
  );
  y += 4;

  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 10;

  const remainingSpace = MAX_CONTENT_Y - y;
  if (remainingSpace < 20) {
    y = Math.min(y, 175);
  }

  if (y > 185) {
    console.warn('Invoice content too long, may overlap QR slip');
  }

  const slipY = 205;

  doc.setDrawColor(...LIGHT_GRAY);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(0, slipY, pageW, slipY);
  doc.setLineDashPattern([], 0);

  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text('✂', 2, slipY + 0.5);

  doc.setDrawColor(...LIGHT_GRAY);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(62, slipY, 62, pageH);
  doc.setLineDashPattern([], 0);
  doc.text('✂', 62, slipY + 50);

  const recX = margin / 2;
  let recY = slipY + 8;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLACK);
  doc.text('Récépissé', recX, recY);
  recY += 7;

  doc.setFontSize(6);
  doc.setFont('helvetica', 'bold');
  doc.text('Compte / Payable à', recX, recY);
  recY += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(invoice.qr_iban, recX, recY);
  recY += 4;
  doc.text(invoice.club_name, recX, recY);
  recY += 4;
  const clubAddr2 = [
    invoice.club_address,
    invoice.club_street_number
  ].filter(Boolean).join(' ');
  doc.text(clubAddr2, recX, recY);
  recY += 4;
  doc.text(
    `${invoice.club_postal_code} ${invoice.club_city}`,
    recX, recY
  );
  recY += 7;

  doc.setFontSize(6);
  doc.setFont('helvetica', 'bold');
  doc.text('Référence', recX, recY);
  recY += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(formatRFReference(invoice.qr_reference), recX, recY);
  recY += 7;

  doc.setFontSize(6);
  doc.setFont('helvetica', 'bold');
  doc.text('Payable par', recX, recY);
  recY += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  if (invoice.is_event) {
    const debtorLines = buildEventDebtorLines(invoice);
    for (const line of debtorLines) {
      doc.text(line, recX, recY);
      recY += 4;
    }
  } else if (invoice.is_sponsoring) {
    doc.text(invoice.sponsor_company_name || '', recX, recY);
    recY += 4;
    doc.text(invoice.sponsor_address || '', recX, recY);
    recY += 4;
    doc.text(`${invoice.sponsor_postal_code || ''} ${invoice.sponsor_city || ''}`.trim(), recX, recY);
  } else if (invoice.is_confrerie) {
    const cFullName = [invoice.confrerie_member_salutation, invoice.confrerie_member_first_name, invoice.confrerie_member_last_name].filter(Boolean).join(' ');
    doc.text(cFullName, recX, recY);
    recY += 4;
    if (invoice.confrerie_member_company) {
      doc.text(invoice.confrerie_member_company, recX, recY);
      recY += 4;
    }
    doc.text(invoice.confrerie_member_address || '', recX, recY);
    recY += 4;
    doc.text(
      `${invoice.confrerie_member_postal_code || ''} ${invoice.confrerie_member_city || ''}`.trim(),
      recX, recY
    );
  } else {
    if (isMinorMember) {
      doc.text('Aux parents de', recX, recY);
      recY += 4;
    }
    doc.text(
      `${invoice.member_first_name} ${invoice.member_last_name}`,
      recX, recY
    );
    recY += 4;
    const memberAddr2 = [
      invoice.member_address,
      invoice.member_street_number
    ].filter(Boolean).join(' ');
    doc.text(memberAddr2, recX, recY);
    recY += 4;
    doc.text(
      `${invoice.member_postal_code} ${invoice.member_city}`,
      recX, recY
    );
  }
  recY += 8;

  doc.setFontSize(6);
  doc.setFont('helvetica', 'bold');
  doc.text('Monnaie', recX, recY);
  doc.text('Montant', recX + 20, recY);
  recY += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('CHF', recX, recY);
  doc.text(formatAmount(invoice.total_amount), recX + 20, recY);
  recY += 8;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Point de dépôt', recX + 20, pageH - 8);

  const qrX = 67;
  const qrY2 = slipY + 5;
  const qrSize = 46;

  const memberFullAddress = [
    invoice.member_address,
    invoice.member_street_number
  ].filter(Boolean).join(' ');

  const clubFullAddress = [
    invoice.club_address,
    invoice.club_street_number
  ].filter(Boolean).join(' ');

  const ibanClean = invoice.qr_iban.replace(/\s/g, '');

  const creditorStreet = invoice.club_address || '';
  const creditorBuildingNo = invoice.club_street_number || '';
  const creditorPostal = invoice.club_postal_code || '';
  const creditorCity = invoice.club_city || '';

  let debtorName: string;
  let debtorStreet: string;
  let debtorBuildingNo: string;
  let debtorPostal: string;
  let debtorCity: string;
  if (invoice.is_event) {
    const hasAddr = !!(invoice.event_debtor_address && invoice.event_debtor_postal_code && invoice.event_debtor_city);
    if (hasAddr) {
      debtorName = invoice.event_company
        ? invoice.event_company
        : `${invoice.event_debtor_first_name || ''} ${invoice.event_debtor_last_name || ''}`.trim();
      debtorStreet = invoice.event_debtor_address || '';
      debtorBuildingNo = '';
      debtorPostal = invoice.event_debtor_postal_code || '';
      debtorCity = invoice.event_debtor_city || '';
    } else {
      debtorName = '';
      debtorStreet = '';
      debtorBuildingNo = '';
      debtorPostal = '';
      debtorCity = '';
    }
  } else if (invoice.is_sponsoring) {
    debtorName = invoice.sponsor_company_name || '';
    debtorStreet = invoice.sponsor_address || '';
    debtorBuildingNo = '';
    debtorPostal = invoice.sponsor_postal_code || '';
    debtorCity = invoice.sponsor_city || '';
  } else if (invoice.is_confrerie) {
    debtorName = [invoice.confrerie_member_salutation, invoice.confrerie_member_first_name, invoice.confrerie_member_last_name].filter(Boolean).join(' ');
    debtorStreet = invoice.confrerie_member_address || '';
    debtorBuildingNo = '';
    debtorPostal = invoice.confrerie_member_postal_code || '';
    debtorCity = invoice.confrerie_member_city || '';
  } else {
    debtorName = `${invoice.member_first_name} ${invoice.member_last_name}`;
    debtorStreet = invoice.member_address || '';
    debtorBuildingNo = invoice.member_street_number || '';
    debtorPostal = invoice.member_postal_code || '';
    debtorCity = invoice.member_city || '';
  }

  const hasDebtor = !!(debtorName && debtorPostal && debtorCity);

  const amountFormatted = invoice.total_amount.toFixed(2);

  const qrRef = (invoice.qr_reference || '').replace(/\s/g, '');

  let additionalInfo: string;
  if (invoice.is_event) {
    additionalInfo = [invoice.event_title, invoice.invoice_number].filter(Boolean).join(' - ');
  } else if (invoice.is_sponsoring) {
    additionalInfo = ['Sponsoring ' + invoice.season_name, invoice.invoice_number].join(' - ');
  } else if (invoice.is_confrerie) {
    const label = invoice.confrerie_is_supporter ? 'Cotisation supporter' : (invoice.confrerie_label || 'Confrérie');
    additionalInfo = [label + ' ' + invoice.season_name, invoice.invoice_number].filter(Boolean).join(' - ');
  } else {
    additionalInfo = [
      'Cotisation ' + invoice.season_name,
      invoice.invoice_number,
      invoice.member_asf_licence ? 'ASF:' + invoice.member_asf_licence : null
    ].filter(Boolean).join(' - ');
  }

  const refType = 'SCOR';
  const refValue = qrRef;

  const qrData = [
    'SPC',              // 1. QR type
    '0200',             // 2. Version
    '1',                // 3. Coding type
    ibanClean,          // 4. IBAN
    'S',                // 5. Creditor address type (S=structured)
    invoice.club_name,  // 6. Creditor name
    creditorStreet,     // 7. Creditor street
    creditorBuildingNo, // 8. Creditor building number
    creditorPostal,     // 9. Creditor postal code
    creditorCity,       // 10. Creditor city
    'CH',               // 11. Creditor country
    '',                 // 12. Ultimate creditor type (empty)
    '',                 // 13. Ultimate creditor name (empty)
    '',                 // 14. Ultimate creditor street (empty)
    '',                 // 15. Ultimate creditor building (empty)
    '',                 // 16. Ultimate creditor postal (empty)
    '',                 // 17. Ultimate creditor city (empty)
    '',                 // 18. Ultimate creditor country (empty)
    amountFormatted,    // 19. Amount
    'CHF',              // 20. Currency
    hasDebtor ? 'S' : '',  // 21. Debtor address type (S=structured, empty if no debtor)
    ...(hasDebtor ? [
      debtorName,         // 22. Debtor name
      debtorStreet,       // 23. Debtor street
      debtorBuildingNo,   // 24. Debtor building number
      debtorPostal,       // 25. Debtor postal code
      debtorCity,         // 26. Debtor city
      'CH',               // 27. Debtor country
    ] : [
      '',                 // 22. Debtor name (empty)
      '',                 // 23. Debtor street
      '',                 // 24. Debtor building number
      '',                 // 25. Debtor postal code
      '',                 // 26. Debtor city
      '',                 // 27. Debtor country (empty when no debtor)
    ]),
    refType,            // 28. Reference type
    refValue,           // 29. Reference (empty if NON)
    additionalInfo,     // 30. Additional info
    'EPD',              // 31. Trailer (mandatory)
    '',                 // 32. Alternative scheme 1 (empty)
    ''                  // 33. Alternative scheme 2 (empty)
  ].join('\n');

  console.log('QR fields count:', qrData.split('\n').length);
  console.log('refType:', refType);
  console.log('RF reference:', qrRef);
  console.log('Formatted:', formatRFReference(qrRef));
  console.log('QR reference length:', qrRef.length);
  console.log('IBAN clean:', ibanClean);
  console.log('Amount:', amountFormatted);

  try {
    const qrDataUrl = await QRCode.toDataURL(qrData, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 600,
      color: { dark: '#000000', light: '#ffffff' }
    });
    doc.addImage(qrDataUrl, 'PNG', qrX, qrY2, qrSize, qrSize, 'qr-code', 'FAST');
  } catch (e) {
    doc.setDrawColor(0, 0, 0);
    doc.rect(qrX, qrY2, qrSize, qrSize);
    doc.setFontSize(8);
    doc.text('QR Code', qrX + qrSize/2, qrY2 + qrSize/2,
      { align: 'center' });
  }

  const crossX = qrX + qrSize/2 - 3;
  const crossY3 = qrY2 + qrSize/2 - 3;
  doc.setFillColor(255, 255, 255);
  doc.rect(crossX, crossY3, 6, 6, 'F');
  doc.setFillColor(255, 0, 0);
  doc.rect(crossX + 2, crossY3 + 0.5, 2, 5, 'F');
  doc.rect(crossX + 0.5, crossY3 + 2, 5, 2, 'F');

  let payY = qrY2 + qrSize + 6;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Monnaie', qrX, payY);
  doc.text('Montant', qrX + 25, payY);
  payY += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('CHF', qrX, payY);
  doc.text(formatAmount(invoice.total_amount), qrX + 25, payY);

  const payX = 118;
  let payRY = slipY + 8;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLACK);
  doc.text('Section paiement', payX, payRY);
  payRY += 7;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Compte / Payable à', payX, payRY);
  payRY += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(invoice.qr_iban, payX, payRY);
  payRY += 5;
  doc.text(invoice.club_name, payX, payRY);
  payRY += 5;
  doc.text(clubFullAddress, payX, payRY);
  payRY += 5;
  doc.text(
    `${invoice.club_postal_code} ${invoice.club_city}`,
    payX, payRY
  );
  payRY += 8;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Référence', payX, payRY);
  payRY += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(formatRFReference(invoice.qr_reference), payX, payRY);
  payRY += 8;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Informations supplémentaires', payX, payRY);
  payRY += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(additionalInfo, payX, payRY);
  payRY += 8;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Payable par', payX, payRY);
  payRY += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (invoice.is_event) {
    const debtorLines = buildEventDebtorLines(invoice);
    for (const line of debtorLines) {
      doc.text(line, payX, payRY);
      payRY += 5;
    }
  } else if (invoice.is_sponsoring) {
    doc.text(invoice.sponsor_company_name || '', payX, payRY);
    payRY += 5;
    doc.text(invoice.sponsor_address || '', payX, payRY);
    payRY += 5;
    doc.text(`${invoice.sponsor_postal_code || ''} ${invoice.sponsor_city || ''}`.trim(), payX, payRY);
  } else if (invoice.is_confrerie) {
    const cFullName = [invoice.confrerie_member_salutation, invoice.confrerie_member_first_name, invoice.confrerie_member_last_name].filter(Boolean).join(' ');
    doc.text(cFullName, payX, payRY);
    payRY += 5;
    if (invoice.confrerie_member_company) {
      doc.text(invoice.confrerie_member_company, payX, payRY);
      payRY += 5;
    }
    doc.text(invoice.confrerie_member_address || '', payX, payRY);
    payRY += 5;
    doc.text(
      `${invoice.confrerie_member_postal_code || ''} ${invoice.confrerie_member_city || ''}`.trim(),
      payX, payRY
    );
  } else {
    if (isMinorMember) {
      doc.text('Aux parents de', payX, payRY);
      payRY += 5;
    }
    doc.text(
      `${invoice.member_first_name} ${invoice.member_last_name}`,
      payX, payRY
    );
    payRY += 5;
    doc.text(memberFullAddress, payX, payRY);
    payRY += 5;
    doc.text(
      `${invoice.member_postal_code} ${invoice.member_city}`,
      payX, payRY
    );
  }

  let filename: string;
  if (invoice.is_event) {
    const eName = `${invoice.event_debtor_first_name || ''}_${invoice.event_debtor_last_name || ''}`.trim().replace(/^_|_$/g, '');
    filename = `Facture_${invoice.invoice_number}_${eName || 'Event'}.pdf`;
  } else if (invoice.is_sponsoring) {
    filename = `Facture_${invoice.invoice_number}_${invoice.sponsor_company_name || 'Sponsor'}.pdf`;
  } else {
    filename = `Facture_${invoice.invoice_number}_${invoice.member_first_name}_${invoice.member_last_name}.pdf`;
  }

  if (returnBase64) {
    const pdfData = doc.output('datauristring');
    const base64 = pdfData.split(',')[1];
    return base64;
  } else {
    doc.save(filename);
  }
};
