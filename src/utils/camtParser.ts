export interface CamtTransaction {
  amount: number;
  debtorName: string;
  debtorIban: string;
  ref: string;
  addInfo: string;
  paymentDate: string;
  transactionId: string;
}

export interface CamtParseResult {
  format: 'camt.053' | 'camt.054';
  transactions: CamtTransaction[];
  skippedReversals: number;
}

function textOf(el: Element | null): string {
  return el?.textContent?.trim() || '';
}

function querySelector(parent: Element, selectors: string): Element | null {
  for (const part of selectors.split(' > ')) {
    if (!parent) return null;
    const child = parent.querySelector(':scope > ' + part);
    if (!child) return null;
    parent = child;
  }
  return parent;
}

function extractTransactionsFromEntry(entry: Element): CamtTransaction[] {
  const bookingDate = textOf(querySelector(entry, 'BookgDt > Dt')) ||
    new Date().toISOString().split('T')[0];

  const cdtDbtInd = textOf(entry.querySelector(':scope > CdtDbtInd'));
  if (cdtDbtInd !== 'CRDT') return [];

  const status = textOf(entry.querySelector(':scope > Sts'));
  if (status && status !== 'BOOK') return [];

  const entryAcctSvcrRef = textOf(querySelector(entry, 'AcctSvcrRef'));

  const txDetailsList = entry.querySelectorAll('NtryDtls TxDtls');

  if (txDetailsList.length === 0) {
    const amount = parseFloat(textOf(entry.querySelector(':scope > Amt')) || '0');
    const debtorName = textOf(entry.querySelector('RltdPties Dbtr Nm'));
    const debtorIban = textOf(entry.querySelector('RltdPties DbtrAcct Id IBAN'));
    const ref = (textOf(entry.querySelector('RmtInf Strd CdtrRefInf Ref')) || '').replace(/\s/g, '');
    const addInfo = textOf(entry.querySelector('RmtInf Ustrd'));
    const txRef = textOf(entry.querySelector('Refs AcctSvcrRef')) || entryAcctSvcrRef ||
      textOf(entry.querySelector('Refs EndToEndId')) || '';

    return [{
      amount, debtorName, debtorIban, ref, addInfo,
      paymentDate: bookingDate,
      transactionId: txRef
    }];
  }

  const results: CamtTransaction[] = [];
  for (const txDtls of txDetailsList) {
    const amtEl = txDtls.querySelector('Amt');
    const amount = amtEl ? parseFloat(textOf(amtEl)) : parseFloat(textOf(entry.querySelector(':scope > Amt')) || '0');

    const debtorName = textOf(txDtls.querySelector('RltdPties Dbtr Nm'));
    const debtorIban = textOf(txDtls.querySelector('RltdPties DbtrAcct Id IBAN'));
    const ref = (textOf(txDtls.querySelector('RmtInf Strd CdtrRefInf Ref')) || '').replace(/\s/g, '');
    const addInfo = textOf(txDtls.querySelector('RmtInf Ustrd'));

    const txRef = textOf(txDtls.querySelector('Refs AcctSvcrRef')) ||
      entryAcctSvcrRef ||
      textOf(txDtls.querySelector('Refs EndToEndId')) || '';

    results.push({
      amount, debtorName, debtorIban, ref, addInfo,
      paymentDate: bookingDate,
      transactionId: txRef
    });
  }

  return results;
}

export function parseCamtXml(xmlText: string): CamtParseResult {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, 'text/xml');

  let format: 'camt.053' | 'camt.054';
  let containerSelector: string;

  const stmt = xml.querySelector('BkToCstmrStmt');
  const ntfctn = xml.querySelector('BkToCstmrDbtCdtNtfctn');

  if (stmt) {
    format = 'camt.053';
    containerSelector = 'Stmt';
  } else if (ntfctn) {
    format = 'camt.054';
    containerSelector = 'Ntfctn';
  } else {
    const entries = xml.querySelectorAll('Ntry');
    format = 'camt.054';
    const transactions: CamtTransaction[] = [];
    let skippedReversals = 0;

    for (const entry of entries) {
      const rvsl = textOf(entry.querySelector(':scope > RvslInd'));
      if (rvsl === 'true') { skippedReversals++; continue; }
      transactions.push(...extractTransactionsFromEntry(entry));
    }
    return { format, transactions, skippedReversals };
  }

  const root = stmt || ntfctn!;
  const containers = root.querySelectorAll(containerSelector);

  const transactions: CamtTransaction[] = [];
  let skippedReversals = 0;

  for (const container of containers) {
    const entries = container.querySelectorAll(':scope > Ntry');
    for (const entry of entries) {
      const rvsl = textOf(entry.querySelector(':scope > RvslInd'));
      if (rvsl === 'true') { skippedReversals++; continue; }
      transactions.push(...extractTransactionsFromEntry(entry));
    }
  }

  return { format, transactions, skippedReversals };
}
